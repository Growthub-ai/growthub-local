#!/usr/bin/env node
/**
 * Unit coverage for the official Supabase marketplace provider (V1):
 *   - provider/product identity + database-operations lane grammar
 *   - env readiness through the canonical readEnvVar contract (injected env)
 *   - generic (non-Upstash) product registry row build + upsert round-trip
 *   - deriveWorkspaceAddOnsState lane-driven data capability
 *   - secret rule: rows carry env-ref NAMES only, never values
 *   - bearer resourceDiscovery contract shape (urlTemplate / fromPath mappings)
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-workspace-add-ons-supabase.test.mjs
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

const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);

const {
  MARKETPLACE_PROVIDERS,
  SUPABASE_PRODUCTS,
  SUPABASE_PROVIDER_INTEGRATION_ID,
  SUPABASE_POSTGREST_INTEGRATION_ID,
  WORKSPACE_DATA_LANE,
  deriveWorkspaceAddOnsState,
  getMarketplaceProvider,
  getMarketplaceProduct,
  listInstalledDataProducts,
  listProviderProductReadiness,
  makeMarketplaceProductRow,
  makeMarketplaceProviderRow,
  withMarketplaceProductRegistry,
  withRegistryProductRowUpsert,
} = addOns;

const SECRET = "sbp-test-placeholder-token";
const SERVICE_KEY = "service-role-test-key-not-a-real-secret";

function emptyConfig() {
  return { dataModel: { objects: [] } };
}

test("supabase provider registers with the canonical marketplace identity", () => {
  const provider = getMarketplaceProvider("supabase");
  assert.ok(provider, "supabase provider must resolve by providerId");
  assert.equal(provider.integrationId, SUPABASE_PROVIDER_INTEGRATION_ID);
  assert.equal(provider.authRef, "SUPABASE");
  assert.equal(provider.executionLane, "workspace-provider");
  assert.equal(provider.accountProbe?.authMode, "bearer");
  assert.equal(provider.accountProbe?.tokenEnv, "SUPABASE_ACCESS_TOKEN");
  assert.equal(provider.accountProbe?.fallback?.baseUrlEnv, "SUPABASE_URL");
  assert.equal(provider.accountProbe?.fallback?.tokenEnv, "SUPABASE_SERVICE_ROLE_KEY");
  // Provider must resolve by integrationId too (registry row correlation).
  assert.equal(getMarketplaceProvider(SUPABASE_PROVIDER_INTEGRATION_ID)?.providerId, "supabase");
});

test("marketplace ids stay unique across all providers/products", () => {
  const providerIds = MARKETPLACE_PROVIDERS.map((p) => p.providerId);
  assert.equal(new Set(providerIds).size, providerIds.length, "provider ids unique");
  const integrationIds = MARKETPLACE_PROVIDERS.flatMap((p) => [
    p.integrationId,
    ...p.products.map((product) => product.integrationId),
  ]);
  assert.equal(new Set(integrationIds).size, integrationIds.length, "integration ids unique");
});

test("supabase-postgrest product declares the database-operations lane grammar", () => {
  const product = getMarketplaceProduct("supabase", "supabase-postgrest");
  assert.ok(product, "supabase-postgrest resolves");
  assert.equal(product.integrationId, SUPABASE_POSTGREST_INTEGRATION_ID);
  assert.equal(product.authRef, "SUPABASE");
  assert.equal(product.connectorKind, "supabase-data");
  assert.equal(product.executionLane, WORKSPACE_DATA_LANE);
  assert.deepEqual(product.requiredEnv, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  // Never a trigger lane — the inbound door classifies products by lane string.
  assert.ok(!["inbound-webhook", "api-request", "serverless-scheduler"].includes(product.executionLane));
  // Probe: per-project host + apikey header shape (gateway) + Bearer.
  assert.equal(product.probe.baseUrlEnv, "SUPABASE_URL");
  assert.equal(product.probe.tokenEnv, "SUPABASE_SERVICE_ROLE_KEY");
  assert.equal(product.probe.tokenHeaderName, "apikey");
  assert.ok(product.probe.paths.includes("/rest/v1/"));
});

test("bearer resourceDiscovery contract declares project→env mappings", () => {
  const product = getMarketplaceProduct("supabase", "supabase-postgrest");
  const discovery = product.resourceDiscovery;
  assert.equal(discovery.auth, "provider-bearer");
  assert.deepEqual(discovery.paths, ["/v1/projects"]);
  const byRef = Object.fromEntries(discovery.envFromResource.map((m) => [m.envRef, m]));
  assert.equal(byRef.SUPABASE_URL.urlTemplate, "https://{id}.supabase.co");
  assert.equal(byRef.SUPABASE_SERVICE_ROLE_KEY.fromPath, "/v1/projects/{id}/api-keys");
  assert.equal(byRef.SUPABASE_SERVICE_ROLE_KEY.matchField, "name");
  assert.equal(byRef.SUPABASE_SERVICE_ROLE_KEY.matchValue, "service_role");
  assert.equal(byRef.SUPABASE_ANON_KEY.optional, true);
});

test("readiness resolves through the canonical concrete-key env contract", () => {
  const missing = listProviderProductReadiness("supabase", {});
  assert.equal(missing.length, SUPABASE_PRODUCTS.length);
  assert.equal(missing[0].configured, false);
  assert.deepEqual(missing[0].missingEnv, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  const ready = listProviderProductReadiness("supabase", {
    SUPABASE_URL: "https://abcd1234.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    SUPABASE_ANON_KEY: "anon-key",
  });
  assert.equal(ready[0].configured, true);
  assert.deepEqual(ready[0].missingEnv, []);
  assert.deepEqual(ready[0].configuredOptionalEnv, ["SUPABASE_ANON_KEY"]);
});

test("generic product row builds with refs only and upserts idempotently", () => {
  const syncResult = {
    ok: true,
    testedAt: "2026-07-02T00:00:00.000Z",
    baseUrl: "https://abcd1234.supabase.co",
    proof: "Supabase Postgres (PostgREST) probe /rest/v1/ returned HTTP 200",
    summary: "Supabase sync verified with a read-only REST probe (/rest/v1/).",
    resolvedEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    selectedResourceId: "abcd1234",
    selectedResourceLabel: "growthub-prod",
    selectedResourceSource: "/v1/projects",
  };
  const row = makeMarketplaceProductRow({ providerId: "supabase", productId: "supabase-postgrest", syncResult });
  assert.equal(row.integrationId, SUPABASE_POSTGREST_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.status, "connected");
  assert.equal(row.executionLane, WORKSPACE_DATA_LANE);
  assert.equal(row.resolverTemplateId, "supabase-postgrest");
  assert.equal(row.baseUrl, "https://abcd1234.supabase.co");
  assert.equal(row.schemaVersion, "growthub-marketplace-product-v1");
  // Secret rule: no secret VALUE anywhere on the row.
  const rowText = JSON.stringify(row);
  assert.ok(!rowText.includes(SECRET) && !rowText.includes(SERVICE_KEY), "row must not embed secret values");
  assert.ok(row.requiredEnv.includes("SUPABASE_SERVICE_ROLE_KEY"), "row carries env-ref NAMES");

  // withMarketplaceProductRegistry non-Upstash lane goes through the generic upsert.
  const first = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "supabase",
    productId: "supabase-postgrest",
    syncResult,
  });
  const registry = first.dataModel.objects.find((o) => o.objectType === "api-registry");
  assert.ok(registry, "api-registry object created when absent");
  assert.equal(registry.rows.filter((r) => r.integrationId === SUPABASE_POSTGREST_INTEGRATION_ID).length, 1);
  assert.ok(registry.columns.includes("syncProof"), "registry columns include marketplace sync columns");

  // Second install updates in place — never duplicates the row.
  const second = withMarketplaceProductRegistry(first, {
    providerId: "supabase",
    productId: "supabase-postgrest",
    syncResult: { ...syncResult, summary: "re-synced" },
  });
  const registry2 = second.dataModel.objects.find((o) => o.objectType === "api-registry");
  const rows = registry2.rows.filter((r) => r.integrationId === SUPABASE_POSTGREST_INTEGRATION_ID);
  assert.equal(rows.length, 1, "upsert is idempotent by integrationId");
  assert.equal(rows[0].lastResponse, "re-synced");
});

test("withRegistryProductRowUpsert ignores empty rows", () => {
  const config = emptyConfig();
  assert.equal(withRegistryProductRowUpsert(config, null), config);
  assert.equal(withRegistryProductRowUpsert(config, {}), config);
});

test("deriveWorkspaceAddOnsState derives the lane-driven data capability", () => {
  const syncResult = {
    ok: true,
    testedAt: "2026-07-02T00:00:00.000Z",
    proof: "probe ok",
    summary: "verified",
  };
  let config = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "supabase",
    productId: "supabase-postgrest",
    syncResult,
  });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasSupabaseDataCapability, true);
  assert.equal(state.hasWorkspaceDataCapability, true);
  assert.equal(state.supabaseData.integrationId, SUPABASE_POSTGREST_INTEGRATION_ID);
  assert.equal(state.dataProducts.length, 1);
  assert.deepEqual(
    listInstalledDataProducts(config).map((r) => r.productId),
    ["supabase-postgrest"],
  );
  // The scheduler capability derivation is untouched by the new provider.
  assert.equal(state.hasQstashSchedulerCapability, false);
});

test("unverified rows never grant the data capability", () => {
  const config = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "supabase",
    productId: "supabase-postgrest",
    syncResult: null,
    authReady: false,
  });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasSupabaseDataCapability, false);
  assert.equal(state.hasWorkspaceDataCapability, false);
  assert.equal(listInstalledDataProducts(config).length, 0);
});

test("provider row builds from the bearer accountProbe env contract", () => {
  const row = makeMarketplaceProviderRow("supabase", {
    syncResult: {
      ok: true,
      testedAt: "2026-07-02T00:00:00.000Z",
      proof: "Supabase Management API account verified (GET /v1/projects -> HTTP 200).",
      summary: "verified",
      resolvedEnv: ["SUPABASE_ACCESS_TOKEN"],
      providerAccountOptions: [{ id: "org-1", label: "Growthub", source: "/v1/projects" }],
      selectedProviderAccountId: "org-1",
      selectedProviderAccountLabel: "Growthub",
      providerAccountSource: "management-api",
    },
  });
  assert.equal(row.integrationId, SUPABASE_PROVIDER_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.status, "connected");
  assert.equal(row.selectedProviderAccountLabel, "Growthub");
  const rowText = JSON.stringify(row);
  assert.ok(!rowText.includes(SECRET), "provider row must not embed token values");
});
