#!/usr/bin/env node
/**
 * Unit coverage for the CEO cockpit projection
 * (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1 + CEO_PRIMITIVE_COCKPIT_ROADMAP_V1).
 *
 * Verifies deriveCeoCockpit:
 *   - empty / malformed config never throws and yields an empty fleet
 *   - a runnable swarm row projects as a never-run report with a swarm-run
 *     next-action artifact (the hand-off back to Background Tasks)
 *   - a row with no execution target projects as blocked
 *   - attention priority is failing > blocked > never-run; healthy fleets
 *     surface no attention
 *   - the next-action artifact always routes to the EXISTING swarm-run surface
 *     (no new route/object)
 *   - the receipt stream is folded into a governance rollup (blocked attempts)
 *
 * Run with:  node --test scripts/unit-ceo-cockpit-console.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib"
);

const ceoModule = await import(pathToFileURL(path.join(kitLib, "ceo-cockpit-console.js")).href);
const graphModule = await import(pathToFileURL(path.join(kitLib, "orchestration-graph.js")).href);
const { deriveCeoCockpit } = ceoModule;
const { buildDefaultAgentSwarmGraph } = graphModule;

function swarmGraphJson() {
  return JSON.stringify(
    buildDefaultAgentSwarmGraph({
      orchestratorPrompt: "Plan the work.",
      subagents: [
        { id: "a", role: "Researcher", taskPrompt: "Research." },
        { id: "b", role: "Analyst", taskPrompt: "Analyze." },
      ],
      maxConcurrency: 2,
    })
  );
}

// A governed swarm-workflows object holding the given rows.
function configWith(rows) {
  return {
    dataModel: {
      objects: [
        { id: "swarm-workflows", label: "Swarm Workflows", objectType: "sandbox-environment", rows },
      ],
    },
  };
}

function row(overrides = {}) {
  return {
    Name: "wf",
    adapter: "local-intelligence",
    runLocality: "local",
    lifecycleStatus: "draft",
    version: "1",
    orchestrationConfig: swarmGraphJson(),
    ...overrides,
  };
}

test("empty config yields an empty fleet and never throws", () => {
  for (const input of [undefined, {}, { dataModel: null }, { dataModel: { objects: "nope" } }]) {
    const model = deriveCeoCockpit({ workspaceConfig: input });
    assert.equal(model.title, "CEO Cockpit");
    assert.equal(model.fleet.total, 0);
    assert.equal(model.attention, null);
    assert.deepEqual(model.reports, []);
    assert.equal(model.governance.blockedAttempts, 0);
  }
});

test("a runnable, never-run swarm row projects as never-run with a swarm-run artifact", () => {
  const model = deriveCeoCockpit({ workspaceConfig: configWith([row({ Name: "alpha" })]) });
  assert.equal(model.fleet.total, 1);
  assert.equal(model.fleet.runnable, 1);
  assert.equal(model.fleet.blocked, 0);
  const r = model.reports[0];
  assert.equal(r.name, "alpha");
  assert.equal(r.state, "never-run");
  assert.equal(r.variant, "pending");
  assert.equal(r.readiness.ready, true);
  // Hand-off routes to the EXISTING Background Tasks surface — no new route.
  assert.equal(r.nextAction.artifact.surface, "swarm-run");
  assert.equal(r.nextAction.artifact.objectId, "swarm-workflows");
  assert.equal(r.nextAction.artifact.name, "alpha");
  // never-run is the only actionable item → it becomes the attention pick.
  assert.equal(model.attention.name, "alpha");
});

test("a row without a local execution target projects as blocked", () => {
  const model = deriveCeoCockpit({
    workspaceConfig: configWith([row({ Name: "beta", runLocality: "serverless" })]),
  });
  const r = model.reports[0];
  assert.equal(r.state, "blocked");
  assert.equal(r.variant, "canceled");
  assert.equal(r.readiness.ready, false);
  assert.equal(model.fleet.blocked, 1);
  assert.equal(model.fleet.runnable, 0);
  assert.equal(model.attention.name, "beta");
});

test("attention priority is failing > blocked > never-run", () => {
  const failingRecord = JSON.stringify({ exitCode: 1, swarm: { tasks: [{ status: "failed" }] } });
  const model = deriveCeoCockpit({
    workspaceConfig: configWith([
      row({ Name: "ok-never-run" }),
      row({ Name: "blocked-one", runLocality: "serverless" }),
      row({ Name: "failed-one", lastResponse: failingRecord }),
    ]),
  });
  const byName = Object.fromEntries(model.reports.map((r) => [r.name, r]));
  assert.equal(byName["failed-one"].state, "failing");
  assert.equal(byName["blocked-one"].state, "blocked");
  assert.equal(byName["ok-never-run"].state, "never-run");
  // failing outranks blocked outranks never-run.
  assert.equal(model.attention.name, "failed-one");
  assert.equal(model.fleet.failing, 1);
  assert.equal(model.fleet.blocked, 1);
  assert.equal(model.fleet.neverRun, 1);
});

test("a healthy completed fleet surfaces no attention", () => {
  const completedRecord = JSON.stringify({ exitCode: 0, swarm: { tasks: [{ status: "completed" }] } });
  const model = deriveCeoCockpit({
    workspaceConfig: configWith([row({ Name: "done", lastResponse: completedRecord })]),
  });
  assert.equal(model.reports[0].state, "completed");
  assert.equal(model.reports[0].variant, "ok");
  assert.equal(model.fleet.completed, 1);
  assert.equal(model.attention, null);
});

test("receipts fold into a governance rollup", () => {
  const receipts = [
    { outcomeStatus: "blocked" },
    { outcomeStatus: "applied" },
    { outcomeStatus: "blocked" },
  ];
  const model = deriveCeoCockpit({ workspaceConfig: configWith([row()]), receipts });
  assert.equal(model.governance.blockedAttempts, 2);
  assert.equal(model.generatedFromReceipts, true);
});

test("duplicate workflow names get distinct reportIds and none is dropped", () => {
  const failed = JSON.stringify({ exitCode: 1, swarm: { tasks: [{ status: "failed" }] } });
  const model = deriveCeoCockpit({
    workspaceConfig: configWith([
      row({ Name: "dup", lastResponse: failed }), // failing → attention pick
      row({ Name: "dup" }),                         // ready, never-run duplicate name
    ]),
  });
  assert.equal(model.reports.length, 2);
  // Stable, collision-proof identity.
  const ids = new Set(model.reports.map((r) => r.reportId));
  assert.equal(ids.size, 2);
  // The component filters the fleet by reportId, not name — the non-attention
  // duplicate must survive (with name filtering it would vanish).
  const attention = model.attention;
  assert.equal(attention.name, "dup");
  const others = model.reports.filter((r) => r.reportId !== attention.reportId);
  assert.equal(others.length, 1);
  assert.equal(others[0].name, "dup");
});
