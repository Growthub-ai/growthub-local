#!/usr/bin/env node
/**
 * Unit coverage for the CEO bootstrap projection + governed completion builder
 * (CEO_PRIMITIVE_COCKPIT_ROADMAP_V1 — the first-use closed-loop harness).
 *
 * Verifies deriveCeoBootstrapState + buildCeoBootstrapCompletion:
 *   - no swarms / no marker → mode "bootstrap"
 *   - a completion marker on the helper row → mode "operational"
 *   - a swarm missing its execution target → readiness step blocked
 *   - a ready, never-run swarm → launch step ready
 *   - a failed run → review step blocked (failure is not success)
 *   - a ready + completed-run swarm → the complete step is "ready" and the
 *     governed completion stamps the marker (then flips to operational)
 *   - completion refuses unless the loop is config-provably done
 *   - completion is idempotent and needs a helper row
 *   - malformed config/receipts never throw; no fake telemetry
 *
 * Run with:  node --test scripts/unit-ceo-bootstrap-console.test.mjs
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

const mod = await import(pathToFileURL(path.join(kitLib, "ceo-bootstrap-console.js")).href);
const graphModule = await import(pathToFileURL(path.join(kitLib, "orchestration-graph.js")).href);
const {
  deriveCeoBootstrapState,
  buildCeoBootstrapCompletion,
  CEO_BOOTSTRAP_MARKER_FIELD,
} = mod;
const { buildDefaultAgentSwarmGraph } = graphModule;

function swarmGraphJson() {
  return JSON.stringify(
    buildDefaultAgentSwarmGraph({
      orchestratorPrompt: "Plan the work.",
      subagents: [{ id: "a", role: "Researcher", taskPrompt: "Research." }],
      maxConcurrency: 1,
    })
  );
}

function helperRow(extra = {}) {
  // A "live" workspace-helper row → deriveHelperWidgetCausationState ready.
  return { Name: "workspace-helper", lifecycleStatus: "live", runLocality: "local", adapter: "local-intelligence", ...extra };
}

function swarmRow(extra = {}) {
  return { Name: "wf", adapter: "local-intelligence", runLocality: "local", orchestrationConfig: swarmGraphJson(), ...extra };
}

function config({ helper = helperRow(), swarms = [] } = {}) {
  const objects = [];
  if (helper) objects.push({ id: "workspace-helper-sandbox", label: "Workspace Helper", objectType: "sandbox-environment", rows: [helper] });
  objects.push({ id: "swarm-workflows", label: "Swarm Workflows", objectType: "sandbox-environment", rows: swarms });
  return { dataModel: { objects } };
}

const COMPLETED_RUN = JSON.stringify({ exitCode: 0, swarm: { tasks: [{ status: "completed" }] } });
const FAILED_RUN = JSON.stringify({ exitCode: 1, swarm: { tasks: [{ status: "failed" }] } });

function step(model, id) {
  return model.checklist.find((c) => c.id === id);
}

test("no swarms and no marker → bootstrap mode", () => {
  const model = deriveCeoBootstrapState({ workspaceConfig: config({ swarms: [] }) });
  assert.equal(model.mode, "bootstrap");
  assert.equal(model.completed, false);
  assert.equal(model.completionRef, null);
  assert.equal(step(model, "mental-model").status, "complete");
  // helper is live but no swarm yet → "create" step is ready (actionable).
  assert.equal(step(model, "swarm-workflow").status, "ready");
  assert.equal(model.primaryAction.kind, "seed-swarm");
});

test("a completion marker on the helper row → operational mode", () => {
  const cfg = config({ helper: helperRow({ [CEO_BOOTSTRAP_MARKER_FIELD]: "2026-06-14T00:00:00.000Z" }), swarms: [swarmRow()] });
  const model = deriveCeoBootstrapState({ workspaceConfig: cfg });
  assert.equal(model.mode, "operational");
  assert.equal(model.completed, true);
  assert.equal(model.completionRef.completedAt, "2026-06-14T00:00:00.000Z");
});

test("swarm without a local execution target → readiness blocked", () => {
  const model = deriveCeoBootstrapState({ workspaceConfig: config({ swarms: [swarmRow({ runLocality: "serverless" })] }) });
  assert.equal(step(model, "swarm-workflow").status, "complete");
  assert.equal(step(model, "readiness").status, "blocked");
  assert.equal(step(model, "complete").status, "pending");
});

test("ready, never-run swarm → launch ready", () => {
  const model = deriveCeoBootstrapState({ workspaceConfig: config({ swarms: [swarmRow()] }) });
  assert.equal(step(model, "readiness").status, "complete");
  assert.equal(step(model, "launch").status, "ready");
  assert.equal(step(model, "launch").nextAction.kind, "open");
  assert.equal(step(model, "review").status, "pending");
});

test("a failed run → review blocked, not complete", () => {
  const model = deriveCeoBootstrapState({ workspaceConfig: config({ swarms: [swarmRow({ lastResponse: FAILED_RUN })] }) });
  assert.equal(step(model, "launch").status, "complete");
  assert.equal(step(model, "observe").status, "complete");
  assert.equal(step(model, "review").status, "blocked");
  assert.equal(step(model, "complete").status, "pending");
});

test("ready + completed run → complete step ready, and completion stamps the marker", () => {
  const cfg = config({ swarms: [swarmRow({ lastResponse: COMPLETED_RUN })] });
  const model = deriveCeoBootstrapState({ workspaceConfig: cfg });
  assert.equal(step(model, "review").status, "complete");
  assert.equal(step(model, "complete").status, "ready");
  assert.equal(model.primaryAction.kind, "mark-complete");

  const result = buildCeoBootstrapCompletion({ workspaceConfig: cfg, completedAt: "2026-06-14T12:00:00.000Z", completedBy: "user" });
  assert.equal(result.ok, true);
  // The marker landed on the helper row, and the input config was not mutated.
  const after = deriveCeoBootstrapState({ workspaceConfig: result.config });
  assert.equal(after.mode, "operational");
  assert.equal(deriveCeoBootstrapState({ workspaceConfig: cfg }).mode, "bootstrap");
});

test("completion refuses when the loop is not provably done", () => {
  const cfg = config({ swarms: [swarmRow()] }); // ready but never run
  const result = buildCeoBootstrapCompletion({ workspaceConfig: cfg, completedAt: "2026-06-14T12:00:00.000Z" });
  assert.equal(result.ok, false);
  assert.match(result.error, /prerequisites not met/i);
});

test("completion is idempotent and requires a helper row", () => {
  // Already complete → idempotent ok, no change.
  const done = config({ helper: helperRow({ [CEO_BOOTSTRAP_MARKER_FIELD]: "2026-06-14T00:00:00.000Z" }), swarms: [swarmRow({ lastResponse: COMPLETED_RUN })] });
  const idem = buildCeoBootstrapCompletion({ workspaceConfig: done, completedAt: "2026-06-14T13:00:00.000Z" });
  assert.equal(idem.ok, true);

  // No helper row → cannot stamp.
  const noHelper = config({ helper: null, swarms: [swarmRow({ lastResponse: COMPLETED_RUN })] });
  const res = buildCeoBootstrapCompletion({ workspaceConfig: noHelper, completedAt: "2026-06-14T12:00:00.000Z" });
  assert.equal(res.ok, false);
  assert.match(res.error, /helper sandbox row not found/i);
});

test("malformed config / receipts never throw", () => {
  for (const input of [undefined, {}, { dataModel: null }, { dataModel: { objects: 5 } }]) {
    const model = deriveCeoBootstrapState({ workspaceConfig: input, receipts: "nope" });
    assert.equal(model.mode, "bootstrap");
    assert.ok(Array.isArray(model.checklist));
    assert.equal(typeof model.progress.total, "number");
  }
});
