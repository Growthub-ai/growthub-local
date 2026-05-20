/**
 * Governed orchestration graph contract for sandbox-environment rows.
 * V1: growthub-native declarative run plans (stored on row.orchestrationGraph).
 * Execution authority remains POST /api/workspace/sandbox-run.
 */

const TRUSTED_API_STATUSES = ["connected", "approved", "ok", "success"];
const SUPPORTED_PROVIDERS_V1 = new Set(["growthub-native", "custom-webhook"]);
const KNOWN_NODE_TYPES = new Set([
  "input",
  "api-registry-call",
  "sandbox-adapter",
  "normalize-output",
  "tool-result",
  "custom-webhook"
]);

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

/**
 * Sidecar action state for API Registry → sandbox tool bridge (UI only).
 */
function getApiRegistrySandboxToolState(registryRow, workspaceConfig) {
  const integrationId = String(registryRow?.integrationId || "").trim();
  const baseUrl = String(registryRow?.baseUrl || "").trim();
  const endpoint = String(registryRow?.endpoint || "").trim();
  if (!integrationId) {
    return {
      kind: "incomplete",
      message: "Add an integrationId before you can create a sandbox tool."
    };
  }
  if (!baseUrl && !endpoint) {
    return {
      kind: "incomplete",
      message: "Add a baseUrl or endpoint before you can create a sandbox tool."
    };
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
  const labels = parsed.nodes.map((n) => String(n.label || n.id || n.type || "").trim()).filter(Boolean);
  return labels.join(" → ");
}

function buildDefaultOrchestrationGraphFromRegistry(registryRow, options = {}) {
  const integrationId = String(registryRow?.integrationId || registryRow?.Name || "").trim();
  const label = String(options.label || registryRow?.Name || integrationId || "API").trim();
  const method = String(options.method || registryRow?.method || "GET").trim().toUpperCase();
  const endpoint = String(options.endpoint || registryRow?.endpoint || "").trim();
  const authRef = String(options.authRef || registryRow?.authRef || integrationId).trim();
  const adapter = String(options.adapter || "local-process").trim();
  const runLocality = String(options.runLocality || "local").trim();
  const rootPath = String(options.rootPath || "data").trim();
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
          mode: "json",
          rootPath
        }
      },
      {
        id: "result",
        type: "tool-result",
        label: "Result",
        config: {
          writeLastResponse: true,
          writeSourceRecord: true
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
        && String(node?.config?.registryId || "").trim() === id
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
    : buildDefaultOrchestrationGraphFromRegistry(registryRow, { ...options, runLocality, adapter });

  const apiNode = graph?.nodes?.find((n) => n?.type === "api-registry-call");
  const authRef = String(options.authRef || apiNode?.config?.authRef || registryRow?.authRef || integrationId).trim();
  const normalizeNode = graph?.nodes?.find((n) => n?.type === "normalize-output");
  const rootPath = normalizeNode?.config?.rootPath || "data";

  const existing = findSandboxRowsForRegistry(workspaceConfig, integrationId);
  const slug = options.slug || slugifyName(name) || slugifyName(integrationId);

  return {
    Name: name,
    slug,
    objectType: "sandbox-environment",
    lifecycleStatus: "draft",
    version: "1",
    runLocality,
    schedulerRegistryId: runLocality === "serverless" ? integrationId : "",
    runtime: String(options.runtime || "node").trim(),
    adapter,
    agentHost: "",
    envRefs: Array.isArray(options.envRefs) ? options.envRefs.join(",") : String(options.envRefs || "").trim(),
    networkAllow: options.networkAllow === true ? "true" : "",
    allowList: String(options.allowList || "").trim(),
    instructions: String(
      options.instructions
        || `Governed sandbox tool for ${integrationId}. Calls the API Registry endpoint and normalizes output at "${rootPath}". Use authRef ${authRef} only — secrets resolve server-side.`
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

function extractApiRegistryCallNode(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes) return null;
  return parsed.nodes.find((n) => n?.type === "api-registry-call") || null;
}

function extractNormalizeConfig(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  const node = parsed?.nodes?.find((n) => n?.type === "normalize-output");
  return node?.config || { mode: "json", rootPath: "data" };
}

function normalizeJsonAtPath(payload, rootPath) {
  if (!rootPath || rootPath === ".") {
    return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  }
  const parts = String(rootPath).split(".").filter(Boolean);
  let cursor = payload;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object") {
      cursor = null;
      break;
    }
    cursor = cursor[part];
  }
  if (cursor == null) {
    return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  }
  return typeof cursor === "string" ? cursor : JSON.stringify(cursor, null, 2);
}

function orderedGraphNodes(graph) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed?.nodes?.length) return [];
  const byId = new Map(parsed.nodes.map((n) => [String(n.id), n]));
  const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
  const incoming = new Map();
  parsed.nodes.forEach((n) => incoming.set(String(n.id), 0));
  edges.forEach((e) => {
    const to = String(e.to || "");
    if (incoming.has(to)) incoming.set(to, (incoming.get(to) || 0) + 1);
  });
  const roots = parsed.nodes.filter((n) => !incoming.get(String(n.id)));
  const ordered = [];
  const seen = new Set();
  function walk(node) {
    const id = String(node?.id || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(node);
    edges
      .filter((e) => String(e.from) === id)
      .forEach((e) => {
        const next = byId.get(String(e.to));
        if (next) walk(next);
      });
  }
  (roots.length ? roots : [parsed.nodes[0]]).forEach(walk);
  parsed.nodes.forEach((n) => {
    if (!seen.has(String(n.id))) ordered.push(n);
  });
  return ordered;
}

export {
  TRUSTED_API_STATUSES,
  SUPPORTED_PROVIDERS_V1,
  buildDefaultOrchestrationGraphFromRegistry,
  buildSandboxRowFromApiRegistry,
  extractApiRegistryCallNode,
  extractNormalizeConfig,
  findSandboxObject,
  findSandboxRowsForRegistry,
  getApiRegistrySandboxToolState,
  isApiRegistryTestSuccessful,
  normalizeJsonAtPath,
  orderedGraphNodes,
  parseOrchestrationGraph,
  serializeOrchestrationGraph,
  slugifyName,
  summarizeOrchestrationGraph,
  validateOrchestrationGraph
};
