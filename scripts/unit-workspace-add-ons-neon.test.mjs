#!/usr/bin/env node
/**
 * Unit coverage for the official Neon marketplace provider (V1) — the second
 * occupant of the database-operations lane, proving the lane grammar is
 * provider-generic (the playbook's predicted "Phase 1 + icons + tests"
 * data-provider ship):
 *   - provider/product identity + workspace-data lane grammar
 *   - bearer accountProbe contract incl. the offline-QA baseUrlEnv override
 *   - authRef "NEON" resolves NEON_API_KEY through canonical expansion
 *   - project resourceDiscovery writes NEON_PROJECT_ID (names only)
 *   - lane derivation: Neon joins listInstalledDataProducts NEXT TO Supabase
 *     without touching the Supabase-named capability
 *   - secret rule: rows carry env-ref NAMES only, never values
 *   - source truth: the products/sync discovery parser accepts the Neon
 *     `{ projects: [...] }` payload envelope
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-workspace-add-ons-neon.test.mjs
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
const serverSecrets = await import(pathToFileURL(path.join(kitLib, "server-secrets.js")).href);

const {
  NEON_PRODUCTS,
  NEON_PROVIDER_INTEGRATION_ID,
  NEON_POSTGRES_INTEGRATION_ID,
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
} = addOns;

const SECRET = "neon_api_key_placeholder_not_real";

function emptyConfig() {
  return { dataModel: { objects: [] } };
}

test("neon provider registers with the canonical marketplace identity", () => {
  const provider = getMarketplaceProvider("neon");
  assert.ok(provider, "neon provider must resolve by providerId");
  assert.equal(provider.integrationId, NEON_PROVIDER_INTEGRATION_ID);
  assert.equal(provider.authRef, "NEON");
  assert.equal(provider.executionLane, "workspace-provider");
  assert.equal(provider.accountProbe?.authMode, "bearer");
  assert.equal(provider.accountProbe?.tokenEnv, "NEON_API_KEY");
  assert.equal(provider.accountProbe?.baseUrlEnv, "NEON_API_URL", "offline-QA base override declared");
  assert.deepEqual(provider.accountProbe?.paths, ["/api/v2/projects"]);
  const fieldsById = Object.fromEntries(provider.accountSetupFields.map((field) => [field.id, field]));
  assert.equal(fieldsById.apiKey.credentialRole, "bearerToken");
  assert.equal(fieldsById.apiKey.type, "password", "secret-bearing field renders as password");
  assert.equal(getMarketplaceProvider(NEON_PROVIDER_INTEGRATION_ID)?.providerId, "neon");
});

test("authRef NEON resolves the concrete key through canonical expansion", () => {
  const candidates = serverSecrets.envKeyCandidates("NEON");
  assert.ok(candidates.includes("NEON_API_KEY"), `NEON_API_KEY in ${candidates}`);
  const hit = serverSecrets.readServerSecret("NEON", { NEON_API_KEY: SECRET });
  assert.equal(hit?.key, "NEON_API_KEY");
});

test("neon-postgres product declares the database-operations lane grammar", () => {
  const product = getMarketplaceProduct("neon", "neon-postgres");
  assert.ok(product, "neon-postgres resolves");
  assert.equal(product.integrationId, NEON_POSTGRES_INTEGRATION_ID);
  assert.equal(product.authRef, "NEON");
  assert.equal(product.connectorKind, "neon-data");
  assert.equal(product.executionLane, WORKSPACE_DATA_LANE, "SAME lane as Supabase — lane grammar is provider-generic");
  assert.deepEqual(product.requiredEnv, ["NEON_API_KEY"]);
  assert.ok(product.optionalEnv.includes("NEON_PROJECT_ID"));
  assert.ok(!["inbound-webhook", "api-request", "serverless-scheduler"].includes(product.executionLane));
  // Probe: real Neon API v2 endpoint + offline-QA override + public fallback.
  assert.equal(product.probe.baseUrlEnv, "NEON_API_URL");
  assert.equal(product.probe.tokenEnv, "NEON_API_KEY");
  assert.deepEqual(product.probe.paths, ["/api/v2/projects"]);
  assert.equal(product.probe.fallbackBaseUrl, "https://console.neon.tech");
});

test("bearer resourceDiscovery binds the selected project id (names only)", () => {
  const product = getMarketplaceProduct("neon", "neon-postgres");
  const discovery = product.resourceDiscovery;
  assert.equal(discovery.auth, "provider-bearer");
  assert.deepEqual(discovery.paths, ["/api/v2/projects"]);
  const byRef = Object.fromEntries(discovery.envFromResource.map((m) => [m.envRef, m]));
  assert.deepEqual(byRef.NEON_PROJECT_ID.fieldCandidates, ["id"]);
  // NEVER a connection string / password mapping — Neon V1 binds identity,
  // not credentials beyond the account key.
  assert.equal(discovery.envFromResource.length, 1);
});

test("readiness resolves through the canonical concrete-key env contract", () => {
  const missing = listProviderProductReadiness("neon", {});
  assert.equal(missing.length, NEON_PRODUCTS.length);
  assert.equal(missing[0].configured, false);
  assert.deepEqual(missing[0].missingEnv, ["NEON_API_KEY"]);

  const ready = listProviderProductReadiness("neon", {
    NEON_API_KEY: SECRET,
    NEON_PROJECT_ID: "plain-moon-123456",
  });
  assert.equal(ready[0].configured, true);
  assert.deepEqual(ready[0].configuredOptionalEnv, ["NEON_PROJECT_ID"]);
});

test("generic product row builds with refs only and upserts idempotently", () => {
  const syncResult = {
    ok: true,
    testedAt: "2026-07-04T00:00:00.000Z",
    baseUrl: "https://console.neon.tech",
    proof: "Neon Postgres probe /api/v2/projects returned HTTP 200",
    summary: "Neon Postgres sync verified with a read-only REST probe (/api/v2/projects).",
    resolvedEnv: ["NEON_API_KEY", "NEON_PROJECT_ID"],
    selectedResourceId: "plain-moon-123456",
    selectedResourceLabel: "growthub-prod",
    selectedResourceSource: "/api/v2/projects",
  };
  const row = makeMarketplaceProductRow({ providerId: "neon", productId: "neon-postgres", syncResult });
  assert.equal(row.integrationId, NEON_POSTGRES_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.executionLane, WORKSPACE_DATA_LANE);
  assert.equal(row.selectedResourceId, "plain-moon-123456");
  const rowText = JSON.stringify(row);
  assert.ok(!rowText.includes(SECRET), "row must not embed secret values");
  assert.ok(row.requiredEnv.includes("NEON_API_KEY"), "row carries env-ref NAMES");

  const first = withMarketplaceProductRegistry(emptyConfig(), { providerId: "neon", productId: "neon-postgres", syncResult });
  const second = withMarketplaceProductRegistry(first, { providerId: "neon", productId: "neon-postgres", syncResult: { ...syncResult, summary: "re-synced" } });
  const registry = second.dataModel.objects.find((o) => o.objectType === "api-registry");
  const rows = registry.rows.filter((r) => r.integrationId === NEON_POSTGRES_INTEGRATION_ID);
  assert.equal(rows.length, 1, "upsert is idempotent by integrationId");
});

test("neon joins the data lane NEXT TO supabase — lane capability is additive", () => {
  const syncResult = { ok: true, testedAt: "2026-07-04T00:00:00.000Z", proof: "probe ok", summary: "verified" };
  let config = withMarketplaceProductRegistry(emptyConfig(), { providerId: "supabase", productId: "supabase-postgrest", syncResult });
  config = withMarketplaceProductRegistry(config, { providerId: "neon", productId: "neon-postgres", syncResult });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasWorkspaceDataCapability, true);
  assert.equal(state.dataProducts.length, 2, "both data products on one lane");
  assert.equal(state.hasSupabaseDataCapability, true, "supabase-named capability untouched");
  assert.equal(state.hasNeonDataCapability, true);
  assert.equal(state.neonData.integrationId, NEON_POSTGRES_INTEGRATION_ID);
  assert.deepEqual(
    listInstalledDataProducts(config).map((r) => r.integrationId).sort(),
    [NEON_POSTGRES_INTEGRATION_ID, SUPABASE_POSTGREST_INTEGRATION_ID].sort(),
  );
});

test("unverified rows never grant the data capability", () => {
  const config = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "neon",
    productId: "neon-postgres",
    syncResult: null,
    authReady: false,
  });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasNeonDataCapability, false);
  assert.equal(state.hasWorkspaceDataCapability, false);
});

test("provider row builds from the bearer accountProbe env contract", () => {
  const row = makeMarketplaceProviderRow("neon", {
    syncResult: {
      ok: true,
      testedAt: "2026-07-04T00:00:00.000Z",
      proof: "Neon REST API account verified (GET /api/v2/projects -> HTTP 200).",
      summary: "verified",
      resolvedEnv: ["NEON_API_KEY"],
      providerAccountOptions: [{ id: "plain-moon-123456", label: "growthub-prod", source: "/api/v2/projects" }],
      selectedProviderAccountId: "plain-moon-123456",
      selectedProviderAccountLabel: "growthub-prod",
      providerAccountSource: "/api/v2/projects",
    },
  });
  assert.equal(row.integrationId, NEON_PROVIDER_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.ok(!JSON.stringify(row).includes(SECRET), "provider row must not embed token values");
});

// ---------------------------------------------------------------------------
// Source truth: the generic lanes accept Neon payload envelopes.
// ---------------------------------------------------------------------------

test("products/sync and resources parsers accept the Neon projects envelope", async () => {
  const { readFileSync } = await import("node:fs");
  const productsSyncSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/providers/[providerId]/products/sync/route.js"),
    "utf8",
  );
  const resourcesSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/providers/[providerId]/products/[productId]/resources/route.js"),
    "utf8",
  );
  assert.ok(productsSyncSource.includes('"projects"'), "products/sync pickArray accepts { projects: [...] }");
  assert.ok(resourcesSource.includes('"projects"'), "resources pickArray accepts { projects: [...] }");
  // The provider account listing parsers accept { projects: [...] } too.
  const credentialsSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/providers/[providerId]/credentials/route.js"),
    "utf8",
  );
  assert.ok(credentialsSource.includes("payload?.projects"), "credentials account options accept the projects envelope");
});
