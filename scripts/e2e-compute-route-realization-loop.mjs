#!/usr/bin/env node
/**
 * Booted disposable workspace proof of the real sandbox-run compute path.
 *
 * The seeded rows carry only customer compute requests. The booted server
 * compiles/seals authority, journals before provider IO, survives a process
 * kill after allocation, adopts the same provider call without a second
 * create, continues observation in a later request, cancels and releases a
 * pending run, adopts a new resume resource, verifies artifact bytes, ignores
 * provider-authored benchmark wins, rejects PATCH forgery/erasure, and keeps
 * Mothership routing truth after reload.
 */

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
const { buildMothershipProxyRow, deriveProxyServingState } = await import(lib("distillation-fleet.js"));

const AUTHORITY_KEY = "route-proof-authority-key";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "growthub-compute-route-"));
const app = path.join(tmp, "workspace");
const artifactBytes = Buffer.from("verified governed model artifact bytes\n");
const artifactSha = crypto.createHash("sha256").update(artifactBytes).digest("hex");
let submitCount = 0;
let resumeCount = 0;
let cancelCount = 0;
let datasetFetchCount = 0;
let crashObservationEnabled = false;
const statusCalls = new Map();
const submittedAuthority = new Map();
const attestedArtifact = (callId) => {
  const attestation = submittedAuthority.get(callId) || {};
  return {
    kind: "gguf",
    locator: `${providerBase}/artifact`,
    sha256: artifactSha,
    sizeBytes: artifactBytes.length,
    workSpecHash: attestation.workSpecHash,
    corpusSha256: attestation.corpusSha256,
  };
};

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const waitHttp = async (url, timeout = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}`);
};

const providerPort = await freePort();
const providerBase = `http://127.0.0.1:${providerPort}`;
// The provider self-scores intentionally prefer the base. They are
// untrusted diagnostics and can never create canonical benchmarkWins.
const fabricatedEvaluationResults = Array.from({ length: 6 }, (_, index) => ({
  taskId: `provider-controlled-${index}`,
  student: { quality: 0, latencyMs: 100, costUsd: 100 },
  baseline: { quality: 1, latencyMs: 1, costUsd: 0 },
}));

const provider = http.createServer(async (req, res) => {
  const url = new URL(req.url, providerBase);
  let body = {};
  if (req.method !== "GET") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
  }
  const json = (status, value) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };

  if (url.pathname === "/health") return json(200, {
    ok: true,
    growthub: { allocationIdempotency: "growthub-idempotency-key-v1" },
  });
  if (url.pathname === "/artifact") {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    return res.end(artifactBytes);
  }
  if (["/chat", "/v1/chat/completions", "/chat/completions"].includes(url.pathname)) {
    const requestedModel = String(body?.model || "");
    if (requestedModel === "teacher-v1") {
      // The canonical evaluator judge contract is available, but the booted
      // generic student endpoint is deliberately NOT allowed to claim exact
      // artifact identity. Evaluation must remain pending until a proof-gated
      // runtime independently resolves the returned artifact SHA.
      return json(200, {
        model: "teacher-v1",
        choices: [{ message: { role: "assistant", content: JSON.stringify({ winner: "tuned", score: 5, reason: "the tuned answer follows the governed workspace behavior more accurately" }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      });
    }
    const model = requestedModel || "student-v1";
    return json(200, {
      model,
      choices: [{ message: { role: "assistant", content: model === "base-v1" ? "generic base answer" : "workspace-specific tuned answer" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
  }
  if (url.pathname === "/submit") {
    submitCount += 1;
    assert.match(String(body.workSpec?.workSpecHash || ""), /^[0-9a-f]{64}$/);
    assert.equal(body.workSpec?.output?.modelTag, "student-v1");
    assert.equal(body.datasetAccess?.workSpecHash, body.workSpec.workSpecHash);
    const corpusResponse = await fetch(body.datasetAccess?.uri);
    assert.equal(corpusResponse.ok, true, "provider can retrieve the signed governed corpus");
    const corpusBytes = Buffer.from(await corpusResponse.arrayBuffer());
    const corpusSha = crypto.createHash("sha256").update(corpusBytes).digest("hex");
    assert.equal(corpusSha, body.datasetAccess.corpusSha256);
    assert.equal(corpusBytes.byteLength, body.datasetAccess.sizeBytes);
    datasetFetchCount += 1;
    const callId = `call-${body.workSpec.trainingRunId}`;
    submittedAuthority.set(callId, {
      workSpecHash: body.workSpec.workSpecHash,
      corpusSha256: body.datasetAccess.corpusSha256,
    });
    return json(200, { call_id: callId });
  }
  if (url.pathname === "/resume") {
    resumeCount += 1;
    assert.ok(body.workSpec?.workSpecHash && body.checkpoint?.sha256);
    return json(200, { call_id: `resume-${body.workSpec.trainingRunId}` });
  }
  if (url.pathname === "/cancel") {
    cancelCount += 1;
    return json(200, { cancelled: true });
  }
  if (url.pathname === "/status") {
    const id = url.searchParams.get("call_id") || "";
    const runId = id.replace(/^call-/, "").replace(/^resume-/, "");
    const count = (statusCalls.get(id) || 0) + 1;
    statusCalls.set(id, count);

    if (runId === "route-crash") {
      if (!crashObservationEnabled) return; // Next is killed while this hangs.
      if (count <= 2) return json(200, { status: "running" });
      return json(200, {
        status: "success",
        artifact: attestedArtifact(id),
        evaluationResults: fabricatedEvaluationResults,
      });
    }
    if (runId === "route-resume") {
      if (id.startsWith("resume-")) return json(200, { status: "running" });
      return json(200, {
        status: "failure",
        error: "injected interruption",
        checkpoint: {
          checkpointId: "ck-route",
          runRef: { trainingRunId: runId },
          locator: "s3://checkpoint/route",
          sha256: "c".repeat(64),
          step: 42,
        },
      });
    }
    if (runId === "route-cancel") return json(200, { status: "running" });
    if (count === 1) return json(200, { status: "running" });
    return json(200, {
      status: "success",
      artifact: attestedArtifact(id),
      evaluationResults: fabricatedEvaluationResults,
    });
  }
  json(404, { error: "not found" });
});
await new Promise((resolve) => provider.listen(providerPort, "127.0.0.1", resolve));

let next = null;
const stopNext = async (signal = "SIGTERM") => {
  if (!next) return;
  try { process.kill(-next.pid, signal); } catch {}
  next = null;
  await sleep(750);
};

try {
  fs.cpSync(sourceApp, app, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.next`),
  });
  if (fs.existsSync(path.join(sourceApp, "node_modules"))) {
    fs.symlinkSync(path.join(sourceApp, "node_modules"), path.join(app, "node_modules"), "dir");
  } else {
    const install = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: app, stdio: "inherit" });
    assert.equal(install.status, 0, "workspace npm ci");
  }

  const cfgFile = path.join(app, "growthub.config.json");
  const cfg = readJson(cfgFile);
  const objects = Array.isArray(cfg?.dataModel?.objects)
    ? cfg.dataModel.objects.filter((object) => !["model-training", "model-training-run", "model-training-runner"].includes(object.id))
    : [];
  const providerRow = {
    integrationId: "modal-route-test",
    Name: "Modal route test",
    status: "registered",
    metadata: {
      computeProvider: {
        schema: "growthub-compute-provider-v1",
        adapterId: "modal-functions",
        capacityProfiles: ["multi-gpu-finetune"],
        availabilityModes: ["on-demand"],
        requiredEnv: ["MODAL_KEY", "MODAL_SECRET"],
        executionLane: "sandbox-local",
        config: { baseUrl: providerBase, volumeConfigured: true, gpuType: "H100" },
      },
    },
  };
  const studentRow = {
    integrationId: "student-model",
    Name: "Student",
    kind: "custom-model",
    capabilityType: "custom-model-inference",
    baseUrl: providerBase,
    endpoint: "/chat",
    method: "POST",
    status: "registered",
    expectedModelTag: "student-v1",
    modelTrainingRowId: "workspace-local",
  };
  const mothership = buildMothershipProxyRow({
    modelTag: "student-v1",
    workspaceSlug: "workspace-local",
    studentRegistryId: "student-model",
    fallbackBaseModel: "base-v1",
    fallbackBaseUrl: providerBase,
    teacher: { providerId: "teacher-test", baseUrl: providerBase, modelTag: "teacher-v1", authEnvVar: "" },
  });
  let api = objects.find((object) => object.objectType === "api-registry");
  if (api) {
    api.rows = [
      ...(api.rows || []).filter((row) => ![providerRow.integrationId, studentRow.integrationId, mothership.integrationId].includes(row.integrationId)),
      providerRow,
      studentRow,
      mothership,
    ];
  } else {
    api = { id: "api-registry", objectType: "api-registry", label: "API Registry", columns: [], rows: [providerRow, studentRow, mothership] };
    objects.push(api);
  }

  // Canonical evaluation holdouts are server-owned workspace evidence and
  // are deliberately not exported into the training corpus.
  const holdoutRows = Array.from({ length: 6 }, (_, index) => ({
    inputPrompt: `Canonical evaluation holdout ${index}: answer with the governed workspace behavior.`,
    agentOutput: `reference ${index}`,
    qualityScore: 5,
    redactionStatus: "clear",
    exported: "false",
    evaluationHoldout: true,
    sessionDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
  }));
  const existingTraces = objects.find((object) => object.id === "training-traces" || object.objectType === "training-traces");
  if (existingTraces) existingTraces.rows = [...(existingTraces.rows || []), ...holdoutRows];
  else objects.push({ id: "training-traces", objectType: "training-traces", label: "Training Traces", columns: [], rows: holdoutRows });

  const runIds = ["route-crash", "route-resume", "route-cancel", "route-success"];
  const corpusRows = runIds.flatMap((trainingRunId) => Array.from({ length: 2 }, (_, exportOrdinal) => ({
    inputPrompt: `Training corpus ${trainingRunId} prompt ${exportOrdinal}`,
    agentOutput: `Training corpus ${trainingRunId} answer ${exportOrdinal}`,
    qualityScore: 5,
    redactionStatus: "clear",
    exported: "true",
    lastExportId: `export-${trainingRunId}`,
    datasetExportId: `export-${trainingRunId}`,
    exportOrdinal,
    trainingExportIds: [`export-${trainingRunId}`],
  })));
  const tracesObject = objects.find((object) => object.id === "training-traces" || object.objectType === "training-traces");
  if (tracesObject) tracesObject.rows = [...(tracesObject.rows || []), ...corpusRows];
  else objects.push({ id: "training-traces", objectType: "training-traces", label: "Training Traces", columns: [], rows: corpusRows });

  const runRows = runIds.map((trainingRunId) => ({
    schema: "growthub-local-model-training-run-v1",
    trainingRunId,
    modelTrainingRowId: "workspace-local",
    datasetExportId: `export-${trainingRunId}`,
    baseModel: "qwen3:141b",
    trainingProfile: "unsloth-qlora-quantize-pipeline",
    runnerMode: "provider-compute",
    status: "running",
    startedAt: new Date().toISOString(),
    preflight: { ramGB: 16, diskFreeGB: 100, gpu: { present: false, name: "", vramFreeGB: 0 } },
    computeRequest: JSON.stringify({
      schema: "growthub-compute-request-v1",
      policy: { mode: "cloud", excludeLocal: true, budget: { mode: "hard-cap", maxTotalUsd: 50 }, locality: { regions: [], dataResidency: "" } },
      selectionMode: "explicit",
      providerRegistryId: "modal-route-test",
      capacityProfileId: "multi-gpu-finetune",
      trainingProfileId: "unsloth-qlora-quantize-pipeline",
      baseModel: "qwen3:141b",
      datasetExportId: `export-${trainingRunId}`,
      datasetPath: `data/${trainingRunId}.jsonl`,
      outputModelTag: "student-v1",
      artifactPath: `artifacts/${trainingRunId}`,
      estimatedDurationMinutes: 60,
    }),
  }));
  objects.push({
    id: "model-training",
    objectType: "model-training",
    label: "Model Training",
    columns: [],
    rows: runIds.map((trainingRunId, index) => ({
      Name: `workspace-local-v${index + 1}`,
      status: "prepared",
      apiRegistryId: "student-model",
      baseModel: "qwen3:141b",
      localModel: "student-v1",
      lastExportId: `export-${trainingRunId}`,
      lastExportSummary: JSON.stringify({ recordCount: 2, path: `data/${trainingRunId}.jsonl`, registryId: "student-model", version: index + 1 }),
    })),
  });
  objects.push({ id: "model-training-run", objectType: "model-training-run", label: "Training runs", columns: [], rows: runRows });
  objects.push({
    id: "model-training-runner",
    objectType: "sandbox-environment",
    label: "Training runner",
    columns: [],
    rows: runIds.map((Name) => ({
      Name,
      runtime: "node",
      adapter: "local-process",
      runLocality: "local",
      command: "process.exit(0)",
      timeoutMs: Name === "route-crash" ? 60000 : Name === "route-success" ? 15000 : 1000,
      status: "live",
    })),
  });
  cfg.dataModel = { ...(cfg.dataModel || {}), objects };
  fs.writeFileSync(cfgFile, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(path.join(app, "growthub.source-records.json"), "{}\n");

  const appPort = await freePort();
  const base = `http://127.0.0.1:${appPort}`;
  const startNext = async () => {
    next = spawn("npx", ["next", "dev", "--webpack", "-p", String(appPort), "-H", "127.0.0.1"], {
      cwd: app,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
        MODAL_KEY: "test-key",
        MODAL_SECRET: "test-secret",
        GROWTHUB_INFERENCE_TEST_ALLOWLIST: "127.0.0.1",
        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,
        GROWTHUB_COMPUTE_PUBLIC_BASE_URL: base,
        GROWTHUB_COMPUTE_DATA_ROOT: path.join(tmp, "compute-data"),
        GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "127.0.0.1",
        GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "127.0.0.1",
      },
    });
    await waitHttp(`${base}/api/workspace`);
  };
  const run = (name, extra = {}) => fetch(`${base}/api/workspace/sandbox-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectId: "model-training-runner", name, ...extra }),
  });
  const row = async (id) => {
    const data = await (await fetch(`${base}/api/workspace`, { cache: "no-store" })).json();
    return data.workspaceConfig.dataModel.objects
      .find((object) => object.objectType === "model-training-run")
      .rows.find((entry) => entry.trainingRunId === id);
  };

  await startNext();

  // Crash after the paid resource identity is durable, while observation is hung.
  void run("route-crash").catch(() => {});
  for (let index = 0; index < 120; index += 1) {
    const compute = (await row("route-crash")).compute;
    if (compute && JSON.parse(compute).allocation?.allocationId) break;
    await sleep(100);
  }
  const crashCompute = JSON.parse((await row("route-crash")).compute || "null");
  assert.ok(crashCompute?.allocation?.allocationId, "allocation persisted before crash");
  assert.equal(crashCompute.authority?.schema, "growthub-compute-authority-v1");
  assert.ok(crashCompute.authority?.seal);
  assert.match(String(crashCompute.authority?.keyId || ""), /^env-/);
  assert.equal(submitCount, 1, "one provider create occurred before the process was killed");

  await stopNext("SIGKILL");
  crashObservationEnabled = true;
  await startNext();
  const recovered = await (await run("route-crash")).json();
  assert.equal(recovered.ok, true, recovered.response?.error);
  assert.equal(submitCount, 1, "restart adopted and observed the existing provider call; no second create");
  const recoveredRow = await row("route-crash");
  const recoveredCompute = JSON.parse(recoveredRow.compute);
  assert.equal(recoveredCompute.allocation.allocationId, crashCompute.allocation.allocationId);
  assert.equal(recoveredRow.status, "imported");
  assert.equal(recoveredCompute.artifact.verifiedSha256, artifactSha);
  assert.equal(recoveredCompute.dataset?.deliveryStatus, "delivered");
  assert.match(String(recoveredCompute.dataset?.manifestHash || ""), /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(recoveredCompute.dataset).includes("/api/workspace/compute-data/"), false, "bearer corpus URL never enters receipt evidence");
  assert.equal(recoveredCompute.evaluation, null, "provider-authored wins did not become canonical evaluation");
  assert.equal(recovered.response.adapterMeta.compute.canonicalEvaluationPending, true);
  assert.match(String(recovered.response.adapterMeta.compute.evaluationPendingReason || ""), /independently verify|unbound candidate runtime/);

  // A pending remote run remains live until the governed cancel action confirms cancellation/release.
  const pendingCancel = await (await run("route-cancel")).json();
  assert.equal(pendingCancel.ok, true, JSON.stringify(pendingCancel.response || pendingCancel).slice(0, 600));
  assert.equal(pendingCancel.response.exitCode, null);
  assert.equal(pendingCancel.response.adapterMeta.compute.pending, true);
  const cancelled = await (await run("route-cancel", { computeAction: "cancel" })).json();
  assert.equal(cancelled.ok, true, cancelled.response?.error);
  assert.ok(cancelCount >= 1);
  const cancelledCompute = JSON.parse((await row("route-cancel")).compute);
  const cancelledLifecycleTypes = cancelledCompute.events.map((event) => event.type);
  assert.ok(cancelledLifecycleTypes.includes("compute-cancelled"));
  assert.ok(cancelledLifecycleTypes.includes("compute-released"));

  // Failed run captures a proven checkpoint; resume persists/adopts a new provider call id.
  const interrupted = await (await run("route-resume")).json();
  assert.equal(interrupted.ok, false);
  const interruptedCompute = JSON.parse((await row("route-resume")).compute);
  assert.equal(interruptedCompute.checkpoints[0].checkpointId, "ck-route");
  const resumed = await (await run("route-resume", { computeAction: "resume", checkpointId: "ck-route" })).json();
  assert.equal(resumed.ok, true, resumed.response?.error);
  assert.equal(resumeCount, 1);
  const resumedCompute = JSON.parse((await row("route-resume")).compute);
  assert.equal(resumedCompute.allocation.runRef.providerResourceId, "resume-route-resume");
  assert.equal(resumedCompute.allocation.allocationId, "resume-route-resume");
  assert.equal(resumedCompute.allocation.releaseConfirmed, false);

  // Clean success imports verified bytes but still cannot use provider scores to promote.
  const success = await (await run("route-success")).json();
  assert.equal(success.ok, true, success.response?.error);
  const successRow = await row("route-success");
  const successCompute = JSON.parse(successRow.compute);
  assert.equal(successRow.status, "imported");
  assert.equal(successRow.artifactSha256, artifactSha);
  assert.equal(successCompute.artifact.verifiedSha256, artifactSha);
  assert.equal(successCompute.artifact.providerAttestationVerified, true);
  assert.equal(successCompute.artifact.workSpecHash, successCompute.workSpecHash);
  assert.equal(successCompute.artifact.corpusSha256, successCompute.workSpec.dataset.corpusSha256);
  assert.equal(successCompute.dataset?.deliveryStatus, "delivered");
  assert.equal(successCompute.dataset?.corpusSha256, successCompute.workSpec?.dataset?.corpusSha256);
  assert.ok(datasetFetchCount >= 3, "remote providers fetched server-materialized corpus bytes before artifact import");
  assert.equal(successCompute.evaluation, null, "tag-only endpoint cannot grade the returned artifact");
  assert.equal(success.response.adapterMeta.compute.canonicalEvaluationPending, true);
  assert.match(String(success.response.adapterMeta.compute.evaluationPendingReason || ""), /independently verify|unbound candidate runtime/);
  const successDistillation = typeof successRow.distillation === "string"
    ? JSON.parse(successRow.distillation)
    : successRow.distillation;
  assert.equal(successDistillation?.benchmarkWins, undefined, "provider-controlled score rows and tag-only runtime never minted promotion");
  assert.equal(successCompute.authority?.schema, "growthub-compute-authority-v1");
  assert.equal(successCompute.workSpecHash, successCompute.authority.workSpecHash);
  assert.equal(successCompute.requirementsHash, successCompute.authority.requirementsHash);
  assert.equal(successCompute.workSpec.output.modelTag, "student-v1");

  // Direct PATCH cannot forge, erase, omit, demote, or rename server-owned evidence.
  const forgeState = await (await fetch(`${base}/api/workspace`, { cache: "no-store" })).json();
  const forgeEvidence = (mutate) => forgeState.workspaceConfig.dataModel.objects.map((object) =>
    object.objectType === "model-training-run"
      ? { ...object, rows: object.rows.map((entry) => entry.trainingRunId === "route-success" ? mutate(entry) : entry) }
      : object);
  const forgeAttempts = [
    ["forged evaluation/promotion", (entry) => ({ ...entry, compute: JSON.stringify({ ...JSON.parse(entry.compute), evaluation: { source: "workspace-canonical", benchmarkWins: { total: 6, wins: 6, winRatePct: 100, promoted: true } } }) })],
    ["forged allocation identity", (entry) => ({ ...entry, compute: JSON.stringify({ ...JSON.parse(entry.compute), allocation: { ...JSON.parse(entry.compute).allocation, allocationId: "alloc-forged" } }) })],
    ["erased compute journal", (entry) => ({ ...entry, compute: "" })],
    ["omitted compute journal", (entry) => { const { compute, ...rest } = entry; return rest; }],
    ["rewritten verified artifact", (entry) => ({ ...entry, artifactSha256: "f".repeat(64) })],
    ["omitted verified artifact", (entry) => { const { artifactSha256, ...rest } = entry; return rest; }],
    ["demoted imported status", (entry) => ({ ...entry, status: "running" })],
    ["changed frozen request", (entry) => ({ ...entry, computeRequest: JSON.stringify({ ...JSON.parse(entry.computeRequest), outputModelTag: "attacker-tag" }) })],
    ["renamed training run", (entry) => ({ ...entry, trainingRunId: "route-success-evaded" })],
  ];
  for (const [label, mutate] of forgeAttempts) {
    const forged = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: { ...forgeState.workspaceConfig.dataModel, objects: forgeEvidence(mutate) } }),
    });
    assert.equal(forged.status, 422, `${label}: PATCH forgery must be rejected`);
    const verdict = await forged.json();
    assert.ok((verdict.violations || []).some((violation) => violation.code === "training_evidence_field"));
  }
  const rowDeleted = forgeState.workspaceConfig.dataModel.objects.map((object) =>
    object.objectType === "model-training-run"
      ? { ...object, rows: object.rows.filter((entry) => entry.trainingRunId !== "route-success") }
      : object);
  const rowDeletion = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: { ...forgeState.workspaceConfig.dataModel, objects: rowDeleted } }),
  });
  assert.equal(rowDeletion.status, 422);
  const objectDeleted = forgeState.workspaceConfig.dataModel.objects.filter((object) => object.objectType !== "model-training-run");
  const objectDeletion = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: { ...forgeState.workspaceConfig.dataModel, objects: objectDeleted } }),
  });
  assert.equal(objectDeletion.status, 422);
  const echoed = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: forgeState.workspaceConfig.dataModel }),
  });
  assert.equal(echoed.ok, true);

  const tested = await (await fetch(`${base}/api/workspace/test-source`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ integrationId: "student-model", prompt: "prove route" }),
  })).json();
  assert.equal(tested.ok, true);
  const latest = await (await fetch(`${base}/api/workspace`)).json();
  const latestObjects = latest.workspaceConfig.dataModel.objects.map((object) =>
    object.objectType === "api-registry"
      ? {
          ...object,
          rows: object.rows.map((entry) => entry.integrationId === "student-model"
            ? { ...entry, status: "connected", lastResponse: JSON.stringify({ model: "student-v1" }), lastTested: new Date().toISOString() }
            : entry),
        }
      : object);
  const patched = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: { ...latest.workspaceConfig.dataModel, objects: latestObjects } }),
  });
  assert.equal(patched.ok, true);
  const finalCfg = (await (await fetch(`${base}/api/workspace`)).json()).workspaceConfig;
  const serving = deriveProxyServingState({ workspaceConfig: finalCfg, baseModel: "base-v1" });
  assert.equal(serving.active?.target, "local-student");

  console.log("compute route proof passed: sealed authority, crash adoption without duplicate create, bounded continuation, cancel/release, active resume resource, verified artifact, provider-score isolation, proof-gated evaluation pending on an unbound runtime, PATCH integrity, Mothership reload truth");
} finally {
  await stopNext();
  await new Promise((resolve) => provider.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
}
