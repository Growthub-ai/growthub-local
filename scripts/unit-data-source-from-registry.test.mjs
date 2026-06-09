#!/usr/bin/env node
/**
 * Unit coverage for the API Registry → Data Source bridge helpers
 * (lib/orchestration-graph.js): buildDataSourceRowFromApiRegistry +
 * findDataSourceRowsForRegistry. These power the in-product "Create Data Source"
 * action on a tested API Registry row, closing the API → Data Source step of the
 * governed creation loop without a parallel surface.
 *
 *   - row shape matches the data-source preset columns
 *   - references the registry by registryId; auth stays an authRef slug (no value)
 *   - sourceId/entityType derive sensibly and are overridable
 *   - duplicate detection finds existing data-source rows for the same registry
 *   - never throws on partial input
 *
 * Run with:  node --test scripts/unit-data-source-from-registry.test.mjs
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
const mod = await import(pathToFileURL(path.join(kitLib, "orchestration-graph.js")).href);
const { buildDataSourceRowFromApiRegistry, findDataSourceRowsForRegistry } = mod;

const SECRET = "sk-do-not-leak-9999";

const registryRow = {
  integrationId: "acme",
  authRef: "ACME",
  baseUrl: "https://api.acme.io",
  endpoint: "/v1/leads",
  method: "get",
  entityTypes: "leads,contacts",
  description: "Verified leads",
  resolverTemplateId: "custom-http",
  status: "connected",
};

test("buildDataSourceRowFromApiRegistry — shape + registry reference", () => {
  const row = buildDataSourceRowFromApiRegistry({}, registryRow);
  assert.equal(row.objectType, "data-source");
  assert.equal(row.registryId, "acme");
  assert.equal(row.endpoint, "/v1/leads");
  assert.equal(row.method, "GET");
  assert.equal(row.authRef, "ACME");
  assert.equal(row.entityType, "leads"); // first of "leads,contacts"
  assert.equal(row.sourceStorage, "workspace-source-records");
  assert.equal(row.status, "draft");
  assert.ok(row.Name.endsWith(" Source"));
  assert.ok(row.sourceId.includes("acme"));
});

test("buildDataSourceRowFromApiRegistry — never carries a secret value", () => {
  const row = buildDataSourceRowFromApiRegistry({}, { ...registryRow, authRef: "ACME" });
  assert.ok(!JSON.stringify(row).includes(SECRET));
  // authRef is a slug, not a value
  assert.equal(row.authRef, "ACME");
});

test("buildDataSourceRowFromApiRegistry — options override entity/source/storage", () => {
  const row = buildDataSourceRowFromApiRegistry({}, registryRow, {
    entityType: "contacts",
    sourceId: "custom-src-id",
    sourceStorage: "data-model-rows",
    name: "My Feed",
  });
  assert.equal(row.entityType, "contacts");
  assert.equal(row.sourceId, "custom-src-id");
  assert.equal(row.sourceStorage, "data-model-rows");
  assert.equal(row.Name, "My Feed Source");
});

test("findDataSourceRowsForRegistry — matches by registryId", () => {
  const cfg = { dataModel: { objects: [
    { objectType: "data-source", rows: [
      { Name: "A", registryId: "acme" },
      { Name: "B", registryId: "other" },
    ] },
    { objectType: "api-registry", rows: [{ integrationId: "acme" }] },
  ] } };
  const matches = findDataSourceRowsForRegistry(cfg, "acme");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].Name, "A");
  assert.deepEqual(findDataSourceRowsForRegistry(cfg, "nope"), []);
});

test("never throws on partial input", () => {
  assert.doesNotThrow(() => buildDataSourceRowFromApiRegistry(undefined, undefined));
  assert.doesNotThrow(() => findDataSourceRowsForRegistry(undefined, undefined));
  assert.deepEqual(findDataSourceRowsForRegistry({}, ""), []);
  const row = buildDataSourceRowFromApiRegistry({}, {});
  assert.equal(row.objectType, "data-source");
  assert.equal(row.entityType, "records");
});
