/**
 * @growthub/api-contract — Swarm Run (v1)
 *
 * Governed swarm runs on the 0.14 creation spine. A swarm run is just
 * another governed object: `swarm.run.propose` → receipt → orchestration-
 * graph node. The proposal/receipt envelope mirrors the workspace-helper
 * shape (helper.ts) — 1:1 parity with sandbox object creation is a
 * type-level constraint enforced through the shared base envelope below.
 *
 * Wire shape (governed workspace — docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md):
 *   swarm runs execute through the EXISTING governed runner
 *   (`POST /api/workspace/sandbox-run`) and persist as run records whose
 *   payload carries the agent-swarm `swarm` + `logTree` blocks; the
 *   cockpit derives `SwarmRunNode` trees from `GET /api/workspace` via
 *   the kit's `lib/swarm-cockpit-projection.js`. These types freeze that
 *   projection so every surface renders the same tree.
 *
 * Rules:
 *   - Additive only. Event types may be appended, never renamed.
 *   - Consumers MUST ignore unknown event types (CMS SDK v1 stream rule).
 *   - Propose never executes. Approval flows through the existing
 *     approvals service (`swarm.run.propose` is one more approvable kind).
 */

// ---------------------------------------------------------------------------
// Shared governed-proposal base (sandbox-object parity, type-level)
// ---------------------------------------------------------------------------

/**
 * Base envelope every governed proposal shares with the workspace-helper
 * proposal (helper.ts WorkspaceHelperProposal): a stable type, an untyped
 * payload validated at apply time, and a one-line human rationale.
 */
export interface GovernedProposalBase {
  /** Stable proposal type — determines the apply route. */
  type: string;
  /** The payload to apply; validated server-side at apply time. */
  payload: Record<string, unknown>;
  /** One-line human rationale for why this change was proposed. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Node kinds + statuses (the orchestration-graph vocabulary)
// ---------------------------------------------------------------------------

export type SwarmNodeKind = "swarm.run" | "swarm.phase" | "swarm.agent";
export type SwarmNodeStatus = "pending" | "running" | "done" | "error" | "skipped";
export type SwarmRunStatus = "pending" | "running" | "paused" | "done" | "error" | "stopped";

export const SWARM_NODE_KINDS: SwarmNodeKind[] = ["swarm.run", "swarm.phase", "swarm.agent"];
export const SWARM_NODE_STATUSES: SwarmNodeStatus[] = ["pending", "running", "done", "error", "skipped"];

// ---------------------------------------------------------------------------
// Plan (the JS runner walks this: phase() → agent(); parallel within phase,
// pipeline across phases)
// ---------------------------------------------------------------------------

export interface SwarmPlanAgent {
  label: string;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface SwarmPlanPhase {
  label: string;
  agents: SwarmPlanAgent[];
}

export interface SwarmPlan {
  /** Clamped server-side to the concurrency cap. */
  maxConcurrency?: number;
  phases: SwarmPlanPhase[];
}

// ---------------------------------------------------------------------------
// Proposal + receipts (same review/apply flow as workspace-helper)
// ---------------------------------------------------------------------------

export interface SwarmRunProposal extends GovernedProposalBase {
  type: "swarm.run.propose";
  payload: {
    name: string;
    description?: string;
    plan: SwarmPlan;
    goal?: { condition: string };
    outcome?: { rubric: string; maxIterations?: number };
    budget?: { maxTokens?: number };
    resumeFromRunId?: string;
    /** Persist the plan as a named workflow after a successful run. */
    saveAsWorkflow?: string;
  };
  rationale: string;
}

export type SwarmReceiptType =
  | "swarm.run.proposed"
  | "swarm.run.spawned"
  | "swarm.agent.completed"
  | "swarm.run.completed";

/** Receipt written on every transition; terminal receipt carries resultHash. */
export interface SwarmRunReceipt {
  type: SwarmReceiptType;
  runId: string;
  at: string;
  nodeId?: string;
  label?: string;
  status?: SwarmNodeStatus | SwarmRunStatus;
  /** sha256 (short) of the node/run result payload. */
  resultHash?: string;
  approvalId?: string;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Graph nodes (exact cockpit fields: label, phase, tokens, tools, time)
// ---------------------------------------------------------------------------

export interface SwarmAgentNode {
  kind: "swarm.agent";
  id: string;
  parentId: string;
  label: string;
  status: SwarmNodeStatus;
  /** Estimated (chars/4) unless an executor reports exact counts. */
  tokens: number | null;
  toolUses: number | null;
  durationMs: number | null;
  /** True when replayed from a resume journal. */
  cached?: boolean;
  output?: string;
}

export interface SwarmPhaseNode {
  kind: "swarm.phase";
  id: string;
  parentId: string;
  label: string;
  status: SwarmNodeStatus;
  agents: SwarmAgentNode[];
}

export interface SwarmRunNode {
  kind: "swarm.run";
  runId: string;
  name: string;
  description: string;
  status: SwarmRunStatus;
  approvalId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  totals: { agents: number; tokens: number; toolUses: number };
  budget: { maxTokens: number | null; spentTokens: number };
  goal: {
    condition: string;
    status: "active" | "satisfied" | "unsatisfied" | "unknown";
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

export interface SwarmRunProposeResponse {
  ok: boolean;
  runId: string;
  approvalId: string | null;
  status: SwarmRunStatus;
  error?: string;
}

// ---------------------------------------------------------------------------
// NDJSON stream — ExecutionEvent (events.ts) carries node transitions;
// swarm-specific variants extend the vocabulary additively.
// ---------------------------------------------------------------------------

export type SwarmRunEventType =
  | "swarm.run.start"
  | "swarm.run.end"
  | "swarm.phase.start"
  | "swarm.phase.end"
  | "swarm.agent.start"
  | "swarm.agent.end"
  | "goal_evaluation_start"
  | "goal_evaluation_end"
  | "outcome_evaluation_start"
  | "outcome_evaluation_ongoing"
  | "outcome_evaluation_end"
  | "heartbeat";

export interface SwarmRunEvent {
  type: SwarmRunEventType;
  runId: string;
  at: string;
  nodeId?: string;
  phaseId?: string;
  label?: string;
  status?: string;
  tokens?: number | null;
  toolUses?: number | null;
  durationMs?: number | null;
  cached?: boolean;
  iteration?: number;
  verdict?: "satisfied" | "needs_revision" | "max_iterations_reached";
  score?: number | null;
  reason?: string;
  /** "evaluated-v1" | "structural-fallback" — how a grade was measured. */
  gradeKind?: string;
  totals?: { agents: number; tokens: number; toolUses: number };
  error?: string;
}

export function isSwarmRunEvent(value: unknown): value is SwarmRunEvent {
  if (!value || typeof value !== "object") return false;
  const record = value as { type?: unknown; runId?: unknown; at?: unknown };
  return (
    typeof record.type === "string" &&
    typeof record.runId === "string" &&
    typeof record.at === "string"
  );
}

// ---------------------------------------------------------------------------
// Caps (informative mirrors of the server enforcement)
// ---------------------------------------------------------------------------

export const SWARM_MAX_CONCURRENT_AGENTS = 16;
export const SWARM_MAX_AGENTS_PER_RUN = 64;

export const SWARM_RUN_CONTRACT_VERSION = 1 as const;
