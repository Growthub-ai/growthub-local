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
  "custom-webhook",
  "thinAdapter",
  "data-trigger",
  "data-action",
  "ai-agent",
  "flow-control",
  "core-action",
  "human-input"
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
  if (typeof value === "object" && !Array.isArray(value)) return normalizeOrchestrationGraphShape(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? normalizeOrchestrationGraphShape(parsed)
      : null;
  } catch {
    return null;
  }
}

function normalizeOrchestrationGraphShape(graph) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) return null;
  if (graph.graph && typeof graph.graph === "object" && !Array.isArray(graph.graph)) {
    return {
      ...graph.graph,
      version: graph.graph.version || graph.version || 1,
      provider: graph.graph.provider || graph.provider || "growthub-native"
    };
  }
  return graph;
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
    if (isAgentSwarmGraph(graph)) {
      const swarmCheck = validateAgentSwarmGraph(graph);
      if (!swarmCheck.ok) errors.push(...swarmCheck.errors);
    } else {
      const hasThinAdapter = graph.nodes.some((n) => n?.type === "thinAdapter");
      const hasApi = graph.nodes.some((n) => n?.type === "api-registry-call");
      const hasResult = graph.nodes.some((n) => n?.type === "tool-result");
      if (!hasThinAdapter && !hasApi) errors.push("orchestrationGraph requires an api-registry-call node");
      if (!hasThinAdapter && !hasResult) errors.push("orchestrationGraph requires a tool-result node");
    }
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
        subtitle: "Manual or source payload",
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
        subtitle: "Save status and response",
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
    const graph = parseOrchestrationGraph(row?.orchestrationConfig || row?.orchestrationGraph);
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
    orchestrationConfig: serializeOrchestrationGraph(graph),
    description: String(options.description || registryRow?.description || "").trim()
  };
}

/**
 * Find existing data-source rows that already resolve through a given API
 * Registry integration (by `registryId`). Mirrors findSandboxRowsForRegistry so
 * the drawer can refuse to create a duplicate Data Source for the same API.
 */
function findDataSourceRowsForRegistry(workspaceConfig, integrationId) {
  const id = String(integrationId || "").trim();
  if (!id) return [];
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rows = [];
  for (const object of objects) {
    if (object?.objectType !== "data-source") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (String(row?.registryId || "").trim() === id) rows.push(row);
    }
  }
  return rows;
}

/**
 * Build a governed Data Source row from a tested API Registry row. The Data
 * Source references the registry entry by `registryId` (the existing
 * resolver-binding relation) and keeps auth as an `authRef` slug only — the
 * secret never lands on the row. Shape matches the OBJECT_TYPE_PRESETS
 * "data-source" columns so it slots straight into the data-source table.
 */
function buildDataSourceRowFromApiRegistry(workspaceConfig, registryRow, options = {}) {
  const integrationId = String(registryRow?.integrationId || "").trim();
  const baseName = String(options.name || registryRow?.Name || integrationId || "Data Source").trim();
  const name = baseName.endsWith(" Source") ? baseName : `${baseName} Source`;
  const entityType = String(
    options.entityType || registryRow?.entityTypes || "records"
  ).split(",")[0].trim() || "records";
  const sourceId = String(
    options.sourceId || slugifyName(`${integrationId || baseName}-${entityType}`) || slugifyName(baseName)
  ).trim();
  const sourceStorage = String(options.sourceStorage || "workspace-source-records").trim();
  return {
    Name: name,
    slug: options.slug || slugifyName(name) || slugifyName(integrationId),
    objectType: "data-source",
    registryId: integrationId,
    endpoint: String(registryRow?.endpoint || "").trim(),
    authRef: String(options.authRef || registryRow?.authRef || integrationId).trim(),
    baseUrl: String(registryRow?.baseUrl || "").trim(),
    method: String(registryRow?.method || "GET").trim().toUpperCase(),
    status: "draft",
    lastTested: "",
    lastResponse: "",
    entityType,
    sourceId,
    sourceStorage,
    resolverTemplateId: String(options.resolverTemplateId || registryRow?.resolverTemplateId || "").trim(),
    description: String(
      options.description
        || registryRow?.description
        || `Data Source for ${integrationId || baseName} — resolves ${entityType} through the API Registry resolver. authRef ${String(options.authRef || registryRow?.authRef || integrationId).trim()} only; secrets resolve server-side.`
    ).trim()
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
  const config = node?.config || { mode: "json", rootPath: "data", fieldMap: {}, filters: [] };
  const mode = config.responseMode || config.mode || "json";
  return { ...config, mode, responseMode: mode };
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

function collectFieldIdsFromValue(value, prefix = "", out = new Set(), depth = 0) {
  if (depth > 4 || value == null) return out;
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, index) => {
      collectFieldIdsFromValue(item, prefix ? `${prefix}.${index}` : String(index), out, depth + 1);
    });
    return out;
  }
  if (typeof value === "object") {
    Object.keys(value).forEach((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(path);
      collectFieldIdsFromValue(value[key], path, out, depth + 1);
    });
  }
  return out;
}

function detectFieldIdsFromLastResponse(lastResponse) {
  const text = String(lastResponse || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    const payload = parsed?.response ?? parsed?.data ?? parsed;
    return Array.from(collectFieldIdsFromValue(payload)).sort();
  } catch {
    return [];
  }
}

function isOrchestrationGraphEmpty(value) {
  const graph = typeof value === "string" ? parseOrchestrationGraph(value) : value;
  if (!graph || typeof graph !== "object") return true;
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) return true;
  return false;
}

/** unset = no graph yet; blank-shell = valid shell with zero nodes; populated = has nodes */
function getOrchestrationGraphUiState(value) {
  const text = typeof value === "string" ? String(value || "").trim() : "";
  const graph = typeof value === "string" ? parseOrchestrationGraph(value) : value;
  if (!graph || typeof graph !== "object") {
    return text ? "unset" : "unset";
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) return "blank-shell";
  return "populated";
}

function buildBlankOrchestrationGraphShell() {
  return {
    version: 1,
    provider: "growthub-native",
    nodes: [],
    edges: []
  };
}

function buildCanonicalNode(nodeId, registryRow = {}, options = {}) {
  const integrationId = String(registryRow?.integrationId || registryRow?.Name || "").trim();
  const method = String(registryRow?.method || "GET").trim().toUpperCase();
  const endpoint = String(registryRow?.endpoint || "").trim();
  const baseUrl = String(registryRow?.baseUrl || "").trim();
  const authRef = String(options.authRef || registryRow?.authRef || integrationId).trim();
  const rootPath = String(options.rootPath || "data").trim();

  switch (nodeId) {
    case "input":
      return {
        id: "input",
        type: "input",
        label: "Input",
        subtitle: "Manual or source payload",
        config: {
          inputMode: "manual",
          samplePayload: {},
          sourceType: "",
          sourceId: "",
          entityId: "",
          filterMode: "and",
          filters: []
        }
      };
    case "api-request":
      return {
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
          timeoutMs: 30000
        }
      };
    case "transform":
      return {
        id: "transform",
        type: "transform-filter",
        label: "Transform",
        subtitle: "Map fields and filter rows",
        config: {
          rootPath,
          mode: "json",
          responseMode: "json",
          fieldMap: {},
          includeFields: [],
          excludeFields: [],
          computedFields: {},
          filters: [],
          filterMode: "and",
          maxRows: 0
        }
      };
    case "result":
      return {
        id: "result",
        type: "tool-result",
        label: "Result",
        subtitle: "Save status and response",
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
      };
    default:
      return null;
  }
}

function getNextCanonicalNodeId(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if ((parsed?.nodes || []).some((n) => n?.type === "thinAdapter")) return null;
  const ids = new Set((parsed?.nodes || []).map((n) => String(n.id)));
  for (const id of CANONICAL_NODE_ORDER) {
    if (!ids.has(id)) return id;
  }
  return null;
}

function addCanonicalNodeToGraph(graph, nodeId, registryRow, options = {}) {
  const parsed = parseOrchestrationGraph(graph) || graph || buildBlankOrchestrationGraphShell();
  const id = String(nodeId || "").trim();
  const nextExpected = getNextCanonicalNodeId(parsed);
  if (!id || id !== nextExpected) return parsed;
  const node = buildCanonicalNode(id, registryRow, options);
  if (!node) return parsed;
  const nodes = [...(parsed.nodes || []), node];
  const edges = [...(parsed.edges || [])];
  const order = CANONICAL_NODE_ORDER;
  const idx = order.indexOf(id);
  if (idx > 0) {
    const prev = order[idx - 1];
    if (nodes.some((n) => n.id === prev) && !edges.some((e) => e.from === prev && e.to === id)) {
      const passes = id === "api-request"
        ? "payload, filters, variables"
        : id === "transform"
          ? "provider-response"
          : id === "result"
            ? "normalized-output"
            : "";
      edges.push({ from: prev, to: id, passes });
    }
  }
  return { ...parsed, nodes, edges };
}

const AGENT_SWARM_EXECUTION_MODE = "agent-swarm-v1";

/**
 * Detect whether a graph is an agent-swarm-v1 control plane. Swarm graphs are
 * encoded as growthub-native graphs whose root carries
 * `executionMode: "agent-swarm-v1"` and that contain at least one orchestrator
 * (`thinAdapter`) or subagent (`ai-agent`) node.
 */
function isAgentSwarmGraph(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed || typeof parsed !== "object") return false;
  if (String(parsed.provider || "").trim() !== "growthub-native") return false;
  if (String(parsed.executionMode || "").trim() !== AGENT_SWARM_EXECUTION_MODE) return false;
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  if (!nodes.length) return false;
  return nodes.some((n) => n?.type === "thinAdapter" || n?.type === "ai-agent");
}

/**
 * Split a swarm graph into its semantic parts so the runtime and UI can reason
 * about it without re-walking the node list. Returns `null` when the graph is
 * not a recognized swarm.
 */
function extractSwarmNodes(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!isAgentSwarmGraph(parsed)) return null;
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const orchestrator = nodes.find((n) => n?.type === "thinAdapter") || null;
  const subagents = nodes.filter((n) => n?.type === "ai-agent");
  const synthesis = nodes.find((n) => n?.type === "tool-result") || null;
  const humanInputs = nodes.filter((n) => n?.type === "human-input");
  const flowControls = nodes.filter((n) => n?.type === "flow-control");
  const swarmConfig = (parsed.swarm && typeof parsed.swarm === "object" && !Array.isArray(parsed.swarm))
    ? parsed.swarm
    : {};
  return {
    graph: parsed,
    orchestrator,
    subagents,
    synthesis,
    humanInputs,
    flowControls,
    swarmConfig
  };
}

/**
 * Build the default scaffold for a new agent-swarm-v1 graph. The shape mirrors
 * the Kimi screenshots — an orchestrator, two specialized subagents, a
 * synthesis tool-result — but reuses existing node types so no schema change
 * is required.
 */
function buildDefaultAgentSwarmGraph(options = {}) {
  const agentHost = String(options.agentHost || "").trim();
  const subagents = Array.isArray(options.subagents) && options.subagents.length > 0
    ? options.subagents
    : [
        {
          id: "subagent-researcher",
          role: "Researcher",
          description: "Gathers facts from the run input and the orchestrator's plan.",
          taskPrompt: "Investigate the orchestrator's plan and gather the relevant facts.",
          tools: ["read", "summarize"],
          required: true
        },
        {
          id: "subagent-analyst",
          role: "Analyst",
          description: "Stress-tests assumptions and surfaces risks.",
          taskPrompt: "Identify risks, assumptions, and dependencies in the orchestrator's plan.",
          tools: ["read", "critique"],
          required: true
        }
      ];

  const nodes = [
    {
      id: "orchestrator",
      type: "thinAdapter",
      label: "Orchestrator",
      subtitle: "Plans subagent dispatch",
      sandbox: "orchestrator",
      config: {
        executionPolicy: "parallel",
        prompt: String(options.orchestratorPrompt || "Decompose the task into independent subtasks for the listed subagents.").trim(),
        inputBinding: "{{input.payload}}",
        outputKey: "plan"
      }
    },
    ...subagents.map((agent) => ({
      id: String(agent.id || agent.role || "subagent").replace(/[^a-zA-Z0-9_-]+/g, "-"),
      type: "ai-agent",
      label: String(agent.role || agent.id || "Subagent"),
      subtitle: "Swarm subagent",
      config: {
        role: String(agent.role || agent.id || "Subagent"),
        description: String(agent.description || "").trim(),
        taskPrompt: String(agent.taskPrompt || "").trim(),
        tools: Array.isArray(agent.tools) ? agent.tools.map((t) => String(t || "").trim()).filter(Boolean) : [],
        agentHost: String(agent.agentHost || agentHost || "").trim(),
        adapter: String(agent.adapter || "").trim(),
        required: agent.required !== false,
        canReadWorkspace: true,
        canWriteDraft: false,
        networkAccess: agent.networkAccess === true,
        maxTokens: Number.isFinite(Number(agent.maxTokens)) && Number(agent.maxTokens) > 0
          ? Math.floor(Number(agent.maxTokens))
          : 0,
        timeoutMs: Number.isFinite(Number(agent.timeoutMs)) && Number(agent.timeoutMs) > 0
          ? Math.floor(Number(agent.timeoutMs))
          : 0
      }
    })),
    {
      id: "synthesis",
      type: "tool-result",
      label: "Final synthesis",
      subtitle: "Aggregate subagent results",
      config: {
        successStatusCodes: [200],
        writeLastResponse: true,
        writeSourceRecord: true,
        outputMode: "swarm-summary",
        statusField: "status",
        lastTestedField: "lastTested",
        outcomePrompt: String(options.outcomePrompt || "Confirm every required subagent completed and write the final answer.").trim()
      }
    }
  ];

  const edges = [
    ...subagents.map((agent) => ({
      from: "orchestrator",
      to: String(agent.id || agent.role || "subagent").replace(/[^a-zA-Z0-9_-]+/g, "-"),
      passes: "subtask-assignment"
    })),
    ...subagents.map((agent) => ({
      from: String(agent.id || agent.role || "subagent").replace(/[^a-zA-Z0-9_-]+/g, "-"),
      to: "synthesis",
      passes: "subtask-result"
    }))
  ];

  const maxConcurrency = Math.max(1, Number(options.maxConcurrency) || subagents.length);
  const rewardWeights = options.rewardWeights && typeof options.rewardWeights === "object"
    ? options.rewardWeights
    : { parallel: 0.25, finish: 0.35, outcome: 0.4 };

  return {
    version: 1,
    provider: "growthub-native",
    executionMode: AGENT_SWARM_EXECUTION_MODE,
    swarm: {
      maxConcurrency,
      rewardWeights: {
        parallel: Number(rewardWeights.parallel) || 0,
        finish: Number(rewardWeights.finish) || 0,
        outcome: Number(rewardWeights.outcome) || 0
      },
      outcomeCriteria: String(options.outcomeCriteria || "All required subagents complete and synthesis runs without error.").trim()
    },
    nodes,
    edges
  };
}

/**
 * Schema-aware validation for agent-swarm-v1 graphs. Returns `{ ok, errors }`
 * with concrete user-facing messages. Used both by validateOrchestrationGraph
 * and the WorkflowSurface Test gate so the user never gets a runtime "swarm
 * subagent has no prompt-capable adapter" error at Test time when the static
 * config already revealed the issue.
 */
function validateAgentSwarmGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object") {
    return { ok: false, errors: ["agent-swarm graph must be an object"] };
  }
  const extracted = extractSwarmNodes(graph);
  if (!extracted) return { ok: false, errors: ["graph is not an agent-swarm-v1 graph"] };
  const { orchestrator, subagents, synthesis } = extracted;
  if (!orchestrator) errors.push("missing orchestrator (thinAdapter) node");
  if (subagents.length === 0) errors.push("agent-swarm requires at least one ai-agent subagent");
  subagents.forEach((node, index) => {
    const cfg = node?.config || {};
    const role = String(cfg.role || node?.label || "").trim();
    if (!role) errors.push(`subagent[${index}] (${node?.id || "?"}) must declare a role`);
    if (!String(cfg.taskPrompt || cfg.prompt || "").trim()) {
      errors.push(`subagent "${role || node?.id}" must declare a task prompt`);
    }
    const adapter = String(cfg.adapter || "").trim();
    if (adapter && !["local-agent-host", "local-intelligence"].includes(adapter)) {
      errors.push(`subagent "${role || node?.id}" sets adapter="${adapter}" which cannot execute prompts; use local-agent-host or local-intelligence`);
    }
  });
  if (!synthesis) {
    errors.push("agent-swarm graph should include a tool-result synthesis node to evaluate outcome");
  }
  return { ok: errors.length === 0, errors };
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
  AGENT_SWARM_EXECUTION_MODE,
  buildBlankOrchestrationGraphShell,
  buildDefaultOrchestrationGraphFromRegistry,
  buildDefaultAgentSwarmGraph,
  buildCanonicalNode,
  isAgentSwarmGraph,
  extractSwarmNodes,
  validateAgentSwarmGraph,
  isOrchestrationGraphEmpty,
  getOrchestrationGraphUiState,
  getNextCanonicalNodeId,
  addCanonicalNodeToGraph,
  buildSandboxRowFromApiRegistry,
  buildDataSourceRowFromApiRegistry,
  findDataSourceRowsForRegistry,
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
  redactSecretsFromText,
  detectFieldIdsFromLastResponse,
  collectFieldIdsFromValue
};
