#!/usr/bin/env node
/**
 * Unit coverage for the Workspace State Lens layer V1 — the generalization of
 * the shipped activation derivation primitive (roadmap Items 1, 2, 3, 8).
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - lens registry exposes the activation primary + secondary lenses
 *   - persistence lens derives durability state from persistence mode + runs
 *   - observability lens rolls up sandbox run-state deltas (healthy/failing/never)
 *   - composed deriveWorkspaceState resolves one global next action
 *   - swarm condition packet composes a lens into an assignable shape
 *   - every lens is secret-safe and never throws on partial input
 *   - every lens href routes into an existing workspace surface
 *
 * Run with:  node --test scripts/unit-workspace-lenses.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const activation = await import(
  pathToFileURL(path.join(kitLib, "workspace-activation.js")).href
);

const ALLOWED_HREF = (href) =>
  href === "/"
  || href.startsWith("/?")
  || href.startsWith("/data-model")
  || href.startsWith("/workflows")
  || href.startsWith("/settings");

function statusesById(state) {
  return Object.fromEntries(state.steps.map((s) => [s.id, s.status]));
}

// ───────────────────────────────────────────────────────────────────────────
// Registry + module shape
// ───────────────────────────────────────────────────────────────────────────

test("lens layer — public API exports", () => {
  assert.equal(activation.LENS_STATE_KIND, "growthub-workspace-lens-state-v1");
  assert.equal(activation.WORKSPACE_STATE_KIND, "growthub-workspace-state-v1");
  assert.equal(activation.SWARM_PACKET_KIND, "growthub-swarm-condition-packet-v1");
  assert.equal(typeof activation.deriveWorkspaceState, "function");
  assert.equal(typeof activation.derivePersistenceLensState, "function");
  assert.equal(typeof activation.deriveObservabilityLensState, "function");
  assert.equal(typeof activation.deriveSwarmConditionPacket, "function");
  assert.ok(Array.isArray(activation.WORKSPACE_LENS_REGISTRY));
});

test("registry — exactly one primary lens and it is activation", () => {
  const primaries = activation.WORKSPACE_LENS_REGISTRY.filter((e) => e.primary);
  assert.equal(primaries.length, 1);
  assert.equal(primaries[0].id, "activation");
  const ids = activation.WORKSPACE_LENS_REGISTRY.map((e) => e.id);
  assert.deepEqual(ids, ["activation", "persistence", "observability"]);
});

test("backward compatibility — activation exports untouched", () => {
  assert.equal(typeof activation.deriveWorkspaceActivationState, "function");
  const blank = activation.deriveWorkspaceActivationState({ workspaceConfig: {} });
  assert.equal(blank.kind, "growthub-workspace-activation-state-v1");
  assert.equal(blank.template, "blank");
});

// ───────────────────────────────────────────────────────────────────────────
// Persistence lens (Item 2)
// ───────────────────────────────────────────────────────────────────────────

test("persistence lens — no signal: mode unresolved, durable store blocked", () => {
  const state = activation.derivePersistenceLensState({});
  assert.equal(state.kind, "growthub-workspace-lens-state-v1");
  assert.equal(state.lensId, "persistence");
  const byId = statusesById(state);
  assert.equal(byId["choose-persistence"], "pending");
  assert.equal(byId["enable-durable-store"], "blocked");
  assert.equal(byId["verify-run-durability"], "optional");
  assert.equal(state.totalCount, 2);
  assert.equal(state.completedCount, 0);
  assert.equal(state.complete, false);
  assert.equal(state.nextStepId, "choose-persistence");
});

test("persistence lens — read-only with runs in rows: evidence ephemeral, blocked", () => {
  const state = activation.derivePersistenceLensState({
    metadataGraph: { runtime: { persistenceMode: "read-only", allowFsWrite: false } },
    workspaceConfig: {
      dataModel: {
        objects: [
          {
            objectType: "sandbox-environment",
            rows: [{ Name: "wf", lastRunId: "run_abc", lastResponse: JSON.stringify({ exitCode: 0 }) }],
          },
        ],
      },
    },
  });
  const byId = statusesById(state);
  assert.equal(byId["choose-persistence"], "complete");
  assert.equal(byId["enable-durable-store"], "blocked");
  assert.equal(byId["verify-run-durability"], "blocked");
  assert.equal(state.nextStepId, "enable-durable-store");
});

test("persistence lens — database adapter with runs: fully durable", () => {
  const state = activation.derivePersistenceLensState({
    metadataGraph: { runtime: { persistenceMode: "database", persistenceAdapter: "postgres" } },
    workspaceConfig: {
      dataModel: {
        objects: [
          { objectType: "sandbox-environment", rows: [{ Name: "wf", lastResponse: JSON.stringify({ exitCode: 0 }) }] },
        ],
      },
    },
  });
  const byId = statusesById(state);
  assert.equal(byId["choose-persistence"], "complete");
  assert.equal(byId["enable-durable-store"], "complete");
  assert.equal(byId["verify-run-durability"], "complete");
  assert.equal(state.complete, true);
  assert.equal(state.nextStepId, null);
});

test("persistence lens — filesystem + allowFsWrite, no runs yet", () => {
  const state = activation.derivePersistenceLensState({
    metadataGraph: { runtime: { persistenceMode: "filesystem", allowFsWrite: true } },
    workspaceConfig: { dataModel: { objects: [{ objectType: "sandbox-environment", rows: [] }] } },
  });
  const byId = statusesById(state);
  assert.equal(byId["enable-durable-store"], "complete");
  assert.equal(byId["verify-run-durability"], "optional");
  assert.equal(state.complete, true);
});

// ───────────────────────────────────────────────────────────────────────────
// Observability lens (Item 3)
// ───────────────────────────────────────────────────────────────────────────

function workflowsConfig(rows) {
  return { dataModel: { objects: [{ objectType: "sandbox-environment", rows }] } };
}

test("observability lens — no workflows", () => {
  const state = activation.deriveObservabilityLensState({ workspaceConfig: workflowsConfig([]) });
  assert.equal(state.lensId, "observability");
  assert.deepEqual(state.rollup, { workflowsTotal: 0, healthy: 0, failing: 0, neverRun: 0, agents: 0 });
  assert.equal(state.nextStepId, "have-workflow");
  assert.equal(state.complete, false);
});

test("observability lens — one never-run workflow", () => {
  const state = activation.deriveObservabilityLensState({
    workspaceConfig: workflowsConfig([{ Name: "Onboarding", status: "" }]),
  });
  assert.equal(state.rollup.workflowsTotal, 1);
  assert.equal(state.rollup.neverRun, 1);
  assert.equal(statusesById(state)["have-workflow"], "complete");
  assert.equal(state.nextStepId, "first-healthy-run");
});

test("observability lens — one healthy run + agent rollup count", () => {
  const state = activation.deriveObservabilityLensState({
    workspaceConfig: workflowsConfig([{ name: "Main", lastResponse: JSON.stringify({ exitCode: 0 }) }]),
    metadataGraph: { runtime: { agents: [{ slug: "a" }, { slug: "b" }] } },
  });
  assert.equal(state.rollup.healthy, 1);
  assert.equal(state.rollup.agents, 2);
  assert.equal(state.complete, true);
  assert.equal(state.nextStepId, null);
});

test("observability lens — healthy + failing: resolve-failures blocked", () => {
  const state = activation.deriveObservabilityLensState({
    workspaceConfig: workflowsConfig([
      { name: "Healthy", lastResponse: JSON.stringify({ exitCode: 0 }) },
      { name: "Broken", lastResponse: JSON.stringify({ exitCode: 1, error: "timeout" }) },
    ]),
  });
  assert.equal(state.rollup.healthy, 1);
  assert.equal(state.rollup.failing, 1);
  assert.equal(statusesById(state)["resolve-failures"], "blocked");
  assert.equal(state.nextStepId, "resolve-failures");
  // No raw error text leaks into the rendered state.
  assert.equal(JSON.stringify(state).includes("timeout"), false);
});

// ───────────────────────────────────────────────────────────────────────────
// Composed workspace state (Item 1 keystone)
// ───────────────────────────────────────────────────────────────────────────

test("deriveWorkspaceState — composes primary + lenses and a global next action", () => {
  const state = activation.deriveWorkspaceState({ workspaceConfig: {} });
  assert.equal(state.kind, "growthub-workspace-state-v1");
  assert.equal(state.primary.kind, "growthub-workspace-activation-state-v1");
  assert.ok(state.lenses.persistence);
  assert.ok(state.lenses.observability);
  // Blank workspace isn't activated, so the global next action comes from the
  // primary activation lens.
  assert.equal(state.nextAction.lensId, "activation");
  assert.equal(state.nextAction.stepId, "create-object");
  assert.equal(state.complete, false);
});

test("deriveWorkspaceState — falls back to a secondary lens when primary is complete", () => {
  // Activation 'blank' is complete only when all 5 steps are; simulate that by
  // routing through a config that completes the primary loop but leaves a
  // secondary lens (persistence) pending.
  const cfg = {
    dataModel: {
      objects: [
        { id: "leads", objectType: "custom", rows: [] },
        {
          objectType: "sandbox-environment",
          rows: [{ Name: "wf", lastResponse: JSON.stringify({ exitCode: 0 }) }],
        },
      ],
    },
    dashboards: [{ id: "d1", name: "Overview", tabs: [{ id: "t1", widgets: [{ id: "w1", kind: "chart" }] }] }],
  };
  const state = activation.deriveWorkspaceState({ workspaceConfig: cfg });
  assert.equal(state.primary.complete, true);
  // Persistence is unresolved (no metadataGraph) → it provides the next action.
  assert.equal(state.nextAction.lensId, "persistence");
  assert.equal(state.complete, false);
});

// ───────────────────────────────────────────────────────────────────────────
// Swarm condition packet (Item 8)
// ───────────────────────────────────────────────────────────────────────────

test("swarm packet — composes the activation lens into an assignable shape", () => {
  const packet = activation.deriveSwarmConditionPacket({ workspaceConfig: {} });
  assert.equal(packet.kind, "growthub-swarm-condition-packet-v1");
  assert.equal(packet.lensId, "activation");
  assert.equal(packet.currentState, "0/5");
  assert.equal(packet.complete, false);
  assert.equal(packet.nextAction.stepId, "create-object");
  assert.ok(Array.isArray(packet.availableTools));
  assert.ok(packet.availableTools.some((t) => t.includes("PATCH /api/workspace")));
  assert.ok(Array.isArray(packet.expectedEvidence));
});

test("swarm packet — surfaces Nango + sandbox tools when present, no secrets", () => {
  const packet = activation.deriveSwarmConditionPacket({
    workspaceConfig: {
      dataModel: {
        objects: [
          { objectType: "api-registry", rows: [{ connectionIds: "SECRET_CONN" }] },
          { objectType: "sandbox-environment", rows: [{ Name: "wf" }] },
        ],
      },
    },
  });
  assert.ok(packet.availableTools.some((t) => t.includes("Nango")));
  assert.ok(packet.availableTools.some((t) => t.includes("sandbox-run")));
  assert.equal(JSON.stringify(packet).includes("SECRET_CONN"), false);
});

test("swarm packet — can target a secondary lens by id", () => {
  const packet = activation.deriveSwarmConditionPacket({}, { lensId: "persistence" });
  assert.equal(packet.lensId, "persistence");
  assert.ok(packet.blockedStep);
});

// ───────────────────────────────────────────────────────────────────────────
// Cross-cutting invariants
// ───────────────────────────────────────────────────────────────────────────

test("lenses — never throw on partial/empty input", () => {
  for (const fn of [activation.derivePersistenceLensState, activation.deriveObservabilityLensState]) {
    assert.doesNotThrow(() => fn());
    assert.doesNotThrow(() => fn({}));
    assert.doesNotThrow(() => fn({ workspaceConfig: { dataModel: null } }));
    assert.doesNotThrow(() => fn({ metadataGraph: null }));
  }
  assert.doesNotThrow(() => activation.deriveWorkspaceState());
  assert.doesNotThrow(() => activation.deriveSwarmConditionPacket());
  assert.doesNotThrow(() => activation.deriveSwarmConditionPacket({}, { lensId: "nope" }));
});

test("lenses — every step href routes into an existing workspace surface", () => {
  const inputs = [
    {},
    { metadataGraph: { runtime: { persistenceMode: "read-only" } }, workspaceConfig: workflowsConfig([{ Name: "x", lastResponse: JSON.stringify({ exitCode: 1 }) }]) },
  ];
  for (const input of inputs) {
    for (const fn of [activation.derivePersistenceLensState, activation.deriveObservabilityLensState]) {
      for (const step of fn(input).steps) {
        if (!step.href) continue;
        assert.ok(ALLOWED_HREF(step.href), `${fn.name} step ${step.id} href "${step.href}" must route into an existing surface`);
      }
    }
  }
});
