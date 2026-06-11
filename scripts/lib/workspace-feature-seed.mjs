/**
 * Agnostic feature-work workspace seed — scripts only, no product edits.
 *
 * Grounded 1:1 against causation drivers:
 *   - Activation 5/5: scripts/unit-workspace-lenses.test.mjs completeConfig()
 *   - API Registry cockpit: scripts/unit-api-registry-creation-flow.test.mjs
 *   - Probe shapes: scripts/awac-workspace-api-probe.mjs buildSeedDataModel()
 */

import { pathToFileURL } from "node:url";
import path from "node:path";

export const KIT_ID = "growthub-custom-workspace-starter-v1";
export const PRIMARY_REGISTRY_ID = "probe-scheduler";
export const DATA_SOURCE_OBJECT_ID = "probe-scheduler-source";
export const DATA_SOURCE_SOURCE_ID = "probe-scheduler-records";
export const SEED_TIMESTAMP = "2026-06-10T00:00:00.000Z";

export const SEED_ENV_LOCAL = [
  "# Feature-work seed — resolves api-registry authRef PROBE_SCHEDULER",
  "PROBE_SCHEDULER=feature-seed-stub",
  "WORKSPACE_CONFIG_ALLOW_FS_WRITE=true",
  "",
].join("\n");

export const API_REGISTRY_COLUMNS = [
  "integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse",
  "entityTypes", "description", "connectorKind", "resolverTemplateId", "schemaVersion", "capabilities", "executionLane",
];

export const DATA_SOURCE_COLUMNS = [
  "Name", "registryId", "endpoint", "authRef", "baseUrl", "status", "lastTested", "lastResponse",
  "entityType", "sourceId", "sourceStorage", "resolverTemplateId", "description",
];

export const SANDBOX_COLUMNS = [
  "Name", "lifecycleStatus", "version", "runLocality", "schedulerRegistryId", "runtime", "adapter", "agentHost",
  "envRefs", "networkAllow", "allowList", "instructions", "command", "timeoutMs", "status", "lastTested",
  "lastRunId", "lastSourceId", "lastResponse", "resolverTemplateId", "connectorKind", "executionLane",
];

export const SCHEDULER_RELATION = {
  id: "scheduler-registry-binding",
  name: "Scheduler (serverless)",
  field: "schedulerRegistryId",
  targetObjectType: "api-registry",
  type: "belongs-to",
  description: "Serverless scheduler FK",
  valueField: "integrationId",
  labelField: "Name",
  secondaryLabelField: "endpoint",
  statusField: "status",
  statusAllowlist: ["connected", "approved", "ok", "success"],
  searchable: true,
  pageSize: 25,
};

const PROBE_LAST_RESPONSE = JSON.stringify({ ok: true, status: 200, data: [{ id: "rec-1", label: "Probe record" }] });
const BASELINE_RUN_RESPONSE = JSON.stringify({ exitCode: 0, ok: true, stdout: "growthub-probe-ok", durationMs: 12, ranAt: SEED_TIMESTAMP });

export const REGISTRY_WORKFLOW_GRAPH = {
  version: 1,
  provider: "growthub-native",
  nodes: [
    { id: "input", type: "input", label: "Input", subtitle: "Manual or source payload", config: { inputMode: "manual", samplePayload: {}, sourceType: "", sourceId: "", entityId: "", filterMode: "and", filters: [] } },
    { id: "api-request", type: "api-registry-call", label: "API Registry", subtitle: "probe-scheduler · POST /run", config: { registryId: PRIMARY_REGISTRY_ID, integrationId: PRIMARY_REGISTRY_ID, baseUrl: "https://example.invalid", endpoint: "/run", method: "POST", authRef: "PROBE_SCHEDULER", queryParams: {}, bodyTemplate: "", requestHeadersMetadata: { authHeaderName: "x-api-key", authPrefix: "", contentType: "application/json" }, timeoutMs: 30000 } },
    { id: "transform", type: "transform-filter", label: "Transform", subtitle: "Map fields", config: { rootPath: "data", mode: "json", fieldMap: {}, includeFields: [], excludeFields: [], computedFields: {}, filters: [], filterMode: "and", maxRows: 0 } },
    { id: "result", type: "tool-result", label: "Result", subtitle: "Save response", config: { successStatusCodes: [200], writeLastResponse: true, writeSourceRecord: true, sourceRecordId: "", outputMode: "normalized-json", previewFields: [], statusField: "status", lastTestedField: "lastTested" } },
  ],
  edges: [
    { from: "input", to: "api-request", passes: "payload" },
    { from: "api-request", to: "transform", passes: "provider-response" },
    { from: "transform", to: "result", passes: "normalized-output" },
  ],
};

export const API_REGISTRY_OBJECT = {
  id: "api-registry-probe",
  label: "API Registry",
  source: "API Registry",
  objectType: "api-registry",
  icon: "Code2",
  columns: API_REGISTRY_COLUMNS,
  rows: [
    {
      integrationId: PRIMARY_REGISTRY_ID,
      authRef: "PROBE_SCHEDULER",
      baseUrl: "https://example.invalid",
      endpoint: "/run",
      method: "POST",
      status: "connected",
      lastTested: SEED_TIMESTAMP,
      lastResponse: PROBE_LAST_RESPONSE,
      entityTypes: "records",
      description: "Feature-work seed — trusted scheduler row",
      connectorKind: "http",
      resolverTemplateId: "custom-http",
      schemaVersion: "growthub-resolver-template-v1",
      capabilities: "",
      executionLane: "sandbox-serverless",
    },
    {
      integrationId: "probe-untrusted",
      authRef: "X",
      baseUrl: "https://example.invalid",
      endpoint: "/x",
      method: "POST",
      status: "failed",
      lastTested: "",
      lastResponse: "",
      entityTypes: "",
      description: "Untrusted — excluded from trusted pickers",
      connectorKind: "http",
      resolverTemplateId: "",
      schemaVersion: "",
      capabilities: "",
      executionLane: "",
    },
  ],
  binding: { mode: "manual", source: "Data Model" },
  relations: [],
  fieldSettings: { hidden: [], order: API_REGISTRY_COLUMNS },
};

// Custom-model invocation proof — the exact response shape an OpenAI-
// compatible runtime returns, carrying the TUNED model tag (never the
// base). Seed QA evidence: proves the plumbing/derivations; a real
// fine-tune must produce its own proof before production claims.
export const MODEL_REGISTRY_ID = "workspace-local-model";
export const MODEL_TUNED_TAG = "workspace-local-tuned-v1";
export const MODEL_INVOCATION_RESPONSE = JSON.stringify({
  id: "chatcmpl-seed-1",
  model: MODEL_TUNED_TAG,
  choices: [{ message: { role: "assistant", content: "Hello from your fine-tuned workspace model (seed QA evidence)." } }],
});

API_REGISTRY_OBJECT.rows.push({
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
});

export const DATA_SOURCE_OBJECT = {
  id: DATA_SOURCE_OBJECT_ID,
  label: "Probe Scheduler Source",
  source: "Probe Scheduler Source",
  objectType: "data-source",
  icon: "Globe",
  columns: DATA_SOURCE_COLUMNS,
  rows: [{
    Name: "Probe Scheduler Source",
    registryId: PRIMARY_REGISTRY_ID,
    endpoint: "/run",
    authRef: "PROBE_SCHEDULER",
    baseUrl: "https://example.invalid",
    status: "connected",
    lastTested: SEED_TIMESTAMP,
    lastResponse: PROBE_LAST_RESPONSE,
    entityType: "records",
    sourceId: DATA_SOURCE_SOURCE_ID,
    sourceStorage: "workspace-source-records",
    resolverTemplateId: "custom-http",
    description: `Data Source for ${PRIMARY_REGISTRY_ID}.`,
  }],
  binding: { mode: "manual", source: "Probe Scheduler Source" },
  relations: [{
    id: "resolver-binding",
    name: "Resolver",
    field: "registryId",
    targetObjectType: "api-registry",
    type: "belongs-to",
    description: "API Registry entry for this source.",
    valueField: "integrationId",
    labelField: "Name",
    secondaryLabelField: "endpoint",
    statusField: "status",
    statusAllowlist: ["connected", "approved", "ok", "success"],
    searchable: true,
    pageSize: 25,
  }],
  fieldSettings: { hidden: [], order: DATA_SOURCE_COLUMNS },
};

export const SANDBOX_OBJECT = {
  id: "sandbox-probe",
  label: "Sandboxes",
  source: "Sandboxes",
  objectType: "sandbox-environment",
  icon: "Terminal",
  columns: SANDBOX_COLUMNS,
  rows: [
    {
      Name: "probe-local-sbx",
      lifecycleStatus: "live",
      version: "1",
      runLocality: "local",
      schedulerRegistryId: "",
      runtime: "node",
      adapter: "local-process",
      agentHost: "",
      envRefs: "",
      networkAllow: "false",
      allowList: "",
      instructions: "",
      command: "console.log('growthub-probe-ok')",
      timeoutMs: "15000",
      status: "tested",
      lastTested: SEED_TIMESTAMP,
      lastRunId: "run_feature_seed_baseline",
      lastSourceId: "sandbox:sandbox-probe:probe-local-sbx",
      lastResponse: BASELINE_RUN_RESPONSE,
      resolverTemplateId: "custom-http",
      connectorKind: "http",
      executionLane: "sandbox-local",
    },
    {
      Name: "registry-workflow",
      lifecycleStatus: "live",
      version: "1",
      runLocality: "local",
      schedulerRegistryId: "",
      runtime: "node",
      adapter: "local-process",
      agentHost: "",
      envRefs: "",
      networkAllow: "false",
      allowList: "",
      instructions: "Workflow calling probe-scheduler.",
      command: "",
      timeoutMs: "30000",
      status: "",
      lastTested: "",
      lastRunId: "",
      lastSourceId: "",
      lastResponse: "",
      resolverTemplateId: "custom-http",
      connectorKind: "http",
      executionLane: "sandbox-local",
      orchestrationConfig: JSON.stringify(REGISTRY_WORKFLOW_GRAPH, null, 2),
    },
  ],
  binding: { mode: "manual", source: "Data Model" },
  relations: [SCHEDULER_RELATION],
  fieldSettings: { hidden: [], order: SANDBOX_COLUMNS },
};

// Custom-model sandbox workflow — same graph grammar as registry-workflow,
// bound to the model endpoint row; run evidence stamped (seed QA).
SANDBOX_OBJECT.rows.push({
  Name: "custom-model-workflow",
  lifecycleStatus: "live",
  version: "1",
  runLocality: "local",
  schedulerRegistryId: "workspace-local-model",
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
  lastResponse: JSON.stringify({ ok: true, exitCode: 0, stdout: "model invocation ok", durationMs: 240, ranAt: SEED_TIMESTAMP }),
  resolverTemplateId: "custom-http",
  connectorKind: "http",
  executionLane: "sandbox-local",
  orchestrationConfig: JSON.stringify({
    version: 1,
    provider: "growthub-native",
    nodes: [
      { id: "input", type: "input", label: "Prompt", subtitle: "Chat prompt", config: { inputMode: "manual", samplePayload: { prompt: "Summarize today" }, sourceType: "", sourceId: "", entityId: "", filterMode: "and", filters: [] } },
      { id: "model-call", type: "api-registry-call", label: "Fine-tuned model", subtitle: "workspace-local-model · POST /chat/completions", config: { registryId: "workspace-local-model", integrationId: "workspace-local-model", baseUrl: "http://127.0.0.1:11434/v1", endpoint: "/chat/completions", method: "POST", authRef: "", queryParams: {}, bodyTemplate: "", requestHeadersMetadata: { authHeaderName: "", authPrefix: "", contentType: "application/json" }, timeoutMs: 30000 } },
      { id: "result", type: "tool-result", label: "Result", subtitle: "Save response", config: { successStatusCodes: [200], writeLastResponse: true, writeSourceRecord: true, sourceRecordId: "", outputMode: "normalized-json", previewFields: [], statusField: "status", lastTestedField: "lastTested" } },
    ],
    edges: [
      { from: "input", to: "model-call", passes: "payload" },
      { from: "model-call", to: "result", passes: "provider-response" },
    ],
  }, null, 2),
});

export const HELPER_SANDBOX_OBJECT = {
  id: "workspace-helper-sandbox",
  label: "Workspace Helper Sandbox",
  source: "Workspace Helper Sandbox",
  objectType: "sandbox-environment",
  icon: "Terminal",
  columns: ["Name", "lifecycleStatus", "runLocality", "runtime", "adapter", "agentHost", "intelligenceType", "localModel", "localEndpoint", "intelligenceAdapterMode"],
  rows: [{
    Name: "workspace-helper",
    lifecycleStatus: "live",
    runLocality: "local",
    runtime: "node",
    adapter: "local-intelligence",
    agentHost: "",
    intelligenceType: "local-intelligence",
    localModel: "",
    localEndpoint: "",
    intelligenceAdapterMode: "ollama",
  }],
  binding: { mode: "manual", source: "Workspace Helper Sandbox" },
};

// Continued-training ledger seed — `model-training` custom object rows are
// stamped by `growthub intelligence export` with the identical
// lastRunId/lastSourceId/lastResponse discipline sandbox-run uses. The
// pure deriver lives in the kit at lib/training-ledger.js.
export const TRAINING_COLUMNS = [
  "Name", "status", "baseModel", "localModel", "lastExportAt", "lastExportId", "lastSourceId", "lastExportSummary", "description",
];

export const TRAINING_EXPORT_SUMMARY = {
  recordCount: 4,
  surfaces: { helper: 2, selfEval: 1, swarm: 1 },
  escalations: 1,
  rewardMean: 0.82,
  path: "~/growthub-worker-kit-exports/training/feature-seed.jsonl",
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
    status: "exported",
    baseModel: "gemma3",
    localModel: "gemma3:4b",
    lastExportAt: SEED_TIMESTAMP,
    lastExportId: "exp_feature_seed_baseline",
    lastSourceId: "training:model-training:workspace-local",
    lastExportSummary: JSON.stringify(TRAINING_EXPORT_SUMMARY),
    description: "Feature-work seed — continued-training ledger baseline.",
  }],
  binding: { mode: "manual", source: "Model Training" },
  relations: [],
  fieldSettings: { hidden: [], order: TRAINING_COLUMNS },
};

export const TRACES_COLUMNS = ["sessionDate", "inputPrompt", "agentOutput", "qualityScore", "reason", "exported"];
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

// Enrich the ledger row to the post-fine-tune linked state (identity chain).
Object.assign(TRAINING_OBJECT.rows[0], {
  status: "verified",
  localModel: MODEL_TUNED_TAG,
  modelVersion: "ft-2026-06-10-v1",
  apiRegistryId: MODEL_REGISTRY_ID,
  deployedEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
  lastSandboxObjectId: "sandbox-probe",
  lastSandboxRunId: "run_seed_model_smoke",
  lastExportSummary: JSON.stringify({ ...TRAINING_EXPORT_SUMMARY, registryId: MODEL_REGISTRY_ID, version: 1 }),
});

export const SEED_CANVAS_WIDGETS = [
  { id: "widget-ops-notes", kind: "rich-text", title: "Ops Notes", position: { x: 0, y: 0, w: 4, h: 4 }, config: { text: "Feature-work seed ready.", binding: { mode: "manual", source: "Manual text", rows: [] } } },
  { id: "widget-registry-view", kind: "view", title: "API Registry", position: { x: 4, y: 0, w: 5, h: 4 }, sourceObjectId: "api-registry-probe", config: { source: "API Registry", layout: "Table", columns: ["integrationId", "status", "endpoint"], rows: [{ integrationId: PRIMARY_REGISTRY_ID, status: "connected", endpoint: "/run" }], binding: { mode: "manual", source: "API Registry", rows: [] } } },
  { id: "widget-delivery-health", kind: "chart", title: "Delivery Health", position: { x: 9, y: 0, w: 3, h: 4 }, config: { values: [72, 64, 81, 58, 76], binding: { mode: "manual", source: "Manual values", rows: [] } } },
];

export const SEED_SOURCE_RECORDS = {
  [DATA_SOURCE_OBJECT_ID]: { recordCount: 1, fetchedAt: SEED_TIMESTAMP, records: [{ id: "rec-1", label: "Probe record", registryId: PRIMARY_REGISTRY_ID }] },
  [DATA_SOURCE_SOURCE_ID]: { recordCount: 1, fetchedAt: SEED_TIMESTAMP, records: [{ id: "rec-1", label: "Probe record" }] },
  // Continued-training export ledger entry — same sidecar key discipline as
  // helper:apply:receipts and sandbox:<objectId>:<slug>.
  "model-invocation:workspace-local-model:seed": {
    recordCount: 1,
    fetchedAt: SEED_TIMESTAMP,
    records: [{
      invocationId: "inv_seed_1",
      registryId: "workspace-local-model",
      modelVersion: "ft-2026-06-10-v1",
      status: 200,
      response: JSON.parse(MODEL_INVOCATION_RESPONSE),
      note: "Seed QA evidence — replace with real test-source proof for production claims.",
    }],
  },
  "training:model-training:workspace-local": {
    recordCount: 1,
    fetchedAt: SEED_TIMESTAMP,
    records: [{
      exportId: "exp_feature_seed_baseline",
      at: SEED_TIMESTAMP,
      modelId: "gemma3:4b",
      ...TRAINING_EXPORT_SUMMARY,
    }],
  },
};

export function buildFeatureWorkspaceSeed(baseConfig = {}) {
  const dashboards = [{
    id: "Workspace Seed Starter",
    name: "Ops Overview",
    createdBy: "Workspace owner",
    updatedAt: "seeded",
    status: "active",
    activeTabId: "main",
    tabs: [{ id: "main", name: "Main", widgets: SEED_CANVAS_WIDGETS }],
  }];
  return {
    workspaceConfig: {
      ...baseConfig,
      dashboards,
      canvas: { ...(baseConfig.canvas || {}), widgets: SEED_CANVAS_WIDGETS },
      dataModel: { objects: [API_REGISTRY_OBJECT, DATA_SOURCE_OBJECT, SANDBOX_OBJECT, HELPER_SANDBOX_OBJECT, TRAINING_OBJECT, TRACES_OBJECT] },
    },
    sourceRecords: SEED_SOURCE_RECORDS,
    envLocal: SEED_ENV_LOCAL,
  };
}

function primaryRegistryRow(workspaceConfig) {
  const object = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === API_REGISTRY_OBJECT.id);
  return (Array.isArray(object?.rows) ? object.rows : []).find((r) => String(r?.integrationId || "").trim() === PRIMARY_REGISTRY_ID) || null;
}

export async function validateFeatureWorkspaceSeed(appDir, workspaceConfig, sourceRecords) {
  const libDir = path.join(appDir, "lib");
  const schema = await import(pathToFileURL(path.join(libDir, "workspace-schema.js")).href);
  const activation = await import(pathToFileURL(path.join(libDir, "workspace-activation.js")).href);
  const creation = await import(pathToFileURL(path.join(libDir, "api-registry-creation-flow.js")).href);
  const envStatus = await import(pathToFileURL(path.join(libDir, "env-status.js")).href);

  schema.validateWorkspaceConfig({
    dashboards: workspaceConfig.dashboards,
    canvas: workspaceConfig.canvas,
    dataModel: workspaceConfig.dataModel,
  });

  const activationState = activation.deriveWorkspaceActivationState({ workspaceConfig });
  if (!activationState.complete) {
    const pending = activationState.steps.filter((s) => s.status !== "complete").map((s) => `${s.id}(${s.status})`).join(", ");
    throw new Error(`activation incomplete ${activationState.completedCount}/${activationState.totalCount}: ${pending}`);
  }

  const registryRow = primaryRegistryRow(workspaceConfig);
  if (!registryRow) throw new Error(`missing registry row ${PRIMARY_REGISTRY_ID}`);

  const configuredEnvRefs = envStatus.computeConfiguredEnvRefs(workspaceConfig, { PROBE_SCHEDULER: "feature-seed-stub" });
  const cockpit = creation.deriveApiRegistryCreationState({
    workspaceConfig,
    registryRow,
    sourceRecords,
    runtime: { configuredEnvRefs },
  });

  for (const id of ["register", "auth", "test", "data-source", "refresh"]) {
    const step = cockpit.steps.find((s) => s.id === id);
    if (!step || step.status !== "complete") {
      throw new Error(`cockpit step "${id}" is ${step?.status || "missing"} (expected complete)`);
    }
  }
  if (!cockpit.complete) throw new Error(`cockpit incomplete; score=${cockpit.score}`);

  return { activationState, cockpit, configuredEnvRefs };
}
