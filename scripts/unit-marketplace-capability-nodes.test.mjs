#!/usr/bin/env node
/**
 * RUNTIME coverage for the marketplace capability-node executors — real
 * execution through executeStripeCommerce / executeResendEmail with a
 * stubbed global fetch (success, provider failure, refusal, redaction, and
 * blocked-prerequisite states), NOT source-shape assertions. Also proves the
 * row-driven scale story: 1,000 discovered products install as governed rows
 * with unique ids, idempotent upserts, and ZERO new node types.
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-marketplace-capability-nodes.test.mjs
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

const runner = await import(pathToFileURL(path.join(kitLib, "orchestration-graph-runner.js")).href);
const graphLib = await import(pathToFileURL(path.join(kitLib, "orchestration-graph.js")).href);
const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);

const { executeStripeCommerce, executeResendEmail } = runner;
const {
  getMarketplaceProvider,
  listCapabilitySurfaces,
  listInstalledApiRequestVariants,
  listInstalledNodeSurfaces,
  listInstalledWidgetSurfaces,
  makeDiscoveredMarketplaceProduct,
  withDiscoveredMarketplaceProductRegistry,
  withMarketplaceProductRegistry,
} = addOns;

const STRIPE_SECRET = "sk_test_runtime_secret_do_not_leak";
const RESEND_SECRET = "re_runtime_secret_do_not_leak";

function verifiedConfig(providerId, productId) {
  return withMarketplaceProductRegistry({ dataModel: { objects: [] } }, {
    providerId,
    productId,
    syncResult: { ok: true, testedAt: "2026-07-05T00:00:00.000Z", proof: "probe ok", summary: "verified", baseUrl: "" },
  });
}

/** Run fn with a stubbed global fetch + env; always restores both. */
async function withStubbedRuntime({ env = {}, respond }, fn) {
  const originalFetch = globalThis.fetch;
  const savedEnv = {};
  const calls = [];
  for (const [key, value] of Object.entries(env)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const result = respond(String(url), init);
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    return { result: await fn(), calls };
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// stripe-commerce executor — runtime behavior
// ---------------------------------------------------------------------------

test("stripe-commerce runtime: happy path builds the real GET and returns the payload", async () => {
  const config = verifiedConfig("stripe", "stripe-payments");
  const { result, calls } = await withStubbedRuntime({
    env: { STRIPE_SECRET_KEY: STRIPE_SECRET, STRIPE_API_URL: "" },
    respond: () => ({ status: 200, body: { object: "list", data: [{ id: "pi_1", amount: 4200 }] } }),
  }, () => executeStripeCommerce(config, { registryId: "stripe-payments", operation: "list-payment-intents", queryTemplate: "limit={{input.limit}}" }, { limit: 5 }, 5000));
  assert.equal(result.ok, true);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.rawPayload.data[0].id, "pi_1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/payment_intents?limit=5", "input substitution reaches the query");
  assert.equal(calls[0].init.method, "GET", "read-only lane issues GET only");
  assert.equal(calls[0].init.headers.authorization, `Bearer ${STRIPE_SECRET}`, "secret resolves server-side");
  assert.equal(result.adapterMeta.authRefSlug, "STRIPE", "adapterMeta carries the ref slug, never the value");
  assert.ok(!JSON.stringify(result).includes(STRIPE_SECRET), "no secret value in the runtime envelope");
});

test("stripe-commerce runtime: non-allowlisted operations are refused without any fetch", async () => {
  const config = verifiedConfig("stripe", "stripe-payments");
  const { result, calls } = await withStubbedRuntime({
    env: { STRIPE_SECRET_KEY: STRIPE_SECRET },
    respond: () => ({ status: 200, body: {} }),
  }, () => executeStripeCommerce(config, { registryId: "stripe-payments", operation: "create-charge" }, {}, 5000));
  assert.equal(result.ok, false);
  assert.match(result.error, /read-only V1/);
  assert.equal(calls.length, 0, "refusal is structural — no request leaves the runner");
});

test("stripe-commerce runtime: provider 401 surfaces honestly, secret never leaks", async () => {
  const config = verifiedConfig("stripe", "stripe-payments");
  const { result } = await withStubbedRuntime({
    env: { STRIPE_SECRET_KEY: STRIPE_SECRET },
    respond: () => ({ status: 401, body: { error: { message: "Invalid API Key provided" } } }),
  }, () => executeStripeCommerce(config, { registryId: "stripe-payments", operation: "retrieve-balance" }, {}, 5000));
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 401);
  assert.equal(result.error, "HTTP 401");
  assert.ok(!JSON.stringify(result).includes(STRIPE_SECRET));
});

test("stripe-commerce runtime: blocked states — missing row, missing env", async () => {
  const noRow = await executeStripeCommerce({ dataModel: { objects: [] } }, { registryId: "stripe-payments", operation: "list-customers" }, {}, 5000);
  assert.equal(noRow.ok, false);
  assert.match(noRow.error, /install the Stripe product/);

  const config = verifiedConfig("stripe", "stripe-payments");
  const { result: noEnv } = await withStubbedRuntime({
    env: { STRIPE_SECRET_KEY: "", STRIPE_API_KEY: "", STRIPE_TOKEN: "", STRIPE: "" },
    respond: () => ({ status: 200, body: {} }),
  }, () => executeStripeCommerce(config, { registryId: "stripe-payments", operation: "list-customers" }, {}, 5000));
  assert.equal(noEnv.ok, false);
  assert.match(noEnv.error, /STRIPE_SECRET_KEY missing/, "blocked state names the env ref");
});

// ---------------------------------------------------------------------------
// resend-email executor — runtime behavior
// ---------------------------------------------------------------------------

test("resend-email runtime: happy path posts the send with env-resolved sender", async () => {
  const config = verifiedConfig("resend", "resend-email");
  const { result, calls } = await withStubbedRuntime({
    env: { RESEND_API_KEY: RESEND_SECRET, RESEND_FROM_EMAIL: "workflows@growthub.example", RESEND_API_URL: "" },
    respond: () => ({ status: 200, body: { id: "email_runtime_1" } }),
  }, () => executeResendEmail(config, {
    registryId: "resend-email",
    toTemplate: "{{input.email}}",
    subjectTemplate: "Order {{input.id}}",
    htmlTemplate: "<p>Thanks {{input.id}}</p>",
  }, { email: "customer@example.com", id: "42" }, 5000));
  assert.equal(result.ok, true);
  assert.equal(result.httpStatus, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.to, ["customer@example.com"], "input substitution reaches the recipient");
  assert.equal(sent.subject, "Order 42");
  assert.equal(sent.from, "workflows@growthub.example", "sender resolves from RESEND_FROM_EMAIL — no-code");
  assert.equal(result.adapterMeta.recipientCount, 1, "adapterMeta carries counts, never message bodies");
  assert.ok(!JSON.stringify(result).includes(RESEND_SECRET));
});

test("resend-email runtime: underspecified sends and missing sender are refused without fetch", async () => {
  const config = verifiedConfig("resend", "resend-email");
  const { result: missingBody, calls: calls1 } = await withStubbedRuntime({
    env: { RESEND_API_KEY: RESEND_SECRET, RESEND_FROM_EMAIL: "x@y.example" },
    respond: () => ({ status: 200, body: {} }),
  }, () => executeResendEmail(config, { registryId: "resend-email", toTemplate: "a@b.example", subjectTemplate: "" }, {}, 5000));
  assert.equal(missingBody.ok, false);
  assert.match(missingBody.error, /requires To, Subject/);
  assert.equal(calls1.length, 0);

  const { result: missingFrom, calls: calls2 } = await withStubbedRuntime({
    env: { RESEND_API_KEY: RESEND_SECRET, RESEND_FROM_EMAIL: "" },
    respond: () => ({ status: 200, body: {} }),
  }, () => executeResendEmail(config, { registryId: "resend-email", toTemplate: "a@b.example", subjectTemplate: "Hi", textTemplate: "hello" }, {}, 5000));
  assert.equal(missingFrom.ok, false);
  assert.match(missingFrom.error, /RESEND_FROM_EMAIL/, "blocked state names the env ref");
  assert.equal(calls2.length, 0);
});

test("resend-email runtime: provider failure surfaces honestly with redaction intact", async () => {
  const config = verifiedConfig("resend", "resend-email");
  const { result } = await withStubbedRuntime({
    env: { RESEND_API_KEY: RESEND_SECRET, RESEND_FROM_EMAIL: "x@y.example" },
    respond: () => ({ status: 422, body: { name: "validation_error", message: "domain is not verified" } }),
  }, () => executeResendEmail(config, { registryId: "resend-email", toTemplate: "a@b.example", subjectTemplate: "Hi", textTemplate: "hello" }, {}, 5000));
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 422);
  assert.ok(!JSON.stringify(result).includes(RESEND_SECRET));
});

// ---------------------------------------------------------------------------
// Manifest layer: surfaces declared once, derived everywhere
// ---------------------------------------------------------------------------

test("manifest: node surfaces derive from product definitions and governed rows", () => {
  const declared = listCapabilitySurfaces();
  const byIntegration = Object.fromEntries(declared.map((entry) => [entry.integrationId, entry]));
  assert.ok(byIntegration["stripe-payments"]?.surfaces.node.type === "stripe-commerce", "stripe declares its node surface");
  assert.ok(byIntegration["resend-email"]?.surfaces.node.type === "resend-email", "resend declares its node surface");
  assert.equal(byIntegration["resend-email"].surfaces.testDoor, "/api/workspace/add-ons/resend/messaging", "test door declared, not hardcoded in the pane contractless");
  assert.ok(declared.every((entry) => entry.surfaces.publishProofPolicy === "draft-test" || !entry.surfaces.publishProofPolicy), "publish proof policy stays the draft-test contract");

  // Palette derivation: nothing installed → no entries; installed → entry with badge.
  assert.deepEqual(listInstalledNodeSurfaces({ dataModel: { objects: [] } }), []);
  const config = verifiedConfig("stripe", "stripe-payments");
  const surfacesInstalled = listInstalledNodeSurfaces(config);
  assert.equal(surfacesInstalled.length, 1);
  assert.equal(surfacesInstalled[0].type, "stripe-commerce");
  assert.ok(surfacesInstalled[0].iconSrc.includes("stripe"), "palette entry carries the product badge");
});

test("manifest: widget surfaces gate on installed rows (stripe commerce)", () => {
  assert.deepEqual(listInstalledWidgetSurfaces({ dataModel: { objects: [] } }), []);
  const config = verifiedConfig("stripe", "stripe-payments");
  const widgets = listInstalledWidgetSurfaces(config);
  assert.ok(widgets.length >= 5, "stripe declares the commerce widget set");
  assert.ok(widgets.every((widget) => widget.integrationId === "stripe-payments"), "widgets bind to the governed row");
  const operations = new Set(widgets.map((widget) => widget.operation));
  for (const operation of operations) {
    assert.ok(["list-payment-intents", "retrieve-balance", "list-customers", "list-products"].includes(operation), `widget operation ${operation} stays inside the read-only allowlist`);
  }
});

test("long-tail variants: installed rows become bounded, searchable api-registry-call presets", () => {
  let config = verifiedConfig("stripe", "stripe-payments");
  config = withMarketplaceProductRegistry(config, {
    providerId: "resend",
    productId: "resend-email",
    syncResult: { ok: true, testedAt: "2026-07-05T00:00:00.000Z", proof: "probe ok", summary: "verified" },
  });
  const provider = getMarketplaceProvider("nango");
  for (let index = 0; index < 40; index += 1) {
    const product = makeDiscoveredMarketplaceProduct(provider, { unique_key: `svc-${index}`, provider: `svc-${index}`, display_name: `Service ${String(index).padStart(2, "0")}` });
    config = withDiscoveredMarketplaceProductRegistry(config, {
      providerId: "nango",
      product,
      syncResult: { ok: true, testedAt: "2026-07-05T00:00:00.000Z", proof: "probe ok", summary: "verified" },
    });
  }
  const page = listInstalledApiRequestVariants(config, { limit: 8 });
  assert.equal(page.total, 40, "bespoke-node products are EXCLUDED from the long-tail variants");
  assert.equal(page.variants.length, 8, "render list is bounded");
  assert.deepEqual(page.variants.map((v) => v.label), [...page.variants.map((v) => v.label)].sort(), "deterministic label order");
  const searched = listInstalledApiRequestVariants(config, { query: "Service 07", limit: 8 });
  assert.equal(searched.total, 1, "search narrows deterministically");
  assert.equal(searched.variants[0].integrationId, "nango-svc-7");
});

// ---------------------------------------------------------------------------
// Row-driven scale: 1,000 discovered products, zero new node types
// ---------------------------------------------------------------------------

test("1,000 discovered products install as governed rows — unique, idempotent, no new node types", () => {
  const provider = getMarketplaceProvider("nango");
  const nodeTypesBefore = new Set(graphLib.CAPABILITY_NODE_TYPES);

  const items = Array.from({ length: 1000 }, (_, index) => ({
    unique_key: `svc-${index}`,
    provider: `svc-${index}`,
    display_name: `Service ${index}`,
  }));
  const started = process.hrtime.bigint();
  const products = items.map((item) => makeDiscoveredMarketplaceProduct(provider, item));
  assert.equal(products.filter(Boolean).length, 1000, "every discovered item maps to a product");
  const ids = new Set(products.map((product) => product.productId));
  assert.equal(ids.size, 1000, "product ids are unique — no install collisions");

  let config = { dataModel: { objects: [] } };
  for (const product of products) {
    config = withDiscoveredMarketplaceProductRegistry(config, {
      providerId: "nango",
      product,
      syncResult: { ok: true, testedAt: "2026-07-05T00:00:00.000Z", proof: "probe ok", summary: "verified" },
    });
  }
  const registry = config.dataModel.objects.find((o) => o.objectType === "api-registry");
  assert.equal(registry.rows.length, 1000, "all 1,000 rows land in the registry");

  // Deterministic re-install: upserting the same product never duplicates.
  config = withDiscoveredMarketplaceProductRegistry(config, {
    providerId: "nango",
    product: products[500],
    syncResult: { ok: true, testedAt: "2026-07-05T00:00:01.000Z", proof: "probe ok", summary: "re-synced" },
  });
  const registry2 = config.dataModel.objects.find((o) => o.objectType === "api-registry");
  assert.equal(registry2.rows.length, 1000, "upsert is idempotent at scale");

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 30000, `scale path stays tractable (${Math.round(elapsedMs)}ms for 1,001 installs)`);

  // The long-tail contract: rows ride the EXISTING executable lanes
  // (connectorKind:"nango" → resolver/api-registry-call). Installing 1,000
  // products must not grow the curated node-type set.
  assert.deepEqual(Array.from(new Set(graphLib.CAPABILITY_NODE_TYPES)), Array.from(nodeTypesBefore), "no new node types from scale installs");
  assert.ok(products.every((product) => product.connectorKind === "nango"), "long-tail products stay on the row-driven lane");
  assert.equal(graphLib.CAPABILITY_NODE_TYPES.length, 3, "bespoke nodes remain a curated Tier-1 set (supabase-data, stripe-commerce, resend-email)");
});
