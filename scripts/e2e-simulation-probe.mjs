#!/usr/bin/env node
/**
 * Adversarial probe harness for the Workspace simulation surfaces.
 *
 * In-process probes (no install, no server boot) that exercise the EXACT
 * deriver code paths the read-only routes wrap — GET /api/workspace/simulation
 * and GET /api/workspace/swarm-predictability are thin wrappers over these
 * functions, so probing the derivers atomically covers the surfaces while the
 * structural wiring tests (unit-simulation-cockpit-wiring) cover the route +
 * cockpit glue.
 *
 * Runs BOTH negative (hostile / malformed / boundary) and positive (realistic
 * seeded corpus → asserted forecast) probes against every user state, and
 * proves determinism. Exits non-zero on any failure.
 *
 * Run: node scripts/e2e-simulation-probe.mjs
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const load = (m) => import(pathToFileURL(path.join(kitLib, m)).href);

const { deriveWorkspaceSimulation } = await load("workspace-simulation.js");
const { deriveSwarmPredictabilityReport, deriveSwarmBehaviorProfiles, simulateSwarmSociety } = await load("swarm-society-simulation.js");
const { buildSimulationQuery, clampSimulationParam, verdictPresentation } = await load("simulation-cockpit-config.js");

let pass = 0;
let fail = 0;
const failures = [];
function probe(name, fn) {
  try {
    fn();
    pass += 1;
    process.stdout.write(`  ok  ${name}\n`);
  } catch (err) {
    fail += 1;
    failures.push(`${name}: ${err?.message || err}`);
    process.stdout.write(`  XX  ${name} — ${err?.message || err}\n`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// ── fixtures ────────────────────────────────────────────────────────────────
function receipt(actor, lane, outcomeStatus, createdAt, extra = {}) {
  return { receiptId: `r-${createdAt}`, kind: "agent-outcome", actor, lane, outcomeStatus, createdAt, ...extra };
}
function realisticCorpus() {
  const out = [];
  for (let i = 0; i < 60; i += 1) {
    const blocked = i % 8 === 0;
    out.push(receipt(`agent-${i % 4}`, "untrusted-direct", blocked ? "blocked" : "tested", `2026-02-01T00:${String(i).padStart(2, "0")}:00Z`, blocked ? { nextActions: ["repair scope"] } : {}));
    if (blocked && i % 16 === 0) out.push(receipt(`agent-${i % 4}`, "execution-proof", "tested", `2026-02-01T00:${String(i).padStart(2, "0")}:30Z`));
  }
  return out;
}
function realisticConfig() {
  const rows = [];
  for (let i = 0; i < 5; i += 1) rows.push({ Name: `run-${i}`, lastResponse: JSON.stringify({ exitCode: i % 5 === 0 ? 1 : 0, error: i % 5 === 0 ? "x" : "", swarm: { reward: { score: 0.6 + (i % 3) * 0.1 } } }) });
  return { dataModel: { objects: [{ id: "sandbox", objectType: "sandbox-environment", rows }] } };
}

const HOSTILE = [undefined, null, 0, "", "garbage", [], {}, { workspaceConfig: "x" }, { workspaceConfig: null }, { receipts: "nope" }, { receipts: [null, 1, "y", {}] }];
const HOSTILE_PARAMS = [{ agents: -5 }, { agents: 10 ** 9 }, { agents: "x" }, { tasksPerAgent: 0 }, { concurrency: -1 }, { seed: NaN }, { seed: "; rm -rf /" }, { trials: 10 ** 9 }];

process.stdout.write("NEGATIVE probes (hostile / malformed / boundary — must never throw):\n");

probe("deriveWorkspaceSimulation never throws on hostile input", () => {
  for (const bad of HOSTILE) {
    const out = deriveWorkspaceSimulation(bad, {});
    assert(out && out.kind === "growthub-workspace-simulation-v1", "typed envelope");
    assert(typeof out.prediction.successProbability === "number", "numeric prediction");
    assert(Array.isArray(out.drivers) && Array.isArray(out.trajectory.steps), "arrays present");
  }
});

probe("deriveSwarmPredictabilityReport never throws on hostile input", () => {
  for (const bad of HOSTILE) {
    const out = deriveSwarmPredictabilityReport(bad);
    assert(out && out.kind === "growthub-swarm-predictability-report-v1", "typed envelope");
    assert(typeof out.verdict === "string", "verdict string");
  }
});

probe("empty corpus ⇒ insufficient-evidence (no false confidence)", () => {
  const out = deriveSwarmPredictabilityReport({ receipts: [], workspaceConfig: realisticConfig() });
  assert(out.verdict === "insufficient-evidence", `got ${out.verdict}`);
  assert(out.global.receiptCount === 0, "zero corpus");
});

probe("hostile simulation params are clamped, never crash", () => {
  for (const p of HOSTILE_PARAMS) {
    const out = deriveSwarmPredictabilityReport({ receipts: realisticCorpus(), workspaceConfig: realisticConfig(), options: p });
    assert(out.simulation.config.agents >= 1 && out.simulation.config.agents <= 512, "agents clamped");
    assert(out.simulation.config.tasksPerAgent >= 1, "tasks clamped");
  }
});

probe("buildSimulationQuery sanitizes injection-shaped values to clamped ints", () => {
  const q = buildSimulationQuery({ agents: "8; DROP", seed: "<script>", concurrency: -9, tasksPerAgent: 10 ** 9 });
  assert(/agents=8\b/.test(q) || /agents=1\b/.test(q), "agents numeric");
  assert(/seed=1\b/.test(q), "non-numeric seed → fallback");
  assert(/concurrency=1\b/.test(q), "negative concurrency → min");
  assert(/tasksPerAgent=5000\b/.test(q), "huge tasks → max");
  assert(!/script|DROP/.test(q), "no raw injection survives");
});

probe("malformed receipt entries are tolerated by profiling", () => {
  const { profiles, global } = deriveSwarmBehaviorProfiles([null, 1, "x", {}, receipt("a", "untrusted-direct", "blocked", "2026-01-01T00:00:00Z")]);
  assert(Array.isArray(profiles), "profiles array");
  assert(global.receiptCount === 1, `only the valid receipt counts, got ${global.receiptCount}`);
});

process.stdout.write("\nPOSITIVE probes (realistic corpus → asserted forecast):\n");

probe("predictability report on a realistic corpus is well-formed", () => {
  const out = deriveSwarmPredictabilityReport({ receipts: realisticCorpus(), workspaceConfig: realisticConfig(), options: { agents: 6, tasksPerAgent: 12, seed: 3 } });
  assert(["safe-to-clone", "review-before-clone", "unsafe-diverging"].includes(out.verdict), `verdict ${out.verdict}`);
  assert(out.safeConcurrency >= 1 && out.safeConcurrency <= 6, "safe concurrency in range");
  assert(out.concurrencyLadder.length === 6, "ladder spans population");
  assert(out.behaviorProfiles.length >= 1, "profiles learned");
  assert(out.global.fidelity > 0 && out.global.fidelity < 1, "fidelity bounded");
  assert(out.expectedViolationRatePer1000 >= 0, "violation density non-negative");
});

probe("every verdict carries a concrete, customer-language next action (closed loop)", () => {
  // insufficient
  const none = deriveSwarmPredictabilityReport({ receipts: [], workspaceConfig: realisticConfig() });
  assert(typeof none.nextAction === "string" && /receipts/i.test(none.nextAction), "insufficient → gather receipts");
  // realistic corpus always yields an actionable next move tied to safe concurrency
  const out = deriveSwarmPredictabilityReport({ receipts: realisticCorpus(), workspaceConfig: realisticConfig(), options: { agents: 6, tasksPerAgent: 12, seed: 3 } });
  assert(typeof out.nextAction === "string" && out.nextAction.length > 0, "next action present");
  assert(out.nextAction.includes(String(out.safeConcurrency)) || /clone/i.test(out.nextAction), "next action references concurrency/clone");
});

probe("route-shopping is detected from a blocked-PATCH → sandbox-run sequence", () => {
  const { profiles } = deriveSwarmBehaviorProfiles([
    receipt("rogue", "untrusted-direct", "blocked", "2026-01-01T00:00:00Z"),
    receipt("rogue", "execution-proof", "tested", "2026-01-01T00:00:01Z"),
  ]);
  assert(profiles[0].routeShoppingRate === 1, "route-shopping detected");
});

probe("workspace simulation forecasts a use case with finite, bounded fields", () => {
  const out = deriveWorkspaceSimulation({ workspaceConfig: realisticConfig() }, { lensId: "activation", trials: 200, seed: 5 });
  assert(out.prediction.successProbability >= 0 && out.prediction.successProbability <= 1, "prob in [0,1]");
  assert(out.distribution.depthHistogram.reduce((a, b) => a + b, 0) === 200, "histogram sums to trials");
  assert(["complete", "likely-complete", "blocked-pending-prerequisite", "uncertain"].includes(out.prediction.expectedOutcome), "valid outcome");
});

probe("verdictPresentation covers every verdict + unknown", () => {
  for (const v of ["safe-to-clone", "review-before-clone", "unsafe-diverging", "insufficient-evidence", "???"]) {
    const p = verdictPresentation(v);
    assert(["ok", "active", "fail", "pending"].includes(p.variant), `variant for ${v}`);
    assert(typeof p.label === "string" && p.label.length > 0, "label");
  }
});

process.stdout.write("\nDETERMINISM probes (seeded ⇒ perfectly replayable):\n");

probe("same seed ⇒ byte-identical predictability report", () => {
  const args = { receipts: realisticCorpus(), workspaceConfig: realisticConfig(), options: { agents: 8, tasksPerAgent: 20, seed: 99 } };
  const a = JSON.stringify(deriveSwarmPredictabilityReport(args));
  const b = JSON.stringify(deriveSwarmPredictabilityReport(args));
  assert(a === b, "reports diverged across identical seeded runs");
});

probe("different seed ⇒ a different simulated reality (not frozen)", () => {
  const base = { receipts: realisticCorpus(), workspaceConfig: realisticConfig() };
  const a = simulateSwarmSociety({ ...deriveSwarmBehaviorProfiles(base.receipts), environment: { objectIds: ["a", "b", "c"] }, options: { agents: 8, tasksPerAgent: 30, seed: 1 } });
  const b = simulateSwarmSociety({ ...deriveSwarmBehaviorProfiles(base.receipts), environment: { objectIds: ["a", "b", "c"] }, options: { agents: 8, tasksPerAgent: 30, seed: 2 } });
  assert(JSON.stringify(a.contentionHotspots) !== JSON.stringify(b.contentionHotspots) || a.metrics.ticks !== b.metrics.ticks || JSON.stringify(a.metrics) !== JSON.stringify(b.metrics), "seeds produced identical worlds");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  process.stdout.write(`\nFAILURES:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("simulation probe: ALL GREEN\n");
