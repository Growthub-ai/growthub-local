#!/usr/bin/env node
/**
 * Unit coverage for the pure external-sync helpers:
 *   - PostgREST OpenAPI table parsing (definitions + paths, garbage-safe)
 *   - external-table object construction on the data-source grammar
 *   - pull merge (external wins, local-only kept, field conflicts reported)
 *   - push mapping (reserved workspace columns stripped, correlation restored)
 *   - sync proof + object stamps carry no secret values and bounded strings
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-workspace-external-sync.test.mjs
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

const sync = await import(pathToFileURL(path.join(kitLib, "workspace-external-sync.js")).href);

const {
  buildExternalTableObject,
  buildPushRecords,
  buildSyncProof,
  externalTableObjectId,
  listExternalSyncObjects,
  mergeExternalIntoRows,
  parseOpenApiTables,
  stampObjectSyncResult,
  withExternalSyncObject,
} = sync;

const OPENAPI = {
  swagger: "2.0",
  definitions: {
    apps: { properties: { id: {}, name: {}, status: {}, deploy_url: {} } },
    workspaces: { properties: { id: {}, slug: {} } },
  },
  paths: { "/": {}, "/apps": {}, "/workspaces": {}, "/rpc/do_thing": {}, "/orphan_table": {} },
};

test("parseOpenApiTables reads definitions + paths and survives garbage", () => {
  const tables = parseOpenApiTables(OPENAPI);
  const names = tables.map((t) => t.name).sort();
  assert.deepEqual(names, ["apps", "orphan_table", "workspaces"]);
  assert.deepEqual(tables.find((t) => t.name === "apps").columns, ["id", "name", "status", "deploy_url"]);
  assert.deepEqual(parseOpenApiTables(null), []);
  assert.deepEqual(parseOpenApiTables("nope"), []);
  assert.deepEqual(parseOpenApiTables({ paths: { "/rpc/x": {} } }), []);
});

test("buildExternalTableObject lands on the data-source grammar", () => {
  const object = buildExternalTableObject({
    providerId: "supabase",
    table: "apps",
    columns: ["id", "name", "status", "Name"],
    integrationId: "supabase-postgrest",
    correlationKey: "id",
  });
  assert.equal(object.id, externalTableObjectId("supabase", "apps"));
  assert.equal(object.id, "supabase-apps");
  assert.equal(object.objectType, "data-source");
  assert.equal(object.externalTable, "apps");
  assert.equal(object.externalRegistryId, "supabase-postgrest");
  assert.equal(object.externalCorrelationKey, "id");
  assert.deepEqual(object.columns, ["Name", "externalId", "id", "name", "status", "registryId", "lastSyncedAt"]);
});

test("mergeExternalIntoRows: external wins, local-only kept, conflicts reported", () => {
  const rows = [
    { Name: "app-one", externalId: "1", status: "draft", registryId: "supabase-postgrest" },
    { Name: "local-only", externalId: "9", status: "live" },
  ];
  const records = [
    { id: "1", name: "app-one", status: "live" },
    { id: "2", name: "app-two", status: "live" },
  ];
  const merge = mergeExternalIntoRows({
    rows,
    records,
    columns: ["id", "name", "status"],
    correlationKey: "id",
    registryId: "supabase-postgrest",
    nowIso: "2026-07-02T00:00:00.000Z",
  });
  assert.equal(merge.rows.length, 3);
  assert.equal(merge.added, 1);
  assert.equal(merge.updated, 1);
  assert.deepEqual(merge.localOnly, ["9"]);
  assert.equal(merge.conflicts.length, 1);
  assert.deepEqual(merge.conflicts[0], { key: "1", field: "status", local: "draft", external: "live", resolution: "external" });
  const appOne = merge.rows.find((row) => row.externalId === "1");
  assert.equal(appOne.status, "live", "external value wins on pull");
  assert.equal(appOne.lastSyncedAt, "2026-07-02T00:00:00.000Z");
  const localOnly = merge.rows.find((row) => row.externalId === "9");
  assert.equal(localOnly.status, "live", "local-only row untouched");
});

test("buildPushRecords strips workspace columns and restores the correlation key", () => {
  const { records, skipped } = buildPushRecords({
    rows: [
      { Name: "app-one", externalId: "1", status: "live", registryId: "supabase-postgrest", lastSyncedAt: "x" },
      { Name: "empty-row", externalId: "3" },
    ],
    columns: ["Name", "externalId", "id", "status", "registryId", "lastSyncedAt"],
    correlationKey: "id",
  });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], { status: "live", id: "1" });
  assert.ok(!("registryId" in records[0]) && !("lastSyncedAt" in records[0]) && !("Name" in records[0]));
  assert.deepEqual(skipped, ["empty-row"]);
});

test("sync proof + stamps are compact and secret-free", () => {
  const proof = buildSyncProof({ action: "pull", table: "apps", pulled: 10, added: 2, updated: 8, conflicts: [{}], localOnly: ["9"], httpStatus: 200 });
  assert.equal(proof, "pull apps · HTTP 200 · 10 pulled · 2 added · 8 matched · 1 local-only kept · 1 field conflicts");
  const stamped = stampObjectSyncResult({ id: "supabase-apps" }, { status: "pulled", summary: proof, syncedAt: "2026-07-02T00:00:00.000Z", receiptId: "r-1" });
  assert.equal(stamped.lastSyncStatus, "pulled");
  assert.equal(stamped.lastSyncReceiptId, "r-1");
  assert.ok(stamped.lastSyncSummary.length <= 500);
});

test("withExternalSyncObject upserts by id and listExternalSyncObjects filters bound objects", () => {
  const object = buildExternalTableObject({ providerId: "supabase", table: "apps", columns: ["id"], integrationId: "supabase-postgrest" });
  const first = withExternalSyncObject({ dataModel: { objects: [{ id: "unrelated" }] } }, object);
  assert.equal(first.replaced, false);
  assert.equal(first.config.dataModel.objects.length, 2);
  const second = withExternalSyncObject(first.config, { ...object, label: "Apps v2" });
  assert.equal(second.replaced, true);
  assert.equal(second.config.dataModel.objects.length, 2);
  const bound = listExternalSyncObjects(second.config);
  assert.equal(bound.length, 1);
  assert.equal(bound[0].label, "Apps v2");
});
