#!/usr/bin/env node
/** Booted disposable workspace proof of the real sandbox-run compute path. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceApp = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (name) => pathToFileURL(path.join(sourceApp, "lib", name)).href;
const { deriveCapacityPlan } = await import(lib("compute-capacity-profiles.js"));
const { buildTrainingRunConfig } = await import(lib("training-runtime-profiles.js"));
const { buildComputeIntent, buildComputeWorkSpec } = await import(lib("compute-work-spec.js"));
const { normalizeComputeBlock } = await import(lib("compute-evidence.js"));
const { buildMothershipProxyRow, deriveProxyServingState } = await import(lib("distillation-fleet.js"));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "growthub-compute-route-"));
const app = path.join(tmp, "workspace");
const artifactBytes = Buffer.from("verified governed model artifact bytes\n");
const artifactSha = crypto.createHash("sha256").update(artifactBytes).digest("hex");
let submitCount = 0;
let resumeCount = 0;
let cancelCount = 0;
const statusCalls = new Map();

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const waitHttp = async (url, timeout = 120000) => { const start = Date.now(); while (Date.now() - start < timeout) { try { const res = await fetch(url); if (res.ok) return; } catch {} await sleep(250); } throw new Error(`timeout waiting for ${url}`); };

const providerPort = await freePort();
const providerBase = `http://127.0.0.1:${providerPort}`;
const evaluationResults = Array.from({ length: 6 }, (_, i) => ({ taskId: `task-${i}`, student: { quality: 0.9, latencyMs: 10, costUsd: 0.1 }, baseline: { quality: 0.5, latencyMs: 20, costUsd: 0.2 } }));
const provider = http.createServer(async (req, res) => {
  const url = new URL(req.url, providerBase);
  let body = {};
  if (req.method !== "GET") { const chunks = []; for await (const chunk of req) chunks.push(chunk); try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {} }
  const json = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
  if (url.pathname === "/health") return json(200, { ok: true });
  if (url.pathname === "/artifact") { res.writeHead(200, { "content-type": "application/octet-stream" }); return res.end(artifactBytes); }
  if (url.pathname === "/chat") return json(200, { model: "student-v1", choices: [{ message: { role: "assistant", content: "verified student" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 2 } });
  if (url.pathname === "/submit") { submitCount += 1; assert.ok(body.workSpec?.workSpecHash); return json(200, { call_id: `call-${body.workSpec.trainingRunId}` }); }
  if (url.pathname === "/resume") { resumeCount += 1; assert.ok(body.workSpec?.workSpecHash && body.checkpoint?.sha256); return json(200, { call_id: `resume-${body.workSpec.trainingRunId}` }); }
  if (url.pathname === "/cancel") { cancelCount += 1; return json(200, { cancelled: true }); }
  if (url.pathname === "/status") {
    const id = url.searchParams.get("call_id") || "";
    const runId = id.replace(/^call-/, "").replace(/^resume-/, "");
    const count = (statusCalls.get(id) || 0) + 1; statusCalls.set(id, count);
    if (runId === "route-crash") return; // hold open until the Next process is killed
    if (runId === "route-resume") {
      if (count === 1) return json(200, { status: "running", checkpoint: { checkpointId: "ck-route", runRef: { trainingRunId: runId }, locator: "s3://checkpoint/route", sha256: "c".repeat(64), step: 42 } });
      return json(200, { status: "failure", error: "injected interruption" });
    }
    if (count === 1) return json(200, { status: "running" });
    return json(200, { status: "success", artifact: { kind: "gguf", locator: `${providerBase}/artifact`, sha256: artifactSha, sizeBytes: artifactBytes.length }, evaluationResults });
  }
  json(404, { error: "not found" });
});
await new Promise((resolve) => provider.listen(providerPort, "127.0.0.1", resolve));

let next = null;
const stopNext = async (signal = "SIGTERM") => { if (!next) return; try { process.kill(-next.pid, signal); } catch {} next = null; await sleep(750); };
try {
  fs.cpSync(sourceApp, app, { recursive: true, filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.next`) });
  if (fs.existsSync(path.join(sourceApp, "node_modules"))) fs.symlinkSync(path.join(sourceApp, "node_modules"), path.join(app, "node_modules"), "dir");
  else {
    const install = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: app, stdio: "inherit" });
    assert.equal(install.status, 0, "workspace npm ci");
  }

  const cfgFile = path.join(app, "growthub.config.json");
  const cfg = readJson(cfgFile);
  const objects = Array.isArray(cfg?.dataModel?.objects) ? cfg.dataModel.objects.filter((o) => !["model-training-run", "model-training-runner"].includes(o.id)) : [];
  const providerRow = { integrationId: "modal-route-test", Name: "Modal route test", status: "registered", metadata: { computeProvider: { schema: "growthub-compute-provider-v1", adapterId: "modal-functions", capacityProfiles: ["multi-gpu-finetune"], availabilityModes: ["on-demand"], requiredEnv: ["MODAL_KEY", "MODAL_SECRET"], executionLane: "sandbox-local", config: { baseUrl: providerBase, volumeConfigured: true, gpuType: "H100" } } } };
  const studentRow = { integrationId: "student-model", Name: "Student", kind: "custom-model", capabilityType: "custom-model-inference", baseUrl: providerBase, endpoint: "/chat", method: "POST", status: "registered", expectedModelTag: "student-v1", modelTrainingRowId: "workspace-local" };
  const mothership = buildMothershipProxyRow({ modelTag: "student-v1", workspaceSlug: "workspace-local", studentRegistryId: "student-model", fallbackBaseModel: "base-v1", fallbackBaseUrl: providerBase });
  let api = objects.find((o) => o.objectType === "api-registry");
  if (api) api.rows = [...(api.rows || []).filter((r) => ![providerRow.integrationId, studentRow.integrationId, mothership.integrationId].includes(r.integrationId)), providerRow, studentRow, mothership];
  else { api = { id: "api-registry", objectType: "api-registry", label: "API Registry", columns: [], rows: [providerRow, studentRow, mothership] }; objects.push(api); }

  const runIds = ["route-crash", "route-resume", "route-success"];
  const runRows = runIds.map((trainingRunId) => {
    const plan = { mode: "train-remote", tier: "large", baseModel: "qwen3:141b" };
    const capacity = deriveCapacityPlan({ plan, preflight: { ramGB: 16, diskFreeGB: 100, gpu: { present: false } }, workloadKind: "fine-tune", paramsB: 141, estimatedDurationMinutes: 60 });
    const runConfig = buildTrainingRunConfig({ profileId: "unsloth-qlora-quantize-pipeline", baseModel: "qwen3:141b", datasetPath: `data/${trainingRunId}.jsonl`, outputModelTag: "student-v1", artifactPath: `artifacts/${trainingRunId}` });
    const intent = buildComputeIntent({ adaptivePlan: plan, capacityPlan: capacity, policy: { mode: "cloud", excludeLocal: true, budget: { mode: "hard-cap", maxTotalUsd: 50 }, locality: { regions: [], dataResidency: "" } }, trainingRunConfig: runConfig });
    const workSpec = buildComputeWorkSpec({ intent, trainingRunConfig: runConfig, trainingRunId, modelTrainingRowId: "workspace-local", datasetExportId: `export-${trainingRunId}`, corpusSha256: "d".repeat(64) });
    const compute = normalizeComputeBlock({ capacityProfileId: intent.capacityProfileId, providerRegistryId: providerRow.integrationId, selectionMode: "explicit", intent, workSpec, policy: intent.policy });
    return { schema: "growthub-local-model-training-run-v1", trainingRunId, modelTrainingRowId: "workspace-local", datasetExportId: `export-${trainingRunId}`, baseModel: runConfig.baseModel, trainingProfile: runConfig.profileId, runnerMode: runConfig.runnerMode, status: "running", startedAt: new Date().toISOString(), compute: JSON.stringify(compute) };
  });
  objects.push({ id: "model-training-run", objectType: "model-training-run", label: "Training runs", columns: [], rows: runRows });
  objects.push({ id: "model-training-runner", objectType: "sandbox-environment", label: "Training runner", columns: [], rows: runIds.map((Name) => ({ Name, runtime: "node", adapter: "local-process", runLocality: "local", command: "process.exit(0)", timeoutMs: Name === "route-crash" ? 60000 : Name === "route-resume" ? 1000 : 15000, status: "live" })) });
  cfg.dataModel = { ...(cfg.dataModel || {}), objects };
  fs.writeFileSync(cfgFile, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(path.join(app, "growthub.source-records.json"), "{}\n");

  const appPort = await freePort();
  const base = `http://127.0.0.1:${appPort}`;
  const startNext = async () => {
    next = spawn("npx", ["next", "dev", "--webpack", "-p", String(appPort), "-H", "127.0.0.1"], { cwd: app, detached: true, stdio: "ignore", env: { ...process.env, WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true", MODAL_KEY: "test-key", MODAL_SECRET: "test-secret", GROWTHUB_INFERENCE_TEST_ALLOWLIST: "127.0.0.1" } });
    await waitHttp(`${base}/api/workspace`);
  };
  const run = (name, extra = {}) => fetch(`${base}/api/workspace/sandbox-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "model-training-runner", name, ...extra }) });
  const row = async (id) => { const data = await (await fetch(`${base}/api/workspace`, { cache: "no-store" })).json(); return data.workspaceConfig.dataModel.objects.find((o) => o.objectType === "model-training-run").rows.find((r) => r.trainingRunId === id); };

  await startNext();
  void run("route-crash").catch(() => {});
  for (let i = 0; i < 80; i += 1) { const compute = JSON.parse((await row("route-crash")).compute); if (compute.allocation?.allocationId) break; await sleep(100); }
  assert.ok(JSON.parse((await row("route-crash")).compute).allocation?.allocationId, "allocation persisted before crash");
  await stopNext("SIGKILL");
  await startNext();
  const replay = await (await run("route-crash")).json();
  assert.equal(replay.ok, false);
  assert.match(replay.response.error, /duplicate allocation refused/);
  assert.equal(submitCount, 1, "restart did not create a second paid resource");
  await run("route-crash", { computeAction: "cancel" });
  assert.equal(cancelCount, 1);

  const interrupted = await (await run("route-resume")).json();
  assert.equal(interrupted.ok, false);
  const interruptedCompute = JSON.parse((await row("route-resume")).compute);
  assert.equal(interruptedCompute.checkpoints[0].checkpointId, "ck-route");
  const resumed = await (await run("route-resume", { computeAction: "resume", checkpointId: "ck-route" })).json();
  assert.equal(resumed.ok, true);
  assert.equal(resumeCount, 1);

  const success = await (await run("route-success")).json();
  assert.equal(success.ok, true);
  const successRow = await row("route-success");
  const successCompute = JSON.parse(successRow.compute);
  assert.equal(successRow.status, "imported");
  assert.equal(successRow.artifactSha256, artifactSha);
  assert.equal(successCompute.artifact.verifiedSha256, artifactSha);
  assert.equal(successCompute.evaluation.benchmarkWins.promoted, true);
  assert.equal(successCompute.requirementsHash, successCompute.decision.requirements ? successCompute.intent.requirementsHash : "");

  const tested = await (await fetch(`${base}/api/workspace/test-source`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ integrationId: "student-model", prompt: "prove route" }) })).json();
  assert.equal(tested.ok, true);
  const latest = await (await fetch(`${base}/api/workspace`)).json();
  const latestObjects = latest.workspaceConfig.dataModel.objects.map((o) => o.objectType === "api-registry" ? { ...o, rows: o.rows.map((r) => r.integrationId === "student-model" ? { ...r, status: "connected", lastResponse: JSON.stringify({ model: "student-v1" }), lastTested: new Date().toISOString() } : r) } : o);
  const patched = await fetch(`${base}/api/workspace`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataModel: { ...latest.workspaceConfig.dataModel, objects: latestObjects } }) });
  assert.equal(patched.ok, true);
  const finalCfg = (await (await fetch(`${base}/api/workspace`)).json()).workspaceConfig;
  const serving = deriveProxyServingState({ workspaceConfig: finalCfg, baseModel: "base-v1" });
  assert.equal(serving.active?.target, "local-student");
  console.log("compute route realization proof passed: durable crash recovery, no duplicate allocation, cancel/resume, verified artifact, evaluation-only promotion, Mothership reload truth");
} finally {
  await stopNext();
  await new Promise((resolve) => provider.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
}
