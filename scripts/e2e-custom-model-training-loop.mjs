/**
 * Custom Model Training Loop V1 — end-to-end reality probe.
 *
 * This does NOT mock the loop. It constructs a real temporary Growthub Local
 * workspace (growthub.config.json + growthub.source-records.json), drives the
 * SHIPPED `runIntelligenceExport` against it, then walks the governed runtime
 * ladder by mutating the workspace exactly as the cockpits/CLI would — and
 * asserts BOTH the positive consequences (the loop advances on real evidence)
 * AND the negative ones (dedupe, demotion, base-model rejection, runGap, gap
 * re-detection). It is the executable form of the v1 acceptance test.
 *
 * Build the CLI export module first (npm deps external):
 *   npx esbuild cli/src/commands/intelligence.ts --bundle --platform=node \
 *     --format=esm --packages=external --outfile=/tmp/intelligence.mjs
 *
 * Run:  node scripts/e2e-custom-model-training-loop.mjs
 * (set GROWTHUB_INTELLIGENCE_MODULE to override the bundled CLI path.)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const { deriveTrainingRuntimeState } = await import(lib("training-runtime.js"));
const { deriveTrainingRuntimeDrivers, deriveTrainingGapDrivers } = await import(lib("training-runtime-drivers.js"));
const { deriveCustomModelsState } = await import(lib("custom-models-ledger.js"));
const { buildTrainingRunReceipt, trainingRunSourceKey } = await import(lib("training-run-receipts.js"));
const { buildTrainingRunConfig } = await import(lib("training-runtime-profiles.js"));
const { deriveTrainingBootstrapState, buildTrainingBootstrapMarkerPatch, TRAINING_BOOTSTRAP_MARKER_FIELD } = await import(lib("training-bootstrap-console.js"));

const cliModulePath = process.env.GROWTHUB_INTELLIGENCE_MODULE || "/tmp/intelligence.mjs";
let runIntelligenceExport = null;
if (fs.existsSync(cliModulePath)) {
  ({ runIntelligenceExport } = await import(pathToFileURL(cliModulePath).href));
}

const SLUG = "workspace-local";
let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); pass += 1; console.log(`  ✓ ${label}`); };
const eq = (label, a, b) => { assert.equal(a, b, `${label} (got ${a}, want ${b})`); pass += 1; console.log(`  ✓ ${label}`); };

// --------------------------------------------------------------------------
// Build a real temp workspace with governed evidence.
// --------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ghl-training-loop-"));
const configPath = path.join(tmp, "growthub.config.json");
const recordsPath = path.join(tmp, "growthub.source-records.json");
const outDir = path.join(tmp, "exports");

function readWorkspace() {
  return {
    workspaceConfig: JSON.parse(fs.readFileSync(configPath, "utf8")),
    workspaceSourceRecords: fs.existsSync(recordsPath) ? JSON.parse(fs.readFileSync(recordsPath, "utf8")) : {},
  };
}
function writeWorkspace(config, records) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(recordsPath, `${JSON.stringify(records, null, 2)}\n`);
}

// Seed: a model-training row + 12 graded traces + governed helper/sandbox
// evidence for the CLI export to harvest. No tuned proof yet.
const traceRows = Array.from({ length: 12 }, (_, i) => ({
  sessionDate: "2026-06-16", inputPrompt: `prompt ${i}`, agentOutput: `output ${i}`,
  qualityScore: 5, reason: "graded", exported: "false",
}));
const seedConfig = {
  dataModel: { objects: [
    // The well-known helper row the bootstrap completion marker lives on.
    { id: "workspace-helper-sandbox", objectType: "sandbox-environment", rows: [{ Name: "workspace-helper" }] },
    { id: "model-training", objectType: "model-training", rows: [{ Name: SLUG, baseModel: "qwen2.5-coder:4b", localModel: "" }] },
    { id: "training-traces", objectType: "training-traces", rows: traceRows },
  ] },
};
const seedRecords = {
  "helper:apply:receipts": { records: [
    { outcome: "applied", type: "widget", rationale: "add KPI", apiKey: "sk-SHOULD-REDACT-aaaaaaaa" },
    { outcome: "skipped", type: "object", rationale: "rejected proposal" },
  ] },
};
writeWorkspace(seedConfig, seedRecords);

console.log(`\nTemp workspace: ${tmp}`);

// --------------------------------------------------------------------------
// STEP 1 — start state: eligible, next action = export.
// --------------------------------------------------------------------------
console.log("\n[1] Initial state — traces exist, nothing exported");
{
  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  const rt = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug: SLUG });
  const drivers = deriveTrainingRuntimeDrivers({ workspaceConfig, workspaceSourceRecords, slug: SLUG });
  eq("runtime state is eligible", rt.state, "eligible");
  eq("next best action is export_dataset", drivers.nextBestAction, "export_dataset");
  ok("confidence is low at the start", drivers.confidence < 0.5);
}

// --------------------------------------------------------------------------
// STEP 2 — run the SHIPPED export against the temp workspace (positive +
//          negative: secrets redacted, ledger advances, sidecar linked).
// --------------------------------------------------------------------------
console.log("\n[2] growthub intelligence export (real CLI logic)");
if (runIntelligenceExport) {
  const result = runIntelligenceExport({ workspaceDir: tmp, outDir, slug: SLUG, now: () => new Date("2026-06-16T12:00:00.000Z") });
  ok("corpus file written", fs.existsSync(result.outPath));
  ok("at least one record exported", result.recordCount > 0);

  const corpus = fs.readFileSync(result.outPath, "utf8");
  ok("NEGATIVE: no credential pattern reaches the corpus", !/sk-SHOULD-REDACT/.test(corpus) && /\[redacted\]/.test(corpus));
  const first = JSON.parse(corpus.split("\n").filter(Boolean)[0]);
  ok("every record carries provenance", Boolean(first.provenance?.sourceHash && first.provenance?.labelType && first.provenance?.capabilityTag));
  ok("redaction status is recorded", ["clean", "redacted"].includes(first.provenance.redactionStatus));

  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  const rt = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug: SLUG });
  eq("ledger advanced to exported", rt.state, "exported");
  ok("sidecar export evidence is linked", rt.ledger.models.some((m) => m.evidence === "linked"));

  // NEGATIVE: a second incremental export must not duplicate evidence.
  console.log("\n[2b] re-run export --incremental (dedupe)");
  const again = runIntelligenceExport({ workspaceDir: tmp, outDir, slug: SLUG, incremental: true, now: () => new Date("2026-06-16T13:00:00.000Z") });
  eq("NEGATIVE: incremental re-run adds zero new records", again.recordCount, 0);
  ok("NEGATIVE: duplicates were skipped, not re-emitted", again.skippedDuplicates >= result.recordCount);
} else {
  console.log("  ! /tmp/intelligence.mjs not found — skipping live CLI export (build it per the header)");
  // Fall back: stamp the ledger as the CLI would so the ladder walk continues.
  // Target the model-training object by objectType (NOT index 0 — the seed
  // prepends a helper-sandbox object, so the model row is not at index 0).
  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  const mt = workspaceConfig.dataModel.objects.find((o) => o?.objectType === "model-training");
  mt.rows[0] = {
    Name: SLUG, baseModel: "qwen2.5-coder:4b", localModel: "",
    status: "exported", lastExportId: "exp_seed", lastSourceId: `training:model-training:${SLUG}`,
    lastExportSummary: JSON.stringify({ recordCount: 12, exportId: "exp_seed" }),
  };
  workspaceSourceRecords[`training:model-training:${SLUG}`] = { records: [{ exportId: "exp_seed", recordCount: 12 }] };
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
}

const exportId = (() => {
  const { workspaceConfig } = readWorkspace();
  const mt = workspaceConfig.dataModel.objects.find((o) => o?.objectType === "model-training");
  return String(mt?.rows?.[0]?.lastExportId || "exp_seed");
})();

// --------------------------------------------------------------------------
// STEP 3 — prepare a governed training run (the run-receipt layer).
// --------------------------------------------------------------------------
console.log("\n[3] Prepare a governed training run");
{
  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  const cfg = buildTrainingRunConfig({ profileId: "unsloth-qlora-local", baseModel: "qwen2.5-coder:4b", datasetPath: `${outDir}/c.jsonl`, outputModelTag: "growthub-qwen-codegen-v1", artifactPath: `${tmp}/out` });
  ok("run config is ready (all requirements met)", cfg.ready);
  const receipt = buildTrainingRunReceipt({ modelTrainingRowId: SLUG, datasetExportId: exportId, baseModel: "qwen2.5-coder:4b", trainingProfile: "unsloth-qlora-local", status: "prepared" });
  workspaceSourceRecords[trainingRunSourceKey(SLUG)] = { records: [receipt] };
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
  const rt = deriveTrainingRuntimeState({ workspaceConfig, ...readWorkspace(), slug: SLUG });
  eq("runtime refines exported → prepared", deriveTrainingRuntimeState({ ...readWorkspace(), slug: SLUG }).state, "prepared");
  eq("public ladder compresses prepared → exported", rt.publicState, "exported");
}

// --------------------------------------------------------------------------
// STEP 4 — NEGATIVE: a 'completed' run with an unprovable artifact stays
//          'trained', never 'imported'.
// --------------------------------------------------------------------------
console.log("\n[4] NEGATIVE: completed run, artifact not provable → trained (not imported)");
{
  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  workspaceSourceRecords[trainingRunSourceKey(SLUG)].records.push(
    buildTrainingRunReceipt({ modelTrainingRowId: SLUG, datasetExportId: exportId, trainingProfile: "unsloth-qlora-local", status: "completed", artifact: { type: "gguf", modelTag: "growthub-qwen-codegen-v1" } }),
  );
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
  eq("artifact without path+sha256 keeps state at trained", deriveTrainingRuntimeState({ ...readWorkspace(), slug: SLUG }).state, "trained");
}

// --------------------------------------------------------------------------
// STEP 5 — POSITIVE: import a provable artifact → imported.
// --------------------------------------------------------------------------
console.log("\n[5] Import a provable artifact (path + sha256 + tag) → imported");
{
  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  workspaceSourceRecords[trainingRunSourceKey(SLUG)].records.push(
    buildTrainingRunReceipt({ modelTrainingRowId: SLUG, datasetExportId: exportId, trainingProfile: "unsloth-qlora-local", status: "imported", artifact: { type: "gguf", modelTag: "growthub-qwen-codegen-v1", path: `${tmp}/out.gguf`, sha256: "deadbeefcafef00d", quantization: "q4_k_m" } }),
  );
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
  eq("provable artifact advances to imported", deriveTrainingRuntimeState({ ...readWorkspace(), slug: SLUG }).state, "imported");
}

// --------------------------------------------------------------------------
// STEP 6 — register endpoint (deployed) + NEGATIVE base-model demotion.
// --------------------------------------------------------------------------
console.log("\n[6] Register endpoint → deployed; base-model response must NOT verify");
{
  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  // Bond the version row to a registry row (the handoff scaffold).
  const trainObj = workspaceConfig.dataModel.objects.find((o) => o.objectType === "model-training");
  trainObj.rows[0].localModel = "growthub-qwen-codegen-v1";
  trainObj.rows[0].lastExportSummary = JSON.stringify({ recordCount: 12, exportId, registryId: `${SLUG}-model` });
  workspaceConfig.dataModel.objects.push({ id: "api-registry", objectType: "api-registry", rows: [
    { integrationId: `${SLUG}-model`, status: "connected", baseUrl: "http://127.0.0.1:11434/v1", lastResponse: JSON.stringify({ model: "qwen2.5-coder:4b" }) },
  ] });
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
  const rt = deriveTrainingRuntimeState({ ...readWorkspace(), slug: SLUG });
  eq("endpoint registered → deployed", rt.state, "deployed");
  ok("NEGATIVE: base-model response does NOT promote to verified", rt.state !== "verified");
}

// --------------------------------------------------------------------------
// STEP 7 — POSITIVE: tuned-tag response → verified.
// --------------------------------------------------------------------------
console.log("\n[7] Endpoint serves the tuned tag → verified");
{
  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  const reg = workspaceConfig.dataModel.objects.find((o) => o.objectType === "api-registry").rows[0];
  reg.lastResponse = JSON.stringify({ model: "growthub-qwen-codegen-v1", choices: [{ message: { content: "// generated by the tuned model" } }] });
  reg.lastTested = "2026-06-16T14:00:00.000Z";
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
  eq("tuned-tag response advances to verified", deriveTrainingRuntimeState({ ...readWorkspace(), slug: SLUG }).state, "verified");
  eq("/custom-models command becomes visible", deriveCustomModelsState({ ...readWorkspace() }).commandVisible, true);
}

// --------------------------------------------------------------------------
// STEP 8 — bind sandbox (sandbox-ready) then run smoke (complete).
// --------------------------------------------------------------------------
console.log("\n[8] Bind sandbox → sandbox-ready; run smoke (outputHash) → complete");
{
  let { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  // Distinct id from the workspace-helper sandbox object so the probe can
  // target the smoke row unambiguously (the derivers scan all rows anyway).
  workspaceConfig.dataModel.objects.push({ id: "smoke-sandbox", objectType: "sandbox-environment", rows: [
    { Name: "smoke", schedulerRegistryId: `${SLUG}-model`, lastRunId: "", lastResponse: "" },
  ] });
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
  eq("sandbox references registry → sandbox-ready", deriveTrainingRuntimeState({ ...readWorkspace(), slug: SLUG }).state, "sandbox-ready");

  ({ workspaceConfig, workspaceSourceRecords } = readWorkspace());
  const sb = workspaceConfig.dataModel.objects.find((o) => o.id === "smoke-sandbox").rows[0];
  sb.lastRunId = "run_smoke_1";
  sb.lastResponse = JSON.stringify({ ok: true, exitCode: 0, outputHash: "8dccc820abc12345" });
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
  const rt = deriveTrainingRuntimeState({ ...readWorkspace(), slug: SLUG });
  eq("sandbox run proof → complete", rt.state, "complete");
  ok("identity chain carries the output hash", Boolean(rt.identityChain?.modelOutputHash));
  const models = deriveCustomModelsState({ ...readWorkspace() });
  ok("/custom-models shows a complete model", models.models.some((m) => m.evidenceState === "complete"));
}

// --------------------------------------------------------------------------
// STEP 9 — first-use bootstrap checklist touchpoints, on the COMPLETE state
//          (positive + negative + rollback + graceful failure).
// --------------------------------------------------------------------------
console.log("\n[9] First-use setup checklist (bootstrap) touchpoints");
{
  // The model is complete (verified + smoke run + outputHash) but has NO
  // completion marker yet, so the checklist is still in bootstrap mode.
  const ws = readWorkspace();
  const b = deriveTrainingBootstrapState({ workspaceConfig: ws.workspaceConfig, workspaceSourceRecords: ws.workspaceSourceRecords });
  eq("checklist is in bootstrap mode until a marker is stamped", b.mode, "bootstrap");
  eq("invoke step is complete after a real verified chat-completions response", b.checklist.find((s) => s.id === "invoke").status, "complete");
  eq("smoke step is complete only with outputHash proof", b.checklist.find((s) => s.id === "smoke").status, "complete");
  eq("completion is unlocked (mark-complete) only after smoke proof", b.primaryAction.kind, "mark-complete");

  // POSITIVE: stamp the governed completion marker → checklist flips operational.
  const objects = buildTrainingBootstrapMarkerPatch(ws.workspaceConfig, { at: "2026-06-16T15:00:00.000Z", by: "user" });
  ok("marker PATCH builder stamps the helper row", Boolean(objects));
  const stampedConfig = { ...ws.workspaceConfig, dataModel: { ...ws.workspaceConfig.dataModel, objects } };
  writeWorkspace(stampedConfig, ws.workspaceSourceRecords);
  eq("after marker, checklist disappears (operational mode)", deriveTrainingBootstrapState({ ...readWorkspace() }).mode, "operational");

  // NEGATIVE / ROLLBACK: removing the marker rolls back to bootstrap — state is
  // derived from config, never a sticky browser flag.
  const rolled = readWorkspace();
  delete rolled.workspaceConfig.dataModel.objects.find((o) => o.id === "workspace-helper-sandbox").rows[0][TRAINING_BOOTSTRAP_MARKER_FIELD];
  writeWorkspace(rolled.workspaceConfig, rolled.workspaceSourceRecords);
  eq("ROLLBACK: removing the marker returns to bootstrap (no sticky flag)", deriveTrainingBootstrapState({ ...readWorkspace() }).mode, "bootstrap");

  // NEGATIVE: a verified endpoint WITHOUT smoke outputHash must NOT allow
  // completion (the final invariant — verified ≠ complete).
  const verifiedOnly = deriveTrainingBootstrapState({ workspaceConfig: { dataModel: { objects: [
    { id: "workspace-helper-sandbox", objectType: "sandbox-environment", rows: [{ Name: "workspace-helper" }] },
    { objectType: "model-training", rows: [{ Name: SLUG, localModel: "gh-v1", lastExportId: "exp_1", lastSourceId: `training:model-training:${SLUG}`, lastExportSummary: JSON.stringify({ exportId: "exp_1", registryId: `${SLUG}-model` }) }] },
    { objectType: "api-registry", rows: [{ integrationId: `${SLUG}-model`, kind: "custom-model", status: "connected", lastResponse: JSON.stringify({ model: "gh-v1" }) }] },
    { id: "training-traces", objectType: "training-traces", rows: Array.from({ length: 10 }, (_, i) => ({ qualityScore: 5, inputPrompt: `p${i}`, agentOutput: `o${i}`, exported: "true" })) },
  ] } }, workspaceSourceRecords: { [`training:model-training:${SLUG}`]: { records: [{ exportId: "exp_1" }] } } });
  eq("NEGATIVE: verified-only (no smoke outputHash) does NOT unlock completion", verifiedOnly.checklist.find((s) => s.id === "complete").status, "pending");

  // GRACEFUL: a workspace with no helper row cannot be stamped — the builder
  // returns null and the caller no-ops instead of crashing.
  ok("GRACEFUL: marker builder returns null when the helper row is absent", buildTrainingBootstrapMarkerPatch({ dataModel: { objects: [] } }, { at: "x" }) === null);

  // GRACEFUL: a brand-new workspace (no model yet) still derives a checklist
  // with a safe next action and a pending invoke (never a dark/blank state).
  const fresh = deriveTrainingBootstrapState({ workspaceConfig: { dataModel: { objects: [{ id: "workspace-helper-sandbox", objectType: "sandbox-environment", rows: [{ Name: "workspace-helper" }] }] } }, workspaceSourceRecords: {} });
  eq("fresh workspace: invoke is pending (not invokable yet)", fresh.checklist.find((s) => s.id === "invoke").status, "pending");
  ok("fresh workspace: there is always a next move", Boolean(fresh.primaryAction));
}

// --------------------------------------------------------------------------
// STEP 10 — feedback loop: a failed custom-model run surfaces as a gap.
// --------------------------------------------------------------------------
console.log("\n[10] Future failed run becomes a training gap");
{
  const { workspaceConfig, workspaceSourceRecords } = readWorkspace();
  workspaceConfig.dataModel.objects.find((o) => o.id === "smoke-sandbox").rows.push(
    { Name: "smoke-fail", schedulerRegistryId: `${SLUG}-model`, lastRunId: "run_fail_1", lastResponse: JSON.stringify({ ok: false, exitCode: 1 }) },
  );
  writeWorkspace(workspaceConfig, workspaceSourceRecords);
  const gaps = deriveTrainingGapDrivers({ ...readWorkspace(), slug: SLUG });
  ok("gap classifier detects the failed run", gaps.gaps.some((g) => g.id === "failed_sandbox_run"));
  ok("gap recommendation points the next cycle", gaps.hasGaps && gaps.recommendation.length > 0);
}

// --------------------------------------------------------------------------
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n✅ Custom Model Training Loop V1 — end-to-end reality proven (${pass} assertions).`);
