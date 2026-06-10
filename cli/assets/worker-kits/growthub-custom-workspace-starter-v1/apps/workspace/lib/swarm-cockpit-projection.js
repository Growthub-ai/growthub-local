/**
 * Swarm cockpit projection — pure read model for the Background-tasks UI.
 *
 * No fetch. No React. No new routes. Derives run cards exclusively from the
 * artifacts the EXISTING surface already returns:
 *
 *   GET /api/workspace                    → workspaceConfig + workspaceSourceRecords
 *   POST /api/workspace/sandbox-run       → executes a row (existing governed runner)
 *   GET  /api/workspace/sandbox-run?…     → per-row run history
 *
 * Swarm runs are sandbox-run responses whose payload carries the
 * `swarm` + `logTree` blocks produced by orchestration-agent-swarm.js.
 * This module maps that logTree onto the cockpit tree:
 *
 *   run → phases (Plan / Dispatch / Synthesize) → agents
 *
 * Same invariants as workspace-metadata-store.js: never throws on partial
 * shapes, never inlines secrets (run records are already redacted by the
 * sandbox-run route before persistence).
 */

import { safeParseJson } from "./orchestration-run-trace.js";

const HIDDEN_SANDBOX_OBJECT_IDS = new Set(["workspace-helper-sandbox"]);

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function estimateTokens(text) {
  const length = safeString(text).length;
  return length ? Math.ceil(length / 4) : null;
}

function nodeStatus(status) {
  const s = safeString(status).toLowerCase();
  if (s === "completed" || s === "info") return "done";
  if (s === "failed") return "error";
  if (s === "skipped") return "skipped";
  if (s === "running") return "running";
  return "pending";
}

function agentFromLogNode(node, index, phaseId) {
  return {
    id: `${phaseId}-agent-${index + 1}`,
    label: safeString(node?.label || node?.id || `agent-${index + 1}`),
    status: nodeStatus(node?.status),
    tokens: estimateTokens(node?.text),
    toolUses: null,
    durationMs: Number.isFinite(node?.durationMs) ? Number(node.durationMs) : null,
    output: safeString(node?.text)
  };
}

/**
 * Map an agent-swarm logTree (root → orchestrator/dispatch/synthesis/reward
 * children) onto cockpit phases. Reward telemetry is exposed separately —
 * it is not an agent.
 */
function phasesFromLogTree(logTree) {
  const root = Array.isArray(logTree) ? logTree[0] : null;
  const children = Array.isArray(root?.children) ? root.children : [];
  const phases = [];
  let reward = null;

  const orchestrator = children.find((child) => child?.type === "orchestrator");
  if (orchestrator) {
    phases.push({
      id: "phase-plan",
      label: "Plan",
      status: nodeStatus(orchestrator.status),
      agents: [agentFromLogNode(orchestrator, 0, "phase-plan")]
    });
  }

  const dispatch = children.find((child) => child?.type === "dispatch");
  if (dispatch) {
    const subagents = Array.isArray(dispatch.children) ? dispatch.children : [];
    phases.push({
      id: "phase-dispatch",
      label: "Dispatch",
      status: nodeStatus(dispatch.status),
      agents: subagents.map((node, index) => agentFromLogNode(node, index, "phase-dispatch"))
    });
  }

  const synthesis = children.find((child) => child?.type === "synthesis");
  if (synthesis) {
    phases.push({
      id: "phase-synthesize",
      label: "Synthesize",
      status: nodeStatus(synthesis.status),
      agents: [agentFromLogNode(synthesis, 0, "phase-synthesize")]
    });
  }

  const rewardNode = children.find((child) => child?.type === "reward");
  if (rewardNode) reward = safeParseJson(rewardNode.text);

  return { phases, reward };
}

function runFromRecord(record, { objectId, objectLabel, rowName }) {
  const parsed = typeof record === "string" ? safeParseJson(record) : record;
  if (!parsed || typeof parsed !== "object") return null;
  const swarm = parsed.swarm && typeof parsed.swarm === "object" ? parsed.swarm : null;
  const logTree = Array.isArray(parsed.logTree) ? parsed.logTree : null;
  if (!swarm && !logTree) return null;

  const { phases, reward } = phasesFromLogTree(logTree);
  const agents = phases.flatMap((phase) => phase.agents);
  const exitCode = Number.isFinite(parsed.exitCode) ? Number(parsed.exitCode) : null;
  const ok = exitCode === 0 && !safeString(parsed.error).trim();
  return {
    runId: safeString(parsed.runId) || `${objectId}:${rowName}:${safeString(parsed.ranAt)}`,
    name: rowName,
    runKind: "workflow",
    description: objectLabel ? `${objectLabel} · agent-swarm-v1` : "agent-swarm-v1",
    status: ok ? "done" : "error",
    startedAt: safeString(parsed.ranAt) || null,
    finishedAt: safeString(parsed.ranAt) || null,
    durationMs: Number.isFinite(parsed.durationMs) ? Number(parsed.durationMs) : null,
    totals: {
      agents: agents.length,
      tokens: agents.reduce((sum, agent) => sum + (agent.tokens || 0), 0),
      toolUses: 0
    },
    error: safeString(parsed.error),
    reward: reward || swarm?.reward || null,
    phases,
    workflowRef: { objectId, rowId: rowName }
  };
}

function sandboxRunSourceIdFor(objectId, rowName) {
  const slug = safeString(rowName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!objectId || !slug) return "";
  return `sandbox:${objectId}:${slug}`;
}

/**
 * Project every persisted swarm run from the workspace payload the existing
 * GET /api/workspace already returns. Newest first.
 */
function projectSwarmRuns({ workspaceConfig, workspaceSourceRecords }) {
  const runs = [];
  const seen = new Set();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    const objectId = safeString(object?.id).trim();
    if (!objectId || HIDDEN_SANDBOX_OBJECT_IDS.has(objectId)) continue;
    const objectLabel = safeString(object?.label).trim();
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      const rowName = safeString(row?.Name || row?.name).trim();
      if (!rowName) continue;
      const push = (candidate) => {
        const run = runFromRecord(candidate, { objectId, objectLabel, rowName });
        if (run && !seen.has(run.runId)) {
          seen.add(run.runId);
          runs.push(run);
        }
      };
      const sourceId = safeString(row?.lastSourceId).trim() || sandboxRunSourceIdFor(objectId, rowName);
      const sidecar = workspaceSourceRecords && sourceId ? workspaceSourceRecords[sourceId] : null;
      for (const record of Array.isArray(sidecar?.records) ? sidecar.records : []) push(record);
      if (row?.lastResponse) push(row.lastResponse);
    }
  }
  runs.sort((a, b) => safeString(b.startedAt).localeCompare(safeString(a.startedAt)));
  return runs;
}

/**
 * Swarm workflows launchable from the cockpit — sandbox rows whose graph is
 * agent-swarm-v1 (reads the same shape nav-workflows lists; duplicated here
 * as a pure string check so this module stays import-light for the client).
 */
function projectSwarmWorkflows(workspaceConfig) {
  const workflows = [];
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    const objectId = safeString(object?.id).trim();
    if (!objectId || HIDDEN_SANDBOX_OBJECT_IDS.has(objectId)) continue;
    for (const row of Array.isArray(object?.rows) ? object.rows : []) {
      const rowName = safeString(row?.Name || row?.name).trim();
      if (!rowName) continue;
      const graph = safeParseJson(safeString(row?.orchestrationGraph || row?.orchestrationConfig)) ||
        (typeof row?.orchestrationGraph === "object" ? row.orchestrationGraph : null);
      if (safeString(graph?.provider) !== "agent-swarm-v1") continue;
      workflows.push({
        name: rowName,
        label: rowName,
        description: `${safeString(object?.label) || "Sandbox"} · ${Array.isArray(graph?.nodes) ? graph.nodes.length : 0} nodes`,
        workflowRef: { objectId, rowId: rowName }
      });
    }
  }
  return workflows.sort((a, b) => a.name.localeCompare(b.name));
}

export { projectSwarmRuns, projectSwarmWorkflows, phasesFromLogTree, runFromRecord };
