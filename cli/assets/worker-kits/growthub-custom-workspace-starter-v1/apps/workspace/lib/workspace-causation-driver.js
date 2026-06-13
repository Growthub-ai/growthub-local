/**
 * Workspace Causation Driver V1 — the read-only causal-proof-chain lane.
 *
 * AWaC boundary: the Causation Driver is the human's forensic/replay surface
 * for the SAME receipt stream every mutation lane already emits
 * (`workspace:agent-outcomes`, contract
 * `@growthub/api-contract/workspace-outcome`). It is the cockpit-side mirror
 * of the Assistant widget's swarm cockpit: where the swarm cockpit STEERS a
 * run forward, the causation driver REPLAYS what already happened and infers
 * why — without ever writing.
 *
 * Hard invariants encoded here:
 *   - PURE module. No React, no fetch, no fs, no config writes. The component
 *     reads `GET /api/workspace/agent-outcomes` (the existing read-only route)
 *     and feeds the receipts to `deriveCausationChainProjection`.
 *   - No new mutation route, no new PATCH allowlist field, no new persistence
 *     backend. Receipts are evidence; the driver only renders them.
 *   - Deterministic derivation: edges come from receipt-mining
 *     (directly-follows on a shared object scope) plus temporal proximity and
 *     lane semantics — no ML, no estimates, no null-to-zero coercion.
 *
 * The four governed lanes (classified, never bypassed — see AGENTS.md
 * "Agent Outcome Loop V1") are the spine of the visualization:
 *   untrusted-direct · execution-proof · server-authoritative · governed-proposal
 *
 * Route-shopping — the characteristic abuse pattern the cockpit must surface —
 * is a DENIED untrusted-direct attempt followed shortly by an execution-proof
 * (or server-authoritative) write from the same actor on the same object
 * scope. `deriveCausationChainProjection` flags those edges so the operator
 * sees them the way the swarm cockpit surfaces a failed agent.
 */

// The four governed mutation lanes, in authority order. `variant` maps onto
// the existing `.dm-run-console__tree-dot[data-variant]` CSS so the driver
// inherits the swarm cockpit's exact dot grammar — no new color tokens.
export const CAUSATION_LANES = [
  { id: "untrusted-direct", label: "Direct", variant: "canceled" },
  { id: "execution-proof", label: "Proof", variant: "active" },
  { id: "server-authoritative", label: "Authoritative", variant: "ok" },
  { id: "governed-proposal", label: "Proposal", variant: "active" },
];

const LANE_LABEL = new Map(CAUSATION_LANES.map((l) => [l.id, l.label]));

// Deterministic edge-inference rules, declared as data so the unit suite and
// the cockpit legend read the same contract. Pure description — the engine in
// deriveCausationChainProjection applies exactly these and nothing else.
export const CAUSATION_EDGE_RULES = [
  {
    id: "directly-follows",
    label: "Directly follows on shared object scope",
    description:
      "Receipt B is the next receipt to touch an objectRef that receipt A also touched.",
  },
  {
    id: "route-shopping",
    label: "Route-shopping",
    description:
      "A denied untrusted-direct attempt is followed by an execution-proof / server-authoritative write from the same actor on the same object scope within the proximity window.",
  },
];

// Two receipts are "causally adjacent" only when one follows the other within
// this window on the same object scope. Wider gaps still draw an edge but are
// marked stale so the operator is not misled into reading coincidence as cause.
const PROXIMITY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
// Route-shopping is a tight, deliberate pattern — a denied direct write and
// the laundered re-attempt happen close together. Keep the window short.
const ROUTE_SHOPPING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * The custom sidecar config for the causation driver — the read-only twin of
 * the swarm cockpit's view config. Declares HOW the driver is wired into the
 * helper sidecar (view id, title, the read-only source route, the slash
 * command that opens it) and asserts, in data, that it can never mutate.
 *
 * `isGovernedCausationSidecarConfig` is the validator the unit suite runs
 * against this config AND against forged configs, proving the read-only
 * invariant bites (same governance discipline as the helper-command registry).
 */
export const CAUSATION_DRIVER_SIDECAR_CONFIG = Object.freeze({
  view: "causation",
  title: "Causation driver",
  // Read-only GET only. The driver never POSTs / PATCHes — writes still flow
  // through the existing governed routes, never from this surface.
  source: "/api/workspace/agent-outcomes",
  method: "GET",
  mutates: false,
  command: "/causation",
  // Light convergence poll, matching the swarm cockpit's history poll cadence.
  pollMs: 8000,
  lanes: CAUSATION_LANES,
  edgeRules: CAUSATION_EDGE_RULES,
});

const CAUSATION_SIDECAR_ALLOWED_KEYS = [
  "view",
  "title",
  "source",
  "method",
  "mutates",
  "command",
  "pollMs",
  "lanes",
  "edgeRules",
];

/**
 * Pure governance validator for the sidecar config. Returns { ok, error }.
 * The read-only invariant is non-negotiable: any config that declares a
 * mutating method, sets `mutates: true`, or smuggles an execute/patch hook is
 * rejected — exactly mirroring `isGovernedHelperCommand`.
 */
export function isGovernedCausationSidecarConfig(config) {
  if (!config || typeof config !== "object") {
    return { ok: false, error: "sidecar config must be an object" };
  }
  if (typeof config.view !== "string" || !config.view) {
    return { ok: false, error: "sidecar config requires a view id" };
  }
  if (config.mutates !== false) {
    return { ok: false, error: `${config.view}: causation driver must declare mutates: false` };
  }
  if (String(config.method || "GET").toUpperCase() !== "GET") {
    return { ok: false, error: `${config.view}: causation driver is read-only (GET source only)` };
  }
  for (const key of Object.keys(config)) {
    if (!CAUSATION_SIDECAR_ALLOWED_KEYS.includes(key)) {
      return { ok: false, error: `${config.view}: behavior key "${key}" is outside the read-only surface` };
    }
  }
  return { ok: true, error: null };
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function timeOf(receipt) {
  const t = Date.parse(clean(receipt?.createdAt));
  return Number.isFinite(t) ? t : null;
}

// Stable causal ordering: server-owned monotonic `seq` is authoritative when
// present (it cannot be back-dated like a client clock); createdAt is the
// fallback. Returns a NEW oldest-first array — causal chains read forward.
function orderReceiptsAscending(receipts) {
  const list = Array.isArray(receipts) ? receipts.filter((r) => r && typeof r === "object") : [];
  return list.slice().sort((a, b) => {
    const sa = Number.isFinite(a?.seq) ? a.seq : null;
    const sb = Number.isFinite(b?.seq) ? b.seq : null;
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    const ta = timeOf(a);
    const tb = timeOf(b);
    if (ta != null && tb != null && ta !== tb) return ta - tb;
    return 0;
  });
}

// Canonical object-scope keys a receipt touches. rowName scopes tighter than
// objectId alone, so "swarm-workflows::nightly" and "swarm-workflows::weekly"
// never share an edge. Receipts with no objectRefs contribute no scope and so
// are rendered as isolated nodes (truthful: no inferred cause).
function scopeKeysOf(receipt) {
  const refs = Array.isArray(receipt?.objectRefs) ? receipt.objectRefs : [];
  const keys = new Set();
  for (const ref of refs) {
    const objectId = clean(ref?.objectId);
    if (!objectId) continue;
    const rowName = clean(ref?.rowName);
    keys.add(rowName ? `${objectId}::${rowName}` : objectId);
  }
  return keys;
}

// outcomeStatus → the existing tree-dot variant. Truthful mapping only:
// blocked/failed are failures, published/applied/ok are successes, pending
// stays hollow, anything else is the neutral grey "canceled/unknown" dot.
export function causationNodeVariant(receipt) {
  const status = clean(receipt?.outcomeStatus).toLowerCase();
  if (status === "blocked" || status === "failed" || status === "rejected") return "fail";
  if (status === "published" || status === "applied" || status === "ok" || status === "success") return "ok";
  if (status === "pending" || status === "running") return "pending";
  return "canceled";
}

export function causationLaneLabel(lane) {
  return LANE_LABEL.get(clean(lane)) || clean(lane) || "lane";
}

function isDeniedDirect(receipt) {
  return clean(receipt?.lane) === "untrusted-direct"
    && clean(receipt?.outcomeStatus).toLowerCase() === "blocked";
}

function isPrivilegedWrite(receipt) {
  const lane = clean(receipt?.lane);
  return lane === "execution-proof" || lane === "server-authoritative";
}

/**
 * Derive the causal proof chain from a receipt stream.
 *
 * @param {Array} receipts  receipts as returned by GET /api/workspace/agent-outcomes
 *                          (newest-first; ordering here is internal and stable).
 * @returns {{
 *   nodes: Array,           // oldest-first; each carries variant + laneLabel + scopeKeys
 *   edges: Array,           // { from, to, scope, rule, deltaMs, stale, actorSame, routeShopping }
 *   routeShopping: Array,   // the subset of edges flagged route-shopping, for the alert strip
 *   laneCounts: Object,     // receipts per lane
 *   outcomeCounts: Object,  // receipts per outcomeStatus
 *   total: number
 * }}
 */
export function deriveCausationChainProjection(receipts) {
  const ordered = orderReceiptsAscending(receipts);
  const nodes = ordered.map((receipt, index) => ({
    index,
    receiptId: clean(receipt?.receiptId) || `r${index}`,
    kind: clean(receipt?.kind) || "agent-outcome",
    lane: clean(receipt?.lane) || "untrusted-direct",
    laneLabel: causationLaneLabel(receipt?.lane),
    outcomeStatus: clean(receipt?.outcomeStatus) || "failed",
    summary: clean(receipt?.summary) || "(no summary)",
    intent: clean(receipt?.intent),
    actor: clean(receipt?.actor),
    createdAt: clean(receipt?.createdAt),
    time: timeOf(receipt),
    variant: causationNodeVariant(receipt),
    objectRefs: Array.isArray(receipt?.objectRefs) ? receipt.objectRefs : [],
    scopeKeys: Array.from(scopeKeysOf(receipt)),
    policyVerdict: receipt?.policyVerdict && typeof receipt.policyVerdict === "object"
      ? receipt.policyVerdict
      : null,
    nextActions: Array.isArray(receipt?.nextActions) ? receipt.nextActions : [],
    runId: clean(receipt?.runId),
    sourceId: clean(receipt?.sourceId),
    version: clean(receipt?.version),
    rollbackRef: receipt?.rollbackRef && typeof receipt.rollbackRef === "object" ? receipt.rollbackRef : null,
  }));

  const edges = [];
  const routeShopping = [];

  // Directly-follows on a shared object scope: for each scope key, walk the
  // ordered nodes and connect each touch to the immediately next touch. This
  // yields one clean per-object causal chain instead of an O(n^2) hairball.
  const lastTouchByScope = new Map(); // scopeKey -> node index
  for (const node of nodes) {
    for (const scope of node.scopeKeys) {
      const priorIndex = lastTouchByScope.get(scope);
      if (priorIndex != null) {
        const from = nodes[priorIndex];
        const deltaMs = from.time != null && node.time != null ? node.time - from.time : null;
        const stale = deltaMs != null && deltaMs > PROXIMITY_WINDOW_MS;
        const actorSame = Boolean(from.actor && node.actor && from.actor === node.actor);
        const isRouteShopping =
          isDeniedDirect({ lane: from.lane, outcomeStatus: from.outcomeStatus })
          && isPrivilegedWrite({ lane: node.lane })
          && actorSame
          && deltaMs != null
          && deltaMs >= 0
          && deltaMs <= ROUTE_SHOPPING_WINDOW_MS;
        const edge = {
          from: priorIndex,
          to: node.index,
          scope,
          rule: isRouteShopping ? "route-shopping" : "directly-follows",
          deltaMs,
          stale,
          actorSame,
          routeShopping: isRouteShopping,
        };
        edges.push(edge);
        if (isRouteShopping) routeShopping.push(edge);
      }
      lastTouchByScope.set(scope, node.index);
    }
  }

  const laneCounts = {};
  const outcomeCounts = {};
  for (const node of nodes) {
    laneCounts[node.lane] = (laneCounts[node.lane] || 0) + 1;
    outcomeCounts[node.outcomeStatus] = (outcomeCounts[node.outcomeStatus] || 0) + 1;
  }

  return {
    nodes,
    edges,
    routeShopping,
    laneCounts,
    outcomeCounts,
    total: nodes.length,
  };
}

/**
 * Eligibility gate for the pure causation driver — the read-only twin of
 * `deriveSwarmWorkflowExecutionEligibility`. The driver does not run anything,
 * so "ready" means "there is evidence to replay": the receipt stream is
 * non-empty. The live-helper signal is surfaced as context, never a blocker —
 * receipts accrue from every lane regardless of the helper widget's state.
 *
 * @param {{ receipts?: Array, summary?: Object, helperWidgetState?: Object }} input
 * @returns {{ ready, status, total, guidance, helperReady }}
 */
export function deriveCausationEligibility(input = {}) {
  const receipts = Array.isArray(input.receipts) ? input.receipts : [];
  const total = receipts.length;
  const helperReady = input.helperWidgetState?.ready !== false;
  const ready = total > 0;
  return {
    ready,
    status: ready ? "ready" : "pending",
    total,
    helperReady,
    guidance: ready
      ? `Replaying ${total} receipt${total === 1 ? "" : "s"} across the four governed lanes.`
      : "No receipts yet. Every governed mutation — direct PATCH, sandbox run, publish, helper apply — appends one. Run an action to seed the causal chain.",
  };
}
