import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = (name) => pathToFileURL(path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib", name)).href;
const { buildAdaptiveStudentPlan } = await import(lib("distillation-student-plan.js"));
const { deriveCapacityPlan, normalizeRequirementsForProfile } = await import(lib("compute-capacity-profiles.js"));
const { buildTrainingRunConfig } = await import(lib("training-runtime-profiles.js"));
const { buildComputeIntent, buildComputeWorkSpec, verifyComputeAuthority } = await import(lib("compute-work-spec.js"));

test("large prepared plan has one immutable requirements/profile/work-spec lineage", () => {
  const preflight = { ramGB: 256, diskFreeGB: 2000, gpu: { present: true, name: "H100", vramFreeGB: 80 } };
  const plan = buildAdaptiveStudentPlan({ preflight, requestedBaseModel: "qwen3:70b" });
  const capacity = deriveCapacityPlan({ plan, preflight, workloadKind: "fine-tune", paramsB: 141 });
  assert.equal(capacity.capacityProfileId, "multi-gpu-finetune");
  assert.ok(capacity.requirements.gpuCount >= 2);
  const config = buildTrainingRunConfig({ profileId: "unsloth-qlora-quantize-pipeline", baseModel: "qwen3:141b", datasetPath: "dataset/export.jsonl", outputModelTag: "student-v9", artifactPath: "artifacts/student-v9" });
  const intent = buildComputeIntent({ adaptivePlan: plan, capacityPlan: capacity, policy: { mode: "cloud", excludeLocal: true, budget: { mode: "hard-cap", maxTotalUsd: 25 }, locality: { regions: ["us-east"], dataResidency: "us" } }, trainingRunConfig: config });
  const spec = buildComputeWorkSpec({ intent, trainingRunConfig: config, trainingRunId: "trainrun-large", modelTrainingRowId: "workspace-local", datasetExportId: "export-9", corpusSha256: "a".repeat(64) });
  assert.equal(verifyComputeAuthority({ intent, workSpec: spec }).ok, true);
  assert.equal(intent.requirementsHash, spec.requirementsHash);
  assert.equal(intent.capacityProfileId, spec.capacityProfileId);
  assert.equal(spec.training.baseModel, "qwen3:141b");
  assert.equal(spec.dataset.corpusSha256, "a".repeat(64));
});

test("profile floors tighten contradictory requirements and policy is immutable", () => {
  const tightened = normalizeRequirementsForProfile({ workloadKind: "fine-tune", gpuCount: 0, minVramPerGpuGB: 0 }, "single-gpu-finetune");
  assert.equal(tightened.gpuCount, 1);
  assert.equal(tightened.minVramPerGpuGB, 16);
  assert.equal(tightened.checkpointRequired, true);
});

test("tampered intent or work spec fails closed", () => {
  const config = buildTrainingRunConfig({ profileId: "unsloth-qlora-quantize-pipeline", baseModel: "qwen3:14b", datasetPath: "d.jsonl", outputModelTag: "student", artifactPath: "artifacts/student" });
  const capacity = deriveCapacityPlan({ plan: { mode: "train-local", baseModel: "qwen3:14b" }, preflight: {}, workloadKind: "fine-tune" });
  const intent = buildComputeIntent({ adaptivePlan: { mode: "train-local", baseModel: "qwen3:14b" }, capacityPlan: capacity, policy: { mode: "cloud" }, trainingRunConfig: config });
  const spec = buildComputeWorkSpec({ intent, trainingRunConfig: config, trainingRunId: "r", modelTrainingRowId: "m", datasetExportId: "d" });
  assert.equal(verifyComputeAuthority({ intent: { ...intent, capacityProfileId: "burst-gpu" }, workSpec: spec }).ok, false);
  assert.equal(verifyComputeAuthority({ intent, workSpec: { ...spec, training: { ...spec.training, baseModel: "other" } } }).ok, false);
});
