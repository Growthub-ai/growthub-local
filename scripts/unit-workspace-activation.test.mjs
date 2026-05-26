#!/usr/bin/env node
/**
 * Unit coverage for the Workspace Activation Layer V1 derivation helper.
 *
 * Runs against the bundled growthub-custom-workspace-starter-v1 sources
 * via node:test (no npm install). The activation helper is pure: it
 * derives a goal-first checklist from the governed workspace config and
 * sidecar source records — never from secrets or runtime state.
 *
 * Run with:  node --test scripts/unit-workspace-activation.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1");
const kitLib = path.join(kitRoot, "apps/workspace/lib");
const kitApp = path.join(kitRoot, "apps/workspace/app");

const activation = await import(pathToFileURL(path.join(kitLib, "workspace-activation.js")).href);

function readSeededProjectManagementConfig() {
  const file = path.join(kitRoot, "templates/seeded-configs/project-management.config.json");
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

test("activation helper file exists in the bundled kit", () => {
  assert.ok(fs.existsSync(path.join(kitLib, "workspace-activation.js")));
});

test("WorkspaceActivationPanel component file exists in the bundled kit", () => {
  assert.ok(fs.existsSync(path.join(kitApp, "components/WorkspaceActivationPanel.jsx")));
});

test("activation helper exports the expected entrypoints", () => {
  assert.equal(typeof activation.deriveWorkspaceActivationState, "function");
  assert.equal(typeof activation.deriveProjectManagementActivationState, "function");
  assert.equal(typeof activation.deriveBlankWorkspaceActivationState, "function");
  assert.equal(typeof activation.deriveTemplateDescriptor, "function");
  assert.equal(activation.ACTIVATION_KIND, "growthub-workspace-activation-v1");
  assert.equal(activation.ACTIVATION_VERSION, 1);
});

test("blank workspace → generic activation steps", () => {
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig: {
      name: "Blank Workspace",
      dataModel: { objects: [] },
      dashboards: []
    },
    workspaceSourceRecords: {}
  });
  assert.equal(state.kind, "growthub-workspace-activation-v1");
  assert.equal(state.template.id, "blank");
  assert.equal(state.template.isBlank, true);
  assert.equal(state.totalSteps, 5);
  assert.equal(state.completedSteps, 0);
  assert.equal(state.done, false);
  const stepIds = state.steps.map((s) => s.id);
  assert.deepEqual(stepIds, [
    "create-object",
    "create-dashboard",
    "add-widget",
    "create-workflow",
    "run-workflow"
  ]);
  // Every step exposes a deep link.
  for (const step of state.steps) {
    assert.ok(step.link && typeof step.link.pathname === "string", `step ${step.id} must expose link.pathname`);
  }
  assert.equal(state.nextStepId, "create-object");
});

test("blank workspace with a user object completes the first step", () => {
  const state = activation.deriveBlankWorkspaceActivationState({
    workspaceConfig: {
      name: "Blank",
      dataModel: {
        objects: [
          { id: "leads", label: "Leads", objectType: "custom", rows: [] }
        ]
      },
      dashboards: []
    },
    workspaceSourceRecords: {}
  });
  const first = state.steps.find((s) => s.id === "create-object");
  assert.equal(first.status, "complete");
  assert.equal(state.completedSteps, 1);
  assert.equal(state.nextStepId, "create-dashboard");
});

test("project-management seed → template activation with checklist of 5 steps", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig,
    workspaceSourceRecords: {}
  });
  assert.equal(state.template.id, "project-management");
  assert.equal(state.template.isBlank, false);
  assert.equal(state.totalSteps, 5);
  const ids = state.steps.map((s) => s.id);
  assert.deepEqual(ids, [
    "set-nango-secret",
    "connect-provider",
    "verify-connection",
    "run-workflow",
    "view-dashboard"
  ]);
});

test("project-management → missing NANGO_SECRET_KEY blocks env step", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig,
    workspaceSourceRecords: {},
    runtimeStatus: { nango: { hasSecretKey: false } }
  });
  const env = state.steps.find((s) => s.id === "set-nango-secret");
  assert.equal(env.status, "blocked");
  assert.match(env.help, /NANGO_SECRET_KEY/);
});

test("project-management → NANGO_SECRET_KEY present marks env step complete", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig,
    workspaceSourceRecords: {},
    runtimeStatus: { nango: { hasSecretKey: true } }
  });
  const env = state.steps.find((s) => s.id === "set-nango-secret");
  assert.equal(env.status, "complete");
});

test("project-management → empty connectionIds leaves connect-provider incomplete", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig,
    workspaceSourceRecords: {}
  });
  const connect = state.steps.find((s) => s.id === "connect-provider");
  assert.equal(connect.status, "incomplete");
  const verify = state.steps.find((s) => s.id === "verify-connection");
  assert.equal(verify.status, "blocked");
});

test("project-management → populated connectionIds completes connect-provider", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  // Mutate just the api-registry row's connectionIds — emulates user setup.
  const registry = workspaceConfig.dataModel.objects.find((o) => o.id === "api-registry");
  registry.records[0].connectionIds = "conn_demo";
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig,
    workspaceSourceRecords: {}
  });
  const connect = state.steps.find((s) => s.id === "connect-provider");
  assert.equal(connect.status, "complete");
  const verify = state.steps.find((s) => s.id === "verify-connection");
  assert.equal(verify.status, "incomplete");
});

test("project-management → status=connected completes verify-connection", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const registry = workspaceConfig.dataModel.objects.find((o) => o.id === "api-registry");
  registry.records[0].connectionIds = "conn_demo";
  registry.records[0].status = "connected";
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig,
    workspaceSourceRecords: {}
  });
  const verify = state.steps.find((s) => s.id === "verify-connection");
  assert.equal(verify.status, "complete");
  const run = state.steps.find((s) => s.id === "run-workflow");
  assert.equal(run.status, "incomplete");
});

test("project-management → source rows hydrate completes run-workflow and view-dashboard", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const registry = workspaceConfig.dataModel.objects.find((o) => o.id === "api-registry");
  registry.records[0].connectionIds = "conn_demo";
  registry.records[0].status = "connected";
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig,
    workspaceSourceRecords: {
      "project-active-tasks": {
        records: [{ gid: "1", name: "Task A" }, { gid: "2", name: "Task B" }],
        recordCount: 2,
        fetchedAt: new Date().toISOString()
      }
    }
  });
  const run = state.steps.find((s) => s.id === "run-workflow");
  assert.equal(run.status, "complete");
  const view = state.steps.find((s) => s.id === "view-dashboard");
  assert.equal(view.status, "complete");
});

test("project-management → lastRunId on sandbox row counts as a run", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const registry = workspaceConfig.dataModel.objects.find((o) => o.id === "api-registry");
  registry.records[0].connectionIds = "conn_demo";
  registry.records[0].status = "connected";
  const sandbox = workspaceConfig.dataModel.objects.find((o) => o.id === "sandbox-environments");
  sandbox.records[0].lastRunId = "run_xyz";
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig,
    workspaceSourceRecords: {}
  });
  const run = state.steps.find((s) => s.id === "run-workflow");
  assert.equal(run.status, "complete");
});

test("activation output never echoes NANGO_SECRET_KEY values", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig,
    workspaceSourceRecords: {},
    // A misconfigured caller might forward raw env values — the helper
    // MUST NOT include them in any string output. We only consume the
    // typed `hasSecretKey` boolean.
    runtimeStatus: { nango: { hasSecretKey: true, secretKey: "nango_sk_secret_DO_NOT_LEAK" } }
  });
  const text = JSON.stringify(state);
  assert.ok(!text.includes("nango_sk_secret_DO_NOT_LEAK"), "activation output must not contain the NANGO_SECRET_KEY value");
  assert.ok(!/access_token|refresh_token|Bearer\b|Authorization/i.test(text),
    "activation output must not contain auth-token shaped strings");
});

test("unknown templates fall back to generic activation interface", () => {
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig: {
      name: "Custom Template Workspace",
      provenance: { template: "definitely-not-real", templateKind: "future-template" },
      dataModel: { objects: [] },
      dashboards: []
    },
    workspaceSourceRecords: {}
  });
  // The template descriptor preserves the requested id but flags it as
  // not-blank only when the kind matches a known template family.
  assert.equal(state.totalSteps, 5);
  assert.equal(state.steps[0].id, "create-object");
});

test("activation derivation is pure — input is not mutated", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const snapshot = JSON.stringify(workspaceConfig);
  activation.deriveWorkspaceActivationState({
    workspaceConfig,
    workspaceSourceRecords: { "project-active-tasks": { records: [{ gid: "1" }] } }
  });
  assert.equal(JSON.stringify(workspaceConfig), snapshot, "workspaceConfig must not be mutated by the helper");
});

test("progress is monotone and bounded between 0 and 1", () => {
  const workspaceConfig = readSeededProjectManagementConfig();
  const empty = activation.deriveWorkspaceActivationState({ workspaceConfig, workspaceSourceRecords: {} });
  assert.ok(empty.progress >= 0 && empty.progress <= 1, "progress must be in [0,1]");
  // Fully complete state.
  const registry = workspaceConfig.dataModel.objects.find((o) => o.id === "api-registry");
  registry.records[0].connectionIds = "conn_demo";
  registry.records[0].status = "connected";
  const full = activation.deriveProjectManagementActivationState({
    workspaceConfig,
    workspaceSourceRecords: {
      "project-active-tasks": { records: [{ gid: "1" }], recordCount: 1 }
    },
    runtimeStatus: { nango: { hasSecretKey: true } }
  });
  assert.ok(full.progress >= empty.progress, "progress must not regress with more setup completed");
  assert.equal(full.done, true);
  assert.equal(full.completedSteps, full.totalSteps);
  assert.equal(full.nextStepId, null);
});
