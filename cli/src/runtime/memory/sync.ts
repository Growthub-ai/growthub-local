/**
 * Memory Module — Growthub Account Sync
 *
 * Pushes memory observations and summaries to the hosted Growthub app
 * via the existing auth bridge session. Sync is best-effort: failures
 * are silently logged and do not block local memory operations.
 *
 * Sync endpoint: POST /api/cli/profile?action=sync-memory
 * Requires an active CLI auth session (auth login).
 */

import { readSession, isSessionExpired } from "../../auth/session-store.js";
import type {
  MemorySyncPayload,
  MemorySyncResult,
} from "./contract.js";
import { getObservations, getSummaries } from "./store.js";

// ---------------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------------

export function canSync(): { available: boolean; reason?: string } {
  const session = readSession();
  if (!session) {
    return { available: false, reason: "No hosted session — run `growthub auth login` first" };
  }
  if (isSessionExpired(session)) {
    return { available: false, reason: "Hosted session expired — run `growthub auth login` to refresh" };
  }
  return { available: true };
}

// ---------------------------------------------------------------------------
// Push memories to hosted
// ---------------------------------------------------------------------------

export async function syncMemoriesToHosted(
  project: string,
  options?: {
    /** Only sync observations created after this ISO date. */
    since?: string;
    /** Timeout in milliseconds. */
    timeoutMs?: number;
  },
): Promise<MemorySyncResult> {
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    return {
      success: false,
      syncedObservations: 0,
      syncedSummaries: 0,
      error: "No active hosted session",
    };
  }

  const observations = getObservations(project, {
    after: options?.since,
  });
  const summaries = getSummaries(project);

  if (observations.length === 0 && summaries.length === 0) {
    return {
      success: true,
      syncedObservations: 0,
      syncedSummaries: 0,
    };
  }

  const payload: MemorySyncPayload = {
    project,
    observations,
    summaries,
    syncedAt: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? 15_000,
  );

  try {
    const syncUrl = new URL("/api/cli/profile", session.hostedBaseUrl);
    syncUrl.searchParams.set("action", "sync-memory");

    const response = await fetch(syncUrl.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        success: true,
        syncedObservations: observations.length,
        syncedSummaries: summaries.length,
      };
    }

    // Hosted endpoint may not exist yet — graceful degradation
    if (response.status === 404) {
      return {
        success: false,
        syncedObservations: 0,
        syncedSummaries: 0,
        error: "Memory sync endpoint not available on hosted app (404)",
      };
    }

    return {
      success: false,
      syncedObservations: 0,
      syncedSummaries: 0,
      error: `Hosted app responded with ${response.status}`,
    };
  } catch (err) {
    return {
      success: false,
      syncedObservations: 0,
      syncedSummaries: 0,
      error: err instanceof Error ? err.message : "Unknown sync error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
