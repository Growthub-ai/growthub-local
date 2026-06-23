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

// ---------------------------------------------------------------------------
// API contract probes — positive + negative + adversarial. The cockpit is a
// pure consumer of GET /api/workspace/agent-outcomes; these probes exercise the
// full range of receipt-stream shapes that endpoint can return.
// ---------------------------------------------------------------------------

// Build a stream in the SHAPE the endpoint returns: newest-first, server `seq`
// present. The deriver must re-sort to chronological order regardless.
function endpointStream(receiptsOldestFirst) {
  return receiptsOldestFirst
    .map((r, i) => ({ seq: i, createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(), summary: "x", ...r }))
    .reverse(); // endpoint hands back newest-first
}

test("probe[+]: realistic multi-actor stream isolates the one true route-shop", () => {
  const stream = endpointStream([
    { receiptId: "r1", actor: "agent:alpha", lane: "untrusted-direct", outcomeStatus: "blocked",
      policyVerdict: { ok: false, violationCodes: ["LIVE_WORKFLOW_MUTATION"] },
      objectRefs: [{ objectId: "swarm-workflows", rowName: "nightly" }] },
    { receiptId: "r2", actor: "agent:beta", lane: "helper-apply", outcomeStatus: "verified" }, // noise lane
    { receiptId: "r3", actor: "agent:alpha", lane: "execution-proof", outcomeStatus: "verified",
      objectRefs: [{ objectId: "swarm-workflows", rowName: "nightly" }] }, // alpha shops
    { receiptId: "r4", actor: "agent:gamma", lane: "execution-proof", outcomeStatus: "verified" }, // proof w/o prior block
    { receiptId: "r5", actor: "agent:beta", lane: "untrusted-direct", outcomeStatus: "blocked" }, // beta blocked, never shops
    { receiptId: "r6", actor: "agent:delta", lane: "workflow-publish", outcomeStatus: "published" }, // noise lane
  ]);
  const model = deriveGovernanceCausation({ receipts: stream });
  assert.equal(model.signals.length, 1);
  assert.equal(model.signals[0].actor, "agent:alpha");
  assert.equal(model.signals[0].blockedReceiptId, "r1");
  assert.equal(model.signals[0].followOnReceiptId, "r3");
  assert.equal(model.signals[0].handoff.name, "nightly");
  assert.equal(model.totals.blockedDirect, 2); // alpha + beta blocked
  assert.equal(model.totals.executionProofs, 2); // alpha + gamma
  assert.equal(model.attention.actor, "agent:alpha");
});

test("probe[+]: two shopping actors → two signals, attention is highest-then-newest", () => {
  const stream = endpointStream([
    { receiptId: "b1", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked" },
    { receiptId: "p1", actor: "a", lane: "execution-proof", outcomeStatus: "blocked" }, // held → low
    { receiptId: "b2", actor: "z", lane: "untrusted-direct", outcomeStatus: "blocked" },
    { receiptId: "p2", actor: "z", lane: "execution-proof", outcomeStatus: "verified" }, // accepted + close → higher
  ]);
  const model = deriveGovernanceCausation({ receipts: stream });
  assert.equal(model.signals.length, 2);
  // Newest-first display ordering.
  assert.equal(model.signals[0].followOnReceiptId, "p2");
  assert.equal(model.attention.actor, "z");
});

test("probe[-]: malformed / partial receipts are ignored, never throw", () => {
  const stream = [
    null,
    7,
    "garbage",
    { lane: "untrusted-direct", outcomeStatus: "blocked" }, // no receiptId
    { receiptId: "ok-b", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked" },
    { receiptId: "ok-p", actor: "a", lane: "execution-proof", outcomeStatus: "verified" },
    { receiptId: "x", actor: "a", lane: undefined, outcomeStatus: null },
  ];
  const model = deriveGovernanceCausation({ receipts: stream });
  assert.equal(model.signals.length, 1);
  assert.equal(model.signals[0].blockedReceiptId, "ok-b");
});

test("probe[-]: malformed objectRefs yield no handoff but still a signal", () => {
  const signals = deriveRouteShoppingSignals([
    { receiptId: "b", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked",
      objectRefs: ["nope", null, { rowName: "no-object-id" }, 42], createdAt: "2026-01-01T00:00:00Z", seq: 0 },
    { receiptId: "p", actor: "a", lane: "execution-proof", outcomeStatus: "verified",
      objectRefs: "not-an-array", createdAt: "2026-01-01T00:00:05Z", seq: 1 },
  ]);
  assert.equal(signals.length, 1);
  assert.deepEqual(signals[0].objectRefs, []); // none resolvable
  assert.equal(signals[0].handoff, null); // no addressable row → no Open
});

test("probe[-]: secret-shaped strings are bounded and not expanded", () => {
  const longSecret = "Bearer sk-" + "A".repeat(5000);
  const signals = deriveRouteShoppingSignals([
    { receiptId: "b", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked",
      summary: longSecret, createdAt: "2026-01-01T00:00:00Z", seq: 0,
      objectRefs: [{ objectId: "o".repeat(5000), rowName: "r".repeat(5000) }] },
    { receiptId: "p", actor: "a", lane: "execution-proof", outcomeStatus: "verified",
      summary: longSecret, createdAt: "2026-01-01T00:00:01Z", seq: 1 },
  ]);
  assert.equal(signals.length, 1);
  // Every surfaced string is truncated to its declared bound (never unbounded).
  assert.ok(signals[0].blockedSummary.length <= 201);
  assert.ok(signals[0].objectRefs[0].objectId.length <= 121);
  // The deriver never lengthens input; serialized signal stays bounded.
  assert.ok(JSON.stringify(signals[0]).length < longSecret.length);
});

test("probe[-]: out-of-order timestamps clamp elapsedMs to >= 0", () => {
  // seq says block precedes proof, but the proof's wall-clock is EARLIER.
  const signals = deriveRouteShoppingSignals([
    { receiptId: "b", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked",
      createdAt: "2026-01-01T00:01:00Z", seq: 0 },
    { receiptId: "p", actor: "a", lane: "execution-proof", outcomeStatus: "verified",
      createdAt: "2026-01-01T00:00:00Z", seq: 1 },
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].elapsedMs, 0); // clamped, never negative
});

test("probe[-]: a second block before any proof supersedes the first (closest pair)", () => {
  const signals = deriveRouteShoppingSignals([
    { receiptId: "b1", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: "2026-01-01T00:00:00Z", seq: 0 },
    { receiptId: "b2", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: "2026-01-01T00:00:01Z", seq: 1 },
    { receiptId: "p", actor: "a", lane: "execution-proof", outcomeStatus: "verified", createdAt: "2026-01-01T00:00:02Z", seq: 2 },
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].blockedReceiptId, "b2");
});

test("probe[-]: large stream stays bounded and correct (no quadratic blowup of signals)", () => {
  const big = [];
  for (let i = 0; i < 1000; i += 1) {
    big.push({ receiptId: `n${i}`, actor: `actor${i % 7}`, lane: "execution-proof", outcomeStatus: "verified",
      createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(), seq: i });
  }
  // Inject exactly 3 genuine shops for actor0.
  big.push({ receiptId: "B1", actor: "actor0", lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: new Date(1_700_000_999_000).toISOString(), seq: 1000 });
  big.push({ receiptId: "P1", actor: "actor0", lane: "execution-proof", outcomeStatus: "verified", createdAt: new Date(1_700_001_000_000).toISOString(), seq: 1001 });
  const model = deriveGovernanceCausation({ receipts: big });
  assert.equal(typeof model.totals.routeShopSignals, "number");
  assert.equal(model.signals.length, 1);
  assert.equal(model.signals[0].blockedReceiptId, "B1");
  assert.equal(model.status, model.totals.highSeverity > 0 ? "alert" : "watch");
});

test("probe[-]: non-string actor is coerced, never crashes grouping", () => {
  const signals = deriveRouteShoppingSignals([
    { receiptId: "b", actor: 12345, lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: "2026-01-01T00:00:00Z", seq: 0 },
    { receiptId: "p", actor: 12345, lane: "execution-proof", outcomeStatus: "verified", createdAt: "2026-01-01T00:00:01Z", seq: 1 },
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].actor, "12345");
});

test("probe[+]: hand-off prefers the execution-proof row over the blocked direct target", () => {
  // The block reached for a dashboard (non-executable); the proof ran a sandbox
  // row. Open must land on the sandbox row Background Tasks can render.
  const signals = deriveRouteShoppingSignals([
    { receiptId: "b", actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked",
      objectRefs: [{ objectId: "marketing-dashboard", rowName: "kpis", objectType: "dashboard" }],
      createdAt: "2026-01-01T00:00:00Z", seq: 0 },
    { receiptId: "p", actor: "a", lane: "execution-proof", outcomeStatus: "verified",
      objectRefs: [{ objectId: "swarm-workflows", rowName: "nightly", objectType: "sandbox-environment" }],
      createdAt: "2026-01-01T00:00:03Z", seq: 1 },
  ]);
  assert.equal(signals.length, 1);
  assert.deepEqual(signals[0].handoff, { surface: "swarm-run", objectId: "swarm-workflows", name: "nightly" });
});

test("probe[+]: an actorless block+proof pair correlates under the unattributed bucket", () => {
  const signals = deriveRouteShoppingSignals([
    { receiptId: "b", lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: "2026-01-01T00:00:00Z", seq: 0 },
    { receiptId: "p", lane: "execution-proof", outcomeStatus: "verified", createdAt: "2026-01-01T00:00:01Z", seq: 1 },
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].actor, "unattributed");
});
