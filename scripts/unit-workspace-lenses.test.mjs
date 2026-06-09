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
  || href.startsWith("/workspace-lens")
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
  assert.equal(typeof activation.deriveDeployLensState, "function");
  assert.equal(typeof activation.deriveTaskLensState, "function");
  assert.equal(typeof activation.deriveAppBuildLensState, "function");
  assert.equal(typeof activation.deriveSwarmConditionPacket, "function");
  assert.ok(Array.isArray(activation.WORKSPACE_LENS_REGISTRY));
});

test("registry — exactly one primary lens and it is activation, stable order", () => {
  const primaries = activation.WORKSPACE_LENS_REGISTRY.filter((e) => e.primary);
  assert.equal(primaries.length, 1);
  assert.equal(primaries[0].id, "activation");
  const ids = activation.WORKSPACE_LENS_REGISTRY.map((e) => e.id);
  assert.deepEqual(ids, ["activation", "creation", "persistence", "observability", "deploy", "tasks", "app-build"]);
  // Fleet/multi-app (Item 4) is intentionally NOT registered.
  assert.equal(ids.includes("fleet"), false);
});

test("every lens emits the panel-compatible step shape", () => {
  for (const entry of activation.WORKSPACE_LENS_REGISTRY) {
    const state = entry.derive({ workspaceConfig: {} });
    assert.equal(typeof state.completedCount, "number", `${entry.id} completedCount`);
    assert.equal(typeof state.totalCount, "number", `${entry.id} totalCount`);
    assert.ok(Array.isArray(state.steps), `${entry.id} steps`);
    for (const step of state.steps) {
      assert.equal(typeof step.id, "string");
      assert.equal(typeof step.label, "string");
      assert.equal(typeof step.description, "string");
      assert.ok(["complete", "pending", "blocked", "optional"].includes(step.status), `${entry.id}/${step.id} status ${step.status}`);
    }
  }
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
  // Creation is unresolved on a blank-style config → it provides the next action before persistence.
  assert.equal(state.nextAction.lensId, "creation");
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

// ───────────────────────────────────────────────────────────────────────────
// Workspace contribution graph
// ───────────────────────────────────────────────────────────────────────────

test("contributions — empty workspace yields a full 53-week grid, zero total", () => {
  const c = activation.deriveWorkspaceContributions({}, { endDate: "2026-05-28" });
  assert.equal(c.kind, "growthub-workspace-contributions-v1");
  assert.equal(c.weeks.length, 53);
  assert.equal(c.weeks.every((w) => w.days.length === 7), true);
  assert.equal(c.total, 0);
});

test("contributions — dated run + source evidence bucket by day", () => {
  const c = activation.deriveWorkspaceContributions({
    workspaceConfig: {
      dataModel: { objects: [
        { objectType: "sandbox-environment", rows: [
          { Name: "wf", lastResponse: JSON.stringify({ exitCode: 0, ranAt: "2026-05-20T10:00:00Z" }) },
        ] },
      ] },
    },
    workspaceSourceRecords: {
      "project-active-tasks": { recordCount: 2, fetchedAt: "2026-05-20T11:00:00Z", records: [{ ranAt: "2026-05-21T09:00:00Z" }] },
    },
  }, { endDate: "2026-05-28" });
  // 2 events on 2026-05-20 (run ranAt + sidecar fetchedAt), 1 on 2026-05-21.
  assert.equal(c.total, 3);
  const flat = c.weeks.flatMap((w) => w.days);
  assert.equal(flat.find((d) => d.date === "2026-05-20").count, 2);
  assert.equal(flat.find((d) => d.date === "2026-05-21").count, 1);
  assert.ok(flat.find((d) => d.date === "2026-05-20").level > 0);
});

test("contributions — never throws, no secret values leak", () => {
  assert.doesNotThrow(() => activation.deriveWorkspaceContributions());
  assert.doesNotThrow(() => activation.deriveWorkspaceContributions({}, { endDate: "not-a-date" }));
  const c = activation.deriveWorkspaceContributions({
    workspaceConfig: { dataModel: { objects: [
      { objectType: "api-registry", rows: [{ connectionIds: "conn_SECRET", lastTested: "2026-05-19T10:00:00Z" }] },
    ] } },
  }, { endDate: "2026-05-28" });
  assert.equal(JSON.stringify(c).includes("conn_SECRET"), false);
});

// ───────────────────────────────────────────────────────────────────────────
// Lens walkthrough eligibility (one-time reveal)
// ───────────────────────────────────────────────────────────────────────────

// A blank workspace that derives activation-complete (5/5).
function completeConfig(extraObjects = []) {
  return {
    dataModel: { objects: [
      { id: "leads", objectType: "custom", rows: [] },
      { objectType: "sandbox-environment", rows: [{ Name: "wf", lastResponse: JSON.stringify({ exitCode: 0 }) }] },
      ...extraObjects,
    ] },
    dashboards: [{ id: "d1", name: "O", tabs: [{ id: "t1", widgets: [{ id: "w1", kind: "chart" }] }] }],
  };
}

test("walkthrough — hidden until onboarding completes", () => {
  const w = activation.deriveLensWalkthroughState({ workspaceConfig: {} });
  assert.equal(w.activationComplete, false);
  assert.equal(w.show, false);
});

test("walkthrough — shows in the in-between state (complete, no activity, not dismissed)", () => {
  const w = activation.deriveLensWalkthroughState({ workspaceConfig: completeConfig() });
  assert.equal(w.activationComplete, true);
  assert.equal(w.hasActivity, false);
  assert.equal(w.dismissed, false);
  assert.equal(w.show, true);
});

test("walkthrough — hidden once the workspace has activity (power user)", () => {
  const cfg = completeConfig();
  cfg.dataModel.objects[1].rows[0].lastResponse = JSON.stringify({ exitCode: 0, ranAt: "2026-05-20T10:00:00Z" });
  const w = activation.deriveLensWalkthroughState({ workspaceConfig: cfg });
  assert.equal(w.hasActivity, true);
  assert.equal(w.show, false);
});

test("walkthrough — hidden permanently once dismissed via ui-cache flag", () => {
  const cfg = completeConfig([
    { id: "workspace-ui-cache", objectType: "custom", rows: [{ id: "activation", lensWalkthroughDismissed: true }] },
  ]);
  const w = activation.deriveLensWalkthroughState({ workspaceConfig: cfg });
  assert.equal(w.dismissed, true);
  assert.equal(w.show, false);
  // ui-cache flag reader
  assert.equal(activation.readUiCacheFlag(cfg, "lensWalkthroughDismissed"), true);
});

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
    { metadataGraph: { runtime: { persistenceMode: "database", persistenceAdapter: "postgres", deploy: { target: "vercel", envVarsNeeded: ["X"] } } } },
  ];
  for (const input of inputs) {
    for (const entry of activation.WORKSPACE_LENS_REGISTRY) {
      for (const step of entry.derive(input).steps) {
        if (!step.href) continue;
        assert.ok(ALLOWED_HREF(step.href), `${entry.id} step ${step.id} href "${step.href}" must route into an existing surface`);
      }
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Deploy lens (Item 5)
// ───────────────────────────────────────────────────────────────────────────

test("deploy lens — no signal: surface/env pending, persistence pending", () => {
  const state = activation.deriveDeployLensState({});
  assert.equal(state.lensId, "deploy");
  const byId = statusesById(state);
  assert.equal(byId["resolve-app-surface"], "pending");
  assert.equal(byId["verify-persistence"], "pending");
  assert.equal(byId["run-deploy-check"], "blocked"); // gated on durable persistence
  assert.equal(state.complete, false);
});

test("deploy lens — read-only persistence blocks deploy readiness", () => {
  const state = activation.deriveDeployLensState({
    metadataGraph: { runtime: { persistenceMode: "read-only", deploy: { target: "vercel" } } },
  });
  const byId = statusesById(state);
  assert.equal(byId["resolve-app-surface"], "complete"); // target present
  assert.equal(byId["verify-persistence"], "blocked"); // read-only blocks durability
  assert.equal(byId["run-deploy-check"], "blocked"); // gated on durable persistence
  // verify-env (pending) is earlier in order, so it's the first next step.
  assert.equal(state.nextStepId, "verify-env");
  assert.equal(state.complete, false);
});

test("deploy lens — durable + env ready + check passed → deploy-ready", () => {
  const state = activation.deriveDeployLensState({
    metadataGraph: { runtime: { persistenceMode: "database", persistenceAdapter: "postgres", deploy: { target: "vercel", envReady: true, checkPassed: true } } },
  });
  const byId = statusesById(state);
  assert.equal(byId["verify-persistence"], "complete");
  assert.equal(byId["run-deploy-check"], "complete");
  assert.equal(state.complete, true);
});

// ───────────────────────────────────────────────────────────────────────────
// Task lens (Item 6)
// ───────────────────────────────────────────────────────────────────────────

test("task lens — no task object: create-task-object pending, rows blocked", () => {
  const state = activation.deriveTaskLensState({ workspaceConfig: { dataModel: { objects: [] } } });
  assert.equal(state.lensId, "tasks");
  const byId = statusesById(state);
  assert.equal(byId["create-task-object"], "pending");
  assert.equal(byId["add-task-rows"], "blocked");
  assert.equal(state.nextStepId, "create-task-object");
});

test("task lens — governed task object with assigned rows advances", () => {
  const state = activation.deriveTaskLensState({
    workspaceConfig: {
      dataModel: { objects: [
        { id: "tasks", name: "Tasks", objectType: "task", rows: [{ title: "Do it", status: "open", owner: "ana" }] },
      ] },
    },
  });
  const byId = statusesById(state);
  assert.equal(byId["create-task-object"], "complete");
  assert.equal(byId["add-task-rows"], "complete");
  assert.equal(byId["assign-owners-status"], "complete");
});

test("task lens — source-backed task data detected without a governed object", () => {
  const state = activation.deriveTaskLensState({
    workspaceConfig: {
      dataModel: { objects: [
        { id: "project-task-source", name: "Project Task Source", objectType: "data-source", rows: [{ gid: "1" }] },
      ] },
    },
  });
  const byId = statusesById(state);
  // No governed task object yet, but source-backed rows exist → object step
  // pending (nudge to model), rows step not blocked.
  assert.equal(byId["create-task-object"], "pending");
  assert.notEqual(byId["add-task-rows"], "blocked");
});

// ───────────────────────────────────────────────────────────────────────────
// App-build lens (Item 7)
// ───────────────────────────────────────────────────────────────────────────

test("app-build lens — empty workspace: model pending, dashboard blocked", () => {
  const state = activation.deriveAppBuildLensState({ workspaceConfig: {} });
  assert.equal(state.lensId, "app-build");
  const byId = statusesById(state);
  assert.equal(byId["model-object"], "pending");
  assert.equal(byId["build-dashboard"], "blocked");
  assert.equal(state.complete, false);
});

test("app-build lens — progresses with objects/dashboard/workflow but blocks on persistence/deploy", () => {
  const state = activation.deriveAppBuildLensState({
    workspaceConfig: {
      dataModel: { objects: [
        { id: "leads", objectType: "custom", rows: [] },
        { objectType: "sandbox-environment", rows: [{ Name: "wf", lastResponse: JSON.stringify({ exitCode: 0 }) }] },
      ] },
      dashboards: [{ id: "d1", name: "Overview", tabs: [{ id: "t1", widgets: [{ id: "w1", kind: "chart" }] }] }],
    },
    // read-only persistence → durable-persistence step blocked
    metadataGraph: { runtime: { persistenceMode: "read-only" } },
  });
  const byId = statusesById(state);
  assert.equal(byId["model-object"], "complete");
  assert.equal(byId["build-dashboard"], "complete");
  assert.equal(byId["add-workflow"], "complete");
  assert.equal(byId["land-run"], "complete");
  assert.equal(byId["durable-persistence"], "blocked");
  assert.equal(state.complete, false);
});

// ───────────────────────────────────────────────────────────────────────────
// Swarm packet across every registered lens + serialization + secret safety
// ───────────────────────────────────────────────────────────────────────────

test("swarm packet — works for every registered lens id", () => {
  for (const entry of activation.WORKSPACE_LENS_REGISTRY) {
    const packet = activation.deriveSwarmConditionPacket({ workspaceConfig: {} }, { lensId: entry.id });
    assert.equal(packet.kind, "growthub-swarm-condition-packet-v1");
    assert.equal(packet.lensId, entry.id);
    assert.equal(typeof packet.currentState, "string");
    assert.ok(Array.isArray(packet.availableTools));
    assert.ok(Array.isArray(packet.expectedEvidence));
  }
});

test("all lens + composed + packet outputs are JSON-serializable", () => {
  const input = {
    workspaceConfig: {
      dataModel: { objects: [
        { id: "api-registry", objectType: "api-registry", rows: [{ connectionIds: "conn_x", accessToken: "leak" }] },
        { objectType: "sandbox-environment", rows: [{ Name: "wf", lastResponse: JSON.stringify({ exitCode: 1, error: "boom" }) }] },
      ] },
    },
    metadataGraph: { runtime: { persistenceMode: "read-only", deploy: { target: "vercel" }, agents: [{ slug: "a" }] } },
  };
  for (const entry of activation.WORKSPACE_LENS_REGISTRY) {
    assert.doesNotThrow(() => JSON.stringify(entry.derive(input)));
  }
  assert.doesNotThrow(() => JSON.stringify(activation.deriveWorkspaceState(input)));
  for (const entry of activation.WORKSPACE_LENS_REGISTRY) {
    assert.doesNotThrow(() => JSON.stringify(activation.deriveSwarmConditionPacket(input, { lensId: entry.id })));
  }
});

test("no lens, composed state, or packet leaks secret-shaped strings", () => {
  const input = {
    workspaceConfig: {
      dataModel: { objects: [
        { id: "api-registry", objectType: "api-registry", rows: [{ connectionIds: "conn_SECRET_XYZ", accessToken: "Bearer-LEAK", apiKey: "sk-ant-LEAK", authRef: "NANGO_SECRET_KEY" }] },
        { objectType: "sandbox-environment", rows: [{ Name: "wf", lastResponse: JSON.stringify({ exitCode: 1, error: "boom" }) }] },
      ] },
    },
    metadataGraph: { runtime: { persistenceMode: "read-only", agents: [{ slug: "a", budgetMonthlyCents: 9999 }] } },
  };
  const FORBIDDEN = ["conn_SECRET_XYZ", "Bearer-LEAK", "sk-ant-LEAK", "access_token", "refresh_token", "Authorization"];
  const blobs = [
    JSON.stringify(activation.deriveWorkspaceState(input)),
    ...activation.WORKSPACE_LENS_REGISTRY.map((e) => JSON.stringify(activation.deriveSwarmConditionPacket(input, { lensId: e.id }))),
  ];
  for (const blob of blobs) {
    for (const needle of FORBIDDEN) {
      assert.equal(blob.includes(needle), false, `output leaked "${needle}"`);
    }
  }
});
