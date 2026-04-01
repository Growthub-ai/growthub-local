/**
 * Chrome browser lease — single-machine mutex for --chrome flag.
 *
 * Extracted from nirholas/claude-code hooks/toolPermission/PermissionContext.ts
 * pre-execution gate pattern. Only one agent can hold the browser at a time.
 * In-memory Map — no DB needed. Timeout expires stale leases from crashed runs.
 *
 * Integration: heartbeat.ts executeRun() checks before adapter.execute(),
 * releases on run completion or failure.
 */

import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChromeLease {
  agentId: string;
  runId: string;
  acquiredAt: string;
  expiresAt: string;
}

export type ChromeLeaseResult =
  | { acquired: true; lease: ChromeLease }
  | {
      acquired: false;
      heldBy: { agentId: string; runId: string };
      estimatedAvailableAt: string | null;
    };

// ---------------------------------------------------------------------------
// State (module-scoped, single process)
// ---------------------------------------------------------------------------

const DEFAULT_LEASE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

let activeLease: ChromeLease | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isExpired(lease: ChromeLease): boolean {
  return new Date(lease.expiresAt).getTime() <= Date.now();
}

function purgeIfExpired(): void {
  if (activeLease && isExpired(activeLease)) {
    logger.warn(
      {
        agentId: activeLease.agentId,
        runId: activeLease.runId,
        expiresAt: activeLease.expiresAt,
      },
      "Chrome lease expired — releasing stale lease",
    );
    activeLease = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function acquireChromeLease(
  agentId: string,
  runId: string,
  timeoutMs: number = DEFAULT_LEASE_TIMEOUT_MS,
): ChromeLeaseResult {
  purgeIfExpired();

  if (activeLease) {
    return {
      acquired: false,
      heldBy: {
        agentId: activeLease.agentId,
        runId: activeLease.runId,
      },
      estimatedAvailableAt: activeLease.expiresAt,
    };
  }

  const now = new Date();
  const lease: ChromeLease = {
    agentId,
    runId,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + timeoutMs).toISOString(),
  };

  activeLease = lease;

  logger.info(
    { agentId, runId, expiresAt: lease.expiresAt },
    "Chrome lease acquired",
  );

  return { acquired: true, lease };
}

export function releaseChromeLease(runId: string): void {
  if (!activeLease) return;

  if (activeLease.runId !== runId) {
    logger.warn(
      {
        requestedByRunId: runId,
        heldByRunId: activeLease.runId,
        heldByAgentId: activeLease.agentId,
      },
      "Chrome lease release requested by non-holder — ignoring",
    );
    return;
  }

  logger.info(
    { agentId: activeLease.agentId, runId },
    "Chrome lease released",
  );
  activeLease = null;
}

export function getActiveChromeLease(): ChromeLease | null {
  purgeIfExpired();
  return activeLease;
}

export function isChromeLeasedByRun(runId: string): boolean {
  purgeIfExpired();
  return activeLease?.runId === runId;
}
