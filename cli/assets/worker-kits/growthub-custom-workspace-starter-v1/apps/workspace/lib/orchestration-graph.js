/**
 * Declarative orchestration graph for sandbox-environment rows.
 * V1: stored on the row; interpreted by sandbox-run for API-registry delegation.
 */

import { createTypedBusinessObject } from "./workspace-data-model.js";

const TRUSTED_REGISTRY_STATUSES = ["connected", "approved", "ok", "success"];

const NATIVE_NODE_TYPES = new Set([
  "input",
  "api-registry-call",
  "sandbox-adapter",
  "normalize-output",
  "tool-result"
]);

const KNOWN_PROVIDERS = new Set([
  "growthub-native",
  "custom-webhook",
  "n8n",
  "pipedream",
  "zapier",
  "inngest",
  "temporal",
  "langgraph"
]);

function slugifyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isApiRegistryTestSuccessful(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  return TRUSTED_REGISTRY_STATUSES.includes(status) && Boolean(String(row?.lastResponse || "").trim());
}

function parseOrchestrationGraph(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function serializeOrchestrationGraph(graph) {
  if (!graph || typeof graph !== "object") return "";
  return JSON.stringify(graph, null, 2);
}

function validateOrchestrationGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    return { ok: false, errors: ["orchestrationGraph must be an object"] };
  }
  const version = Number(graph.version);
  if (!Number.isFinite(version) || version < 1) errors.push("version must be a positive number");
  const provider = String(graph.provider || "").trim();
  if (!provider) errors.push("provider is required");
  else if (!KNOWN_PROVIDERS.has(provider) && provider !== "growthub-native") {
    errors.push(`unknown provider: ${provider}`);
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) errors.push("nodes must be a non-empty array");
  if (!Array.isArray(graph.edges)) errors.push("edges must be an array");

  const nodeIds = new Set();
  (graph.nodes || []).forEach((node, index) => {
    const prefix = `nodes[${index}]`;
    if (!node || typeof node !== "object") {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const id = String(node.id || "").trim();
    if (!id) errors.push(`${prefix}.id is required`);
    else if (nodeIds.has(id)) errors.push(`duplicate node id: ${id}`);
    else nodeIds.add(id);
    const type = String(node.type || "").trim();
    if (!type) errors.push(`${prefix}.type is required`);
    if (graph.provider === "growthub-native" && type && !NATIVE_NODE_TYPES.has(type)) {
      errors.push(`${prefix}.type ${type} is not supported for growthub-native V1`);
    }
    if (type === "api-registry-call") {
      const registryId = String(node.config?.registryId || "").trim();
      if (!registryId) errors.push(`${prefix}.config.registryId is required for api-registry-call`);
    }
  });

  (graph.edges || []).forEach((edge, index) => {
    const prefix = `edges[${index}]`;
    const from = String(edge?.from || "").trim();
    const to = String(edge?.to || "").trim();
    if (!from || !to) errors.push(`${prefix} requires from and to`);
    else if (!nodeIds.has(from) || !nodeIds.has(to)) errors.push(`${prefix} references unknown node`);
  });

  return { ok: errors.length === 0, errors };
}

function summarizeOrchestrationGraph(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes?.length) return "Empty orchestration graph";
  const labels = parsed.nodes.map((n) => String(n.label || n.type || n.id || "").trim()).filter(Boolean);
  return labels.join(" → ");
}

function findApiRegistryNode(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes) return null;
  return parsed.nodes.find((n) => n?.type === "api-registry-call") || null;
}

function buildDefaultOrchestrationGraphFromRegistry(registryRow, options = {}) {
  const integrationId = String(
    options.registryId || registryRow?.integrationId || registryRow?.id || ""
  ).trim();
  const label = String(options.label || registryRow?.Name || integrationId || "API").trim();
  const method = String(options.method || registryRow?.method || "GET").trim().toUpperCase();
  const endpoint = String(options.endpoint || registryRow?.endpoint || "").trim();
  const authRef = String(options.authRef || registryRow?.authRef || "").trim();
  const runLocality = String(options.runLocality || "serverless").trim().toLowerCase();
  const adapter = String(options.adapter || "local-process").trim();
  const apiNodeId = `api-registry-${slugifyName(integrationId) || "call"}`;

  return {
    version: 1,
    provider: "growthub-native",
    nodes: [
      {
        id: "input",
        type: "input",
        label: "Input",
        config: { schema: "record" }
      },
      {
        id: apiNodeId,
        type: "api-registry-call",
        label: label,
        config: {
          registryId: integrationId,
          method,
          endpoint,
          authRef
        }
      },
      {
        id: "sandbox-adapter",
        type: "sandbox-adapter",
        label: "Sandbox Adapter",
        config: {
          runLocality,
          adapter
        }
      },
      {
        id: "normalize",
        type: "normalize-output",
        label: "Normalize Output",
        config: {
          mode: String(options.normalizeMode || "json").trim(),
          rootPath: String(options.outputRootPath || "data").trim()
        }
      },
      {
        id: "result",
        type: "tool-result",
        label: "Result",
        config: {
          writeLastResponse: options.writeLastResponse !== false
        }
      }
    ],
    edges: [
      { from: "input", to: apiNodeId },
      { from: apiNodeId, to: "sandbox-adapter" },
      { from: "sandbox-adapter", to: "normalize" },
      { from: "normalize", to: "result" }
    ]
  };
}

function buildSandboxRowFromApiRegistry(workspaceConfig, registryRow, options = {}) {
  const integrationId = String(registryRow?.integrationId || registryRow?.id || "").trim();
  const toolName = String(options.name || `${registryRow?.Name || integrationId || "API"} Tool`).trim();
  const slug = String(options.slug || slugifyName(toolName)).trim();
  const graph = options.orchestrationGraph || buildDefaultOrchestrationGraphFromRegistry(registryRow, options);
  const apiNode = findApiRegistryNode(graph);
  const runLocality = String(
    options.runLocality || apiNode?.config?.runLocality || "serverless"
  ).trim().toLowerCase();
  const adapter = String(options.adapter || "local-process").trim();
  const authRef = String(options.authRef || registryRow?.authRef || apiNode?.config?.authRef || "").trim();
  const schedulerRegistryId = String(
    options.schedulerRegistryId || (runLocality === "serverless" ? integrationId : "")
  ).trim();

  return {
    Name: toolName,
    slug,
    lifecycleStatus: "draft",
    version: "1",
    runLocality: runLocality === "serverless" ? "serverless" : "local",
    schedulerRegistryId,
    runtime: String(options.runtime || "node").trim(),
    adapter,
    agentHost: String(options.agentHost || "").trim(),
    authRef,
    envRefs: Array.isArray(options.envRefs) ? options.envRefs.join(",") : String(options.envRefs || "").trim(),
    networkAllow: options.networkAllow ? "true" : "false",
    allowList: String(options.allowList || "").trim(),
    instructions: String(
      options.instructions
        || `Governed sandbox tool for API Registry "${integrationId}". Call via POST /api/workspace/sandbox-run with this row Name. Auth resolves server-side from authRef only.`
    ).trim(),
    command: String(options.command || "").trim(),
    timeoutMs: String(options.timeoutMs || "120000").trim(),
    status: "untested",
    lastTested: "",
    lastRunId: "",
    lastSourceId: "",
    lastResponse: "",
    orchestrationGraph: serializeOrchestrationGraph(graph),
    description: String(options.description || registryRow?.description || "").trim(),
    connectorKind: String(registryRow?.connectorKind || "").trim(),
    resolverTemplateId: String(registryRow?.resolverTemplateId || "").trim(),
    executionLane: String(registryRow?.executionLane || "api-registry-tool").trim()
  };
}

function findSandboxRowsForRegistry(workspaceConfig, integrationId) {
  const id = String(integrationId || "").trim();
  if (!id) return [];
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const matches = [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    rows.forEach((row, rowIndex) => {
      if (String(row?.schedulerRegistryId || "").trim() === id) {
        matches.push({ object, row, rowIndex, matchReason: "schedulerRegistryId" });
        return;
      }
      const graph = parseOrchestrationGraph(row?.orchestrationGraph);
      const apiNode = findApiRegistryNode(graph);
      if (String(apiNode?.config?.registryId || "").trim() === id) {
        matches.push({ object, row, rowIndex, matchReason: "orchestrationGraph" });
      }
    });
  }
  return matches;
}

function ensureSandboxColumns(object) {
  const presetCols = [
    "Name",
    "slug",
    "description",
    "lifecycleStatus",
    "version",
    "runLocality",
    "schedulerRegistryId",
    "runtime",
    "adapter",
    "agentHost",
    "authRef",
    "envRefs",
    "networkAllow",
    "allowList",
    "instructions",
    "command",
    "timeoutMs",
    "status",
    "lastTested",
    "lastRunId",
    "lastSourceId",
    "lastResponse",
    "orchestrationGraph",
    "resolverTemplateId",
    "connectorKind",
    "executionLane"
  ];
  const existing = Array.isArray(object?.columns) ? object.columns : [];
  const merged = Array.from(new Set([...existing, ...presetCols]));
  return { ...object, columns: merged };
}

/**
 * Append a sandbox tool row derived from a tested API Registry record.
 */
function applySandboxToolFromRegistry(workspaceConfig, registryRow, options = {}) {
  const row = buildSandboxRowFromApiRegistry(workspaceConfig, registryRow, options);
  const validation = validateOrchestrationGraph(parseOrchestrationGraph(row.orchestrationGraph));
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, workspaceConfig };
  }

  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object"
    ? workspaceConfig.dataModel
    : {};
  const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
  let sbIdx = objects.findIndex((o) => o?.objectType === "sandbox-environment");
  if (sbIdx < 0) {
    const seeded = createTypedBusinessObject(workspaceConfig, {
      name: options.sandboxObjectLabel || "Sandbox Tools",
      objectType: "sandbox-environment"
    });
    const seededObjects = Array.isArray(seeded?.dataModel?.objects) ? seeded.dataModel.objects : [];
    sbIdx = seededObjects.findIndex((o) => o?.objectType === "sandbox-environment");
    objects.splice(0, objects.length, ...seededObjects);
  }

  const object = ensureSandboxColumns(objects[sbIdx]);
  const rows = Array.isArray(object.rows) ? object.rows.slice() : [];
  const duplicate = rows.some((r) => String(r?.Name || "").trim() === String(row.Name || "").trim());
  if (duplicate && !options.allowDuplicateName) {
    return { ok: false, errors: [`sandbox row "${row.Name}" already exists`], workspaceConfig };
  }
  rows.push(row);
  objects[sbIdx] = { ...object, rows };

  return {
    ok: true,
    errors: [],
    workspaceConfig: { ...workspaceConfig, dataModel: { ...dm, objects } },
    sandboxObjectId: object.id,
    rowName: row.Name
  };
}

/**
 * Resolve schedulerRegistryId from row graph when serverless row omits explicit FK.
 */
function resolveSchedulerRegistryIdFromRow(workspaceConfig, row) {
  const explicit = String(row?.schedulerRegistryId || "").trim();
  if (explicit) return explicit;
  const graph = parseOrchestrationGraph(row?.orchestrationGraph);
  const apiNode = findApiRegistryNode(graph);
  const fromGraph = String(apiNode?.config?.registryId || "").trim();
  if (fromGraph) return fromGraph;
  return "";
}

export {
  TRUSTED_REGISTRY_STATUSES,
  applySandboxToolFromRegistry,
  buildDefaultOrchestrationGraphFromRegistry,
  buildSandboxRowFromApiRegistry,
  findApiRegistryNode,
  findSandboxRowsForRegistry,
  isApiRegistryTestSuccessful,
  parseOrchestrationGraph,
  resolveSchedulerRegistryIdFromRow,
  serializeOrchestrationGraph,
  summarizeOrchestrationGraph,
  validateOrchestrationGraph
};
