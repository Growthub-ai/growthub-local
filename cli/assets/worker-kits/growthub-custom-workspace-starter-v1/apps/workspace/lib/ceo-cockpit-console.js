/**
 * CEO cockpit projection — the governed "chief orchestrator" oversight lens
 * over the existing agent-swarm fleet (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1
 * + CEO_PRIMITIVE_COCKPIT_ROADMAP_V1).
 *
 * This is a PURE deriver — no React, no fetch, no fs, no config writes, no
 * localStorage, no CSS. It takes the workspace config (and, optionally, the
 * agent-outcomes receipt stream) and emits a low-entropy view-model the
 * CeoCockpit component renders. It introduces NO new governed object, NO new
 * API, NO new PATCH field: the CEO oversees the same `sandbox-environment`
 * swarm-workflows the Background Tasks cockpit executes, and every "Open"
 * routes back into that existing surface.
 *
 * Causation ITT shape (state -> eligibility -> guidance -> action): each swarm
 * workflow is a "direct report"; its run evidence + execution eligibility
 * derive a state, a human headline, and the single next action — and the fleet
 * rolls those up into one "needs your attention" pick so the CEO always knows
 * the next move without reading logs.
 *
 * Data sources (all already in the contract):
 *   - findSwarmRunRows(config)                       — the governed fleet
 *   - deriveSwarmWorkflowExecutionEligibility(entry) — the existing readiness gate
 *   - deriveSwarmRunProjection(row.lastResponse)     — the existing run projection
 *   - workspace:agent-outcomes receipts (optional)   — governance rollup only
 */

import { deriveSwarmRunProjection } from "./orchestration-run-console.js";
import {
  findSwarmRunRows,
  deriveSwarmWorkflowExecutionEligibility,
} from "./workspace-swarm-proposal.js";

// Parse the latest persisted run record off a swarm row. Mirrors the
// SwarmRunCockpit fallback exactly — row.lastResponse is the durable record
// when run history has not been re-fetched.
function parseRowRecord(row) {
  const raw = row?.lastResponse;
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

// Map a report state to the inherited run-console dot variant grammar
// (ok | fail | active | pending | canceled) — no new visual vocabulary.
function variantForState(state) {
  switch (state) {
    case "completed": return "ok";
    case "failing": return "fail";
    case "running": return "active";
    case "blocked": return "canceled";
    case "never-run":
    default: return "pending";
  }
}

// Next-action label per state — the CEO's verb, never a hidden flag.
function nextActionLabel(state) {
  switch (state) {
    case "blocked": return "Fix execution target";
    case "failing": return "Review failed run";
    case "never-run": return "Open to launch";
    case "running": return "Open running task";
    case "completed":
    default: return "Open task";
  }
}

// Classify one swarm workflow into exactly one report state. Blocked
// (no runnable execution target) takes priority because nothing else is
// actionable until it clears — the same truth the Play gate enforces.
function classifyReport(eligibility, projection) {
  if (!eligibility?.ready) return "blocked";
  const status = projection?.status;
  if (status === "failed") return "failing";
  if (status === "running" || status === "executing") return "running";
  if (status === "completed") return "completed";
  return "never-run";
}

// Human one-liner for a report card — plain language, no jargon.
function headlineForState(state, eligibility, agentCount) {
  switch (state) {
    case "blocked":
      return eligibility?.guidance || "Set an execution target before this can run.";
    case "failing":
      return "Last run failed — review the transcript and re-run.";
    case "running":
      return "Running now — open to watch progress.";
    case "completed":
      return `Completed · ${agentCount} agent${agentCount === 1 ? "" : "s"}.`;
    case "never-run":
    default:
      return `Ready · ${agentCount} agent${agentCount === 1 ? "" : "s"} · not run yet.`;
  }
}

// Attention priority: a CEO looks at what is broken first, then what is
// blocked, then what has never shipped. Healthy fleets surface nothing.
const ATTENTION_PRIORITY = ["failing", "blocked", "never-run"];

/**
 * Build the CEO cockpit view-model.
 *
 * @param {object} args
 * @param {object} args.workspaceConfig  live workspace config (GET /api/workspace)
 * @param {Array}  [args.receipts]       workspace:agent-outcomes stream (optional)
 * @returns {object} view-model — see module header.
 */
export function deriveCeoCockpit({ workspaceConfig, receipts = [] } = {}) {
  const entries = findSwarmRunRows(workspaceConfig);
  const safeReceipts = Array.isArray(receipts) ? receipts : [];

  const reports = entries.map((entry, index) => {
    const eligibility = deriveSwarmWorkflowExecutionEligibility(entry);
    const record = parseRowRecord(entry.row);
    const projection = record ? deriveSwarmRunProjection(record) : null;
    const state = classifyReport(eligibility, projection);
    const agentCount = Number.isFinite(Number(projection?.agentCount))
      ? Number(projection.agentCount)
      : Number(eligibility?.runnableNodeCount) || 0;
    const name = String(entry.row?.Name || "").trim();
    // Stable, collision-proof identity: object + row id (or Name) + index.
    // Two workflows that share a Name still get distinct reportIds, so the
    // attention filter and React keys never drop or merge a record.
    const rowKey = String(entry.row?.id || name || `row-${index}`).trim();
    const reportId = `${entry.objectId}::${rowKey}::${index}`;
    const lastRun = projection
      ? {
          status: projection.status,
          runId: projection.runId || null,
          totalTokens: projection.totalTokens ?? null,
          totalTools: projection.totalTools ?? null,
          elapsedMs: projection.elapsedMs ?? null,
        }
      : null;

    return {
      reportId,
      objectId: entry.objectId,
      name,
      objectLabel: entry.objectLabel || null,
      lifecycleStatus: String(entry.row?.lifecycleStatus || "draft"),
      version: String(entry.row?.version || "1"),
      agentCount,
      state,
      variant: variantForState(state),
      readiness: {
        ready: eligibility.ready,
        status: eligibility.status,
        missing: eligibility.missing,
        guidance: eligibility.guidance,
        adapter: eligibility.adapter,
        agentHost: eligibility.agentHost,
      },
      lastRun,
      headline: headlineForState(state, eligibility, agentCount),
      nextAction: {
        label: nextActionLabel(state),
        // Routes through the EXISTING swarm-run artifact surface — the CEO
        // cockpit never executes; it hands off to Background Tasks.
        artifact: name ? { surface: "swarm-run", objectId: entry.objectId, name } : null,
      },
    };
  });

  const countOf = (state) => reports.filter((r) => r.state === state).length;
  const fleet = {
    total: reports.length,
    runnable: reports.filter((r) => r.readiness.ready).length,
    blocked: countOf("blocked"),
    failing: countOf("failing"),
    neverRun: countOf("never-run"),
    running: countOf("running"),
    completed: countOf("completed"),
  };

  // The single next move for the CEO — the highest-priority report, or null
  // when the fleet is healthy. This is the causation "next action".
  let attention = null;
  for (const state of ATTENTION_PRIORITY) {
    const hit = reports.find((r) => r.state === state);
    if (hit) { attention = hit; break; }
  }

  // Governance rollup is a pure read over the receipt stream — blocked
  // mutation/execution attempts the CEO should be aware of. Zeroed when no
  // receipts were supplied (the cockpit still renders the fleet).
  const blockedAttempts = safeReceipts.filter(
    (r) => r && r.outcomeStatus === "blocked"
  ).length;

  return {
    title: "CEO Cockpit",
    fleet,
    attention,
    reports,
    governance: { blockedAttempts },
    generatedFromReceipts: safeReceipts.length > 0,
  };
}

export default deriveCeoCockpit;
