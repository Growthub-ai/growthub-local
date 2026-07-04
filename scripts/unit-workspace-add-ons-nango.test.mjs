#!/usr/bin/env node
/**
 * Unit coverage for the official Nango marketplace provider + live-discovered
 * integration products:
 *   - provider registration shape (bearer secret-key account lane, single
 *     source of truth, no collision with the operator nango template default)
 *   - the declared `productDiscovery` contract (install products render
 *     DYNAMICALLY from a real-time Nango /integrations fetch)
 *   - discovered-product mapping from the REAL Nango API payload shape
 *     (ApiPublicIntegration: unique_key / provider / display_name)
 *   - provider/product/discovered registry row shape (env REFS only, never
 *     values; providerConfigKey binding column; connectionIds never clobbered)
 *   - clean conversion: an installed discovered row IS a governed
 *     connectorKind:"nango" api-registry row the existing config-driven
 *     resolver lane registers and executes as API requests
 *   - source-truth assertions over the generic provider routes + marketplace
 *     surface (governed writes, receipts, operator gate, no provider API in
 *     the browser)
 *   - Upstash/Vercel regression: the third provider changes nothing for them
 *
 * Pure / offline — no network or runtime dependency.
 *
 * Run with:  node --test scripts/unit-workspace-add-ons-nango.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const kitRoot = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const kitLib = path.join(kitRoot, "lib");
const kitApp = path.join(kitRoot, "app");

const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const schema = await import(pathToFileURL(path.join(kitLib, "workspace-schema.js")).href);
const nangoAdapter = await import(pathToFileURL(path.join(kitLib, "adapters/integrations/nango/nango-adapter.js")).href);
const nangoLoader = await import(pathToFileURL(path.join(kitLib, "adapters/integrations/nango/nango-config-loader.js")).href);
const resolverRegistry = await import(pathToFileURL(path.join(kitLib, "adapters/integrations/source-resolver-registry.js")).href);
const templates = await import(pathToFileURL(path.join(kitLib, "adapters/integrations/templates/template-registry.js")).href);

const {
  MARKETPLACE_PROVIDERS,
  NANGO_API_BASE_URL,
  NANGO_INTEGRATIONS_INTEGRATION_ID,
  NANGO_PROVIDER_INTEGRATION_ID,
  NANGO_SECRET_ENV,
  findDiscoveredAddOnRows,
  getMarketplaceProduct,
  getMarketplaceProvider,
  getProviderProductDiscovery,
  listProviderProductReadiness,
  makeDiscoveredMarketplaceProduct,
  makeDiscoveredMarketplaceProductRow,
  makeMarketplaceProviderRow,
  providerAccountAuthMode,
  providerAccountEnvKeys,
  resolveProviderAccountAuth,
  withDiscoveredMarketplaceProductRegistry,
  withMarketplaceProductRegistry,
  withMarketplaceProviderRegistry,
} = addOns;

// The REAL Nango list-integrations payload shape (GET /integrations →
// { data: ApiPublicIntegration[] }), field names verified against
// @nangohq/node 0.70.4 / @nangohq/types 0.70.4.
const SAMPLE_INTEGRATIONS_PAYLOAD = {
  data: [
    {
      unique_key: "slack",
      provider: "slack",
      display_name: "Slack",
      forward_webhooks: true,
      logo: "https://app.nango.dev/images/template-logos/slack.svg",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
    {
      unique_key: "hubspot-prod",
      provider: "hubspot",
      display_name: null,
      logo: "https://app.nango.dev/images/template-logos/hubspot.svg",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
  ],
};

const VERIFIED_SYNC = {
  ok: true,
  testedAt: "2026-07-04T00:00:00.000Z",
  proof: "Slack probe /integrations/slack returned HTTP 200",
  summary: "Slack sync verified with a read-only REST probe (/integrations/slack).",
  resolvedEnv: [NANGO_SECRET_ENV],
};

function readKitFile(relativePath) {
  return readFileSync(path.join(kitRoot, relativePath), "utf8");
}

/* ---------- provider registration shape ---------- */
test("nango provider is registered parallel to vercel with a bearer secret-key lane", () => {
  const nango = getMarketplaceProvider("nango");
  assert.ok(nango, "nango provider missing from MARKETPLACE_PROVIDERS");
  assert.equal(nango.integrationId, NANGO_PROVIDER_INTEGRATION_ID);
  assert.equal(providerAccountAuthMode(nango), "bearer");
  assert.deepEqual(providerAccountEnvKeys(nango), [NANGO_SECRET_ENV]);
  assert.equal(nango.baseUrl, "https://api.nango.dev");
  assert.equal(NANGO_API_BASE_URL, "https://api.nango.dev");
  // Real current Nango REST endpoints on the account lane.
  assert.deepEqual(nango.accountProbe.paths, ["/integrations", "/connections"]);
  assert.equal(nango.accountProbe.baseUrlEnv, "NANGO_HOST_URL", "self-hosted override must reuse the runtime adapter env key");
  const tokenField = nango.accountSetupFields.find((field) => field.credentialRole === "bearerToken");
  assert.ok(tokenField, "bearer secret-key setup field missing");
  assert.equal(tokenField.envRef, NANGO_SECRET_ENV);
  assert.equal(tokenField.type, "password");
  // existing lanes untouched
  assert.equal(providerAccountAuthMode(getMarketplaceProvider("vercel")), "bearer");
  assert.equal(providerAccountAuthMode(getMarketplaceProvider("upstash")), "basic");
});

test("nango provider identity does not collide with the operator nango template default", () => {
  const template = templates.getResolverTemplate("nango");
  assert.ok(template, "nango resolver template missing");
  assert.notEqual(
    NANGO_PROVIDER_INTEGRATION_ID,
    template.apiRegistryDefaults.integrationId,
    "marketplace provider row must never clobber an operator template-seeded row",
  );
  const allIds = MARKETPLACE_PROVIDERS.flatMap((provider) => [provider.integrationId, ...provider.products.map((product) => product.integrationId)]);
  assert.equal(new Set(allIds).size, allIds.length, "marketplace integrationIds must be unique");
});

/* ---------- static product grammar ---------- */
test("nango-integrations product declares the real Nango REST contract", () => {
  const product = getMarketplaceProduct("nango", NANGO_INTEGRATIONS_INTEGRATION_ID);
  assert.ok(product, "nango-integrations product missing");
  assert.equal(product.executionLane, "workspace-integrations");
  assert.deepEqual(product.requiredEnv, [NANGO_SECRET_ENV]);
  assert.deepEqual(product.probe.paths, ["/integrations"]);
  assert.equal(product.probe.tokenEnv, NANGO_SECRET_ENV);
  assert.equal(product.probe.fallbackBaseUrl, "https://api.nango.dev");
  assert.equal(product.resourceDiscovery.auth, "provider-bearer");
  assert.deepEqual(product.resourceDiscovery.envFromResource, [], "the account secret already authorizes every integration — resource selection must never write env");
  // The install lane must NOT be an inbound trigger lane (those become canvas
  // input methods automatically).
  assert.ok(!["inbound-webhook", "api-request", "serverless-scheduler"].includes(product.executionLane));
});

/* ---------- productDiscovery contract ---------- */
test("nango declares the live product-discovery contract with connectorKind nango defaults", () => {
  const nango = getMarketplaceProvider("nango");
  const discovery = getProviderProductDiscovery(nango);
  assert.ok(discovery, "productDiscovery contract missing");
  assert.deepEqual(discovery.paths, ["/integrations"]);
  assert.ok(discovery.payloadKeys.includes("data"), "GET /integrations returns { data: [...] }");
  assert.ok(discovery.idFields.includes("unique_key"), "integration identity is unique_key");
  const defaults = discovery.productDefaults;
  assert.equal(defaults.productIdPrefix, "nango-");
  assert.equal(defaults.connectorKind, "nango");
  assert.equal(defaults.resolverTemplateId, "nango");
  assert.equal(defaults.authRef, NANGO_SECRET_ENV, "the adapter reads a nango row's authRef as the secret ENV NAME");
  assert.equal(defaults.bindingField, "providerConfigKey");
  assert.deepEqual(defaults.requiredEnv, [NANGO_SECRET_ENV]);
  assert.equal(defaults.probe.pathTemplate, "/integrations/{resourceId}");
  // Providers without the contract resolve to null (no accidental detection).
  assert.equal(getProviderProductDiscovery(getMarketplaceProvider("vercel")), null);
  assert.equal(getProviderProductDiscovery(getMarketplaceProvider("upstash")), null);
});

/* ---------- account auth resolution ---------- */
test("resolveProviderAccountAuth resolves the nango bearer lane without leaking beyond the header", () => {
  const nango = getMarketplaceProvider("nango");
  const missing = resolveProviderAccountAuth(nango, {});
  assert.equal(missing.ready, false);
  assert.deepEqual(missing.missingEnv, [NANGO_SECRET_ENV]);
  assert.equal(missing.header, null);
  const ready = resolveProviderAccountAuth(nango, { NANGO_SECRET_KEY: "nango_sk_test_value" });
  assert.equal(ready.ready, true);
  assert.equal(ready.header, "Bearer nango_sk_test_value");
  const { header, ...rest } = ready;
  assert.ok(!JSON.stringify(rest).includes("nango_sk_test_value"), "secret must live only in the header field");
});

test("product readiness resolves through the canonical env contract", () => {
  const withEnv = listProviderProductReadiness("nango", { NANGO_SECRET_KEY: "nango_sk_test_value" });
  assert.equal(withEnv.length, 1);
  assert.equal(withEnv[0].productId, NANGO_INTEGRATIONS_INTEGRATION_ID);
  assert.equal(withEnv[0].configured, true);
  const withoutEnv = listProviderProductReadiness("nango", {});
  assert.equal(withoutEnv[0].configured, false);
  assert.deepEqual(withoutEnv[0].missingEnv, [NANGO_SECRET_ENV]);
});

/* ---------- discovered-product mapping ---------- */
test("makeDiscoveredMarketplaceProduct maps the real integrations payload to install products", () => {
  const nango = getMarketplaceProvider("nango");
  const [slackItem, hubspotItem] = SAMPLE_INTEGRATIONS_PAYLOAD.data;
  const slack = makeDiscoveredMarketplaceProduct(nango, slackItem);
  assert.equal(slack.productId, "nango-slack");
  assert.equal(slack.integrationId, "nango-slack");
  assert.equal(slack.label, "Slack");
  assert.equal(slack.connectorKind, "nango");
  assert.equal(slack.authRef, NANGO_SECRET_ENV);
  assert.equal(slack.executionLane, "workspace-integrations");
  assert.equal(slack.discoveredResourceId, "slack");
  assert.equal(slack.bindingField, "providerConfigKey");
  assert.deepEqual(slack.probe.paths, ["/integrations/slack"]);
  assert.equal(slack.probe.fallbackBaseUrl, "https://api.nango.dev");
  // display_name null → falls back to provider, keeps the environment-scoped key
  const hubspot = makeDiscoveredMarketplaceProduct(nango, hubspotItem);
  assert.equal(hubspot.productId, "nango-hubspot-prod");
  assert.equal(hubspot.label, "hubspot");
  assert.equal(hubspot.discoveredResourceId, "hubspot-prod");
  // no identity → no product
  assert.equal(makeDiscoveredMarketplaceProduct(nango, { provider: "x" }), null);
  // providers without the contract never produce discovered products
  assert.equal(makeDiscoveredMarketplaceProduct(getMarketplaceProvider("vercel"), slackItem), null);
});

/* ---------- row builders ---------- */
test("provider row and discovered row carry env refs only — never secret values", () => {
  const providerRow = makeMarketplaceProviderRow("nango", {
    syncResult: { ok: true, testedAt: VERIFIED_SYNC.testedAt, proof: "Nango REST API account verified (GET /integrations -> HTTP 200).", summary: "verified", resolvedEnv: [NANGO_SECRET_ENV] },
  });
  assert.equal(providerRow.integrationId, NANGO_PROVIDER_INTEGRATION_ID);
  assert.equal(providerRow.requiredEnv, NANGO_SECRET_ENV);
  assert.equal(providerRow.status, "connected");
  assert.equal(providerRow.syncStatus, "verified");
  assert.equal(providerRow.schemaVersion, "growthub-marketplace-provider-v1");

  const nango = getMarketplaceProvider("nango");
  const product = makeDiscoveredMarketplaceProduct(nango, SAMPLE_INTEGRATIONS_PAYLOAD.data[0]);
  const row = makeDiscoveredMarketplaceProductRow({ product, syncResult: VERIFIED_SYNC });
  assert.equal(row.integrationId, "nango-slack");
  assert.equal(row.connectorKind, "nango");
  assert.equal(row.providerConfigKey, "slack", "the declared binding column must carry the provider config key");
  assert.equal(row.authRef, NANGO_SECRET_ENV);
  assert.equal(row.productId, "nango-slack");
  assert.equal(row.resolverTemplateId, "nango");
  assert.equal(row.schemaVersion, "growthub-marketplace-nango-v1");
  assert.equal(row.syncStatus, "verified");
  assert.ok(!("connectionIds" in row), "install must never write connectionIds — connection binding belongs to the connection panel");
  const serialized = JSON.stringify(row);
  assert.ok(!serialized.includes("nango_sk_"), "row must not carry a secret value");
  for (const forbidden of ["secretKey", "apiKey", "token", "password"]) {
    assert.ok(!(forbidden in row), `row must not carry a ${forbidden} field`);
  }
});

/* ---------- registry upserts + schema ---------- */
test("provider + static + discovered rows land through the shared upserts, schema-valid and idempotent", () => {
  const nango = getMarketplaceProvider("nango");
  const product = makeDiscoveredMarketplaceProduct(nango, SAMPLE_INTEGRATIONS_PAYLOAD.data[0]);
  let config = { dataModel: { objects: [] } };
  config = withMarketplaceProviderRegistry(config, { providerId: "nango", syncResult: VERIFIED_SYNC });
  config = withMarketplaceProductRegistry(config, { providerId: "nango", productId: NANGO_INTEGRATIONS_INTEGRATION_ID, syncResult: VERIFIED_SYNC });
  config = withDiscoveredMarketplaceProductRegistry(config, { providerId: "nango", product, syncResult: VERIFIED_SYNC });

  const registryObject = config.dataModel.objects.find((object) => object.objectType === "api-registry");
  assert.ok(registryObject, "api-registry object missing");
  assert.equal(registryObject.rows.length, 3);
  assert.ok(registryObject.columns.includes("providerConfigKey"), "binding column missing from registry columns");
  assert.ok(registryObject.columns.includes("connectionIds"), "connection column missing from registry columns");
  schema.validateWorkspaceConfig(config); // throws on invalid

  // idempotent re-install: same row count, refreshed stamp
  const again = withDiscoveredMarketplaceProductRegistry(config, {
    providerId: "nango",
    product,
    syncResult: { ...VERIFIED_SYNC, testedAt: "2026-07-05T00:00:00.000Z" },
  });
  const againObject = again.dataModel.objects.find((object) => object.objectType === "api-registry");
  assert.equal(againObject.rows.length, 3);
  assert.equal(againObject.rows.find((row) => row.integrationId === "nango-slack").syncCheckedAt, "2026-07-05T00:00:00.000Z");

  // operator-bound connections survive a re-sync (upsert merge, no clobber)
  const bound = {
    ...again,
    dataModel: {
      ...again.dataModel,
      objects: again.dataModel.objects.map((object) => (object.objectType === "api-registry"
        ? { ...object, rows: object.rows.map((row) => (row.integrationId === "nango-slack" ? { ...row, connectionIds: "conn-live-1" } : row)) }
        : object)),
    },
  };
  const resynced = withDiscoveredMarketplaceProductRegistry(bound, { providerId: "nango", product, syncResult: VERIFIED_SYNC });
  const resyncedRow = resynced.dataModel.objects
    .find((object) => object.objectType === "api-registry").rows
    .find((row) => row.integrationId === "nango-slack");
  assert.equal(resyncedRow.connectionIds, "conn-live-1", "re-sync clobbered operator-bound connectionIds");

  // unknown provider / non-discovered product → unchanged
  assert.equal(withDiscoveredMarketplaceProductRegistry(config, { providerId: "vercel", product, syncResult: VERIFIED_SYNC }), config);
  assert.equal(withDiscoveredMarketplaceProductRegistry(config, { providerId: "nango", product: { productId: "x" }, syncResult: VERIFIED_SYNC }), config);
});

/* ---------- clean conversion: governed row → executable resolver ---------- */
test("an installed discovered row registers as a config-driven nango resolver (governed API request lane)", () => {
  const nango = getMarketplaceProvider("nango");
  const product = makeDiscoveredMarketplaceProduct(nango, SAMPLE_INTEGRATIONS_PAYLOAD.data[0]);
  let config = { dataModel: { objects: [] } };
  config = withDiscoveredMarketplaceProductRegistry(config, { providerId: "nango", product, syncResult: VERIFIED_SYNC });

  const binding = nangoAdapter.projectNangoBinding(
    config.dataModel.objects.find((object) => object.objectType === "api-registry").rows[0],
  );
  assert.ok(binding, "installed row must project a nango binding");
  assert.equal(binding.providerConfigKey, "slack");
  assert.equal(binding.secretEnvName, NANGO_SECRET_ENV);

  const registered = nangoLoader.registerNangoResolversFromConfig(config);
  assert.ok(registered.includes("nango-slack"), "config-driven resolver registration missed the installed row");
  const resolver = resolverRegistry.getSourceResolver("nango-slack");
  assert.equal(resolver.connectorKind, "nango");
  assert.equal(resolver.templateId, "nango");
  assert.equal(typeof resolver.fetchRecords, "function", "resolver must execute as an API request");
});

test("findDiscoveredAddOnRows returns installed discovered rows only", () => {
  const nango = getMarketplaceProvider("nango");
  const product = makeDiscoveredMarketplaceProduct(nango, SAMPLE_INTEGRATIONS_PAYLOAD.data[0]);
  let config = { dataModel: { objects: [] } };
  config = withMarketplaceProductRegistry(config, { providerId: "nango", productId: NANGO_INTEGRATIONS_INTEGRATION_ID, syncResult: VERIFIED_SYNC });
  config = withDiscoveredMarketplaceProductRegistry(config, { providerId: "nango", product, syncResult: VERIFIED_SYNC });
  // an operator template-seeded nango row (no productId) must not be claimed
  config.dataModel.objects[0].rows.push({ integrationId: "hubspot", connectorKind: "nango", authRef: NANGO_SECRET_ENV });
  const rows = findDiscoveredAddOnRows(config, "nango");
  assert.deepEqual(rows.map((row) => row.productId), ["nango-slack"]);
  assert.equal(rows[0].isVerifiedAddOn, true);
  assert.deepEqual(findDiscoveredAddOnRows(config, "vercel"), []);
});

/* ---------- regression: existing providers unchanged ---------- */
test("upstash + vercel provider rows and readiness are unchanged by the nango provider", () => {
  const upstashRow = makeMarketplaceProviderRow("upstash", {});
  assert.equal(upstashRow.integrationId, "upstash-provider");
  assert.equal(upstashRow.requiredEnv, "UPSTASH_EMAIL,UPSTASH_API_KEY");
  const vercelRow = makeMarketplaceProviderRow("vercel", {});
  assert.equal(vercelRow.integrationId, "vercel-provider");
  assert.equal(vercelRow.requiredEnv, "VERCEL_TOKEN");
  const vercelReadiness = listProviderProductReadiness("vercel", { VERCEL_TOKEN: "tok" });
  assert.equal(vercelReadiness[0].configured, true);
});

/* ---------- source truth: routes ---------- */
test("live-discovery route is generic, operator-gated, and never touches config or fs", () => {
  const source = readKitFile("app/api/workspace/add-ons/providers/[providerId]/products/live/route.js");
  assert.ok(source.includes("requireWorkspaceOperator"), "operator gate missing");
  assert.ok(source.includes("getProviderProductDiscovery"), "must resolve the declared contract");
  assert.ok(source.includes("makeDiscoveredMarketplaceProduct"), "must map through the shared pure builder");
  assert.ok(source.includes("resolveProviderAccountAuth"), "must resolve account auth from the single contract");
  assert.ok(source.includes("422"), "honest 422 for missing account auth");
  assert.ok(!source.includes("node:fs"), "read-only route must not touch fs");
  assert.ok(!source.includes("growthub.config.json"), "route must not name the config file");
  assert.ok(!/columns:\s*\[/.test(source), "must not hand-roll Data Model columns");
  assert.ok(!source.includes("api.nango.dev"), "endpoints come from the provider contract, not route literals");
  assert.ok(!source.includes("writeWorkspaceConfig"), "discovery is read-only");
});

test("products/sync discovered branch is server-authoritative with receipts on every outcome", () => {
  const source = readKitFile("app/api/workspace/add-ons/providers/[providerId]/products/sync/route.js");
  assert.ok(source.includes("resolveDiscoveredProduct"), "live re-verification lane missing");
  assert.ok(source.includes("withDiscoveredMarketplaceProductRegistry"), "rows must land through the shared upsert");
  assert.ok(source.includes("readWorkspaceConfig") && source.includes("writeWorkspaceConfig"), "governed config write missing");
  assert.ok((source.match(/appendOutcomeReceipt/g) || []).length >= 4, "published AND blocked receipts required on both lanes");
  assert.ok(source.includes('policyVerdict: { ok: false'), "blocked outcomes must carry a failing policy verdict");
  assert.ok(!source.includes("growthub.config.json"), "route must not name the config file");
  assert.ok(!/columns:\s*\[/.test(source), "must not hand-roll Data Model columns");
});

/* ---------- source truth: browser surface ---------- */
test("marketplace surface renders live products through governed routes only", () => {
  const source = readKitFile("app/components/WorkspaceAddOnsMarketplace.jsx");
  assert.ok(source.includes("/products/live"), "live product fetch missing");
  assert.ok(source.includes("findDiscoveredAddOnRows"), "installed discovered rows must render");
  assert.ok(source.includes("getProviderProductDiscovery"), "surface must key off the declared contract");
  const fetchTargets = [...source.matchAll(/fetch\(\s*[`"']([^`"']+)/g)].map((match) => match[1]);
  for (const target of fetchTargets) {
    assert.ok(target.startsWith("/api/workspace/"), `browser fetch must stay on governed routes: ${target}`);
  }
  assert.ok(!source.includes("api.nango.dev"), "the browser never calls the Nango API");
  assert.ok(!source.includes("NANGO_SECRET"), "the browser never names the secret env value");
});

/* ---------- source truth: icons + registration ---------- */
test("provider icons ship as kit assets and the suite is registered in package.json + CI", () => {
  for (const icon of ["provider.png", "integrations.png"]) {
    const stat = readFileSync(path.join(kitRoot, "public/integrations/nango", icon));
    assert.ok(stat.length > 1000, `${icon} missing or empty`);
  }
  const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.ok(rootPackage.scripts["test:add-ons-nango"], "root test:add-ons-nango script missing");
  const ci = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  assert.ok(ci.includes("test:add-ons-nango"), "CI must run the nango provider suite");
});
