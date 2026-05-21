/**
 * Governed orchestrationGraph field contract (sandbox-environment row).
 * V1: growthub-native declarative run plan. Execution: POST /api/workspace/sandbox-run only.
 */

const TRUSTED_API_STATUSES = ["connected", "approved", "ok", "success"];
const SUPPORTED_PROVIDERS_V1 = new Set(["growthub-native", "custom-webhook"]);

const FILTER_OPERATORS = ["eq", "ne", "contains", "gt", "lt", "isEmpty", "isNotEmpty"];
const FILTER_CONJUNCTIONS = ["and", "or"];

const KNOWN_NODE_TYPES = new Set([
  "input",
  "api-registry-call",
  "transform-filter",
  "normalize-output",
  "tool-result",
  "sandbox-adapter",
  "custom-webhook"
]);

const API_REGISTRY_SETUP_FIELDS = ["integrationId", "baseUrl", "endpoint", "method", "authRef"];

const CANONICAL_NODE_ORDER = ["input", "api-request", "transform", "result"];

function slugifyName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseOrchestrationGraph(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function serializeOrchestrationGraph(graph) {
  if (!graph || typeof graph !== "object") return "";
  return JSON.stringify(graph, null, 2);
}

function isApiRegistryTestSuccessful(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  return TRUSTED_API_STATUSES.includes(status);
}

function getApiRegistrySetupChecklist(registryRow) {
  const row = registryRow || {};
  return API_REGISTRY_SETUP_FIELDS.map((field) => {
    const value = String(row[field] ?? "").trim();
    const ok = field === "baseUrl" || field === "endpoint"
      ? Boolean(String(row.baseUrl || "").trim() || String(row.endpoint || "").trim())
      : Boolean(value);
    return { field, ok, value: field === "method" ? (value || "GET") : value };
  });
}

function isApiRegistrySetupComplete(registryRow) {
  return getApiRegistrySetupChecklist(registryRow).every((item) => item.ok);
}

/**
 * Sidecar action state for API Registry → sandbox tool bridge (UI only).
 */
function getApiRegistrySandboxToolState(registryRow, workspaceConfig) {
  if (!isApiRegistrySetupComplete(registryRow)) {
    return { kind: "incomplete", checklist: getApiRegistrySetupChecklist(registryRow) };
  }
  if (!isApiRegistryTestSuccessful(registryRow)) {
    const status = String(registryRow?.status || "").trim().toLowerCase();
    if (status === "failed") {
      return {
        kind: "failed",
        message: "Connection test failed. Fix the endpoint or auth reference, then test again."
      };
    }
    return {
      kind: "untested",
      message: "Test connection first. Sandbox tool creation unlocks after a successful test."
    };
  }
  const integrationId = String(registryRow?.integrationId || "").trim();
  const existing = findSandboxRowsForRegistry(workspaceConfig, integrationId);
  if (existing.length > 0) {
    return { kind: "existing", row: existing[0] };
  }
  return { kind: "create" };
}

function validateOrchestrationGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object") {
    return { ok: false, errors: ["orchestrationGraph must be an object"] };
  }
  const version = Number(graph.version);
  if (!Number.isFinite(version) || version < 1) {
    errors.push("orchestrationGraph.version must be a positive number");
  }
  const provider = String(graph.provider || "").trim();
  if (!provider) {
    errors.push("orchestrationGraph.provider is required");
  }
  if (!Array.isArray(graph.nodes) || !graph.nodes.length) {
    errors.push("orchestrationGraph.nodes must be a non-empty array");
  } else {
    const ids = new Set();
    graph.nodes.forEach((node, index) => {
      const prefix = `nodes[${index}]`;
      if (!node || typeof node !== "object") {
        errors.push(`${prefix} must be an object`);
        return;
      }
      const id = String(node.id || "").trim();
      if (!id) errors.push(`${prefix}.id is required`);
      else if (ids.has(id)) errors.push(`${prefix}.id duplicates "${id}"`);
      else ids.add(id);
      const type = String(node.type || "").trim();
      if (!KNOWN_NODE_TYPES.has(type)) {
        errors.push(`${prefix}.type "${type}" is not a known node type`);
      }
    });
    const hasApi = graph.nodes.some((n) => n?.type === "api-registry-call");
    const hasResult = graph.nodes.some((n) => n?.type === "tool-result");
    if (!hasApi) errors.push("orchestrationGraph requires an api-registry-call node");
    if (!hasResult) errors.push("orchestrationGraph requires a tool-result node");
  }
  if (!Array.isArray(graph.edges)) {
    errors.push("orchestrationGraph.edges must be an array");
  } else {
    graph.edges.forEach((edge, index) => {
      if (!edge || typeof edge !== "object") {
        errors.push(`edges[${index}] must be an object`);
        return;
      }
      if (!String(edge.from || "").trim() || !String(edge.to || "").trim()) {
        errors.push(`edges[${index}] requires from and to`);
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

function summarizeOrchestrationGraph(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes?.length) return "No orchestration graph";
  const ordered = orderedGraphNodes(parsed);
  return ordered.map((n) => String(n.label || n.id || "").trim()).filter(Boolean).join(" → ");
}

function buildDefaultOrchestrationGraphFromRegistry(registryRow, options = {}) {
  const integrationId = String(registryRow?.integrationId || registryRow?.Name || "").trim();
  const label = String(options.label || registryRow?.Name || integrationId || "API").trim();
  const method = String(options.method || registryRow?.method || "GET").trim().toUpperCase();
  const endpoint = String(options.endpoint || registryRow?.endpoint || "").trim();
  const baseUrl = String(registryRow?.baseUrl || "").trim();
  const authRef = String(options.authRef || registryRow?.authRef || integrationId).trim();
  const rootPath = String(options.rootPath || "data").trim();

  return {
    version: 1,
    provider: "growthub-native",
    nodes: [
      {
        id: "input",
        type: "input",
        label: "Input",
        subtitle: "Manual run payload",
        config: {
          inputMode: "manual",
          samplePayload: {},
          sourceType: "",
          sourceId: "",
          entityId: "",
          filterMode: "and",
          filters: []
        }
      },
      {
        id: "api-request",
        type: "api-registry-call",
        label: "API Registry",
        subtitle: `${integrationId} · ${method} ${endpoint}`,
        config: {
          registryId: integrationId,
          integrationId,
          baseUrl,
          endpoint,
          method,
          authRef,
          queryParams: {},
          bodyTemplate: "",
          requestHeadersMetadata: {
            authHeaderName: String(registryRow?.authHeaderName || registryRow?.authHeader || "x-api-key").trim(),
            authPrefix: String(registryRow?.authPrefix || "").trim(),
            contentType: method === "GET" ? "" : "application/json"
          },
          timeoutMs: Number(options.timeoutMs) || 30000
        }
      },
      {
        id: "transform",
        type: "transform-filter",
        label: "Transform",
        subtitle: "Map fields and apply filters",
        config: {
          rootPath,
          mode: "json",
          fieldMap: {},
          includeFields: [],
          excludeFields: [],
          computedFields: {},
          filters: [],
          filterMode: "and",
          maxRows: 0
        }
      },
      {
        id: "result",
        type: "tool-result",
        label: "Result",
        subtitle: "Save run output",
        config: {
          successStatusCodes: [200],
          writeLastResponse: true,
          writeSourceRecord: true,
          sourceRecordId: "",
          outputMode: "normalized-json",
          previewFields: [],
          statusField: "status",
          lastTestedField: "lastTested"
        }
      }
    ],
    edges: [
      { from: "input", to: "api-request", passes: "payload, filters, variables" },
      { from: "api-request", to: "transform", passes: "provider-response" },
      { from: "transform", to: "result", passes: "normalized-output" }
    ]
  };
}

function updateGraphNode(graph, nodeId, configPatch) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes) return parsed;
  const id = String(nodeId || "").trim();
  return {
    ...parsed,
    nodes: parsed.nodes.map((node) => {
      if (String(node.id) !== id) return node;
      return {
        ...node,
        config: { ...(node.config || {}), ...(configPatch || {}) }
      };
    })
  };
}

function findSandboxObject(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.find((o) => o?.objectType === "sandbox-environment") || null;
}

function findSandboxRowsForRegistry(workspaceConfig, integrationId) {
  const id = String(integrationId || "").trim();
  if (!id) return [];
  const sandboxObject = findSandboxObject(workspaceConfig);
  if (!sandboxObject) return [];
  const rows = Array.isArray(sandboxObject.rows) ? sandboxObject.rows : [];
  return rows.filter((row) => {
    const graph = parseOrchestrationGraph(row?.orchestrationGraph);
    if (!graph?.nodes) return String(row?.schedulerRegistryId || "").trim() === id;
    return graph.nodes.some(
      (node) => node?.type === "api-registry-call"
        && String(node?.config?.registryId || node?.config?.integrationId || "").trim() === id
    );
  });
}

function buildSandboxRowFromApiRegistry(workspaceConfig, registryRow, options = {}) {
  const integrationId = String(registryRow?.integrationId || "").trim();
  const baseName = String(options.name || registryRow?.Name || integrationId || "Sandbox Tool").trim();
  const name = baseName.endsWith(" Tool") ? baseName : `${baseName} Tool`;
  const runLocality = String(options.runLocality || "local").trim() === "serverless" ? "serverless" : "local";
  const adapter = String(options.adapter || (runLocality === "serverless" ? "serverless" : "local-process")).trim();
  const graph = options.orchestrationGraph
    ? (typeof options.orchestrationGraph === "string"
      ? parseOrchestrationGraph(options.orchestrationGraph)
      : options.orchestrationGraph)
    : buildDefaultOrchestrationGraphFromRegistry(registryRow, options);

  const apiNode = graph?.nodes?.find((n) => n?.type === "api-registry-call");
  const authRef = String(options.authRef || apiNode?.config?.authRef || registryRow?.authRef || integrationId).trim();
  const transformNode = graph?.nodes?.find((n) => n?.type === "transform-filter" || n?.type === "normalize-output");
  const rootPath = transformNode?.config?.rootPath || "data";
  const method = String(registryRow?.method || apiNode?.config?.method || "GET").trim().toUpperCase();
  const endpoint = String(registryRow?.endpoint || apiNode?.config?.endpoint || "").trim();
  const baseUrl = String(registryRow?.baseUrl || apiNode?.config?.baseUrl || "").trim();

  return {
    Name: name,
    slug: options.slug || slugifyName(name) || slugifyName(integrationId),
    objectType: "sandbox-environment",
    lifecycleStatus: "draft",
    version: "1",
    runLocality,
    schedulerRegistryId: runLocality === "serverless" ? integrationId : "",
    runtime: String(options.runtime || "node").trim(),
    adapter,
    agentHost: String(options.agentHost || "").trim(),
    envRefs: Array.isArray(options.envRefs) ? options.envRefs.join(",") : String(options.envRefs || "").trim(),
    networkAllow: options.networkAllow === true ? "true" : "",
    allowList: String(options.allowList || "").trim(),
    instructions: String(
      options.instructions
        || `Governed sandbox tool for ${integrationId}. Calls ${method} ${endpoint || baseUrl} and normalizes at "${rootPath}". authRef ${authRef} only — secrets resolve server-side.`
    ).trim(),
    command: String(options.command || "").trim(),
    timeoutMs: String(options.timeoutMs || "30000").trim(),
    status: "untested",
    lastTested: "",
    lastRunId: "",
    lastSourceId: "",
    lastResponse: "",
    orchestrationGraph: serializeOrchestrationGraph(graph),
    description: String(options.description || registryRow?.description || "").trim()
  };
}

function extractNodeByType(graph, type) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes) return null;
  return parsed.nodes.find((n) => n?.type === type) || null;
}

function extractApiRegistryCallNode(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes) return null;
  return parsed.nodes.find((n) => n?.type === "api-registry-call") || null;
}

function extractInputNode(graph) {
  return extractNodeByType(graph, "input");
}

function extractTransformConfig(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  const node = parsed?.nodes?.find((n) => n?.type === "transform-filter" || n?.type === "normalize-output");
  return node?.config || { mode: "json", rootPath: "data", fieldMap: {}, filters: [] };
}

/** @deprecated use extractTransformConfig */
function extractNormalizeConfig(graph) {
  return extractTransformConfig(graph);
}

function getValueAtPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).split(".").filter(Boolean);
  let cursor = obj;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function normalizeJsonAtPath(payload, rootPath) {
  const cursor = rootPath ? getValueAtPath(payload, rootPath) : payload;
  if (cursor == null) {
    return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  }
  return typeof cursor === "string" ? cursor : JSON.stringify(cursor, null, 2);
}

function applyFieldMap(payload, fieldMap) {
  if (!fieldMap || typeof fieldMap !== "object" || !Object.keys(fieldMap).length) {
    return payload;
  }
  const source = payload && typeof payload === "object" ? payload : {};
  const out = {};
  for (const [target, sourcePath] of Object.entries(fieldMap)) {
    out[target] = getValueAtPath(source, String(sourcePath || ""));
  }
  return out;
}

function rowMatchesFilter(row, clause) {
  const fieldId = String(clause?.fieldId || "").trim();
  const op = String(clause?.operator || "eq").trim();
  const expected = clause?.value;
  const raw = row && typeof row === "object" ? row[fieldId] : undefined;
  const value = raw == null ? "" : String(raw);
  switch (op) {
    case "eq":
      return value === String(expected ?? "");
    case "ne":
      return value !== String(expected ?? "");
    case "contains":
      return value.toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "gt":
      return Number(value) > Number(expected);
    case "lt":
      return Number(value) < Number(expected);
    case "isEmpty":
      return value === "";
    case "isNotEmpty":
      return value !== "";
    default:
      return true;
  }
}

function applyFilters(rows, filters, filterMode = "and") {
  if (!Array.isArray(rows) || !Array.isArray(filters) || !filters.length) return rows;
  const mode = String(filterMode || "and").toLowerCase() === "or" ? "or" : "and";
  return rows.filter((row) => {
    const results = filters.map((clause) => rowMatchesFilter(row, clause));
    return mode === "or" ? results.some(Boolean) : results.every(Boolean);
  });
}

function substituteVariables(template, inputPayload) {
  const text = String(template || "");
  if (!text.includes("{{")) return text;
  const input = inputPayload && typeof inputPayload === "object" ? inputPayload : {};
  return text.replace(/\{\{input\.([a-zA-Z0-9_.]+)\}\}/g, (_, key) => {
    const val = getValueAtPath(input, key);
    return val == null ? "" : String(val);
  });
}

function orderedGraphNodes(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes?.length) return [];
  const byId = new Map(parsed.nodes.map((n) => [String(n.id), n]));
  const ordered = [];
  for (const id of CANONICAL_NODE_ORDER) {
    if (byId.has(id)) ordered.push(byId.get(id));
  }
  const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
  const incoming = new Map();
  parsed.nodes.forEach((n) => incoming.set(String(n.id), 0));
  edges.forEach((e) => {
    const to = String(e.to || "");
    if (incoming.has(to)) incoming.set(to, (incoming.get(to) || 0) + 1);
  });
  const seen = new Set(ordered.map((n) => String(n.id)));
  function walk(node) {
    const id = String(node?.id || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(node);
    edges.filter((e) => String(e.from) === id).forEach((e) => {
      const next = byId.get(String(e.to));
      if (next) walk(next);
    });
  }
  parsed.nodes.filter((n) => !incoming.get(String(n.id))).forEach(walk);
  parsed.nodes.forEach((n) => {
    if (!seen.has(String(n.id))) ordered.push(n);
  });
  return ordered;
}

function redactSecretsFromText(text) {
  let out = String(text || "");
  for (const pattern of [
    /(Bearer\s+)[^\s"']+/gi,
    /(api[_-]?key["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
    /(token["']?\s*[:=]\s*)["']?[^\s"',}]+/gi
  ]) {
    out = out.replace(pattern, "$1[redacted]");
  }
  return out;
}

export {
  API_REGISTRY_SETUP_FIELDS,
  TRUSTED_API_STATUSES,
  SUPPORTED_PROVIDERS_V1,
  FILTER_OPERATORS,
  FILTER_CONJUNCTIONS,
  CANONICAL_NODE_ORDER,
  buildDefaultOrchestrationGraphFromRegistry,
  buildSandboxRowFromApiRegistry,
  extractApiRegistryCallNode,
  extractInputNode,
  extractTransformConfig,
  extractNormalizeConfig,
  findSandboxObject,
  findSandboxRowsForRegistry,
  getApiRegistrySetupChecklist,
  getApiRegistrySandboxToolState,
  isApiRegistrySetupComplete,
  isApiRegistryTestSuccessful,
  normalizeJsonAtPath,
  applyFieldMap,
  applyFilters,
  substituteVariables,
  orderedGraphNodes,
  parseOrchestrationGraph,
  serializeOrchestrationGraph,
  slugifyName,
  summarizeOrchestrationGraph,
  updateGraphNode,
  validateOrchestrationGraph,
  redactSecretsFromText
};
