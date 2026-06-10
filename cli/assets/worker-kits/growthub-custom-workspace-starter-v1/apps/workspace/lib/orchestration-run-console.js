/**
 * Live Runs Console model layer.
 *
 * Pure, framework-free transformation of sandbox run records (saved under
 * `growthub.source-records.json` and `row.lastResponse`) into the shape the
 * Live Runs Console UI consumes: lifecycle, log tree, timeline, search, and
 * a redacted JSON bundle that can be downloaded client-side.
 *
 * This module deliberately does NOT import React, does NOT call fetch, and
 * does NOT mutate workspace config. It is the seam between the AWaC run
 * substrate (sandbox-run route + source records) and the observability UI.
 *
 * See:
 *   - app/api/workspace/sandbox-run/route.js  (writes records this consumes)
 *   - app/data-model/components/OrchestrationRunTracePanel.jsx (consumer)
 *   - lib/orchestration-run-trace.js           (lower-level record parser)
 */

import {
  extractSwarmNodes,
  isAgentSwarmGraph,
  parseOrchestrationGraph,
  redactSecretsFromText
} from "./orchestration-graph.js";
import { redactRunInputsEnvelope, summarizeRunInputs } from "./orchestration-run-inputs.js";

const RUN_LOG_BUNDLE_KIND = "growthub-sandbox-run-log-v1";
const DEFAULT_EXPORT_TARGETS = Object.freeze([
  "download-json",
  "copy-output",
  "download-stdout",
  "download-stderr",
  "download-normalized-output",
  "download-log-node"
]);

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function safeJsonString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function parseDateMs(value) {
  const text = safeString(value).trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function clampNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveRunSummary(record) {
  if (!record || typeof record !== "object") {
    return { status: "unknown", ok: false, label: "unknown" };
  }
  const exitCode = clampNumber(record.exitCode);
  const errorText = safeString(record.error).trim();
  const httpStatus = clampNumber(record?.adapterMeta?.httpStatus);
  const aborted = record?.adapterMeta?.aborted === true;
  let status = "unknown";
  let ok = false;
  if (aborted) {
    status = "canceled";
  } else if (exitCode === 0 && !errorText && (httpStatus == null || (httpStatus >= 200 && httpStatus < 300))) {
    status = "completed";
    ok = true;
  } else if (errorText || (exitCode != null && exitCode !== 0)) {
    status = "failed";
  } else if (record?.lifecycleStatus === "executing" || record?.lifecycleStatus === "queued") {
    status = String(record.lifecycleStatus);
  }
  return { status, ok, label: status };
}

function deriveRunLifecycle(record) {
  if (!record || typeof record !== "object") return [];
  const ranAtMs = parseDateMs(record.ranAt);
  const durationMs = clampNumber(record.durationMs) || 0;
  const finishedAtMs = ranAtMs != null ? ranAtMs + durationMs : null;
  const lifecycle = [];
  if (ranAtMs != null) {
    lifecycle.push({ label: "Triggered", at: new Date(ranAtMs).toISOString(), durationMs: 0 });
    lifecycle.push({ label: "Dequeued", at: new Date(ranAtMs).toISOString(), durationMs: 0 });
    lifecycle.push({ label: "Started", at: new Date(ranAtMs).toISOString(), durationMs });
    if (finishedAtMs != null) {
      lifecycle.push({ label: "Finished", at: new Date(finishedAtMs).toISOString(), durationMs: 0 });
    }
  }
  return lifecycle;
}

function buildLogChildren(record, summary) {
  const children = [];
  const stdout = safeString(record?.stdout).trim();
  const stderr = safeString(record?.stderr).trim();
  const errorText = safeString(record?.error).trim();
  const output = safeJsonString(record?.output ?? record?.normalizedOutput ?? record?.response).trim();
  const adapterMeta = record?.adapterMeta;
  const durationMs = clampNumber(record?.durationMs) || 0;

  if (errorText) {
    children.push({
      id: "error",
      label: "error",
      type: "error",
      status: "failed",
      durationMs: 0,
      text: redactSecretsFromText(errorText)
    });
  }
  if (stdout) {
    children.push({
      id: "stdout",
      label: "stdout",
      type: "stream",
      status: "info",
      durationMs,
      text: redactSecretsFromText(stdout)
    });
  }
  if (stderr) {
    children.push({
      id: "stderr",
      label: "stderr",
      type: "stream",
      status: "failed",
      durationMs: 0,
      text: redactSecretsFromText(stderr)
    });
  }
  if (output && output !== stdout) {
    children.push({
      id: "normalized-output",
      label: "normalized output",
      type: "output",
      status: "info",
      durationMs: 0,
      text: redactSecretsFromText(output)
    });
  }
  if (adapterMeta && typeof adapterMeta === "object") {
    children.push({
      id: "adapter-meta",
      label: "adapter meta",
      type: "meta",
      status: "info",
      durationMs: 0,
      text: redactSecretsFromText(safeJsonString(adapterMeta))
    });
  }
  return children;
}

function buildRunLogTree(record) {
  if (!record || typeof record !== "object") return [];
  if (Array.isArray(record.logTree) && record.logTree.length > 0) {
    return record.logTree;
  }
  const summary = deriveRunSummary(record);
  const durationMs = clampNumber(record?.durationMs) || 0;
  const attemptChildren = buildLogChildren(record, summary);
  const attemptNode = {
    id: "attempt-1",
    label: "Attempt 1",
    type: "attempt",
    status: summary.status,
    durationMs,
    children: attemptChildren
  };
  const rootNode = {
    id: "root",
    label: safeString(record?.adapter || "agent-run").trim() || "agent-run",
    type: "root",
    status: summary.status,
    durationMs,
    children: [attemptNode]
  };
  return [rootNode];
}

function buildExportsForRecord(record, stdoutText, stderrText, outputText) {
  const declared = record?.exports?.available;
  if (Array.isArray(declared) && declared.length > 0) {
    return {
      available: declared.map((id) => safeString(id).trim()).filter(Boolean),
      external: Array.isArray(record?.exports?.external) ? record.exports.external.slice() : []
    };
  }
  const available = ["download-json"];
  if (stdoutText || outputText) available.push("copy-output");
  if (stdoutText) available.push("download-stdout");
  if (stderrText) available.push("download-stderr");
  if (outputText && outputText !== stdoutText) available.push("download-normalized-output");
  available.push("download-log-node");
  return { available, external: [] };
}

/**
 * Swarm cockpit projection (SWARM_RUN_CONTRACT_V1).
 *
 * Pure transformation of a sandbox run record carrying a `swarm` block
 * (written by the agent-swarm-v1 runtime through sandbox-run) into the
 * phase/agent tree the helper sidecar cockpit renders. Returns `null` for
 * non-swarm records so existing runs are untouched.
 *
 * Telemetry is truthful: tokens/tools are null when the adapter did not
 * report them — the UI renders "—", never an estimate. Totals are null when
 * no agent reported a number.
 *
 * Same module rules as the rest of this file: no React, no fetch, no config
 * writes, no localStorage, no CSS.
 */
// Truthful counts only: null/undefined (adapter reported nothing) stays
// null — clampNumber would coerce null to 0, which would be a fake metric.
function toTruthfulCount(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function titleizePhaseId(id) {
  const text = safeString(id).trim() || "dispatch";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sumReportedOrNull(values) {
  const reported = values.filter((n) => n != null);
  return reported.length > 0 ? reported.reduce((sum, n) => sum + n, 0) : null;
}

function deriveSwarmRunProjection(record) {
  if (!record || typeof record !== "object") return null;
  const swarm = record.swarm;
  if (!swarm || typeof swarm !== "object") return null;

  const summary = deriveRunSummary(record);
  const tasks = Array.isArray(swarm.tasks) ? swarm.tasks.filter((t) => t && typeof t === "object") : [];

  // Agents projected from a persisted record are terminal: `pending: false`
  // means a missing count is "ran but never reported" → the UI shows "—".
  // (Pending agents — from the graph skeleton or a live stream — show blank.)
  const toAgent = (entry, fallbackId, fallbackLabel, transcriptParts, logNodeId) => {
    const tokens = toTruthfulCount(entry?.tokens);
    const tools = toTruthfulCount(entry?.tools);
    return {
      id: safeString(entry?.taskId || entry?.nodeId || fallbackId).trim() || fallbackId,
      label: safeString(entry?.role || entry?.label || fallbackLabel).trim() || fallbackLabel,
      status: safeString(entry?.status || "unknown").trim() || "unknown",
      pending: false,
      tokens,
      tools,
      durationMs: clampNumber(entry?.durationMs) ?? 0,
      transcript: redactSecretsFromText(
        transcriptParts.map((part) => safeString(part).trim()).filter(Boolean).join("\n\n")
      ),
      logNodeId
    };
  };

  const phases = [];
  const orchestrator = swarm.orchestrator && typeof swarm.orchestrator === "object" ? swarm.orchestrator : null;
  if (orchestrator) {
    phases.push({
      id: "plan",
      label: "Plan",
      status: safeString(orchestrator.status || "unknown").trim() || "unknown",
      agents: [
        toAgent(
          orchestrator,
          "orchestrator",
          "Orchestrator",
          [orchestrator.error, orchestrator.plan],
          "phase-orchestrator"
        )
      ]
    });
  }

  // Group dispatch tasks by their declared phase id (author-named phases),
  // falling back to the single "Dispatch" group for legacy records whose
  // tasks carry no phaseId — those project identically to before.
  const dispatchGroups = new Map();
  tasks.forEach((task, index) => {
    const phaseId = safeString(task.phaseId).trim() || "dispatch";
    if (!dispatchGroups.has(phaseId)) dispatchGroups.set(phaseId, []);
    dispatchGroups.get(phaseId).push(
      toAgent(
        task,
        `task-${index + 1}`,
        `Agent ${index + 1}`,
        [task.error, task.stdout, task.stderr],
        safeString(task.taskId || task.nodeId || `task-${index + 1}`).trim()
      )
    );
  });
  if (dispatchGroups.size === 0) dispatchGroups.set("dispatch", []);
  for (const [phaseId, agents] of dispatchGroups) {
    const status = agents.length === 0
      ? "failed"
      : agents.every((a) => a.status === "completed")
        ? "completed"
        : agents.some((a) => a.status === "failed")
          ? "failed"
          : "info";
    phases.push({ id: phaseId, label: titleizePhaseId(phaseId), status, agents });
  }

  const synthesis = swarm.synthesis && typeof swarm.synthesis === "object" ? swarm.synthesis : null;
  if (synthesis) {
    phases.push({
      id: "synthesize",
      label: "Synthesize",
      status: safeString(synthesis.status || "unknown").trim() || "unknown",
      agents: [
        toAgent(
          synthesis,
          "synthesis",
          synthesis.label || "Synthesizer",
          [synthesis.error, synthesis.answer],
          "phase-synthesis"
        )
      ]
    });
  }

  const allAgents = phases.flatMap((phase) => phase.agents);

  return {
    runId: safeString(record.runId).trim(),
    title: safeString(record.name || record.sandboxName).trim() || "agent-swarm",
    status: summary.status,
    elapsedMs: clampNumber(record.durationMs) ?? 0,
    agentCount: allAgents.length,
    totalTokens: sumReportedOrNull(allAgents.map((a) => a.tokens)),
    totalTools: sumReportedOrNull(allAgents.map((a) => a.tools)),
    phases
  };
}

/**
 * Declared-phase skeleton (SWARM_RUN_CONTRACT_V1, parity P1).
 *
 * Projects the SAME projection shape as deriveSwarmRunProjection from the
 * governed row's agent-swarm-v1 graph alone — before any run exists. Every
 * phase and agent renders upfront with `status: "pending"`, `pending: true`
 * (UI shows hollow dots and BLANK cells, reserving "—" for terminal
 * never-reported). Author-named phases come from each subagent node's
 * `config.phase` / `config.phaseId`; graphs that declare none fall back to
 * the Plan / Dispatch / Synthesize derivation, converging exactly with the
 * record projection for the same workflow.
 *
 * Pure: no React, no fetch, no config writes, no localStorage, no CSS.
 */
function deriveSwarmGraphProjection(graphLike, { title = "", runId = "" } = {}) {
  const graph = parseOrchestrationGraph(graphLike);
  if (!graph || !isAgentSwarmGraph(graph)) return null;
  const extracted = extractSwarmNodes(graph);
  if (!extracted) return null;
  const { orchestrator, subagents, synthesis } = extracted;

  const pendingAgent = (id, label) => ({
    id: safeString(id).trim() || "agent",
    label: safeString(label).trim() || "Agent",
    status: "pending",
    pending: true,
    tokens: null,
    tools: null,
    durationMs: 0,
    transcript: "",
    logNodeId: ""
  });

  const phases = [];
  if (orchestrator) {
    phases.push({
      id: "plan",
      label: "Plan",
      status: "pending",
      agents: [pendingAgent(orchestrator.id || "orchestrator", orchestrator.config?.role || "Orchestrator")]
    });
  }

  const dispatchGroups = new Map();
  subagents.forEach((node, index) => {
    const phaseId = safeString(node?.config?.phase || node?.config?.phaseId).trim().toLowerCase() || "dispatch";
    if (!dispatchGroups.has(phaseId)) dispatchGroups.set(phaseId, []);
    dispatchGroups.get(phaseId).push(
      pendingAgent(node?.id || `task-${index + 1}`, node?.config?.role || node?.label || `Agent ${index + 1}`)
    );
  });
  if (dispatchGroups.size === 0) dispatchGroups.set("dispatch", []);
  for (const [phaseId, agents] of dispatchGroups) {
    phases.push({ id: phaseId, label: titleizePhaseId(phaseId), status: "pending", agents });
  }

  if (synthesis) {
    phases.push({
      id: "synthesize",
      label: "Synthesize",
      status: "pending",
      agents: [pendingAgent(synthesis.id || "synthesis", synthesis.label || "Synthesizer")]
    });
  }

  return {
    runId: safeString(runId).trim(),
    title: safeString(title).trim() || "agent-swarm",
    status: "pending",
    elapsedMs: 0,
    agentCount: phases.reduce((sum, phase) => sum + phase.agents.length, 0),
    totalTokens: null,
    totalTools: null,
    phases
  };
}

function normalizeRunConsoleRecord(record) {
  if (!record || typeof record !== "object") return null;
  const summary = deriveRunSummary(record);
  const lifecycle = deriveRunLifecycle(record);
  const ranAtMs = parseDateMs(record.ranAt);
  const durationMs = clampNumber(record.durationMs);
  const finishedAt = ranAtMs != null && durationMs != null
    ? new Date(ranAtMs + durationMs).toISOString()
    : "";
  const adapterMeta = record?.adapterMeta && typeof record.adapterMeta === "object"
    ? record.adapterMeta
    : null;
  const templateTrace = record?.templateTrace && typeof record.templateTrace === "object"
    ? record.templateTrace
    : null;

  const stdoutText = safeString(typeof record.stdout === "string" ? record.stdout : safeJsonString(record.stdout));
  const stderrText = safeString(record.stderr);
  const errorText = safeString(record.error);
  const outputRaw = record.output ?? record.normalizedOutput ?? record.response;
  const outputText = typeof outputRaw === "string" ? outputRaw : safeJsonString(outputRaw);
  const rawInput = record.input || record.runInputs || null;
  const safeInput = rawInput ? redactRunInputsEnvelope(rawInput) : null;
  const inputSummary = safeInput ? summarizeRunInputs(safeInput) : null;
  const exports = buildExportsForRecord(record, stdoutText, stderrText, outputText);
  // Workspace Metadata Graph V1 — safe lineage projection. Names only,
  // no secrets. Lets the Live Runs Console UI render "this run came from
  // sandbox X / workflow Y / adapter Z / agent host A" without re-deriving
  // the relationships from raw fields.
  const lineage = {
    runId: safeString(record.runId).trim(),
    objectId: safeString(record.objectId).trim(),
    sandboxName: safeString(record.name || record.sandboxName).trim(),
    workflowRowId: safeString(record.name || record.sandboxName).trim(),
    workflowMetadataId: safeString(record.objectId).trim() && safeString(record.name || record.sandboxName).trim()
      ? `workflow:${safeString(record.objectId).trim()}:${safeString(record.name || record.sandboxName).trim()}`
      : "",
    sandboxMetadataId: safeString(record.objectId).trim() && safeString(record.name || record.sandboxName).trim()
      ? `sandbox:${safeString(record.objectId).trim()}:${safeString(record.name || record.sandboxName).trim()}`
      : "",
    adapter: safeString(record.adapter).trim(),
    agentHost: safeString(record.agentHost).trim(),
    runtime: safeString(record.runtime).trim(),
    runLocality: safeString(record.runLocality).trim(),
    inputFieldCount: inputSummary ? inputSummary.fieldCount : 0,
    inputSource: inputSummary ? inputSummary.source : "",
    hasOutput: Boolean(outputText)
  };

  return {
    runId: safeString(record.runId).trim(),
    status: summary.status,
    ok: summary.ok,
    exitCode: clampNumber(record.exitCode),
    ranAt: safeString(record.ranAt).trim(),
    finishedAt,
    durationMs: durationMs == null ? null : durationMs,
    queueMs: 0,
    runtime: safeString(record.runtime).trim(),
    adapter: safeString(record.adapter).trim(),
    runLocality: safeString(record.runLocality).trim(),
    lifecycleStatus: safeString(record.lifecycleStatus).trim(),
    version: safeString(record.version).trim(),
    sourceId: safeString(record.sourceId).trim(),
    lifecycle,
    payload: {
      objectId: safeString(record.objectId).trim(),
      name: safeString(record.name || record.sandboxName).trim(),
      runtime: safeString(record.runtime).trim(),
      adapter: safeString(record.adapter).trim(),
      command: redactSecretsFromText(safeString(record.command)),
      instructions: redactSecretsFromText(safeString(record.instructions)),
      useDraft: Boolean(record.useDraft),
      version: safeString(record.version).trim(),
      schedulerRegistryId: safeString(record.schedulerRegistryId).trim(),
      agentHost: safeString(record.agentHost).trim(),
      timeoutMs: clampNumber(record.timeoutMs),
      runInputs: safeInput,
      inputSource: inputSummary ? inputSummary.source : "",
      inputFieldCount: inputSummary ? inputSummary.fieldCount : 0,
      inputFileCount: inputSummary ? inputSummary.fileCount : 0,
      inputSummary
    },
    exports,
    output: {
      stdout: redactSecretsFromText(stdoutText),
      stderr: redactSecretsFromText(stderrText),
      error: redactSecretsFromText(errorText),
      normalizedOutput: redactSecretsFromText(outputText),
      exitCode: clampNumber(record.exitCode)
    },
    context: {
      envRefsResolved: Array.isArray(record.envRefsResolved) ? record.envRefsResolved.slice() : [],
      envRefsMissing: Array.isArray(record.envRefsMissing) ? record.envRefsMissing.slice() : [],
      networkAllow: Boolean(record.networkAllow),
      allowList: Array.isArray(record.allowList) ? record.allowList.slice() : [],
      adapterMeta,
      templateTrace
    },
    lineage,
    swarm: record.swarm && typeof record.swarm === "object" ? record.swarm : null,
    swarmRun: deriveSwarmRunProjection(record),
    logTree: buildRunLogTree(record)
  };
}

function buildRunTimeline(records) {
  const list = Array.isArray(records) ? records : [];
  const items = list
    .map((record) => {
      const normalized = normalizeRunConsoleRecord(record);
      if (!normalized) return null;
      const startedMs = parseDateMs(normalized.ranAt);
      return {
        runId: normalized.runId,
        status: normalized.status,
        durationMs: normalized.durationMs == null ? 0 : normalized.durationMs,
        startedMs,
        ranAt: normalized.ranAt
      };
    })
    .filter(Boolean);

  const max = items.reduce((m, it) => Math.max(m, it.durationMs || 0), 0);
  return items.map((it) => ({
    ...it,
    barRatio: max > 0 ? Math.min(1, (it.durationMs || 0) / max) : 0
  }));
}

function nodeMatchesQuery(node, query) {
  const text = String(query || "").trim().toLowerCase();
  if (!text) return true;
  const haystack = [
    node?.id,
    node?.label,
    node?.type,
    node?.status,
    node?.text
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(text);
}

function nodeIsError(node) {
  if (!node) return false;
  if (node.type === "error") return true;
  if (node.type === "stream" && node.id === "stderr") return true;
  if (node.status === "failed" && node.type !== "stream") return true;
  return false;
}

function filterNodeTree(nodes, predicate) {
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const node of nodes) {
    const children = filterNodeTree(node?.children, predicate);
    const selfMatches = predicate(node);
    if (selfMatches || children.length > 0) {
      out.push({ ...node, children });
    }
  }
  return out;
}

function filterRunLogTree(tree, { query = "", errorsOnly = false } = {}) {
  return filterNodeTree(tree, (node) => {
    if (errorsOnly && !nodeIsError(node) && !(Array.isArray(node?.children) && node.children.some(nodeIsError))) {
      return false;
    }
    return nodeMatchesQuery(node, query);
  });
}

function formatRunDuration(ms) {
  const n = clampNumber(ms);
  if (n == null) return "—";
  if (n < 1000) return `${Math.round(n)} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)} s`;
  const minutes = Math.floor(n / 60_000);
  const seconds = Math.round((n % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Compact zero-padded duration for the swarm cockpit tables and cards —
 * Claude Code Background-tasks format: "04s", "15s", "1m 04s". A separate
 * formatter (not a change to formatRunDuration) so existing non-swarm
 * run-console surfaces keep their ms-precision rendering untouched.
 */
function formatCompactRunDuration(ms) {
  if (ms == null) return "—";
  const n = clampNumber(ms);
  if (n == null) return "—";
  const totalSeconds = Math.max(0, Math.round(n / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const padded = String(seconds).padStart(2, "0");
  if (minutes <= 0) return `${padded}s`;
  return `${minutes}m ${padded}s`;
}

function downloadRunBundle({ record, runId, sourceId } = {}) {
  const normalized = normalizeRunConsoleRecord(record || {});
  return {
    kind: RUN_LOG_BUNDLE_KIND,
    exportedAt: new Date().toISOString(),
    runId: safeString(runId).trim() || (normalized ? normalized.runId : ""),
    sourceId: safeString(sourceId).trim() || (normalized ? normalized.sourceId : ""),
    record: normalized
  };
}

export {
  RUN_LOG_BUNDLE_KIND,
  DEFAULT_EXPORT_TARGETS,
  normalizeRunConsoleRecord,
  deriveRunSummary,
  deriveSwarmRunProjection,
  deriveSwarmGraphProjection,
  formatCompactRunDuration,
  deriveRunLifecycle,
  buildRunLogTree,
  buildRunTimeline,
  filterRunLogTree,
  formatRunDuration,
  downloadRunBundle
};
