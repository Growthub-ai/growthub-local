/**
 * Training runtime layer — the governed run/artifact receipt lifecycle and
 * the PR #235 causal driver brain. Pure-deriver invariants:
 *   - profiles resolve and template into a run config with provable floors
 *   - artifact identity demotes claims that cannot be proven
 *   - tuned-tag verification demotes base/malformed/error/missing responses
 *   - run receipts classify status with artifact-gated `imported`
 *   - the composed runtime state refines ONLY the exported plateau and never
 *     demotes the proven deployed/verified/complete ledger path
 *   - drivers emit one evidence-derived next-best action with monotonic
 *     confidence; gap classification points at harvest, never auto-writes
 *   - every deriver is never-throws on empty/garbage input
 *
 * Run with:  node --test scripts/unit-training-runtime.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const { TRAINING_RUNTIME_PROFILES, defaultTrainingProfile, resolveTrainingProfile, buildTrainingRunConfig } = await import(lib("training-runtime-profiles.js"));
const { deriveArtifactState, artifactImportComplete, ARTIFACT_TYPES } = await import(lib("training-artifacts.js"));
const { verifyTunedResponse, deriveEndpointVerification } = await import(lib("training-verification.js"));
const { classifyRunStatus, deriveTrainingRunState, buildTrainingRunReceipt, trainingRunSourceKey, TRAINING_RUN_SCHEMA } = await import(lib("training-run-receipts.js"));
const { deriveTrainingRuntimeState, toPublicState, RUNTIME_STATES } = await import(lib("training-runtime.js"));
const { deriveTrainingRuntimeDrivers, deriveTrainingGapDrivers, scoreTrainingDriverImpact, rankTrainingNextActions } = await import(lib("training-runtime-drivers.js"));
const { deriveDistillationPipelineState } = await import(lib("training-ledger.js"));

// --------------------------------------------------------------------------
// Profiles
// --------------------------------------------------------------------------

test("profiles: default is unsloth-qlora-local and every profile has an import + verification floor", () => {
  assert.equal(defaultTrainingProfile().id, "unsloth-qlora-local");
  for (const p of TRAINING_RUNTIME_PROFILES) {
    assert.ok(p.id && p.label && p.runnerMode, `${p.id} has identity`);
    assert.ok(p.importProof && typeof p.importProof.modelTagRequired === "boolean", `${p.id} declares import proof`);
    assert.equal(p.verification.type, "api-registry-chat-completion");
    assert.ok(Array.isArray(p.outputs) && p.outputs.length > 0);
  }
});

test("profiles: unknown id falls back to default; buildTrainingRunConfig templates commands and reports readiness", () => {
  assert.equal(resolveTrainingProfile("nope").id, defaultTrainingProfile().id);
  const ready = buildTrainingRunConfig({ profileId: "unsloth-qlora-local", baseModel: "qwen2.5-coder:4b", datasetPath: "/tmp/c.jsonl", outputModelTag: "gh-qwen-v1", artifactPath: "/tmp/out" });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.missingRequirements, []);
  assert.ok(ready.commands[0].includes("/tmp/c.jsonl") && ready.commands[0].includes("qwen2.5-coder:4b"));
  assert.equal(ready.verification.expectedModel, "gh-qwen-v1");

  const missing = buildTrainingRunConfig({ profileId: "unsloth-qlora-local" });
  assert.equal(missing.ready, false);
  assert.ok(missing.missingRequirements.includes("baseModel"));
});

// --------------------------------------------------------------------------
// Artifacts
// --------------------------------------------------------------------------

test("artifacts: file-backed artifact requires type + tag + path + sha256", () => {
  assert.equal(deriveArtifactState(null).identified, false);
  assert.equal(deriveArtifactState({ type: "gguf", modelTag: "gh-v1" }).identified, false, "gguf without path/hash is not provable");
  assert.equal(deriveArtifactState({ type: "gguf", modelTag: "gh-v1", path: "/m.gguf" }).identified, false, "gguf still needs sha256");
  const ok = deriveArtifactState({ type: "gguf", modelTag: "gh-v1", path: "/m.gguf", sha256: "abc", quantization: "q4_k_m" });
  assert.equal(ok.identified, true);
  assert.equal(artifactImportComplete(ok.identified ? { type: "gguf", modelTag: "gh-v1", path: "/m.gguf", sha256: "abc" } : null), true);
});

test("artifacts: tag-only endpoint artifacts prove by model tag alone", () => {
  const ep = deriveArtifactState({ type: "openai-compatible-endpoint", modelTag: "gh-remote-v1" });
  assert.equal(ep.identified, true);
  assert.equal(ep.tagOnly, true);
  assert.equal(deriveArtifactState({ type: "ollama-model" }).identified, false, "ollama-model still needs a tag");
});

// --------------------------------------------------------------------------
// Verification
// --------------------------------------------------------------------------

test("verification: matching tuned tag verifies; base/mismatch/malformed/error/missing all demote", () => {
  assert.equal(verifyTunedResponse({ expectedTag: "gh-v1", responseBody: { model: "gh-v1", choices: [{ message: { content: "hi" } }] } }).verified, true);
  assert.equal(verifyTunedResponse({ expectedTag: "gh-v1", baseModel: "qwen:4b", responseBody: { model: "qwen:4b" } }).demotion, "base-model");
  assert.equal(verifyTunedResponse({ expectedTag: "gh-v1", responseBody: { model: "other" } }).demotion, "mismatch");
  assert.equal(verifyTunedResponse({ expectedTag: "gh-v1", responseBody: "not json" }).demotion, "malformed");
  assert.equal(verifyTunedResponse({ expectedTag: "gh-v1", responseBody: { error: { message: "boom" } } }).demotion, "error");
  assert.equal(verifyTunedResponse({ expectedTag: "gh-v1", responseBody: { choices: [] } }).demotion, "missing");
  assert.equal(verifyTunedResponse({ expectedTag: "", responseBody: { model: "x" } }).demotion, "no-expected-tag");
});

test("verification: deriveEndpointVerification reads a registry row's stamped lastResponse", () => {
  const v = deriveEndpointVerification({ registryRow: { lastResponse: JSON.stringify({ model: "gh-v1" }), lastTested: "2026-06-16" }, expectedTag: "gh-v1" });
  assert.equal(v.verified, true);
  assert.equal(v.testedAt, "2026-06-16");
  assert.equal(deriveEndpointVerification({ registryRow: null, expectedTag: "gh-v1" }).verified, false);
});

// --------------------------------------------------------------------------
// Run receipts
// --------------------------------------------------------------------------

test("run-receipts: classifyRunStatus gates `imported` on a provable artifact", () => {
  assert.equal(classifyRunStatus({ status: "failed" }).stage, "failed");
  assert.equal(classifyRunStatus({ status: "prepared" }).stage, "prepared");
  assert.equal(classifyRunStatus({ status: "running" }).stage, "running");
  // completed but artifact not provable → trained, never imported
  assert.equal(classifyRunStatus({ status: "completed", artifact: { type: "gguf", modelTag: "x" } }).stage, "trained");
  // imported claim with provable artifact → imported
  assert.equal(classifyRunStatus({ status: "imported", artifact: { type: "gguf", modelTag: "x", path: "/m", sha256: "h" } }).stage, "imported");
  // imported claim WITHOUT provable artifact demotes to trained
  assert.equal(classifyRunStatus({ status: "imported", artifact: { type: "gguf", modelTag: "x" } }).stage, "trained");
});

test("run-receipts: deriveTrainingRunState picks the best provable run and links the dataset export", () => {
  const slug = "workspace-local";
  const records = {
    [trainingRunSourceKey(slug)]: { records: [
      buildTrainingRunReceipt({ modelTrainingRowId: "workspace-local", status: "prepared", datasetExportId: "exp_1", trainingProfile: "unsloth-qlora-local" }),
      buildTrainingRunReceipt({ modelTrainingRowId: "workspace-local", status: "imported", datasetExportId: "exp_1", trainingProfile: "unsloth-qlora-local", artifact: { type: "gguf", modelTag: "gh-v1", path: "/m.gguf", sha256: "abc" } }),
    ] },
  };
  const state = deriveTrainingRunState({ workspaceSourceRecords: records, slug, knownExportIds: ["exp_1"] });
  assert.equal(state.present, true);
  assert.equal(state.runState, "imported");
  assert.equal(state.datasetExportLinked, true);
  assert.equal(state.runs.length, 2);
});

test("run-receipts: app-written governed dataModel rows feed the same lifecycle", () => {
  // The Training Runtime modal persists run receipts as rows in a
  // `model-training-run` object (PATCH allowlist) — flat columns or blob.
  const cfg = { dataModel: { objects: [{ objectType: "model-training-run", rows: [
    { trainingRunId: "r1", modelTrainingRowId: "workspace-local", status: "imported", datasetExportId: "exp_1", artifactType: "gguf", artifactModelTag: "gh-v1", artifactPath: "/m.gguf", artifactSha256: "abc" },
  ] }] } };
  const state = deriveTrainingRunState({ workspaceConfig: cfg, slug: "workspace-local", knownExportIds: ["exp_1"] });
  assert.equal(state.present, true);
  assert.equal(state.runState, "imported", "flat artifact columns rehydrate into a provable artifact");
  assert.equal(state.datasetExportLinked, true);
});

test("run-receipts: buildTrainingRunReceipt stamps the schema and normalizes metrics", () => {
  const r = buildTrainingRunReceipt({ modelTrainingRowId: "m", now: "2026-06-16T00:00:00.000Z" });
  assert.equal(r.schema, TRAINING_RUN_SCHEMA);
  assert.ok(r.trainingRunId.startsWith("trainrun_"));
  assert.equal(r.metrics.trainExamples, 0);
  assert.equal(r.metrics.loss, null);
});

// --------------------------------------------------------------------------
// Composed runtime state
// --------------------------------------------------------------------------

const TRAINING_TYPE = "model-training";
function exportedConfig() {
  return { dataModel: { objects: [{ objectType: TRAINING_TYPE, rows: [{
    Name: "workspace-local", localModel: "gh-v1",
    lastExportId: "exp_1", lastSourceId: "training:model-training:workspace-local",
    lastExportSummary: JSON.stringify({ recordCount: 12, exportId: "exp_1" }),
  }] }] } };
}
function exportedRecords() {
  return { "training:model-training:workspace-local": { records: [{ exportId: "exp_1", recordCount: 12 }] } };
}

test("runtime: exported plateau refines to prepared/trained/imported from run receipts", () => {
  const cfg = exportedConfig();
  const base = deriveTrainingRuntimeState({ workspaceConfig: cfg, workspaceSourceRecords: exportedRecords() });
  assert.equal(base.state, "exported", "no run yet → exported");
  assert.equal(toPublicState(base.state), "exported");

  const withPrepared = deriveTrainingRuntimeState({
    workspaceConfig: cfg,
    workspaceSourceRecords: { ...exportedRecords(), [trainingRunSourceKey("workspace-local")]: { records: [buildTrainingRunReceipt({ modelTrainingRowId: "workspace-local", status: "prepared", datasetExportId: "exp_1" })] } },
  });
  assert.equal(withPrepared.state, "prepared");
  assert.equal(toPublicState(withPrepared.state), "exported", "public ladder compresses prepared → exported");

  const withImported = deriveTrainingRuntimeState({
    workspaceConfig: cfg,
    workspaceSourceRecords: { ...exportedRecords(), [trainingRunSourceKey("workspace-local")]: { records: [buildTrainingRunReceipt({ modelTrainingRowId: "workspace-local", status: "imported", datasetExportId: "exp_1", artifact: { type: "gguf", modelTag: "gh-v1", path: "/m", sha256: "h" } })] } },
  });
  assert.equal(withImported.state, "imported");
});

test("runtime: a deployed ledger with no run receipt is a runGap, never a demotion", () => {
  // Bonded registry row (deployed) — PR #229 registry-first path.
  const cfg = { dataModel: { objects: [
    { objectType: TRAINING_TYPE, rows: [{ Name: "workspace-local", localModel: "gh-v1", lastExportId: "exp_1", lastSourceId: "training:model-training:workspace-local", lastExportSummary: JSON.stringify({ registryId: "workspace-local-model", exportId: "exp_1" }) }] },
    { objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", status: "connected", lastResponse: "" }] },
  ] } };
  const rt = deriveTrainingRuntimeState({ workspaceConfig: cfg, workspaceSourceRecords: exportedRecords() });
  assert.equal(rt.state, "deployed", "registry proof stands");
  assert.equal(rt.runGap, true, "missing run receipt is flagged, not demoted");
});

test("runtime: RUNTIME_STATES is the documented 11-state ladder and toPublicState compresses to 7", () => {
  assert.equal(RUNTIME_STATES.length, 11);
  const publics = new Set(RUNTIME_STATES.map(toPublicState));
  assert.equal(publics.size, 7);
});

// --------------------------------------------------------------------------
// Driver brain
// --------------------------------------------------------------------------

test("drivers: counterfactual impact is highest for the active blocker and zero for completed", () => {
  // active at index 2, total 10
  assert.ok(scoreTrainingDriverImpact(2, 2, 10) > scoreTrainingDriverImpact(5, 2, 10));
  assert.equal(scoreTrainingDriverImpact(1, 2, 10), 0, "completed steps have no marginal impact");
  assert.equal(scoreTrainingDriverImpact(3, -1, 10), 0, "complete loop → nothing marginal");
});

test("drivers: next-best action advances along the lifecycle as evidence accrues", () => {
  const empty = deriveTrainingRuntimeDrivers({ workspaceConfig: {}, workspaceSourceRecords: {} });
  assert.equal(empty.nextBestAction, "collect_traces");
  assert.ok(empty.confidence >= 0 && empty.confidence <= 1);

  // 12 qualified traces but no export → curate complete, export active.
  const traceRows = Array.from({ length: 12 }, (_, i) => ({ qualityScore: 5, inputPrompt: `p${i}`, agentOutput: `o${i}` }));
  const curated = deriveTrainingRuntimeDrivers({ workspaceConfig: { dataModel: { objects: [{ id: "training-traces", objectType: "training-traces", rows: traceRows }] } }, workspaceSourceRecords: {} });
  assert.equal(curated.nextBestAction, "export_dataset");

  // exported + prepared run → next is run_training.
  const cfg = exportedConfig();
  cfg.dataModel.objects.push({ id: "training-traces", objectType: "training-traces", rows: traceRows });
  const prepared = deriveTrainingRuntimeDrivers({
    workspaceConfig: cfg,
    workspaceSourceRecords: { ...exportedRecords(), [trainingRunSourceKey("workspace-local")]: { records: [buildTrainingRunReceipt({ modelTrainingRowId: "workspace-local", status: "prepared", datasetExportId: "exp_1" })] } },
  });
  assert.equal(prepared.nextBestAction, "run_training");
  assert.ok(prepared.confidence > empty.confidence, "confidence rises with evidence depth");
});

test("drivers: redaction-blocked traces below the floor emit fix_redaction (not curate)", () => {
  // 9 qualified + 5 blocked → still below the 10 floor, redaction is the obstacle.
  const rows = [
    ...Array.from({ length: 9 }, (_, i) => ({ qualityScore: 5, inputPrompt: `p${i}`, agentOutput: `o${i}` })),
    ...Array.from({ length: 5 }, (_, i) => ({ qualityScore: 5, inputPrompt: `b${i}`, agentOutput: `o${i}`, redactionStatus: "blocked" })),
  ];
  const d = deriveTrainingRuntimeDrivers({ workspaceConfig: { dataModel: { objects: [{ id: "training-traces", objectType: "training-traces", rows }] } }, workspaceSourceRecords: {} });
  assert.equal(d.nextBestAction, "fix_redaction");
  assert.equal(d.nextActionDestination, "/data-model");
});

test("drivers: a complete loop with new gaps emits export_gap_traces, never a demotion", () => {
  // Build a complete model + a failed sandbox run (gap source).
  const cfg = { dataModel: { objects: [
    { objectType: "model-training", rows: [{ Name: "workspace-local", localModel: "gh-v1", baseModel: "qwen:4b", lastExportId: "exp_1", lastSourceId: "training:model-training:workspace-local", lastExportSummary: JSON.stringify({ exportId: "exp_1", registryId: "workspace-local-model" }) }] },
    { objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", status: "connected", baseModel: "qwen:4b", lastResponse: JSON.stringify({ model: "gh-v1", choices: [{ message: { content: "ok" } }] }) }] },
    { objectType: "sandbox-environment", rows: [
      // The failed run is a GAP source; the successful run (last match wins in
      // the ledger deriver) carries the outputHash that proves complete.
      { Name: "smoke-fail", schedulerRegistryId: "workspace-local-model", lastRunId: "r2", lastResponse: JSON.stringify({ ok: false, exitCode: 1 }) },
      { Name: "smoke", schedulerRegistryId: "workspace-local-model", lastRunId: "r1", lastResponse: JSON.stringify({ ok: true, exitCode: 0, outputHash: "abc123" }) },
    ] },
  ] } };
  const records = { "training:model-training:workspace-local": { records: [{ exportId: "exp_1", recordCount: 12 }] } };
  const d = deriveTrainingRuntimeDrivers({ workspaceConfig: cfg, workspaceSourceRecords: records });
  assert.equal(d.state, "complete", "stays complete — never demoted");
  assert.equal(d.nextBestAction, "export_gap_traces");
});

test("drivers: every driver carries §13 fields (blockingProof, canonicalDestination, ctaLabel, impactScore)", () => {
  const d = deriveTrainingRuntimeDrivers({ workspaceConfig: {}, workspaceSourceRecords: {} });
  for (const dr of d.drivers) {
    for (const f of ["blockingProof", "canonicalDestination", "ctaLabel", "impactScore", "canonicalObject"]) {
      assert.ok(f in dr, `${dr.id} carries ${f}`);
    }
  }
});

test("drivers: next action carries a canonical destination + CTA (CEO link discipline)", () => {
  const empty = deriveTrainingRuntimeDrivers({ workspaceConfig: {}, workspaceSourceRecords: {} });
  assert.equal(empty.nextBestAction, "collect_traces");
  assert.equal(empty.nextActionDestination, "/data-model");
  assert.ok(empty.nextActionCta && empty.nextActionCanonicalObject);
  // Every driver links to an authority route — the UI only renders it.
  for (const d of empty.drivers) {
    assert.ok(["/training", "/data-model", "/workflows", "/custom-models"].includes(d.destination), `${d.action} routes to a canonical authority`);
    assert.ok(d.cta && d.canonicalObject);
  }
});

test("drivers: evidence object reports the lifecycle proof flags", () => {
  const d = deriveTrainingRuntimeDrivers({ workspaceConfig: exportedConfig(), workspaceSourceRecords: exportedRecords() });
  assert.equal(typeof d.evidence.totalTraces, "number");
  assert.equal(d.evidence.tunedTagVerified, false);
  assert.equal(d.evidence.latestExportLinked, true);
  assert.ok(Array.isArray(d.ranked));
});

test("drivers: rankTrainingNextActions returns active+pending sorted by impact", () => {
  const d = deriveTrainingRuntimeDrivers({ workspaceConfig: {}, workspaceSourceRecords: {} });
  const ranked = rankTrainingNextActions(d.drivers);
  assert.ok(ranked.length > 0);
  for (let i = 1; i < ranked.length; i += 1) assert.ok(ranked[i - 1].impact >= ranked[i].impact);
});

test("gaps: classifier counts failures/rejections/escalations and points at harvest (never auto-writes)", () => {
  const cfg = { dataModel: { objects: [
    { objectType: "sandbox-environment", rows: [{ Name: "s1", lastResponse: JSON.stringify({ ok: false }) }] },
    { objectType: "model-training", rows: [{ Name: "workspace-local", localModel: "gh-v1", baseModel: "qwen:4b" }] },
    { objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", baseModel: "qwen:4b", lastResponse: JSON.stringify({ model: "qwen:4b" }) }] },
    { id: "training-traces", objectType: "training-traces", rows: [{ qualityScore: 1, inputPrompt: "p", agentOutput: "o" }] },
  ] } };
  const records = { "helper:apply:receipts": { records: [{ outcome: "skipped" }, { outcome: "corrected" }] }, "training:model-training:workspace-local": { records: [{ escalations: 2 }] } };
  const g = deriveTrainingGapDrivers({ workspaceConfig: cfg, workspaceSourceRecords: records });
  assert.ok(g.hasGaps);
  const ids = new Set(g.gaps.map((x) => x.id));
  assert.ok(ids.has("failed_sandbox_run"));
  assert.ok(ids.has("base_model_response"));
  assert.ok(ids.has("rejected_proposal"));
  assert.ok(ids.has("self_eval_exhausted"));
  assert.ok(ids.has("low_quality_traces"));
  assert.ok(g.totalGapSignals > 0);
});

// --------------------------------------------------------------------------
// Never-throws discipline
// --------------------------------------------------------------------------

test("never-throws: every deriver tolerates empty/garbage input", () => {
  for (const fn of [
    () => deriveTrainingRuntimeState({}),
    () => deriveTrainingRuntimeState({ workspaceConfig: { dataModel: { objects: "nope" } } }),
    () => deriveTrainingRunState({}),
    () => deriveTrainingRuntimeDrivers({}),
    () => deriveTrainingGapDrivers({}),
    () => deriveArtifactState("garbage"),
    () => verifyTunedResponse({}),
    () => classifyRunStatus(undefined),
    () => buildTrainingRunConfig(),
  ]) {
    assert.doesNotThrow(fn);
  }
});

// --------------------------------------------------------------------------
// Custom-model genome ISOLATION — no leak into generic registry rows, other
// custom objects, or standardized workflow/nango paths.
// --------------------------------------------------------------------------

const { deriveCustomModelsState, isCustomModelRegistryRow } = await import(lib("custom-models-ledger.js"));

test("isolation: the trait gate recognizes only tagged/linked rows; generic rows are never custom-model", () => {
  assert.equal(isCustomModelRegistryRow({ integrationId: "nango-hubspot", connectorKind: "nango" }), false, "generic nango row");
  assert.equal(isCustomModelRegistryRow({ integrationId: "stripe", capabilities: "payments" }), false, "generic integration");
  assert.equal(isCustomModelRegistryRow({ integrationId: "wl-model", kind: "custom-model" }), true, "explicit trait");
  assert.equal(isCustomModelRegistryRow({ integrationId: "wl-model", capabilityType: "custom-model-inference" }), true, "explicit capabilityType");
  assert.equal(isCustomModelRegistryRow({ integrationId: "wl-model" }, new Set(["wl-model"])), true, "bonded link");
  assert.equal(isCustomModelRegistryRow(null), false);
});

test("isolation: generic registry + unrelated custom objects do NOT surface custom models or flip /custom-models visibility", () => {
  const cfg = { dataModel: { objects: [
    // A standard integration registry row + a nango path + an unrelated custom object.
    { objectType: "api-registry", rows: [
      { integrationId: "nango-hubspot", connectorKind: "nango", status: "connected", lastResponse: JSON.stringify({ ok: true }) },
      { integrationId: "stripe-billing", connectorKind: "http", status: "connected" },
    ] },
    { objectType: "custom", id: "crm-deals", rows: [{ Name: "Acme", stage: "won" }] },
    { objectType: "sandbox-environment", id: "some-workflow", rows: [{ Name: "nightly", schedulerRegistryId: "nango-hubspot" }] },
  ] } };
  const state = deriveCustomModelsState({ workspaceConfig: cfg, workspaceSourceRecords: {} });
  assert.equal(state.commandVisible, false, "/custom-models stays hidden — no custom-model evidence");
  assert.equal(state.models.length, 0, "no generic row is mistaken for a custom model");
});

test("isolation: a custom-model row coexists with generic rows without poisoning them", () => {
  const cfg = { dataModel: { objects: [
    { objectType: "model-training", rows: [{ Name: "workspace-local", localModel: "gh-v1", lastExportSummary: JSON.stringify({ registryId: "workspace-local-model" }) }] },
    { objectType: "api-registry", rows: [
      { integrationId: "nango-hubspot", connectorKind: "nango", status: "connected" },
      { integrationId: "workspace-local-model", kind: "custom-model", capabilityType: "custom-model-inference", status: "connected", lastResponse: JSON.stringify({ model: "gh-v1" }) },
    ] },
  ] } };
  const state = deriveCustomModelsState({ workspaceConfig: cfg, workspaceSourceRecords: {} });
  assert.equal(state.commandVisible, true);
  assert.equal(state.models.length, 1, "exactly the one custom model — the generic nango row is untouched");
  assert.equal(state.models[0].apiRegistryId, "workspace-local-model");
});

// --------------------------------------------------------------------------
// Workspace genome — causation classifier + field visibility + sidecar gate
// --------------------------------------------------------------------------

const { deriveRecordGenome, deriveGenomeFieldVisibility, applyGenomeFieldSettings, deriveRecordSidecar } = await import(lib("workspace-genome.js"));

test("genome: causation classifies first-party structures; user-generic records are `generic`", () => {
  assert.equal(deriveRecordGenome({ integrationId: "wl-model", kind: "custom-model" }).genome, "custom-model");
  assert.equal(deriveRecordGenome({ integrationId: "hub", connectorKind: "nango" }).genome, "nango");
  assert.equal(deriveRecordGenome({ integrationId: "my-thing" }).genome, "generic", "a plain user record expresses no genome");
  assert.equal(deriveRecordGenome(null).genome, "generic");
});

test("genome: field visibility HIDES custom-model binding fields until a record expresses the genome", () => {
  // Generic + nango rows only → custom-model fields hidden.
  const generic = { objectType: "api-registry", rows: [{ integrationId: "hub", connectorKind: "nango" }, { integrationId: "stripe" }] };
  const v1 = deriveGenomeFieldVisibility({ object: generic });
  assert.ok(v1.hidden.includes("modelTrainingRowId") && v1.hidden.includes("expectedModelTag"), "custom-model fields hidden when absent");
  assert.ok(v1.present.includes("nango"), "nango genome is present so its fields show");

  // A custom-model record present → its fields are revealed.
  const withModel = { objectType: "api-registry", rows: [{ integrationId: "hub", connectorKind: "nango" }, { integrationId: "wl-model", kind: "custom-model" }] };
  const v2 = deriveGenomeFieldVisibility({ object: withModel });
  assert.ok(v2.shown.includes("modelTrainingRowId"), "custom-model fields shown once present");
  assert.ok(!v2.hidden.includes("modelTrainingRowId"));
});

test("genome: user-added value also reveals the field (works backwards-compatibly)", () => {
  const obj = { objectType: "api-registry", rows: [{ integrationId: "x", expectedModelTag: "gh-v1" }] };
  const v = deriveGenomeFieldVisibility({ object: obj });
  assert.ok(v.shown.includes("expectedModelTag"), "a user-added value keeps the field visible");
});

test("genome: applyGenomeFieldSettings preserves prior hidden, reveals expressed genome fields, never mutates", () => {
  const obj = { objectType: "api-registry", rows: [{ integrationId: "wl-model", kind: "custom-model" }], fieldSettings: { hidden: ["authRef"], order: ["integrationId"] } };
  const fs = applyGenomeFieldSettings(obj);
  assert.ok(fs.hidden.includes("authRef"), "prior user-hidden field stays hidden");
  assert.ok(!fs.hidden.includes("modelTrainingRowId"), "expressed custom-model field is revealed");
  assert.deepEqual(obj.fieldSettings.hidden, ["authRef"], "input not mutated");
});

test("genome: sidecar selector renders per-record genome and never crosses paths", () => {
  assert.deepEqual(
    (({ sidecar, renders }) => ({ sidecar, renders }))(deriveRecordSidecar({ integrationId: "wl", kind: "custom-model" })),
    { sidecar: "custom-model", renders: true },
  );
  assert.deepEqual(
    (({ sidecar, renders }) => ({ sidecar, renders }))(deriveRecordSidecar({ integrationId: "hub", connectorKind: "nango" })),
    { sidecar: "nango", renders: true },
  );
  assert.equal(deriveRecordSidecar({ integrationId: "plain" }).renders, false, "generic record gets no special sidecar");
});

// --------------------------------------------------------------------------
// First-use bootstrap checklist (mirrors CEO bootstrap)
// --------------------------------------------------------------------------

const { deriveTrainingBootstrapState, buildTrainingBootstrapMarkerPatch, TRAINING_BOOTSTRAP_MARKER_FIELD } = await import(lib("training-bootstrap-console.js"));

function helperObj(extra = {}) {
  return { id: "workspace-helper-sandbox", objectType: "sandbox-environment", rows: [{ Name: "workspace-helper", ...extra }] };
}

test("bootstrap: empty workspace shows the first-use checklist (mode=bootstrap), invoke pending", () => {
  const b = deriveTrainingBootstrapState({ workspaceConfig: { dataModel: { objects: [helperObj()] } }, workspaceSourceRecords: {} });
  assert.equal(b.mode, "bootstrap");
  assert.equal(b.completed, false);
  assert.equal(b.checklist.find((s) => s.id === "invoke").status, "pending");
  assert.equal(b.checklist.find((s) => s.id === "complete").status, "pending");
  assert.ok(b.primaryAction, "there is always a next move");
});

test("bootstrap: deployed-but-unverified exposes the INVOKE next action with the bonded apiRegistryId", () => {
  const cfg = { dataModel: { objects: [
    helperObj(),
    { objectType: "model-training", rows: [{ Name: "workspace-local", localModel: "gh-v1", lastExportId: "exp_1", lastSourceId: "training:model-training:workspace-local", lastExportSummary: JSON.stringify({ exportId: "exp_1", registryId: "workspace-local-model" }) }] },
    { objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", kind: "custom-model", status: "connected", lastResponse: "" }] },
  ] } };
  const b = deriveTrainingBootstrapState({ workspaceConfig: cfg, workspaceSourceRecords: { "training:model-training:workspace-local": { records: [{ exportId: "exp_1" }] } } });
  const invoke = b.checklist.find((s) => s.id === "invoke");
  assert.equal(invoke.status, "ready");
  assert.equal(invoke.nextAction.kind, "invoke-endpoint");
  assert.equal(invoke.nextAction.apiRegistryId, "workspace-local-model");
  assert.equal(b.primaryAction.kind, "invoke-endpoint");
});

test("bootstrap: a verified tuned-tag response completes invoke and unlocks completion", () => {
  const cfg = { dataModel: { objects: [
    helperObj(),
    { objectType: "model-training", rows: [{ Name: "workspace-local", localModel: "gh-v1", lastExportId: "exp_1", lastSourceId: "training:model-training:workspace-local", lastExportSummary: JSON.stringify({ exportId: "exp_1", registryId: "workspace-local-model" }) }] },
    { objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", kind: "custom-model", status: "connected", lastResponse: JSON.stringify({ model: "gh-v1", choices: [{ message: { content: "hi from your model" } }] }) }] },
    { id: "training-traces", objectType: "training-traces", rows: Array.from({ length: 10 }, (_, i) => ({ qualityScore: 5, inputPrompt: `p${i}`, agentOutput: `o${i}`, exported: "true" })) },
  ] } };
  const records = { "training:model-training:workspace-local": { records: [{ exportId: "exp_1", recordCount: 10 }] } };
  const b = deriveTrainingBootstrapState({ workspaceConfig: cfg, workspaceSourceRecords: records });
  assert.equal(b.checklist.find((s) => s.id === "invoke").status, "complete");
  assert.equal(b.checklist.find((s) => s.id === "complete").status, "ready", "completion unlocked after a real verified invocation");
  assert.equal(b.primaryAction.kind, "mark-complete");
});

test("bootstrap: completion marker flips to operational; removing it rolls back to bootstrap (no browser flag)", () => {
  const withMarker = { dataModel: { objects: [helperObj({ [TRAINING_BOOTSTRAP_MARKER_FIELD]: "2026-06-16T00:00:00.000Z" })] } };
  assert.equal(deriveTrainingBootstrapState({ workspaceConfig: withMarker }).mode, "operational");
  const without = { dataModel: { objects: [helperObj()] } };
  assert.equal(deriveTrainingBootstrapState({ workspaceConfig: without }).mode, "bootstrap");
});

test("bootstrap: marker PATCH builder stamps the helper row, returns null when absent (graceful)", () => {
  const cfg = { dataModel: { objects: [helperObj()] } };
  const objects = buildTrainingBootstrapMarkerPatch(cfg, { at: "2026-06-16T01:00:00.000Z", by: "user" });
  assert.ok(objects, "stamps when helper row exists");
  assert.equal(objects[0].rows[0][TRAINING_BOOTSTRAP_MARKER_FIELD], "2026-06-16T01:00:00.000Z");
  assert.equal(buildTrainingBootstrapMarkerPatch({ dataModel: { objects: [] } }, { at: "x" }), null, "null when no helper row — caller no-ops, never crashes");
});

test("bootstrap: deriver never throws on empty/garbage input", () => {
  assert.doesNotThrow(() => deriveTrainingBootstrapState({}));
  assert.doesNotThrow(() => deriveTrainingBootstrapState({ workspaceConfig: { dataModel: { objects: "no" } } }));
});

// --------------------------------------------------------------------------
// Persistence seam (compression / future-module upgrade)
// --------------------------------------------------------------------------

const { condenseTrainingPayload, expandTrainingPayload, PERSISTENCE_UPGRADE_SEAM } = await import(lib("training-persistence.js"));
const zlib = await import("node:zlib");

test("persistence: json-v1 condense/expand is lossless", () => {
  const payload = { records: [{ trainingRunId: "r1", status: "imported" }, { trainingRunId: "r2", status: "prepared" }] };
  const env = condenseTrainingPayload(payload, { codecId: "json-v1" });
  assert.equal(env.envelope, "growthub-local-training-persistence-v1");
  assert.equal(env.recordCount, 2);
  assert.deepEqual(expandTrainingPayload(env), payload);
});

test("persistence: gzip-base64-v1 round-trips losslessly with injected zlib and shrinks large payloads", () => {
  const payload = { records: Array.from({ length: 200 }, (_, i) => ({ trainingRunId: `r${i}`, status: "imported", note: "growthub-local model training run receipt evidence" })) };
  const env = condenseTrainingPayload(payload, { codecId: "gzip-base64-v1", deflate: (b) => zlib.gzipSync(Buffer.from(b)) });
  assert.equal(env.codec, "gzip-base64-v1");
  assert.equal(env.binary, true);
  assert.ok(env.data.length < JSON.stringify(payload).length, "compressed envelope is smaller");
  assert.deepEqual(expandTrainingPayload(env, { inflate: (b) => zlib.gunzipSync(Buffer.from(b)) }), payload);
});

test("persistence: condense falls back to json-v1 losslessly when codec unavailable (never blocks a write)", () => {
  const payload = { records: [{ x: 1 }] };
  const env = condenseTrainingPayload(payload, { codecId: "gzip-base64-v1" }); // no deflate injected
  assert.equal(env.codec, "json-v1", "falls back, never throws");
  assert.deepEqual(expandTrainingPayload(env), payload);
});

test("persistence: expand passes through an already-expanded plain payload", () => {
  const plain = { records: [] };
  assert.deepEqual(expandTrainingPayload(plain), plain);
  assert.equal(expandTrainingPayload(null), null);
});

test("persistence: v1 default target does not compress or offload (deferred to V2 module)", () => {
  assert.equal(PERSISTENCE_UPGRADE_SEAM.v1Default.compress, false);
  assert.equal(PERSISTENCE_UPGRADE_SEAM.v1Default.offload, false);
  assert.ok(PERSISTENCE_UPGRADE_SEAM.deferredTargets.length > 0);
});

test("redaction: a blocked trace never enters the corpus, regardless of quality (Layer 1)", () => {
  const rows = [
    { qualityScore: 5, inputPrompt: "p1", agentOutput: "o1" },
    { qualityScore: 5, inputPrompt: "p2", agentOutput: "o2", redactionStatus: "blocked" },
    { qualityScore: 5, inputPrompt: "p3", agentOutput: "o3", redactionStatus: "redacted" },
  ];
  const p = deriveDistillationPipelineState({ workspaceConfig: { dataModel: { objects: [{ id: "training-traces", objectType: "training-traces", rows }] } } });
  assert.equal(p.graded, 2, "blocked trace excluded, redacted trace kept");
  assert.equal(p.blocked, 1);
});

test("artifact types are the documented closed set", () => {
  assert.deepEqual(ARTIFACT_TYPES, ["adapter", "gguf", "merged-model", "ollama-model", "openai-compatible-endpoint"]);
});
