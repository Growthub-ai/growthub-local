/**
 * Growthub Workspace Connector-Bindings V1 — causation-based derivative of what
 * binds at agent connection.
 *
 * The user ALREADY has connectors (Slack, Asana, …) on their agent — either as
 * the AI agent (a Claude.ai instance under their account) or the local agent
 * (the host CLI on PATH). Those two surfaces are the SAME abstraction and must
 * stay agnostic. This module does NOT store, copy, or synchronise anything into
 * the governed config — it derives a READ-ONLY, secret-free view of which
 * connectors BIND to which agent host at connection time, so MCP can make them
 * visible and an agent/operator can configure how they're used in governed
 * workflows.
 *
 * It is a pure derivative function — the same family as `deriveBlastRadius` /
 * `deriveStaleSurfaces`: input is the agent-host topology already in the graph
 * plus the connector reports observed at connection (serve-time introspection
 * and/or run-time self-report), output is a compact causal overlay. Every
 * binding records its cause (`boundTo` = the agent host) so a workflow step that
 * uses a connector is causally downstream of that host — connectors become
 * first-class participants in causation without ever entering stored state.
 *
 * Authority: auth lives in the agent account; this view carries only the SHAPE
 * (provider, tools, scopes) and never a token. Anything token-shaped in a raw
 * report is dropped, not echoed.
 */

const CONNECTOR_BINDINGS_KIND = "growthub-workspace-connector-bindings-v1";
const CONNECTOR_BINDINGS_VERSION = 1;

// The two agnostic agent surfaces a connector can bind through.
const SURFACES = new Set(["local-agent", "ai-agent"]);

// Field names that may carry a secret — never surfaced, only the shape is kept.
const SECRET_SHAPED = /token|secret|key|authorization|credential|password|bearer|cookie/i;

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(safeString).map((s) => s.trim()).filter(Boolean);
}

/**
 * Normalise one host's raw connector listing into canonical, secret-free
 * reports. Works for any surface — a `claude mcp list` entry, a Codex config
 * entry, or a Claude.ai account connector — because it only reads the shape.
 *
 * @param {Array<object>} rawList
 * @param {object} ctx `{ surface, host }`
 * @returns {Array<object>} `[{ provider, surface, host, tools[], scopes[] }]`
 */
function normalizeConnectorReport(rawList, ctx = {}) {
  const surface = SURFACES.has(ctx.surface) ? ctx.surface : "local-agent";
  const host = safeString(ctx.host).trim() || "unknown";
  const out = [];
  for (const raw of Array.isArray(rawList) ? rawList : []) {
    if (!raw || typeof raw !== "object") continue;
    const provider = safeString(raw.provider || raw.name || raw.id || raw.server).trim().toLowerCase();
    if (!provider) continue;
    // Tools/scopes are the only payload — strip any secret-shaped keys entirely.
    const tools = cleanList(raw.tools).filter((t) => !SECRET_SHAPED.test(t));
    const scopes = cleanList(raw.scopes).filter((s) => !SECRET_SHAPED.test(s));
    out.push({ provider, surface, host, tools, scopes });
  }
  return out;
}

function bindingId(report) {
  return `${report.surface}:${report.provider}`;
}

/**
 * Reconcile the two discovery sources (Both): serve-time introspection seeds the
 * mental model, run-time self-report confirms what the agent actually had.
 * Union by binding id; `confirmedAtRuntime` marks the ground-truth ones.
 */
function reconcileConnectorSources(serveTime = [], runtime = []) {
  const byId = new Map();
  const add = (report, atRuntime) => {
    const id = bindingId(report);
    const existing = byId.get(id);
    if (existing) {
      existing.confirmedAtRuntime = existing.confirmedAtRuntime || atRuntime;
      existing.tools = Array.from(new Set([...existing.tools, ...report.tools]));
      existing.scopes = Array.from(new Set([...existing.scopes, ...report.scopes]));
    } else {
      byId.set(id, { ...report, tools: [...report.tools], scopes: [...report.scopes], confirmedAtRuntime: atRuntime });
    }
  };
  for (const r of serveTime) add(r, false);
  for (const r of runtime) add(r, true);
  return Array.from(byId.values());
}

/**
 * Derive the connector-binding overlay: which connectors bind to which agent
 * host, visible and configurable, with the causal link recorded.
 *
 * @param {object} graph a `buildWorkspaceMetadataGraph` envelope (for agent hosts)
 * @param {object} [sources] `{ serveTime: report[], runtime: report[] }`
 * @returns {object} `{ kind, version, bindings[], byHost, bySurface, byProvider, total, summary, warnings }`
 */
function deriveConnectorBindings(graph, sources = {}) {
  const empty = (warning) => ({
    kind: CONNECTOR_BINDINGS_KIND,
    version: CONNECTOR_BINDINGS_VERSION,
    bindings: [],
    byHost: {},
    bySurface: {},
    byProvider: {},
    total: 0,
    summary: "No connector bindings derived.",
    warnings: warning ? [warning] : []
  });

  const src = (sources && typeof sources === "object") ? sources : {};
  const serveTime = reconcileConnectorSources(
    Array.isArray(src.serveTime) ? src.serveTime : [],
    [],
  );
  const reconciled = reconcileConnectorSources(serveTime, Array.isArray(src.runtime) ? src.runtime : []);
  if (!reconciled.length) {
    const out = empty();
    out.summary = "No connectors bound — connect an agent (local host or Claude.ai account) with connectors, then re-derive.";
    return out;
  }

  // Map a connector's host slug to an agent-host node id so the binding records
  // its cause. Falls back to the host slug itself when no node exists yet.
  const agentHostByHost = new Map();
  for (const node of (graph && Array.isArray(graph.nodes)) ? graph.nodes : []) {
    if (node.type !== "agentHost") continue;
    const slug = safeString(node.summary?.label || node.label || node.id).trim().toLowerCase();
    if (slug) agentHostByHost.set(slug, node.id);
  }

  const bindings = reconciled.map((report) => {
    const boundTo = agentHostByHost.get(safeString(report.host).toLowerCase()) || `agentHost:${report.host}`;
    return {
      id: bindingId(report),
      provider: report.provider,
      surface: report.surface,      // "local-agent" | "ai-agent" — agnostic
      host: report.host,
      boundTo,                      // the CAUSE: the agent host this binds through
      tools: report.tools,
      scopes: report.scopes,
      authLocation: "agent-account", // never the workspace
      available: true,
      confirmedAtRuntime: Boolean(report.confirmedAtRuntime),
      configurable: true            // visible → an agent/operator can wire it into a step
    };
  });

  bindings.sort((a, b) =>
    a.surface.localeCompare(b.surface) ||
    a.provider.localeCompare(b.provider) ||
    a.host.localeCompare(b.host)
  );

  const tally = (key) => {
    const out = {};
    for (const b of bindings) out[b[key]] = (out[b[key]] || 0) + 1;
    return out;
  };

  return {
    kind: CONNECTOR_BINDINGS_KIND,
    version: CONNECTOR_BINDINGS_VERSION,
    bindings,
    byHost: tally("host"),
    bySurface: tally("surface"),
    byProvider: tally("provider"),
    total: bindings.length,
    summary: summarizeBindings(bindings),
    warnings: []
  };
}

/**
 * The connectors that bind to ONE agent host — the per-host configurable view an
 * inspector/MCP `describe_node` shows. Pure; reuses `deriveConnectorBindings`.
 */
function deriveAgentHostConnectors(graph, agentHostId, sources = {}) {
  const all = deriveConnectorBindings(graph, sources);
  const id = safeString(agentHostId).trim();
  return all.bindings.filter((b) => b.boundTo === id);
}

function summarizeBindings(bindings) {
  if (!bindings.length) return "No connectors bound.";
  const confirmed = bindings.filter((b) => b.confirmedAtRuntime).length;
  const providers = Array.from(new Set(bindings.map((b) => b.provider))).sort();
  return `${bindings.length} connector(s) bound (${confirmed} runtime-confirmed): ${providers.join(", ")} — configurable into governed steps, auth stays in the agent account.`;
}

export {
  CONNECTOR_BINDINGS_KIND,
  CONNECTOR_BINDINGS_VERSION,
  SURFACES,
  normalizeConnectorReport,
  reconcileConnectorSources,
  deriveConnectorBindings,
  deriveAgentHostConnectors,
  summarizeBindings
};
