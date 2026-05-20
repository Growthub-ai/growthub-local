/**
 * Client-safe field contracts for governed Data Model rows.
 * Maps objectType + field → editor kind and static hints (no secrets).
 */

const TRUSTED_STATUSES = ["connected", "approved", "ok", "success"];

const SANDBOX_ENVIRONMENT_FIELDS = {
  runLocality: {
    editor: "segmented-toggle",
    options: ["local", "serverless"]
  },
  networkAllow: { editor: "boolean-toggle" },
  lifecycleStatus: {
    editor: "select",
    options: ["draft", "live"]
  },
  runtime: {
    editor: "select",
    options: ["python", "node", "bash"]
  },
  schedulerRegistryId: {
    editor: "reference",
    targetObjectType: "api-registry",
    valueField: "integrationId",
    statusAllowlist: TRUSTED_STATUSES
  },
  envRefs: { editor: "env-ref-multiselect" },
  lastResponse: { editor: "json-preview", readonly: true },
  orchestrationGraph: { editor: "orchestration-graph", readonly: true },
  lastRunId: { editor: "readonly-text" },
  lastSourceId: { editor: "readonly-text" },
  resolverTemplateId: { editor: "readonly-text" },
  connectorKind: { editor: "readonly-text" },
  executionLane: { editor: "readonly-text" }
};

const API_REGISTRY_FIELDS = {
  method: {
    editor: "select",
    options: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  },
  status: { editor: "status-pill" },
  lastResponse: { editor: "json-preview", readonly: true },
  connectorKind: { editor: "text" },
  resolverTemplateId: { editor: "text" },
  schemaVersion: { editor: "text" },
  capabilities: { editor: "text" },
  executionLane: { editor: "text" }
};

const DATA_SOURCE_FIELDS = {
  registryId: {
    editor: "reference",
    targetObjectType: "api-registry",
    valueField: "integrationId",
    statusAllowlist: null
  },
  status: { editor: "status-pill" },
  lastResponse: { editor: "json-preview", readonly: true },
  sourceStorage: {
    editor: "select",
    options: ["", "workspace-source-records"]
  },
  entityType: { editor: "text" },
  sourceId: { editor: "text" },
  resolverTemplateId: { editor: "text" }
};

const BY_OBJECT_TYPE = {
  "sandbox-environment": SANDBOX_ENVIRONMENT_FIELDS,
  "api-registry": API_REGISTRY_FIELDS,
  "data-source": DATA_SOURCE_FIELDS
};

function getFieldContract(objectType, fieldName) {
  const table = BY_OBJECT_TYPE[objectType];
  if (!table || !fieldName) return null;
  return table[fieldName] || null;
}

export { TRUSTED_STATUSES, getFieldContract, BY_OBJECT_TYPE };
