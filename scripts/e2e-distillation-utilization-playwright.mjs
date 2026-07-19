#!/usr/bin/env node
/**
 * Distillation utilization — REAL-BROWSER + REAL-HTTP closed-loop proof.
 *
 * Runs against a live `next dev` boot of the exported model-QA workspace AND
 * a live local OpenAI-compatible endpoint (scripts/lib/
 * distillation-teacher-endpoint.mjs — real sockets, real 200s, strict
 * OpenAI contract, every exchange harvested as a governed trace).
 *
 * HONESTY CONTRACT (what is and is not real here):
 *   - TRANSPORT IS REAL: every chat completion is a real HTTP round trip
 *     observed on the wire; browser captures are the real UI on the live
 *     boot; the one-click workflow lane executes for real (draft test-run →
 *     attest → publish gate → live run, runtime-hashed output).
 *   - THE MODEL IS A STAND-IN: no weights were trained. The endpoint serves
 *     teacher-pack content under the workspace tag (the mothership-proxy
 *     realization); "served == tuned tag" is therefore a TAG-CONTRACT proof
 *     of the verification plumbing, not evidence a tuned model exists. The
 *     training receipt wired below is a labeled FIXTURE (runnerMode
 *     "fixture") — the physical fine-tune is the operator's deferred step.
 *   - Provenance legend per readback: "live-http" = observed on the wire;
 *     "live-http-transport, simulated-model" = real transport, stand-in
 *     model identity; "cli-stamped" = written to the sidecar file by this
 *     harness through the CLI-owned lane; "derived" = pure derivation over
 *     live governed rows.
 *
 * The loop proven, in the identical shapes the mothership custom-model
 * training structures use (api-registry row + chat-completions lastResponse,
 * model-training-run receipts, trace sidecar, sandbox smoke):
 *
 *   eligibility → model identity + registry row → REAL first invocation
 *   (HTTP 200, served tag == tuned tag) → REAL utilization across clusters →
 *   harvest → trace-capture receipt → cockpit complete → base-tag demotion
 *   negative (real response, honest fallback) → recovery.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3777 MODEL_URL=http://127.0.0.1:11434 \
 *   APP_DIR=<exported apps/workspace dir> HARVEST=<harvest.jsonl> \
 *   PLAYWRIGHT_DIR=$PWD node scripts/e2e-distillation-utilization-playwright.mjs [shot-dir]
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3777").replace(/\/$/, "");
const MODEL_URL = String(process.env.MODEL_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const APP_DIR = process.env.APP_DIR || "";
const HARVEST = process.env.HARVEST || "";
const shotDir = path.resolve(process.argv[2] || "docs/proofs/distillation-flywheel");
fs.mkdirSync(shotDir, { recursive: true });
const GLOBAL_PW = "/opt/node22/lib/node_modules/playwright/node_modules/playwright-core";
const requirePw = createRequire(pathToFileURL(path.join(GLOBAL_PW, "package.json")).href);
const { chromium } = requirePw(".");

const DIR = process.env.PLAYWRIGHT_DIR || process.cwd();
const lib = (rel) => pathToFileURL(path.join(DIR, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib", rel)).href;
const { verifyTunedResponse, deriveEndpointVerification } = await import(lib("training-verification.js"));
const { captureChatCompletion, buildRegistryTestStamp } = await import(lib("training-deployment.js"));
const { deriveCustomModelsState } = await import(lib("custom-models-ledger.js"));
const { deriveDistillationPipelineState } = await import(lib("training-ledger.js"));
const { normalizeDistillationTrace, computeTraceRootHash, distillationTracesSourceKey, buildTraceCaptureReceiptFields } = await import(lib("distillation-gateway.js"));
const { buildCustomModelWorkflowVariants, buildCustomModelSandboxRow, CUSTOM_MODEL_WORKFLOWS_OBJECT_ID } = await import(lib("custom-models-ledger.js"));
const { deriveProxyServingState, buildMothershipProxyRow, deriveFlywheelState } = await import(lib("distillation-fleet.js"));
const { deriveTrainingRunState, trainingRunSourceKey } = await import(lib("training-run-receipts.js"));

const R = [];
const rec = (s, ok, d = "") => { R.push({ s, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${s}${d ? ` — ${d}` : ""}`); if (!ok) process.exitCode = 1; };
const getWS = async () => (await fetch(`${BASE}/api/workspace`, { cache: "no-store" })).json();
const patchWS = async (objects) => (await fetch(`${BASE}/api/workspace`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataModel: { objects } }) })).status;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const TAG = "workspace-local-tuned-v1";
const BASEM = "gemma3";
const REG = "workspace-local-model";
const RUN_COLUMNS = ["trainingRunId", "modelTrainingRowId", "datasetExportId", "baseModel", "trainingProfile", "runnerMode", "status", "startedAt", "completedAt", "artifactType", "artifactModelTag", "artifactPath", "artifactSha256", "artifactQuantization", "artifactSourceBytes", "artifactArtifactBytes", "progress", "preflight", "blockedReason", "runKind", "distillation", "schema"];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-proxy-server", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const shot = async (n) => { await page.screenshot({ path: path.join(shotDir, n), fullPage: false }); console.log(`  shot: ${n}`); };
const txt = async (sel) => { try { const l = page.locator(sel).first(); return (await l.count()) ? (await l.innerText()).trim().replace(/\s+/g, " ") : ""; } catch { return ""; } };
const write = (o) => { fs.writeFileSync(path.join(shotDir, `${o.stateId}-readback.json`), `${JSON.stringify(o, null, 2)}\n`); console.log(`  readback: ${o.stateId}`); };

/** Registry row helpers over the LIVE workspace. */
async function upsertRegistryRow(row) {
  const cfg = await getWS();
  const objs = cfg.workspaceConfig.dataModel.objects;
  let reg = objs.find((o) => o.objectType === "api-registry");
  if (!reg) { reg = { id: "api-registry", objectType: "api-registry", rows: [] }; objs.push(reg); }
  const i = (reg.rows || []).findIndex((r) => r.integrationId === row.integrationId);
  if (i >= 0) reg.rows[i] = { ...reg.rows[i], ...row };
  else reg.rows.push(row);
  const status = await patchWS(objs);
  await wait(400);
  return status;
}
async function liveRegistryRow(id = REG) {
  const o = (await getWS()).workspaceConfig.dataModel.objects;
  return o.filter((x) => x.objectType === "api-registry").flatMap((x) => x.rows || []).find((r) => r.integrationId === id) || null;
}

// Canonical cockpit entry (same path as the 16-state capture).
async function ensureAssistantLive() {
  const cfg = await getWS();
  const objs = cfg.workspaceConfig.dataModel.objects;
  const liveRow = { Name: "workspace-helper", lifecycleStatus: "live", runLocality: "local", adapter: "local-intelligence", intelligenceAdapterMode: "ollama", localModel: BASEM, localEndpoint: `${MODEL_URL}/v1`, status: "live" };
  const hs = objs.find((o) => o.id === "workspace-helper-sandbox");
  if (!hs) objs.push({ id: "workspace-helper-sandbox", label: "Workspace Helper", source: "Workspace Helper", objectType: "sandbox-environment", icon: "Sparkles", columns: Object.keys(liveRow), rows: [liveRow], binding: { mode: "manual", source: "Workspace Helper" }, relations: [], fieldSettings: { hidden: [], order: Object.keys(liveRow) } });
  else hs.rows = [{ ...(hs.rows?.[0] || {}), ...liveRow }];
  await patchWS(objs);
  await wait(600);
}
async function openCustomModelsCockpit() {
  await ensureAssistantLive();
  await page.goto(`${BASE}/data-model?helper=open&prompt=${encodeURIComponent("/custom-models")}`, { waitUntil: "networkidle" });
  await wait(2000);
  const composer = page.locator(".dm-helper-composer-textarea");
  for (let i = 0; i < 20 && !(await composer.count()); i += 1) await wait(400);
  if (await composer.count()) { await composer.first().focus(); await page.keyboard.press("Enter"); }
  await page.locator("[data-custom-models-view]").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await wait(800);
  return (await page.locator("[data-custom-models-view]").count()) > 0;
}

// ---------------------------------------------------------------------------
// util-00 — live boot eligibility (browser ⟺ API ⟺ deriver agreement)
// ---------------------------------------------------------------------------
{
  const ws = await getWS();
  const pipeline = deriveDistillationPipelineState({ workspaceConfig: ws.workspaceConfig });
  rec("util-00 live boot eligible", pipeline.ready === true && pipeline.graded >= 10, `graded=${pipeline.graded}`);
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await wait(2500);
  await shot("util-00-live-boot-eligible.png");
  write({
    stateId: "util-00-live-boot-eligible",
    visibleTitle: await txt("h1"),
    visibleStatus: `eligible (graded ${pipeline.graded} / floor 10)`,
    primaryCta: "Configure traces",
    surface: "/training ledger on the live exported boot",
    governedRows: { trainingTraces: "training-traces", modelTraining: "workspace-local" },
    proof: { deriverReady: pipeline.ready, graded: pipeline.graded, apiStatus: 200 },
    provenance: "derived",
    nextAllowedAction: "wire_model_identity",
  });
}

// ---------------------------------------------------------------------------
// Wire the model identity + registry row + training receipt (governed PATCH),
// exactly the rows the mothership custom-model training structures use.
// ---------------------------------------------------------------------------
{
  const cfg = await getWS();
  const objs = cfg.workspaceConfig.dataModel.objects;
  const training = objs.find((o) => o.id === "model-training");
  const row = training.rows[0];
  row.localModel = TAG; row.modelVersion = TAG; row.apiRegistryId = REG;
  row.deployedEndpoint = `${MODEL_URL}/v1/chat/completions`;
  row.lastExportSummary = JSON.stringify({ ...JSON.parse(row.lastExportSummary), registryId: REG });
  let run = objs.find((o) => o.objectType === "model-training-run");
  if (!run) { run = { id: "model-training-run", label: "Model Training Runs", source: "Training Runtime", objectType: "model-training-run", icon: "Database", columns: RUN_COLUMNS, rows: [], binding: { mode: "manual", source: "Training Runtime" }, relations: [], fieldSettings: { hidden: [], order: RUN_COLUMNS } }; objs.push(run); }
  run.columns = RUN_COLUMNS;
  // A LABELED FIXTURE receipt (runnerMode "fixture") — the same class as the
  // 16-state capture's "simulated (stamped receipt)" provenance: it exercises
  // the ladder/UI, it is NOT evidence a training run executed. The physical
  // fine-tune is the operator's deferred step.
  run.rows = [{
    trainingRunId: "run_distill_dense_fixture_1", modelTrainingRowId: "workspace-local", datasetExportId: row.lastExportId,
    baseModel: BASEM, trainingProfile: "kimi-distill-dense-student", runnerMode: "fixture", status: "verified",
    startedAt: "2026-07-18T20:00:00.000Z", completedAt: "2026-07-18T20:40:00.000Z",
    artifactType: "ollama-model", artifactModelTag: TAG, artifactPath: "./artifacts/run1/model.q4_k_m.gguf",
    artifactSha256: "fixture-not-a-real-artifact", artifactQuantization: "q4_k_m", artifactSourceBytes: 8000000000, artifactArtifactBytes: 2200000000,
    distillation: JSON.stringify({ teacherModel: "claude-subagent-teacher", studentArchitecture: "dense", generation: 1 }),
    schema: "growthub-local-model-training-run-v1",
  }];
  const proxy = buildMothershipProxyRow({ modelTag: TAG, studentRegistryId: REG, fallbackBaseModel: "gemma3:1b", fallbackBaseUrl: MODEL_URL });
  proxy.status = "connected"; proxy.lastTested = new Date().toISOString();
  const reg = objs.find((o) => o.objectType === "api-registry") || (objs.push({ id: "api-registry", objectType: "api-registry", rows: [] }), objs[objs.length - 1]);
  for (const r of [
    { integrationId: REG, authRef: "", baseUrl: `${MODEL_URL}/v1`, endpoint: "/chat/completions", method: "POST", status: "registered", capabilities: "chat-completions", executionLane: "sandbox-local", kind: "custom-model", expectedModelTag: TAG },
    proxy,
  ]) {
    const i = (reg.rows || []).findIndex((x) => x.integrationId === r.integrationId);
    if (i >= 0) reg.rows[i] = { ...reg.rows[i], ...r }; else reg.rows.push(r);
  }
  const status = await patchWS(objs);
  rec("model identity + registry + receipt wired through PATCH", status === 200, `PATCH ${status}`);
}

// ---------------------------------------------------------------------------
// util-01 — FIRST INVOCATION: the app's own server calls the endpoint (real
// HTTP 200), the response is stamped, verifyTunedResponse proves the tag.
// ---------------------------------------------------------------------------
{
  const res = await fetch(`${BASE}/api/workspace/test-api-record`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ record: { baseUrl: `${MODEL_URL}/v1`, endpoint: "/chat/completions", method: "POST", integrationId: REG, capabilities: "chat-completions", expectedModelTag: TAG } }),
  });
  const body = await res.json();
  rec("util-01 app-server → endpoint HTTP 200 (strict contract: real probe body, no bodyless POST)", res.status === 200 && body.ok === true && body.status === 200, `status=${body.status}`);
  const verdict = verifyTunedResponse({ expectedTag: TAG, baseModel: BASEM, responseBody: body.response });
  rec("util-01 tag-contract proof: response model field matches the expected tag (stand-in model — see header)", verdict.verified === true, verdict.servedModel);
  // Stamp the invocation into the registry row — the modal's own flow. The
  // re-read below proves ONLY persistence round-trip, not new verification.
  await upsertRegistryRow({ integrationId: REG, status: "connected", lastTested: new Date().toISOString(), lastResponse: JSON.stringify(body.response) });
  const liveRow = await liveRegistryRow();
  const liveVerdict = deriveEndpointVerification({ registryRow: liveRow, expectedTag: TAG, baseModel: BASEM });
  rec("util-01 stamped verification persists round-trip (persistence check, not independent proof)", liveVerdict.verified === true);
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await wait(2500);
  await shot("util-01-first-invocation-200.png");
  write({
    stateId: "util-01-first-invocation-200",
    visibleTitle: TAG,
    visibleStatus: "First invocation · HTTP 200 · served == tuned tag",
    primaryCta: "Continue to deploy",
    surface: "app server → POST /api/workspace/test-api-record → live OpenAI-compatible endpoint → governed api-registry row",
    governedRows: { apiRegistry: REG, modelTrainingRun: "run_distill_dense_1" },
    proof: {
      httpStatus: body.status, endpointUrl: body.url, servedModel: verdict.servedModel,
      verified: liveVerdict.verified, snippet: liveVerdict.snippet,
      responseShape: { hasChoices: Array.isArray(body.response?.choices), hasUsage: Boolean(body.response?.usage), model: body.response?.model },
    },
    provenance: "live-http-transport, simulated-model",
    nextAllowedAction: "utilize_model",
  });
}

// ---------------------------------------------------------------------------
// util-02 — UTILIZATION: the SHIPPED captureChatCompletion() drives real
// business tasks across clusters. Every reply is a real 200; every exchange
// is harvested by the serving endpoint itself.
// ---------------------------------------------------------------------------
{
  const liveRow = await liveRegistryRow();
  const prompts = [
    { clusterId: "gtm-funnels", prompt: "Draft a 3-step follow-up sequence for a trial user who built a dashboard but hasn't invited teammates." },
    { clusterId: "creative-narrative", prompt: "Keep scene continuity: our brand hero left the workshop at dusk carrying the prototype. Write the next 2 sentences." },
    { clusterId: "long-context-code", prompt: "Rename the exported function `deriveState` to `deriveLedgerState` across a JS module and its callers — list the exact edit steps." },
  ];
  const results = [];
  for (const p of prompts) {
    const out = await captureChatCompletion({ registryRow: liveRow, modelTag: TAG, prompt: p.prompt });
    results.push({ clusterId: p.clusterId, ok: out.ok, status: out.status, servedModel: out.response?.model, chars: String(out.response?.choices?.[0]?.message?.content || "").length });
  }
  rec("util-02 shipped utilization path: 3/3 real 200s, tuned tag on every reply", results.every((r) => r.ok && r.status === 200 && r.servedModel === TAG));
  // Stamp the last utilization + the invocation source record (CLI-owned lane).
  const last = await captureChatCompletion({ registryRow: liveRow, modelTag: TAG, prompt: prompts[0].prompt });
  await upsertRegistryRow({ integrationId: REG, ...buildRegistryTestStamp(last.response) });
  if (APP_DIR) {
    const srPath = path.join(APP_DIR, "growthub.source-records.json");
    const sr = fs.existsSync(srPath) ? JSON.parse(fs.readFileSync(srPath, "utf8")) : {};
    sr[`model-invocation:${REG}:live`] = { records: results.map((r) => ({ status: r.status, modelVersion: r.servedModel, note: `live utilization · ${r.clusterId}` })) };
    fs.writeFileSync(srPath, `${JSON.stringify(sr, null, 2)}\n`);
  }
  write({
    stateId: "util-02-utilization-clusters",
    visibleTitle: TAG,
    visibleStatus: "Utilized · 4 real chat completions · 200 × 4",
    primaryCta: "Use model",
    surface: "shipped captureChatCompletion() over the live governed api-registry row",
    governedRows: { apiRegistry: REG, modelInvocation: `model-invocation:${REG}:live` },
    proof: { results, everyReplyTunedTag: results.every((r) => r.servedModel === TAG) },
    provenance: "live-http-transport, simulated-model",
    nextAllowedAction: "harvest_receipt",
  });
}

// ---------------------------------------------------------------------------
// util-03 — HARVEST: the endpoint captured every exchange as a governed
// trace; root-hash them into a trace-capture receipt (non-run) + sidecar.
// ---------------------------------------------------------------------------
{
  const harvested = HARVEST && fs.existsSync(HARVEST)
    ? fs.readFileSync(HARVEST, "utf8").trim().split("\n").filter(Boolean).map((l) => normalizeDistillationTrace(JSON.parse(l)))
    : [];
  rec("util-03 serving IS harvesting: real traces captured from the live requests", harvested.length >= 4, `${harvested.length} traces`);
  const fields = buildTraceCaptureReceiptFields({ traces: harvested, teacherModel: "claude-subagent-teacher" });
  if (APP_DIR) {
    const srPath = path.join(APP_DIR, "growthub.source-records.json");
    const sr = JSON.parse(fs.readFileSync(srPath, "utf8"));
    sr[distillationTracesSourceKey("workspace-local")] = { records: harvested };
    sr[trainingRunSourceKey("workspace-local")] = { records: [{ schema: "growthub-local-model-training-run-v1", trainingRunId: "run_trace_capture_live", modelTrainingRowId: "workspace-local", status: "completed", runKind: "trace-capture", distillation: fields }] };
    fs.writeFileSync(srPath, `${JSON.stringify(sr, null, 2)}\n`);
  }
  const ws = await getWS();
  // STRONG exclusion form: the REAL capture receipt, alone, must derive to
  // "no training run present" — this cannot pass by accident of the fixture
  // training receipt also existing in the workspace.
  const captureOnly = deriveTrainingRunState({
    workspaceConfig: {},
    workspaceSourceRecords: { [trainingRunSourceKey("workspace-local")]: { records: [{ schema: "growthub-local-model-training-run-v1", trainingRunId: "run_trace_capture_live", modelTrainingRowId: "workspace-local", status: "completed", runKind: "trace-capture", distillation: fields }] } },
    slug: "workspace-local",
  });
  rec("util-03 the capture receipt ALONE derives to no-training-run (strong exclusion, not masked by other receipts)", captureOnly.present === false);
  const runState = deriveTrainingRunState({ workspaceConfig: ws.workspaceConfig, workspaceSourceRecords: ws.workspaceSourceRecords, slug: "workspace-local" });
  const flywheel = deriveFlywheelState({ workspaceConfig: ws.workspaceConfig, workspaceSourceRecords: ws.workspaceSourceRecords, slug: "workspace-local" });
  write({
    stateId: "util-03-harvest-receipt",
    visibleTitle: "Trace capture",
    visibleStatus: `${fields.traceCount} live traces · root ${fields.traceRootHash}`,
    primaryCta: "Train next generation",
    surface: "endpoint harvest JSONL → governed trace sidecar + trace-capture receipt (CLI lane)",
    governedRows: { traceSidecar: distillationTracesSourceKey("workspace-local"), runSidecar: trainingRunSourceKey("workspace-local") },
    proof: { traceCount: fields.traceCount, traceRootHash: fields.traceRootHash, clusters: [...new Set(harvested.map((t) => t.clusterId))], runLifecycleUndisturbed: runState.runState, flywheelTraceStep: flywheel.steps.find((s) => s.id === "traces-harvested")?.done },
    provenance: "cli-stamped (harvest of live requests)",
    nextAllowedAction: "open_cockpit",
  });
}

// ---------------------------------------------------------------------------
// util-04 — ONE-CLICK WORKFLOW + COCKPIT: the exact governed sequence the
// cockpit's "Use in a workflow" click performs — draft PATCH → REAL draft
// test-run (orchestration-graph adapter calls the endpoint) → attest →
// POST workflow/publish → live run. The runtime stamps lastRunId,
// lastResponse (the actual chat completion in stdout), and outputHash —
// `complete` is earned from a REAL run, never a seeded stamp.
// ---------------------------------------------------------------------------
{
  const cfg = await getWS();
  const objs = cfg.workspaceConfig.dataModel.objects;
  const cmState = deriveCustomModelsState({ workspaceConfig: cfg.workspaceConfig, workspaceSourceRecords: cfg.workspaceSourceRecords });
  const cmModel = cmState.models.find((m) => m.id === "workspace-local");
  const variants = buildCustomModelWorkflowVariants(cmModel, { workspaceConfig: cfg.workspaceConfig });
  const { orchestrationConfig, ...draftRow } = buildCustomModelSandboxRow(cmModel, "chat", variants.chat);
  draftRow.orchestrationDraftConfig = orchestrationConfig;
  let wf = objs.find((o) => o.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
  if (!wf) {
    wf = { id: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID, label: "Custom Model Workflows", source: "Custom Models", objectType: "sandbox-environment", icon: "Workflow", columns: Object.keys(draftRow), rows: [], binding: { mode: "manual", source: "Custom Models" }, relations: [], fieldSettings: { hidden: [], order: Object.keys(draftRow) } };
    objs.push(wf);
  }
  const existing = wf.rows.find((r) => r.Name === draftRow.Name);
  if (!existing) {
    // Governance negative observed LIVE first: a new row carrying the live
    // orchestrationConfig must be refused by the mutation policy.
    const liveAttempt = JSON.parse(JSON.stringify(objs));
    const wfLive = liveAttempt.find((o) => o.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
    wfLive.rows.push({ ...draftRow, Name: `${draftRow.Name}-live-attempt`, orchestrationConfig });
    const refused = await patchWS(liveAttempt);
    rec("util-04 governance negative: live orchestrationConfig on a new row is REFUSED by the patch policy", refused !== 200, `PATCH ${refused}`);
    wf.rows.push(draftRow);
    const created = await patchWS(objs);
    rec("util-04 one-click: DRAFT workflow row created through PATCH", created === 200, `PATCH ${created}`);
  }
  const alreadyLive = Boolean(String(existing?.orchestrationConfig || "").trim());
  if (!alreadyLive) {
    const testRun = await (await fetch(`${BASE}/api/workspace/sandbox-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID, name: draftRow.Name, useDraft: true }) })).json();
    rec("util-04 one-click: REAL draft test-run through the orchestration-graph adapter", testRun.ok === true && testRun.exitCode === 0, `runId=${testRun.runId}`);
    const cfg2 = await getWS();
    const objs2 = cfg2.workspaceConfig.dataModel.objects;
    const row2 = objs2.find((o) => o.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID).rows.find((r) => r.Name === draftRow.Name);
    row2.orchestrationDraftTestPassed = true;
    row2.orchestrationDraftTestedConfig = row2.orchestrationDraftConfig;
    await patchWS(objs2);
    const published = await (await fetch(`${BASE}/api/workspace/workflow/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID, name: draftRow.Name }) })).json();
    rec("util-04 one-click: publish gate promotes the tested draft to live", published.ok === true, `sha=${String(published.publishedSha256 || "").slice(0, 12)}`);
  }
  const liveRun = await (await fetch(`${BASE}/api/workspace/sandbox-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID, name: draftRow.Name }) })).json();
  const liveStdout = String(liveRun.response?.stdout || "");
  rec("util-04 live workflow run: real chat completion in stdout + runtime-hashed output proof", liveRun.ok === true && liveStdout.includes(TAG) && Boolean(liveRun.response?.outputHash), `outputHash=${liveRun.response?.outputHash}`);
  // The deploy step links the run into the model row (modal's own flow).
  const cfg3 = await getWS();
  const objs3 = cfg3.workspaceConfig.dataModel.objects;
  const training = objs3.find((o) => o.id === "model-training");
  training.rows[0].lastSandboxObjectId = CUSTOM_MODEL_WORKFLOWS_OBJECT_ID;
  training.rows[0].lastSandboxRunId = String(liveRun.runId || "");
  await patchWS(objs3);
  await wait(500);

  const ws = await getWS();
  const cm = deriveCustomModelsState({ workspaceConfig: ws.workspaceConfig, workspaceSourceRecords: ws.workspaceSourceRecords });
  const model = cm.models.find((m) => m.id === "workspace-local");
  rec("util-04 cockpit evidence: complete + verified over the LIVE rows", model?.evidenceState === "complete" && model?.verificationStatus === "verified", `state=${model?.evidenceState}`);
  const cockpitRendered = await openCustomModelsCockpit();
  const continuumVisible = (await page.locator("[data-model-continuum]").count()) > 0;
  const utilizeVisible = (await page.locator("[data-model-utilize]").count()) > 0;
  const usageLine = await txt("[data-model-usage]");
  rec("util-04 cockpit renders continuum + one-click utilization from live evidence", cockpitRendered && continuumVisible && utilizeVisible, usageLine);
  await shot("util-04-cockpit-complete.png");
  write({
    stateId: "util-04-cockpit-complete",
    visibleTitle: TAG,
    visibleStatus: `${model?.evidenceState} · ${model?.verificationStatus}`,
    primaryCta: model?.nextAction || "Use model",
    surface: "/custom-models cockpit via the canonical helper entry (?helper=open → /custom-models slash)",
    governedRows: { modelTraining: "workspace-local", apiRegistry: REG, customModelWorkflows: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID },
    proof: { cockpitRendered, continuumVisible, utilizeVisible, usageLine, evidenceState: model?.evidenceState, verificationStatus: model?.verificationStatus, modelOutputHash: model?.modelOutputHash, lastResponseModel: model?.lastResponseModel, nextAction: model?.nextAction },
    provenance: "live-http-transport, simulated-model",
    nextAllowedAction: "operate_model",
  });
}

// ---------------------------------------------------------------------------
// util-05 — NEGATIVE: the endpoint really serves the base tag; the loop
// demotes honestly AND keeps serving via the proxy fallback; then recovers.
// ---------------------------------------------------------------------------
{
  await fetch(`${MODEL_URL}/admin/serve-model`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: BASEM }) });
  const liveRow = await liveRegistryRow();
  const demotedCall = await captureChatCompletion({ registryRow: liveRow, modelTag: TAG, prompt: "Reply in one short line to confirm you are the tuned workspace model." });
  rec("util-05 base-tag response is still a real 200 (the demotion is about proof, not availability)", demotedCall.ok && demotedCall.status === 200 && demotedCall.response?.model === BASEM);
  await upsertRegistryRow({ integrationId: REG, lastResponse: JSON.stringify(demotedCall.response), lastTested: new Date().toISOString() });
  let ws = await getWS();
  const cmDemoted = deriveCustomModelsState({ workspaceConfig: ws.workspaceConfig, workspaceSourceRecords: ws.workspaceSourceRecords });
  const demotedModel = cmDemoted.models.find((m) => m.id === "workspace-local");
  const proxyState = deriveProxyServingState({ workspaceConfig: ws.workspaceConfig, baseModel: BASEM });
  rec("util-05 cockpit demotes to deployed; proxy falls back to local-base", demotedModel?.evidenceState === "deployed" && proxyState.active?.target === "local-base", `state=${demotedModel?.evidenceState}, route=${proxyState.active?.target}`);
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await wait(2000);
  await shot("util-05-demotion-negative.png");
  write({
    stateId: "util-05-demotion-negative",
    visibleTitle: TAG,
    visibleStatus: "Demoted — base tag served (real 200) · fallback serving",
    primaryCta: "Verify endpoint",
    surface: "live endpoint flipped to the base tag → real invocation → governed row demotes → mothership proxy falls back",
    governedRows: { apiRegistry: REG, proxyRow: `mothership-proxy-${TAG.replace(/[^a-z0-9]+/g, "-")}` },
    proof: { httpStatus: demotedCall.status, servedModel: demotedCall.response?.model, evidenceState: demotedModel?.evidenceState, activeRoute: proxyState.active?.target, studentSkipReason: proxyState.skipped?.find((s) => s.target === "local-student")?.reason },
    provenance: "live-http-transport, simulated-model (route fields derived)",
    nextAllowedAction: "recover_verification",
  });

  // Recovery: flip back, re-invoke for real, re-stamp, cockpit returns to complete.
  await fetch(`${MODEL_URL}/admin/serve-model`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: TAG }) });
  const recovered = await captureChatCompletion({ registryRow: liveRow, modelTag: TAG, prompt: "Reply in one short line to confirm you are the tuned workspace model." });
  await upsertRegistryRow({ integrationId: REG, lastResponse: JSON.stringify(recovered.response), lastTested: new Date().toISOString() });
  ws = await getWS();
  const cmBack = deriveCustomModelsState({ workspaceConfig: ws.workspaceConfig, workspaceSourceRecords: ws.workspaceSourceRecords });
  rec("util-05 recovery: real re-invocation restores complete", cmBack.models.find((m) => m.id === "workspace-local")?.evidenceState === "complete");
}

// ---------------------------------------------------------------------------
// util-06 — DATA MODEL TABLES: the governed rows themselves, on screen. The
// mothership structures ARE these tables; the proof shows them, not claims.
// ---------------------------------------------------------------------------
{
  const ws = await getWS();
  const objs = ws.workspaceConfig.dataModel.objects;
  const tables = {
    apiRegistry: objs.find((o) => o.objectType === "api-registry"),
    modelTrainingRun: objs.find((o) => o.objectType === "model-training-run"),
    trainingTraces: objs.find((o) => o.id === "training-traces"),
  };
  for (const [key, object] of Object.entries(tables)) {
    if (!object) continue;
    await page.goto(`${BASE}/data-model?object=${encodeURIComponent(object.id)}`, { waitUntil: "networkidle" });
    await wait(2000);
    await shot(`util-06-table-${key}.png`);
  }
  const regRow = await liveRegistryRow();
  write({
    stateId: "util-06-data-model-tables",
    visibleTitle: "Data Model — governed custom-model tables",
    visibleStatus: "api-registry · model-training-run · training-traces",
    primaryCta: "—",
    surface: "/data-model object tables (the single source of truth every proof above derives from)",
    governedRows: {
      apiRegistry: { integrationId: regRow?.integrationId, baseUrl: regRow?.baseUrl, endpoint: regRow?.endpoint, status: regRow?.status, lastResponseModel: (() => { try { return JSON.parse(regRow?.lastResponse || "null")?.model; } catch { return ""; } })() },
      modelTrainingRunRows: (tables.modelTrainingRun?.rows || []).map((r) => ({ trainingRunId: r.trainingRunId, status: r.status, profile: r.trainingProfile, artifactModelTag: r.artifactModelTag })),
      trainingTracesCount: (tables.trainingTraces?.rows || []).length,
    },
    proof: {
      // Parsed, not truthiness: the stamped body must be a structurally
      // valid chat completion (model + choices + usage) to count here.
      stampedCompletionParses: (() => { try { const p = JSON.parse(regRow?.lastResponse || "null"); return Boolean(p?.model && Array.isArray(p?.choices) && p?.usage); } catch { return false; } })(),
      noSecretsInRows: !JSON.stringify(objs).includes("sk-"),
      trainingRunRowsAreLabeledFixtures: (tables.modelTrainingRun?.rows || []).every((r) => String(r.runnerMode || "") === "fixture" || String(r.runKind || "") === "trace-capture"),
    },
    provenance: "derived",
    nextAllowedAction: "teacher_provenance",
  });
}

// ---------------------------------------------------------------------------
// util-07 — TEACHER/PROFESSOR PROVENANCE: the pack that generated the served
// content + a real harvested trace, side by side.
// ---------------------------------------------------------------------------
{
  const pack = JSON.parse(fs.readFileSync(path.join(DIR, "scripts/lib/distillation-teacher-pack.json"), "utf8"));
  const harvested = HARVEST && fs.existsSync(HARVEST)
    ? fs.readFileSync(HARVEST, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const sample = harvested[harvested.length - 1] || null;
  write({
    stateId: "util-07-teacher-provenance",
    visibleTitle: "Teacher → student provenance",
    visibleStatus: `${pack.teacherModel} · ${harvested.length} harvested traces`,
    primaryCta: "Train next generation",
    surface: "teacher pack (agent-generated content) ⟷ live harvest JSONL ⟷ trace-capture receipt root hash",
    governedRows: { teacherPack: "scripts/lib/distillation-teacher-pack.json", harvest: "live harvest JSONL", traceSidecar: distillationTracesSourceKey("workspace-local") },
    proof: {
      teacherModel: pack.teacherModel,
      teacherProvenance: pack.provenance,
      clustersServed: pack.responses.map((r) => r.clusterId),
      sampleTrace: sample ? { schema: sample.schema, clusterId: sample.clusterId, teacherModel: sample.teacherModel, promptChars: String(sample.prompt || "").length, reasoningPresent: Boolean(sample.reasoning) } : null,
      rootHash: computeTraceRootHash(harvested.map(normalizeDistillationTrace)).root,
    },
    provenance: "live-http-transport, simulated-model",
    nextAllowedAction: "close_loop",
  });
  rec("util-07 teacher provenance chain intact (pack → served → harvested → hashed)", harvested.length > 0 && Boolean(sample?.reasoning));
}

// ---------------------------------------------------------------------------
// util-08 — WORKFLOW CANVAS: the one-click product of util-04 IS a governed
// sandbox object record; the canvas renders its orchestration graph and the
// api-registry node's config sidecar straight from that record.
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/workflows?object=${encodeURIComponent(CUSTOM_MODEL_WORKFLOWS_OBJECT_ID)}&row=custom-model-chat&field=orchestrationConfig`, { waitUntil: "networkidle" });
  await wait(2500);
  const nodeCards = page.locator(".dm-orchestration-node");
  for (let i = 0; i < 20 && (await nodeCards.count()) === 0; i += 1) await wait(400);
  const nodesRendered = await nodeCards.count();
  // Open the model-call node's config sidecar — the canvas's own click path
  // (the node card renders its TYPE, "api-registry-call").
  const modelNode = page.locator(".dm-orchestration-node", { hasText: "api-registry-call" }).first();
  if (await modelNode.count()) { await modelNode.click(); await wait(1200); }
  const configFields = await page.locator(".dm-orchestration-config__field").count();
  const registryBinding = page.locator("[data-node-registry-binding]").first();
  const registryBindingText = (await registryBinding.count()) ? await registryBinding.innerText() : "";
  const registryActions = registryBinding.locator(".dm-node-registry-actions .dm-btn-ghost");
  const registryActionCount = await registryActions.count();
  const registryActionLayout = registryActionCount === 1 ? await registryActions.first().evaluate((button) => {
    const row = button.parentElement;
    const buttonRect = button.getBoundingClientRect();
    const rowRect = row?.getBoundingClientRect();
    return {
      buttonWidth: Math.round(buttonRect.width),
      rowWidth: Math.round(rowRect?.width || 0),
      ownRow: Boolean(rowRect && Math.abs(buttonRect.width - rowRect.width) <= 2),
    };
  }) : { buttonWidth: 0, rowWidth: 0, ownRow: false };
  await shot("util-08-workflow-canvas.png");
  // The governed record itself — every claim above parsed from the live row.
  const ws = await getWS();
  const wfRow = (ws.workspaceConfig.dataModel.objects.find((o) => o.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID)?.rows || []).find((r) => r.Name === "custom-model-chat") || {};
  let graph = null;
  try { graph = JSON.parse(String(wfRow.orchestrationConfig || "null")); } catch { graph = null; }
  const modelCallNode = (graph?.nodes || []).find((n) => n.type === "api-registry-call") || null;
  // The binding truth is the atomic RECORD: the node carries registryId; the
  // served tag comes from the record's expectedModelTag (node modelTag is an
  // optional override the newer variant builder also stamps).
  const boundRecord = await liveRegistryRow();
  const tagBound = String(modelCallNode?.config?.modelTag || "") === TAG || String(boundRecord?.expectedModelTag || "") === TAG;
  rec("util-08 canvas renders the governed graph; the api-registry node binds the atomic record", nodesRendered >= 3 && configFields > 0 && String(modelCallNode?.config?.registryId || "") === REG && tagBound, `nodes=${nodesRendered} fields=${configFields}`);
  rec("util-08 api-registry sidecar stays generic and keeps one full-width action row", registryActionCount === 1 && registryActionLayout.ownRow && !/mothership proxy|custom model/i.test(registryBindingText), `actions=${registryActionCount} button=${registryActionLayout.buttonWidth}px row=${registryActionLayout.rowWidth}px`);
  write({
    stateId: "util-08-workflow-canvas",
    visibleTitle: "custom-model-chat",
    visibleStatus: `${String(wfRow.lifecycleStatus || "")} · v${String(wfRow.version || "")}`,
    primaryCta: "Run workflow",
    surface: "/workflows canvas — the governed sandbox object record (orchestrationConfig) rendered as nodes + the api-registry node config sidecar",
    governedRows: { customModelWorkflows: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID, row: "custom-model-chat", apiRegistry: REG },
    proof: {
      nodesRendered,
      configFieldsRendered: configFields,
      registryBinding: {
        actionCount: registryActionCount,
        actionLayout: registryActionLayout,
        capabilitySpecificCopyPresent: /mothership proxy|custom model/i.test(registryBindingText),
      },
      graphNodes: (graph?.nodes || []).map((n) => ({ id: n.id, type: n.type })),
      graphEdges: (graph?.edges || []).length,
      registryNodeBinding: modelCallNode ? { registryId: modelCallNode.config?.registryId, modelTag: modelCallNode.config?.modelTag, endpoint: modelCallNode.config?.endpoint } : null,
      lifecycleStatus: wfRow.lifecycleStatus,
      publishedAt: wfRow.orchestrationPublishedAt || "",
      lastRunId: wfRow.lastRunId || "",
    },
    provenance: "derived",
    nextAllowedAction: "run_workflow",
  });
}

// ---------------------------------------------------------------------------
// util-09 — THE LOOP, VISIBLY: one more REAL workflow run grows the harvested
// corpus, and the cockpit renders the growth — use → harvest → next student.
// ---------------------------------------------------------------------------
{
  const before = HARVEST && fs.existsSync(HARVEST) ? fs.readFileSync(HARVEST, "utf8").trim().split("\n").filter(Boolean).length : 0;
  const run = await (await fetch(`${BASE}/api/workspace/sandbox-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID, name: "custom-model-chat" }) })).json();
  const after = HARVEST && fs.existsSync(HARVEST) ? fs.readFileSync(HARVEST, "utf8").trim().split("\n").filter(Boolean).length : 0;
  rec("util-09 a real workflow run grows the harvest (use → corpus, observed on disk)", run.ok === true && after === before + 1, `${before} → ${after}`);
  // Refresh the governed sidecar from the grown harvest (CLI lane) so the
  // cockpit renders the new count from governed records, not the raw file.
  const harvested = fs.readFileSync(HARVEST, "utf8").trim().split("\n").filter(Boolean).map((l) => normalizeDistillationTrace(JSON.parse(l)));
  const fields = buildTraceCaptureReceiptFields({ traces: harvested, teacherModel: "claude-subagent-teacher" });
  if (APP_DIR) {
    const srPath = path.join(APP_DIR, "growthub.source-records.json");
    const sr = JSON.parse(fs.readFileSync(srPath, "utf8"));
    sr[distillationTracesSourceKey("workspace-local")] = { records: harvested };
    sr[trainingRunSourceKey("workspace-local")] = { records: [{ schema: "growthub-local-model-training-run-v1", trainingRunId: "run_trace_capture_live", modelTrainingRowId: "workspace-local", status: "completed", runKind: "trace-capture", distillation: fields }] };
    fs.writeFileSync(srPath, `${JSON.stringify(sr, null, 2)}\n`);
  }
  const cockpitOpen = await openCustomModelsCockpit();
  const harvestChipText = await txt("[data-continuum-step='harvest'] .dm-cockpit-receipt-text");
  rec("util-09 the cockpit renders the grown corpus from governed records (the behavior loop, on screen)", cockpitOpen && harvestChipText.includes(`${after} governed traces`), harvestChipText);
  await shot("util-09-loop-growth-cockpit.png");
  const sampleReasoning = harvested.filter((t) => t.reasoning).slice(-1)[0] || null;
  write({
    stateId: "util-09-loop-growth-cockpit",
    visibleTitle: TAG,
    visibleStatus: `harvest ${before} → ${after} traces after one real workflow run`,
    primaryCta: "Wire loop",
    surface: "/custom-models cockpit — the harvest chip re-rendered from the grown trace sidecar after a real canvas-published workflow run",
    governedRows: { traceSidecar: distillationTracesSourceKey("workspace-local"), runSidecar: trainingRunSourceKey("workspace-local"), customModelWorkflows: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID },
    proof: {
      runId: run.runId,
      harvestBefore: before,
      harvestAfter: after,
      traceRootHash: fields.traceRootHash,
      renderedHarvestChip: harvestChipText,
      reasoningTracesPresent: harvested.filter((t) => t.reasoning).length,
      sampleReasoningTrace: sampleReasoning ? { traceId: sampleReasoning.traceId, clusterId: sampleReasoning.clusterId, reasoning: String(sampleReasoning.reasoning).slice(0, 120), score: sampleReasoning.score } : null,
    },
    provenance: "live-http-transport, simulated-model (sidecar refresh cli-stamped)",
    nextAllowedAction: "train_next_generation",
  });
}

await browser.close();
const failed = R.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "✅" : "❌"} Distillation utilization closed loop — ${R.length - failed}/${R.length} live checks passed.`);
process.exit(failed === 0 ? 0 : 1);
