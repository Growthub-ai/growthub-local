/**
 * @growthub/api-contract — Swarm Run (v1)
 *
 * Typed surface for governed agent-swarm runs: the Background-tasks cockpit
 * contract. A swarm run is just another governed object on the workspace
 * creation spine — propose → receipt → orchestration-graph node — and its
 * progress streams as NDJSON, one event per line, exactly like the CMS SDK
 * v1 ExecutionEvent stream.
 *
 * Wire shape:
 *   GET  /api/workspace/swarm-runs                     → SwarmRunListResponse
 *   POST /api/workspace/swarm-runs  {action:"propose"} → governed proposal
 *   POST /api/workspace/swarm-runs  {action:"start"}   → approval + launch
 *   GET  /api/workspace/swarm-runs/:id/events          → NDJSON SwarmRunEvent
 *
 * Rules:
 *   - Additive only. Event types may be appended, never renamed.
 *   - Consumers MUST ignore unknown event types without erroring.
 *   - Propose never executes; start is the explicit approval step.
 *   - Every transition leaves a receipt in the same source-records sidecar
 *     the workspace-helper apply receipts use.
 */

// ---------------------------------------------------------------------------
// Node statuses + run kinds
// ---------------------------------------------------------------------------

export type SwarmRunStatus = "pending" | "running" | "done" | "error" | "stopped";
export type SwarmNodeStatus = "pending" | "running" | "done" | "error" | "skipped";
export type SwarmRunKind = "workflow" | "agent";

export const SWARM_RUN_STATUSES: SwarmRunStatus[] = ["pending", "running", "done", "error", "stopped"];
export const SWARM_NODE_STATUSES: SwarmNodeStatus[] = ["pending", "running", "done", "error", "skipped"];

// ---------------------------------------------------------------------------
// Hardening caps (mirrored from the runtime — informative, not configurable)
// ---------------------------------------------------------------------------

export const SWARM_MAX_CONCURRENT_AGENTS = 16;
export const SWARM_MAX_AGENTS_PER_RUN = 64;

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

/** One agent inside a declarative plan phase. */
export interface SwarmPlanAgent {
  label: string;
  prompt: string;
  /** Optional per-agent adapter override (prompt-capable adapters only). */
  adapter?: string;
  agentHost?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/** One plan phase; agents inside a phase run concurrently (bounded). */
export interface SwarmPlanPhase {
  label: string;
  agents: SwarmPlanAgent[];
}

/** Declarative swarm plan — walked by the JS plan runner. */
export interface SwarmPlan {
  maxConcurrency?: number;
  phases: SwarmPlanPhase[];
}

/** Reference to a sandbox-environment row holding an agent-swarm-v1 graph. */
export interface SwarmWorkflowRef {
  objectId: string;
  rowId: string;
}

/** Verifiable goal condition attached to a run (≤ 4096 chars). */
export interface SwarmGoalSpec {
  condition: string;
}

/** Outcome rubric + revision loop (managed-agents define-outcomes parity). */
export interface SwarmOutcomeSpec {
  rubric: string;
  /** 1–5; the run re-dispatches with revision notes until satisfied. */
  maxIterations?: number;
}

/**
 * The governed proposal. Exactly one of plan / workflowRef / workflowName
 * selects the execution source.
 */
export interface SwarmRunProposal {
  name: string;
  runKind?: SwarmRunKind;
  description?: string;
  plan?: SwarmPlan;
  workflowRef?: SwarmWorkflowRef;
  /** Saved-workflow name (slash-command `/<name>` resolution). */
  workflowName?: string;
  goal?: SwarmGoalSpec;
  outcome?: SwarmOutcomeSpec;
  budget?: { maxTokens?: number };
  /** Replay completed agents from a prior run's journal. */
  resumeFromRunId?: string;
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export type SwarmReceiptType = "swarm.run.proposed" | "swarm.run.approved" | "swarm.run.completed";

export interface SwarmRunReceipt {
  type: SwarmReceiptType;
  runId: string;
  name: string;
  at: string;
  /** Present on completion receipts: short sha256 of the final output. */
  resultHash?: string;
  status?: SwarmRunStatus;
  durationMs?: number | null;
  approvedBy?: string | null;
  /** True when approval came from per-workflow approval memory. */
  remembered?: boolean;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Graph projection (what the cockpit renders)
// ---------------------------------------------------------------------------

export interface SwarmAgentNode {
  id: string;
  label: string;
  status: SwarmNodeStatus;
  /** Estimated tokens (chars/4 of prompt+output); null while running. */
  tokens: number | null;
  /** Adapter-reported tool uses; null when the adapter does not report. */
  toolUses: number | null;
  durationMs: number | null;
  /** True when the result was replayed from a resume journal. */
  cached?: boolean;
  /** Present only on the detail projection. */
  output?: string;
}

export interface SwarmPhaseNode {
  id: string;
  label: string;
  status: SwarmNodeStatus;
  agents: SwarmAgentNode[];
}

export interface SwarmRunNode {
  kind: "growthub-swarm-run-v1";
  runId: string;
  name: string;
  runKind: SwarmRunKind;
  description: string;
  status: SwarmRunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  totals: { agents: number; tokens: number; toolUses: number };
  budget: { maxTokens: number | null; spentTokens: number };
  goal: {
    condition: string;
    status: "active" | "satisfied" | "unsatisfied" | "unknown";
    evaluations: number;
    lastScore: number | null;
    lastReason: string;
  } | null;
  outcome: {
    rubric: string;
    maxIterations: number;
    iteration: number;
    status: "pending" | "satisfied" | "needs_revision" | "max_iterations_reached";
  } | null;
  error: string;
  phases: SwarmPhaseNode[];
}

export interface SwarmRunListResponse {
  ok: boolean;
  running: SwarmRunNode[];
  finished: SwarmRunNode[];
}

// ---------------------------------------------------------------------------
// NDJSON event stream
// ---------------------------------------------------------------------------

export type SwarmRunEventType =
  | "run.proposed"
  | "run.start"
  | "run.stop_requested"
  | "run.end"
  | "phase.start"
  | "phase.end"
  | "agent.start"
  | "agent.end"
  | "goal.evaluation.start"
  | "goal.evaluation.end"
  | "outcome_evaluation_start"
  | "outcome_evaluation_ongoing"
  | "outcome_evaluation_end"
  | "heartbeat";

export interface SwarmRunEvent {
  type: SwarmRunEventType;
  runId: string;
  /** ISO-8601 timestamp. */
  at: string;
  phaseId?: string;
  agentId?: string;
  label?: string;
  status?: string;
  tokens?: number | null;
  toolUses?: number | null;
  durationMs?: number | null;
  cached?: boolean;
  totals?: { agents: number; tokens: number; toolUses: number };
  iteration?: number;
  verdict?: "satisfied" | "needs_revision" | "max_iterations_reached";
  score?: number | null;
  reason?: string;
  /** "evaluated-v1" | "structural-fallback" — how the grade was measured. */
  gradeKind?: string;
  condition?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isSwarmRunEvent(value: unknown): value is SwarmRunEvent {
  if (!value || typeof value !== "object") return false;
  const record = value as { type?: unknown; runId?: unknown; at?: unknown };
  return (
    typeof record.type === "string" &&
    typeof record.runId === "string" &&
    typeof record.at === "string"
  );
}

export function isSwarmRunNode(value: unknown): value is SwarmRunNode {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record["kind"] === "growthub-swarm-run-v1" &&
    typeof record["runId"] === "string" &&
    typeof record["status"] === "string" &&
    Array.isArray(record["phases"])
  );
}

// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------

export const SWARM_RUN_CONTRACT_VERSION = 1 as const;
