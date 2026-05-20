/**
 * Declarative orchestration graph for sandbox-environment rows.
 * V1: growthub-native provider only; graph is a run plan, not a client executor.
 */

const TRUSTED_API_STATUSES = new Set(["connected", "approved", "ok", "success"]);
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
const KNOWN_NODE_TYPES = new Set([
  "input",
  "api-registry-call",
  "sandbox-adapter",
  "normalize-output",
  "tool-result"
]);

function slugify(value) {
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
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function serializeOrchestrationGraph(graph) {
  if (!graph || typeof graph !== "object") return "";
  return JSON.stringify(graph);
}

function isApiRegistryRowTested(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  return TRUSTED_API_STATUSES.has(status) && Boolean(String(row?.lastTested || "").trim());
}

function buildDefaultOrchestrationGraphFromRegistry(registryRow, options = {}) {
  const integrationId = String(registryRow?.integrationId || registryRow?.Name || "api").trim();
  const label = String(options.label || registryRow?.Name || integrationId).trim() || integrationId;
  const endpoint = String(registryRow?.endpoint || "").trim();
  const method = String(registryRow?.method || "GET").trim().toUpperCase() || "GET";
  const authRef = String(registryRow?.authRef || integrationId).trim();
  const rootPath = String(options.outputRootPath || "data").trim() || "data";
  const registryNodeId = `api-registry-${slugify(integrationId) || "call"}`;

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
        id: registryNodeId,
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
        label: "Sandbox Adapter",
        config: {
          runLocality: String(options.runLocality || "local").trim() || "local",
          adapter: String(options.adapter || "local-process").trim() || "local-process",
          schedulerRegistryId: String(options.schedulerRegistryId || "").trim() || undefined
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
        config: { writeLastResponse: true }
      }
    ],
    edges: [
      { from: "input", to: registryNodeId },
      { from: registryNodeId, to: "sandbox-adapter" },
      { from: "sandbox-adapter", to: "normalize" },
      { from: "normalize", to: "result" }
    ]
  };
}

function validateOrchestrationGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    return { ok: false, errors: ["orchestrationGraph must be a plain object"] };
  }
  if (graph.version !== 1) errors.push("orchestrationGraph.version must be 1");
  const provider = String(graph.provider || "").trim();
  if (!provider) errors.push("orchestrationGraph.provider is required");
  else if (!KNOWN_PROVIDERS.has(provider)) errors.push(`orchestrationGraph.provider must be one of: ${[...KNOWN_PROVIDERS].join(", ")}`);
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) errors.push("orchestrationGraph.nodes must be a non-empty array");
  if (!Array.isArray(graph.edges)) errors.push("orchestrationGraph.edges must be an array");

  const nodeIds = new Set();
  (graph.nodes || []).forEach((node, index) => {
    const prefix = `nodes[${index}]`;
    if (!node || typeof node !== "object") {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!String(node.id || "").trim()) errors.push(`${prefix}.id is required`);
    else if (nodeIds.has(node.id)) errors.push(`${prefix}.id duplicates an earlier node`);
    else nodeIds.add(node.id);
    if (!KNOWN_NODE_TYPES.has(node.type)) errors.push(`${prefix}.type is invalid`);
    if (!String(node.label || "").trim()) errors.push(`${prefix}.label is required`);
    if (node.config !== undefined && (typeof node.config !== "object" || Array.isArray(node.config))) {
      errors.push(`${prefix}.config must be a plain object when set`);
    }
  });

  (graph.edges || []).forEach((edge, index) => {
    const prefix = `edges[${index}]`;
    if (!edge || typeof edge !== "object") {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!nodeIds.has(edge.from)) errors.push(`${prefix}.from references unknown node`);
    if (!nodeIds.has(edge.to)) errors.push(`${prefix}.to references unknown node`);
  });

  return { ok: errors.length === 0, errors };
}

function summarizeOrchestrationGraph(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes?.length) return "No orchestration plan";
  const labels = parsed.nodes.map((n) => n.label || n.id).filter(Boolean);
  return `${parsed.provider || "growthub-native"} · ${labels.join(" → ")}`;
}

function findSandboxRowsForRegistry(workspaceConfig, integrationId) {
  const id = String(integrationId || "").trim();
  if (!id) return [];
  const objects = workspaceConfig?.dataModel?.objects || [];
  const matches = [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment" || !Array.isArray(object.rows)) continue;
    object.rows.forEach((row, rowIndex) => {
      const graph = parseOrchestrationGraph(row.orchestrationGraph);
      const registryNode = (graph?.nodes || []).find((n) => n.type === "api-registry-call");
      const registryId = String(registryNode?.config?.registryId || row.schedulerRegistryId || "").trim();
      if (registryId === id) {
        matches.push({ object, row, rowIndex, graph });
      }
    });
  }
  return matches;
}

function buildSandboxRowFromApiRegistry(registryRow, options = {}) {
  const integrationId = String(registryRow?.integrationId || "").trim();
  const name = String(options.name || `${registryRow?.Name || integrationId} Tool`).trim();
  const description = String(options.description || registryRow?.description || "").trim();
  const runLocality = String(options.runLocality || "local").trim().toLowerCase() === "serverless" ? "serverless" : "local";
  const adapter = String(options.adapter || "local-process").trim() || "local-process";
  const authRef = String(options.authRef || registryRow?.authRef || integrationId).trim();
  const envRefs = Array.isArray(options.envRefs)
    ? options.envRefs.map((v) => String(v || "").trim()).filter(Boolean).join(",")
    : String(options.envRefs || "").trim();
  const graph = options.orchestrationGraph || buildDefaultOrchestrationGraphFromRegistry(registryRow, {
    ...options,
    runLocality,
    adapter,
    schedulerRegistryId: runLocality === "serverless" ? integrationId : ""
  });

  const row = {
    Name: name,
    lifecycleStatus: "draft",
    version: "1",
    runLocality,
    schedulerRegistryId: runLocality === "serverless" ? integrationId : "",
    runtime: String(options.runtime || "node").trim() || "node",
    adapter,
    agentHost: String(options.agentHost || "").trim(),
    envRefs,
    networkAllow: options.networkAllow === true || options.networkAllow === "true" ? "true" : "",
    allowList: String(options.allowList || "").trim(),
    instructions: String(options.instructions || description || `Run the ${name} sandbox tool against API Registry ${integrationId}.`).trim(),
    command: String(options.command || "").trim(),
    timeoutMs: String(options.timeoutMs || "").trim(),
    authRef,
    status: "untested",
    lastTested: "",
    lastRunId: "",
    lastSourceId: "",
    lastResponse: "",
    orchestrationGraph: serializeOrchestrationGraph(graph)
  };

  return { row, orchestrationGraph: graph };
}

function ensureSandboxObjectColumns(object) {
  const presetCols = [
    "Name",
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
    "orchestrationGraph",
    "status",
    "lastTested",
    "lastRunId",
    "lastSourceId",
    "lastResponse"
  ];
  const columns = Array.isArray(object?.columns) ? [...object.columns] : [];
  const merged = [...columns];
  presetCols.forEach((col) => {
    if (!merged.includes(col)) merged.push(col);
  });
  return { ...object, columns: merged };
}

export {
  TRUSTED_API_STATUSES,
  buildDefaultOrchestrationGraphFromRegistry,
  buildSandboxRowFromApiRegistry,
  ensureSandboxObjectColumns,
  findSandboxRowsForRegistry,
  isApiRegistryRowTested,
  parseOrchestrationGraph,
  serializeOrchestrationGraph,
  summarizeOrchestrationGraph,
  validateOrchestrationGraph
};
