#!/usr/bin/env node
/**
 * Unit coverage for the eligibility & causation driver model — the read-only
 * second projection over the SHIPPED agent-outcome receipt stream.
 *
 * Invariants:
 *   - Route-shopping is exactly: a blocked `untrusted-direct` receipt
 *     followed by an `execution-proof` attempt by the SAME actor.
 *   - It does not fire across different actors, nor when the proof precedes
 *     the block, nor when no proof follows.
 *   - Each actor verdict is a deterministic function of its drivers, and
 *     every driver cites the receiptIds that produced it.
 *   - The model introduces no new lane, kind, or mutation — it is pure.
 *
 * Run with:  node --test scripts/unit-eligibility-causation.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/components/eligibility-causation.js"
);

const {
  ELIGIBILITY_COCKPIT_VIEW,
  toChronological,
  deriveRouteShopping,
  deriveActorEligibility,
  deriveEligibilityModel,
} = await import(pathToFileURL(modulePath).href);

let seq = 0;
function receipt(over = {}) {
  seq += 1;
  return {
    receiptId: over.receiptId || `aor_${seq}`,
    kind: over.kind || "agent-outcome",
    lane: over.lane || "untrusted-direct",
    actor: over.actor || "agent",
    outcomeStatus: over.outcomeStatus || "published",
    objectRefs: over.objectRefs || [],
    policyVerdict: over.policyVerdict,
    summary: over.summary || "",
    seq,
    createdAt: over.createdAt || new Date(1_700_000_000_000 + seq * 1000).toISOString(),
  };
}

test("the sidecar view config is a read-only eligibility view", () => {
  assert.equal(ELIGIBILITY_COCKPIT_VIEW.id, "eligibility");
  assert.equal(ELIGIBILITY_COCKPIT_VIEW.slash, "/eligibility");
  assert.equal(ELIGIBILITY_COCKPIT_VIEW.source, "/api/workspace/agent-outcomes");
});

test("toChronological sorts oldest-first regardless of input order", () => {
  const older = receipt({ createdAt: "2026-01-01T00:00:00.000Z" });
  const newer = receipt({ createdAt: "2026-01-02T00:00:00.000Z" });
  const chrono = toChronological([newer, older]);
  assert.equal(chrono[0].receiptId, older.receiptId);
  assert.equal(chrono[1].receiptId, newer.receiptId);
});

test("route-shopping fires on blocked untrusted-direct followed by execution-proof by same actor", () => {
  const blocked = receipt({
    actor: "agent-a", lane: "untrusted-direct", outcomeStatus: "blocked",
    objectRefs: [{ objectId: "obj1" }], policyVerdict: { ok: false, violationCodes: ["scope_denied"] },
  });
  const proof = receipt({
    actor: "agent-a", lane: "execution-proof", outcomeStatus: "tested",
    objectRefs: [{ objectId: "obj1" }],
  });
  // Feed newest-first (the API contract) to prove internal sorting.
  const detections = deriveRouteShopping([proof, blocked]);
  assert.equal(detections.length, 1);
  assert.equal(detections[0].actor, "agent-a");
  assert.equal(detections[0].severity, "high"); // shared object obj1
  assert.deepEqual(detections[0].sharedObjectIds, ["obj1"]);
  assert.equal(detections[0].blocked.receiptId, blocked.receiptId);
  assert.equal(detections[0].proof.receiptId, proof.receiptId);
  assert.deepEqual(detections[0].blocked.violationCodes, ["scope_denied"]);
});

test("route-shopping is 'elevated' when the proof targets no shared object", () => {
  const blocked = receipt({ actor: "b", lane: "untrusted-direct", outcomeStatus: "blocked", objectRefs: [{ objectId: "x" }] });
  const proof = receipt({ actor: "b", lane: "execution-proof", outcomeStatus: "failed", objectRefs: [{ objectId: "y" }] });
  const [d] = deriveRouteShopping([blocked, proof]);
  assert.equal(d.severity, "elevated");
  assert.deepEqual(d.sharedObjectIds, []);
});

test("route-shopping never fires across different actors", () => {
  const blocked = receipt({ actor: "f", lane: "untrusted-direct", outcomeStatus: "blocked" });
  const proof = receipt({ actor: "g", lane: "execution-proof", outcomeStatus: "tested" });
  assert.equal(deriveRouteShopping([blocked, proof]).length, 0);
});

test("route-shopping never fires when the proof precedes the block", () => {
  const proof = receipt({ actor: "h", lane: "execution-proof", outcomeStatus: "tested", createdAt: "2026-01-01T00:00:00.000Z" });
  const blocked = receipt({ actor: "h", lane: "untrusted-direct", outcomeStatus: "blocked", createdAt: "2026-01-02T00:00:00.000Z" });
  assert.equal(deriveRouteShopping([proof, blocked]).length, 0);
});

test("a route-shopping actor's verdict is 'blocked' and cites both receipts", () => {
  const blocked = receipt({ actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked", objectRefs: [{ objectId: "obj1" }] });
  const proof = receipt({ actor: "a", lane: "execution-proof", outcomeStatus: "tested", objectRefs: [{ objectId: "obj1" }] });
  const actors = deriveActorEligibility([blocked, proof]);
  const a = actors.find((x) => x.actor === "a");
  assert.equal(a.verdict, "blocked");
  assert.equal(a.routeShoppingEvents, 1);
  const driver = a.drivers.find((d) => d.code === "route-shopping");
  assert.ok(driver);
  assert.ok(driver.receiptIds.includes(blocked.receiptId));
  assert.ok(driver.receiptIds.includes(proof.receiptId));
});

test("a clean publishing actor is 'eligible'; a blocked-only actor is 'watch'; a read-only actor is 'observed'", () => {
  const clean1 = receipt({ actor: "clean", lane: "execution-proof", outcomeStatus: "tested" });
  const clean2 = receipt({ actor: "clean", lane: "server-authoritative", outcomeStatus: "published" });
  const watch = receipt({ actor: "watcher", lane: "untrusted-direct", outcomeStatus: "blocked" });
  const observed = receipt({ actor: "observer", lane: "governed-proposal", outcomeStatus: "published", kind: "helper-apply" });

  const actors = deriveActorEligibility([clean1, clean2, watch, observed]);
  assert.equal(actors.find((a) => a.actor === "clean").verdict, "eligible");
  assert.equal(actors.find((a) => a.actor === "watcher").verdict, "watch");
  assert.equal(actors.find((a) => a.actor === "observer").verdict, "observed");
});

test("deriveEligibilityModel summarizes verdict counts and route-shopping events", () => {
  const blocked = receipt({ actor: "a", lane: "untrusted-direct", outcomeStatus: "blocked", objectRefs: [{ objectId: "o" }] });
  const proof = receipt({ actor: "a", lane: "execution-proof", outcomeStatus: "tested", objectRefs: [{ objectId: "o" }] });
  const clean = receipt({ actor: "c", lane: "server-authoritative", outcomeStatus: "published" });
  const model = deriveEligibilityModel([blocked, proof, clean]);
  assert.equal(model.summary.receipts, 3);
  assert.equal(model.summary.actors, 2);
  assert.equal(model.summary.routeShoppingEvents, 1);
  assert.equal(model.summary.blockedActors, 1);
  assert.equal(model.summary.eligibleActors, 1);
});

test("an empty stream yields a well-formed, empty model", () => {
  const model = deriveEligibilityModel([]);
  assert.deepEqual(model.routeShopping, []);
  assert.deepEqual(model.actors, []);
  assert.equal(model.summary.actors, 0);
  assert.equal(model.summary.receipts, 0);
});
