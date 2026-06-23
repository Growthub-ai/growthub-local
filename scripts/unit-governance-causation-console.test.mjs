#!/usr/bin/env node
/**
 * Unit coverage for the Governance Causation projection
 * (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1 §3 + CEO_PRIMITIVE_COCKPIT_ROADMAP_V1 R3).
 *
 * Verifies deriveRouteShoppingSignals / deriveGovernanceCausation:
 *   - empty / malformed receipt stream never throws and yields a clear status
 *   - a blocked untrusted-direct receipt followed by an execution-proof by the
 *     SAME actor produces exactly one route-shop signal
 *   - actors are never silently merged (different actor → no signal)
 *   - the blocked receipt is consumed (one block ⇒ at most one follow-on)
 *   - severity is derived from evidence (proximity + repeat + follow-on outcome)
 *   - a missing/unparseable createdAt yields elapsedMs null, never 0
 *   - the signal hands off to the EXISTING swarm-run surface when an addressable
 *     row is in objectRefs (no new route/object)
 *   - the deriver is PURE: no fetch/fs/localStorage/window references in source
 *
 * Run with:  node --test scripts/unit-governance-causation-console.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib"
);
const modPath = path.join(kitLib, "governance-causation-console.js");
const mod = await import(pathToFileURL(modPath).href);
const { deriveRouteShoppingSignals, deriveGovernanceCausation } = mod;

let clock = 0;
function at(offsetMs = 1000) {
  clock += offsetMs;
  return new Date(clock).toISOString();
}

function receipt(overrides = {}) {
  return {
    receiptId: `aor_${Math.random().toString(36).slice(2, 8)}`,
    kind: "agent-outcome",
    lane: "untrusted-direct",
    outcomeStatus: "blocked",
    summary: "test receipt",
    createdAt: at(),
    ...overrides,
  };
}

test("empty / malformed stream never throws and is clear", () => {
  for (const input of [undefined, null, [], "nope", [null, 7, "x"], { receipts: 1 }]) {
    const list = Array.isArray(input) ? input : input?.receipts;
    assert.deepEqual(deriveRouteShoppingSignals(list), []);
    const model = deriveGovernanceCausation({ receipts: list });
    assert.equal(model.title, "Governance");
    assert.equal(model.status, "clear");
    assert.equal(model.signals.length, 0);
    assert.equal(model.attention, null);
    assert.equal(model.totals.routeShopSignals, 0);
  }
});

test("blocked direct → execution-proof by same actor yields one signal", () => {
  const blocked = receipt({
    receiptId: "block-1",
    actor: "agent:alpha",
    lane: "untrusted-direct",
    outcomeStatus: "blocked",
    policyVerdict: { ok: false, violationCodes: ["LIVE_WORKFLOW_MUTATION"] },
    objectRefs: [{ objectId: "swarm-workflows", rowName: "nightly", objectType: "sandbox-environment" }],
  });
  const proof = receipt({
    receiptId: "proof-1",
    actor: "agent:alpha",
    lane: "execution-proof",
    outcomeStatus: "verified",
    objectRefs: [{ objectId: "swarm-workflows", rowName: "nightly" }],
  });
  const signals = deriveRouteShoppingSignals([blocked, proof]);
  assert.equal(signals.length, 1);
  const s = signals[0];
  assert.equal(s.actor, "agent:alpha");
  assert.equal(s.blockedReceiptId, "block-1");
  assert.equal(s.followOnReceiptId, "proof-1");
  assert.equal(s.followOnSucceeded, true);
  assert.deepEqual(s.policyVerdict.violationCodes, ["LIVE_WORKFLOW_MUTATION"]);
  // Hands off to the EXISTING swarm-run surface — no new route/object.
  assert.equal(s.handoff.surface, "swarm-run");
  assert.equal(s.handoff.objectId, "swarm-workflows");
  assert.equal(s.handoff.name, "nightly");

  const model = deriveGovernanceCausation({ receipts: [proof, blocked] }); // any order
  assert.equal(model.totals.routeShopSignals, 1);
  assert.equal(model.totals.blockedDirect, 1);
  assert.equal(model.totals.executionProofs, 1);
  assert.equal(model.attention.signalId, s.signalId);
});

test("different actors are never merged into a signal", () => {
  const blocked = receipt({ actor: "agent:alpha", lane: "untrusted-direct", outcomeStatus: "blocked" });
  const proof = receipt({ actor: "agent:beta", lane: "execution-proof", outcomeStatus: "verified" });
  assert.deepEqual(deriveRouteShoppingSignals([blocked, proof]), []);
});

test("one block is consumed by the first follow-on only", () => {
  const blocked = receipt({ receiptId: "b", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked" });
  const proof1 = receipt({ receiptId: "p1", actor: "a", lane: "execution-proof", outcomeStatus: "verified" });
  const proof2 = receipt({ receiptId: "p2", actor: "a", lane: "execution-proof", outcomeStatus: "verified" });
  const signals = deriveRouteShoppingSignals([blocked, proof1, proof2]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].followOnReceiptId, "p1");
});

test("severity escalates with proximity, repeats and a succeeding follow-on", () => {
  clock = 0;
  const t0 = at(0);
  // Two quick block→proof hops by the same actor, both succeeding → repeat
  // amplification pushes the second to high.
  const stream = [
    { receiptId: "b1", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked", summary: "x", createdAt: new Date(t0).toISOString() },
    { receiptId: "p1", actor: "a", lane: "execution-proof", outcomeStatus: "verified", summary: "x", createdAt: new Date(Date.parse(t0) + 5000).toISOString() },
    { receiptId: "b2", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked", summary: "x", createdAt: new Date(Date.parse(t0) + 6000).toISOString() },
    { receiptId: "p2", actor: "a", lane: "execution-proof", outcomeStatus: "verified", summary: "x", createdAt: new Date(Date.parse(t0) + 9000).toISOString() },
  ];
  const signals = deriveRouteShoppingSignals(stream);
  assert.equal(signals.length, 2);
  const byFollowOn = Object.fromEntries(signals.map((s) => [s.followOnReceiptId, s]));
  assert.equal(byFollowOn["p1"].severity, "high"); // <=60s proximity + succeeded
  assert.equal(byFollowOn["p2"].severity, "high"); // repeat amplifies too
  const model = deriveGovernanceCausation({ receipts: stream });
  assert.equal(model.status, "alert");
  assert.equal(model.totals.highSeverity, 2);
});

test("a blocked follow-on (system held) is lower severity than a succeeding one", () => {
  clock = 0;
  const t0 = Date.parse(at(0));
  const stream = [
    { receiptId: "b", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked", summary: "x", createdAt: new Date(t0).toISOString() },
    // 10 minutes later, and the proof lane also blocked it → low score.
    { receiptId: "p", actor: "a", lane: "execution-proof", outcomeStatus: "blocked", summary: "x", createdAt: new Date(t0 + 10 * 60_000).toISOString() },
  ];
  const held = deriveRouteShoppingSignals(stream);
  assert.equal(held.length, 1);
  assert.equal(held[0].followOnSucceeded, false);
  assert.equal(held[0].severity, "low");
  // One low-severity signal ⇒ "watch" (a signal exists, but none is high).
  assert.equal(deriveGovernanceCausation({ receipts: stream }).status, "watch");
});

test("missing createdAt yields elapsedMs null, never 0", () => {
  const signals = deriveRouteShoppingSignals([
    { receiptId: "b", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked", summary: "x" },
    { receiptId: "p", actor: "a", lane: "execution-proof", outcomeStatus: "verified", summary: "x" },
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].elapsedMs, null);
  assert.equal(signals[0].elapsedLabel, "—");
});

test("the deriver source is pure (no fetch/fs/storage/window/React/require)", () => {
  const source = fs.readFileSync(modPath, "utf8");
  // Punctuated forms only — so the module's own prose ("no browser storage")
  // never trips the guard; we are asserting against real usage, not mentions.
  for (const forbidden of ["fetch(", "localStorage.", "sessionStorage.", "require(", "from \"react", "window.", "document."]) {
    assert.equal(source.includes(forbidden), false, `deriver must not contain: ${forbidden}`);
  }
  // And the canonical secret/browser-storage regex used by the kit suite must
  // not match the source either (belt-and-suspenders against future edits).
  assert.equal(/localStorage|sessionStorage/.test(source), false);
});
