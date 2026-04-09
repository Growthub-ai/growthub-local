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
  slotId: string;
  agentId: string;
  runId: string;
  acquiredAt: string;
  expiresAt: string;
}

export type ChromeLeaseResult =
  | { acquired: true; lease: ChromeLease }
  | {
      acquired: false;
      slotId: string;
      heldBy: { agentId: string; runId: string };
      estimatedAvailableAt: string | null;
    };

// ---------------------------------------------------------------------------
// State (module-scoped, single process)
// ---------------------------------------------------------------------------

const DEFAULT_LEASE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_CHROME_SLOT_ID = "default";

let activeLeases = new Map<string, ChromeLease>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function normalizeChromeSlotId(slotId?: string | null): string {
  const trimmed = slotId?.trim() ?? "";
  if (!trimmed) return DEFAULT_CHROME_SLOT_ID;
  return trimmed.replace(/[^a-zA-Z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "") || DEFAULT_CHROME_SLOT_ID;
}

function isExpired(lease: ChromeLease): boolean {
  return new Date(lease.expiresAt).getTime() <= Date.now();
}

function purgeIfExpired(slotId?: string | null): void {
  if (slotId) {
    const normalizedSlotId = normalizeChromeSlotId(slotId);
    const lease = activeLeases.get(normalizedSlotId);
    if (lease && isExpired(lease)) {
      logger.warn(
        {
          slotId: normalizedSlotId,
          agentId: lease.agentId,
          runId: lease.runId,
          expiresAt: lease.expiresAt,
        },
        "Chrome lease expired — releasing stale lease",
      );
      activeLeases.delete(normalizedSlotId);
    }
    return;
  }

  for (const [activeSlotId, lease] of activeLeases.entries()) {
    if (!isExpired(lease)) continue;
    logger.warn(
      {
        slotId: activeSlotId,
        agentId: lease.agentId,
        runId: lease.runId,
        expiresAt: lease.expiresAt,
      },
      "Chrome lease expired — releasing stale lease",
    );
    activeLeases.delete(activeSlotId);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function acquireChromeLease(
  agentId: string,
  runId: string,
  opts?: { timeoutMs?: number; slotId?: string | null },
): ChromeLeaseResult {
  const slotId = normalizeChromeSlotId(opts?.slotId);
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_LEASE_TIMEOUT_MS;
  purgeIfExpired(slotId);
  const activeLease = activeLeases.get(slotId) ?? null;

  if (activeLease) {
    return {
      acquired: false,
      slotId,
      heldBy: {
        agentId: activeLease.agentId,
        runId: activeLease.runId,
      },
      estimatedAvailableAt: activeLease.expiresAt,
    };
  }

  const now = new Date();
  const lease: ChromeLease = {
    slotId,
    agentId,
    runId,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + timeoutMs).toISOString(),
  };

  activeLeases.set(slotId, lease);

  logger.info(
    { slotId, agentId, runId, expiresAt: lease.expiresAt },
    "Chrome lease acquired",
  );

  return { acquired: true, lease };
}

/** Clears any in-process Chrome lease (e.g. stuck after a crash). Prefer normal release via runId when possible. */
export function forceReleaseChromeLeases(reason: string, slotId?: string | null): ChromeLease[] {
  purgeIfExpired();
  const released: ChromeLease[] = [];
  const slotIds = slotId
    ? [normalizeChromeSlotId(slotId)]
    : Array.from(activeLeases.keys());

  for (const activeSlotId of slotIds) {
    const prev = activeLeases.get(activeSlotId);
    if (!prev) continue;
    logger.warn(
      {
        slotId: activeSlotId,
        agentId: prev.agentId,
        runId: prev.runId,
        expiresAt: prev.expiresAt,
        reason,
      },
      "Chrome lease force-cleared",
    );
    activeLeases.delete(activeSlotId);
    released.push(prev);
  }

  return released;
}

/** Backward-compatible single-release helper. */
export function forceReleaseChromeLease(reason: string, slotId?: string | null): ChromeLease | null {
  return forceReleaseChromeLeases(reason, slotId)[0] ?? null;
}

export function releaseChromeLease(runId: string, slotId?: string | null): void {
  purgeIfExpired(slotId);

  if (slotId) {
    const normalizedSlotId = normalizeChromeSlotId(slotId);
    const activeLease = activeLeases.get(normalizedSlotId);
    if (!activeLease) return;
    if (activeLease.runId !== runId) {
      logger.warn(
        {
          slotId: normalizedSlotId,
          requestedByRunId: runId,
          heldByRunId: activeLease.runId,
          heldByAgentId: activeLease.agentId,
        },
        "Chrome lease release requested by non-holder — ignoring",
      );
      return;
    }
    logger.info(
      { slotId: normalizedSlotId, agentId: activeLease.agentId, runId },
      "Chrome lease released",
    );
    activeLeases.delete(normalizedSlotId);
    return;
  }

  for (const [activeSlotId, activeLease] of activeLeases.entries()) {
    if (activeLease.runId !== runId) continue;
    logger.info(
      { slotId: activeSlotId, agentId: activeLease.agentId, runId },
      "Chrome lease released",
    );
    activeLeases.delete(activeSlotId);
    return;
  }
}

export function getActiveChromeLease(slotId?: string | null): ChromeLease | null {
  purgeIfExpired(slotId);
  if (slotId) return activeLeases.get(normalizeChromeSlotId(slotId)) ?? null;
  return activeLeases.values().next().value ?? null;
}

export function listActiveChromeLeases(): ChromeLease[] {
  purgeIfExpired();
  return Array.from(activeLeases.values()).sort((left, right) => left.slotId.localeCompare(right.slotId));
}

export function isChromeLeasedByRun(runId: string, slotId?: string | null): boolean {
  purgeIfExpired(slotId);
  if (slotId) return activeLeases.get(normalizeChromeSlotId(slotId))?.runId === runId;
  for (const lease of activeLeases.values()) {
    if (lease.runId === runId) return true;
  }
  return false;
}
