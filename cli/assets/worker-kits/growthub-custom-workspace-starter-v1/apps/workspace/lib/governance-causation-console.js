/**
 * Governance causation projection — the governed "supervise / audit authority"
 * lens over the agent-outcomes receipt stream
 * (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1 §3 worked example +
 * CEO_PRIMITIVE_COCKPIT_ROADMAP_V1 R3).
 *
 * This is a PURE deriver — no React, no network calls, no filesystem, no
 * config writes, no browser storage, no CSS. It takes ONLY the
 * `workspace:agent-outcomes` receipt
 * stream (already secret-redacted + hash-chained by
 * `lib/workspace-outcome-receipts.js`) and emits a low-entropy view-model the
 * GovernanceCausationCockpit component renders. It introduces NO new API, NO
 * new PATCH field, NO new schema, NO new persistence: every byte it needs is
 * already in the stream `GET /api/workspace/agent-outcomes` returns.
 *
 * Route-shopping (the detected pattern), per the shipped definition:
 *   a blocked `untrusted-direct` receipt, followed — within the SAME actor's
 *   timeline — by a later `execution-proof` attempt. Enforcement already
 *   *closes* the bypass at the gate (`sandbox-run/route.js`,
 *   `workflow/publish/route.js`); counting already exists (`blockedAttempts`).
 *   What was missing is *detection / observability*: correlating the blocked
 *   direct rejection with the subsequent proof attempt by the same actor so an
 *   operator can see the behavior instead of two unrelated counters.
 *
 * Causation ITT shape (state -> eligibility -> guidance -> action): a confirmed
 * route-shop pair is the evidence; severity (from proximity + repeat count +
 * whether the follow-on succeeded) is the eligibility; the headline is the
 * guidance; "Open" hands off to the EXISTING swarm-run surface for the row
 * that was reached for — the cockpit never executes and never mutates.
 *
 * Secret safety: receipts are already secret-redacted at WRITE time
 * (`lib/workspace-outcome-receipts.js` runs `redactSecrets` before persisting).
 * This deriver therefore reads pre-redacted text; it additionally truncates
 * every string it surfaces (defense against unbounded values) and never echoes
 * raw payloads — only named, bounded fields.
 *
 * Truthful telemetry: a missing/unparseable `createdAt` yields `elapsedMs:
 * null` (never 0); an absent `actor` is grouped under a single "unattributed"
 * bucket and never silently merged with a named actor.
 */

const UNTRUSTED_DIRECT_LANE = "untrusted-direct";
const EXECUTION_PROOF_LANE = "execution-proof";
const BLOCKED_STATUS = "blocked";
const UNATTRIBUTED_ACTOR = "unattributed";

// Outcome statuses that mean the follow-on proof actually went through (the
// actor got what the direct lane refused, via a different lane). Mirrors the
// AGENT_OUTCOME_STATUSES vocabulary in @growthub/api-contract/workspace-outcome.
const SUCCEEDED_FOLLOW_ON = new Set(["verified", "published", "tested", "drafted"]);

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

// Bounded, defensive — receipts are already redacted at write time; this is a
// second belt so the view-model never carries an unbounded string.
function clip(value, max = 200) {
  const text = safeString(value).trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function parseTimestamp(value) {
  const text = safeString(value).trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function actorKey(receipt) {
  const actor = safeString(receipt?.actor).trim();
  return actor || UNATTRIBUTED_ACTOR;
}

function laneOf(receipt) {
  return safeString(receipt?.lane).trim();
}

function statusOf(receipt) {
  return safeString(receipt?.outcomeStatus).trim();
}

// Union of objectRefs across the two receipts — "what they were reaching for".
// De-duped by objectId + rowName. Never throws on a malformed ref.
function mergeObjectRefs(...receipts) {
  const seen = new Map();
  for (const receipt of receipts) {
    const refs = Array.isArray(receipt?.objectRefs) ? receipt.objectRefs : [];
    for (const ref of refs) {
      if (!ref || typeof ref !== "object") continue;
      const objectId = clip(ref.objectId, 120);
      if (!objectId) continue;
      const rowName = clip(ref.rowName, 120);
      const key = `${objectId}::${rowName}`;
      if (seen.has(key)) continue;
      const out = { objectId };
      if (rowName) out.rowName = rowName;
      const objectType = clip(ref.objectType, 60);
      if (objectType) out.objectType = objectType;
      seen.set(key, out);
    }
  }
  return Array.from(seen.values());
}

// First object ref that resolves to a row we can hand off to the EXISTING
// swarm-run surface. Returns the artifact target or null — the cockpit shows
// an "Open" affordance only when a real row is addressable.
function handoffArtifactFor(objectRefs) {
  for (const ref of objectRefs) {
    if (ref.objectId && ref.rowName) {
      return { surface: "swarm-run", objectId: ref.objectId, name: ref.rowName };
    }
  }
  return null;
}

// Deterministic severity from EVIDENCE only — never a hidden flag.
//   - proximity: the faster the shop follows the block, the more deliberate.
//   - repeated route-shopping by the same actor amplifies.
//   - a follow-on that SUCCEEDED is worse than one the system also held.
function deriveSeverity({ elapsedMs, repeatIndex, followOnSucceeded }) {
  let score = 0;
  if (elapsedMs != null) {
    if (elapsedMs <= 60_000) score += 2; // within a minute — deliberate hop
    else if (elapsedMs <= 5 * 60_000) score += 1; // within five minutes
  }
  if (repeatIndex >= 2) score += 2; // third+ shop by this actor
  else if (repeatIndex >= 1) score += 1; // a repeat
  if (followOnSucceeded) score += 1; // the proof lane actually accepted it
  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

function headlineFor(signal) {
  const target = signal.objectRefs[0];
  const reach = target
    ? `${target.rowName ? `${target.rowName} ` : ""}(${target.objectId})`
    : "a governed object";
  const timing = signal.elapsedMs == null
    ? ""
    : ` ${formatElapsed(signal.elapsedMs)} after the block`;
  const outcome = signal.followOnSucceeded
    ? "and the proof lane accepted it"
    : "but the proof lane is its own gate";
  return `${signal.actor} was blocked on the direct lane, then reached for ${reach} via sandbox-run${timing} — ${outcome}.`;
}

// Compact, human elapsed — kept local so the deriver has no UI dependency.
function formatElapsed(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Detect route-shopping signals across the receipt stream.
 *
 * @param {Array} receipts  the `workspace:agent-outcomes` stream (any order).
 * @returns {Array} routeShopSignals — see module header / cockpit.
 *
 * Pure. Never throws on malformed input. Correlates strictly within a single
 * actor's chronological timeline: a blocked `untrusted-direct` receipt is
 * paired with the NEXT `execution-proof` attempt by that same actor; the
 * blocked receipt is then consumed so one block maps to at most one follow-on.
 */
export function deriveRouteShoppingSignals(receipts) {
  const list = Array.isArray(receipts) ? receipts.filter((r) => r && typeof r === "object") : [];
  if (list.length === 0) return [];

  // Normalize to a chronological-ascending order. Prefer the server-owned
  // monotonic `seq`; fall back to `createdAt`; keep original index as a stable
  // tiebreaker so equal timestamps never reorder unpredictably.
  const indexed = list.map((receipt, index) => ({
    receipt,
    index,
    seq: Number.isFinite(receipt.seq) ? receipt.seq : null,
    ts: parseTimestamp(receipt.createdAt),
  }));
  indexed.sort((a, b) => {
    if (a.seq != null && b.seq != null && a.seq !== b.seq) return a.seq - b.seq;
    if (a.ts != null && b.ts != null && a.ts !== b.ts) return a.ts - b.ts;
    return a.index - b.index;
  });

  // Per-actor pending blocked-direct receipt + how many shops we've confirmed.
  const pendingByActor = new Map();
  const repeatByActor = new Map();
  const signals = [];

  for (const { receipt } of indexed) {
    const actor = actorKey(receipt);
    const lane = laneOf(receipt);
    const status = statusOf(receipt);

    if (lane === UNTRUSTED_DIRECT_LANE && status === BLOCKED_STATUS) {
      // Remember the most recent unpaired block for this actor. A second block
      // before any proof attempt simply supersedes the first (closest-pair).
      pendingByActor.set(actor, receipt);
      continue;
    }

    if (lane === EXECUTION_PROOF_LANE) {
      const blocked = pendingByActor.get(actor);
      if (!blocked) continue;
      pendingByActor.delete(actor);

      const repeatIndex = repeatByActor.get(actor) || 0;
      repeatByActor.set(actor, repeatIndex + 1);

      const blockedTs = parseTimestamp(blocked.createdAt);
      const followOnTs = parseTimestamp(receipt.createdAt);
      const elapsedMs = blockedTs != null && followOnTs != null
        ? Math.max(0, followOnTs - blockedTs)
        : null;
      const objectRefs = mergeObjectRefs(blocked, receipt);
      // Hand-off prefers the EXECUTION-PROOF (follow-on) receipt's refs: that is
      // the row sandbox-run actually executed, so "Open" lands on a row
      // Background Tasks can render — not the direct-PATCH target (which may be
      // a non-executable object). Falls back to the merged set.
      const followOnRefs = mergeObjectRefs(receipt);
      const followOnSucceeded = SUCCEEDED_FOLLOW_ON.has(status);

      const signal = {
        signalId: `${safeString(blocked.receiptId)}->${safeString(receipt.receiptId)}`,
        actor,
        blockedReceiptId: clip(blocked.receiptId, 80),
        followOnReceiptId: clip(receipt.receiptId, 80),
        blockedSummary: clip(blocked.summary, 200),
        followOnSummary: clip(receipt.summary, 200),
        blockedAt: safeString(blocked.createdAt) || null,
        followOnAt: safeString(receipt.createdAt) || null,
        objectRefs,
        elapsedMs,
        elapsedLabel: formatElapsed(elapsedMs),
        policyVerdict: blocked.policyVerdict && typeof blocked.policyVerdict === "object"
          ? {
              ok: blocked.policyVerdict.ok === true,
              violationCodes: Array.isArray(blocked.policyVerdict.violationCodes)
                ? blocked.policyVerdict.violationCodes.map((c) => clip(c, 60)).filter(Boolean)
                : [],
            }
          : null,
        followOnOutcome: status || null,
        followOnSucceeded,
        repeatIndex,
        handoff: handoffArtifactFor(followOnRefs) || handoffArtifactFor(objectRefs),
      };
      signal.severity = deriveSeverity({ elapsedMs, repeatIndex, followOnSucceeded });
      signal.headline = headlineFor(signal);
      signals.push(signal);
    }
  }

  // Newest-first for display — the operator reads the most recent shop first.
  return signals.reverse();
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

// Confirmed route-shop pairs use the inherited run-console dot grammar:
// high severity reads as a failure (red), medium/low as canceled/pending.
function variantForSeverity(severity) {
  if (severity === "high") return "fail";
  if (severity === "medium") return "canceled";
  return "pending";
}

/**
 * Build the Governance Causation cockpit view-model.
 *
 * @param {object} args
 * @param {Array} [args.receipts]  the workspace:agent-outcomes stream.
 * @returns {object} view-model the cockpit renders.
 */
export function deriveGovernanceCausation({ receipts = [] } = {}) {
  const safeReceipts = Array.isArray(receipts) ? receipts.filter((r) => r && typeof r === "object") : [];
  const signals = deriveRouteShoppingSignals(safeReceipts).map((signal) => ({
    ...signal,
    variant: variantForSeverity(signal.severity),
  }));

  const actors = new Set(safeReceipts.map(actorKey));
  const totals = {
    receipts: safeReceipts.length,
    actors: actors.size,
    blockedAttempts: safeReceipts.filter((r) => statusOf(r) === BLOCKED_STATUS).length,
    blockedDirect: safeReceipts.filter(
      (r) => laneOf(r) === UNTRUSTED_DIRECT_LANE && statusOf(r) === BLOCKED_STATUS
    ).length,
    executionProofs: safeReceipts.filter((r) => laneOf(r) === EXECUTION_PROOF_LANE).length,
    routeShopSignals: signals.length,
    highSeverity: signals.filter((s) => s.severity === "high").length,
  };

  // Highest-severity, most-recent signal is the operator's next look. Signals
  // are already newest-first, so a stable max by rank picks the freshest tie.
  let attention = null;
  for (const signal of signals) {
    if (!attention || SEVERITY_RANK[signal.severity] > SEVERITY_RANK[attention.severity]) {
      attention = signal;
    }
  }

  // clear = no confirmed shops; alert = at least one high; watch otherwise.
  let status = "clear";
  if (totals.highSeverity > 0) status = "alert";
  else if (signals.length > 0) status = "watch";

  return {
    title: "Governance",
    status,
    totals,
    signals,
    attention,
    generatedFromReceipts: safeReceipts.length > 0,
  };
}

export default deriveGovernanceCausation;
