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
  "browserMode", "requiresBrowser",
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

/**
 * Browser / local agent fast lane — safe smoke fixture.
 *
 * Deterministic dry-run: reads the runner-safe manual inputs from
 * GROWTHUB_RUN_INPUTS_JSON (exposed by sandbox-run for local rows) and emits
 * an honest browser-proof envelope with reachedTarget:false / fallbackUsed:true.
 * It never opens a browser, never touches an external platform, and never
 * fakes proof — the live super-admin smoke replaces the command with a real
 * operator-approved browser script on the machine that owns the session.
 */
export const BROWSER_SMOKE_COMMAND = [
  "const inputs = JSON.parse(process.env.GROWTHUB_RUN_INPUTS_JSON || \"{}\");",
  "const proof = {",
  "  browser: {",
  "    platform: String(inputs.platform || \"\"),",
  "    targetUrl: String(inputs.targetUrl || inputs.notebookUrl || \"\"),",
  "    initialUrl: String(inputs.initialUrl || \"\"),",
  "    currentUrl: \"\",",
  "    title: \"\",",
  "    reachedTarget: false,",
  "    browserExitCode: 0,",
  "    stderr: \"\"",
  "  },",
  "  artifact: null,",
  "  fallbackUsed: true,",
  "  note: \"dry-run smoke - no live browser session in this environment\"",
  "};",
  "console.log(JSON.stringify(proof, null, 2));",
].join("\n");

export const BROWSER_SMOKE_RUN_INPUTS = {
  kind: "growthub-workflow-run-inputs-v1",
  source: "manual-browser-fastlane",
  values: {
    platform: "notebooklm",
    targetName: "The Melting Bar",
    targetUrl: "https://notebooklm.google.com/notebook/example",
    initialUrl: "https://medium.com/example",
    outputFormat: "docx",
    sendMode: "read-only",
    operatorApproved: true,
  },
  files: [],
};

export const BROWSER_SMOKE_SANDBOX_ROW = {
  Name: "browser-agent-smoke",
  lifecycleStatus: "draft",
  version: "1",
  runLocality: "local",
  schedulerRegistryId: "",
  runtime: "node",
  adapter: "local-process",
  agentHost: "",
  envRefs: "",
  networkAllow: "true",
  allowList: "notebooklm.google.com,linkedin.com,medium.com",
  instructions: "Run a safe browser/local-agent smoke using runInputs. Do not mutate external systems.",
  command: BROWSER_SMOKE_COMMAND,
  timeoutMs: "120000",
  status: "",
  lastTested: "",
  lastRunId: "",
  lastSourceId: "",
  lastResponse: "",
  resolverTemplateId: "",
  connectorKind: "",
  executionLane: "sandbox-local",
  browserMode: "operator-approved",
  requiresBrowser: "true",
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
    BROWSER_SMOKE_SANDBOX_ROW,
  ],
  binding: { mode: "manual", source: "Data Model" },
  relations: [SCHEDULER_RELATION],
  fieldSettings: { hidden: [], order: SANDBOX_COLUMNS },
};

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

export const SEED_CANVAS_WIDGETS = [
  { id: "widget-ops-notes", kind: "rich-text", title: "Ops Notes", position: { x: 0, y: 0, w: 4, h: 4 }, config: { text: "Feature-work seed ready.", binding: { mode: "manual", source: "Manual text", rows: [] } } },
  { id: "widget-registry-view", kind: "view", title: "API Registry", position: { x: 4, y: 0, w: 5, h: 4 }, sourceObjectId: "api-registry-probe", config: { source: "API Registry", layout: "Table", columns: ["integrationId", "status", "endpoint"], rows: [{ integrationId: PRIMARY_REGISTRY_ID, status: "connected", endpoint: "/run" }], binding: { mode: "manual", source: "API Registry", rows: [] } } },
  { id: "widget-delivery-health", kind: "chart", title: "Delivery Health", position: { x: 9, y: 0, w: 3, h: 4 }, config: { values: [72, 64, 81, 58, 76], binding: { mode: "manual", source: "Manual values", rows: [] } } },
];

export const SEED_SOURCE_RECORDS = {
  [DATA_SOURCE_OBJECT_ID]: { recordCount: 1, fetchedAt: SEED_TIMESTAMP, records: [{ id: "rec-1", label: "Probe record", registryId: PRIMARY_REGISTRY_ID }] },
  [DATA_SOURCE_SOURCE_ID]: { recordCount: 1, fetchedAt: SEED_TIMESTAMP, records: [{ id: "rec-1", label: "Probe record" }] },
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
      dataModel: { objects: [API_REGISTRY_OBJECT, DATA_SOURCE_OBJECT, SANDBOX_OBJECT, HELPER_SANDBOX_OBJECT] },
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
