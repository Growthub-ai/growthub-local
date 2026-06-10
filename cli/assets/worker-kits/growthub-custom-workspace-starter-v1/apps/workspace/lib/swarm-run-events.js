/**
 * Growthub Swarm Run Store V1 — governed swarm-run registry + event bus.
 *
 * A swarm run is just another governed object on the 0.14 creation spine:
 *
 *   propose  → a SwarmRunProposal receipt (review step, never auto-mutates)
 *   approve  → human click in the cockpit OR remembered per-workflow approval
 *   run      → graph nodes (run → phase → agent) advanced by the JS runner
 *   receipts → spawn / completion / terminal receipts appended to the same
 *              source-records sidecar the workspace helper uses
 *
 * Wire format for /api/workspace/swarm-runs/[runId]/events is NDJSON —
 * one SwarmRunEvent per line, replay-then-live. Consumers MUST ignore
 * unknown event types (same rule as the CMS SDK v1 ExecutionEvent stream).
 *
 * Hard invariants:
 *   - in-process only; never spawns anything itself (the plan runner and the
 *     agent-swarm runtime dispatch through the sandbox adapter registry)
 *   - never stores secret values — agent outputs pass through the caller's
 *     redaction before reaching this store
 *   - additive event vocabulary; ids are stable for resume journaling
 */

import { EventEmitter } from "node:events";

const SWARM_RUN_CONTRACT_KIND = "growthub-swarm-run-v1";
const SWARM_RUN_RECEIPTS_SOURCE_KEY = "swarm:run:receipts";
const SWARM_APPROVAL_MEMORY_SOURCE_KEY = "swarm:approval-memory";
const SWARM_SAVED_WORKFLOWS_SOURCE_KEY = "swarm:saved-workflows";

// Phase F hardening caps — hard ceilings, not defaults.
const MAX_CONCURRENT_AGENTS = 16;
const MAX_AGENTS_PER_RUN = 64;
const MAX_RUNS_RETAINED = 50;
const MAX_AGENT_OUTPUT_CHARS = 8000;

const RUN_STATUSES = ["pending", "running", "done", "error", "stopped"];
const NODE_STATUSES = ["pending", "running", "done", "error", "skipped"];

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/** runId → run record (insertion ordered). Module-level: one per server process. */
const runs = new Map();
let runCounter = 0;

function nowIso() {
  return new Date().toISOString();
}

function estimateTokens(text) {
  const length = String(text || "").length;
  if (!length) return 0;
  return Math.ceil(length / 4);
}

function clampOutput(text) {
  const s = String(text || "");
  return s.length > MAX_AGENT_OUTPUT_CHARS
    ? `${s.slice(0, MAX_AGENT_OUTPUT_CHARS)}\n…[truncated]`
    : s;
}

function newRunId() {
  runCounter += 1;
  return `swr_${Date.now().toString(36)}_${runCounter.toString(36)}`;
}

function pruneRuns() {
  while (runs.size > MAX_RUNS_RETAINED) {
    const oldestKey = runs.keys().next().value;
    const oldest = runs.get(oldestKey);
    // Never prune a run that is still live.
    if (oldest && (oldest.status === "running" || oldest.status === "pending")) break;
    runs.delete(oldestKey);
  }
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

/**
 * Register a proposed run. `proposal` is the governed SwarmRunProposal —
 * the caller (route) has already validated it and written the proposal
 * receipt. Returns the run record.
 */
function createRun(proposal, options = {}) {
  const runId = options.resumeRunId || newRunId();
  const run = {
    kind: SWARM_RUN_CONTRACT_KIND,
    runId,
    name: String(proposal?.name || "swarm-run").trim() || "swarm-run",
    runKind: proposal?.runKind === "agent" ? "agent" : "workflow",
    description: String(proposal?.description || "").trim(),
    status: "pending",
    proposal,
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    phases: [],
    totals: { agents: 0, tokens: 0, toolUses: 0 },
    budget: {
      maxTokens: Number(proposal?.budget?.maxTokens) > 0 ? Math.floor(proposal.budget.maxTokens) : null,
      spentTokens: 0
    },
    resumeFromRunId: String(proposal?.resumeFromRunId || "").trim() || null,
    goal: proposal?.goal && typeof proposal.goal === "object"
      ? {
          condition: String(proposal.goal.condition || "").slice(0, 4096),
          status: "active",
          evaluations: 0,
          lastScore: null,
          lastReason: ""
        }
      : null,
    outcome: proposal?.outcome && typeof proposal.outcome === "object"
      ? {
          rubric: String(proposal.outcome.rubric || "").slice(0, 8192),
          maxIterations: Math.max(1, Math.min(5, Number(proposal.outcome.maxIterations) || 1)),
          iteration: 0,
          status: "pending"
        }
      : null,
    stopRequested: false,
    error: "",
    journal: new Map(), // `${phaseLabel}::${agentLabel}` → completed agent node (resume cache)
    events: [] // replay journal for the NDJSON stream
  };
  runs.set(runId, run);
  pruneRuns();
  emitRunEvent(run, { type: "run.proposed", name: run.name, runKind: run.runKind });
  return run;
}

function getRun(runId) {
  return runs.get(String(runId || "").trim()) || null;
}

function listRuns() {
  return Array.from(runs.values()).reverse();
}

function requestStop(runId) {
  const run = getRun(runId);
  if (!run) return null;
  if (run.status === "running" || run.status === "pending") {
    run.stopRequested = true;
    emitRunEvent(run, { type: "run.stop_requested" });
  }
  return run;
}

function clearFinishedRuns() {
  let cleared = 0;
  for (const [id, run] of runs) {
    if (run.status === "done" || run.status === "error" || run.status === "stopped") {
      runs.delete(id);
      cleared += 1;
    }
  }
  return cleared;
}

// ---------------------------------------------------------------------------
// Graph transitions (called by the JS runner / instrumented swarm runtime)
// ---------------------------------------------------------------------------

function markRunStarted(run) {
  run.status = "running";
  run.startedAt = nowIso();
  emitRunEvent(run, { type: "run.start" });
}

function openPhase(run, label) {
  const phase = {
    id: `phase-${run.phases.length + 1}`,
    label: String(label || `Phase ${run.phases.length + 1}`),
    status: "running",
    startedAt: nowIso(),
    finishedAt: null,
    agents: []
  };
  run.phases.push(phase);
  emitRunEvent(run, { type: "phase.start", phaseId: phase.id, label: phase.label });
  return phase;
}

function closePhase(run, phase, status = "done") {
  phase.status = NODE_STATUSES.includes(status) ? status : "done";
  phase.finishedAt = nowIso();
  emitRunEvent(run, { type: "phase.end", phaseId: phase.id, label: phase.label, status: phase.status });
}

function startAgent(run, phase, label) {
  const agent = {
    id: `${phase.id}-agent-${phase.agents.length + 1}`,
    label: String(label || `agent-${phase.agents.length + 1}`),
    status: "running",
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: null,
    tokens: null,
    toolUses: null,
    output: "",
    cached: false
  };
  phase.agents.push(agent);
  run.totals.agents += 1;
  emitRunEvent(run, {
    type: "agent.start",
    phaseId: phase.id,
    agentId: agent.id,
    label: agent.label
  });
  return agent;
}

function endAgent(run, phase, agent, result = {}) {
  agent.status = result.status === "error" ? "error" : result.status === "skipped" ? "skipped" : "done";
  agent.finishedAt = nowIso();
  agent.durationMs = Number(result.durationMs) >= 0 ? Number(result.durationMs) : Date.parse(agent.finishedAt) - Date.parse(agent.startedAt);
  agent.output = clampOutput(result.output || "");
  agent.tokens = Number.isFinite(result.tokens) ? Number(result.tokens) : estimateTokens(agent.output);
  agent.toolUses = Number.isFinite(result.toolUses) ? Number(result.toolUses) : null;
  agent.cached = result.cached === true;
  run.totals.tokens += agent.tokens || 0;
  run.totals.toolUses += agent.toolUses || 0;
  run.budget.spentTokens += agent.tokens || 0;
  run.journal.set(`${phase.label}::${agent.label}`, {
    status: agent.status,
    output: agent.output,
    tokens: agent.tokens,
    toolUses: agent.toolUses,
    durationMs: agent.durationMs
  });
  emitRunEvent(run, {
    type: "agent.end",
    phaseId: phase.id,
    agentId: agent.id,
    label: agent.label,
    status: agent.status,
    tokens: agent.tokens,
    toolUses: agent.toolUses,
    durationMs: agent.durationMs,
    cached: agent.cached
  });
}

function finishRun(run, status, error = "") {
  if (run.status === "done" || run.status === "error" || run.status === "stopped") return;
  run.status = RUN_STATUSES.includes(status) ? status : "done";
  run.finishedAt = nowIso();
  run.durationMs = run.startedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : null;
  run.error = String(error || "");
  for (const phase of run.phases) {
    if (phase.status === "running") closePhase(run, phase, run.status === "done" ? "done" : "error");
  }
  emitRunEvent(run, {
    type: "run.end",
    status: run.status,
    durationMs: run.durationMs,
    totals: { ...run.totals },
    error: run.error || undefined
  });
}

function isOverBudget(run) {
  return run.budget.maxTokens != null && run.budget.spentTokens >= run.budget.maxTokens;
}

function lookupJournal(resumeRun, phaseLabel, agentLabel) {
  if (!resumeRun) return null;
  return resumeRun.journal.get(`${phaseLabel}::${agentLabel}`) || null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function emitRunEvent(run, partial) {
  const event = { ...partial, runId: run.runId, at: nowIso() };
  run.events.push(event);
  if (run.events.length > 4000) run.events.splice(0, run.events.length - 4000);
  emitter.emit("event", event);
  emitter.emit(`event:${run.runId}`, event);
  return event;
}

/** Emit a custom event (goal / outcome / loop vocabulary) onto a run stream. */
function emitCustomRunEvent(runId, partial) {
  const run = getRun(runId);
  if (!run) return null;
  return emitRunEvent(run, partial);
}

function subscribeRunEvents(runId, listener) {
  const channel = runId ? `event:${runId}` : "event";
  emitter.on(channel, listener);
  return () => emitter.off(channel, listener);
}

// ---------------------------------------------------------------------------
// Projections (what the cockpit renders — exactly the screenshot fields)
// ---------------------------------------------------------------------------

function projectAgent(agent) {
  return {
    id: agent.id,
    label: agent.label,
    status: agent.status,
    tokens: agent.tokens,
    toolUses: agent.toolUses,
    durationMs: agent.durationMs,
    cached: agent.cached
  };
}

function projectRun(run, { includeOutputs = false } = {}) {
  return {
    kind: SWARM_RUN_CONTRACT_KIND,
    runId: run.runId,
    name: run.name,
    runKind: run.runKind,
    description: run.description,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs != null
      ? run.durationMs
      : run.startedAt && run.status === "running"
        ? Date.now() - Date.parse(run.startedAt)
        : null,
    totals: { ...run.totals },
    budget: { ...run.budget },
    goal: run.goal ? { ...run.goal } : null,
    outcome: run.outcome ? { ...run.outcome } : null,
    error: run.error || "",
    phases: run.phases.map((phase) => ({
      id: phase.id,
      label: phase.label,
      status: phase.status,
      agents: phase.agents.map((agent) =>
        includeOutputs ? { ...projectAgent(agent), output: agent.output } : projectAgent(agent)
      )
    }))
  };
}

function projectRunList() {
  const all = listRuns();
  return {
    running: all.filter((r) => r.status === "running" || r.status === "pending").map((r) => projectRun(r)),
    finished: all.filter((r) => r.status === "done" || r.status === "error" || r.status === "stopped").map((r) => projectRun(r))
  };
}

export {
  SWARM_RUN_CONTRACT_KIND,
  SWARM_RUN_RECEIPTS_SOURCE_KEY,
  SWARM_APPROVAL_MEMORY_SOURCE_KEY,
  SWARM_SAVED_WORKFLOWS_SOURCE_KEY,
  MAX_CONCURRENT_AGENTS,
  MAX_AGENTS_PER_RUN,
  RUN_STATUSES,
  NODE_STATUSES,
  createRun,
  getRun,
  listRuns,
  requestStop,
  clearFinishedRuns,
  markRunStarted,
  openPhase,
  closePhase,
  startAgent,
  endAgent,
  finishRun,
  isOverBudget,
  lookupJournal,
  emitCustomRunEvent,
  subscribeRunEvents,
  projectRun,
  projectRunList,
  estimateTokens
};
