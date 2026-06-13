#!/usr/bin/env node
/**
 * Unit tests for the Governed Application Control Plane V1 derivation layer:
 *   - lib/workspace-app-registry.js (source of truth + health + packets)
 *   - lib/workspace-activation.js::deriveFleetLensState (Fleet lens)
 *
 * Invariants proven here: pure derivation (inputs deep-frozen — any mutation
 * throws), never throws on partial/absent config, no secrets required, app
 * health derives from linked governed objects, blockers and next actions are
 * computed, packets are app-scoped and machine-readable.
 *
 * Run: node --test scripts/unit-workspace-app-registry.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appLib = path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-app-registry.js",
);

const {
  APP_REGISTRY_OBJECT_ID,
  buildAppAssignmentPacket,
  deriveAppHealth,
  deriveAppNextAction,
  listAppSurfaceRows,
  summarizeFleet,
} = await import(appLib);

function deepFreeze(obj) {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

function fleetConfig() {
  return {
    dashboards: [{ id: "dash-crm", name: "CRM Overview" }],
    dataModel: {
      objects: [
        {
          id: APP_REGISTRY_OBJECT_ID,
          label: "App Registry",
          objectType: "app-surface",
          columns: ["Name", "appId", "surfacePath", "dashboardIds", "workflowRefs", "dataSourceIds", "registryIds"],
          rows: [
            {
              Name: "CRM App",
              appId: "crm",
              surfacePath: "apps/workspace",
              dashboardIds: "dash-crm",
              workflowRefs: "sbx:enrich",
              dataSourceIds: "leads-source",
              registryIds: "hubspot",
            },
            { Name: "Empty App", appId: "empty" },
          ],
        },
        {
          id: "sbx",
          label: "Sandboxes",
          objectType: "sandbox-environment",
          rows: [
            { Name: "enrich", lifecycleStatus: "live", status: "connected", lastRunId: "run_x", orchestrationConfig: "{}" },
          ],
        },
        { id: "leads-source", label: "Leads", sourceId: "src:leads", rows: [] },
        {
          id: "apis",
          label: "API Registry",
          objectType: "api-registry",
          rows: [{ integrationId: "hubspot", status: "connected" }],
        },
      ],
    },
  };
}

const hydratedRecords = { "src:leads": { records: [{ id: 1 }] } };
const GREEN = { durable: true, readOnly: false, deployReady: true };

// ── source of truth ────────────────────────────────────────────────────────

test("multiple apps register as governed rows and list", () => {
  const rows = listAppSurfaceRows(deepFreeze(fleetConfig()));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Name, "CRM App");
});

test("app links resolve to dashboards/workflows/data sources/API registry rows", () => {
  const cfg = deepFreeze(fleetConfig());
  const health = deriveAppHealth(cfg, deepFreeze(hydratedRecords), cfg.dataModel.objects[0].rows[0], GREEN);
  assert.equal(health.links.dashboards.found.length, 1);
  assert.equal(health.links.workflows.found.length, 1);
  assert.equal(health.links.workflows.found[0].live, true);
  assert.equal(health.links.dataSources.found[0].hydrated, true);
  assert.equal(health.links.apis.found[0].connected, true);
  assert.equal(health.status, "ready", JSON.stringify(health.blockers));
});

// ── health + blockers ──────────────────────────────────────────────────────

test("missing refs, dry sources, unpublished workflows, and down APIs surface as blockers", () => {
  const cfg = fleetConfig();
  const row = cfg.dataModel.objects[0].rows[0];
  row.dashboardIds = "dash-crm,dash-missing";
  cfg.dataModel.objects[1].rows[0].lifecycleStatus = "draft";
  cfg.dataModel.objects[3].rows[0].status = "failed";
  const health = deriveAppHealth(deepFreeze(cfg), deepFreeze({}), row, GREEN);
  assert.equal(health.status, "blocked");
  const text = health.blockers.join(" | ");
  assert.ok(text.includes("do not resolve"), text);
  assert.ok(text.includes("not connected"), text);
  assert.ok(text.includes("no hydrated records"), text);
  assert.ok(text.includes("not live"), text);
});

test("persistence/deploy prerequisites surface as computed blockers", () => {
  const cfg = deepFreeze(fleetConfig());
  const row = cfg.dataModel.objects[0].rows[0];
  const ro = deriveAppHealth(cfg, deepFreeze(hydratedRecords), row, { durable: false, readOnly: true, deployReady: false });
  assert.equal(ro.status, "blocked");
  assert.ok(ro.blockers.some((b) => b.includes("read-only")));
  assert.ok(ro.blockers.some((b) => b.includes("deploy")));
});

test("app-scoped next action is computed with a real href", () => {
  const cfg = deepFreeze(fleetConfig());
  const empty = cfg.dataModel.objects[0].rows[1];
  const health = deriveAppHealth(cfg, {}, empty, GREEN);
  assert.equal(health.status, "empty");
  const next = deriveAppNextAction(empty, health);
  assert.ok(next.label.includes("Link"), next.label);
  assert.ok(next.href.includes(APP_REGISTRY_OBJECT_ID));
});

// ── assignment packets ─────────────────────────────────────────────────────

test("assignment packet targets a specific app with governed scope", () => {
  const cfg = deepFreeze(fleetConfig());
  const packet = buildAppAssignmentPacket(cfg, deepFreeze(hydratedRecords), cfg.dataModel.objects[0].rows[0], GREEN);
  assert.equal(packet.kind, "growthub-app-assignment-packet-v1");
  assert.equal(packet.appId, "crm");
  assert.ok(packet.objectRefs.some((r) => r.objectId === "sbx" && r.rowName === "enrich"));
  assert.ok(packet.allowedRoutes.some((r) => r.includes("workflow/publish")));
  assert.ok(packet.forbiddenActions.some((f) => f.includes("secrets")));
  assert.ok(packet.expectedEvidence.some((e) => e.includes("agent-outcomes")));
});

test("packet blocks the swarm when prerequisites are missing", () => {
  const cfg = deepFreeze(fleetConfig());
  const packet = buildAppAssignmentPacket(cfg, {}, cfg.dataModel.objects[0].rows[0], { durable: false, readOnly: true, deployReady: false });
  assert.equal(packet.currentState, "blocked");
  assert.ok(packet.blockers.length > 0);
  assert.ok(packet.nextAction.href.length > 0);
});

// ── fleet lens ─────────────────────────────────────────────────────────────

const activationLib = path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-activation.js",
);

test("fleet lens emits per-app human steps + registers in the lens registry", async () => {
  const { deriveFleetLensState, WORKSPACE_LENS_REGISTRY, getLensEntry } = await import(activationLib);
  assert.ok(getLensEntry("fleet"), "fleet must be a registered lens");
  assert.ok(WORKSPACE_LENS_REGISTRY.some((l) => l.id === "fleet"));
  const state = deriveFleetLensState(deepFreeze({
    workspaceConfig: fleetConfig(),
    workspaceSourceRecords: hydratedRecords,
    metadataGraph: { runtime: { persistenceMode: "filesystem", allowFsWrite: true, deploy: {} } },
  }));
  assert.equal(state.lensId, "fleet");
  assert.equal(state.steps.length, 2);
  const crm = state.steps.find((s) => s.id === "app-crm");
  assert.ok(crm && crm.href.length > 0, "per-app step with real href");
});

test("fleet lens never throws on partial/absent config and does not mutate", async () => {
  const { deriveFleetLensState } = await import(activationLib);
  for (const input of [undefined, {}, { workspaceConfig: null }, { workspaceConfig: { dataModel: "garbage" } }]) {
    const state = deriveFleetLensState(input);
    assert.equal(state.lensId, "fleet");
    assert.ok(Array.isArray(state.steps) && state.steps.length >= 1);
    assert.equal(state.steps[0].id, "register-first-app");
  }
});

// ── fleet summary ──────────────────────────────────────────────────────────

test("fleet summary counts ready/blocked/empty", () => {
  const summary = summarizeFleet([
    { health: { status: "ready" } },
    { health: { status: "blocked" } },
    { health: { status: "empty" } },
    { health: { status: "ready" } },
  ]);
  assert.deepEqual(summary, { total: 4, ready: 2, blocked: 1, empty: 1 });
});

// ── app-scope runtime enforcement ──────────────────────────────────────────

test("app scope resolves to the app's governed object ids", async () => {
  const { resolveAppScopeObjectIds } = await import(appLib);
  const cfg = deepFreeze(fleetConfig());
  const scope = resolveAppScopeObjectIds(cfg, "crm");
  assert.ok(scope.objectIds.has(APP_REGISTRY_OBJECT_ID));
  assert.ok(scope.objectIds.has("sbx"));
  assert.ok(scope.objectIds.has("leads-source"));
  assert.ok(scope.objectIds.has("apis"), "api-registry object holding the app's integrationId is in scope");
  assert.ok(scope.dashboardIds.has("dash-crm"));
  assert.equal(resolveAppScopeObjectIds(cfg, "nope"), null);
});

test("evaluateAppScope blocks out-of-scope mutations and passes in-scope + echoes", async () => {
  const { evaluateAppScope } = await import(appLib);
  const cfg = deepFreeze(fleetConfig());
  // unrelated NEW object → violation
  let verdict = evaluateAppScope(cfg, {
    dataModel: { objects: [...cfg.dataModel.objects, { id: "other-app-data", label: "X", rows: [] }] },
  }, "crm");
  assert.equal(verdict.ok, false);
  assert.equal(verdict.violations[0].code, "app_scope_violation");
  // in-scope change (workflow row draft) + untouched echoes of others → ok
  verdict = evaluateAppScope(cfg, {
    dataModel: {
      objects: cfg.dataModel.objects.map((o) =>
        o.id !== "sbx" ? o : { ...o, rows: [{ ...o.rows[0], orchestrationDraftConfig: "{}" }] }),
    },
  }, "crm");
  assert.equal(verdict.ok, true, JSON.stringify(verdict.violations));
  // global surfaces are out of scope
  verdict = evaluateAppScope(cfg, { canvas: { widgets: [] } }, "crm");
  assert.equal(verdict.ok, false);
  // unknown app id
  verdict = evaluateAppScope(cfg, { dataModel: cfg.dataModel }, "ghost");
  assert.equal(verdict.ok, false);
});

test("composed workspace state (the object WorkspaceLensPanel renders) includes the fleet lens", async () => {
  const { deriveWorkspaceState } = await import(activationLib);
  const state = deriveWorkspaceState({
    workspaceConfig: fleetConfig(),
    workspaceSourceRecords: hydratedRecords,
    metadataGraph: { runtime: { persistenceMode: "filesystem", allowFsWrite: true, deploy: {} } },
  });
  assert.ok(state.lenses && state.lenses.fleet, "panel state must carry the fleet lens");
  assert.equal(state.lenses.fleet.lensId, "fleet");
  assert.ok(Array.isArray(state.lenses.fleet.steps) && state.lenses.fleet.steps.length === 2);
});
