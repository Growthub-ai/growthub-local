#!/usr/bin/env node
/**
 * Serverless-schedule READINESS scan — pure compatibility proof for the whole
 * downstream graph (not just the trigger binding). Covers each node class the
 * spec enumerates plus the install-gate / readiness-action integration through
 * the dependency-injected scheduler orchestration cores.
 *
 *   - clean graph -> ready (ok)
 *   - api-registry node: unresolved row / missing server secret / leaked secret
 *   - transform + endpoint: scheduled-input-unmapped (warning, still ok)
 *   - local-only adapter / ai-agent node -> blocked (local-agent-upgrade-required)
 *   - no live graph -> published-graph-required
 *   - bound-phase trigger mismatch -> input-contract
 *   - readinessFieldFlags atomic field mapping
 *   - install blocked before any remote call when graph is not ready
 *   - readiness action returns the scan with no mutation
 *
 * Run with:  node --test scripts/unit-serverless-readiness.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const { scanServerlessReadiness, readinessFieldFlags, classifyNodeLocality, READINESS_DELTA_TAGS } =
  await import(pathToFileURL(path.join(kitLib, "serverless-readiness.js")).href);
const { runScheduleInstall, runReadinessScan } =
  await import(pathToFileURL(path.join(kitLib, "scheduler-orchestration.js")).href);

const ENV = { DEMO_DATA_TOKEN: "demo_secret_value_123", QSTASH_TOKEN: "tok", QSTASH_CURRENT_SIGNING_KEY: "k", GROWTHUB_WORKSPACE_PUBLIC_URL: "https://ws.example.com" };

function graph(nodes, edges = []) {
  return JSON.stringify({ version: 1, provider: "growthub-native", nodes, edges });
}
function cleanGraph(extra = {}) {
  return graph([
    { id: "input", type: "input", config: { inputMode: "manual", samplePayload: { since: "2026-01-01" } } },
    { id: "api-request", type: "api-registry-call", config: { registryId: "demo-data-api", authRef: "DEMO_DATA", endpoint: "/v1/items?since={{input.since}}", ...extra } },
    { id: "result", type: "tool-result", config: { writeLastResponse: true } },
  ], [{ from: "input", to: "api-request" }, { from: "api-request", to: "result" }]);
}
function config(rows) {
  return { id: "ws", dataModel: { objects: [
    { objectType: "api-registry", rows: rows || [{ integrationId: "demo-data-api", authRef: "DEMO_DATA", syncStatus: "verified", baseUrl: "https://api.demo.test" }] },
  ] } };
}
function rowWith(overrides = {}) {
  return { Name: "Flow A", runLocality: "local", adapter: "local-process", orchestrationConfig: cleanGraph(), ...overrides };
}

/* =================== scan: clean / ready =================== */
test("clean graph with resolved API creds -> ready (ok)", () => {
  const r = scanServerlessReadiness({ row: rowWith(), workspaceConfig: config(), env: ENV, phase: "pre-bind" });
  assert.equal(r.ok, true);
  assert.equal(r.blockingNodes.length, 0);
  assert.equal(r.kind, "serverless-schedule-readiness");
});

test("client pure path: configuredEnvRefs (no env, no values) proves credentials -> ready", () => {
  // Mirrors deriveSandboxServerlessState's contract: the client passes resolved
  // ref slugs (never values) and the scan is fully pure (no env, no fetch).
  const r = scanServerlessReadiness({ row: rowWith(), workspaceConfig: config(), configuredEnvRefs: ["DEMO_DATA"] });
  assert.equal(r.ok, true);
  assert.equal(r.blockingNodes.length, 0);
});

test("client pure path: ref NOT in configuredEnvRefs -> blocked (missing-server-secret)", () => {
  const r = scanServerlessReadiness({ row: rowWith(), workspaceConfig: config(), configuredEnvRefs: ["SOMETHING_ELSE"] });
  assert.equal(r.ok, false);
  assert.ok(r.blockingNodes.some((n) => n.deltaTags.includes(READINESS_DELTA_TAGS.MISSING_SERVER_SECRET)));
});

/* =================== api-registry node =================== */
test("api-registry node referencing an unresolved row -> blocked (downstream-node-incompatible)", () => {
  const row = rowWith({ orchestrationConfig: cleanGraph() });
  const r = scanServerlessReadiness({ row, workspaceConfig: config([]), env: ENV });
  assert.equal(r.ok, false);
  const b = r.blockingNodes.find((n) => n.nodeId === "api-request");
  assert.ok(b, "api node is blocking");
  assert.ok(b.deltaTags.includes(READINESS_DELTA_TAGS.DOWNSTREAM_NODE_INCOMPATIBLE));
  assert.ok(b.deltaTags.includes(READINESS_DELTA_TAGS.API_REGISTRY_ENV));
});

test("api-registry node with declared authRef but NO server secret -> blocked (missing-server-secret)", () => {
  const r = scanServerlessReadiness({ row: rowWith(), workspaceConfig: config(), env: { /* no DEMO_DATA_* */ } });
  assert.equal(r.ok, false);
  const b = r.blockingNodes.find((n) => n.nodeId === "api-request");
  assert.ok(b.deltaTags.includes(READINESS_DELTA_TAGS.MISSING_SERVER_SECRET));
  assert.match(b.helperAction, /server-side env ref|server-secrets/i);
});

test("a credential VALUE persisted in the registry row -> blocked (secret leak)", () => {
  const leakedRows = [{ integrationId: "demo-data-api", authRef: "DEMO_DATA", syncStatus: "verified", apiKey: "demo_secret_value_123" }];
  const r = scanServerlessReadiness({ row: rowWith(), workspaceConfig: config(leakedRows), env: ENV });
  assert.equal(r.ok, false);
  assert.ok(r.deltaTags.includes(READINESS_DELTA_TAGS.MISSING_SERVER_SECRET));
});

/* =================== transform / input contract =================== */
test("endpoint references an input field absent under scheduled execution -> warning (scheduled-input-unmapped), still ok", () => {
  const g = graph([
    { id: "input", type: "input", config: { inputMode: "manual", samplePayload: {} } },
    { id: "api-request", type: "api-registry-call", config: { registryId: "demo-data-api", authRef: "DEMO_DATA", endpoint: "/v1/items?since={{input.since}}" } },
    { id: "result", type: "tool-result", config: { writeLastResponse: true } },
  ], [{ from: "input", to: "api-request" }]);
  const r = scanServerlessReadiness({ row: rowWith({ orchestrationConfig: g }), workspaceConfig: config(), env: ENV });
  assert.equal(r.ok, true, "unmapped input is a warning, not a hard block");
  assert.equal(r.status, "warning");
  assert.ok(r.warnings.some((w) => w.deltaTags.includes(READINESS_DELTA_TAGS.SCHEDULED_INPUT_UNMAPPED)));
});

/* =================== agent / local-process =================== */
test("local-only sandbox adapter on an ai-agent node -> blocked (local-agent-upgrade-required)", () => {
  const g = graph([
    { id: "input", type: "input", config: { inputMode: "manual" } },
    { id: "agent", type: "ai-agent", config: { adapter: "local-agent-host", host: "claude_local" } },
    { id: "result", type: "tool-result", config: { writeLastResponse: true } },
  ], [{ from: "input", to: "agent" }, { from: "agent", to: "result" }]);
  const r = scanServerlessReadiness({ row: rowWith({ orchestrationConfig: g }), workspaceConfig: config(), env: ENV });
  assert.equal(r.ok, false);
  const b = r.blockingNodes.find((n) => n.nodeId === "agent");
  assert.ok(b.deltaTags.includes(READINESS_DELTA_TAGS.RUNTIME_LOCALITY));
  assert.ok(b.deltaTags.includes(READINESS_DELTA_TAGS.LOCAL_AGENT_UPGRADE_REQUIRED));
});

test("classifyNodeLocality: api-backed ai-agent is compatible; local host is not", () => {
  assert.equal(classifyNodeLocality({ type: "ai-agent", config: { provider: "claude" } }).local, false);
  assert.equal(classifyNodeLocality({ type: "ai-agent", config: { runtime: "local" } }).local, true);
  assert.equal(classifyNodeLocality({ type: "api-registry-call", config: {} }).local, false);
});

/* =================== graph-level =================== */
test("no published/live graph -> blocked (published-graph-required)", () => {
  const r = scanServerlessReadiness({ row: { Name: "Flow A" }, workspaceConfig: config(), env: ENV });
  assert.equal(r.ok, false);
  assert.ok(r.deltaTags.includes(READINESS_DELTA_TAGS.PUBLISHED_GRAPH_REQUIRED));
});

/* =================== bound phase =================== */
test("bound phase: trigger node not carrying the row scheduleId -> blocked (input-contract)", () => {
  // row claims serverless + scheduleId, but the live trigger node is still manual.
  const row = rowWith({ runLocality: "serverless", scheduleId: "sch_1", schedulerRegistryId: "demo-data-api" });
  const r = scanServerlessReadiness({ row, workspaceConfig: config(), env: ENV, phase: "bound", expected: { scheduleId: "sch_1", schedulerRegistryId: "demo-data-api" } });
  assert.equal(r.ok, false);
  assert.ok(r.blockingNodes.some((n) => n.deltaTags.includes(READINESS_DELTA_TAGS.INPUT_CONTRACT)));
});

/* =================== field flags =================== */
test("readinessFieldFlags maps each alert to the atomic config/row field(s)", () => {
  const r = scanServerlessReadiness({ row: rowWith(), workspaceConfig: config(), env: { /* no secret */ } });
  const flags = readinessFieldFlags(r);
  assert.ok(flags["api-request"], "api node flagged");
  assert.equal(flags["api-request"].severity, "blocked");
  assert.ok(flags["api-request"].configFields.includes("authRef"));
  assert.ok(flags["api-request"].deltaTags.includes(READINESS_DELTA_TAGS.MISSING_SERVER_SECRET));
});

test("readinessFieldFlags surfaces the execution adapter as a sandbox-row field", () => {
  const g = graph([
    { id: "input", type: "input", config: {} },
    { id: "agent", type: "ai-agent", config: { adapter: "local-intelligence" } },
  ], [{ from: "input", to: "agent" }]);
  const flags = readinessFieldFlags(scanServerlessReadiness({ row: rowWith({ orchestrationConfig: g }), workspaceConfig: config(), env: ENV }));
  assert.ok(flags["agent"].rowFields.includes("adapter"));
});

/* =================== install gate + readiness action =================== */
function harness(store) {
  let state = JSON.parse(JSON.stringify(store));
  const calls = [];
  return {
    calls,
    deps: {
      fetchImpl: async (url, init = {}) => { calls.push({ url: String(url), method: init.method || "GET" }); return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => "{}", json: async () => ({}) }; },
      readConfig: async () => JSON.parse(JSON.stringify(state)),
      writeConfig: async (patch) => { state = { ...state, dataModel: patch.dataModel }; return JSON.parse(JSON.stringify(state)); },
      appendReceipt: async () => ({ receipt: { receiptId: "r" } }),
      env: ENV,
      now: () => "2026-01-01T00:00:00.000Z",
    },
  };
}

const INSTALL_BODY = { productId: "upstash-qstash", objectId: "sandbox-workflows", rowId: "Flow A", region: "us-east-1", cron: "0 9 * * *", version: "v1", workspaceId: "ws" };

test("install is BLOCKED (422) before any remote call when the graph is not serverless-ready", async () => {
  const store = { id: "ws", dataModel: { objects: [
    { objectType: "api-registry", rows: [{ integrationId: "upstash-qstash-workflow", syncStatus: "verified" }] },
    { id: "sandbox-workflows", objectType: "sandbox-environment", rows: [
      // api node references a registry row that does NOT exist -> not ready.
      { Name: "Flow A", runLocality: "local", adapter: "local-process", orchestrationConfig: cleanGraph() },
    ] },
  ] } };
  const h = harness(store);
  const res = await runScheduleInstall(h.deps, { providerId: "upstash", body: INSTALL_BODY, requestOrigin: "" });
  assert.equal(res.status, 422);
  assert.equal(res.body.ok, false);
  assert.ok(res.body.readiness && res.body.readiness.status === "blocked");
  assert.equal(h.calls.filter((c) => c.url.includes("/v2/schedules/")).length, 0, "no remote schedule created for an unready graph");
});

test("readiness action returns the scan and mutates nothing", async () => {
  const store = { id: "ws", dataModel: { objects: [
    { objectType: "api-registry", rows: [{ integrationId: "upstash-qstash-workflow", syncStatus: "verified" }, { integrationId: "demo-data-api", authRef: "DEMO_DATA", syncStatus: "verified" }] },
    { id: "sandbox-workflows", objectType: "sandbox-environment", rows: [rowWith()] },
  ] } };
  const h = harness(store);
  const res = await runReadinessScan(h.deps, { providerId: "upstash", body: { productId: "upstash-qstash", objectId: "sandbox-workflows", rowId: "Flow A" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.readiness.kind, "serverless-schedule-readiness");
  assert.equal(h.calls.length, 0, "readiness scan performs no fetch");
});
