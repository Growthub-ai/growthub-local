/**
 * Super-admin Model QA seed — self-contained CLONE over the agnostic
 * feature-work seed. The original `workspace-feature-seed.mjs` stays
 * byte-identical to main (zero contamination): this module DEEP-COPIES its
 * output and layers the custom-model closed-loop QA evidence on top:
 *
 *   - training-traces governed object (Pipeline V1 row shape) — present in
 *     growthub.config.json IMMEDIATELY on export for instant QA
 *   - model-training ledger row enriched to the post-fine-tune linked state
 *   - custom model API Registry row (tested-row evidence shape, tuned tag)
 *   - custom-model-workflow sandbox row (api-registry-call graph + run
 *     proof carrying a REAL outputHash)
 *   - training:* export record + model-invocation:* proof record
 *
 * All mock proof is explicitly labeled seed QA evidence — it proves
 * plumbing and derivations; production claims require a real fine-tune's
 * own proof. Runner: scripts/export-seed-workspace-model-qa.mjs
 */

import { buildFeatureWorkspaceSeed, SEED_TIMESTAMP } from "./workspace-feature-seed.mjs";

export const MODEL_REGISTRY_ID = "workspace-local-model";
export const MODEL_TUNED_TAG = "workspace-local-tuned-v1";
export const MODEL_INVOCATION_RESPONSE = JSON.stringify({
  id: "chatcmpl-seed-1",
  model: MODEL_TUNED_TAG,
  choices: [{ message: { role: "assistant", content: "Hello from your fine-tuned workspace model (seed QA evidence)." } }],
});

export const TRAINING_COLUMNS = [
  "Name", "status", "baseModel", "localModel", "modelVersion", "apiRegistryId", "deployedEndpoint",
  "lastSandboxObjectId", "lastSandboxRunId", "lastExportAt", "lastExportId", "lastSourceId", "lastExportSummary", "description",
];
export const TRACES_COLUMNS = ["sessionDate", "inputPrompt", "agentOutput", "qualityScore", "reason", "exported"];

export const TRAINING_EXPORT_SUMMARY = {
  recordCount: 4,
  surfaces: { helper: 2, selfEval: 1, swarm: 1 },
  escalations: 1,
  rewardMean: 0.82,
  path: "~/growthub-worker-kit-exports/training/feature-seed.jsonl",
  registryId: MODEL_REGISTRY_ID,
  version: 1,
};

export const TRAINING_OBJECT = {
  id: "model-training",
  label: "Model Training",
  source: "Model Training",
  objectType: "model-training",
  icon: "Terminal",
  columns: TRAINING_COLUMNS,
  rows: [{
    Name: "workspace-local",
    status: "verified",
    baseModel: "gemma3",
    localModel: MODEL_TUNED_TAG,
    modelVersion: "ft-2026-06-10-v1",
    apiRegistryId: MODEL_REGISTRY_ID,
    deployedEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
    lastSandboxObjectId: "sandbox-probe",
    lastSandboxRunId: "run_seed_model_smoke",
    lastExportAt: SEED_TIMESTAMP,
    lastExportId: "exp_feature_seed_baseline",
    lastSourceId: "training:model-training:workspace-local",
    lastExportSummary: JSON.stringify(TRAINING_EXPORT_SUMMARY),
    description: "Seed QA evidence — continued-training ledger baseline (replace with real export stamps).",
  }],
  binding: { mode: "manual", source: "Model Training" },
  relations: [],
  fieldSettings: { hidden: [], order: TRAINING_COLUMNS },
};

export const TRACES_OBJECT = {
  id: "training-traces",
  label: "Training Traces",
  source: "Training Traces",
  objectType: "training-traces",
  icon: "Terminal",
  columns: TRACES_COLUMNS,
  rows: [
    ...Array.from({ length: 11 }, (_, i) => ({
      sessionDate: SEED_TIMESTAMP,
      inputPrompt: `Seed QA governed task ${i + 1}`,
      agentOutput: `Completed governed change ${i + 1} via helper apply.`,
      qualityScore: "5",
      reason: "critic-graded (seed QA evidence)",
      exported: "true",
    })),
    { sessionDate: SEED_TIMESTAMP, inputPrompt: "What is the weather", agentOutput: "Out of scope.", qualityScore: "2", reason: "no executed work", exported: "false" },
  ],
  binding: { mode: "manual", source: "Training Traces" },
  relations: [],
  fieldSettings: { hidden: [], order: TRACES_COLUMNS },
};

const MODEL_REGISTRY_ROW = {
  integrationId: MODEL_REGISTRY_ID,
  authRef: "",
  baseUrl: "http://127.0.0.1:11434/v1",
  endpoint: "/chat/completions",
  method: "POST",
  status: "connected",
  lastTested: SEED_TIMESTAMP,
  lastResponse: MODEL_INVOCATION_RESPONSE,
  entityTypes: "chat-completions",
  description: "Seed QA evidence — fine-tuned workspace model endpoint (replace with your real tuned model's tested row).",
  connectorKind: "http",
  resolverTemplateId: "custom-http",
  schemaVersion: "growthub-resolver-template-v1",
  capabilities: "chat-completions",
  executionLane: "sandbox-local",
  kind: "custom-model",
};

const MODEL_SANDBOX_ROW = {
  Name: "custom-model-workflow",
  lifecycleStatus: "live",
  version: "1",
  runLocality: "local",
  schedulerRegistryId: MODEL_REGISTRY_ID,
  runtime: "node",
  adapter: "local-process",
  agentHost: "",
  envRefs: "",
  networkAllow: "false",
  allowList: "",
  instructions: "Invoke the fine-tuned workspace model via its API Registry row.",
  command: "",
  timeoutMs: "30000",
  status: "tested",
  lastTested: SEED_TIMESTAMP,
  lastRunId: "run_seed_model_smoke",
  lastSourceId: "sandbox:sandbox-probe:custom-model-workflow",
  lastResponse: JSON.stringify({ ok: true, exitCode: 0, stdout: "model invocation ok", outputHash: "seed-out-7f3a91", durationMs: 240, ranAt: SEED_TIMESTAMP }),
  resolverTemplateId: "custom-http",
  connectorKind: "http",
  executionLane: "sandbox-local",
  orchestrationConfig: JSON.stringify({
    version: 1,
    provider: "growthub-native",
    nodes: [
      { id: "input", type: "input", label: "Prompt", subtitle: "Chat prompt", config: { inputMode: "manual", samplePayload: { prompt: "Summarize today" }, sourceType: "", sourceId: "", entityId: "", filterMode: "and", filters: [] } },
      { id: "model-call", type: "api-registry-call", label: "Fine-tuned model", subtitle: `${MODEL_REGISTRY_ID} · POST /chat/completions`, config: { registryId: MODEL_REGISTRY_ID, integrationId: MODEL_REGISTRY_ID, baseUrl: "http://127.0.0.1:11434/v1", endpoint: "/chat/completions", method: "POST", authRef: "", queryParams: {}, bodyTemplate: "", requestHeadersMetadata: { authHeaderName: "", authPrefix: "", contentType: "application/json" }, timeoutMs: 30000 } },
      { id: "result", type: "tool-result", label: "Result", subtitle: "Save response", config: { successStatusCodes: [200], writeLastResponse: true, writeSourceRecord: true, sourceRecordId: "", outputMode: "normalized-json", previewFields: [], statusField: "status", lastTestedField: "lastTested" } },
    ],
    edges: [
      { from: "input", to: "model-call", passes: "payload" },
      { from: "model-call", to: "result", passes: "provider-response" },
    ],
  }, null, 2),
};

/**
 * Compose the super-admin QA workspace: deep-copy the pristine feature
 * seed, then layer the closed-loop evidence. The original module's exported
 * constants are never mutated.
 */
export function buildSuperAdminModelQaSeed(baseConfig = {}) {
  const base = buildFeatureWorkspaceSeed(baseConfig);
  const seed = JSON.parse(JSON.stringify({ workspaceConfig: base.workspaceConfig, sourceRecords: base.sourceRecords }));
  seed.envLocal = base.envLocal;

  for (const object of seed.workspaceConfig.dataModel.objects) {
    if (object.objectType === "api-registry") object.rows.push({ ...MODEL_REGISTRY_ROW });
    if (object.id === "sandbox-probe") object.rows.push({ ...MODEL_SANDBOX_ROW });
  }
  seed.workspaceConfig.dataModel.objects.push(
    JSON.parse(JSON.stringify(TRAINING_OBJECT)),
    JSON.parse(JSON.stringify(TRACES_OBJECT)),
  );

  seed.sourceRecords["training:model-training:workspace-local"] = {
    recordCount: 1,
    fetchedAt: SEED_TIMESTAMP,
    records: [{ exportId: "exp_feature_seed_baseline", at: SEED_TIMESTAMP, modelId: MODEL_TUNED_TAG, ...TRAINING_EXPORT_SUMMARY }],
  };
  seed.sourceRecords["model-invocation:workspace-local-model:seed"] = {
    recordCount: 1,
    fetchedAt: SEED_TIMESTAMP,
    records: [{
      invocationId: "inv_seed_1",
      registryId: MODEL_REGISTRY_ID,
      modelVersion: "ft-2026-06-10-v1",
      status: 200,
      response: JSON.parse(MODEL_INVOCATION_RESPONSE),
      note: "Seed QA evidence — replace with real test-source proof for production claims.",
    }],
  };
  return seed;
}
