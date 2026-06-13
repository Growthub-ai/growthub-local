#!/usr/bin/env node
/**
 * Unit coverage for the shared Simulation Cockpit configuration
 * (lib/simulation-cockpit-config.js) — the single contract the Workspace Lens
 * action button and the /simulate helper command both drive the cockpit with.
 *
 * Run with:  node --test scripts/unit-simulation-cockpit-config.test.mjs
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

const cfg = await import(pathToFileURL(path.join(kitRoot, "simulation-cockpit-config.js")).href);
const {
  SIMULATION_VIEW,
  SIMULATION_ENDPOINT,
  SIMULATION_PARAM_FIELDS,
  DEFAULT_SIMULATION_PARAMS,
  clampSimulationParam,
  buildSimulationQuery,
  verdictPresentation,
  summarizeSimulationReport,
} = cfg;

test("view + endpoint match the shipped route contract", () => {
  assert.equal(SIMULATION_VIEW, "simulation");
  assert.equal(SIMULATION_ENDPOINT, "/api/workspace/swarm-predictability");
});

test("param fields define clamps that mirror the server deriver", () => {
  const byKey = Object.fromEntries(SIMULATION_PARAM_FIELDS.map((f) => [f.key, f]));
  assert.equal(byKey.agents.max, 512);
  assert.equal(byKey.tasksPerAgent.max, 5000);
  assert.equal(byKey.seed.min, 0);
  for (const f of SIMULATION_PARAM_FIELDS) {
    assert.equal(DEFAULT_SIMULATION_PARAMS[f.key], f.fallback);
  }
});

test("clampSimulationParam bounds and floors values", () => {
  assert.equal(clampSimulationParam("agents", 0), 1);
  assert.equal(clampSimulationParam("agents", 99999), 512);
  assert.equal(clampSimulationParam("agents", "garbage"), 8);
  assert.equal(clampSimulationParam("tasksPerAgent", 3.9), 3);
  assert.equal(clampSimulationParam("unknown", 5), 5);
});

test("buildSimulationQuery produces a clamped, complete read-only query", () => {
  const q = buildSimulationQuery({ agents: 99999, tasksPerAgent: 0, concurrency: 4, seed: 7 });
  assert.ok(q.startsWith("/api/workspace/swarm-predictability?"));
  assert.match(q, /agents=512/);
  assert.match(q, /tasksPerAgent=1/);
  assert.match(q, /concurrency=4/);
  assert.match(q, /seed=7/);
  // defaults fill missing params
  assert.match(buildSimulationQuery({}), /agents=8/);
});

test("verdictPresentation maps to the swarm cockpit dot vocabulary", () => {
  assert.deepEqual(verdictPresentation("safe-to-clone"), { variant: "ok", label: "Safe to clone", tone: "ok" });
  assert.equal(verdictPresentation("unsafe-diverging").variant, "fail");
  assert.equal(verdictPresentation("review-before-clone").variant, "active");
  assert.equal(verdictPresentation("insufficient-evidence").variant, "pending");
  assert.equal(verdictPresentation(undefined).variant, "pending");
});

test("summarizeSimulationReport is a safe one-liner", () => {
  assert.equal(summarizeSimulationReport(null), "No simulation yet.");
  const s = summarizeSimulationReport({ verdict: "safe-to-clone", expectedViolationRatePer1000: 12, safeConcurrency: 6 });
  assert.match(s, /Safe to clone/);
  assert.match(s, /12\/1k/);
  assert.match(s, /safe concurrency 6/);
});
