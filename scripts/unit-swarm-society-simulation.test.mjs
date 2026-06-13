#!/usr/bin/env node
/**
 * Unit coverage for Swarm Society Simulation V1 — empirically-grounded
 * agent-based modeling over the Agent Outcome Receipt stream
 * (lib/swarm-society-simulation.js).
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install). Verifies:
 *
 *   - B2: behavior profiling learns blocked/failure/repair rates from receipts
 *   - B2: route-shopping is detected as a blocked PATCH → sandbox-run sequence
 *         by the same actor, not a naive count
 *   - B1: simulation is deterministic (same seed ⇒ identical metrics)
 *   - B1: higher blocked rate ⇒ higher violation density (monotonic)
 *   - B1: lower concurrency ⇒ no more contention than higher concurrency
 *   - B1: simulation receipts use the real schema, flagged isSimulation:true
 *   - B3: safe concurrency limit is found; empty corpus ⇒ insufficient-evidence
 *   - never throws on empty / garbage input
 *
 * Run with:  node --test scripts/unit-swarm-society-simulation.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib"
);

const sim = await import(pathToFileURL(path.join(kitRoot, "swarm-society-simulation.js")).href);
const {
  SOCIETY_KIND,
  PREDICTABILITY_KIND,
  deriveSwarmBehaviorProfiles,
  simulateSwarmSociety,
  findSafeConcurrency,
  deriveSwarmPredictabilityReport,
} = sim;

// Build a receipt the way the shipped Agent Outcome Loop writes them.
function receipt(actor, lane, outcomeStatus, createdAt, extra = {}) {
  return { receiptId: `r-${createdAt}`, kind: "agent-outcome", actor, lane, outcomeStatus, createdAt, ...extra };
}

function configWithObjects(n) {
  return { dataModel: { objects: Array.from({ length: n }, (_, i) => ({ id: `obj-${i}`, objectType: "data-source", rows: [] })) } };
}

test("B2: behavior profiling learns rates per actor", () => {
  const receipts = [
    receipt("support", "untrusted-direct", "blocked", "2026-01-01T00:00:00Z", { nextActions: ["fix the scope"] }),
    receipt("support", "untrusted-direct", "tested", "2026-01-01T00:01:00Z"),
    receipt("support", "execution-proof", "tested", "2026-01-01T00:02:00Z"),
    receipt("support", "untrusted-direct", "failed", "2026-01-01T00:03:00Z"),
  ];
  const { profiles, global } = deriveSwarmBehaviorProfiles(receipts);
  const support = profiles.find((p) => p.key === "support");
  assert.equal(support.actionCount, 4);
  assert.equal(support.blockedRate, 0.25);
  assert.equal(support.failureRate, 0.25);
  assert.equal(support.repairTriggerRate, 0.25);
  assert.ok(global.receiptCount === 4);
  assert.ok(global.fidelity > 0 && global.fidelity < 1);
});

test("B2: route-shopping is detected as blocked-PATCH → sandbox-run sequence", () => {
  // A blocked untrusted-direct (PATCH) immediately followed by an
  // execution-proof (sandbox-run) attempt by the SAME actor = route-shopping.
  const shopper = [
    receipt("rogue", "untrusted-direct", "blocked", "2026-01-01T00:00:00Z"),
    receipt("rogue", "execution-proof", "tested", "2026-01-01T00:00:01Z"),
    receipt("rogue", "untrusted-direct", "blocked", "2026-01-01T00:00:02Z"),
    receipt("rogue", "execution-proof", "tested", "2026-01-01T00:00:03Z"),
  ];
  const { profiles } = deriveSwarmBehaviorProfiles(shopper);
  assert.equal(profiles[0].routeShoppingRate, 1, "every blocked PATCH was followed by a sandbox-run");

  // A compliant actor whose blocked PATCH is NOT followed by a sandbox-run.
  const compliant = [
    receipt("good", "untrusted-direct", "blocked", "2026-01-01T00:00:00Z"),
    receipt("good", "untrusted-direct", "tested", "2026-01-01T00:00:01Z"),
  ];
  const { profiles: p2 } = deriveSwarmBehaviorProfiles(compliant);
  assert.equal(p2[0].routeShoppingRate, 0, "no route-shopping when blocked PATCH is retried in-lane");
});

test("B1: simulation is deterministic for a fixed seed", () => {
  const profiles = [{ key: "a", blockedRate: 0.2, failureRate: 0.05, repairTriggerRate: 0.6, routeShoppingRate: 0.3 }];
  const env = { objectIds: ["x", "y", "z"] };
  const a = simulateSwarmSociety({ profiles, environment: env, options: { agents: 6, tasksPerAgent: 8, seed: 11 } });
  const b = simulateSwarmSociety({ profiles, environment: env, options: { agents: 6, tasksPerAgent: 8, seed: 11 } });
  assert.equal(a.kind, SOCIETY_KIND);
  assert.deepEqual(a.metrics, b.metrics);
  assert.deepEqual(a.contentionHotspots, b.contentionHotspots);
});

test("B1: higher blocked rate ⇒ higher violation density (monotonic)", () => {
  const env = { objectIds: ["x", "y", "z", "w"] };
  const low = simulateSwarmSociety({ profiles: [{ key: "lo", blockedRate: 0.05, failureRate: 0, repairTriggerRate: 0.8, routeShoppingRate: 0.1 }], environment: env, options: { agents: 8, tasksPerAgent: 20, seed: 3 } });
  const high = simulateSwarmSociety({ profiles: [{ key: "hi", blockedRate: 0.6, failureRate: 0, repairTriggerRate: 0.8, routeShoppingRate: 0.5 }], environment: env, options: { agents: 8, tasksPerAgent: 20, seed: 3 } });
  assert.ok(high.metrics.violationDensity > low.metrics.violationDensity, `${high.metrics.violationDensity} > ${low.metrics.violationDensity}`);
});

test("B1: simulation receipts use the real schema flagged isSimulation:true", () => {
  const out = simulateSwarmSociety({ profiles: [{ key: "a", blockedRate: 0.5, failureRate: 0.1, repairTriggerRate: 0.5, routeShoppingRate: 0.5 }], environment: { objectIds: ["x", "y"] }, options: { agents: 4, tasksPerAgent: 6, seed: 1 } });
  assert.ok(out.sampleReceipts.length > 0);
  for (const r of out.sampleReceipts) {
    assert.equal(r.isSimulation, true);
    assert.ok(["untrusted-direct", "execution-proof"].includes(r.lane));
    assert.ok(typeof r.outcomeStatus === "string");
    assert.ok(Array.isArray(r.objectRefs) && r.objectRefs[0].objectId);
  }
});

test("B1: lower concurrency yields no more contention than higher concurrency", () => {
  const profiles = [{ key: "a", blockedRate: 0.1, failureRate: 0.05, repairTriggerRate: 0.7, routeShoppingRate: 0.2 }];
  const env = { objectIds: ["x", "y"] };
  const serial = simulateSwarmSociety({ profiles, environment: env, options: { agents: 8, tasksPerAgent: 10, concurrency: 1, seed: 9 } });
  const parallel = simulateSwarmSociety({ profiles, environment: env, options: { agents: 8, tasksPerAgent: 10, concurrency: 8, seed: 9 } });
  const sum = (h) => h.reduce((s, x) => s + x.contention, 0);
  assert.equal(sum(serial.contentionHotspots), 0, "concurrency 1 ⇒ no same-tick contention");
  assert.ok(sum(parallel.contentionHotspots) >= sum(serial.contentionHotspots));
});

test("B3: predictability report finds a safe concurrency and reports verdict", () => {
  const receipts = [];
  for (let i = 0; i < 40; i += 1) {
    receipts.push(receipt("agent", "untrusted-direct", i % 10 === 0 ? "blocked" : "tested", `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`, i % 10 === 0 ? { nextActions: ["repair"] } : {}));
  }
  const report = deriveSwarmPredictabilityReport({ receipts, workspaceConfig: configWithObjects(5), options: { agents: 6, tasksPerAgent: 10, seed: 2 } });
  assert.equal(report.kind, PREDICTABILITY_KIND);
  assert.ok(report.safeConcurrency >= 1 && report.safeConcurrency <= 6);
  assert.ok(Array.isArray(report.concurrencyLadder) && report.concurrencyLadder.length === 6);
  assert.ok(["safe-to-clone", "review-before-clone", "unsafe-diverging"].includes(report.verdict));
  assert.ok(report.behaviorProfiles.length >= 1);
  // Closed-loop CTA: a concrete next action accompanies every verdict.
  assert.ok(typeof report.nextAction === "string" && report.nextAction.length > 0);
});

test("B3: empty corpus ⇒ insufficient-evidence verdict", () => {
  const report = deriveSwarmPredictabilityReport({ receipts: [], workspaceConfig: configWithObjects(3), options: { agents: 4, tasksPerAgent: 5 } });
  assert.equal(report.verdict, "insufficient-evidence");
  assert.equal(report.global.receiptCount, 0);
  assert.match(report.rationale, /No recorded agent-outcome receipts/i);
  assert.match(report.nextAction, /receipts/i);
});

test("never throws on empty / garbage input", () => {
  for (const bad of [undefined, {}, { receipts: "x" }, { receipts: [null, 1, "y"], workspaceConfig: "z" }]) {
    const report = deriveSwarmPredictabilityReport(bad);
    assert.equal(report.kind, PREDICTABILITY_KIND);
    assert.ok(typeof report.verdict === "string");
  }
  assert.deepEqual(deriveSwarmBehaviorProfiles(null).profiles, []);
  const empty = simulateSwarmSociety({});
  assert.ok(empty.metrics.totalActions >= 0);
});
