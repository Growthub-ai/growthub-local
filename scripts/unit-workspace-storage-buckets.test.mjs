#!/usr/bin/env node
/**
 * Unit coverage for the Supabase Storage bucket product (second product on
 * the Supabase provider) — pure lib + governed grammar + gate causation +
 * source-truth on the route/component.
 *
 *   - product identity / lane / gating declared once in workspace-add-ons.js
 *   - bucket name normalization + create-request validation (deterministic
 *     clean setup: name, access default-private, MIME allowlist, size limit)
 *   - governed buckets object with the 1:1 linked-table correlation relation
 *   - inventory merge + CDN URL derivation + secret-absence
 *   - deriveBucketProductState gate walk (provider-required → link-required →
 *     ready → active)
 *   - source-truth: storage route is operator-gated, receipted, gated, and
 *     never serializes a secret; BucketManager routes through the governed door
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-workspace-storage-buckets.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitApp = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);
const kitLib = path.join(kitApp, "lib");

const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const buckets = await import(pathToFileURL(path.join(kitLib, "workspace-storage-buckets.js")).href);

const {
  bucketsObjectId,
  normalizeBucketName,
  validateBucketRequest,
  bucketCdnBaseUrl,
  parseBucketInventory,
  buildBucketRow,
  buildBucketsObject,
  mergeBucketsIntoRows,
  deriveBucketProductState,
  withBucketsObject,
  findBucketsObject,
  listLinkableTables,
} = buckets;

const SERVICE_KEY = "sb_service_role_secret_do_not_leak";

test("Supabase provider now exposes two products on distinct lanes (Upstash mirror)", () => {
  const provider = addOns.getMarketplaceProvider("supabase");
  const ids = provider.products.map((p) => p.productId);
  assert.deepEqual(ids, ["supabase-postgrest", "supabase-storage"]);
  const storage = addOns.getMarketplaceProduct("supabase", "supabase-storage");
  assert.equal(storage.executionLane, "workspace-storage");
  assert.equal(storage.connectorKind, "supabase-storage");
  assert.equal(storage.requiresProduct, "supabase-postgrest");
  assert.deepEqual(storage.requiredEnv, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "same account credentials as the database product");
  assert.equal(storage.probe.tokenHeaderName, "apikey");
  // The storage product row builds through the same generic builder.
  const row = addOns.makeMarketplaceProductRow({ providerId: "supabase", productId: "supabase-storage" });
  assert.equal(row.executionLane, "workspace-storage");
  assert.equal(row.authHeaderName, "apikey");
});

test("normalizeBucketName gives a stable 1:1 slug", () => {
  assert.equal(normalizeBucketName("My Uploads"), "my-uploads");
  assert.equal(normalizeBucketName("Brand__Assets.v2"), "brand__assets.v2"); // underscores are legal Supabase chars
  assert.equal(normalizeBucketName("--Leading.Trailing--"), "leading.trailing");
  assert.equal(normalizeBucketName("ab"), "ab"); // best-effort slug; validateBucketRequest enforces the 3–63 length
});

test("validateBucketRequest enforces deterministic clean setup", () => {
  const ok = validateBucketRequest({ name: "My Uploads", access: "public", allowedMimeTypes: "image/png, image/*", fileSizeLimit: "10MB" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.request, { id: "my-uploads", name: "my-uploads", public: true, allowed_mime_types: ["image/png", "image/*"], file_size_limit: "10MB" });
  assert.equal(ok.access, "public");

  assert.equal(validateBucketRequest({ name: "ab" }).ok, false, "too-short name rejected");
  assert.equal(validateBucketRequest({ name: "docs", allowedMimeTypes: "notamime" }).ok, false, "bad MIME rejected");
  assert.equal(validateBucketRequest({ name: "docs", fileSizeLimit: "huge" }).ok, false, "bad size rejected");

  const dflt = validateBucketRequest({ name: "private-docs" });
  assert.equal(dflt.request.public, false, "default access is private (least privilege)");
  assert.equal(dflt.request.file_size_limit, "50MB", "default size limit");
});

test("bucketCdnBaseUrl only for public buckets", () => {
  assert.equal(bucketCdnBaseUrl("https://ref.supabase.co", "media", true), "https://ref.supabase.co/storage/v1/object/public/media");
  assert.equal(bucketCdnBaseUrl("https://ref.supabase.co", "media", false), "", "private buckets have no anonymous CDN URL");
});

test("parseBucketInventory reads the Storage list shape, garbage-safe", () => {
  const parsed = parseBucketInventory([
    { id: "media", name: "media", public: true, allowed_mime_types: ["image/*"], file_size_limit: "10MB", created_at: "t" },
    { name: "docs", public: false },
    "nope",
    null,
  ]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].public, true);
  assert.equal(parsed[1].id, "docs");
  assert.deepEqual(parseBucketInventory(null), []);
});

test("buildBucketsObject correlates 1:1 to the linked table; rows carry no secret", () => {
  const object = buildBucketsObject({ providerId: "supabase", integrationId: "supabase-storage", linkedTableObjectId: "supabase-apps", linkedTableLabel: "apps" });
  assert.equal(object.id, bucketsObjectId("supabase"));
  assert.equal(object.storageProduct, "supabase-storage");
  assert.equal(object.linkedTableObjectId, "supabase-apps");
  // Dynamic governed integration binding — the gating primitive, never manual.
  assert.equal(object.binding.mode, "integration", "buckets object uses the dynamic integration binding, not manual");
  assert.equal(object.binding.integrationId, "supabase-storage", "binding resolves through the product's api-registry row");
  assert.equal(object.binding.lane, "data-source");
  const rel = object.relations.find((r) => r.id === "bucket-linked-table");
  assert.ok(rel && rel.targetObjectId === "supabase-apps", "linked-table belongs-to relation");
  const row = buildBucketRow({ id: "media", name: "media", public: true, allowedMimeTypes: ["image/*"], fileSizeLimit: "10MB" }, { baseUrl: "https://ref.supabase.co", registryId: "supabase-storage", linkedTableObjectId: "supabase-apps", linkedRecordRef: "ext-1" });
  assert.equal(row.access, "public");
  assert.equal(row.cdnUrl, "https://ref.supabase.co/storage/v1/object/public/media");
  assert.equal(row.linkedTable, "supabase-apps");
  assert.equal(row.linkedRecordRef, "ext-1");
  assert.ok(!JSON.stringify(row).includes(SERVICE_KEY), "no secret in the row");
});

test("mergeBucketsIntoRows is idempotent and preserves the local linked record ref", () => {
  const object = buildBucketsObject({ providerId: "supabase", integrationId: "supabase-storage", linkedTableObjectId: "supabase-apps" });
  const first = mergeBucketsIntoRows({ rows: object.rows, buckets: [{ id: "media", name: "media", public: true }], baseUrl: "https://ref.supabase.co", registryId: "supabase-storage", linkedTableObjectId: "supabase-apps" });
  assert.equal(first.added, 1);
  const withRef = first.rows.map((r) => ({ ...r, linkedRecordRef: "ext-9" }));
  const second = mergeBucketsIntoRows({ rows: withRef, buckets: [{ id: "media", name: "media", public: false }], baseUrl: "https://ref.supabase.co", registryId: "supabase-storage", linkedTableObjectId: "supabase-apps" });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 1);
  assert.equal(second.rows[0].linkedRecordRef, "ext-9", "local correlation preserved across sync");
  assert.equal(second.rows[0].access, "private", "external truth updates access");
});

test("deriveBucketProductState walks the gate: provider → link → ready → active", () => {
  const emptyProvider = deriveBucketProductState({}, "supabase", { providerConnected: false });
  assert.equal(emptyProvider.state, "provider-required");

  const noTable = deriveBucketProductState({ dataModel: { objects: [] } }, "supabase", { providerConnected: true, linkableCount: 0 });
  assert.equal(noTable.state, "link-required");
  assert.ok(noTable.causeChain.some((l) => l.includes("no governed data table")));

  const linkedConfig = withBucketsObject({ dataModel: { objects: [] } }, buildBucketsObject({ providerId: "supabase", integrationId: "supabase-storage", linkedTableObjectId: "supabase-apps", linkedTableLabel: "apps" })).config;
  const ready = deriveBucketProductState(linkedConfig, "supabase", { providerConnected: true, linkableCount: 1 });
  assert.equal(ready.state, "ready");

  const withBucket = findBucketsObject(linkedConfig, "supabase");
  withBucket.rows = [buildBucketRow({ id: "media", name: "media", public: true }, { registryId: "supabase-storage" })];
  const active = deriveBucketProductState(withBucketsObject(linkedConfig, withBucket).config, "supabase", { providerConnected: true, linkableCount: 1 });
  assert.equal(active.state, "active");
  assert.equal(active.bucketCount, 1);
});

test("listLinkableTables excludes the buckets object and other storage products", () => {
  const config = {
    dataModel: {
      objects: [
        { id: "supabase-apps", objectType: "data-source", label: "apps", externalTable: "apps" },
        { id: "supabase-buckets", objectType: "data-source", label: "Buckets", storageProduct: "supabase-storage" },
        { id: "clients", objectType: "custom", label: "Clients" },
      ],
    },
  };
  const linkable = listLinkableTables(config, { excludeId: "supabase-buckets" });
  assert.deepEqual(linkable.map((t) => t.objectId), ["supabase-apps"]);
});

// ---------------------------------------------------------------------------
// Source-truth assertions (route + component ARE the contract — read them).
// ---------------------------------------------------------------------------

const storageRouteSource = readFileSync(path.join(kitApp, "app/api/workspace/add-ons/[providerId]/storage/route.js"), "utf8");
const managerSource = readFileSync(path.join(kitApp, "app/data-model/components/BucketManager.jsx"), "utf8");

test("storage route: operator-gated, gated on provider+link, receipted, secret-safe", () => {
  const handlers = storageRouteSource.match(/async function (GET|POST|DELETE)/g) || [];
  assert.deepEqual(handlers.sort(), ["async function DELETE", "async function GET", "async function POST"]);
  const gateCount = (storageRouteSource.match(/requireWorkspaceOperator\(request\)/g) || []).length;
  assert.ok(gateCount >= 3, `every handler operator-gated (found ${gateCount})`);
  assert.ok(storageRouteSource.includes('kind: "workspace-add-on-storage"'), "canonical receipt kind");
  assert.ok(storageRouteSource.includes("provider_not_connected") && storageRouteSource.includes("storage_table_not_linked"), "hard gates receipted as blocked");
  assert.ok(storageRouteSource.includes("readWorkspaceConfig") && storageRouteSource.includes("writeWorkspaceConfig"), "canonical read → pure → write");
  assert.ok(storageRouteSource.includes("validateBucketRequest("), "create validated by the pure core");
  assert.ok(!/localStorage|sessionStorage/.test(storageRouteSource), "no browser storage");
  assert.ok(!/console\.log\(.*secret/i.test(storageRouteSource), "no secret logging");
});

test("BucketManager: no-code creation routes through the governed door, no client secret", () => {
  assert.ok(managerSource.includes('action: "create-bucket"') || managerSource.includes('"create-bucket"'), "create action posted");
  assert.ok(managerSource.includes("/api/workspace/add-ons/") && managerSource.includes("/storage"), "targets the governed storage route");
  assert.ok(managerSource.includes("onWorkspaceConfig"), "swaps in the returned governed config");
  assert.ok(!/SERVICE_ROLE|service_role|apikey/.test(managerSource), "no service credential in the client");
  assert.ok(!/localStorage|sessionStorage/.test(managerSource), "no browser storage");
});
