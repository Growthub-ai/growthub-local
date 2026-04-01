/**
 * GrowthubQueryEnginePort — session-aware orchestration primitives.
 *
 * Extracted from nirholas/claude-code QueryEngine.ts + autoCompact.ts patterns.
 * Provides phase-tagged session tracking, budget visibility, and circuit-breaker
 * logic without imposing turn caps or token limits that would handicap agents.
 * Adapters with native context management (claude_local, codex_local) remain
 * fully autonomous — these primitives observe and advise, never restrict.
 */

// ---------------------------------------------------------------------------
// Phase tags — from coordinatorMode.ts 4-phase orchestration model
// ---------------------------------------------------------------------------

export type GrowthubPhaseTag =
  | "research"
  | "synthesis"
  | "implementation"
  | "verification";

// ---------------------------------------------------------------------------
// Configuration — no hard caps, circuit breaker only
// ---------------------------------------------------------------------------

export interface GrowthubQueryEngineConfig {
  /**
   * Token buffer used for auto-compact awareness signaling.
   * This does NOT cap usage — it tells callers when the session is nearing
   * the context window so they can decide whether to rotate.
   * Default 13_000 (from autoCompact.ts AUTOCOMPACT_BUFFER_TOKENS).
   */
  autoCompactBufferTokens: number;

  /**
   * Circuit breaker: consecutive adapter failures before recommending
   * session rotation. Protects against broken sessions that keep failing.
   * Default 3 (from autoCompact.ts MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES).
   */
  maxConsecutiveFailures: number;
}

export const DEFAULT_GROWTHUB_QUERY_ENGINE_CONFIG: GrowthubQueryEngineConfig = {
  autoCompactBufferTokens: 13_000,
  maxConsecutiveFailures: 3,
};

// ---------------------------------------------------------------------------
// Turn result — what comes back from a single heartbeat run
// ---------------------------------------------------------------------------

export interface GrowthubTurnResult {
  runId: string;
  agentId: string;
  summary: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  };
  costUsd: number | null;
  stopReason:
    | "completed"
    | "failed"
    | "timed_out"
    | "cancelled"
    | "circuit_breaker";
  sessionId: string | null;
  sessionRotated: boolean;
  phaseTag: GrowthubPhaseTag | null;
}

// ---------------------------------------------------------------------------
// Session state — immutable tracking across heartbeat runs
// ---------------------------------------------------------------------------

export interface GrowthubSessionState {
  sessionId: string;
  turnCount: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  consecutiveFailures: number;
  createdAt: string;
  lastActivityAt: string;
  phaseHistory: GrowthubPhaseTag[];
}

export function createGrowthubSessionState(sessionId: string): GrowthubSessionState {
  const now = new Date().toISOString();
  return {
    sessionId,
    turnCount: 0,
    cumulativeInputTokens: 0,
    cumulativeOutputTokens: 0,
    consecutiveFailures: 0,
    createdAt: now,
    lastActivityAt: now,
    phaseHistory: [],
  };
}

// ---------------------------------------------------------------------------
// State tracking — immutable update after each run
// ---------------------------------------------------------------------------

export function trackTurnResult(
  state: GrowthubSessionState,
  result: GrowthubTurnResult,
): GrowthubSessionState {
  const failed =
    result.stopReason === "failed" || result.stopReason === "timed_out";

  return {
    ...state,
    sessionId: result.sessionId ?? state.sessionId,
    turnCount: state.turnCount + 1,
    cumulativeInputTokens:
      state.cumulativeInputTokens + result.usage.inputTokens,
    cumulativeOutputTokens:
      state.cumulativeOutputTokens + result.usage.outputTokens,
    consecutiveFailures: failed ? state.consecutiveFailures + 1 : 0,
    lastActivityAt: new Date().toISOString(),
    phaseHistory: result.phaseTag
      ? [...state.phaseHistory, result.phaseTag]
      : state.phaseHistory,
  };
}

// ---------------------------------------------------------------------------
// Session rotation evaluation
// ---------------------------------------------------------------------------

export interface GrowthubRotationDecision {
  rotate: boolean;
  reason: string | null;
}

/**
 * Evaluates whether a session should be rotated.
 *
 * This does NOT enforce rotation — the caller (heartbeat) decides whether
 * to act on the recommendation. Adapters with native context management
 * (claude_local, codex_local) handle their own rotation; this circuit
 * breaker only fires for genuinely broken sessions.
 */
export function evaluateGrowthubSessionRotation(
  state: GrowthubSessionState,
  config: GrowthubQueryEngineConfig = DEFAULT_GROWTHUB_QUERY_ENGINE_CONFIG,
): GrowthubRotationDecision {
  // Circuit breaker: consecutive failures indicate a broken session
  if (
    config.maxConsecutiveFailures > 0 &&
    state.consecutiveFailures >= config.maxConsecutiveFailures
  ) {
    return {
      rotate: true,
      reason: `${state.consecutiveFailures} consecutive failures — session may be corrupted`,
    };
  }

  return { rotate: false, reason: null };
}

// ---------------------------------------------------------------------------
// Auto-compact awareness (observation, not enforcement)
// ---------------------------------------------------------------------------

export interface GrowthubCompactSignal {
  nearingLimit: boolean;
  utilizationPercent: number;
  bufferTokensRemaining: number;
}

/**
 * Signals when a session is nearing its context window.
 * Does NOT trigger compaction — adapters with native context management
 * handle that themselves. This is for UI/logging awareness only.
 *
 * @param contextWindowTokens - The model's total context window size
 */
export function getCompactSignal(
  state: GrowthubSessionState,
  contextWindowTokens: number,
  config: GrowthubQueryEngineConfig = DEFAULT_GROWTHUB_QUERY_ENGINE_CONFIG,
): GrowthubCompactSignal {
  const totalUsed = state.cumulativeInputTokens + state.cumulativeOutputTokens;
  const bufferTokensRemaining = Math.max(
    0,
    contextWindowTokens - totalUsed - config.autoCompactBufferTokens,
  );
  const utilizationPercent =
    contextWindowTokens > 0
      ? Math.min(100, Math.round((totalUsed / contextWindowTokens) * 100))
      : 0;

  return {
    nearingLimit: bufferTokensRemaining <= 0,
    utilizationPercent,
    bufferTokensRemaining,
  };
}
