#!/usr/bin/env node
/**
 * Unit coverage for Workspace Causal Simulation V1 — the pure, deterministic
 * predictive deriver (lib/workspace-simulation.js).
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install). Verifies:
 *
 *   - seeded RNG is deterministic (reproducible "simulated realities")
 *   - collectRunEvidence derives Laplace-smoothed priors from recorded runs
 *   - predictFromSteps: already-complete use case → certain, no drivers
 *   - sequential reliability P(complete) = Π p(step)
 *   - Monte-Carlo completion rate tracks the analytic prediction
 *   - blocked steps are gated lower and surface as "prerequisite" drivers
 *   - causal drivers rank by counterfactual marginal lift
 *   - same seed ⇒ identical distribution; trials clamp to bounds
 *   - deriveWorkspaceSimulation never throws and returns the typed envelope
 *     on blank / garbage input
 *
 * Run with:  node --test scripts/unit-workspace-simulation.test.mjs
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

const sim = await import(pathToFileURL(path.join(kitRoot, "workspace-simulation.js")).href);
const {
  SIMULATION_KIND,
  deriveWorkspaceSimulation,
  predictFromSteps,
  collectRunEvidence,
  stepSuccessProbability,
  makeRng,
} = sim;

// Recorded-run evidence helper: a config with N ok and M failed sandbox runs.
function configWithRuns(ok, failed, rewardScores = []) {
  const rows = [];
  for (let i = 0; i < ok; i += 1) {
    rows.push({ Name: `ok-${i}`, lastResponse: JSON.stringify({ exitCode: 0 }) });
  }
  for (let i = 0; i < failed; i += 1) {
    rows.push({ Name: `fail-${i}`, lastResponse: JSON.stringify({ exitCode: 1, error: "boom" }) });
  }
  rewardScores.forEach((score, i) => {
    rows.push({ Name: `rw-${i}`, lastResponse: JSON.stringify({ exitCode: 0, swarm: { reward: { score } } }) });
  });
  return { dataModel: { objects: [{ objectType: "sandbox-environment", rows }] } };
}

const HIGH_EVIDENCE = collectRunEvidence(configWithRuns(9, 1)); // baseSuccess ≈ 0.833

test("makeRng is deterministic for a given seed", () => {
  const a = makeRng(7);
  const b = makeRng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const c = makeRng(8);
  assert.notDeepEqual([c(), c(), c()], [a(), a(), a()]);
});

test("collectRunEvidence derives Laplace-smoothed priors + mean reward", () => {
  const none = collectRunEvidence({});
  assert.equal(none.runs, 0);
  assert.equal(none.baseSuccess, 0.5, "zero evidence ⇒ 0.5 prior, never 0 or 1");

  const ev = collectRunEvidence(configWithRuns(3, 1, [0.8, 0.6]));
  assert.equal(ev.okRuns, 3 + 2, "reward rows count as ok runs (exitCode 0)");
  assert.equal(ev.failedRuns, 1);
  assert.equal(ev.rewardSamples, 2);
  assert.equal(ev.meanReward, 0.7);
  // (5 + 1) / (6 + 2) = 0.75
  assert.equal(ev.baseSuccess, 0.75);
});

test("already-complete use case → certain prediction, no drivers", () => {
  const steps = [
    { id: "a", label: "A", status: "complete" },
    { id: "b", label: "B", status: "optional" },
  ];
  const out = predictFromSteps(steps, HIGH_EVIDENCE, { trials: 200, seed: 1 });
  assert.equal(out.incompleteCount, 0);
  assert.equal(out.prediction.successProbability, 1);
  assert.equal(out.prediction.completionRate, 1);
  assert.equal(out.prediction.confidence, 1);
  assert.equal(out.prediction.expectedOutcome, "complete");
  assert.equal(out.drivers.length, 0);
  assert.equal(out.trajectory.predictedStepsToComplete, 0);
  assert.ok(out.trajectory.steps.every((s) => s.predictedStatus === "done"));
});

test("sequential reliability: P(complete) = product of per-step probabilities", () => {
  const steps = [
    { id: "s1", label: "S1", status: "pending" },
    { id: "s2", label: "S2", status: "pending" },
    { id: "s3", label: "S3", status: "pending" },
  ];
  const p = stepSuccessProbability(steps[0], HIGH_EVIDENCE);
  const out = predictFromSteps(steps, HIGH_EVIDENCE, { trials: 1, seed: 1 });
  assert.ok(Math.abs(out.prediction.successProbability - p ** 3) < 1e-4, `expected ${p ** 3}, got ${out.prediction.successProbability}`);
});

test("Monte-Carlo completion rate tracks the analytic prediction", () => {
  const steps = [
    { id: "s1", label: "S1", status: "pending" },
    { id: "s2", label: "S2", status: "pending" },
  ];
  const out = predictFromSteps(steps, HIGH_EVIDENCE, { trials: 4000, seed: 42 });
  const gap = Math.abs(out.distribution.completionRate - out.prediction.successProbability);
  assert.ok(gap < 0.05, `MC (${out.distribution.completionRate}) should track analytic (${out.prediction.successProbability}); gap ${gap}`);
  // depth histogram spans 0..n and sums to trials
  assert.equal(out.distribution.depthHistogram.length, 3);
  assert.equal(out.distribution.depthHistogram.reduce((a, b) => a + b, 0), 4000);
});

test("blocked step is gated lower and surfaces as a 'prerequisite' driver", () => {
  const steps = [
    { id: "gate", label: "Gate", status: "blocked" },
    { id: "next", label: "Next", status: "pending" },
  ];
  const out = predictFromSteps(steps, HIGH_EVIDENCE, { trials: 200, seed: 1 });
  const gateProb = stepSuccessProbability(steps[0], HIGH_EVIDENCE);
  const nextProb = stepSuccessProbability(steps[1], HIGH_EVIDENCE);
  assert.ok(gateProb < nextProb, "blocked step is harder than a pending step");
  const gateDriver = out.drivers.find((d) => d.stepId === "gate");
  assert.equal(gateDriver.kind, "prerequisite");
  // Lower-probability step has the larger counterfactual lift ⇒ ranked first.
  assert.equal(out.drivers[0].stepId, "gate");
});

test("drivers rank by counterfactual marginal lift (impact = Π/p − Π)", () => {
  const steps = [
    { id: "easy", label: "Easy", status: "pending" },
    { id: "hard", label: "Hard", status: "blocked" },
  ];
  const out = predictFromSteps(steps, HIGH_EVIDENCE, { trials: 1, seed: 1 });
  const pEasy = stepSuccessProbability(steps[0], HIGH_EVIDENCE);
  const pHard = stepSuccessProbability(steps[1], HIGH_EVIDENCE);
  const base = pEasy * pHard;
  const hard = out.drivers.find((d) => d.stepId === "hard");
  assert.ok(Math.abs(hard.impact - (base / pHard - base)) < 1e-4);
  assert.equal(out.drivers[0].stepId, "hard", "the harder gate is the top driver");
});

test("same seed ⇒ identical distribution; trials clamp to [1,5000]", () => {
  const steps = [{ id: "s", label: "S", status: "pending" }];
  const a = predictFromSteps(steps, HIGH_EVIDENCE, { trials: 300, seed: 5 });
  const b = predictFromSteps(steps, HIGH_EVIDENCE, { trials: 300, seed: 5 });
  assert.deepEqual(a.distribution.depthHistogram, b.distribution.depthHistogram);
  // clamp
  assert.equal(predictFromSteps(steps, HIGH_EVIDENCE, { trials: 0 }).distribution.trials, 1);
  assert.equal(predictFromSteps(steps, HIGH_EVIDENCE, { trials: 999999 }).distribution.trials, 5000);
});

test("deriveWorkspaceSimulation never throws and returns the typed envelope", () => {
  for (const input of [undefined, {}, { workspaceConfig: null }, { workspaceConfig: "garbage" }, configWithRuns(2, 0) && { workspaceConfig: configWithRuns(2, 0) }]) {
    const out = deriveWorkspaceSimulation(input, { lensId: "activation", trials: 50, seed: 1 });
    assert.equal(out.kind, SIMULATION_KIND);
    assert.equal(out.version, 1);
    assert.ok(out.target && typeof out.target.lensId === "string");
    assert.ok(out.prediction && typeof out.prediction.successProbability === "number");
    assert.ok(Array.isArray(out.drivers));
    assert.ok(out.trajectory && Array.isArray(out.trajectory.steps));
    assert.ok(out.distribution && Array.isArray(out.distribution.depthHistogram));
    assert.ok(out.evidence && typeof out.evidence.baseSuccess === "number");
    assert.ok(typeof out.prediction.rationale === "string" && out.prediction.rationale.length > 0);
  }
});

test("unknown lensId falls back to activation (deriver stays addressable)", () => {
  const out = deriveWorkspaceSimulation({ workspaceConfig: {} }, { lensId: "does-not-exist" });
  assert.equal(out.target.lensId, "activation");
});