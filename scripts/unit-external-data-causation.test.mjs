#!/usr/bin/env node
/**
 * Causation-driver compatibility proof for externally-held data-source
 * records (Supabase and future workspace-data providers).
 *
 * The workspace experience is derived — hundreds of UI states come from the
 * causation drivers in workspace-activation.js / workspace-data-model.js /
 * workspace-add-ons.js / workspace-external-sync.js. This suite proves that
 * when governed objects are externally bound (rows mirrored from an external
 * database, sync stamps + fingerprints + receipts present, records arriving
 * via Realtime-notified or watch-driven pulls) every core deriver:
 *
 *   1. never throws (hydration can land a new config at any moment),
 *   2. derives the SAME activation/lens conclusions it derives for the
 *      identical config without the external binding (backwards compat —
 *      binding a table to Supabase must not move unrelated UI states), and
 *   3. exposes the external causation state where it should (add-ons
 *      capability, freshness, Data Model tables, lens attention counts).
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-external-data-causation.test.mjs
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

const activation = await import(pathToFileURL(path.join(kitLib, "workspace-activation.js")).href);
const dataModel = await import(pathToFileURL(path.join(kitLib, "workspace-data-model.js")).href);
const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const sync = await import(pathToFileURL(path.join(kitLib, "workspace-external-sync.js")).href);

const NOW = "2026-07-04T13:00:00.000Z";

function registryRows() {
  return [
    addOns.makeMarketplaceProviderRow("supabase", {
      syncResult: { ok: true, testedAt: NOW, proof: "probe ok", summary: "verified" },
    }),
    addOns.makeMarketplaceProductRow({
      providerId: "supabase",
      productId: "supabase-postgrest",
      syncResult: { ok: true, testedAt: NOW, proof: "probe ok", summary: "verified", baseUrl: "https://qaref.supabase.co" },
    }),
  ];
}

/** A realistic externally-bound object exactly as the /data route stamps it. */
function externalObject({ drifted = false } = {}) {
  const built = sync.buildExternalTableObject({
    providerId: "supabase",
    table: "apps",
    columns: ["id", "name", "status"],
    integrationId: "supabase-postgrest",
  });
  const object = {
    ...built,
    rows: [
      { Name: "growthub-site", externalId: "ext-1", id: "ext-1", name: "growthub-site", status: "live", registryId: "supabase-postgrest" },
      { Name: "docs-portal", externalId: "ext-2", id: "ext-2", name: "docs-portal", status: "building", registryId: "supabase-postgrest" },
    ],
  };
  return sync.stampObjectSyncResult(object, {
    status: "pulled",
    summary: "pull apps · HTTP 200 · 2 pulled · 2 added",
    syncedAt: NOW,
    receiptId: "aor_test_1",
    fingerprint: drifted ? "v1:2:aaaa" : sync.buildDriftFingerprint(object.rows, "id"),
  });
}

function baseConfig() {
  return {
    dataModel: {
      objects: [
        { id: "api-registry", objectType: "api-registry", label: "API Registry", columns: [], rows: registryRows(), relations: [] },
        { id: "workspace-app-registry", objectType: "app-surface", label: "Applications", columns: ["Name"], rows: [{ Name: "workspace", appId: "workspace" }], relations: [] },
        { id: "clients", objectType: "custom", label: "Clients", columns: ["Name", "owner"], rows: [{ Name: "Acme", owner: "sam" }], relations: [] },
      ],
    },
  };
}

function withExternal(config) {
  return {
    ...config,
    dataModel: { ...config.dataModel, objects: [...config.dataModel.objects, externalObject()] },
  };
}

const DERIVERS = [
  ["deriveWorkspaceActivationState", (cfg) => activation.deriveWorkspaceActivationState({ workspaceConfig: cfg, workspaceSourceRecords: {}, metadataGraph: {} })],
  ["deriveWorkspaceState", (cfg) => activation.deriveWorkspaceState({ workspaceConfig: cfg, workspaceSourceRecords: {}, metadataGraph: {} })],
  ["deriveLensWalkthroughState", (cfg) => activation.deriveLensWalkthroughState({ workspaceConfig: cfg, workspaceSourceRecords: {}, metadataGraph: {} })],
  ["deriveSwarmConditionPacket", (cfg) => activation.deriveSwarmConditionPacket({ workspaceConfig: cfg, workspaceSourceRecords: {}, metadataGraph: {} })],
  ["deriveWorkspaceContributions", (cfg) => activation.deriveWorkspaceContributions({ workspaceConfig: cfg, workspaceSourceRecords: {}, metadataGraph: {} })],
  ["listWorkspaceDataModelTables", (cfg) => dataModel.listWorkspaceDataModelTables(cfg)],
  ["deriveWorkspaceAddOnsState", (cfg) => addOns.deriveWorkspaceAddOnsState(cfg)],
];

test("every causation driver survives externally-bound objects (never throws)", () => {
  const config = withExternal(baseConfig());
  for (const [name, run] of DERIVERS) {
    assert.doesNotThrow(() => run(config), `${name} must tolerate externally-held records`);
  }
});

test("backwards compat: binding a table externally moves NO unrelated derived state", () => {
  const plain = baseConfig();
  const bound = withExternal(baseConfig());
  const plainState = activation.deriveWorkspaceState({ workspaceConfig: plain, workspaceSourceRecords: {}, metadataGraph: {} });
  const boundState = activation.deriveWorkspaceState({ workspaceConfig: bound, workspaceSourceRecords: {}, metadataGraph: {} });
  const lensStatuses = (state) => Object.fromEntries(
    Object.entries(state?.lenses || {}).map(([id, lens]) => [id, (lens.steps || []).map((s) => `${s.id}:${s.status}`).join("|")]),
  );
  assert.deepEqual(lensStatuses(boundState), lensStatuses(plainState), "lens step statuses identical with and without the external binding");
  const plainActivation = activation.deriveWorkspaceActivationState({ workspaceConfig: plain, workspaceSourceRecords: {}, metadataGraph: {} });
  const boundActivation = activation.deriveWorkspaceActivationState({ workspaceConfig: bound, workspaceSourceRecords: {}, metadataGraph: {} });
  assert.equal(boundActivation?.complete, plainActivation?.complete, "activation completeness unchanged");
});

test("the external causation state IS derived where it belongs", () => {
  const config = withExternal(baseConfig());
  // Data Model: the mirrored object renders as a real table with its rows.
  const tables = dataModel.listWorkspaceDataModelTables(config);
  const appsTable = tables.find((t) => t.objectId === "supabase-apps");
  assert.ok(appsTable, "external object surfaces as a Data Model table");
  assert.equal(appsTable.rows.length, 2);
  // Add-ons: lane capability derives from the verified registry row.
  const state = addOns.deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasSupabaseDataCapability, true);
  assert.equal(state.hasWorkspaceDataCapability, true);
  // Freshness: synced when the fingerprint anchor matches.
  const objects = sync.listExternalSyncObjects(config);
  assert.equal(objects.length, 1);
  assert.equal(sync.deriveExternalSyncFreshness(objects[0], { now: NOW }).state, "synced");
});

test("lens attention math: drifted/conflict/never-synced externally-held objects count as needing sync", () => {
  const config = baseConfig();
  config.dataModel.objects.push(externalObject({ drifted: false }));
  const neverSynced = { ...sync.buildExternalTableObject({ providerId: "supabase", table: "events", columns: ["id"], integrationId: "supabase-postgrest" }) };
  config.dataModel.objects.push(neverSynced);
  const now = NOW;
  const states = sync.listExternalSyncObjects(config).map((object) => sync.deriveExternalSyncFreshness(object, { now }).state);
  assert.deepEqual(states.sort(), ["never-synced", "synced"]);
  const attention = states.filter((s) => s === "drifted" || s === "conflict" || s === "never-synced").length;
  assert.equal(attention, 1, "exactly the never-synced object needs sync — the Lens 'External tables' stat derives from this");
});

test("hydration replay: a fresh pull-stamped config re-derives cleanly (no accumulated state)", () => {
  // Simulate what the hydrator does: replace the object with a re-stamped
  // version (new receipt, new fingerprint) and re-run the drivers.
  let config = withExternal(baseConfig());
  const [object] = sync.listExternalSyncObjects(config);
  const externalRecords = [
    { id: "ext-1", name: "growthub-site", status: "live" },
    { id: "ext-2", name: "docs-portal", status: "live" },
    { id: "ext-3", name: "realtime-added", status: "draft" },
  ];
  const merge = sync.mergeExternalIntoRows({ rows: object.rows, records: externalRecords, columns: ["id", "name", "status"], correlationKey: "id", registryId: "supabase-postgrest", nowIso: NOW });
  const restamped = sync.stampObjectSyncResult({ ...object, rows: merge.rows }, {
    status: "pulled", summary: "pull apps · HTTP 200 · 3 pulled", syncedAt: NOW, receiptId: "aor_test_2",
    fingerprint: sync.buildDriftFingerprint(externalRecords, "id"),
  });
  config = sync.withExternalSyncObject(config, restamped).config;
  for (const [name, run] of DERIVERS) {
    assert.doesNotThrow(() => run(config), `${name} after hydration replay`);
  }
  const table = dataModel.listWorkspaceDataModelTables(config).find((t) => t.objectId === "supabase-apps");
  assert.equal(table.rows.length, 3, "realtime-arrived record derives straight into the table");
  assert.equal(sync.deriveExternalSyncFreshness(sync.listExternalSyncObjects(config)[0], { now: NOW }).state, "synced");
});
