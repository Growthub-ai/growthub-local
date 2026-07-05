#!/usr/bin/env node
/**
 * Unit coverage for the official Stripe marketplace provider (V1):
 *   - provider/product identity + commerce-lane grammar (workspace-commerce)
 *   - bearer accountProbe contract incl. the offline-QA baseUrlEnv override
 *     and the aliasEnv write (STRIPE_API_KEY ← STRIPE_SECRET_KEY) that lets
 *     the canonical readServerSecret("STRIPE") expansion authenticate the
 *     generic HTTP lanes
 *   - env readiness through the canonical readEnvVar contract (injected env)
 *   - generic product registry row build + upsert round-trip
 *   - deriveWorkspaceAddOnsState lane-driven commerce capability
 *   - secret rule: rows carry env-ref NAMES only, never values
 *   - /settings/apps source truth: the commerce-lane link builder derives
 *     from governed rows and the one provider definition
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-workspace-add-ons-stripe.test.mjs
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
  MARKETPLACE_PROVIDERS,
  STRIPE_PRODUCTS,
  STRIPE_PROVIDER_INTEGRATION_ID,
  STRIPE_PAYMENTS_INTEGRATION_ID,
  WORKSPACE_COMMERCE_LANE,
  deriveWorkspaceAddOnsState,
  getMarketplaceProvider,
  getMarketplaceProduct,
  listInstalledCommerceProducts,
  listProviderProductReadiness,
  makeMarketplaceProductRow,
  makeMarketplaceProviderRow,
  withMarketplaceProductRegistry,
} = addOns;

const SECRET = "sk_test_placeholder_not_a_real_secret";

function emptyConfig() {
  return { dataModel: { objects: [] } };
}

test("stripe provider registers with the canonical marketplace identity", () => {
  const provider = getMarketplaceProvider("stripe");
  assert.ok(provider, "stripe provider must resolve by providerId");
  assert.equal(provider.integrationId, STRIPE_PROVIDER_INTEGRATION_ID);
  assert.equal(provider.authRef, "STRIPE");
  assert.equal(provider.executionLane, "workspace-provider");
  assert.equal(provider.accountProbe?.authMode, "bearer");
  assert.equal(provider.accountProbe?.tokenEnv, "STRIPE_SECRET_KEY");
  assert.equal(provider.accountProbe?.baseUrlEnv, "STRIPE_API_URL", "offline-QA base override declared");
  assert.deepEqual(provider.accountProbe?.paths, ["/v1/account"]);
  assert.deepEqual(provider.accountProbe?.aliasEnv, { STRIPE_API_KEY: "STRIPE_SECRET_KEY" });
  const fieldsById = Object.fromEntries(provider.accountSetupFields.map((field) => [field.id, field]));
  assert.equal(fieldsById.secretKey.credentialRole, "bearerToken");
  assert.equal(fieldsById.secretKey.type, "password", "secret-bearing field renders as password");
  assert.equal(fieldsById.webhookSecret.type, "password");
  assert.equal(fieldsById.webhookSecret.required, false);
  assert.equal(getMarketplaceProvider(STRIPE_PROVIDER_INTEGRATION_ID)?.providerId, "stripe");
});

test("aliasEnv target is a canonical readServerSecret(STRIPE) candidate", () => {
  // The whole point of the alias: generic HTTP lanes resolve authRef "STRIPE"
  // through envKeyCandidates — the alias key must be in that expansion.
  const candidates = serverSecrets.envKeyCandidates("STRIPE");
  assert.ok(candidates.includes("STRIPE_API_KEY"), `STRIPE_API_KEY in ${candidates}`);
  const hit = serverSecrets.readServerSecret("STRIPE", { STRIPE_API_KEY: SECRET });
  assert.equal(hit?.key, "STRIPE_API_KEY");
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

test("stripe-payments product declares the commerce lane grammar", () => {
  const product = getMarketplaceProduct("stripe", "stripe-payments");
  assert.ok(product, "stripe-payments resolves");
  assert.equal(product.integrationId, STRIPE_PAYMENTS_INTEGRATION_ID);
  assert.equal(product.authRef, "STRIPE");
  assert.equal(product.connectorKind, "stripe-commerce");
  assert.equal(product.executionLane, WORKSPACE_COMMERCE_LANE);
  assert.equal(WORKSPACE_COMMERCE_LANE, "workspace-commerce");
  assert.deepEqual(product.requiredEnv, ["STRIPE_SECRET_KEY"]);
  assert.ok(product.optionalEnv.includes("STRIPE_WEBHOOK_SECRET"));
  // Never a trigger lane — the inbound door classifies products by lane string.
  assert.ok(!["inbound-webhook", "api-request", "serverless-scheduler"].includes(product.executionLane));
  // Probe: real Stripe REST endpoint + offline-QA override + public fallback.
  assert.equal(product.probe.baseUrlEnv, "STRIPE_API_URL");
  assert.equal(product.probe.tokenEnv, "STRIPE_SECRET_KEY");
  assert.deepEqual(product.probe.paths, ["/v1/account"]);
  assert.equal(product.probe.fallbackBaseUrl, "https://api.stripe.com");
});

test("bearer resourceDiscovery lists commerce objects without env writes", () => {
  const product = getMarketplaceProduct("stripe", "stripe-payments");
  const discovery = product.resourceDiscovery;
  assert.equal(discovery.auth, "provider-bearer");
  assert.deepEqual(discovery.paths, ["/v1/products"]);
  // The account key already authorizes everything — selection binds the row,
  // it never writes env (Vercel/Nango mirror).
  assert.deepEqual(discovery.envFromResource, []);
});

test("readiness resolves through the canonical concrete-key env contract", () => {
  const missing = listProviderProductReadiness("stripe", {});
  assert.equal(missing.length, STRIPE_PRODUCTS.length);
  assert.equal(missing[0].configured, false);
  assert.deepEqual(missing[0].missingEnv, ["STRIPE_SECRET_KEY"]);

  const ready = listProviderProductReadiness("stripe", {
    STRIPE_SECRET_KEY: SECRET,
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  });
  assert.equal(ready[0].configured, true);
  assert.deepEqual(ready[0].missingEnv, []);
  assert.deepEqual(ready[0].configuredOptionalEnv, ["STRIPE_WEBHOOK_SECRET"]);
});

test("generic product row builds with refs only and upserts idempotently", () => {
  const syncResult = {
    ok: true,
    testedAt: "2026-07-04T00:00:00.000Z",
    baseUrl: "https://api.stripe.com",
    proof: "Stripe Payments probe /v1/account returned HTTP 200",
    summary: "Stripe Payments sync verified with a read-only REST probe (/v1/account).",
    resolvedEnv: ["STRIPE_SECRET_KEY"],
  };
  const row = makeMarketplaceProductRow({ providerId: "stripe", productId: "stripe-payments", syncResult });
  assert.equal(row.integrationId, STRIPE_PAYMENTS_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.status, "connected");
  assert.equal(row.executionLane, WORKSPACE_COMMERCE_LANE);
  assert.equal(row.schemaVersion, "growthub-marketplace-product-v1");
  // Secret rule: no secret VALUE anywhere on the row.
  const rowText = JSON.stringify(row);
  assert.ok(!rowText.includes(SECRET), "row must not embed secret values");
  assert.ok(row.requiredEnv.includes("STRIPE_SECRET_KEY"), "row carries env-ref NAMES");

  const first = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "stripe",
    productId: "stripe-payments",
    syncResult,
  });
  const registry = first.dataModel.objects.find((o) => o.objectType === "api-registry");
  assert.ok(registry, "api-registry object created when absent");
  assert.equal(registry.rows.filter((r) => r.integrationId === STRIPE_PAYMENTS_INTEGRATION_ID).length, 1);

  const second = withMarketplaceProductRegistry(first, {
    providerId: "stripe",
    productId: "stripe-payments",
    syncResult: { ...syncResult, summary: "re-synced" },
  });
  const registry2 = second.dataModel.objects.find((o) => o.objectType === "api-registry");
  const rows = registry2.rows.filter((r) => r.integrationId === STRIPE_PAYMENTS_INTEGRATION_ID);
  assert.equal(rows.length, 1, "upsert is idempotent by integrationId");
  assert.equal(rows[0].lastResponse, "re-synced");
});

test("deriveWorkspaceAddOnsState derives the lane-driven commerce capability", () => {
  const syncResult = { ok: true, testedAt: "2026-07-04T00:00:00.000Z", proof: "probe ok", summary: "verified" };
  const config = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "stripe",
    productId: "stripe-payments",
    syncResult,
  });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasStripeCommerceCapability, true);
  assert.equal(state.hasWorkspaceCommerceCapability, true);
  assert.equal(state.stripeCommerce.integrationId, STRIPE_PAYMENTS_INTEGRATION_ID);
  assert.deepEqual(listInstalledCommerceProducts(config).map((r) => r.productId), ["stripe-payments"]);
  // Sibling lane capabilities stay untouched.
  assert.equal(state.hasWorkspaceDataCapability, false);
  assert.equal(state.hasWorkspaceMessagingCapability, false);
  assert.equal(state.hasQstashSchedulerCapability, false);
});

test("unverified rows never grant the commerce capability", () => {
  const config = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "stripe",
    productId: "stripe-payments",
    syncResult: null,
    authReady: false,
  });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasStripeCommerceCapability, false);
  assert.equal(state.hasWorkspaceCommerceCapability, false);
  assert.equal(listInstalledCommerceProducts(config).length, 0);
});

test("provider row builds from the bearer accountProbe env contract", () => {
  const row = makeMarketplaceProviderRow("stripe", {
    syncResult: {
      ok: true,
      testedAt: "2026-07-04T00:00:00.000Z",
      proof: "Stripe REST API account verified (GET /v1/account -> HTTP 200).",
      summary: "verified",
      resolvedEnv: ["STRIPE_SECRET_KEY"],
      providerAccountOptions: [{ id: "acct_1", label: "Growthub", source: "/v1/account" }],
      selectedProviderAccountId: "acct_1",
      selectedProviderAccountLabel: "Growthub",
      providerAccountSource: "/v1/account",
    },
  });
  assert.equal(row.integrationId, STRIPE_PROVIDER_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.status, "connected");
  assert.equal(row.requiredEnv, "STRIPE_SECRET_KEY");
  assert.ok(!JSON.stringify(row).includes(SECRET), "provider row must not embed token values");
});

// ---------------------------------------------------------------------------
// First-party canvas node (stripe-commerce) — graph contract + source truth.
// ---------------------------------------------------------------------------

test("stripe-commerce is a known capability node with a working extractor", async () => {
  const graphLib = await import(pathToFileURL(path.join(kitLib, "orchestration-graph.js")).href);
  assert.ok(graphLib.CAPABILITY_NODE_TYPES.includes("stripe-commerce"));
  const graph = {
    provider: "growthub-native",
    version: 1,
    nodes: [
      { id: "input", type: "input", config: {} },
      { id: "stripe", type: "stripe-commerce", config: { registryId: "stripe-payments", operation: "list-payment-intents" } },
      { id: "result", type: "tool-result", config: {} },
    ],
    edges: [{ from: "input", to: "stripe" }, { from: "stripe", to: "result" }],
  };
  const node = graphLib.extractStripeCommerceNode(graph);
  assert.equal(node?.config?.operation, "list-payment-intents");
  const verdict = graphLib.validateOrchestrationGraph(graph);
  assert.equal(verdict.ok, true, `stripe-commerce satisfies the executable-node rule: ${JSON.stringify(verdict.errors || [])}`);
});

test("runner keeps the stripe-commerce node read-only and additive", async () => {
  const { readFileSync } = await import("node:fs");
  const runnerSource = readFileSync(path.join(kitLib, "orchestration-graph-runner.js"), "utf8");
  assert.ok(runnerSource.includes('const STRIPE_COMMERCE_OPERATIONS = ["list-payment-intents", "list-customers", "list-products", "retrieve-balance"]'), "read-only allowlist");
  assert.ok(runnerSource.includes("executeStripeCommerce"), "dedicated executor present");
  assert.ok(/executeStripeCommerce[\s\S]*?method: "GET"/.test(runnerSource), "executor only issues GET requests");
  assert.ok(runnerSource.includes("CAPABILITY_NODE_EXECUTORS"), "bespoke executors bind through the single dispatch registry");
  assert.ok(/registryCallNode\?\.config \? registryCallNode : null/.test(runnerSource), "api-registry-call keeps precedence (additive dispatch)");
  const surfaceSource = readFileSync(path.join(kitLib, "..", "app/workflows/WorkflowSurface.jsx"), "utf8");
  assert.ok(surfaceSource.includes("listInstalledNodeSurfaces"), "palette section derives from the manifest layer + governed rows");
  assert.ok(surfaceSource.includes("listInstalledApiRequestVariants"), "long-tail rows surface as bounded API Request variants");
  assert.ok(!surfaceSource.includes("CAPABILITY_NODE_ACTIONS"), "no hardcoded palette entries remain in the canvas surface");
});

// ---------------------------------------------------------------------------
// /settings/apps governed link surface — source truth.
// ---------------------------------------------------------------------------

test("settings/apps derives the commerce-lane external link from governed rows", async () => {
  const { readFileSync } = await import("node:fs");
  const appsPageSource = readFileSync(path.join(kitLib, "..", "app/settings/apps/page.jsx"), "utf8");
  assert.ok(appsPageSource.includes("listInstalledCommerceProducts(workspaceConfig)"), "installed+verified rule reused from the marketplace lane");
  assert.ok(appsPageSource.includes("commerceProductLink"), "commerce-lane link builder present");
  assert.ok(appsPageSource.includes("getMarketplaceProduct"), "icon/console derive from the one provider definition");
  assert.ok(!appsPageSource.includes("STRIPE_SECRET_KEY"), "no secret env names hardcoded into the page");
});
