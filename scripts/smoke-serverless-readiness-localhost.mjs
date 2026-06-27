#!/usr/bin/env node
/**
 * REAL localhost server + REAL file-backed workspace, exercising the ACTUAL
 * readiness/install route cores from the kit (no Next runtime, but real HTTP,
 * real growthub.config.json read/write, real modules). Runs positive + negative
 * probes and prints a pass/fail evidence ledger.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

// The external QStash call is stubbed (no live creds/public ingress in CI) — the
// live QStash run is the separate §9 merge gate. Everything else is real: a real
// 127.0.0.1 HTTP server, real growthub.config.json read/write, real route cores.
const here = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const { runScheduleInstall, runReadinessScan } = await import(pathToFileURL(path.join(KIT, "scheduler-orchestration.js")).href);

// ---- real temp workspace on disk ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-readiness-"));
const CONFIG = path.join(dir, "growthub.config.json");
const GRAPH = (extra = {}) => JSON.stringify({
  version: 1, provider: "growthub-native",
  nodes: [
    { id: "input", type: "input", config: { inputMode: "serverless-schedule", samplePayload: { since: "2026-01-01" } } },
    { id: "api-request", type: "api-registry-call", config: { registryId: "demo-data-api", authRef: "DEMO_DATA", endpoint: "/v1/items?since={{input.since}}", ...extra } },
    { id: "result", type: "tool-result", config: { writeLastResponse: true } },
  ],
  edges: [{ from: "input", to: "api-request" }, { from: "api-request", to: "result" }],
});
const LOCAL_AGENT_GRAPH = JSON.stringify({
  version: 1, provider: "growthub-native",
  nodes: [
    { id: "input", type: "input", config: { inputMode: "serverless-schedule" } },
    { id: "agent", type: "ai-agent", config: { adapter: "local-agent-host", host: "claude_local" } },
    { id: "result", type: "tool-result", config: { writeLastResponse: true } },
  ],
  edges: [{ from: "input", to: "agent" }, { from: "agent", to: "result" }],
});
function seed() {
  const cfg = { id: "ws", dataModel: { objects: [
    { id: "api-registry", objectType: "api-registry", rows: [
      { integrationId: "upstash-qstash-workflow", syncStatus: "verified", syncProof: "p", syncCheckedAt: "t", region: "us-east-1" },
      { integrationId: "demo-data-api", authRef: "DEMO_DATA", syncStatus: "verified", baseUrl: "https://api.demo.test" },
    ] },
    { id: "sandbox-workflows", objectType: "sandbox-environment", rows: [
      { Name: "Ready Flow", runLocality: "local", adapter: "local-process", orchestrationConfig: GRAPH() },
      { Name: "Local Agent Flow", runLocality: "local", adapter: "local-process", orchestrationConfig: LOCAL_AGENT_GRAPH },
    ] },
  ] } };
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}
seed();

// ---- deps: real file read/write, QStash stubbed (external) ----
const qstashCalls = [];
const deps = {
  fetchImpl: async (url, init = {}) => { qstashCalls.push({ url: String(url), method: init.method || "GET" }); return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => "{}", json: async () => ({}) }; },
  readConfig: async () => JSON.parse(fs.readFileSync(CONFIG, "utf8")),
  writeConfig: async (patch) => { const cur = JSON.parse(fs.readFileSync(CONFIG, "utf8")); const next = { ...cur, dataModel: patch.dataModel }; fs.writeFileSync(CONFIG, JSON.stringify(next, null, 2)); return next; },
  appendReceipt: async (r) => { fs.appendFileSync(path.join(dir, "receipts.ndjson"), JSON.stringify({ at: "t", ...r }) + "\n"); return { receipt: { receiptId: "rcpt" } }; },
  env: { QSTASH_TOKEN: "tok", QSTASH_CURRENT_SIGNING_KEY: "k", DEMO_DATA_TOKEN: "demo_secret_value_123", GROWTHUB_WORKSPACE_PUBLIC_URL: "https://ws.example.com" },
  now: () => "2026-06-27T00:00:00.000Z",
};

// ---- real HTTP server ----
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const json = body ? JSON.parse(body) : {};
    let out;
    if (req.url === "/readiness") out = await runReadinessScan(deps, { providerId: "upstash", body: json });
    else if (req.url === "/install") out = await runScheduleInstall(deps, { providerId: "upstash", body: json, requestOrigin: "" });
    else out = { status: 404, body: { error: "not found" } };
    res.writeHead(out.status, { "content-type": "application/json" });
    res.end(JSON.stringify(out.body));
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
const post = async (p, b) => { const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };

const results = [];
const check = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); };

// ============ PROBES ============
const READY = { productId: "upstash-qstash", objectId: "sandbox-workflows", rowId: "Ready Flow" };
const LOCAL = { productId: "upstash-qstash", objectId: "sandbox-workflows", rowId: "Local Agent Flow" };

// (+) readiness on a clean, creds-resolved graph
const r1 = await post("/readiness", READY);
check("POS readiness: clean graph -> ok/ready", r1.status === 200 && r1.body.readiness.ok === true, `status=${r1.status} readiness.status=${r1.body.readiness?.status}`);

// (-) readiness on a local-agent graph
const r2 = await post("/readiness", LOCAL);
const r2tags = r2.body.readiness?.deltaTags || [];
check("NEG readiness: local-agent node -> blocked + local-agent-upgrade-required", r2.body.readiness?.ok === false && r2tags.includes("local-agent-upgrade-required") && r2tags.includes("runtime-locality"), `ok=${r2.body.readiness?.ok} tags=${JSON.stringify(r2tags)}`);

// (-) install MUST be blocked before any QStash call for the local-agent graph
const qBefore = qstashCalls.length;
const r3 = await post("/install", LOCAL);
const qAfterLocal = qstashCalls.length;
check("NEG install: local-agent graph -> 422, NO remote QStash call", r3.status === 422 && r3.body.readiness?.status === "blocked" && qAfterLocal === qBefore, `status=${r3.status} qcalls+=${qAfterLocal - qBefore}`);

// (+) install proceeds for the ready graph (QStash stubbed 200) and persists to disk
const r4 = await post("/install", READY);
const persisted = JSON.parse(fs.readFileSync(CONFIG, "utf8")).dataModel.objects.find((o) => o.id === "sandbox-workflows").rows.find((x) => x.Name === "Ready Flow");
check("POS install: ready graph -> 200 bound + row persisted serverless to disk", r4.status === 200 && r4.body.bound === true && persisted.runLocality === "serverless" && !!persisted.scheduleId, `status=${r4.status} bound=${r4.body.bound} locality=${persisted.runLocality} scheduleId=${persisted.scheduleId}`);

// (-) negative: break creds (remove the env) and re-scan a fresh row -> blocked missing-server-secret
deps.env = { QSTASH_TOKEN: "tok", QSTASH_CURRENT_SIGNING_KEY: "k", GROWTHUB_WORKSPACE_PUBLIC_URL: "https://ws.example.com" }; // DEMO_DATA_TOKEN gone
seed(); // reset rows
const r5 = await post("/readiness", READY);
const r5tags = r5.body.readiness?.deltaTags || [];
check("NEG readiness: missing server secret -> blocked + missing-server-secret/api-registry-env", r5.body.readiness?.ok === false && r5tags.includes("missing-server-secret") && r5tags.includes("api-registry-env"), `ok=${r5.body.readiness?.ok} tags=${JSON.stringify(r5tags)}`);

// canonical scheduleId format check on the (+) install id
check("scheduleId is canonical hyphen/slug-safe format", /^[A-Za-z0-9_-]+$/.test(String(r4.body.scheduleId || "")), `scheduleId=${r4.body.scheduleId}`);

server.close();
console.log(`\n=== REAL localhost readiness probe @ ${base} (config: ${CONFIG}) ===\n`);
let ok = true;
for (const r of results) { console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`); if (!r.pass) ok = false; }
console.log(`\n${ok ? "ALL PROBES PASSED" : "SOME PROBES FAILED"} (${results.filter((x) => x.pass).length}/${results.length})`);
process.exit(ok ? 0 : 1);
