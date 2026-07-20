/**
 * Immutable provider-neutral training intent and work specification.
 * The training planner remains the sole authority for workload semantics;
 * compute adapters receive this frozen projection and may only translate it.
 */
import { fnv1a64 } from "./distillation-gateway.js";
import { resolveCapacityProfile, normalizeRequirementsForProfile } from "./compute-capacity-profiles.js";

export const COMPUTE_INTENT_SCHEMA = "growthub-compute-intent-v1";
export const COMPUTE_WORK_SPEC_SCHEMA = "growthub-training-execution-spec-v1";

export function stableComputeStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableComputeStringify).join(",")}]`;
  return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableComputeStringify(value[key])}`).join(",")}}`;
}

export function hashComputeValue(value) {
  return fnv1a64(stableComputeStringify(value));
}

export function normalizeComputePolicy(raw = {}) {
  const p = raw && typeof raw === "object" ? raw : {};
  const mode = ["automatic", "local", "cloud", "reserved-cluster"].includes(p.mode) ? p.mode : "automatic";
  const budget = p.budget && typeof p.budget === "object" ? p.budget : {};
  const locality = p.locality && typeof p.locality === "object" ? p.locality : {};
  return {
    mode,
    excludeLocal: mode === "cloud" || p.excludeLocal === true,
    localOnly: mode === "local" || p.localOnly === true,
    reservedOnly: mode === "reserved-cluster" || p.reservedOnly === true,
    allowPreemptible: p.allowPreemptible === true,
    budget: {
      mode: ["hard-cap", "advisory", "unlimited"].includes(budget.mode) ? budget.mode : "advisory",
      maxTotalUsd: Math.max(0, Number(budget.maxTotalUsd) || 0),
      maxHourlyUsd: Math.max(0, Number(budget.maxHourlyUsd) || 0),
      allowUnknownCost: budget.allowUnknownCost === true,
    },
    locality: {
      regions: Array.isArray(locality.regions) ? locality.regions.map(String).filter(Boolean) : [],
      dataResidency: String(locality.dataResidency || ""),
    },
  };
}

export function buildComputeIntent({ adaptivePlan, capacityPlan, policy, trainingRunConfig } = {}) {
  const profileId = String(capacityPlan?.capacityProfileId || "");
  if (!resolveCapacityProfile(profileId)) throw new Error(`unknown capacity profile "${profileId}"`);
  const policySnapshot = normalizeComputePolicy(policy);
  const requirements = normalizeRequirementsForProfile({ ...(capacityPlan?.requirements || {}), locality: policySnapshot.locality }, profileId);
  const body = {
    schema: COMPUTE_INTENT_SCHEMA,
    adaptivePlan: {
      mode: String(adaptivePlan?.mode || ""),
      tier: String(adaptivePlan?.tier || ""),
      baseModel: String(adaptivePlan?.baseModel || trainingRunConfig?.baseModel || ""),
    },
    capacityProfileId: profileId,
    requirements,
    requirementsHash: hashComputeValue(requirements),
    policy: policySnapshot,
    training: {
      profileId: String(trainingRunConfig?.profileId || ""),
      runnerMode: String(trainingRunConfig?.runnerMode || ""),
      baseModel: String(trainingRunConfig?.baseModel || ""),
      teacherModel: String(trainingRunConfig?.teacherModel || ""),
      quantization: String(trainingRunConfig?.quantization || ""),
    },
  };
  return { ...body, intentHash: hashComputeValue(body) };
}

export function buildComputeWorkSpec({ intent, trainingRunConfig, trainingRunId, modelTrainingRowId, datasetExportId, corpusSha256 = "" } = {}) {
  if (!intent || intent.schema !== COMPUTE_INTENT_SCHEMA || intent.intentHash !== hashComputeValue({ ...intent, intentHash: undefined })) {
    throw new Error("compute intent missing or hash mismatch");
  }
  const body = {
    schema: COMPUTE_WORK_SPEC_SCHEMA,
    intentHash: intent.intentHash,
    requirementsHash: intent.requirementsHash,
    capacityProfileId: intent.capacityProfileId,
    trainingRunId: String(trainingRunId || ""),
    modelTrainingRowId: String(modelTrainingRowId || ""),
    training: {
      profileId: String(trainingRunConfig?.profileId || ""),
      runnerMode: String(trainingRunConfig?.runnerMode || ""),
      baseModel: String(trainingRunConfig?.baseModel || ""),
      teacherModel: String(trainingRunConfig?.teacherModel || ""),
      quantization: String(trainingRunConfig?.quantization || ""),
      steps: (Array.isArray(trainingRunConfig?.steps) ? trainingRunConfig.steps : []).map((step) => ({
        stageId: String(step?.stageId || ""), label: String(step?.label || ""), bin: String(step?.bin || ""), args: Array.isArray(step?.args) ? step.args.map(String) : [],
      })),
    },
    dataset: { exportId: String(datasetExportId || ""), path: String(trainingRunConfig?.datasetPath || ""), corpusSha256: String(corpusSha256 || "") },
    output: {
      modelTag: String(trainingRunConfig?.outputModelTag || ""),
      artifactPath: String(trainingRunConfig?.artifactPath || ""),
      expectedKinds: Array.isArray(trainingRunConfig?.importProof?.acceptedTypes) ? trainingRunConfig.importProof.acceptedTypes.map(String) : [],
    },
  };
  return { ...body, workSpecHash: hashComputeValue(body) };
}

export function verifyComputeAuthority({ intent, workSpec } = {}) {
  const intentOk = Boolean(intent?.schema === COMPUTE_INTENT_SCHEMA && intent.intentHash === hashComputeValue({ ...intent, intentHash: undefined }));
  const specOk = Boolean(workSpec?.schema === COMPUTE_WORK_SPEC_SCHEMA && workSpec.workSpecHash === hashComputeValue({ ...workSpec, workSpecHash: undefined }));
  return { ok: intentOk && specOk && workSpec?.intentHash === intent?.intentHash && workSpec?.requirementsHash === intent?.requirementsHash && workSpec?.capacityProfileId === intent?.capacityProfileId, intentOk, specOk };
}
