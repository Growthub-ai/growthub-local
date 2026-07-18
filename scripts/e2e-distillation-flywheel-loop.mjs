/**
 * Distillation Flywheel Loop V1 — end-to-end reality probe on the REAL
 * governed workspace.
 *
 * This does NOT invent a parallel journey. It boots the SAME super-admin
 * model-QA seed the 16-state live capture uses, then walks the existing
 * custom-model closed loop (eligibility → configure → train → first
 * invocation → deploy → proof loop → cockpit) mutating the governed rows
 * exactly as the cockpits/runner would — real `api-registry` rows with real
 * chat-completions `lastResponse` bodies, real `model-training-run`
 * receipts, the real trace sidecar — and asserts the distillation additions
 * RIDE that loop:
 *
 *   - the mothership proxy is an ordinary custom-model registry row, so
 *     /custom-models opens (evidence-gated) on day one, on any machine
 *   - proxy routing derives from deriveEndpointVerification over the row's
 *     stamped chat-completions response (state-12 semantics) — never from
 *     invented booleans; a base-model response demotes AND falls back
 *   - harvest / train / evaluate / sparse receipts advance the flywheel
 *     while the #273 runtime + /custom-models evidence ladders stay intact
 *
 * Run:  node scripts/e2e-distillation-flywheel-loop.mjs
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;
const app = (rel) => pathToFileURL(path.join(kitApp, "app", rel)).href;

const { buildSuperAdminModelQaSeed } = await import(pathToFileURL(path.join(repoRoot, "scripts/lib/super-admin-model-qa-seed.mjs")).href);
const { buildAdaptiveStudentPlan, buildSparseTrainingPlan } = await import(lib("distillation-student-plan.js"));
const { normalizeDistillationTrace, computeTraceRootHash, buildTraceCaptureReceiptFields, distillationTracesSourceKey, buildDistillationProgress } = await import(lib("distillation-gateway.js"));
const { deriveBenchmarkWins, buildBenchmarkReceiptFields } = await import(lib("distillation-eval-harness.js"));
const { buildMothershipProxyRow, deriveProxyServingState, deriveRouterSignals, buildStudentShardRegistration, deriveFlywheelState } = await import(lib("distillation-fleet.js"));
const { buildTrainingRunReceipt, trainingRunSourceKey, deriveTrainingRunState, nextProgress } = await import(lib("training-run-receipts.js"));
const { deriveTrainingRuntimeState } = await import(lib("training-runtime.js"));
const { buildTrainingRunConfig } = await import(lib("training-runtime-profiles.js"));
const { deriveDistillationPipelineState } = await import(lib("training-ledger.js"));
const { deriveEndpointVerification } = await import(lib("training-verification.js"));
const { deriveCustomModelsState } = await import(lib("custom-models-ledger.js"));
const { HELPER_COMMANDS, deriveVisibleHelperCommands } = await import(app("data-model/components/helper-commands.js"));

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`  ✓ ${name}`); };

const slug = "workspace-local";
const TAG = "workspace-local-tuned-v1";
const TAG_V2 = "workspace-local-tuned-v2";
const REG = "workspace-local-model";
const traceKey = distillationTracesSourceKey(slug);
const runKey = trainingRunSourceKey(slug);

// ---- Boot the REAL model-QA seed (same workspace the 16-state capture boots).
const { workspaceConfig, sourceRecords } = buildSuperAdminModelQaSeed({});
const workspaceSourceRecords = { ...sourceRecords, [traceKey]: { records: [] }, [runKey]: { records: [] } };
const objects = workspaceConfig.dataModel.objects;
const registry = objects.find((o) => o.objectType === "api-registry");
const trainingRow = objects.find((o) => o.id === "model-training").rows[0];
const chatCompletion = (model, content) => JSON.stringify({ model, choices: [{ message: { role: "assistant", content } }], usage: { prompt_tokens: 42, completion_tokens: 12 } });

console.log("\n— State 01-03: eligibility from the seeded governed traces —");
check("deriveDistillationPipelineState agrees with the 16-state boot gate (graded ≥ floor, ready)", () => {
  const p = deriveDistillationPipelineState({ workspaceConfig });
  assert.equal(p.ready, true);
  assert.ok(p.graded >= 10, `graded ${p.graded} ≥ floor`);
});

console.log("\n— Day one on a weak machine: proxy-fronted custom model, cockpit opens —");
const weakPlan = buildAdaptiveStudentPlan({ preflight: { ramGB: 4, diskFreeGB: 30 } });
check("a 4GB machine resolves harvest-only, ready:true — the journey continues instead of gating", () => {
  assert.equal(weakPlan.mode, "harvest-only");
  assert.equal(weakPlan.ready, true);
});
const proxyRow = buildMothershipProxyRow({
  modelTag: TAG, studentRegistryId: REG, fallbackBaseModel: "gemma3:1b",
  teacher: { providerId: "kimi-k3", baseUrl: "https://api.moonshot.ai/v1", modelTag: "kimi-k3", authEnvVar: "KIMI_API_KEY" },
});
// The user connects the proxy row through the existing Test Source flow —
// stamping the same status/lastTested evidence every registry row carries.
proxyRow.status = "connected";
proxyRow.lastTested = "2026-07-18T00:00:00.000Z";
registry.rows.push(proxyRow);
check("/custom-models opens on day one — the proxy row is real cockpit evidence (gate derived, not hardcoded)", () => {
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords });
  assert.equal(state.commandVisible, true);
  const visible = deriveVisibleHelperCommands(HELPER_COMMANDS, { "custom-models": state.commandVisible }).map((c) => c.name);
  assert.ok(visible.includes("/custom-models"));
});
check("day-one routing: student unproven (no registry response yet) ⇒ local base serves, skip reason named", () => {
  const s = deriveProxyServingState({ workspaceConfig, baseModel: "gemma3" });
  assert.equal(s.verification.verified, false, "no chat-completions response ⇒ never verified");
  assert.equal(s.active.target, "local-base");
  assert.ok(s.skipped.find((k) => k.target === "local-student"));
});

console.log("\n— Sprint 0: proxied usage harvests governed traces (receipt-stamped, non-run) —");
for (let i = 0; i < 40; i += 1) {
  workspaceSourceRecords[traceKey].records.push(normalizeDistillationTrace({
    traceId: `t${i}`, capturedAt: "2026-07-18T00:00:00Z", teacherModel: "kimi-k3",
    clusterId: i % 2 ? "long-context-code" : "creative-narrative", prompt: `task ${i}`,
    response: `answer ${i}`, reasoning: `{"chain":${i}}`, promptTokens: 500, completionTokens: 120,
    score: 5, expertActivations: { [`e${i % 4}`]: 3 }, kvCacheHint: { prefixHash: "p", reusable: i % 2 === 0 },
  }));
}
workspaceSourceRecords[runKey].records.push(buildTrainingRunReceipt({
  modelTrainingRowId: slug, status: "completed", runKind: "trace-capture",
  distillation: buildTraceCaptureReceiptFields({ traces: workspaceSourceRecords[traceKey].records, teacherModel: "kimi-k3" }),
}));
check("40 traces root-hashed into a trace-capture receipt that does NOT read as a training run", () => {
  const capture = workspaceSourceRecords[runKey].records[0];
  assert.equal(capture.distillation.traceCount, 40);
  assert.equal(capture.distillation.traceRootHash, computeTraceRootHash(workspaceSourceRecords[traceKey].records).root);
  assert.equal(deriveTrainingRunState({ workspaceConfig, workspaceSourceRecords, slug }).present, false);
});

console.log("\n— States 04-08: sized one-click train through the governed runner —");
const plan = buildAdaptiveStudentPlan({ preflight: { ramGB: 16, diskFreeGB: 120 } });
const runConfig = buildTrainingRunConfig({
  profileId: "kimi-distill-dense-student", baseModel: plan.baseModel, datasetPath: "./artifacts/traces.jsonl",
  outputModelTag: TAG, artifactPath: "./artifacts/run1", teacherModel: "kimi-k3",
});
check("the 16GB plan sizes the seed's own gemma3 base; run config ready + argv-only (state 04)", () => {
  assert.equal(plan.baseModel, "gemma3", "matches the seeded model-training row's base");
  assert.equal(runConfig.ready, true);
  assert.ok(runConfig.steps.every((s) => Array.isArray(s.args)));
});
check("state 05 negative: unsafe invocation input blocks Prepare with named reasons", () => {
  const unsafe = buildTrainingRunConfig({ profileId: "kimi-distill-dense-student", baseModel: plan.baseModel, datasetPath: "./t.jsonl", outputModelTag: "x; rm -rf /", artifactPath: "./a", teacherModel: "kimi-k3" });
  assert.equal(unsafe.ready, false);
  assert.ok(unsafe.commandSafety.reasons.length >= 1);
});
let progress = null;
for (const [sub, pct] of [["curation", 100], ["dense_student_training", 40], ["dense_student_training", 90], ["delta_extraction", 100]]) {
  progress = nextProgress(progress, buildDistillationProgress({ subStageId: sub, pct }));
}
const denseReceipt = buildTrainingRunReceipt({
  modelTrainingRowId: slug, status: "imported", trainingProfile: "kimi-distill-dense-student",
  datasetExportId: trainingRow.lastExportId, baseModel: plan.baseModel, progress,
  artifact: { type: "ollama-model", modelTag: TAG, path: "./artifacts/run1/model.q4_k_m.gguf", sha256: "abc123", quantization: "q4_k_m", sourceBytes: 8_000_000_000, artifactBytes: 2_200_000_000 },
  distillation: { teacherModel: "kimi-k3", traceRootHash: workspaceSourceRecords[runKey].records[0].distillation.traceRootHash, traceCount: 40, studentArchitecture: "dense", generation: 1, delta: { path: "./artifacts/run1/delta", sha256: "d3adb33f", deltaBytes: 60_000_000, fullFineTuneBytes: 8_000_000_000 } },
});
workspaceSourceRecords[runKey].records.push(denseReceipt);
check("dense receipt advances the #273 ladder to imported; sub-stage progress stayed monotonic (states 06-08)", () => {
  const rs = deriveTrainingRunState({ workspaceConfig, workspaceSourceRecords, slug });
  assert.equal(rs.runState, "imported");
  assert.equal(rs.progress.subStageId, "delta_extraction");
  assert.equal(nextProgress(rs.progress, buildDistillationProgress({ subStageId: "curation", pct: 5 })).subStageId, "delta_extraction", "stale write refused");
});

console.log("\n— States 12-14: first invocation + deploy over the REAL api-registry row —");
// The handoff writes the model identity + registry bond exactly as the modal does.
trainingRow.localModel = TAG;
trainingRow.modelVersion = TAG;
trainingRow.apiRegistryId = REG;
trainingRow.deployedEndpoint = "http://127.0.0.1:11434/v1/chat/completions";
trainingRow.lastExportSummary = JSON.stringify({ ...JSON.parse(trainingRow.lastExportSummary), registryId: REG });
const studentRow = {
  integrationId: REG, authRef: "", baseUrl: "http://127.0.0.1:11434/v1", endpoint: "/chat/completions",
  method: "POST", status: "connected", lastTested: "2026-07-18T00:05:00.000Z",
  lastResponse: chatCompletion(TAG, "First invocation — served by the tuned student."),
  capabilities: "chat-completions", executionLane: "sandbox-local", kind: "custom-model",
};
registry.rows.push(studentRow);
check("state 12: deriveEndpointVerification proves the tuned tag from the stamped chat-completions body", () => {
  const v = deriveEndpointVerification({ registryRow: studentRow, expectedTag: TAG, baseModel: "gemma3" });
  assert.equal(v.verified, true);
  assert.equal(v.servedModel, TAG);
});
check("the runtime ladder reads deployed→verified from the SAME row (no parallel store)", () => {
  const rt = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug });
  assert.equal(rt.state, "verified");
});
check("proxy routing flips to the student on the registry evidence itself", () => {
  const s = deriveProxyServingState({ workspaceConfig, baseModel: "gemma3" });
  assert.equal(s.active.target, "local-student");
  assert.equal(s.verification.servedModel, TAG);
});

console.log("\n— State 12 negative: a base-model response demotes AND the model keeps serving —");
check("base tag never verifies; /custom-models demotes to deployed; proxy falls back to local-base", () => {
  const saved = studentRow.lastResponse;
  studentRow.lastResponse = chatCompletion("gemma3", "served by the base model");
  const v = deriveEndpointVerification({ registryRow: studentRow, expectedTag: TAG, baseModel: "gemma3" });
  assert.equal(v.verified, false);
  assert.equal(v.demotion, "base-model");
  const cm = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords });
  assert.equal(cm.models.find((m) => m.id === slug).evidenceState, "deployed", "demoted, not verified");
  const s = deriveProxyServingState({ workspaceConfig, baseModel: "gemma3" });
  assert.equal(s.active.target, "local-base", "the custom model STILL answers — no dead end");
  studentRow.lastResponse = saved;
});

console.log("\n— State 09 + promotion: eval harness gates routing priority on real wins —");
const wins = deriveBenchmarkWins({
  results: Array.from({ length: 12 }, (_, i) => ({
    taskId: `task-${i}`, clusterId: i % 2 ? "long-context-code" : "creative-narrative",
    student: { quality: i < 8 ? 0.85 : 0.55, latencyMs: 700, costUsd: 0 },
    baseline: { quality: 0.7, latencyMs: 1100, costUsd: 0 },
    teacher: { quality: 0.9, latencyMs: 2400, costUsd: 0.004 },
  })),
});
denseReceipt.distillation.benchmarkWins = buildBenchmarkReceiptFields(wins);
denseReceipt.status = "verified";
check("student promoted on 8/12 wins with real latency gains", () => {
  assert.equal(wins.promoted, true);
  assert.ok(wins.latencyDeltaPct < 0);
});

console.log("\n— States 15-16: proof loop + cockpit over the sandbox smoke evidence —");
const sandbox = objects.find((o) => o.objectType === "sandbox-environment");
sandbox.rows.push({
  Name: "custom-model-workflow", schedulerRegistryId: REG, lastRunId: "run_flywheel_smoke",
  lastResponse: JSON.stringify({ ok: true, exitCode: 0, outputHash: "out-7f3a91" }),
  orchestrationConfig: JSON.stringify({ nodes: [{ config: { registryId: REG } }] }),
});
trainingRow.lastSandboxObjectId = sandbox.id;
trainingRow.lastSandboxRunId = "run_flywheel_smoke";
workspaceSourceRecords[`model-invocation:${REG}:seed`] = { records: [{ status: 200, modelVersion: TAG, note: "flywheel first invocation" }] };
check("state 16: the /custom-models cockpit reads complete (output hash proven), nextAction 'Run again'", () => {
  const cm = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords });
  const model = cm.models.find((m) => m.id === slug);
  assert.equal(model.evidenceState, "complete");
  assert.equal(model.nextAction, "Run again");
  assert.equal(model.modelOutputHash, "out-7f3a91");
});

console.log("\n— Sprint 2-3: sparse gen-2 student + fleet shard close the flywheel —");
const sparsePlan = buildSparseTrainingPlan({
  routingHistogram: { layers: [
    { layer: 0, counts: { e0: 210, e1: 34, e2: 8, e3: 2 } },
    { layer: 1, counts: { e4: 180, e5: 40, e6: 3 } },
  ] },
  topK: 2,
});
workspaceSourceRecords[runKey].records.push(buildTrainingRunReceipt({
  modelTrainingRowId: slug, status: "verified", trainingProfile: "kimi-distill-sparse-moe-student",
  datasetExportId: trainingRow.lastExportId, baseModel: "gemma3",
  artifact: { type: "ollama-model", modelTag: TAG_V2, path: "./artifacts/run2/model.q4_k_m.gguf", sha256: "def456", quantization: "q4_k_m", sourceBytes: 8_000_000_000, artifactBytes: 2_100_000_000 },
  distillation: {
    teacherModel: "kimi-k3", traceCount: 64, studentArchitecture: "sparse-moe", generation: 2,
    sparsity: { ...sparsePlan.sparsity, routingHistogramHash: sparsePlan.routingHistogramHash },
    benchmarkWins: { total: 12, wins: 9, winRatePct: 75, promoted: true },
  },
}));
registry.rows.push(buildStudentShardRegistration({ modelTag: TAG_V2, clusterId: "long-context-code", sparsity: sparsePlan.sparsity, benchmarkWins: { winRatePct: 75, promoted: true }, generation: 2 }));
check("MoE-Sieve coverage high; router signals carry expert affinity + KV locality from the harvest", () => {
  assert.ok(sparsePlan.salient.coveragePct > 90);
  const s = deriveRouterSignals({ workspaceSourceRecords, slug });
  assert.equal(s.traceCount, 40);
  assert.equal(s.kvCacheHints.length, 2);
});
check("flywheel CLOSED on governed evidence: all steps, generation 2, cockpit still complete", () => {
  const f = deriveFlywheelState({ workspaceConfig, workspaceSourceRecords, slug });
  assert.equal(f.completed, f.total);
  assert.equal(f.generation, 2);
  const cm = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords });
  assert.equal(cm.models.find((m) => m.id === slug).evidenceState, "complete", "flywheel additions never disturb the cockpit ladder");
});
check("negative: stripping promotion reopens the loop (no vibes-based completion)", () => {
  const receipts = workspaceSourceRecords[runKey].records.filter((r) => r.distillation?.benchmarkWins);
  const saved = receipts.map((r) => r.distillation.benchmarkWins);
  receipts.forEach((r) => { r.distillation.benchmarkWins = { ...r.distillation.benchmarkWins, promoted: false }; });
  const f = deriveFlywheelState({ workspaceConfig, workspaceSourceRecords, slug });
  assert.ok(f.completed < f.total);
  assert.equal(f.nextStepId, "benchmark-promoted");
  receipts.forEach((r, i) => { r.distillation.benchmarkWins = saved[i]; });
});

console.log(`\n✅ Distillation Flywheel Loop V1 — proven on the real governed workspace (${checks} checks).`);
