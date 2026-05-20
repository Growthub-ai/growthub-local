/**
 * Declarative orchestration graph for sandbox-environment rows.
 * V1: stored on the row as metadata; execution still flows through POST /api/workspace/sandbox-run.
 */

const TRUSTED_API_STATUSES = ["connected", "approved", "ok", "success"];

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

const NODE_TYPES = new Set([
  "input",
  "api-registry-call",
  "sandbox-adapter",
  "normalize-output",
  "tool-result",
  "custom-webhook"
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slugifyLabel(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "tool";
}

function parseOrchestrationGraph(value) {
  if (!value) return null;
  if (isPlainObject(value)) return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isApiRegistryTestSuccess(registryRow) {
  if (!registryRow || typeof registryRow !== "object") return false;
  const status = String(registryRow.status || "").trim().toLowerCase();
  if (!TRUSTED_API_STATUSES.includes(status)) return false;
  if (!String(registryRow.lastTested || "").trim()) return false;
  return true;
}

function buildDefaultOrchestrationGraphFromRegistry(registryRow, options = {}) {
  const integrationId = String(
    options.registryId
      || registryRow?.integrationId
      || registryRow?.id
      || registryRow?.Name
      || "api"
  ).trim();
  const label = String(options.label || registryRow?.Name || integrationId).trim() || integrationId;
  const method = String(options.method || registryRow?.method || "GET").trim().toUpperCase();
  const endpoint = String(options.endpoint || registryRow?.endpoint || "").trim();
  const authRef = String(options.authRef || registryRow?.authRef || "").trim();
  const rootPath = String(options.outputRootPath || options.rootPath || "data").trim() || "data";
  const adapterId = String(options.adapter || "local-process").trim();
  const runLocality = String(options.runLocality || "local").trim().toLowerCase() === "serverless"
    ? "serverless"
    : "local";

  return {
    version: 1,
    provider: String(options.provider || "growthub-native").trim() || "growthub-native",
    nodes: [
      {
        id: "input",
        type: "input",
        label: "Input",
        config: { schema: "record" }
      },
      {
        id: `api-registry-${slugifyLabel(integrationId)}`,
        type: "api-registry-call",
        label,
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
        label: runLocality === "serverless" ? "Serverless scheduler" : "Sandbox adapter",
        config: {
          runLocality,
          adapter: adapterId,
          schedulerRegistryId: runLocality === "serverless" ? integrationId : ""
        }
      },
      {
        id: "normalize",
        type: "normalize-output",
        label: "Normalize Output",
        config: { mode: "json", rootPath }
      },
      {
        id: "result",
        type: "tool-result",
        label: "Result",
        config: { writeLastResponse: true, writeSourceRecord: true }
      }
    ],
    edges: [
      { from: "input", to: `api-registry-${slugifyLabel(integrationId)}` },
      { from: `api-registry-${slugifyLabel(integrationId)}`, to: "sandbox-adapter" },
      { from: "sandbox-adapter", to: "normalize" },
      { from: "normalize", to: "result" }
    ]
  };
}

function validateOrchestrationGraph(graph) {
  const errors = [];
  const parsed = parseOrchestrationGraph(graph);
  if (!parsed) {
    return { ok: false, errors: ["orchestrationGraph must be a JSON object"] };
  }
  if (Number(parsed.version) !== 1) {
    errors.push("orchestrationGraph.version must be 1");
  }
  const provider = String(parsed.provider || "").trim();
  if (!provider) errors.push("orchestrationGraph.provider is required");
  else if (!KNOWN_PROVIDERS.has(provider)) {
    errors.push(`orchestrationGraph.provider must be one of: ${[...KNOWN_PROVIDERS].join(", ")}`);
  }
  if (!Array.isArray(parsed.nodes) || !parsed.nodes.length) {
    errors.push("orchestrationGraph.nodes must be a non-empty array");
  } else {
    const ids = new Set();
    for (const [index, node] of parsed.nodes.entries()) {
      if (!isPlainObject(node)) {
        errors.push(`orchestrationGraph.nodes[${index}] must be an object`);
        continue;
      }
      const id = String(node.id || "").trim();
      if (!id) errors.push(`orchestrationGraph.nodes[${index}].id is required`);
      else if (ids.has(id)) errors.push(`duplicate node id: ${id}`);
      else ids.add(id);
      const type = String(node.type || "").trim();
      if (!NODE_TYPES.has(type)) {
        errors.push(`orchestrationGraph.nodes[${index}].type is invalid: ${type}`);
      }
    }
  }
  if (!Array.isArray(parsed.edges)) {
    errors.push("orchestrationGraph.edges must be an array");
  } else {
    for (const [index, edge] of parsed.edges.entries()) {
      if (!isPlainObject(edge)) {
        errors.push(`orchestrationGraph.edges[${index}] must be an object`);
        continue;
      }
      if (!String(edge.from || "").trim() || !String(edge.to || "").trim()) {
        errors.push(`orchestrationGraph.edges[${index}] requires from and to`);
      }
    }
  }
  return { ok: errors.length === 0, errors, graph: parsed };
}

function summarizeOrchestrationGraph(graph) {
  const parsed = parseOrchestrationGraph(graph);
  if (!parsed) return "No orchestration graph";
  const apiNode = (parsed.nodes || []).find((n) => n?.type === "api-registry-call");
  const registryId = apiNode?.config?.registryId || "";
  const endpoint = apiNode?.config?.endpoint || "";
  const provider = String(parsed.provider || "growthub-native");
  const nodeCount = Array.isArray(parsed.nodes) ? parsed.nodes.length : 0;
  const edgeCount = Array.isArray(parsed.edges) ? parsed.edges.length : 0;
  const target = [registryId, endpoint].filter(Boolean).join(" ");
  return target
    ? `${provider} · ${nodeCount} nodes · ${edgeCount} edges · ${target}`
    : `${provider} · ${nodeCount} nodes · ${edgeCount} edges`;
}

function serializeOrchestrationGraph(graph) {
  const validation = validateOrchestrationGraph(graph);
  if (!validation.ok) return "";
  return JSON.stringify(validation.graph, null, 2);
}

function findSandboxRowsForRegistry(workspaceConfig, integrationId) {
  const id = String(integrationId || "").trim();
  if (!id) return [];
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const matches = [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    rows.forEach((row, index) => {
      const scheduler = String(row?.schedulerRegistryId || "").trim();
      const graph = parseOrchestrationGraph(row?.orchestrationGraph);
      const apiNode = (graph?.nodes || []).find((n) => n?.type === "api-registry-call");
      const graphRegistry = String(apiNode?.config?.registryId || "").trim();
      if (scheduler === id || graphRegistry === id) {
        matches.push({ object, row, rowIndex: index });
      }
    });
  }
  return matches;
}

function defaultToolNameFromRegistry(registryRow) {
  const base = String(registryRow?.Name || registryRow?.integrationId || "API").trim();
  return base.toLowerCase().includes("tool") ? base : `${base} Tool`;
}

function buildSandboxRowFromApiRegistry(workspaceConfig, registryRow, options = {}) {
  const integrationId = String(
    registryRow?.integrationId || registryRow?.id || registryRow?.Name || ""
  ).trim();
  const runLocality = String(options.runLocality || "serverless").trim().toLowerCase() === "local"
    ? "local"
    : "serverless";
  const adapter = String(options.adapter || (runLocality === "serverless" ? "local-process" : "local-process")).trim();
  const graph = options.orchestrationGraph
    ? parseOrchestrationGraph(options.orchestrationGraph)
    : buildDefaultOrchestrationGraphFromRegistry(registryRow, { ...options, runLocality, adapter });
  const name = String(options.name || options.Name || defaultToolNameFromRegistry(registryRow)).trim();
  const slug = String(options.slug || slugifyLabel(name)).trim();
  const authRef = String(options.authRef || registryRow?.authRef || "").trim();
  const envRefs = Array.isArray(options.envRefs)
    ? options.envRefs.join(",")
    : String(options.envRefs || authRef || "").trim();
  const rootPath = String(options.outputRootPath || options.rootPath || "data").trim() || "data";

  const existing = findSandboxRowsForRegistry(workspaceConfig, integrationId);
  const version = String(options.version || (existing.length ? String(existing.length + 1) : "1")).trim();

  return {
    Name: name,
    slug,
    lifecycleStatus: String(options.lifecycleStatus || "draft").trim() || "draft",
    version,
    runLocality,
    schedulerRegistryId: runLocality === "serverless" ? integrationId : "",
    runtime: String(options.runtime || "node").trim() || "node",
    adapter,
    agentHost: String(options.agentHost || "").trim(),
    localModel: "",
    localEndpoint: "",
    intelligenceAdapterMode: "",
    envRefs,
    networkAllow: String(options.networkAllow ?? "true").trim(),
    allowList: String(options.allowList || "").trim(),
    instructions: String(
      options.instructions
        || `Governed sandbox tool for API Registry "${integrationId}". Call via POST /api/workspace/sandbox-run with this row Name. Normalize JSON at "${rootPath}".`
    ).trim(),
    command: String(
      options.command
        || (runLocality === "local"
          ? 'node -e "console.log(JSON.stringify({ ok: true, hint: \\"Use serverless locality to call the API Registry row\\" }))"'
          : "")
    ).trim(),
    timeoutMs: String(options.timeoutMs || "30000").trim(),
    status: "untested",
    lastTested: "",
    lastRunId: "",
    lastSourceId: "",
    lastResponse: "",
    resolverTemplateId: String(registryRow?.resolverTemplateId || "").trim(),
    connectorKind: String(registryRow?.connectorKind || "api-registry-tool").trim(),
    executionLane: String(registryRow?.executionLane || "sandbox-orchestration").trim(),
    orchestrationGraph: serializeOrchestrationGraph(graph),
    outputRootPath: rootPath
  };
}

function ensureSandboxEnvironmentObject(workspaceConfig) {
  const dataModel = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object"
    ? workspaceConfig.dataModel
    : {};
  const objects = Array.isArray(dataModel.objects) ? dataModel.objects.slice() : [];
  const index = objects.findIndex((o) => o?.objectType === "sandbox-environment");
  if (index >= 0) return { workspaceConfig, object: objects[index], objectIndex: index, objects };

  const preset = {
    label: "Sandbox Environment",
    icon: "Terminal",
    description: "Execution environments for governed workspace tools.",
    columns: [
      "Name",
      "slug",
      "lifecycleStatus",
      "version",
      "runLocality",
      "schedulerRegistryId",
      "runtime",
      "adapter",
      "agentHost",
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
      "outputRootPath",
      "resolverTemplateId",
      "connectorKind",
      "executionLane"
    ],
    relations: []
  };

  const id = "sandbox-tools";
  const nextObject = {
    id,
    label: "Sandbox Tools",
    source: "Sandbox Tools",
    objectType: "sandbox-environment",
    icon: preset.icon,
    columns: preset.columns,
    rows: [],
    binding: { mode: "manual", source: "Sandbox Tools" },
    relations: preset.relations,
    fieldSettings: { hidden: [], order: preset.columns }
  };
  const nextObjects = [...objects, nextObject];
  return {
    workspaceConfig: {
      ...workspaceConfig,
      dataModel: { ...dataModel, objects: nextObjects }
    },
    object: nextObject,
    objectIndex: nextObjects.length - 1,
    objects: nextObjects
  };
}

function mergeSandboxColumns(columns, row) {
  const base = Array.isArray(columns) ? columns.slice() : [];
  for (const key of Object.keys(row || {})) {
    if (!base.includes(key)) base.push(key);
  }
  return base;
}

function appendSandboxToolRow(workspaceConfig, registryRow, options = {}) {
  const row = buildSandboxRowFromApiRegistry(workspaceConfig, registryRow, options);
  const ensured = ensureSandboxEnvironmentObject(workspaceConfig);
  const objects = Array.isArray(ensured.workspaceConfig?.dataModel?.objects)
    ? ensured.workspaceConfig.dataModel.objects.slice()
    : [];
  const index = objects.findIndex((o) => o?.objectType === "sandbox-environment");
  if (index < 0) {
    return { workspaceConfig: ensured.workspaceConfig, row, sandboxTable: null, rowIndex: -1 };
  }
  const object = objects[index];
  const columns = mergeSandboxColumns(object.columns, row);
  const emptyCells = Object.fromEntries(columns.map((column) => [column, ""]));
  const nextRow = { ...emptyCells, ...row };
  const nextObject = {
    ...object,
    columns,
    rows: [...(Array.isArray(object.rows) ? object.rows : []), nextRow],
    fieldSettings: {
      ...(object.fieldSettings || {}),
      order: columns,
      hidden: object.fieldSettings?.hidden || []
    }
  };
  objects[index] = nextObject;
  const rowIndex = nextObject.rows.length - 1;
  return {
    workspaceConfig: {
      ...ensured.workspaceConfig,
      dataModel: {
        ...(ensured.workspaceConfig.dataModel || {}),
        objects
      }
    },
    row: nextRow,
    sandboxTable: {
      storage: "manual-object",
      mutable: true,
      objectId: nextObject.id,
      objectType: "sandbox-environment",
      id: nextObject.id,
      label: nextObject.label,
      source: nextObject.source,
      columns,
      rows: nextObject.rows
    },
    rowIndex
  };
}

export {
  TRUSTED_API_STATUSES,
  KNOWN_PROVIDERS,
  NODE_TYPES,
  parseOrchestrationGraph,
  isApiRegistryTestSuccess,
  buildDefaultOrchestrationGraphFromRegistry,
  validateOrchestrationGraph,
  summarizeOrchestrationGraph,
  serializeOrchestrationGraph,
  findSandboxRowsForRegistry,
  buildSandboxRowFromApiRegistry,
  appendSandboxToolRow,
  slugifyLabel
};
