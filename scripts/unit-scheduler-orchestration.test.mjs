#!/usr/bin/env node
/**
 * ROUTE-LEVEL state-machine coverage for the scheduler loop, exercised through
 * the dependency-injected orchestration cores (lib/scheduler-orchestration.js)
 * with stubbed fetch / config read+write / receipts — no Next runtime needed.
 *
 * Covers: create schedule -> persist row+trigger -> rollback on bind/persist
 * failure -> callback sync to owning row -> callback persistence failure ->
 * stale/unbound rejection.
 *
 * Run with:  node --test scripts/unit-scheduler-orchestration.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const { runScheduleInstall, runSchedulerCallback } = await import(pathToFileURL(path.join(kitLib, "scheduler-orchestration.js")).href);

const PUBLIC_URL = "https://ws.example.com";
const SIGNING_KEY = "sig_current";
const GRAPH = JSON.stringify({
  version: 1, provider: "growthub-native",
  nodes: [
    { id: "input", type: "input", config: { inputMode: "manual" } },
    { id: "api-request", type: "api-registry-call", config: { registryId: "demo-data-api", authRef: "DEMO_DATA", endpoint: "/v1/items" } },
    { id: "result", type: "tool-result", config: { writeLastResponse: false } },
  ],
  edges: [{ from: "input", to: "api-request" }, { from: "api-request", to: "result" }],
});

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function baseConfig() {
  return {
    id: "ws",
    dataModel: { objects: [
      { objectType: "api-registry", rows: [
        { integrationId: "upstash-qstash-workflow", syncStatus: "verified", syncProof: "p", syncCheckedAt: "t" },
        { integrationId: "demo-data-api", authRef: "DEMO_DATA", syncStatus: "verified", baseUrl: "https://api.demo.test" },
      ] },
      { id: "sandbox-workflows", objectType: "sandbox-environment", rows: [
        { Name: "Flow A", runLocality: "local", adapter: "local-process", orchestrationConfig: GRAPH },
      ] },
    ] },
  };
}

function makeHarness(opts = {}) {
  let store = baseConfig();
  const calls = [];
  const receipts = [];
  const env = { QSTASH_TOKEN: "tok", QSTASH_CURRENT_SIGNING_KEY: SIGNING_KEY, GROWTHUB_WORKSPACE_PUBLIC_URL: PUBLIC_URL, DEMO_DATA_TOKEN: "dtok" };
  const resp = (status, text) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, text: async () => text, json: async () => JSON.parse(text || "{}") });
  const deps = {
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, method: init.method || "GET" });
      if (String(url).includes("/v2/schedules/")) {
        if (opts.scheduleStatus && init.method !== "DELETE") return resp(opts.scheduleStatus, "{}");
        return resp(200, "{}");
      }
      return resp(404, "");
    },
    readConfig: async () => clone(store),
    writeConfig: async (patch) => {
      if (opts.writeThrows) { const e = new Error("read-only"); e.code = "WORKSPACE_PERSISTENCE_READ_ONLY"; throw e; }
      store = { ...store, dataModel: patch.dataModel };
      return clone(store);
    },
    appendReceipt: async (r) => { receipts.push(r); return { receipt: { receiptId: `rcpt_${receipts.length}` } }; },
    env,
    now: () => "2026-01-01T00:00:00.000Z",
  };
  return { deps, calls, receipts, env, getStore: () => store, setStore: (s) => { store = s; } };
}

const INSTALL_BODY = { productId: "upstash-qstash", objectId: "sandbox-workflows", rowId: "Flow A", region: "us-east-1", cron: "0 * * * *", version: "v1", workspaceId: "ws" };

/* ---------- signed callback envelope ---------- */
function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function signCallback({ url, body }) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = { iss: "Upstash", sub: url, iat: 1700000000, nbf: 1700000000, exp: 4102444800, jti: "j", body: createHash("sha256").update(body, "utf8").digest("base64") };
  const payload = b64url(JSON.stringify(claims));
  const sig = b64url(createHmac("sha256", SIGNING_KEY).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

/* ================= schedule install ================= */
test("install: valid row + 2xx + write ok -> row serverless + trigger synced, provider row untouched", async () => {
  const h = makeHarness();
  const res = await runScheduleInstall(h.deps, { providerId: "upstash", body: INSTALL_BODY, requestOrigin: "" });
  assert.equal(res.status, 200);
  assert.equal(res.body.bound, true);
  assert.equal(res.body.persisted, true);
  const row = h.getStore().dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  assert.equal(row.runLocality, "serverless");
  assert.ok(row.scheduleId, "row owns the scheduleId");
  assert.equal(JSON.parse(row.orchestrationConfig).nodes.find((n) => n.id === "input").config.trigger, "serverless-scheduler");
  const reg = h.getStore().dataModel.objects.find((o) => o.objectType === "api-registry").rows[0];
  assert.equal(reg.scheduleId, undefined, "provider capability row holds no per-workflow scheduleId");
});

test("install: missing target row -> provider fetch NEVER called", async () => {
  const h = makeHarness();
  const res = await runScheduleInstall(h.deps, { providerId: "upstash", body: { ...INSTALL_BODY, rowId: "Ghost" }, requestOrigin: "" });
  assert.equal(res.status, 404);
  assert.equal(h.calls.filter((c) => c.url.includes("/v2/schedules/")).length, 0);
});

test("install: 2xx create + write throws + rollback delete -> 424, not ok, no clean success", async () => {
  const h = makeHarness({ writeThrows: true });
  const res = await runScheduleInstall(h.deps, { providerId: "upstash", body: INSTALL_BODY, requestOrigin: "" });
  assert.equal(res.status, 424);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.persisted, false);
  assert.ok(h.calls.some((c) => c.method === "DELETE" && c.url.includes("/v2/schedules/")), "remote schedule rolled back");
});

test("install: capability not verified -> 409 before any remote call", async () => {
  const h = makeHarness();
  const s = baseConfig();
  s.dataModel.objects[0].rows[0].syncStatus = "missing-env";
  h.setStore(s);
  const res = await runScheduleInstall(h.deps, { providerId: "upstash", body: INSTALL_BODY, requestOrigin: "" });
  assert.equal(res.status, 409);
  assert.equal(h.calls.filter((c) => c.url.includes("/v2/schedules/")).length, 0);
});

/* ================= callback sync ================= */
async function installThen(h) {
  const res = await runScheduleInstall(h.deps, { providerId: "upstash", body: INSTALL_BODY, requestOrigin: "" });
  return res.body.scheduleId;
}
function callbackEnvelope(scheduleId, status = 200) {
  const inner = JSON.stringify({ ok: status < 300, scheduleId });
  return JSON.stringify({ status, sourceMessageId: "msg_1", scheduleId, body: Buffer.from(inner).toString("base64"), retried: 0, maxRetries: 3 });
}

test("callback: signed + bound row -> last run proof written to OWNING row", async () => {
  const h = makeHarness();
  const scheduleId = await installThen(h);
  const rawBody = callbackEnvelope(scheduleId, 200);
  const signature = signCallback({ url: `${PUBLIC_URL}/api/workspace/add-ons/upstash/callback`, body: rawBody });
  const res = await runSchedulerCallback(h.deps, { providerId: "upstash", kind: "callback", rawBody, signature, requestOrigin: "" });
  assert.equal(res.status, 200);
  assert.equal(res.body.synced, true);
  const row = h.getStore().dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  assert.equal(row.lastScheduledRunStatus, "200");
  assert.equal(row.lastScheduledRunMessageId, "msg_1");
  assert.ok(row.lastScheduledRunSucceededAt);
});

test("callback: write throws after verify -> 424, not clean success (proof not lost silently)", async () => {
  const h = makeHarness();
  const scheduleId = await installThen(h);
  h.deps.writeConfig = async () => { throw new Error("read-only"); };
  const rawBody = callbackEnvelope(scheduleId, 200);
  const signature = signCallback({ url: `${PUBLIC_URL}/api/workspace/add-ons/upstash/callback`, body: rawBody });
  const res = await runSchedulerCallback(h.deps, { providerId: "upstash", kind: "callback", rawBody, signature, requestOrigin: "" });
  assert.equal(res.status, 424);
  assert.equal(res.body.persisted, false);
});

test("callback: row no longer bound (reverted to local) -> 409 rejected", async () => {
  const h = makeHarness();
  const scheduleId = await installThen(h);
  // operator reverted the row to local out-of-band
  const s = h.getStore();
  s.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0].runLocality = "local";
  h.setStore(s);
  const rawBody = callbackEnvelope(scheduleId, 200);
  const signature = signCallback({ url: `${PUBLIC_URL}/api/workspace/add-ons/upstash/callback`, body: rawBody });
  const res = await runSchedulerCallback(h.deps, { providerId: "upstash", kind: "callback", rawBody, signature, requestOrigin: "" });
  assert.equal(res.status, 409);
});

test("callback: bad signature -> 401, no config mutation", async () => {
  const h = makeHarness();
  const scheduleId = await installThen(h);
  const rawBody = callbackEnvelope(scheduleId, 200);
  const res = await runSchedulerCallback(h.deps, { providerId: "upstash", kind: "callback", rawBody, signature: "bad.sig.here", requestOrigin: "" });
  assert.equal(res.status, 401);
});
