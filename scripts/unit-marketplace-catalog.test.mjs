#!/usr/bin/env node
/**
 * Unit coverage for the Governed Capability Binding generalization
 * (GOVERNED_CAPABILITY_BINDING_V1):
 *   - real catalog integrity (unique ids, valid auth scheme / node surface / lane)
 *   - the auth-scheme atom: bearer / basic / header(custom) / header(raw) + extra
 *     headers, with the SECRET RULE (value only in headers, never in resolvedEnv)
 *   - per-project host resolution (Supabase baseUrlEnv) + path interpolation (Twilio)
 *   - generic product + provider registry writes for bearer (Vercel) and
 *     header+baseUrlEnv (Supabase) providers
 *   - Upstash regression: the QStash path is byte-for-byte unchanged
 *
 * Pure / offline — no network, no fs, no Next runtime.
 *
 * Run with:  node --test scripts/unit-marketplace-catalog.test.mjs
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
const catalog = await import(pathToFileURL(path.join(kitLib, "marketplace-catalog.js")).href);
const binding = await import(pathToFileURL(path.join(kitLib, "capability-binding.js")).href);

const { MARKETPLACE_CATALOG_PROVIDERS, CAPABILITY_AUTH_SCHEMES, CAPABILITY_NODE_SURFACES } = catalog;
const { buildProviderAuthHeaders, buildCapabilityProbeRequests, interpolatePath, resolveCapabilityBaseUrl } = binding;

/* ---------- catalog integrity ---------- */
test("every catalog provider carries the governed capability atoms", () => {
  assert.ok(MARKETPLACE_CATALOG_PROVIDERS.length >= 12, "catalog seeds the real provider universe");
  for (const provider of MARKETPLACE_CATALOG_PROVIDERS) {
    assert.ok(provider.providerId, "providerId");
    assert.ok(provider.integrationId, `${provider.providerId}: integrationId`);
    assert.ok(provider.authRef, `${provider.providerId}: authRef`);
    assert.ok(provider.category, `${provider.providerId}: category`);
    assert.ok(CAPABILITY_AUTH_SCHEMES.includes(provider.auth?.scheme), `${provider.providerId}: valid auth scheme`);
    assert.ok(Array.isArray(provider.products) && provider.products.length, `${provider.providerId}: has products`);
    // Base URL is either a fixed https host or resolved per-project from an env key.
    const perProject = Boolean(provider.accountProbe?.baseUrlEnv);
    assert.ok(perProject || /^https:\/\//.test(provider.baseUrl), `${provider.providerId}: https baseUrl or baseUrlEnv`);
    for (const product of provider.products) {
      assert.ok(product.integrationId, `${provider.providerId}: product integrationId`);
      assert.ok(product.executionLane, `${product.integrationId}: executionLane`);
      assert.ok(Array.isArray(product.requiredEnv), `${product.integrationId}: requiredEnv[]`);
      assert.equal(product.nodeSurface, CAPABILITY_NODE_SURFACES.API_CALL, `${product.integrationId}: api-registry-call node surface`);
      assert.ok(CAPABILITY_AUTH_SCHEMES.includes(product.auth?.scheme), `${product.integrationId}: valid product auth scheme`);
    }
  }
});

test("all integrationIds are globally unique (no resolver-id collision)", () => {
  const ids = [];
  for (const provider of addOns.MARKETPLACE_PROVIDERS) {
    ids.push(provider.integrationId);
    for (const product of provider.products || []) ids.push(product.integrationId);
  }
  assert.equal(new Set(ids).size, ids.length, `duplicate integrationId: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
});

test("catalog merges into MARKETPLACE_PROVIDERS with Upstash still first", () => {
  assert.equal(addOns.MARKETPLACE_PROVIDERS[0].providerId, "upstash", "Upstash stays the lead provider");
  assert.ok(addOns.getMarketplaceProvider("vercel"), "vercel resolvable");
  assert.ok(addOns.getMarketplaceProvider("supabase"), "supabase resolvable");
  assert.ok(addOns.getMarketplaceProduct("vercel", "vercel-deployments"), "vercel product resolvable");
});

/* ---------- auth-scheme atom ---------- */
test("bearer scheme builds Authorization: Bearer <token>", () => {
  const r = buildProviderAuthHeaders({ scheme: "bearer", headerName: "Authorization", prefix: "Bearer ", tokenEnv: "VERCEL_TOKEN" }, { VERCEL_TOKEN: "tok_secret" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.headers.authorization, "Bearer tok_secret");
  assert.deepEqual(r.resolvedEnv, ["VERCEL_TOKEN"]);
  assert.deepEqual(r.missingEnv, []);
});

test("header(custom) scheme builds a custom header (Postmark)", () => {
  const r = buildProviderAuthHeaders({ scheme: "header", headerName: "X-Postmark-Server-Token", prefix: "", tokenEnv: "POSTMARK_SERVER_TOKEN" }, { POSTMARK_SERVER_TOKEN: "pm_secret" });
  assert.equal(r.headers["x-postmark-server-token"], "pm_secret");
  assert.equal(r.headers.authorization, undefined, "custom-header providers must not also send Authorization");
});

test("header(raw) scheme sends the raw key in Authorization with no prefix (Linear)", () => {
  const r = buildProviderAuthHeaders({ scheme: "header", headerName: "Authorization", prefix: "", tokenEnv: "LINEAR_API_KEY", extraHeaders: { "content-type": "application/json" } }, { LINEAR_API_KEY: "lin_secret" });
  assert.equal(r.headers.authorization, "lin_secret", "Linear passes the raw key, NOT Bearer <key>");
  assert.equal(r.headers["content-type"], "application/json");
});

test("basic scheme builds Basic base64(user:pass) (Twilio)", () => {
  const r = buildProviderAuthHeaders({ scheme: "basic", headerName: "Authorization", userEnv: "TWILIO_ACCOUNT_SID", passEnv: "TWILIO_AUTH_TOKEN" }, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok" });
  assert.equal(r.headers.authorization, `Basic ${Buffer.from("AC1:tok").toString("base64")}`);
  assert.deepEqual(r.resolvedEnv.sort(), ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);
});

test("extra headers (version pins) ride onto the request (Anthropic/Notion)", () => {
  const r = buildProviderAuthHeaders({ scheme: "header", headerName: "x-api-key", prefix: "", tokenEnv: "ANTHROPIC_API_KEY", extraHeaders: { "anthropic-version": "2023-06-01" } }, { ANTHROPIC_API_KEY: "sk-ant" });
  assert.equal(r.headers["x-api-key"], "sk-ant");
  assert.equal(r.headers["anthropic-version"], "2023-06-01");
});

test("missing credentials report the missing KEY names and never fabricate a header", () => {
  const r = buildProviderAuthHeaders({ scheme: "bearer", headerName: "Authorization", tokenEnv: "STRIPE_SECRET_KEY" }, {});
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingEnv, ["STRIPE_SECRET_KEY"]);
  assert.equal(r.headers.authorization, undefined);
});

test("SECRET RULE: the token value appears ONLY in headers, never in resolvedEnv/missingEnv", () => {
  const r = buildProviderAuthHeaders({ scheme: "bearer", headerName: "Authorization", prefix: "Bearer ", tokenEnv: "OPENAI_API_KEY" }, { OPENAI_API_KEY: "sk-super-secret-value" });
  assert.ok(r.headers.authorization.includes("sk-super-secret-value"));
  assert.ok(!JSON.stringify(r.resolvedEnv).includes("sk-super-secret-value"), "resolvedEnv must be key names only");
  assert.ok(!JSON.stringify(r.missingEnv).includes("sk-super-secret-value"));
});

/* ---------- per-project host + path interpolation ---------- */
test("Supabase host resolves from SUPABASE_URL (baseUrlEnv), blocks when absent", () => {
  const supabase = addOns.getMarketplaceProvider("supabase");
  const withHost = buildCapabilityProbeRequests(supabase.accountProbe, supabase, { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc" });
  assert.equal(withHost.ok, true, JSON.stringify(withHost));
  assert.ok(withHost.requests[0].url.startsWith("https://abc.supabase.co/rest/v1"), withHost.requests[0].url);
  assert.equal(withHost.requests[0].headers.apikey, "svc");
  const noHost = buildCapabilityProbeRequests(supabase.accountProbe, supabase, { SUPABASE_SERVICE_ROLE_KEY: "svc" });
  assert.equal(noHost.ok, false);
  assert.ok(noHost.missingEnv.includes("SUPABASE_URL"));
});

test("Twilio path template interpolates the account SID from env", () => {
  assert.equal(interpolatePath("/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json", { TWILIO_ACCOUNT_SID: "AC9" }), "/Accounts/AC9/Messages.json");
  // unbound placeholders are left intact so callers can detect them
  assert.equal(interpolatePath("/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json", {}), "/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json");
});

test("Linear GraphQL probe carries the viewer body + content-type", () => {
  const linear = addOns.getMarketplaceProvider("linear");
  const r = buildCapabilityProbeRequests(linear.accountProbe, linear, { LINEAR_API_KEY: "lin_key" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.requests[0].method, "POST");
  assert.match(r.requests[0].body, /viewer/);
  assert.equal(r.requests[0].headers.authorization, "lin_key");
});

/* ---------- generic registry writes (the governed API Registry object) ---------- */
function emptyConfig() {
  return { dataModel: { objects: [{ id: "api-registry", objectType: "api-registry", columns: ["Name"], rows: [] }] } };
}

test("Vercel (bearer) product registers a governed API Registry row via the generic path", () => {
  const syncResult = { ok: true, syncStatus: "verified", status: "connected", proof: "GET /v6/deployments 200", testedAt: "2026-07-01T00:00:00Z", summary: "Vercel Deployments verified." };
  const next = addOns.withMarketplaceProductRegistry(emptyConfig(), { providerId: "vercel", productId: "vercel-deployments", syncResult });
  const row = addOns.findRegistryRowByIntegrationId(next, "vercel-deployments");
  assert.ok(row, "vercel product row written");
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.executionLane, "deploy");
  assert.equal(row.nodeSurface, "api-registry-call", "capability correlates to a canvas node surface");
  assert.equal(row.schemaVersion, "growthub-marketplace-vercel-v1");
  assert.equal(row.region, "", "non-region product carries no region");
});

test("Supabase (header + baseUrlEnv) product registers with its resolved base URL", () => {
  const syncResult = { ok: true, syncStatus: "verified", proof: "GET /rest/v1/ 200", testedAt: "t", summary: "ok", baseUrl: "https://abc.supabase.co" };
  const next = addOns.withMarketplaceProductRegistry(emptyConfig(), { providerId: "supabase", productId: "supabase-postgrest", syncResult });
  const row = addOns.findRegistryRowByIntegrationId(next, "supabase-postgrest");
  assert.ok(row);
  assert.equal(row.executionLane, "workspace-data");
  assert.equal(row.baseUrl, "https://abc.supabase.co");
  assert.equal(row.requiredEnv, "SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY");
});

test("provider row derives account env from the auth atom (bearer + basic + baseUrlEnv)", () => {
  const vercelRow = addOns.makeMarketplaceProviderRow("vercel", { syncResult: { ok: true, syncStatus: "verified", proof: "p", testedAt: "t" } });
  assert.equal(vercelRow.requiredEnv, "VERCEL_TOKEN");
  assert.equal(vercelRow.scheduleId, undefined, "provider row is capability-only, never owns a schedule");
  const supabaseRow = addOns.makeMarketplaceProviderRow("supabase", {});
  assert.equal(supabaseRow.requiredEnv, "SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY");
  const twilioRow = addOns.makeMarketplaceProviderRow("twilio", {});
  assert.equal(twilioRow.requiredEnv, "TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN");
});

test("listProviderProductReadiness works for a generic bearer provider", () => {
  const ready = addOns.listProviderProductReadiness("vercel", { VERCEL_TOKEN: "x" }).find((r) => r.productId === "vercel-deployments");
  assert.equal(ready.configured, true);
  const notReady = addOns.listProviderProductReadiness("vercel", {}).find((r) => r.productId === "vercel-deployments");
  assert.equal(notReady.configured, false);
  assert.deepEqual(notReady.missingEnv, ["VERCEL_TOKEN"]);
});

/* ---------- Upstash regression: the QStash path is unchanged ---------- */
test("Upstash QStash product row is byte-for-byte unchanged by the generalization", () => {
  const row = addOns.makeUpstashProductRow({ productId: "upstash-qstash", region: "eu-west-1", authReady: true });
  assert.equal(row.integrationId, "upstash-qstash-workflow");
  assert.equal(row.executionLane, "serverless-scheduler");
  assert.equal(row.region, "eu-west-1", "QStash keeps its region");
  assert.equal(row.schemaVersion, "growthub-marketplace-upstash-v1");
  assert.equal(row.baseUrl, "https://qstash-eu-west-1.upstash.io");
});

test("Upstash readiness still needs only the token", () => {
  const ready = addOns.listUpstashProductReadiness({ QSTASH_TOKEN: "t" }).find((r) => r.productId === "upstash-qstash");
  assert.equal(ready.configured, true);
});

test("scheduler detection is NOT triggered by any new catalog product (lane guard holds)", () => {
  // Only serverless-scheduler lane products are schedulers; every catalog product
  // is a different lane, so none can be mistaken for a QStash schedule.
  for (const provider of MARKETPLACE_CATALOG_PROVIDERS) {
    for (const product of provider.products) {
      assert.notEqual(product.executionLane, "serverless-scheduler", `${product.integrationId} must not claim the scheduler lane`);
    }
  }
});
