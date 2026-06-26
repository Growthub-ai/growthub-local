#!/usr/bin/env node
/**
 * Unit coverage for the governed Add-ons scheduler loop (PR #257 completion):
 *   - deterministic schedule id (idempotent upsert key)
 *   - QStash schedule request shape (secret in Authorization header ONLY)
 *   - signed callback verification (valid / tampered / wrong-key / expired / missing)
 *   - callback envelope parsing into non-secret proof
 *   - scheduler-capability gating + workspace-config metadata merge (no secret leak)
 *   - the page→client envSignals key contract (providerProductReadiness)
 *
 * Pure / offline — the signature verifier is wire-compatible with @upstash/qstash's
 * Receiver but implemented with node:crypto, so there is no network or runtime dep.
 *
 * Run with:  node --test scripts/unit-workspace-add-ons-scheduler.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);
const kitApp = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app",
);

const scheduler = await import(pathToFileURL(path.join(kitLib, "workspace-add-on-scheduler.js")).href);
const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);

const {
  deriveScheduleId,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
  verifyQstashSignature,
  getSchedulerAdapter,
  isSchedulerProduct,
  upstashQstashAdapter,
} = scheduler;

const qstashProduct = addOns.getUpstashProduct("upstash-qstash");

/* ---------- helpers: forge a QStash-style HS256 JWT ---------- */
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function makeSignature({ key, url, body, exp, nbf }) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = {
    iss: "Upstash",
    sub: url,
    iat: 1700000000,
    nbf: nbf ?? 1700000000,
    exp: exp ?? 1700000900,
    jti: "test-jti",
    body: createHash("sha256").update(body, "utf8").digest("base64"),
  };
  const payload = b64url(JSON.stringify(claims));
  const sig = b64url(createHmac("sha256", key).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

/* ---------- deriveScheduleId ---------- */
test("deriveScheduleId is deterministic and idempotent", () => {
  const args = { providerId: "upstash", workspaceId: "ws1", objectId: "sandbox-workflows", rowId: "My Flow", version: "v2" };
  const a = deriveScheduleId(args);
  const b = deriveScheduleId({ ...args });
  assert.equal(a, b);
  assert.equal(a, "growthub:upstash:ws1:sandbox-workflows:my-flow:v2");
});

test("deriveScheduleId differs when row identity differs", () => {
  const base = { providerId: "upstash", workspaceId: "ws1", objectId: "o", rowId: "r", version: "v1" };
  assert.notEqual(deriveScheduleId(base), deriveScheduleId({ ...base, rowId: "r2" }));
});

/* ---------- public URL + callback URLs ---------- */
test("resolveWorkspacePublicUrl prefers explicit env, falls back to origin", () => {
  assert.equal(resolveWorkspacePublicUrl({ GROWTHUB_WORKSPACE_PUBLIC_URL: "https://ws.example.com/" }, "http://localhost:3000"), "https://ws.example.com");
  assert.equal(resolveWorkspacePublicUrl({}, "https://origin.example.com"), "https://origin.example.com");
  assert.equal(resolveWorkspacePublicUrl({ VERCEL_URL: "app.vercel.app" }, ""), "https://app.vercel.app");
});

test("buildSchedulerCallbackUrls yields the three governed routes", () => {
  const urls = buildSchedulerCallbackUrls("https://ws.example.com", "upstash");
  assert.equal(urls.destinationUrl, "https://ws.example.com/api/workspace/workflows/upstash");
  assert.equal(urls.callbackUrl, "https://ws.example.com/api/workspace/add-ons/upstash/callback");
  assert.equal(urls.failureCallbackUrl, "https://ws.example.com/api/workspace/add-ons/upstash/failure");
});

/* ---------- adapter resolution ---------- */
test("QStash product resolves a scheduler adapter; non-scheduler does not", () => {
  assert.ok(isSchedulerProduct(qstashProduct));
  assert.equal(getSchedulerAdapter(qstashProduct)?.connectorKind, "upstash-qstash");
  assert.equal(isSchedulerProduct(addOns.getUpstashProduct("upstash-redis")), false);
});

/* ---------- buildScheduleRequest: secret only in Authorization ---------- */
test("buildScheduleRequest puts token in Authorization header only, never in body", () => {
  const req = upstashQstashAdapter.buildScheduleRequest({
    product: qstashProduct,
    region: "us-east-1",
    token: "SECRET_TOKEN_VALUE",
    scheduleId: "growthub:upstash:ws:o:r:v1",
    cron: "0 * * * *",
    destinationUrl: "https://ws.example.com/api/workspace/workflows/upstash",
    callbackUrl: "https://ws.example.com/api/workspace/add-ons/upstash/callback",
    failureCallbackUrl: "https://ws.example.com/api/workspace/add-ons/upstash/failure",
    forward: { workspaceId: "ws", objectId: "o", rowId: "r" },
    env: {},
  });
  assert.match(req.url, /\/v2\/schedules\//);
  assert.equal(req.headers.authorization, "Bearer SECRET_TOKEN_VALUE");
  assert.equal(req.headers["upstash-cron"], "0 * * * *");
  assert.equal(req.headers["upstash-schedule-id"], "growthub:upstash:ws:o:r:v1");
  assert.ok(req.headers["upstash-callback"].endsWith("/callback"));
  assert.ok(req.headers["upstash-forward-objectid"]);
  assert.ok(!req.body.includes("SECRET_TOKEN_VALUE"), "schedule body must not contain the token");
});

test("buildScheduleRequest throws without a token or destination", () => {
  assert.throws(() => upstashQstashAdapter.buildScheduleRequest({ product: qstashProduct, region: "us-east-1", token: "", cron: "0 * * * *", destinationUrl: "x", env: {} }));
});

/* ---------- signature verification ---------- */
const KEY = "sig_current_key";
const URL_SUB = "https://ws.example.com/api/workspace/add-ons/upstash/callback";
const RAW = JSON.stringify({ status: 200, sourceMessageId: "msg_1", scheduleId: "scd_1", body: "" });

test("verifyQstashSignature accepts a valid signature", () => {
  const sig = makeSignature({ key: KEY, url: URL_SUB, body: RAW });
  const v = verifyQstashSignature({ signature: sig, body: RAW, signingKeys: [KEY], currentTimeS: 1700000100 });
  assert.equal(v.ok, true, v.reason);
});

test("verifyQstashSignature rejects a tampered body", () => {
  const sig = makeSignature({ key: KEY, url: URL_SUB, body: RAW });
  const v = verifyQstashSignature({ signature: sig, body: RAW + "x", signingKeys: [KEY], currentTimeS: 1700000100 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "body-mismatch");
});

test("verifyQstashSignature rejects a wrong signing key", () => {
  const sig = makeSignature({ key: KEY, url: URL_SUB, body: RAW });
  const v = verifyQstashSignature({ signature: sig, body: RAW, signingKeys: ["other_key"], currentTimeS: 1700000100 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "signature-mismatch");
});

test("verifyQstashSignature honors key rotation (next key matches)", () => {
  const sig = makeSignature({ key: "next_key", url: URL_SUB, body: RAW });
  const v = verifyQstashSignature({ signature: sig, body: RAW, signingKeys: ["current_key", "next_key"], currentTimeS: 1700000100 });
  assert.equal(v.ok, true, v.reason);
});

test("verifyQstashSignature rejects an expired token", () => {
  const sig = makeSignature({ key: KEY, url: URL_SUB, body: RAW, exp: 1700000000 });
  const v = verifyQstashSignature({ signature: sig, body: RAW, signingKeys: [KEY], currentTimeS: 1700009999 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "expired");
});

test("verifyQstashSignature rejects missing/malformed signatures", () => {
  assert.equal(verifyQstashSignature({ signature: "", body: RAW, signingKeys: [KEY] }).reason, "missing-signature");
  assert.equal(verifyQstashSignature({ signature: "a.b", body: RAW, signingKeys: [KEY] }).reason, "malformed-jwt");
  assert.equal(verifyQstashSignature({ signature: "a.b.c", body: RAW, signingKeys: [] }).reason, "no-signing-keys");
});

/* ---------- callback parsing ---------- */
test("parseCallback decodes a base64 body preview and marks success", () => {
  const inner = "workflow ran: 3 rows written";
  const envelope = JSON.stringify({ status: 200, sourceMessageId: "msg_9", scheduleId: "scd_2", body: Buffer.from(inner).toString("base64") });
  const parsed = upstashQstashAdapter.parseCallback({ rawBody: envelope, kind: "callback" });
  assert.equal(parsed.succeeded, true);
  assert.equal(parsed.status, 200);
  assert.equal(parsed.messageId, "msg_9");
  assert.equal(parsed.bodyPreview, inner);
});

test("parseCallback on failure kind records a reason and is not successful", () => {
  const envelope = JSON.stringify({ status: 500, sourceMessageId: "msg_x", error: "destination 500" });
  const parsed = upstashQstashAdapter.parseCallback({ rawBody: envelope, kind: "failure" });
  assert.equal(parsed.succeeded, false);
  assert.equal(parsed.failureReason, "destination 500");
});

/* ---------- capability gating ---------- */
test("hasSchedulerCapability requires verified AND a scheduleId", () => {
  assert.equal(addOns.hasSchedulerCapability({ syncStatus: "verified", scheduleId: "scd_1" }), true);
  assert.equal(addOns.hasSchedulerCapability({ syncStatus: "verified", scheduleId: "" }), false);
  assert.equal(addOns.hasSchedulerCapability({ syncStatus: "missing-env", scheduleId: "scd_1" }), false);
});

/* ---------- metadata merge: no secret can be written ---------- */
test("withMarketplaceSchedulerMetadata merges allowlisted keys and drops secrets", () => {
  const config = {
    dataModel: {
      objects: [
        {
          objectType: "api-registry",
          rows: [{ integrationId: "upstash-qstash-workflow", syncStatus: "verified" }],
        },
      ],
    },
  };
  const next = addOns.withMarketplaceSchedulerMetadata(config, {
    integrationId: "upstash-qstash-workflow",
    patch: { scheduleId: "scd_1", QSTASH_TOKEN: "leak", lastResponseBodyPreview: "ok" },
  });
  const row = next.dataModel.objects[0].rows[0];
  assert.equal(row.scheduleId, "scd_1");
  assert.equal(row.lastResponseBodyPreview, "ok");
  assert.equal(row.QSTASH_TOKEN, undefined, "secret-shaped key must never be persisted");
});

test("deriveWorkspaceAddOnsState exposes hasQstashSchedulerCapability only with a scheduleId", () => {
  const withCap = {
    dataModel: { objects: [{ objectType: "api-registry", rows: [
      { integrationId: "upstash-qstash-workflow", syncStatus: "verified", syncProof: "p", syncCheckedAt: "t", scheduleId: "scd_1" },
    ] }] },
  };
  const noCap = {
    dataModel: { objects: [{ objectType: "api-registry", rows: [
      { integrationId: "upstash-qstash-workflow", syncStatus: "verified", syncProof: "p", syncCheckedAt: "t" },
    ] }] },
  };
  assert.equal(addOns.deriveWorkspaceAddOnsState(withCap).hasQstashSchedulerCapability, true);
  assert.equal(addOns.deriveWorkspaceAddOnsState(noCap).hasQstashSchedulerCapability, false);
});

/* ---------- env-signals contract (the page.jsx → client bug) ---------- */
test("listAllProviderProductReadiness is keyed by providerId", () => {
  const signals = addOns.listAllProviderProductReadiness({});
  assert.ok(Array.isArray(signals.upstash), "expected provider-keyed readiness for upstash");
});

test("page.jsx emits the exact envSignals key the client consumes", () => {
  const page = readFileSync(path.join(kitApp, "settings/add-ons/page.jsx"), "utf8");
  const client = readFileSync(path.join(kitApp, "settings/add-ons/add-ons-client.jsx"), "utf8");
  assert.ok(page.includes("providerProductReadiness:"), "page must emit providerProductReadiness");
  assert.ok(client.includes("providerProductReadiness"), "client must consume providerProductReadiness");
  assert.ok(!page.includes("upstashProducts:"), "page must not emit the old mismatched key");
});
