/**
 * Workspace Swarm Proposal V1 — the governed swarm lane for the helper.
 *
 * AWaC boundary: a swarm run is a governed object — a `sandbox-environment`
 * row carrying an `agent-swarm-v1` orchestration graph. Swarm proposals
 * therefore travel through the EXISTING dataModel patch lane (no new
 * top-level PATCH allowlist field), and execution happens ONLY through
 * POST /api/workspace/sandbox-run after an explicit, human-reviewed apply.
 *
 * The model is never trusted to hand-author the final orchestration graph.
 * The helper proposes INTENT (objective, agent roles, task prompts, budgets);
 * the server-side normalizer in helper/apply reduces that intent into a
 * sandbox row via buildDefaultAgentSwarmGraph — the same builder every other
 * swarm surface in this kit uses.
 *
 * This module is PURE (constants/validate/build/find/summarize). No React,
 * no fetch, no fs, no config writes. The confined mutation lives in the
 * helper apply route, gated by the same persistence rules as every other
 * proposal lane.
 *
 * See docs/SWARM_RUN_CONTRACT_V1.md for the full contract.
 */

import {
  buildDefaultAgentSwarmGraph,
  isAgentSwarmGraph,
  parseOrchestrationGraph,
  serializeOrchestrationGraph,
  slugifyName,
  validateAgentSwarmGraph,
} from "./orchestration-graph.js";
import { KNOWN_SANDBOX_AGENT_HOSTS } from "./workspace-schema.js";

const SWARM_RUN_PROPOSAL_TYPE = "swarm.run.propose";
const SWARM_WORKFLOW_SAVE_PROPOSAL_TYPE = "swarm.workflow.save";
const SWARM_RUN_RESUME_PROPOSAL_TYPE = "swarm.run.resume";

const SWARM_PROPOSAL_TYPES = [
  SWARM_RUN_PROPOSAL_TYPE,
  SWARM_WORKFLOW_SAVE_PROPOSAL_TYPE,
  SWARM_RUN_RESUME_PROPOSAL_TYPE,
];

// Swarm rows live in dataModel.objects[] — the existing patch lane. This is
// deliberately NOT a new top-level PATCH allowlist field.
const SWARM_AFFECTED_FIELD = "dataModel";

// Well-known governed object that hosts helper-proposed swarm workflow rows.
// Same well-known-id pattern as "helper-threads" / "nav-folders": a normal
// sandbox-environment object, persisted in growthub.config.json, validated by
// validateWorkspaceConfig, re-seeded if the user deletes it.
const SWARM_WORKFLOWS_OBJECT_ID = "swarm-workflows";
const SWARM_WORKFLOWS_LABEL = "Swarm Workflows";
const WORKSPACE_HELPER_SANDBOX_OBJECT_ID = "workspace-helper-sandbox";
const WORKSPACE_HELPER_ROW_NAME = "workspace-helper";

const SWARM_ALLOWED_ADAPTERS = new Set(["local-agent-host", "local-intelligence"]);
const SWARM_MAX_AGENTS = 24;
const SWARM_DEFAULT_TIMEOUT_MS = 120000;
const SWARM_EXECUTION_TARGET_FIELDS = [
  "runLocality",
  "schedulerRegistryId",
  "runtime",
  "adapter",
  "agentHost",
  "localModel",
  "localEndpoint",
  "intelligenceAdapterMode",
  "timeoutMs",
  "networkAllow",
  "allowList",
];

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function clampPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

// agentHost must be a registered host slug or empty — model-invented host
// names are dropped (the row falls back to the adapter default) so the
// normalized row always passes validateSandboxEnvironmentRow.
function sanitizeAgentHost(value) {
  const host = clean(value);
  return KNOWN_SANDBOX_AGENT_HOSTS.includes(host) ? host : "";
}

function findWorkspaceHelperSandboxRow(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((item) => item?.id === WORKSPACE_HELPER_SANDBOX_OBJECT_ID);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows.find((row) => clean(row?.Name) === WORKSPACE_HELPER_ROW_NAME) || rows[0] || null;
}

function deriveHelperWidgetCausationState(workspaceConfig) {
  const row = findWorkspaceHelperSandboxRow(workspaceConfig);
  const lifecycleStatus = clean(row?.lifecycleStatus).toLowerCase() || "draft";
  const runLocality = normalizeRunLocality(row?.runLocality);
  const adapter = sanitizeSwarmAdapter(row?.adapter, "");
  const agentHost = sanitizeAgentHost(row?.agentHost);
  const missing = [];
  if (!row) missing.push("workspace helper sandbox");
  if (row && lifecycleStatus !== "live") missing.push("live helper status");
  if (row && runLocality !== "local") missing.push("local helper runtime");
  if (row && !adapter) missing.push("prompt-capable helper adapter");
  if (adapter === "local-agent-host" && !agentHost) missing.push("helper agent host");
  const ready = missing.length === 0;
  return {
    ready,
    status: ready ? "ready" : "blocked",
    row,
    adapter,
    agentHost,
    runLocality,
    lifecycleStatus,
    missing,
    guidance: ready
      ? `Helper is live on ${adapter}${agentHost ? ` using ${agentHost}` : ""}.`
      : `Set up the live workspace helper first: ${missing.join(", ")}.`,
  };
}

function sanitizeSwarmAdapter(value, fallback = "local-intelligence") {
  const adapter = clean(value);
  return SWARM_ALLOWED_ADAPTERS.has(adapter) ? adapter : fallback;
}

function normalizeRunLocality(value) {
  return clean(value).toLowerCase() === "serverless" ? "serverless" : "local";
}

function resolveSwarmExecutionTarget(workspaceConfig, payload = {}) {
  const helperState = deriveHelperWidgetCausationState(workspaceConfig);
  const helperRow = helperState.ready ? helperState.row : null;
  const helperAdapter = sanitizeSwarmAdapter(helperRow?.adapter, "");
  const payloadAdapter = sanitizeSwarmAdapter(payload?.adapter, "");
  const adapter = helperAdapter || payloadAdapter || "local-intelligence";
  const runLocality = normalizeRunLocality(helperRow?.runLocality || payload?.runLocality);
  const target = {
    runLocality: "local",
    schedulerRegistryId: "",
    runtime: clean(helperRow?.runtime || payload?.runtime || "node") || "node",
    adapter,
    agentHost: "",
    localModel: clean(helperRow?.localModel || payload?.localModel),
    localEndpoint: clean(helperRow?.localEndpoint || payload?.localEndpoint),
    intelligenceAdapterMode: clean(helperRow?.intelligenceAdapterMode || payload?.intelligenceAdapterMode),
    timeoutMs: String(clampPositiveInt(payload?.timeoutMs || helperRow?.timeoutMs, SWARM_DEFAULT_TIMEOUT_MS)),
    networkAllow: clean(payload?.networkAllow || helperRow?.networkAllow),
    allowList: clean(payload?.allowList || helperRow?.allowList),
    inheritedFromObjectId: helperRow ? WORKSPACE_HELPER_SANDBOX_OBJECT_ID : "",
    inheritedFromName: helperRow ? clean(helperRow.Name || WORKSPACE_HELPER_ROW_NAME) : "",
  };
  if (adapter === "local-agent-host") {
    target.agentHost = sanitizeAgentHost(helperRow?.agentHost) || sanitizeAgentHost(payload?.agentHost);
  }
  // Swarm workflows execute through prompt-capable local adapters. Serverless
  // helper setup is not a runnable first-run target for agent-swarm-v1 because
  // the proposal payload does not carry a scheduler registry contract.
  if (runLocality === "serverless") {
    target.runLocality = "local";
    target.schedulerRegistryId = "";
  }
  return target;
}

function applyExecutionTargetToSwarmGraph(graph, executionTarget) {
  const agentHost = sanitizeAgentHost(executionTarget?.agentHost);
  const adapter = sanitizeSwarmAdapter(executionTarget?.adapter, "");
  if ((!agentHost && !adapter) || !graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node?.type !== "ai-agent" && node?.type !== "tool-result") return node;
      const config = node.config && typeof node.config === "object" ? node.config : {};
      return {
        ...node,
        config: {
          ...config,
          adapter: sanitizeSwarmAdapter(config.adapter, "") || adapter,
          agentHost: sanitizeAgentHost(config.agentHost) || agentHost,
        },
      };
    }),
  };
}

function deriveSwarmWorkflowExecutionEligibility(entryOrRow) {
  const row = entryOrRow?.row && typeof entryOrRow.row === "object" ? entryOrRow.row : entryOrRow;
  const adapter = sanitizeSwarmAdapter(row?.adapter, "");
  const runLocality = normalizeRunLocality(row?.runLocality);
  const agentHost = sanitizeAgentHost(row?.agentHost);
  const graph = parseOrchestrationGraph(row?.orchestrationConfig || row?.orchestrationGraph);
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const runnableNodes = nodes.filter((node) => node?.type === "ai-agent" || node?.type === "tool-result");
  const missing = [];
  if (!graph || !isAgentSwarmGraph(graph)) missing.push("agent-swarm-v1 graph");
  if (runLocality !== "local") missing.push("local run target");
  if (!adapter) missing.push("prompt-capable adapter");
  if (adapter === "local-agent-host" && !agentHost) missing.push("agent host");
  for (const node of runnableNodes) {
    const config = node.config && typeof node.config === "object" ? node.config : {};
    const nodeAdapter = sanitizeSwarmAdapter(config.adapter, "") || adapter;
    const nodeHost = sanitizeAgentHost(config.agentHost) || agentHost;
    if (!nodeAdapter) missing.push(`${clean(node.label || node.id) || "subagent"} adapter`);
    if (nodeAdapter === "local-agent-host" && !nodeHost) missing.push(`${clean(node.label || node.id) || "subagent"} agent host`);
  }
  const uniqueMissing = Array.from(new Set(missing));
  const ready = uniqueMissing.length === 0;
  return {
    ready,
    status: ready ? "ready" : "blocked",
    adapter,
    agentHost,
    runLocality,
    runnableNodeCount: runnableNodes.length,
    missing: uniqueMissing,
    guidance: ready
      ? `Ready to run through ${adapter}${agentHost ? ` using ${agentHost}` : ""}.`
      : `Set ${uniqueMissing.join(", ")} before running this swarm workflow.`,
  };
}

/**
 * Validate a swarm proposal envelope before the apply lane normalizes it.
 * Returns { ok, error } with concrete user-facing messages. Resume proposals
 * only need a target name; propose/save need a full intent payload.
 */
function validateSwarmRunProposal(proposal) {
  if (!proposal || typeof proposal !== "object") {
    return { ok: false, error: "swarm proposal must be an object" };
  }
  if (!SWARM_PROPOSAL_TYPES.includes(proposal.type)) {
    return { ok: false, error: `not a swarm proposal type: "${proposal.type}"` };
  }
  if (proposal.affectedField && proposal.affectedField !== SWARM_AFFECTED_FIELD) {
    return { ok: false, error: `swarm proposals must target affectedField "${SWARM_AFFECTED_FIELD}"` };
  }
  const payload = proposal.payload;
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "swarm proposal payload must be an object" };
  }

  if (proposal.type === SWARM_RUN_RESUME_PROPOSAL_TYPE) {
    if (!clean(payload.name)) {
      return { ok: false, error: "swarm.run.resume requires payload.name (the workflow row to resume)" };
    }
    return { ok: true, error: null };
  }

  if (!clean(payload.name)) {
    return { ok: false, error: "swarm proposal requires payload.name" };
  }
  if (!clean(payload.objective)) {
    return { ok: false, error: "swarm proposal requires payload.objective" };
  }
  const agents = Array.isArray(payload.agents) ? payload.agents : [];
  if (agents.length === 0) {
    return { ok: false, error: "swarm proposal requires at least one agent" };
  }
  if (agents.length > SWARM_MAX_AGENTS) {
    return { ok: false, error: `swarm proposal exceeds the ${SWARM_MAX_AGENTS}-agent ceiling` };
  }
  for (let i = 0; i < agents.length; i += 1) {
    const agent = agents[i];
    if (!agent || typeof agent !== "object") {
      return { ok: false, error: `agents[${i}] must be an object` };
    }
    if (!clean(agent.role)) {
      return { ok: false, error: `agents[${i}] must declare a role` };
    }
    if (!clean(agent.taskPrompt)) {
      return { ok: false, error: `agents[${i}] ("${clean(agent.role)}") must declare a taskPrompt` };
    }
  }
  const adapter = clean(payload.adapter);
  if (adapter && !SWARM_ALLOWED_ADAPTERS.has(adapter)) {
    return {
      ok: false,
      error: `swarm adapter "${adapter}" cannot execute prompts; use local-agent-host or local-intelligence`,
    };
  }
  const runLocality = clean(payload.runLocality);
  if (runLocality && runLocality !== "local" && runLocality !== "serverless") {
    return { ok: false, error: `runLocality must be "local" or "serverless", got "${runLocality}"` };
  }
  // Secrets never travel in swarm payloads — env-ref slugs only, and even
  // those are not part of the V1 intent shape.
  const flat = JSON.stringify(payload);
  if (/"(apiKey|api_key|secret|password|bearerToken)"\s*:/i.test(flat)) {
    return { ok: false, error: "swarm proposal payload must not carry credential-shaped fields" };
  }
  return { ok: true, error: null };
}

/**
 * Normalize one intent-shaped agent entry into the subagent shape
 * buildDefaultAgentSwarmGraph consumes.
 */
function normalizeSwarmAgent(agent, index, fallbackAgentHost) {
  const role = clean(agent.role) || `Agent ${index + 1}`;
  const id = slugifyName(clean(agent.id) || role) || `subagent-${index + 1}`;
  return {
    id: id.startsWith("subagent-") || id.startsWith("agent-") ? id : `subagent-${id}`,
    role,
    description: clean(agent.description),
    taskPrompt: clean(agent.taskPrompt),
    // Optional author-named cockpit phase (e.g. "ping"). Slugged; empty
    // falls back to the single Dispatch phase.
    phase: slugifyName(clean(agent.phase || agent.phaseId)) || "",
    tools: Array.isArray(agent.tools) ? agent.tools.map((t) => clean(t)).filter(Boolean) : [],
    required: agent.required !== false,
    agentHost: sanitizeAgentHost(agent.agentHost) || sanitizeAgentHost(fallbackAgentHost),
    adapter: SWARM_ALLOWED_ADAPTERS.has(clean(agent.adapter)) ? clean(agent.adapter) : "",
    networkAccess: agent.networkAccess === true,
    maxTokens: clampPositiveInt(agent.maxTokens, 0),
    timeoutMs: clampPositiveInt(agent.timeoutMs, 0),
  };
}

/**
 * Build an inert swarm.run.propose proposal envelope from intent input.
 * Nothing executes and nothing is written until the user reviews and applies.
 */
function buildSwarmRunProposal(input = {}) {
  const name = clean(input.name) || "Agent Swarm";
  const agents = (Array.isArray(input.agents) ? input.agents : [])
    .map((agent, index) => normalizeSwarmAgent(agent || {}, index, input.agentHost));
  return {
    type: SWARM_RUN_PROPOSAL_TYPE,
    affectedField: SWARM_AFFECTED_FIELD,
    rationale:
      clean(input.rationale)
      || `Create the governed "${name}" swarm workflow (${agents.length} agent${agents.length === 1 ? "" : "s"}). Execution stays behind sandbox-run after apply.`,
    confidence: typeof input.confidence === "number" ? input.confidence : 0.85,
    payload: {
      name,
      description: clean(input.description),
      objective: clean(input.objective),
      agents,
      maxConcurrency: clampPositiveInt(input.maxConcurrency, Math.max(1, agents.length)),
      outcomeCriteria: clean(input.outcomeCriteria),
      runLocality: clean(input.runLocality) === "serverless" ? "serverless" : "local",
      agentHost: sanitizeAgentHost(input.agentHost),
      adapter: SWARM_ALLOWED_ADAPTERS.has(clean(input.adapter)) ? clean(input.adapter) : "local-intelligence",
    },
  };
}

/**
 * Reduce a validated swarm proposal into a governed sandbox-environment row.
 * The orchestration graph is ALWAYS produced by buildDefaultAgentSwarmGraph —
 * model-authored graph JSON is never trusted verbatim. If the payload carries
 * an `orchestrationGraph`, it is only honored when it parses AND validates as
 * an agent-swarm-v1 graph; otherwise it is discarded and rebuilt from intent.
 */
function buildSandboxRowFromSwarmProposal(workspaceConfig, proposal) {
  const payload = proposal?.payload || {};
  const name = clean(payload.name) || "Agent Swarm";
  const executionTarget = resolveSwarmExecutionTarget(workspaceConfig, payload);
  const adapter = executionTarget.adapter;
  const agents = (Array.isArray(payload.agents) ? payload.agents : [])
    .map((agent, index) => normalizeSwarmAgent(agent || {}, index, executionTarget.agentHost));

  let graph = null;
  if (payload.orchestrationGraph) {
    const candidate = parseOrchestrationGraph(payload.orchestrationGraph);
    if (candidate && isAgentSwarmGraph(candidate) && validateAgentSwarmGraph(candidate).ok) {
      graph = candidate;
    }
  }
  if (!graph) {
    graph = buildDefaultAgentSwarmGraph({
      agentHost: executionTarget.agentHost,
      subagents: agents,
      orchestratorPrompt: clean(payload.objective),
      outcomeCriteria: clean(payload.outcomeCriteria),
      maxConcurrency: clampPositiveInt(payload.maxConcurrency, Math.max(1, agents.length)),
    });
  }
  graph = applyExecutionTargetToSwarmGraph(graph, executionTarget);

  // Swarm phases dispatch through prompt-capable LOCAL adapters only —
  // serverless locality would also require a schedulerRegistryId the swarm
  // intent payload never carries. Pin local.
  const runLocality = executionTarget.runLocality;

  return {
    Name: name,
    slug: slugifyName(name) || "agent-swarm",
    objectType: "sandbox-environment",
    lifecycleStatus: "draft",
    version: "1",
    runLocality,
    schedulerRegistryId: executionTarget.schedulerRegistryId,
    runtime: executionTarget.runtime,
    adapter,
    agentHost: executionTarget.agentHost,
    localModel: executionTarget.localModel,
    localEndpoint: executionTarget.localEndpoint,
    intelligenceAdapterMode: executionTarget.intelligenceAdapterMode,
    envRefs: "",
    networkAllow: executionTarget.networkAllow,
    allowList: executionTarget.allowList,
    instructions: clean(payload.objective),
    command: "",
    timeoutMs: executionTarget.timeoutMs,
    status: "untested",
    lastTested: "",
    lastRunId: "",
    lastSourceId: "",
    lastResponse: "",
    orchestrationConfig: serializeOrchestrationGraph(graph),
    description: clean(payload.description) || clean(payload.objective),
  };
}

/**
 * Ensure the well-known Swarm Workflows governed object exists. Mirrors
 * ensureHelperThreadsObject — never overwrites an existing object's fields.
 */
function ensureSwarmWorkflowsObject(config) {
  const dm = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
  const idx = objects.findIndex((o) => o?.id === SWARM_WORKFLOWS_OBJECT_ID);
  if (idx >= 0) {
    const existing = objects[idx];
    if (!Array.isArray(existing.rows)) {
      objects[idx] = { ...existing, rows: [] };
    }
    return { ...config, dataModel: { ...dm, objects } };
  }
  const seeded = {
    id: SWARM_WORKFLOWS_OBJECT_ID,
    label: SWARM_WORKFLOWS_LABEL,
    source: SWARM_WORKFLOWS_LABEL,
    objectType: "sandbox-environment",
    icon: "Workflow",
    columns: [
      "Name",
      "lifecycleStatus",
      ...SWARM_EXECUTION_TARGET_FIELDS,
      "status",
      "lastTested",
      "description",
    ],
    rows: [],
    binding: { mode: "manual", source: SWARM_WORKFLOWS_LABEL },
  };
  return { ...config, dataModel: { ...dm, objects: [...objects, seeded] } };
}

/**
 * Upsert a swarm sandbox row (by Name) into the Swarm Workflows object.
 * Returns the next config — never mutates. On update, run-history stamps
 * (status, lastRunId, lastSourceId, lastResponse, lastTested) are preserved
 * so re-saving a workflow does not erase its audit trail.
 */
function upsertSwarmRunRow(config, row) {
  const withObject = ensureSwarmWorkflowsObject(config);
  const dm = withObject.dataModel;
  const objects = dm.objects.slice();
  const idx = objects.findIndex((o) => o?.id === SWARM_WORKFLOWS_OBJECT_ID);
  if (idx === -1) return withObject;
  const obj = objects[idx];
  const rows = Array.isArray(obj.rows) ? obj.rows.slice() : [];
  const rowIdx = rows.findIndex((r) => clean(r?.Name) === clean(row?.Name));
  if (rowIdx >= 0) {
    const prior = rows[rowIdx];
    rows[rowIdx] = {
      ...prior,
      ...row,
      status: prior.status || row.status,
      lastTested: prior.lastTested || "",
      lastRunId: prior.lastRunId || "",
      lastSourceId: prior.lastSourceId || "",
      lastResponse: prior.lastResponse || "",
    };
  } else {
    rows.push(row);
  }
  objects[idx] = { ...obj, rows };
  return { ...withObject, dataModel: { ...dm, objects } };
}

/**
 * Find governed swarm rows across EVERY sandbox-environment object — not just
 * the well-known one — so swarms created through the orchestration editor
 * surface in the cockpit too. Criteria: { name?, objectId? }.
 *
 * Returns [{ objectId, objectLabel, row, graph }].
 */
function findSwarmRunRows(workspaceConfig, criteria = {}) {
  const wantedName = clean(criteria.name);
  const wantedObjectId = clean(criteria.objectId);
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const out = [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    if (wantedObjectId && clean(object.id) !== wantedObjectId) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (wantedName && clean(row?.Name) !== wantedName) continue;
      const graph = parseOrchestrationGraph(row?.orchestrationConfig || row?.orchestrationGraph);
      if (!graph || !isAgentSwarmGraph(graph)) continue;
      out.push({ objectId: clean(object.id), objectLabel: clean(object.label), row, graph });
    }
  }
  return out;
}

/**
 * One-line human summary for proposal review cards and receipts.
 */
function summarizeSwarmRunProposal(proposal) {
  const payload = proposal?.payload || {};
  if (proposal?.type === SWARM_RUN_RESUME_PROPOSAL_TYPE) {
    return clean(payload.name) ? `resume: ${clean(payload.name)}` : "resume swarm run";
  }
  const agents = Array.isArray(payload.agents) ? payload.agents : [];
  const parts = [
    clean(payload.name) ? `name: ${clean(payload.name)}` : null,
    agents.length ? `${agents.length} agent${agents.length === 1 ? "" : "s"}` : null,
    payload.maxConcurrency ? `concurrency: ${clampPositiveInt(payload.maxConcurrency, 1)}` : null,
    clean(payload.adapter) ? `adapter: ${clean(payload.adapter)}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export {
  SWARM_RUN_PROPOSAL_TYPE,
  SWARM_WORKFLOW_SAVE_PROPOSAL_TYPE,
  SWARM_RUN_RESUME_PROPOSAL_TYPE,
  SWARM_PROPOSAL_TYPES,
  SWARM_AFFECTED_FIELD,
  SWARM_WORKFLOWS_OBJECT_ID,
  SWARM_WORKFLOWS_LABEL,
  SWARM_EXECUTION_TARGET_FIELDS,
  deriveHelperWidgetCausationState,
  validateSwarmRunProposal,
  buildSwarmRunProposal,
  buildSandboxRowFromSwarmProposal,
  deriveSwarmWorkflowExecutionEligibility,
  ensureSwarmWorkflowsObject,
  upsertSwarmRunRow,
  findSwarmRunRows,
  summarizeSwarmRunProposal,
};
