/**
 * Eligibility & Causation Driver model (read-only, derived).
 *
 * Pure module — no React, no fetch, no config writes. The EligibilityCockpit
 * consumes this against the SHIPPED agent-outcome receipt stream
 * (`GET /api/workspace/agent-outcomes`); unit tests assert its invariants.
 *
 * It introduces NO new receipt kind, NO new lane, and NO mutation. It is a
 * second read-side projection over the existing receipt contract
 * (`@growthub/api-contract/workspace-outcome::AgentOutcomeReceipt`), sitting
 * beside the governance summary the cockpit already renders.
 *
 * Two derivations, both pure causation over the receipt stream:
 *
 *   1. Route-shopping — the directly-detectable pattern named in the
 *      contract: a BLOCKED `untrusted-direct` receipt FOLLOWED BY an
 *      `execution-proof` attempt by the SAME actor. We pair each blocked
 *      direct attempt with the first following proof attempt by that actor.
 *
 *   2. Per-actor eligibility — each actor's verdict is a deterministic
 *      function of its "drivers": named causes, each citing the receiptIds
 *      that produced it. Nothing is asserted that a receipt does not prove.
 */

/** The sidecar view this model powers — single source of truth for the slash
 *  command, the sidecar view id, the lens button, and the cockpit header. */
export const ELIGIBILITY_COCKPIT_VIEW = {
  id: "eligibility",
  slash: "/eligibility",
  title: "Eligibility & causation",
  source: "/api/workspace/agent-outcomes",
};

/** Verdicts, worst-first. A verdict is the highest-ranked driver effect. */
const EFFECT_RANK = { block: 3, watch: 2, eligible: 1, none: 0 };
const EFFECT_VERDICT = { block: "blocked", watch: "watch", eligible: "eligible", none: "observed" };

function actorOf(receipt) {
  return String(receipt?.actor || "").trim() || "unattributed";
}

function objectIdsOf(receipt) {
  if (!Array.isArray(receipt?.objectRefs)) return [];
  return receipt.objectRefs
    .map((ref) => String(ref?.objectId || "").trim())
    .filter(Boolean);
}

/**
 * Sort newest-first stream into chronological (oldest-first) order. Primary
 * key is `createdAt`; the server-side monotonic `seq` breaks same-ms ties so
 * causation pairing is deterministic.
 */
export function toChronological(receipts) {
  const list = Array.isArray(receipts) ? receipts.slice() : [];
  return list.sort((a, b) => {
    const ta = Date.parse(a?.createdAt || "") || 0;
    const tb = Date.parse(b?.createdAt || "") || 0;
    if (ta !== tb) return ta - tb;
    const sa = Number(a?.seq);
    const sb = Number(b?.seq);
    if (Number.isFinite(sa) && Number.isFinite(sb)) return sa - sb;
    return 0;
  });
}

/**
 * Route-shopping detections. Exact contract definition: a blocked
 * `untrusted-direct` receipt followed by an `execution-proof` attempt by the
 * same actor. Each blocked direct attempt pairs with the FIRST following
 * proof attempt by that actor (regardless of the proof's own outcome — it is
 * the attempt to reach the same objective through another lane that matters).
 *
 * Object-ref overlap is annotated (severity "high" when the proof targets a
 * shared object, "elevated" otherwise) but is NOT a filter — the stated
 * pattern is actor + sequence, and we report it faithfully.
 */
export function deriveRouteShopping(receipts) {
  const chrono = toChronological(receipts);
  const pendingByActor = new Map(); // actor -> blocked untrusted-direct receipt
  const detections = [];

  for (const receipt of chrono) {
    const actor = actorOf(receipt);
    const lane = String(receipt?.lane || "");
    const blocked = String(receipt?.outcomeStatus || "") === "blocked";

    if (lane === "untrusted-direct" && blocked) {
      pendingByActor.set(actor, receipt);
      continue;
    }

    if (lane === "execution-proof" && pendingByActor.has(actor)) {
      const blockedReceipt = pendingByActor.get(actor);
      pendingByActor.delete(actor);
      const blockedObjects = objectIdsOf(blockedReceipt);
      const proofObjects = objectIdsOf(receipt);
      const sharedObjectIds = blockedObjects.filter((id) => proofObjects.includes(id));
      const ta = Date.parse(blockedReceipt?.createdAt || "") || 0;
      const tb = Date.parse(receipt?.createdAt || "") || 0;
      detections.push({
        actor,
        severity: sharedObjectIds.length > 0 ? "high" : "elevated",
        sharedObjectIds,
        windowMs: tb >= ta ? tb - ta : null,
        blocked: {
          receiptId: blockedReceipt?.receiptId || null,
          createdAt: blockedReceipt?.createdAt || null,
          objectIds: blockedObjects,
          violationCodes: Array.isArray(blockedReceipt?.policyVerdict?.violationCodes)
            ? blockedReceipt.policyVerdict.violationCodes
            : [],
          summary: blockedReceipt?.summary || "",
        },
        proof: {
          receiptId: receipt?.receiptId || null,
          createdAt: receipt?.createdAt || null,
          outcomeStatus: receipt?.outcomeStatus || null,
          objectIds: proofObjects,
          summary: receipt?.summary || "",
        },
      });
    }
  }

  return detections;
}

// One causal driver = one named reason, the receipts that prove it, and the
// effect it has on the actor's verdict. Effects compose by max rank.
function addDriver(map, code, effect, detail, receiptId) {
  const existing = map.get(code);
  if (existing) {
    existing.count += 1;
    if (receiptId && !existing.receiptIds.includes(receiptId)) existing.receiptIds.push(receiptId);
    return;
  }
  map.set(code, { code, effect, detail, count: 1, receiptIds: receiptId ? [receiptId] : [] });
}

/**
 * Per-actor eligibility. Each actor's drivers are derived purely from its
 * receipts plus the route-shopping detections it participated in; the verdict
 * is the highest-ranked driver effect (block > watch > eligible > observed).
 */
export function deriveActorEligibility(receipts, routeShopping) {
  const chrono = toChronological(receipts);
  const detections = Array.isArray(routeShopping) ? routeShopping : deriveRouteShopping(chrono);

  const byActor = new Map();
  const ensure = (actor) => {
    if (!byActor.has(actor)) {
      byActor.set(actor, {
        actor,
        receipts: 0,
        byLane: { "untrusted-direct": 0, "governed-proposal": 0, "execution-proof": 0, "server-authoritative": 0 },
        blockedAttempts: 0,
        routeShoppingEvents: 0,
        lastActivityAt: null,
        drivers: new Map(),
      });
    }
    return byActor.get(actor);
  };

  for (const receipt of chrono) {
    const actor = actorOf(receipt);
    const entry = ensure(actor);
    entry.receipts += 1;
    const lane = String(receipt?.lane || "");
    if (lane in entry.byLane) entry.byLane[lane] += 1;
    entry.lastActivityAt = receipt?.createdAt || entry.lastActivityAt;

    const status = String(receipt?.outcomeStatus || "");
    const id = receipt?.receiptId || null;
    if (status === "blocked") {
      entry.blockedAttempts += 1;
      addDriver(entry.drivers, "blocked-attempt", "watch", "Policy/gate blocked an attempt", id);
    }
    if (status === "failed") {
      addDriver(entry.drivers, "failed-run", "watch", "An execution attempt failed", id);
    }
    if (lane === "execution-proof" && (status === "tested" || status === "verified")) {
      addDriver(entry.drivers, "proof-tested", "eligible", "Produced passing execution proof", id);
    }
    if (lane === "server-authoritative" && status === "published") {
      addDriver(entry.drivers, "published", "eligible", "Published through the server-authoritative lane", id);
    }
  }

  for (const detection of detections) {
    const entry = ensure(detection.actor);
    entry.routeShoppingEvents += 1;
    const detail = detection.sharedObjectIds.length > 0
      ? "Route-shopping: blocked direct attempt re-attempted via execution-proof on a shared object"
      : "Route-shopping: blocked direct attempt followed by an execution-proof attempt";
    addDriver(entry.drivers, "route-shopping", "block", detail, detection.blocked.receiptId);
    if (detection.proof.receiptId) {
      const driver = entry.drivers.get("route-shopping");
      if (!driver.receiptIds.includes(detection.proof.receiptId)) driver.receiptIds.push(detection.proof.receiptId);
    }
  }

  return Array.from(byActor.values())
    .map((entry) => {
      const drivers = Array.from(entry.drivers.values())
        .sort((a, b) => EFFECT_RANK[b.effect] - EFFECT_RANK[a.effect]);
      const topEffect = drivers.reduce((max, d) => (EFFECT_RANK[d.effect] > EFFECT_RANK[max] ? d.effect : max), "none");
      return {
        actor: entry.actor,
        verdict: EFFECT_VERDICT[topEffect],
        receipts: entry.receipts,
        byLane: entry.byLane,
        blockedAttempts: entry.blockedAttempts,
        routeShoppingEvents: entry.routeShoppingEvents,
        lastActivityAt: entry.lastActivityAt,
        drivers,
      };
    })
    .sort((a, b) => {
      const rank = EFFECT_RANK[Object.keys(EFFECT_VERDICT).find((k) => EFFECT_VERDICT[k] === b.verdict)]
        - EFFECT_RANK[Object.keys(EFFECT_VERDICT).find((k) => EFFECT_VERDICT[k] === a.verdict)];
      if (rank !== 0) return rank;
      return String(a.actor).localeCompare(String(b.actor));
    });
}

/** The full cockpit data model: summary + route-shopping + per-actor drivers. */
export function deriveEligibilityModel(receipts) {
  const chrono = toChronological(receipts);
  const routeShopping = deriveRouteShopping(chrono);
  const actors = deriveActorEligibility(chrono, routeShopping);
  const summary = {
    receipts: chrono.length,
    actors: actors.length,
    routeShoppingEvents: routeShopping.length,
    blockedActors: actors.filter((a) => a.verdict === "blocked").length,
    watchActors: actors.filter((a) => a.verdict === "watch").length,
    eligibleActors: actors.filter((a) => a.verdict === "eligible").length,
  };
  return { summary, routeShopping, actors };
}
