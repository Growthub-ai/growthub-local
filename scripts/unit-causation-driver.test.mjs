#!/usr/bin/env node
/**
 * Unit coverage for the Causation Driver V1 pure lane
 * (lib/workspace-causation-driver.js).
 *
 * Governance invariants:
 *   - the custom sidecar config is read-only: GET source, mutates: false, no
 *     behavior keys outside the allowed surface (and the invariant bites on
 *     forged configs — the adversarial proof it is not vacuous)
 *   - eligibility is "is there evidence to replay", never a runtime gate
 *   - chain derivation is deterministic: directly-follows edges on a shared
 *     object scope, ordered by server-owned seq, with the route-shopping
 *     pattern (denied untrusted-direct → privileged write, same actor/object)
 *     surfaced
 *
 * Run with:  node --test scripts/unit-causation-driver.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-causation-driver.js"
);

const {
  CAUSATION_DRIVER_SIDECAR_CONFIG,
  CAUSATION_LANES,
  CAUSATION_EDGE_RULES,
  isGovernedCausationSidecarConfig,
  deriveCausationChainProjection,
  deriveCausationEligibility,
  causationNodeVariant,
} = await import(pathToFileURL(modulePath).href);

const T0 = Date.parse("2026-06-13T12:00:00.000Z");
function at(offsetMs) {
  return new Date(T0 + offsetMs).toISOString();
}

test("the sidecar config is governed read-only", () => {
  const verdict = isGovernedCausationSidecarConfig(CAUSATION_DRIVER_SIDECAR_CONFIG);
  assert.equal(verdict.ok, true, verdict.error);
  assert.equal(CAUSATION_DRIVER_SIDECAR_CONFIG.view, "causation");
  assert.equal(CAUSATION_DRIVER_SIDECAR_CONFIG.mutates, false);
  assert.equal(CAUSATION_DRIVER_SIDECAR_CONFIG.method, "GET");
  assert.equal(CAUSATION_DRIVER_SIDECAR_CONFIG.command, "/causation");
  assert.equal(CAUSATION_DRIVER_SIDECAR_CONFIG.source, "/api/workspace/agent-outcomes");
  assert.equal(CAUSATION_LANES.length, 4);
  assert.ok(CAUSATION_EDGE_RULES.some((r) => r.id === "route-shopping"));
});

test("the read-only invariant bites on forged sidecar configs", () => {
  // mutates: true is rejected
  assert.equal(isGovernedCausationSidecarConfig({ view: "x", mutates: true, method: "GET" }).ok, false);
  // a non-GET (mutating) source method is rejected
  assert.equal(isGovernedCausationSidecarConfig({ view: "x", mutates: false, method: "POST" }).ok, false);
  // a smuggled behavior key outside the allowed surface is rejected
  assert.equal(
    isGovernedCausationSidecarConfig({ view: "x", mutates: false, method: "GET", execute: () => {} }).ok,
    false
  );
  // a well-formed read-only config passes
  assert.equal(isGovernedCausationSidecarConfig({ view: "x", mutates: false, method: "GET" }).ok, true);
});

test("eligibility reflects evidence, not a runtime gate", () => {
  const empty = deriveCausationEligibility({ receipts: [] });
  assert.equal(empty.ready, false);
  assert.equal(empty.status, "pending");
  assert.equal(empty.total, 0);

  const some = deriveCausationEligibility({
    receipts: [{ receiptId: "a" }, { receiptId: "b" }],
    helperWidgetState: { ready: false },
  });
  // A non-ready helper widget never blocks replay — receipts accrue regardless.
  assert.equal(some.ready, true);
  assert.equal(some.total, 2);
  assert.equal(some.helperReady, false);
});

test("node variant maps outcome status truthfully", () => {
  assert.equal(causationNodeVariant({ outcomeStatus: "blocked" }), "fail");
  assert.equal(causationNodeVariant({ outcomeStatus: "failed" }), "fail");
  assert.equal(causationNodeVariant({ outcomeStatus: "published" }), "ok");
  assert.equal(causationNodeVariant({ outcomeStatus: "applied" }), "ok");
  assert.equal(causationNodeVariant({ outcomeStatus: "pending" }), "pending");
  assert.equal(causationNodeVariant({ outcomeStatus: "weird" }), "canceled");
});

test("directly-follows edges link the next touch of a shared object scope", () => {
  const receipts = [
    { receiptId: "r1", seq: 1, lane: "governed-proposal", outcomeStatus: "applied", createdAt: at(0), objectRefs: [{ objectId: "swarm-workflows", rowName: "nightly" }] },
    { receiptId: "r2", seq: 2, lane: "execution-proof", outcomeStatus: "ok", createdAt: at(1000), objectRefs: [{ objectId: "swarm-workflows", rowName: "nightly" }] },
    // Different rowName scope — must NOT connect to the nightly chain.
    { receiptId: "r3", seq: 3, lane: "execution-proof", outcomeStatus: "ok", createdAt: at(2000), objectRefs: [{ objectId: "swarm-workflows", rowName: "weekly" }] },
    // No objectRefs — isolated node, contributes no edge.
    { receiptId: "r4", seq: 4, lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: at(3000) },
  ];
  const projection = deriveCausationChainProjection(receipts);
  assert.equal(projection.total, 4);
  // Exactly one edge: r1 → r2 on the nightly scope.
  assert.equal(projection.edges.length, 1);
  const edge = projection.edges[0];
  assert.equal(projection.nodes[edge.from].receiptId, "r1");
  assert.equal(projection.nodes[edge.to].receiptId, "r2");
  assert.equal(edge.scope, "swarm-workflows::nightly");
  assert.equal(edge.rule, "directly-follows");
  assert.equal(edge.routeShopping, false);
  assert.equal(projection.routeShopping.length, 0);
  assert.equal(projection.laneCounts["execution-proof"], 2);
});

test("route-shopping is surfaced: denied direct → privileged write, same actor/object", () => {
  const receipts = [
    { receiptId: "deny", seq: 1, actor: "agent-7", lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: at(0), objectRefs: [{ objectId: "data", rowName: "secret" }] },
    { receiptId: "launder", seq: 2, actor: "agent-7", lane: "execution-proof", outcomeStatus: "ok", createdAt: at(30_000), objectRefs: [{ objectId: "data", rowName: "secret" }] },
  ];
  const projection = deriveCausationChainProjection(receipts);
  assert.equal(projection.routeShopping.length, 1);
  const flagged = projection.routeShopping[0];
  assert.equal(flagged.rule, "route-shopping");
  assert.equal(flagged.routeShopping, true);
  assert.equal(flagged.actorSame, true);
  assert.equal(projection.nodes[flagged.from].receiptId, "deny");
  assert.equal(projection.nodes[flagged.to].receiptId, "launder");
});

test("route-shopping requires the same actor and a tight window", () => {
  // Different actor — a denied attempt followed by a DIFFERENT actor's
  // privileged write is not route-shopping.
  const differentActor = deriveCausationChainProjection([
    { receiptId: "deny", seq: 1, actor: "agent-7", lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: at(0), objectRefs: [{ objectId: "data", rowName: "secret" }] },
    { receiptId: "ok", seq: 2, actor: "agent-9", lane: "execution-proof", outcomeStatus: "ok", createdAt: at(30_000), objectRefs: [{ objectId: "data", rowName: "secret" }] },
  ]);
  assert.equal(differentActor.routeShopping.length, 0);

  // Same actor but the privileged write is hours later — outside the tight
  // route-shopping window, so the edge is a plain directly-follows.
  const tooLate = deriveCausationChainProjection([
    { receiptId: "deny", seq: 1, actor: "agent-7", lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: at(0), objectRefs: [{ objectId: "data", rowName: "secret" }] },
    { receiptId: "later", seq: 2, actor: "agent-7", lane: "execution-proof", outcomeStatus: "ok", createdAt: at(6 * 60 * 60 * 1000), objectRefs: [{ objectId: "data", rowName: "secret" }] },
  ]);
  assert.equal(tooLate.routeShopping.length, 0);
  assert.equal(tooLate.edges.length, 1);
  assert.equal(tooLate.edges[0].rule, "directly-follows");
});

test("ordering is by server-owned seq, independent of input order", () => {
  // Feed newest-first (as the API returns it); derivation must reorder.
  const projection = deriveCausationChainProjection([
    { receiptId: "second", seq: 2, lane: "execution-proof", outcomeStatus: "ok", createdAt: at(1000), objectRefs: [{ objectId: "o" }] },
    { receiptId: "first", seq: 1, lane: "governed-proposal", outcomeStatus: "applied", createdAt: at(0), objectRefs: [{ objectId: "o" }] },
  ]);
  assert.equal(projection.nodes[0].receiptId, "first");
  assert.equal(projection.nodes[1].receiptId, "second");
  assert.equal(projection.edges.length, 1);
  assert.equal(projection.nodes[projection.edges[0].from].receiptId, "first");
});
