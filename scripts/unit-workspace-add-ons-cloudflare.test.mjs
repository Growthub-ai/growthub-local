#!/usr/bin/env node
/**
 * Unit coverage for the official Cloudflare marketplace provider (V1) — the
 * second occupant of the storage lane (R2), proving the storage-door grammar
 * is provider-generic and adding the declared path-template probe contract:
 *   - provider/product identity + workspace-storage lane grammar
 *   - bearer accountProbe (token verify + accounts listing) incl. the
 *     offline-QA baseUrlEnv override and the aliasEnv write
 *     (CLOUDFLARE_API_KEY ← CLOUDFLARE_API_TOKEN)
 *   - probe.pathEnv contract: {accountId} resolves from CLOUDFLARE_ACCOUNT_ID
 *     server-side (resolveProbePaths), missing refs fail honestly by NAME
 *   - parseR2BucketInventory: both documented v4 envelope variants
 *   - lane derivation: R2 joins listInstalledStorageProducts next to Supabase
 *   - secret rule: rows carry env-ref NAMES only, never values
 *   - source truth: the storage door dispatches the cloudflare-storage
 *     adapter, refuses public access honestly, and the marketplace drawer
 *     detects storage products by LANE
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-workspace-add-ons-cloudflare.test.mjs
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
const storage = await import(pathToFileURL(path.join(kitLib, "workspace-storage-buckets.js")).href);
const serverSecrets = await import(pathToFileURL(path.join(kitLib, "server-secrets.js")).href);

const {
  CLOUDFLARE_PRODUCTS,
  CLOUDFLARE_PROVIDER_INTEGRATION_ID,
  CLOUDFLARE_R2_INTEGRATION_ID,
  SUPABASE_STORAGE_INTEGRATION_ID,
  WORKSPACE_STORAGE_LANE,
  deriveWorkspaceAddOnsState,
  getMarketplaceProvider,
  getMarketplaceProduct,
  listInstalledStorageProducts,
  listProviderProductReadiness,
  makeMarketplaceProductRow,
  makeMarketplaceProviderRow,
  resolveProbePaths,
  withMarketplaceProductRegistry,
} = addOns;

const SECRET = "cf_token_placeholder_not_a_real_secret";
const ACCOUNT = "0123456789abcdef0123456789abcdef";

function emptyConfig() {
  return { dataModel: { objects: [] } };
}

test("cloudflare provider registers with the canonical marketplace identity", () => {
  const provider = getMarketplaceProvider("cloudflare");
  assert.ok(provider, "cloudflare provider must resolve by providerId");
  assert.equal(provider.integrationId, CLOUDFLARE_PROVIDER_INTEGRATION_ID);
  assert.equal(provider.authRef, "CLOUDFLARE");
  assert.equal(provider.executionLane, "workspace-provider");
  assert.equal(provider.accountProbe?.authMode, "bearer");
  assert.equal(provider.accountProbe?.tokenEnv, "CLOUDFLARE_API_TOKEN");
  assert.equal(provider.accountProbe?.baseUrlEnv, "CLOUDFLARE_API_URL", "offline-QA base override declared");
  assert.ok(provider.accountProbe?.paths.includes("/client/v4/user/tokens/verify"), "Cloudflare's own token-health endpoint");
  assert.deepEqual(provider.accountProbe?.aliasEnv, { CLOUDFLARE_API_KEY: "CLOUDFLARE_API_TOKEN" });
  const fieldsById = Object.fromEntries(provider.accountSetupFields.map((field) => [field.id, field]));
  assert.equal(fieldsById.apiToken.credentialRole, "bearerToken");
  assert.equal(fieldsById.apiToken.type, "password", "secret-bearing field renders as password");
  assert.equal(fieldsById.accountId.credentialRole, "teamScope", "account id is a scope value, never a secret");
  assert.equal(fieldsById.accountId.type, "text");
  assert.equal(getMarketplaceProvider(CLOUDFLARE_PROVIDER_INTEGRATION_ID)?.providerId, "cloudflare");
});

test("aliasEnv target is a canonical readServerSecret(CLOUDFLARE) candidate", () => {
  const candidates = serverSecrets.envKeyCandidates("CLOUDFLARE");
  assert.ok(candidates.includes("CLOUDFLARE_API_KEY"), `CLOUDFLARE_API_KEY in ${candidates}`);
  const hit = serverSecrets.readServerSecret("CLOUDFLARE", { CLOUDFLARE_API_KEY: SECRET });
  assert.equal(hit?.key, "CLOUDFLARE_API_KEY");
});

test("cloudflare-r2 product declares the storage lane + path-template grammar", () => {
  const product = getMarketplaceProduct("cloudflare", "cloudflare-r2");
  assert.ok(product, "cloudflare-r2 resolves");
  assert.equal(product.integrationId, CLOUDFLARE_R2_INTEGRATION_ID);
  assert.equal(product.authRef, "CLOUDFLARE");
  assert.equal(product.connectorKind, "cloudflare-storage");
  assert.equal(product.executionLane, WORKSPACE_STORAGE_LANE, "SAME lane as Supabase Storage — lane grammar is provider-generic");
  assert.deepEqual(product.requiredEnv, ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]);
  assert.ok(!["inbound-webhook", "api-request", "serverless-scheduler"].includes(product.executionLane));
  // Probe: account-scoped R2 path via the declared pathEnv contract.
  assert.equal(product.probe.baseUrlEnv, "CLOUDFLARE_API_URL");
  assert.equal(product.probe.tokenEnv, "CLOUDFLARE_API_TOKEN");
  assert.deepEqual(product.probe.paths, ["/client/v4/accounts/{accountId}/r2/buckets"]);
  assert.deepEqual(product.probe.pathEnv, { accountId: "CLOUDFLARE_ACCOUNT_ID" });
  assert.equal(product.probe.fallbackBaseUrl, "https://api.cloudflare.com");
});

test("resolveProbePaths substitutes declared refs and fails honestly by NAME", () => {
  const probe = getMarketplaceProduct("cloudflare", "cloudflare-r2").probe;
  const resolved = resolveProbePaths(probe, { CLOUDFLARE_ACCOUNT_ID: ACCOUNT });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.paths, [`/client/v4/accounts/${ACCOUNT}/r2/buckets`]);

  const missing = resolveProbePaths(probe, {});
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missingEnv, ["CLOUDFLARE_ACCOUNT_ID"]);
  assert.deepEqual(missing.paths, [], "never fetch a literal {placeholder} URL");

  // Values are URL-encoded — a hostile env value cannot break out of the path.
  const encoded = resolveProbePaths(probe, { CLOUDFLARE_ACCOUNT_ID: "a/b?c" });
  assert.deepEqual(encoded.paths, ["/client/v4/accounts/a%2Fb%3Fc/r2/buckets"]);

  // Probes without pathEnv pass through untouched (every existing provider).
  const passthrough = resolveProbePaths({ paths: ["/v1/account"] }, {});
  assert.deepEqual(passthrough, { ok: true, paths: ["/v1/account"], missingEnv: [] });
});

test("parseR2BucketInventory accepts both documented v4 envelope variants", () => {
  const nested = storage.parseR2BucketInventory({
    result: { buckets: [{ name: "workspace-assets", creation_date: "2026-07-04T00:00:00.000Z" }] },
    success: true,
  });
  assert.equal(nested.length, 1);
  assert.equal(nested[0].id, "workspace-assets");
  assert.equal(nested[0].public, false, "R2 buckets are private at the API level");
  assert.equal(nested[0].createdAt, "2026-07-04T00:00:00.000Z");

  const flat = storage.parseR2BucketInventory({ result: [{ name: "media" }] });
  assert.equal(flat.length, 1);
  assert.equal(flat[0].id, "media");

  assert.deepEqual(storage.parseR2BucketInventory(null), []);
  assert.deepEqual(storage.parseR2BucketInventory({ result: "nope" }), []);
});

test("bucket rows built from R2 inventory keep the same governed shape", () => {
  const buckets = storage.parseR2BucketInventory({ result: { buckets: [{ name: "workspace-assets" }] } });
  const merge = storage.mergeBucketsIntoRows({
    rows: [],
    buckets,
    baseUrl: "",
    registryId: CLOUDFLARE_R2_INTEGRATION_ID,
    linkedTableObjectId: "cloudflare-storage-files",
    nowIso: "2026-07-04T00:00:00.000Z",
  });
  assert.equal(merge.added, 1);
  const row = merge.rows[0];
  assert.equal(row.bucketId, "workspace-assets");
  assert.equal(row.access, "private");
  assert.equal(row.cdnUrl, "", "no anonymous CDN URL is synthesized for R2");
  assert.equal(row.registryId, CLOUDFLARE_R2_INTEGRATION_ID);
  assert.equal(row.linkedTable, "cloudflare-storage-files");
});

test("readiness resolves through the canonical concrete-key env contract", () => {
  const missing = listProviderProductReadiness("cloudflare", {});
  assert.equal(missing.length, CLOUDFLARE_PRODUCTS.length);
  assert.equal(missing[0].configured, false);
  assert.deepEqual(missing[0].missingEnv, ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]);

  const ready = listProviderProductReadiness("cloudflare", {
    CLOUDFLARE_API_TOKEN: SECRET,
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
  });
  assert.equal(ready[0].configured, true);
  assert.deepEqual(ready[0].missingEnv, []);
});

test("generic product row builds with refs only and upserts idempotently", () => {
  const syncResult = {
    ok: true,
    testedAt: "2026-07-04T00:00:00.000Z",
    baseUrl: "https://api.cloudflare.com",
    proof: `Cloudflare R2 (Object Storage) probe /client/v4/accounts/${ACCOUNT}/r2/buckets returned HTTP 200`,
    summary: "Cloudflare R2 sync verified with a read-only REST probe.",
    resolvedEnv: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    selectedResourceId: "workspace-assets",
    selectedResourceLabel: "workspace-assets",
    selectedResourceSource: "/client/v4/accounts/{accountId}/r2/buckets",
  };
  const row = makeMarketplaceProductRow({ providerId: "cloudflare", productId: "cloudflare-r2", syncResult });
  assert.equal(row.integrationId, CLOUDFLARE_R2_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.executionLane, WORKSPACE_STORAGE_LANE);
  const rowText = JSON.stringify(row);
  assert.ok(!rowText.includes(SECRET), "row must not embed secret values");
  assert.ok(row.requiredEnv.includes("CLOUDFLARE_API_TOKEN"), "row carries env-ref NAMES");

  const first = withMarketplaceProductRegistry(emptyConfig(), { providerId: "cloudflare", productId: "cloudflare-r2", syncResult });
  const second = withMarketplaceProductRegistry(first, { providerId: "cloudflare", productId: "cloudflare-r2", syncResult: { ...syncResult, summary: "re-synced" } });
  const registry = second.dataModel.objects.find((o) => o.objectType === "api-registry");
  const rows = registry.rows.filter((r) => r.integrationId === CLOUDFLARE_R2_INTEGRATION_ID);
  assert.equal(rows.length, 1, "upsert is idempotent by integrationId");
});

test("R2 joins the storage lane NEXT TO supabase — lane capability is additive", () => {
  const syncResult = { ok: true, testedAt: "2026-07-04T00:00:00.000Z", proof: "probe ok", summary: "verified" };
  let config = withMarketplaceProductRegistry(emptyConfig(), { providerId: "supabase", productId: "supabase-storage", syncResult });
  config = withMarketplaceProductRegistry(config, { providerId: "cloudflare", productId: "cloudflare-r2", syncResult });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasWorkspaceStorageCapability, true);
  assert.equal(state.storageProducts.length, 2, "both storage products on one lane");
  assert.equal(state.hasSupabaseStorageCapability, true, "supabase-named capability untouched");
  assert.equal(state.hasCloudflareStorageCapability, true);
  assert.deepEqual(
    listInstalledStorageProducts(config).map((r) => r.integrationId).sort(),
    [CLOUDFLARE_R2_INTEGRATION_ID, SUPABASE_STORAGE_INTEGRATION_ID].sort(),
  );
});

test("unverified rows never grant the storage capability", () => {
  const config = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "cloudflare",
    productId: "cloudflare-r2",
    syncResult: null,
    authReady: false,
  });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasCloudflareStorageCapability, false);
  assert.equal(state.hasWorkspaceStorageCapability, false);
});

test("provider row builds from the bearer accountProbe env contract", () => {
  const row = makeMarketplaceProviderRow("cloudflare", {
    syncResult: {
      ok: true,
      testedAt: "2026-07-04T00:00:00.000Z",
      proof: "Cloudflare REST API account verified (GET /client/v4/user/tokens/verify -> HTTP 200).",
      summary: "verified",
      resolvedEnv: ["CLOUDFLARE_API_TOKEN"],
      providerAccountOptions: [{ id: ACCOUNT, label: "Growthub", source: "/client/v4/accounts" }],
      selectedProviderAccountId: ACCOUNT,
      selectedProviderAccountLabel: "Growthub",
      providerAccountSource: "/client/v4/accounts",
    },
  });
  assert.equal(row.integrationId, CLOUDFLARE_PROVIDER_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.ok(row.requiredEnv.includes("CLOUDFLARE_API_TOKEN"));
  assert.ok(!JSON.stringify(row).includes(SECRET), "provider row must not embed token values");
});

// ---------------------------------------------------------------------------
// Source truth: the storage door + marketplace drawer contract.
// ---------------------------------------------------------------------------

test("storage door dispatches the cloudflare adapter and stays honest", async () => {
  const { readFileSync } = await import("node:fs");
  const doorSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/[providerId]/storage/route.js"),
    "utf8",
  );
  assert.ok(doorSource.includes('"cloudflare-storage"'), "cloudflare-storage in the supported connector kinds");
  assert.ok(doorSource.includes('"supabase-storage"'), "supabase adapter untouched");
  assert.ok(doorSource.includes("no storage adapter yet"), "unknown kinds still refused honestly");
  assert.ok(doorSource.includes("parseR2BucketInventory"), "R2 inventory parses through the pure lib");
  assert.ok(doorSource.includes("resolveProbePaths"), "account-scoped paths resolve through the declared contract");
  assert.ok(doorSource.includes("supportsPublicAccess"), "public access is a declared adapter capability");
  assert.ok(doorSource.includes("public_access_unsupported"), "public R2 request is refused with a blocked receipt");
  assert.ok(doorSource.includes("findMarketplaceProviderRow"), "connect gate derives from the governed provider row (provider-agnostic)");
  assert.ok(!doorSource.includes("hasSupabaseProvider"), "no provider-hardcoded connect gate remains");
});

test("marketplace drawer detects storage products by LANE, not provider kind", async () => {
  const { readFileSync } = await import("node:fs");
  const marketplaceSource = readFileSync(
    path.join(kitLib, "..", "app/components/WorkspaceAddOnsMarketplace.jsx"),
    "utf8",
  );
  assert.ok(marketplaceSource.includes('activeProduct?.executionLane === "workspace-storage"'), "storage drawer gates by lane string");
  assert.ok(!marketplaceSource.includes('activeProduct?.connectorKind === "supabase-storage"'), "no connector-kind drawer gate remains");
});
