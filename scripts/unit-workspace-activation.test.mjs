#!/usr/bin/env node
/**
 * Unit coverage for the Growthub Workspace Customer Activation Layer V1.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - blank workspace → generic activation steps
 *   - blank workspace with seeded objects/dashboards/workflows → progress
 *   - project-management with missing connection IDs → connection step pending
 *   - project-management with connectionIds + successful run → dashboard done
 *   - project-management with failed run → workflow step blocked
 *   - activation output never echoes NANGO_SECRET_KEY / tokens / connection ids
 *   - workspace-activation never throws on partial input
 *   - workspace-metadata-store exposes safe `provenance` items
 *
 * Run with:  node --test scripts/unit-workspace-activation.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib"
);
const kitApp = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app"
);
const seedConfigPath = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/project-management.config.json"
);

const activation = await import(
  pathToFileURL(path.join(kitLib, "workspace-activation.js")).href
);
const metadataStore = await import(
  pathToFileURL(path.join(kitLib, "workspace-metadata-store.js")).href
);

const projectManagementSeed = JSON.parse(fs.readFileSync(seedConfigPath, "utf8"));

function cloneSeed() {
  return JSON.parse(JSON.stringify(projectManagementSeed));
}

test("module shape — public API exports", () => {
  assert.equal(typeof activation.deriveWorkspaceActivationState, "function");
  assert.equal(typeof activation.deriveProjectManagementActivationState, "function");
  assert.equal(typeof activation.deriveBlankWorkspaceActivationState, "function");
  assert.equal(activation.ACTIVATION_KIND, "growthub-workspace-activation-state-v1");
  assert.equal(activation.ACTIVATION_VERSION, 1);
});

test("blank workspace — derives generic starter checklist", () => {
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig: {},
    workspaceSourceRecords: {},
  });
  assert.equal(state.kind, "growthub-workspace-activation-state-v1");
  assert.equal(state.template, "blank");
  assert.ok(Array.isArray(state.steps));
  assert.ok(state.steps.length >= 5, "blank state should ship at least 5 starter steps");
  const stepIds = state.steps.map((s) => s.id);
  assert.deepEqual(stepIds, [
    "create-object",
    "create-dashboard",
    "add-widget",
    "create-workflow",
    "run-workflow",
  ]);
  // First step is the next step (nothing done yet).
  assert.equal(state.nextStepId, "create-object");
});

test("blank workspace — completed objects + dashboards advance progress", () => {
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig: {
      dataModel: {
        objects: [
          {
            id: "leads",
            label: "Leads",
            objectType: "custom",
            columns: ["name"],
            rows: [],
          },
        ],
      },
      dashboards: [
        {
          id: "d1",
          name: "Sales Overview",
          tabs: [{ id: "t1", name: "Tab 1", widgets: [{ id: "w1", kind: "chart" }] }],
        },
      ],
    },
  });
  const byId = Object.fromEntries(state.steps.map((s) => [s.id, s]));
  assert.equal(byId["create-object"].status, "complete");
  assert.equal(byId["create-dashboard"].status, "complete");
  assert.equal(byId["add-widget"].status, "complete");
  assert.equal(byId["create-workflow"].status, "pending");
});

test("project-management seed — routes through the project-management adapter", () => {
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig: cloneSeed(),
    workspaceSourceRecords: {},
  });
  assert.equal(state.template, "project-management");
  assert.ok(state.templateName.toLowerCase().includes("project"));
  const stepIds = state.steps.map((s) => s.id);
  assert.deepEqual(stepIds, [
    "provider-env",
    "nango-connection",
    "workflow-run",
    "dashboard-view",
    "customize",
  ]);
});

test("project-management — fresh seed has no completed required steps", () => {
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig: cloneSeed(),
    workspaceSourceRecords: {},
  });
  // optional 'customize' step doesn't count toward required steps.
  assert.equal(state.completedCount, 0);
  assert.equal(state.totalCount, 4);
  assert.equal(state.complete, false);
  assert.equal(state.nextStepId, "provider-env");
});

test("project-management — connectionId configured advances nango step", () => {
  const seed = cloneSeed();
  const registry = seed.dataModel.objects.find((o) => o.objectType === "api-registry");
  registry.rows[0].connectionIds = "conn_acme_123";
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig: seed,
    workspaceSourceRecords: {},
    metadataGraph: { runtime: { nangoConfigured: true } },
  });
  const byId = Object.fromEntries(state.steps.map((s) => [s.id, s]));
  assert.equal(byId["provider-env"].status, "complete");
  assert.equal(byId["nango-connection"].status, "complete");
  assert.equal(byId["workflow-run"].status, "pending");
});

test("project-management — successful run + source rows marks dashboard step complete", () => {
  const seed = cloneSeed();
  const registry = seed.dataModel.objects.find((o) => o.objectType === "api-registry");
  registry.rows[0].connectionIds = "conn_acme_123";
  const sandbox = seed.dataModel.objects.find((o) => o.objectType === "sandbox-environment");
  sandbox.rows[0].lastResponse = JSON.stringify({
    runId: "run-1",
    exitCode: 0,
    ranAt: "2026-05-20T19:30:00.000Z",
    output: { items: [] },
  });
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig: seed,
    workspaceSourceRecords: {
      "project-active-tasks": {
        records: [{ gid: "1" }],
        recordCount: 1,
        fetchedAt: "2026-05-20T19:30:00.000Z",
      },
    },
    metadataGraph: { runtime: { nangoConfigured: true } },
  });
  const byId = Object.fromEntries(state.steps.map((s) => [s.id, s]));
  assert.equal(byId["workflow-run"].status, "complete");
  assert.equal(byId["dashboard-view"].status, "complete");
  assert.equal(state.complete, true);
});

test("project-management — failed run keeps workflow step blocked", () => {
  const seed = cloneSeed();
  const registry = seed.dataModel.objects.find((o) => o.objectType === "api-registry");
  registry.rows[0].connectionIds = "conn_acme_123";
  const sandbox = seed.dataModel.objects.find((o) => o.objectType === "sandbox-environment");
  sandbox.rows[0].lastResponse = JSON.stringify({
    runId: "run-1",
    exitCode: 1,
    error: "Provider OAuth expired",
    ranAt: "2026-05-20T19:30:00.000Z",
  });
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig: seed,
    workspaceSourceRecords: {},
    metadataGraph: { runtime: { nangoConfigured: true } },
  });
  const byId = Object.fromEntries(state.steps.map((s) => [s.id, s]));
  assert.equal(byId["workflow-run"].status, "blocked");
});

test("activation output is secret-safe — never echoes connection ids or token values", () => {
  const seed = cloneSeed();
  const registry = seed.dataModel.objects.find((o) => o.objectType === "api-registry");
  registry.rows[0].connectionIds = "SUPER_SECRET_CONN_ID_XYZ";
  // Plant secret-shaped fields that must never appear in the activation
  // state (the schema would refuse them anyway, but we belt-and-braces it).
  registry.rows[0].accessToken = "raw-bearer-leak";
  registry.rows[0].apiKey = "sk-ant-secret-leak";
  const sandbox = seed.dataModel.objects.find((o) => o.objectType === "sandbox-environment");
  sandbox.rows[0].lastResponse = JSON.stringify({ exitCode: 0, ranAt: "x" });
  const state = activation.deriveWorkspaceActivationState({
    workspaceConfig: seed,
    workspaceSourceRecords: {},
  });
  const json = JSON.stringify(state);
  // The env var name NANGO_SECRET_KEY is mentioned in the setup
  // instructions — that's the env variable the user must set, never a
  // secret value. Check that no secret VALUES leak.
  assert.equal(json.includes("SUPER_SECRET_CONN_ID_XYZ"), false);
  assert.equal(json.includes("raw-bearer-leak"), false);
  assert.equal(json.includes("sk-ant-secret-leak"), false);
});

test("activation derivation never throws on partial/empty input", () => {
  assert.doesNotThrow(() => activation.deriveWorkspaceActivationState());
  assert.doesNotThrow(() => activation.deriveWorkspaceActivationState({}));
  assert.doesNotThrow(() => activation.deriveWorkspaceActivationState({
    workspaceConfig: { dataModel: null },
  }));
  assert.doesNotThrow(() => activation.deriveWorkspaceActivationState({
    workspaceConfig: { provenance: { template: "nonexistent" } },
  }));
});

test("metadata-store — provenance items echo safe descriptors only", () => {
  const seed = cloneSeed();
  seed.dataModel.objects.find((o) => o.objectType === "api-registry").rows[0].connectionIds = "conn_acme_123";
  // Plant a token-shaped field to confirm the store does NOT echo it.
  seed.dataModel.objects.find((o) => o.objectType === "api-registry").rows[0].accessToken = "leak-bearer";
  const store = metadataStore.buildWorkspaceMetadataStore({
    workspaceConfig: seed,
    workspaceSourceRecords: {
      "project-active-tasks": { records: [{ gid: "1" }], recordCount: 1, fetchedAt: "x" },
    },
  });
  assert.ok(Array.isArray(store.provenance), "provenance items must be a list");
  assert.equal(store.provenance.length, 1);
  const [p] = store.provenance;
  assert.equal(p.kind, "workspaceProvenance");
  assert.equal(p.template, "project-management");
  assert.equal(p.hasProvenance, true);
  assert.equal(p.apiRegistryRows, 1);
  assert.equal(p.nangoRows, 1);
  assert.equal(p.connectionsConfigured, 1);
  assert.equal(p.sandboxRows, 1);
  assert.equal(p.hydratedSourceRecordKeys, 1);
  const json = JSON.stringify(store.provenance);
  assert.equal(json.includes("leak-bearer"), false);
  assert.equal(json.includes("conn_acme_123"), false);
});

test("activation step hrefs route into existing surfaces only", () => {
  const seed = cloneSeed();
  const state = activation.deriveProjectManagementActivationState({
    workspaceConfig: seed,
    workspaceSourceRecords: {},
  });
  for (const step of state.steps) {
    if (!step.href) continue;
    assert.ok(
      step.href === "/"
        || step.href.startsWith("/?")
        || step.href.startsWith("/data-model")
        || step.href.startsWith("/workflows")
        || step.href.startsWith("/settings"),
      `step ${step.id} href "${step.href}" must route into an existing workspace surface`,
    );
  }
});

test("activation panel component file is present", () => {
  const componentPath = path.join(kitApp, "components/WorkspaceActivationPanel.jsx");
  assert.ok(fs.existsSync(componentPath), `expected component at ${componentPath}`);
});
