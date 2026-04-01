/**
 * Machine-level compute scheduler — controls concurrent agent runs.
 *
 * Extracted from nirholas/claude-code coordinatorMode.ts concurrency rules:
 *   - Read-only tasks (research phase) → parallel freely
 *   - Chrome agents → one at a time (enforced by chrome-lease.ts)
 *   - Per-adapter-type limits respected
 *   - Total machine limit prevents oversubscription
 *
 * This is additive to heartbeat's existing per-agent HEARTBEAT_MAX_CONCURRENT_RUNS.
 * It adds machine-wide limits so multiple agents don't overload the single machine.
 *
 * Configured via environment variables with sensible defaults.
 */

import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComputeLimits {
  maxConcurrentClaudeRuns: number;
  maxConcurrentCodexRuns: number;
  maxConcurrentBrowserAgents: number;
  maxTotalConcurrentRuns: number;
}

export type ComputeSlotResult =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterMs: number };

interface ActiveRunEntry {
  runId: string;
  agentId: string;
  adapterType: string;
  chrome: boolean;
  startedAt: number;
}

// ---------------------------------------------------------------------------
// State (module-scoped, single process)
// ---------------------------------------------------------------------------

const activeRuns = new Map<string, ActiveRunEntry>();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function readEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveComputeLimits(): ComputeLimits {
  return {
    maxConcurrentClaudeRuns: readEnvInt("PAPERCLIP_MAX_CLAUDE_RUNS", 2),
    maxConcurrentCodexRuns: readEnvInt("PAPERCLIP_MAX_CODEX_RUNS", 3),
    maxConcurrentBrowserAgents: readEnvInt("PAPERCLIP_MAX_BROWSER_AGENTS", 1),
    maxTotalConcurrentRuns: readEnvInt("PAPERCLIP_MAX_TOTAL_RUNS", 5),
  };
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function countByAdapterType(adapterType: string): number {
  let count = 0;
  for (const entry of activeRuns.values()) {
    if (entry.adapterType === adapterType) count++;
  }
  return count;
}

function countBrowserRuns(): number {
  let count = 0;
  for (const entry of activeRuns.values()) {
    if (entry.chrome) count++;
  }
  return count;
}

const DEFAULT_RETRY_MS = 10_000;

export function canScheduleRun(
  adapterType: string,
  chrome: boolean,
): ComputeSlotResult {
  const limits = resolveComputeLimits();

  // Total machine limit
  if (activeRuns.size >= limits.maxTotalConcurrentRuns) {
    return {
      allowed: false,
      reason: `Machine at capacity: ${activeRuns.size}/${limits.maxTotalConcurrentRuns} total runs`,
      retryAfterMs: DEFAULT_RETRY_MS,
    };
  }

  // Per-adapter-type limits
  if (adapterType === "claude_local") {
    const running = countByAdapterType("claude_local");
    if (running >= limits.maxConcurrentClaudeRuns) {
      return {
        allowed: false,
        reason: `Claude adapter at capacity: ${running}/${limits.maxConcurrentClaudeRuns}`,
        retryAfterMs: DEFAULT_RETRY_MS,
      };
    }
  }

  if (adapterType === "codex_local") {
    const running = countByAdapterType("codex_local");
    if (running >= limits.maxConcurrentCodexRuns) {
      return {
        allowed: false,
        reason: `Codex adapter at capacity: ${running}/${limits.maxConcurrentCodexRuns}`,
        retryAfterMs: DEFAULT_RETRY_MS,
      };
    }
  }

  // Browser limit (redundant with chrome-lease but provides a clean gate here)
  if (chrome) {
    const browserCount = countBrowserRuns();
    if (browserCount >= limits.maxConcurrentBrowserAgents) {
      return {
        allowed: false,
        reason: `Browser agents at capacity: ${browserCount}/${limits.maxConcurrentBrowserAgents}`,
        retryAfterMs: DEFAULT_RETRY_MS,
      };
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerActiveRun(
  runId: string,
  agentId: string,
  adapterType: string,
  chrome: boolean,
): void {
  activeRuns.set(runId, {
    runId,
    agentId,
    adapterType,
    chrome,
    startedAt: Date.now(),
  });
  logger.debug(
    { runId, agentId, adapterType, chrome, activeCount: activeRuns.size },
    "Compute scheduler: run registered",
  );
}

export function unregisterActiveRun(runId: string): void {
  const existed = activeRuns.delete(runId);
  if (existed) {
    logger.debug(
      { runId, activeCount: activeRuns.size },
      "Compute scheduler: run unregistered",
    );
  }
}

export function getActiveRunCount(): number {
  return activeRuns.size;
}

export function getActiveRunsByAdapter(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of activeRuns.values()) {
    counts[entry.adapterType] = (counts[entry.adapterType] ?? 0) + 1;
  }
  return counts;
}
