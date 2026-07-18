/**
 * Distillation flywheel — the Kimi-teacher → sparse-MoE student layer stacked
 * on the #273 governed training runtime. Pure-deriver invariants:
 *   - teacher adapters are thin + agnostic; auth is an env-var NAME, never a
 *     value; unsafe endpoints/tags flip ready:false with named reasons
 *   - traces normalize and hash deterministically; the root hash is
 *     order-independent and content-sensitive
 *   - trace-capture receipts NEVER enter the training-run lifecycle
 *   - distillation sub-stages ride the canonical 0-7 vocabulary and keep
 *     nextProgress monotonic (no regression, in-stage counter ordering)
 *   - machine tiers resolve honestly; the adaptive plan sizes down BY NAME
 *     and degrades to harvest-only instead of dead-ending
 *   - MoE-Sieve selects top-k salient experts; DR-LoRA ranks grow with
 *     saliency; sparsity metrics are receipt-stampable
 *   - eval harness promotes only proven wins; delta artifacts demote when
 *     not actually smaller
 *   - the mothership proxy routes on EVIDENCE only, and the flywheel state
 *     composes all of it without touching the #273 runtime ladder
 *   - every deriver is never-throws on empty/garbage input
 *
 * Run with:  node --test scripts/unit-distillation-flywheel.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  TEACHER_PROVIDERS, resolveTeacherProvider, isSafeAuthEnvVarName, isSafeGatewayUrl,
  buildGatewayConfig, buildTeacherRequestBody, fnv1a64, traceContentHash,
  computeTraceRootHash, TRACE_ROOT_HASH_ALGO, normalizeDistillationTrace,
  parseDistillationTraces, distillationTracesSourceKey, buildTraceCaptureReceiptFields,
  DISTILLATION_SUBSTAGES, resolveDistillationSubstage, buildDistillationProgress,
  TRACE_CAPTURE_RUN_KIND,
} = await import(lib("distillation-gateway.js"));
const {
  MACHINE_TIERS, STUDENT_BASE_CANDIDATES, resolveMachineTier, buildAdaptiveStudentPlan,
  normalizeRoutingHistogram, routingHistogramHash, deriveSalientExperts,
  deriveAdapterRankPlan, deriveSparsityMetrics, buildSparseTrainingPlan,
} = await import(lib("distillation-student-plan.js"));
const {
  normalizeEvalResult, deriveBenchmarkWins, buildBenchmarkReceiptFields, deriveDeltaState,
  DEFAULT_PROMOTION_FLOOR,
} = await import(lib("distillation-eval-harness.js"));
const {
  buildMothershipProxyRow, deriveActiveRoute, deriveProxyServingState, deriveRouterSignals,
  buildStudentShardRegistration, deriveFlywheelState, FLYWHEEL_STEPS,
} = await import(lib("distillation-fleet.js"));
const {
  buildTrainingRunReceipt, normalizeDistillationBlock, deriveTrainingRunState,
  trainingRunSourceKey, normalizeProgress, nextProgress, TRAINING_PROGRESS_STAGES,
} = await import(lib("training-run-receipts.js"));
const { buildTrainingRunConfig, resolveTrainingProfile, defaultTrainingProfile, ALLOWED_PIPELINE_BINS } = await import(lib("training-runtime-profiles.js"));
const { PIPELINE_SCRIPTS } = await import(lib("training-pipeline-scripts.js"));

// --------------------------------------------------------------------------
// Gateway — thin teacher adapters
// --------------------------------------------------------------------------

test("gateway: providers are thin adapters — endpoint + tag + auth env NAME, no key material fields", () => {
  assert.ok(TEACHER_PROVIDERS.length >= 3);
  for (const p of TEACHER_PROVIDERS) {
    assert.ok(p.id && p.label && p.kind === "openai-compatible", `${p.id} is a thin OpenAI-compatible adapter`);
    assert.ok(["remote", "local"].includes(p.locality));
    assert.ok(!("apiKey" in p) && !("token" in p) && !("secret" in p), `${p.id} carries no key material field`);
  }
  assert.equal(resolveTeacherProvider("kimi-k3").authEnvVar, "KIMI_API_KEY");
  assert.equal(resolveTeacherProvider("ollama-local").locality, "local");
  assert.equal(resolveTeacherProvider("nope"), null);
});

test("gateway: auth env validation refuses value-shaped strings; url validation requires https off-machine", () => {
  assert.ok(isSafeAuthEnvVarName("KIMI_API_KEY"));
  assert.ok(isSafeAuthEnvVarName("")); // no auth is legal (local)
  assert.ok(!isSafeAuthEnvVarName("sk-abc123"), "a key value is not an env NAME");
  assert.ok(!isSafeAuthEnvVarName("lower_case"));
  assert.ok(isSafeGatewayUrl("https://api.moonshot.ai/v1"));
  assert.ok(isSafeGatewayUrl("http://127.0.0.1:11434/v1"), "loopback http allowed");
  assert.ok(!isSafeGatewayUrl("http://evil.example.com/v1"), "remote http refused");
  assert.ok(!isSafeGatewayUrl(""));
});

test("gateway: config is local-first with named-reason safety (mirrors commandSafety posture)", () => {
  const ok = buildGatewayConfig({ teacherProviderId: "kimi-k3" });
  assert.equal(ok.ready, true);
  assert.equal(ok.resolutionOrder.length, 2);
  assert.equal(ok.resolutionOrder[0].role, "teacher");
  assert.equal(ok.resolutionOrder[1].role, "fallback");
  assert.equal(ok.resolutionOrder[1].locality, "local", "fallback is always the local runtime");
  assert.equal(ok.resolutionOrder[0].authEnvVar, "KIMI_API_KEY", "auth rides as a NAME");

  const bad = buildGatewayConfig({ teacherProviderId: "kimi-k3", teacherBaseUrl: "http://phish.example/v1", teacherModelTag: "kimi;rm -rf" });
  assert.equal(bad.ready, false);
  assert.ok(bad.reasons.length >= 2, "every violation is named");
  assert.equal(bad.resolutionOrder.length, 1, "an unsafe teacher never enters the resolution order");
  assert.equal(bad.resolutionOrder[0].role, "fallback", "the local fallback survives");

  const keyLikeAuth = buildGatewayConfig({ teacherProviderId: "kimi-k3", authEnvVar: "sk-live-abc" });
  assert.equal(keyLikeAuth.ready, false, "value-shaped auth is refused, never stored");
});

test("gateway: teacher request body is a clamped OpenAI chat shape; never throws on garbage", () => {
  const body = buildTeacherRequestBody({ modelTag: "kimi-k3", messages: [{ role: "user", content: "hi" }], temperature: 9, maxTokens: -2 });
  assert.equal(body.model, "kimi-k3");
  assert.equal(body.temperature, 2, "temperature clamped");
  assert.equal(body.max_tokens, 1, "max tokens floored");
  assert.deepEqual(buildTeacherRequestBody().messages, []);
});

// --------------------------------------------------------------------------
// Traces — schema + hashing
// --------------------------------------------------------------------------

const trace = (over = {}) => ({
  traceId: "t1", capturedAt: "2026-07-18T00:00:00Z", teacherModel: "kimi-k3",
  clusterId: "long-context-code", prompt: "refactor this", response: "done",
  reasoning: "{\"plan\":\"...\"}", promptTokens: 900, completionTokens: 200, score: 5, ...over,
});

test("traces: normalize clamps and never throws; garbage yields a well-formed zero-score trace", () => {
  const t = normalizeDistillationTrace(trace({ score: 99, promptTokens: -5 }));
  assert.equal(t.score, 5);
  assert.equal(t.promptTokens, 0);
  const empty = normalizeDistillationTrace(null);
  assert.equal(empty.schema, "growthub-distillation-trace-v1");
  assert.equal(empty.score, 0, "garbage stays below every curation floor");
});

test("traces: root hash is deterministic, order-independent, content-sensitive, and counts", () => {
  const a = trace({ traceId: "a" }), b = trace({ traceId: "b" }), c = trace({ traceId: "c" });
  const r1 = computeTraceRootHash([a, b, c]);
  const r2 = computeTraceRootHash([c, a, b]);
  assert.equal(r1.algo, TRACE_ROOT_HASH_ALGO);
  assert.equal(r1.root, r2.root, "same set in any order ⇒ same root");
  assert.equal(r1.count, 3);
  const r3 = computeTraceRootHash([a, b, trace({ traceId: "c", response: "changed" })]);
  assert.notEqual(r1.root, r3.root, "one changed character ⇒ different root");
  assert.equal(computeTraceRootHash([]).root, "", "empty corpus has no root — never a fake hash");
  assert.equal(fnv1a64("abc"), fnv1a64("abc"));
  assert.notEqual(traceContentHash(a), traceContentHash(b));
});

test("traces: sidecar parse + capture receipt fields link corpus to receipts", () => {
  const key = distillationTracesSourceKey("workspace-local");
  assert.equal(key, "distillation-traces:model-training:workspace-local");
  const records = { [key]: { records: [trace(), trace({ traceId: "t2" }), null, "junk"] } };
  const parsed = parseDistillationTraces(records, "workspace-local");
  assert.equal(parsed.length, 2, "garbage rows dropped");
  const fields = buildTraceCaptureReceiptFields({ traces: parsed, teacherModel: "kimi-k3", clusterId: "long-context-code" });
  assert.equal(fields.traceCount, 2);
  assert.ok(fields.traceRootHash.length === 16);
  assert.deepEqual(parseDistillationTraces(undefined), []);
});

// --------------------------------------------------------------------------
// Sub-stages riding the canonical 0-7 vocabulary
// --------------------------------------------------------------------------

test("substages: every sub-stage maps to a canonical stage; the 0-7 enum is untouched", () => {
  assert.equal(TRAINING_PROGRESS_STAGES.length, 8, "canonical vocabulary NOT forked");
  const canonicalIds = new Set(TRAINING_PROGRESS_STAGES.map((s) => s.id));
  for (const sub of DISTILLATION_SUBSTAGES) {
    assert.ok(canonicalIds.has(sub.stageId), `${sub.id} rides canonical "${sub.stageId}"`);
    assert.ok(sub.order >= 1);
  }
  assert.equal(resolveDistillationSubstage("curation").stageId, "distilling");
  assert.equal(resolveDistillationSubstage("evaluation").stageId, "verifying");
  assert.equal(resolveDistillationSubstage("bogus"), null);
});

test("substages: a full distillation run advances monotonically through nextProgress — no regression, ever", () => {
  const sequence = ["trace_capture", "curation", "synthetic_expansion", "dense_student_training", "delta_extraction", "evaluation", "fleet_registration"];
  let prev = null;
  const seen = [];
  for (const id of sequence) {
    const stamp = buildDistillationProgress({ subStageId: id, pct: 50 });
    const merged = nextProgress(prev, stamp);
    assert.equal(merged.subStageId, id, `${id} advances (stage ${stamp.stageId})`);
    seen.push(merged.stageRank);
    prev = merged;
  }
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), "canonical ranks never regress");
  // A stale duplicate of an earlier sub-stage is REFUSED.
  const stale = nextProgress(prev, buildDistillationProgress({ subStageId: "curation", pct: 99 }));
  assert.equal(stale.subStageId, "fleet_registration", "stale write refused, prev kept");
  // Within one sub-stage, pct advances (counter constant).
  const p1 = nextProgress(null, buildDistillationProgress({ subStageId: "dense_student_training", pct: 10 }));
  const p2 = nextProgress(p1, buildDistillationProgress({ subStageId: "dense_student_training", pct: 60 }));
  assert.equal(p2.pct, 60);
  assert.equal(normalizeProgress({ stageId: "distilling", subStageId: "curation" }).subStageId, "curation", "subStageId survives normalize");
  assert.equal(buildDistillationProgress({ subStageId: "nope" }), null);
});

// --------------------------------------------------------------------------
// Receipts — additive distillation block + trace-capture exclusion
// --------------------------------------------------------------------------

test("receipts: distillation block normalizes + clamps; absent evidence stays null (pre-flywheel receipts unaffected)", () => {
  const r = buildTrainingRunReceipt({ modelTrainingRowId: "m", now: "2026-07-18T00:00:00.000Z" });
  assert.equal(r.distillation, null);
  assert.equal(r.runKind, "");
  const d = normalizeDistillationBlock({
    teacherModel: "kimi-k3", traceRootHash: "abc", traceCount: "7.9", generation: 2,
    sparsity: { activeExpertsPct: 900, selectedExperts: 16, totalExperts: 128 },
    benchmarkWins: { total: 10, wins: 7, winRatePct: 70, promoted: true },
    delta: { path: "/d", sha256: "h", deltaBytes: 100, fullFineTuneBytes: 1000 },
  });
  assert.equal(d.traceCount, 7, "floored");
  assert.equal(d.sparsity.activeExpertsPct, 100, "pct clamped");
  assert.equal(d.benchmarkWins.promoted, true);
  assert.equal(normalizeDistillationBlock(null), null);
  assert.equal(normalizeDistillationBlock("junk"), null);
});

test("receipts: a trace-capture receipt NEVER enters the run lifecycle (like preinit-probe)", () => {
  const capture = buildTrainingRunReceipt({
    modelTrainingRowId: "workspace-local", status: "completed", runKind: TRACE_CAPTURE_RUN_KIND,
    distillation: buildTraceCaptureReceiptFields({ traces: [trace()], teacherModel: "kimi-k3" }),
  });
  const workspaceConfig = { dataModel: { objects: [{ objectType: "model-training-run", rows: [capture] }] } };
  const state = deriveTrainingRunState({ workspaceConfig, workspaceSourceRecords: {}, slug: "workspace-local" });
  assert.equal(state.present, false, "harvest evidence is not training compute");
  // But a REAL distillation training receipt does advance the lifecycle.
  const train = buildTrainingRunReceipt({
    modelTrainingRowId: "workspace-local", status: "imported", trainingProfile: "kimi-distill-dense-student",
    artifact: { type: "gguf", modelTag: "my-student-v1", path: "/m.gguf", sha256: "abc" },
    distillation: { teacherModel: "kimi-k3", traceCount: 40, studentArchitecture: "dense", generation: 1 },
  });
  const state2 = deriveTrainingRunState({
    workspaceConfig: { dataModel: { objects: [{ objectType: "model-training-run", rows: [capture, train] }] } },
    workspaceSourceRecords: {}, slug: "workspace-local",
  });
  assert.equal(state2.present, true);
  assert.equal(state2.runState, "imported");
});

// --------------------------------------------------------------------------
// Machine tiers + adaptive plan (the one-click-per-machine fix)
// --------------------------------------------------------------------------

test("tiers: resolution is honest — unmeasured resolves to harvest-only, never optimistic", () => {
  assert.equal(resolveMachineTier(null).tier.id, "harvest-only");
  assert.equal(resolveMachineTier({}).tier.id, "harvest-only");
  assert.equal(resolveMachineTier({ ramGB: 4 }).tier.id, "harvest-only");
  assert.equal(resolveMachineTier({ ramGB: 16 }).tier.id, "cpu-standard");
  assert.equal(resolveMachineTier({ ramGB: 16, gpu: { present: true } }).tier.id, "gpu-small");
  assert.equal(resolveMachineTier({ ramGB: 96, gpu: { present: true } }).tier.id, "gpu-large");
  assert.equal(resolveMachineTier({ ramGB: 96 }).tier.id, "cpu-large", "no GPU never resolves a GPU tier");
  assert.ok(MACHINE_TIERS[0].canTrain === false && MACHINE_TIERS[0].id === "harvest-only");
});

test("plan: a weak machine still gets a COMPLETE journey — harvest-only mode is ready:true with a real next step", () => {
  const plan = buildAdaptiveStudentPlan({ preflight: { ramGB: 4, diskFreeGB: 20 } });
  assert.equal(plan.mode, "harvest-only");
  assert.equal(plan.ready, true, "harvest-only is a journey, not a dead end");
  assert.ok(plan.next.includes("harvested"), "next action explains the flywheel");
  assert.equal(plan.hyperparams, null, "no fabricated training config");
});

test("plan: bases size to the machine (Gemma-class first) and every downgrade is NAMED", () => {
  const weak = buildAdaptiveStudentPlan({ preflight: { ramGB: 8, diskFreeGB: 100 } });
  assert.equal(weak.mode, "train-local");
  assert.equal(weak.baseModel, "gemma3:1b", "weakest trainable tier anchors on the Gemma small");
  const strong = buildAdaptiveStudentPlan({ preflight: { ramGB: 96, diskFreeGB: 500, gpu: { present: true } } });
  assert.equal(strong.baseModel, "qwen3:14b");
  assert.equal(strong.hyperparams.loraRank, 32);
  const downsized = buildAdaptiveStudentPlan({ preflight: { ramGB: 16, diskFreeGB: 100 }, requestedBaseModel: "qwen3:14b" });
  assert.equal(downsized.baseModel, "gemma3", "requested 14B sized down on a 16GB machine");
  assert.ok(downsized.adjustments.some((a) => a.includes("sized down")), "downgrade named, never silent");
  const noDisk = buildAdaptiveStudentPlan({ preflight: { ramGB: 32, diskFreeGB: 5 } });
  assert.equal(noDisk.mode, "harvest-only", "no disk ⇒ harvest-only with the fix named");
  assert.ok(noDisk.reasons[0].includes("disk"));
});

test("plan: sparse architecture is honored where sized, downgraded by name elsewhere; never throws on garbage", () => {
  const sparse = buildAdaptiveStudentPlan({ preflight: { ramGB: 24, diskFreeGB: 200, gpu: { present: true } }, architecture: "sparse-moe" });
  assert.equal(sparse.architecture, "sparse-moe");
  const junk = buildAdaptiveStudentPlan({ preflight: "garbage", architecture: 42 });
  assert.equal(junk.mode, "harvest-only");
  assert.ok(Array.isArray(junk.adjustments));
});

// --------------------------------------------------------------------------
// Sparse MoE — MoE-Sieve + DR-LoRA + sparsity metrics
// --------------------------------------------------------------------------

const histogram = () => ({
  layers: [
    { layer: 0, counts: { e0: 100, e1: 50, e2: 10, e3: 5, e4: 1 } },
    { layer: 1, counts: { e0: 5, e5: 200, e6: 20 } },
  ],
});

test("moe-sieve: top-k salient experts per layer with coverage; non-MoE bases fall back honestly", () => {
  const s = deriveSalientExperts({ routingHistogram: histogram(), topK: 2 });
  assert.equal(s.moe, true);
  assert.deepEqual(s.layers[0].selected, ["e0", "e1"]);
  assert.deepEqual(s.layers[1].selected, ["e5", "e6"]);
  assert.equal(s.selectedExperts, 4);
  assert.equal(s.totalExperts, 8);
  assert.ok(s.coveragePct > 90, `top-k captures the routing mass (${s.coveragePct}%)`);
  const none = deriveSalientExperts({ routingHistogram: null, topK: 2 });
  assert.equal(none.moe, false);
  assert.ok(none.reason.includes("dense path applies"), "no fake sparsity on a dense base");
});

test("dr-lora: ranks grow with saliency, snap to the ladder, clamp to [base,max]", () => {
  const s = deriveSalientExperts({ routingHistogram: histogram(), topK: 2 });
  const plan = deriveAdapterRankPlan({ salientExperts: s, baseRank: 8, maxRank: 32 });
  const e5 = plan.ranks.find((r) => r.expertId === "e5");
  const e6 = plan.ranks.find((r) => r.expertId === "e6");
  assert.ok(e5.rank > e6.rank, "the dominant expert gets more adaptation capacity");
  assert.ok(plan.ranks.every((r) => r.rank >= 8 && r.rank <= 32));
  assert.ok(plan.ranks.every((r) => [8, 16, 32].includes(r.rank)), "ranks snap to the ladder");
  assert.deepEqual(deriveAdapterRankPlan({}).ranks, []);
});

test("sparsity metrics + composed sparse plan are receipt-stampable, with a deterministic histogram hash", () => {
  const m = deriveSparsityMetrics({ selectedExperts: 16, totalExperts: 128, denseTrainableParams: 1000, sparseTrainableParams: 200 });
  assert.equal(m.activeExpertsPct, 12.5);
  assert.equal(m.trainableParamsReductionPct, 80);
  assert.ok(m.estimatedFlopsSavedPct > 50);
  const plan = buildSparseTrainingPlan({ routingHistogram: histogram(), topK: 2 });
  assert.equal(plan.ready, true);
  assert.equal(plan.routingHistogramHash.length, 16);
  assert.equal(plan.routingHistogramHash, routingHistogramHash(histogram()), "same histogram ⇒ same hash (operator proof comparable)");
  assert.ok(plan.sparsity.trainableParamsReductionPct > 0);
  const dense = buildSparseTrainingPlan({ routingHistogram: {}, topK: 2 });
  assert.equal(dense.ready, false, "no histogram ⇒ sparse path refuses, names the dense fallback");
  assert.deepEqual(normalizeRoutingHistogram({ layers: [{ layer: 0, counts: { a: -5 } }, "junk"] }).layers, [], "garbage dropped");
});

// --------------------------------------------------------------------------
// Eval harness — only promote wins
// --------------------------------------------------------------------------

const evalRow = (q, over = {}) => ({
  taskId: `t${Math.random()}`, clusterId: "code",
  student: { quality: q, latencyMs: 800, costUsd: 0.001 },
  baseline: { quality: 0.7, latencyMs: 1000, costUsd: 0.002 }, ...over,
});

test("eval: unmeasured rows are dropped, never defaulted to wins", () => {
  assert.equal(normalizeEvalResult({ taskId: "x", student: { quality: 1 } }), null, "no baseline ⇒ unscoreable");
  assert.equal(normalizeEvalResult({ taskId: "", student: { quality: 1 }, baseline: { quality: 0 } }), null);
  assert.ok(normalizeEvalResult(evalRow(0.9)));
});

test("eval: win rate, deltas, and the promotion floor — below-floor students are NOT promoted", () => {
  const wins = deriveBenchmarkWins({ results: [evalRow(0.9), evalRow(0.8), evalRow(0.75), evalRow(0.9), evalRow(0.5), evalRow(0.6)] });
  assert.equal(wins.total, 6);
  assert.equal(wins.wins, 4);
  assert.equal(wins.promoted, true);
  assert.ok(wins.latencyDeltaPct < 0, "student is faster (negative delta)");
  assert.ok(wins.costDeltaPct < 0, "student is cheaper");
  const losing = deriveBenchmarkWins({ results: [evalRow(0.1), evalRow(0.2), evalRow(0.9), evalRow(0.1), evalRow(0.2)] });
  assert.equal(losing.promoted, false);
  assert.ok(losing.reason.includes("below"), "refusal names the floor");
  const thin = deriveBenchmarkWins({ results: [evalRow(0.9)] });
  assert.equal(thin.promoted, false, `fewer than ${DEFAULT_PROMOTION_FLOOR.minTasks} tasks is not promotable`);
  assert.equal(deriveBenchmarkWins({}).total, 0);
  const fields = buildBenchmarkReceiptFields(wins);
  assert.equal(fields.promoted, true);
  assert.equal(fields.winRatePct, wins.winRatePct);
});

test("eval: delta artifacts demote when not identifiable or not actually smaller", () => {
  const good = deriveDeltaState({ path: "/d", sha256: "h", deltaBytes: 50_000_000, fullFineTuneBytes: 16_000_000_000 });
  assert.equal(good.identified, true);
  assert.equal(good.provenDelta, true);
  assert.ok(good.reductionPct > 99);
  const fake = deriveDeltaState({ path: "/d", sha256: "h", deltaBytes: 200, fullFineTuneBytes: 100 });
  assert.equal(fake.provenDelta, false, "a 'delta' bigger than the full artifact demotes");
  assert.equal(deriveDeltaState({}).identified, false);
});

// --------------------------------------------------------------------------
// Fleet — mothership proxy + router signals + flywheel
// --------------------------------------------------------------------------

test("proxy: the policy row is an ordinary governed registry row — cockpit-compatible kind, no secrets", () => {
  const row = buildMothershipProxyRow({
    modelTag: "my-model-v1", studentRegistryId: "workspace-local-model", fallbackBaseModel: "gemma3:1b",
    teacher: { providerId: "kimi-k3", baseUrl: "https://api.moonshot.ai/v1", modelTag: "kimi-k3", authEnvVar: "KIMI_API_KEY" },
  });
  assert.equal(row.kind, "custom-model");
  assert.equal(row.capabilityType, "custom-model-inference", "AI-Agent node + cockpit treat it as any custom model");
  assert.equal(row.metadata.mothershipProxy.routes.length, 3);
  assert.equal(row.metadata.mothershipProxy.harvestTraces, true);
  assert.ok(!JSON.stringify(row).match(/sk-|api[_-]?key["']?\s*:/i), "no key material anywhere in the row");
  assert.ok(/^[a-z0-9-]+$/.test(row.integrationId));
});

test("proxy: routing is evidence-gated — student needs VERIFIED, teacher needs auth present; skips carry reasons", () => {
  const row = buildMothershipProxyRow({
    modelTag: "m1", studentRegistryId: "r1", fallbackBaseModel: "gemma3:1b",
    teacher: { providerId: "kimi-k3", baseUrl: "https://api.moonshot.ai/v1", modelTag: "kimi-k3", authEnvVar: "KIMI_API_KEY" },
  });
  // Day one: nothing trained, runtime up, teacher configured.
  const day1 = deriveActiveRoute({ policyRow: row, studentVerified: false, localRuntimeConnected: true, teacherAuthPresent: true });
  assert.equal(day1.active.target, "local-base", "local-first: base fallback beats remote teacher");
  assert.ok(day1.skipped.find((s) => s.target === "local-student").reason.includes("not tuned-tag verified"));
  // Student verified: it takes priority.
  const later = deriveActiveRoute({ policyRow: row, studentVerified: true, localRuntimeConnected: true, teacherAuthPresent: true });
  assert.equal(later.active.target, "local-student");
  // Runtime down, teacher configured: teacher serves (and harvests).
  const offlineLocal = deriveActiveRoute({ policyRow: row, studentVerified: true, localRuntimeConnected: false, teacherAuthPresent: true });
  assert.equal(offlineLocal.active.target, "teacher");
  // Nothing serviceable: honest null with the fix named.
  const nothing = deriveActiveRoute({ policyRow: row, studentVerified: false, localRuntimeConnected: false, teacherAuthPresent: false });
  assert.equal(nothing.active, null);
  assert.ok(nothing.reason.includes("no route"));
  assert.equal(deriveActiveRoute({}).active, null, "never throws on garbage");
});

test("proxy: deriveProxyServingState grounds routing in the REAL registry row — chat-completions verification, never invented booleans", () => {
  const chatCompletion = (model) => JSON.stringify({ model, choices: [{ message: { role: "assistant", content: "hello" } }] });
  const proxyRow = { ...buildMothershipProxyRow({ modelTag: "gh-tuned-v1", studentRegistryId: "gh-model", fallbackBaseModel: "gemma3:1b" }), status: "connected", lastTested: "2026-07-18T00:00:00.000Z" };
  const studentRow = { integrationId: "gh-model", authRef: "", baseUrl: "http://127.0.0.1:11434/v1", endpoint: "/chat/completions", method: "POST", status: "connected", lastTested: "2026-07-18T00:05:00.000Z", lastResponse: chatCompletion("gh-tuned-v1"), capabilities: "chat-completions", kind: "custom-model" };
  const ws = (rows) => ({ dataModel: { objects: [{ objectType: "api-registry", rows }] } });

  // Tuned tag in the stamped response ⇒ the student serves (state-12 semantics).
  const verified = deriveProxyServingState({ workspaceConfig: ws([proxyRow, studentRow]), baseModel: "gemma3" });
  assert.equal(verified.verification.verified, true);
  assert.equal(verified.active.target, "local-student");
  // Base-model response ⇒ demoted AND the model keeps serving via fallback.
  const demoted = deriveProxyServingState({ workspaceConfig: ws([proxyRow, { ...studentRow, lastResponse: chatCompletion("gemma3") }]), baseModel: "gemma3" });
  assert.equal(demoted.verification.demotion, "base-model");
  assert.equal(demoted.active.target, "local-base");
  // No connected loopback row ⇒ honest null, reason named.
  const cold = deriveProxyServingState({ workspaceConfig: ws([{ ...proxyRow, status: "" }, { ...studentRow, status: "", lastResponse: "" }]) });
  assert.equal(cold.active, null);
  assert.ok(cold.reason.length > 0);
  assert.equal(deriveProxyServingState({}).policyRow, null, "never throws on garbage");
});

test("router signals: expert affinity + KV locality aggregate from harvested traces", () => {
  const key = distillationTracesSourceKey("workspace-local");
  const records = {
    [key]: {
      records: [
        trace({ clusterId: "code", expertActivations: { e1: 10, e2: 5 }, kvCacheHint: { prefixHash: "p", reusable: true } }),
        trace({ traceId: "t2", clusterId: "code", expertActivations: { e1: 8 } }),
        trace({ traceId: "t3", clusterId: "narrative", promptTokens: 300 }),
      ],
    },
  };
  const s = deriveRouterSignals({ workspaceSourceRecords: records, slug: "workspace-local" });
  assert.equal(s.traceCount, 3);
  assert.deepEqual(s.clusters, ["code", "narrative"]);
  assert.equal(s.expertActivations.e1, 18);
  const code = s.kvCacheHints.find((h) => h.clusterId === "code");
  assert.equal(code.traceCount, 2);
  assert.equal(code.reusePct, 50);
  assert.equal(code.topExperts[0], "e1", "expert affinity ranked");
  assert.equal(deriveRouterSignals({}).traceCount, 0);
});

test("fleet: shard registration carries cluster affinity + sparsity + win record", () => {
  const shard = buildStudentShardRegistration({ modelTag: "my-student-v2", clusterId: "code", sparsity: { activeExpertsPct: 12.5, estimatedFlopsSavedPct: 61 }, benchmarkWins: { winRatePct: 70, promoted: true }, generation: 2 });
  assert.equal(shard.metadata.fleetShard.generation, 2);
  assert.equal(shard.metadata.fleetShard.sparsity.activeExpertsPct, 12.5);
  assert.equal(shard.metadata.fleetShard.benchmarkWins.promoted, true);
});

test("flywheel: composes the whole journey from governed evidence and names the next step", () => {
  const slug = "workspace-local";
  const traceKey = distillationTracesSourceKey(slug);
  const runKey = trainingRunSourceKey(slug);
  // Empty workspace: nothing done, first step is harvesting.
  const empty = deriveFlywheelState({ workspaceConfig: {}, workspaceSourceRecords: {} });
  assert.equal(empty.completed, 0);
  assert.equal(empty.total, FLYWHEEL_STEPS.length);
  assert.equal(empty.nextStepId, "traces-harvested");
  // Full journey: traces + promoted sparse gen-2 student + proxy + shard.
  const workspaceConfig = {
    dataModel: {
      objects: [
        { objectType: "api-registry", rows: [buildMothershipProxyRow({ modelTag: "m1" }), buildStudentShardRegistration({ modelTag: "m1-v2" })] },
        { objectType: "model-training-run", rows: [] },
      ],
    },
  };
  const workspaceSourceRecords = {
    [traceKey]: { records: [trace()] },
    [runKey]: {
      records: [
        buildTrainingRunReceipt({ modelTrainingRowId: slug, status: "completed", runKind: "trace-capture", distillation: { teacherModel: "kimi-k3", traceCount: 40 } }),
        buildTrainingRunReceipt({ modelTrainingRowId: slug, status: "verified", trainingProfile: "kimi-distill-dense-student", artifact: { type: "gguf", modelTag: "m1", path: "/m", sha256: "h" }, distillation: { studentArchitecture: "dense", generation: 1, benchmarkWins: { total: 10, wins: 7, winRatePct: 70, promoted: true } } }),
        buildTrainingRunReceipt({ modelTrainingRowId: slug, status: "verified", trainingProfile: "kimi-distill-sparse-moe-student", artifact: { type: "gguf", modelTag: "m1-v2", path: "/m2", sha256: "h2" }, distillation: { studentArchitecture: "sparse-moe", generation: 2, sparsity: { activeExpertsPct: 12.5, selectedExperts: 16, totalExperts: 128 } } }),
      ],
    },
  };
  const full = deriveFlywheelState({ workspaceConfig, workspaceSourceRecords, slug });
  assert.equal(full.completed, full.total, "every step proven from receipts");
  assert.equal(full.generation, 2, "self-improvement visible in receipt history");
  assert.equal(full.hasProxy, true);
  // Partial: traces only — next step is training, and the #273 ladder is untouched.
  const partial = deriveFlywheelState({ workspaceConfig: {}, workspaceSourceRecords: { [traceKey]: { records: [trace()] } }, slug });
  assert.equal(partial.completed, 1);
  assert.equal(partial.nextStepId, "student-trained");
  assert.equal(deriveFlywheelState({}).completed, 0, "never throws");
});

// --------------------------------------------------------------------------
// Profiles + runner scripts — the governed execution path
// --------------------------------------------------------------------------

test("profiles: distillation profiles are argv-only, allowlisted, safety-gated; the one-click default is unchanged", () => {
  assert.equal(defaultTrainingProfile().id, "unsloth-qlora-quantize-pipeline", "#273 default untouched");
  for (const id of ["kimi-distill-dense-student", "kimi-distill-sparse-moe-student"]) {
    const p = resolveTrainingProfile(id);
    assert.equal(p.id, id);
    assert.ok(p.steps.every((s) => Array.isArray(s.args)), "argv specs, never shell strings");
    assert.ok(p.steps.every((s) => ALLOWED_PIPELINE_BINS.includes(s.bin)), "every bin allowlisted");
    assert.equal(p.importProof.quantProofRequired, true);
    assert.equal(p.verification.type, "api-registry-chat-completion");
  }
  const cfg = buildTrainingRunConfig({
    profileId: "kimi-distill-sparse-moe-student", baseModel: "gemma3:1b", datasetPath: "./traces.jsonl",
    outputModelTag: "my-student-v1", artifactPath: "./artifacts/run1", teacherModel: "kimi-k3", expertTopK: "8",
  });
  assert.equal(cfg.ready, true);
  assert.ok(cfg.steps.some((s) => s.args.includes("--expert-top-k")), "top-k rides as its own argv token");
  assert.ok(cfg.steps.some((s) => s.args.includes("calibrate_routing.py")), "calibration precedes sparse training");
  const unsafe = buildTrainingRunConfig({
    profileId: "kimi-distill-dense-student", baseModel: "gemma3:1b", datasetPath: "./t.jsonl",
    outputModelTag: "ok-tag", artifactPath: "./a", teacherModel: "kimi;curl evil", expertTopK: "999",
  });
  assert.equal(unsafe.ready, false, "unsafe teacher tag / top-k blocks Prepare exactly like #273 state 05");
  assert.ok(unsafe.commandSafety.reasons.length >= 2);
});

test("cockpit: continuum + usage derive from governed evidence only (never invented numbers)", async () => {
  const { deriveCustomModelCockpit } = await import(lib("custom-models-ledger.js"));
  const chatCompletion = JSON.stringify({ model: "gh-tuned-v1", choices: [{ message: { role: "assistant", content: "hi" } }], usage: { prompt_tokens: 40, completion_tokens: 60 } });
  const workspaceConfig = { dataModel: { objects: [
    { objectType: "api-registry", rows: [
      { integrationId: "gh-model", baseUrl: "http://127.0.0.1:11434/v1", endpoint: "/chat/completions", status: "connected", lastResponse: chatCompletion, executionLane: "sandbox-local" },
      { ...buildMothershipProxyRow({ modelTag: "gh-tuned-v1", studentRegistryId: "gh-model", fallbackBaseModel: "gemma3:1b" }), status: "connected" },
    ] },
    { objectType: "sandbox-environment", id: "custom-model-workflows", rows: [
      { Name: "custom-model-chat", schedulerRegistryId: "gh-model", lastRunId: "r1", lastResponse: JSON.stringify({ exitCode: 0, outputHash: "abc", stdout: chatCompletion }), orchestrationConfig: JSON.stringify({ nodes: [{ type: "api-registry-call", config: { registryId: "gh-model" } }] }) },
    ] },
  ] } };
  const model = { name: "workspace-local", baseModel: "gemma3", localModel: "gh-tuned-v1", apiRegistryId: "gh-model", evidenceState: "complete", verificationStatus: "verified" };
  const cockpit = deriveCustomModelCockpit(model, { workspaceConfig, workspaceSourceRecords: {} });
  assert.equal(cockpit.continuum.active, true, "proxy row activates the continuum");
  assert.equal(cockpit.continuum.loop.find((s) => s.id === "serve").done, true, "verified registry response lights Serve");
  assert.equal(cockpit.continuum.loop.find((s) => s.id === "evaluate").done, false, "no promoted benchmark ⇒ Evaluate honestly pending");
  assert.equal(cockpit.usage.provenRuns, 1);
  assert.equal(cockpit.usage.workflowsBound, 1);
  assert.equal(cockpit.usage.promptTokens, 80, "registry stamp + run stdout usage, both real");
  assert.equal(cockpit.usage.completionTokens, 120);
  assert.equal(cockpit.usage.toolCallNodes, 1);
  assert.equal(cockpit.usage.permissions.networkAllow, false);
  // Never throws, and empty evidence yields zeros — not fabricated activity.
  const empty = deriveCustomModelCockpit({ name: "m" }, { workspaceConfig: {}, workspaceSourceRecords: {} });
  assert.equal(empty.continuum.active, false);
  assert.equal(empty.usage.provenRuns, 0);
  assert.equal(empty.usage.promptTokens, 0);
});

test("ladder hardening: the runtime sidecar is authoritative — a forged row stamp cannot mint run proof", async () => {
  const { deriveCustomModelsState } = await import(lib("custom-models-ledger.js"));
  const chatCompletion = JSON.stringify({ model: "gh-v1", choices: [{ message: { role: "assistant", content: "hi" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  const base = (sandboxRow) => ({
    workspaceConfig: { dataModel: { objects: [
      { objectType: "model-training", id: "model-training", rows: [{ Name: "workspace-local", status: "exported", baseModel: "gemma3", localModel: "gh-v1", lastExportSummary: JSON.stringify({ registryId: "gh-model" }) }] },
      { objectType: "api-registry", rows: [{ integrationId: "gh-model", baseUrl: "http://127.0.0.1:11434/v1", endpoint: "/chat/completions", status: "connected", lastTested: "2026-07-18T00:00:00Z", lastResponse: chatCompletion }] },
      { objectType: "sandbox-environment", id: "wf", rows: [sandboxRow] },
    ] } },
  });
  const forgedRow = { Name: "w1", schedulerRegistryId: "gh-model", lastRunId: "run_forged", lastResponse: JSON.stringify({ exitCode: 0, outputHash: "forged" }) };
  // No sidecar at all → legacy row-stamp path still counts (seed/QA lane).
  const legacy = deriveCustomModelsState({ ...base(forgedRow), workspaceSourceRecords: {} });
  assert.equal(legacy.models[0].evidenceState, "complete", "legacy path without a runtime sidecar keeps working");
  // A runtime sidecar EXISTS but has no record of the claimed run → demoted.
  const crossChecked = deriveCustomModelsState({ ...base(forgedRow), workspaceSourceRecords: { "sandbox:wf:w1": { records: [{ runId: "run_real", exitCode: 0, outputHash: "realhash" }] } } });
  assert.equal(crossChecked.models[0].evidenceState, "sandbox-ready", "forged lastRunId with a live sidecar demotes — no output proof");
  // The matching runtime record is what proves it.
  const genuine = deriveCustomModelsState({ ...base({ ...forgedRow, lastRunId: "run_real" }), workspaceSourceRecords: { "sandbox:wf:w1": { records: [{ runId: "run_real", exitCode: 0, outputHash: "realhash" }] } } });
  assert.equal(genuine.models[0].evidenceState, "complete");
  assert.equal(genuine.models[0].modelOutputHash, "realhash", "output proof comes from the runtime record, not the row stamp");
});

test("ladder hardening: 'deployed' requires a PARSED captured completion — a status string alone stays registered", async () => {
  const { deriveCustomModelsState } = await import(lib("custom-models-ledger.js"));
  const ws = (registryRow) => ({
    workspaceConfig: { dataModel: { objects: [
      { objectType: "model-training", id: "model-training", rows: [{ Name: "workspace-local", status: "exported", baseModel: "gemma3", localModel: "gh-v1", lastExportSummary: JSON.stringify({ registryId: "gh-model" }) }] },
      { objectType: "api-registry", rows: [registryRow] },
    ] } },
    workspaceSourceRecords: {},
  });
  const claimOnly = deriveCustomModelsState(ws({ integrationId: "gh-model", status: "connected" }));
  assert.equal(claimOnly.models[0].evidenceState, "registered", "a writable status claim never reads as deployed");
  const errorBody = deriveCustomModelsState(ws({ integrationId: "gh-model", status: "connected", lastResponse: JSON.stringify({ error: { message: "boom" } }) }));
  assert.equal(errorBody.models[0].evidenceState, "registered", "an error envelope never reads as deployed");
  const malformed = deriveCustomModelsState(ws({ integrationId: "gh-model", lastResponse: "not-json" }));
  assert.equal(malformed.models[0].evidenceState, "registered", "malformed body never reads as deployed");
  const captured = deriveCustomModelsState(ws({ integrationId: "gh-model", lastResponse: JSON.stringify({ model: "gemma3", choices: [{ message: { content: "hi" } }] }) }));
  assert.equal(captured.models[0].evidenceState, "deployed", "a parsed captured completion (even base-tag) reads deployed, never higher");
});

test("runner scripts: the distillation trio is provisioned alongside the #273 scripts", () => {
  for (const name of ["distill_student.py", "calibrate_routing.py", "extract_delta.py", "train.py"]) {
    assert.ok(typeof PIPELINE_SCRIPTS[name] === "string" && PIPELINE_SCRIPTS[name].includes("GH_PROGRESS"), `${name} stamps governed progress`);
  }
  assert.ok(PIPELINE_SCRIPTS["distill_student.py"].includes("--sparse"), "sparse path wired");
  assert.ok(PIPELINE_SCRIPTS["calibrate_routing.py"].includes("output_router_logits"), "real routing calibration");
  assert.ok(PIPELINE_SCRIPTS["extract_delta.py"].includes("sha256"), "delta identity is provable");
});
