/**
 * Memory & Knowledge ↔ Growthub Local Profile binding primitive.
 *
 * This file is the single import surface for the PLG-aligned flow:
 *   "When the user connects a free Growthub account, their local Memory &
 *    Knowledge state automatically becomes part of the same identity —
 *    seamlessly, with delta-only pushes, and a non-destructive opt-in."
 *
 * Design goals:
 *   1. ONE call to bind a memory project to the active Growthub profile.
 *   2. Per-project sync state (last observation id + summary id + ISO ts)
 *      so subsequent pushes are delta-only and idempotent.
 *   3. Auto-sync hook (`autoSyncProjectIfReady`) that the discovery hub
 *      calls on session end / sync action — silent and best-effort, never
 *      blocks the user flow.
 *   4. Pull-side stub (`pullProjectMemoriesIfAvailable`) — forward-compat
 *      with a future `/api/cli/profile?action=pull-memory` endpoint. The
 *      hosted side returns 404 today; we degrade gracefully and store the
 *      attempt in sync state so retries back off.
 *
 * Storage: `~/.paperclip/memory/sync-state.json` (0o600), keyed by project
 * slug. Lives in the same dir as projects + provider-config so the binding
 * travels with the profile.
 *
 * Non-destructive: every operation is additive. The existing JSON-file
 * memory store, search index, and `syncMemoriesToHosted()` push remain
 * unchanged. This primitive composes on top of them.
 */

import fs from "node:fs";
import path from "node:path";
import {
  resolveGrowthubProfileMemoryDir,
  resolveGrowthubProfileSyncStatePath,
} from "../../config/growthub-local-home.js";
import {
  isGrowthubLocalAuthenticated,
  readGrowthubHostedIdentity,
} from "../../auth/growthub-local-profile.js";
import { readSession, isSessionExpired } from "../../auth/session-store.js";
import { canSync } from "./sync.js";
import { getMemoryStats, getObservations, getSummaries } from "./store.js";
import type { MemoryObservation, SessionSummary } from "./contract.js";
import { createGrowthubBridgeClient } from "../growthub-bridge-client/index.js";
import type {
  BridgeKnowledgeItem,
  BridgeKnowledgeTable,
} from "@growthub/api-contract/bridge";

// ---------------------------------------------------------------------------
// Sync state — persisted per-project so deltas are cheap and idempotent.
// ---------------------------------------------------------------------------

export interface MemoryProjectSyncState {
  /** Project slug this entry pertains to. */
  project: string;
  /** Hosted userId at the time of the last successful push (if any). */
  hostedUserId?: string;
  /** Hosted base URL at the time of the last successful push. */
  hostedBaseUrl?: string;
  /**
   * Bridge knowledge-table id this project's items group under. Resolved on
   * the first sync (creates the table if absent, reuses if already present).
   * All subsequent observation/summary pushes carry `tableId: <this>` so the
   * hosted side shows them as a coherent grouped table.
   */
  bridgeTableId?: string;
  /** Human-readable label of the bridge table. */
  bridgeTableFileName?: string;
  /** ISO timestamp of the last successful push. */
  lastPushedAt?: string;
  /** Highest observation id pushed in the last successful sync. */
  lastObservationId?: number;
  /** Highest summary id pushed in the last successful sync. */
  lastSummaryId?: number;
  /** Last bridge knowledge item id created for an observation. */
  lastObservationBridgeId?: string;
  /**
   * Per-record mapping from local observation id → hosted
   * knowledge_item id. Drives true 2-way sync: on pull we can match a
   * hosted item back to its local observation, and on re-push we can
   * issue PATCH metadata updates against the same id instead of
   * creating a duplicate item.
   */
  observationBridgeIds?: Record<string, string>;
  /** Per-record mapping from local summary id → hosted knowledge_item id. */
  summaryBridgeIds?: Record<string, string>;
  /** ISO timestamp of the last pull attempt (success or graceful 404). */
  lastPullAt?: string;
  /** Hosted endpoint status from the last pull attempt. */
  lastPullStatus?: "ok" | "unavailable" | "error";
  /** Whether the user opted into auto-sync on session-end. */
  autoSyncEnabled?: boolean;
}

interface MemorySyncStateFile {
  version: 1;
  projects: Record<string, MemoryProjectSyncState>;
}

const EMPTY_STATE_FILE: MemorySyncStateFile = { version: 1, projects: {} };

function loadStateFile(): MemorySyncStateFile {
  const filePath = resolveGrowthubProfileSyncStatePath();
  if (!fs.existsSync(filePath)) return { ...EMPTY_STATE_FILE, projects: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<MemorySyncStateFile>;
    if (raw && typeof raw === "object" && raw.version === 1 && raw.projects && typeof raw.projects === "object") {
      return { version: 1, projects: raw.projects };
    }
  } catch {
    // Corrupt file is treated as empty — never blocks the user flow.
  }
  return { ...EMPTY_STATE_FILE, projects: {} };
}

function writeStateFile(state: MemorySyncStateFile): void {
  const dir = resolveGrowthubProfileMemoryDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = resolveGrowthubProfileSyncStatePath();
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export function readMemoryProjectSyncState(project: string): MemoryProjectSyncState {
  const state = loadStateFile();
  return state.projects[project] ?? { project };
}

export function writeMemoryProjectSyncState(next: MemoryProjectSyncState): void {
  const state = loadStateFile();
  state.projects[next.project] = next;
  writeStateFile(state);
}

// ---------------------------------------------------------------------------
// Binding API — the customer-facing one-call ergonomics.
// ---------------------------------------------------------------------------

export interface MemoryProfileBindingSnapshot {
  /** The memory project slug (defaults to cwd basename). */
  project: string;
  /** True when a hosted Growthub session is present and unexpired. */
  authenticated: boolean;
  /** Hosted identity owning this profile, if authenticated. */
  hostedUserId?: string;
  hostedEmail?: string;
  hostedBaseUrl?: string;
  /** Counts straight from the local store. */
  observationCount: number;
  summaryCount: number;
  /** Sync state for this project (empty record if never synced). */
  syncState: MemoryProjectSyncState;
  /** Number of observations not yet pushed to the hosted account. */
  pendingObservations: number;
  pendingSummaries: number;
  /** Whether auto-sync is opted in for this project. */
  autoSyncEnabled: boolean;
  /** Quick reason string when sync is unavailable (passed through canSync). */
  syncUnavailableReason?: string;
}

/**
 * Inspect the binding between a memory project and the Growthub Local
 * profile in one call. Pure read, no side effects — safe for hub menus,
 * agent status JSON, and verification scripts.
 */
export function inspectMemoryProfileBinding(project: string): MemoryProfileBindingSnapshot {
  const identity = readGrowthubHostedIdentity();
  const stats = getMemoryStats(project);
  const syncState = readMemoryProjectSyncState(project);
  const sync = canSync();

  // Compute deltas — "pending" means observation/summary ids strictly
  // greater than the last-synced cursor. When we've never synced, every
  // record is pending.
  const observations = getObservations(project, { limit: 100_000 });
  const summaries = getSummaries(project);
  const lastObsId = syncState.lastObservationId ?? 0;
  const lastSumId = syncState.lastSummaryId ?? 0;
  const pendingObservations = observations.filter((o: MemoryObservation) => o.id > lastObsId).length;
  const pendingSummaries = summaries.filter((s: SessionSummary) => s.id > lastSumId).length;

  return {
    project,
    authenticated: identity.authenticated,
    hostedUserId: identity.userId,
    hostedEmail: identity.email,
    hostedBaseUrl: identity.hostedBaseUrl,
    observationCount: stats.observationCount,
    summaryCount: stats.summaryCount,
    syncState,
    pendingObservations,
    pendingSummaries,
    autoSyncEnabled: syncState.autoSyncEnabled ?? false,
    syncUnavailableReason: sync.available ? undefined : sync.reason,
  };
}

/**
 * Toggle the auto-sync opt-in for a project. Persisted in sync state so
 * the discovery hub remembers across sessions.
 */
export function setAutoSyncEnabled(project: string, enabled: boolean): MemoryProjectSyncState {
  const next: MemoryProjectSyncState = {
    ...readMemoryProjectSyncState(project),
    project,
    autoSyncEnabled: enabled,
  };
  writeMemoryProjectSyncState(next);
  return next;
}

// ---------------------------------------------------------------------------
// Push side — bound sync with delta tracking + bridge knowledge grouping.
// ---------------------------------------------------------------------------

export interface BoundSyncResult {
  status: "ok" | "no-changes" | "unavailable" | "error";
  reason?: string;
  pushedObservations: number;
  pushedSummaries: number;
  lastObservationId?: number;
  lastSummaryId?: number;
  bridgeTableId?: string;
  bridgeTableFileName?: string;
}

/**
 * Build the deterministic table file name for a memory project. Lives in the
 * user's knowledge base as a single grouped table — every observation and
 * summary from `project` is a child item under `metadata.table_id = <table id>`.
 */
function bridgeTableFileName(project: string): string {
  return `growthub-cli-memory-${project}.md`;
}

/**
 * Find or create the bridge knowledge table that groups all sync items for
 * this memory project.
 *
 * Strategy:
 *   1. If `state.bridgeTableId` is already set, trust it.
 *   2. Otherwise list existing knowledge tables, match on `file_name` OR
 *      `metadata.growthubCliProject` for forward-compat.
 *   3. If no match, create a new table via `saveKnowledge` with
 *      `source_type` set in metadata (the bridge service consumes the
 *      "table" source_type when it sees the dedicated marker).
 */
async function resolveBridgeTable(
  client: ReturnType<typeof createGrowthubBridgeClient>,
  project: string,
  existingState: MemoryProjectSyncState,
): Promise<{ id: string; fileName: string }> {
  if (existingState.bridgeTableId) {
    return {
      id: existingState.bridgeTableId,
      fileName: existingState.bridgeTableFileName ?? bridgeTableFileName(project),
    };
  }

  const fileName = bridgeTableFileName(project);
  try {
    const tables = await client.listKnowledgeTables();
    const match = tables.tables.find((table: BridgeKnowledgeTable) =>
      table.file_name === fileName
      || (table.metadata && (table.metadata as Record<string, unknown>).growthubCliProject === project),
    );
    if (match) return { id: match.id, fileName: match.file_name };
  } catch {
    // Fall through to create. If list isn't available in this environment,
    // we still try the create — many bridge deployments only expose write.
  }

  const created = await client.saveKnowledge({
    title: `Growthub CLI memory — ${project}`,
    fileName,
    notes: `Grouped knowledge table for memories captured by the Growthub CLI for project "${project}".`,
    // Match the agent slug used by other Growthub Local bridge writers
    // (see growthub-local-probe items + bridge run-sync default) so memory
    // items land in the same hosted agent grouping the user already knows.
    agentSlug: "growthub_local_bridge",
    metadata: {
      origin: "growthub-cli",
      source_type: "table",
      growthubCliProject: project,
      growthubCliSchemaVersion: 1,
    },
  });
  if (!created.success || !created.id) {
    throw new Error(created.error ?? "Failed to create bridge knowledge table.");
  }
  return { id: created.id, fileName };
}

/**
 * Push one memory observation as a single knowledge item under the project's
 * bridge table. The content is the structured observation as Markdown so it
 * remains human-readable in the knowledge inspector.
 */
async function pushObservation(
  client: ReturnType<typeof createGrowthubBridgeClient>,
  project: string,
  tableId: string,
  observation: MemoryObservation,
  existingBridgeId?: string,
): Promise<string | null> {
  const lines: string[] = [];
  lines.push(`# ${observation.title}`);
  if (observation.subtitle) lines.push(observation.subtitle);
  lines.push("");
  lines.push(`- type: ${observation.type}`);
  lines.push(`- sessionId: ${observation.sessionId}`);
  lines.push(`- createdAt: ${observation.createdAt}`);
  if (observation.concepts.length > 0) {
    lines.push(`- concepts: ${observation.concepts.join(", ")}`);
  }
  if (observation.narrative) {
    lines.push("");
    lines.push(observation.narrative);
  }
  if (observation.facts.length > 0) {
    lines.push("");
    lines.push("## Facts");
    for (const fact of observation.facts) lines.push(`- ${fact}`);
  }
  if (observation.filesRead.length > 0 || observation.filesModified.length > 0) {
    lines.push("");
    lines.push("## Files");
    for (const f of observation.filesRead) lines.push(`- read: ${f}`);
    for (const f of observation.filesModified) lines.push(`- modified: ${f}`);
  }

  const result = await client.saveKnowledge({
    // Idempotent upsert — when we already have a hosted knowledge_item id
    // for this local observation, pass it so the bridge updates the same
    // item instead of creating a duplicate.
    id: existingBridgeId,
    title: observation.title.slice(0, 200),
    fileName: `growthub-cli-memory/${project}/observation-${observation.id}.md`,
    content: lines.join("\n"),
    tableId,
    agentSlug: "growthub_local_bridge",
    notes: `Observation #${observation.id} captured by Growthub CLI`,
    metadata: {
      origin: "growthub-cli",
      growthubCliProject: project,
      growthubCliObservationId: observation.id,
      growthubCliSessionId: observation.sessionId,
      growthubCliType: observation.type,
      growthubCliConcepts: observation.concepts,
      growthubCliSchemaVersion: 1,
      table_id: tableId,
    },
  });
  if (!result.success) {
    throw new Error(result.error ?? `Failed to push observation #${observation.id}`);
  }
  return result.id ?? null;
}

async function pushSummary(
  client: ReturnType<typeof createGrowthubBridgeClient>,
  project: string,
  tableId: string,
  summary: SessionSummary,
  existingBridgeId?: string,
): Promise<string | null> {
  const lines: string[] = [];
  lines.push(`# Session summary — ${summary.sessionId}`);
  if (summary.request) {
    lines.push("");
    lines.push("## Request");
    lines.push(summary.request);
  }
  if (summary.investigated) {
    lines.push("");
    lines.push("## Investigated");
    lines.push(summary.investigated);
  }
  if (summary.completed) {
    lines.push("");
    lines.push("## Completed");
    lines.push(summary.completed);
  }
  if (summary.learned) {
    lines.push("");
    lines.push("## Learned");
    lines.push(summary.learned);
  }
  if (summary.notes) {
    lines.push("");
    lines.push("## Notes");
    lines.push(summary.notes);
  }

  const result = await client.saveKnowledge({
    id: existingBridgeId,
    title: `Session ${summary.sessionId}`.slice(0, 200),
    fileName: `growthub-cli-memory/${project}/summary-${summary.id}.md`,
    content: lines.join("\n"),
    tableId,
    agentSlug: "growthub_local_bridge",
    notes: `Session summary #${summary.id} captured by Growthub CLI`,
    metadata: {
      origin: "growthub-cli",
      growthubCliProject: project,
      growthubCliSummaryId: summary.id,
      growthubCliSessionId: summary.sessionId,
      growthubCliSchemaVersion: 1,
      table_id: tableId,
    },
  });
  if (!result.success) {
    throw new Error(result.error ?? `Failed to push summary #${summary.id}`);
  }
  return result.id ?? null;
}

/**
 * Push the project's pending memory deltas to the hosted Growthub account via
 * the real bridge knowledge primitive. Each project gets exactly one grouped
 * knowledge table (created on first sync, reused thereafter) and every
 * observation/summary is a child item with `metadata.table_id = <table>` so
 * the UI groups them automatically.
 *
 * Cursor advancement is per-record: we increment `lastObservationId` /
 * `lastSummaryId` only when the individual upsert succeeds, so partial
 * failures don't lose work.
 */
export async function syncProjectToProfile(project: string): Promise<BoundSyncResult> {
  if (!isGrowthubLocalAuthenticated()) {
    return {
      status: "unavailable",
      reason: "No hosted session — connect your free Growthub account",
      pushedObservations: 0,
      pushedSummaries: 0,
    };
  }

  const sync = canSync();
  if (!sync.available) {
    return {
      status: "unavailable",
      reason: sync.reason,
      pushedObservations: 0,
      pushedSummaries: 0,
    };
  }

  const before = inspectMemoryProfileBinding(project);
  if (before.pendingObservations === 0 && before.pendingSummaries === 0 && before.syncState.bridgeTableId) {
    return {
      status: "no-changes",
      pushedObservations: 0,
      pushedSummaries: 0,
      lastObservationId: before.syncState.lastObservationId,
      lastSummaryId: before.syncState.lastSummaryId,
      bridgeTableId: before.syncState.bridgeTableId,
      bridgeTableFileName: before.syncState.bridgeTableFileName,
    };
  }

  const client = createGrowthubBridgeClient();
  const identity = readGrowthubHostedIdentity();
  let table: { id: string; fileName: string };
  try {
    table = await resolveBridgeTable(client, project, before.syncState);
  } catch (err) {
    return {
      status: "error",
      reason: err instanceof Error ? err.message : "Failed to resolve bridge knowledge table",
      pushedObservations: 0,
      pushedSummaries: 0,
    };
  }

  const observations = getObservations(project, { limit: 100_000 });
  const summaries = getSummaries(project);
  const lastObsId = before.syncState.lastObservationId ?? 0;
  const lastSumId = before.syncState.lastSummaryId ?? 0;
  const pendingObservations = observations.filter((o) => o.id > lastObsId);
  const pendingSummaries = summaries.filter((s) => s.id > lastSumId);

  let pushedObs = 0;
  let pushedSum = 0;
  let highestObsId = lastObsId;
  let highestSumId = lastSumId;
  let lastObsBridgeId = before.syncState.lastObservationBridgeId;
  // Per-record id maps — start from whatever is already persisted so we
  // accumulate across syncs and never lose the local ↔ hosted binding.
  const observationBridgeIds: Record<string, string> = {
    ...(before.syncState.observationBridgeIds ?? {}),
  };
  const summaryBridgeIds: Record<string, string> = {
    ...(before.syncState.summaryBridgeIds ?? {}),
  };

  try {
    for (const observation of pendingObservations) {
      // Idempotent upsert: if we've already synced this observation in a
      // previous run, pass the hosted knowledge_item id so the bridge does
      // an update-in-place rather than creating a duplicate item.
      const existingBridgeId = observationBridgeIds[String(observation.id)];
      const bridgeId = await pushObservation(
        client,
        project,
        table.id,
        observation,
        existingBridgeId,
      );
      pushedObs += 1;
      highestObsId = Math.max(highestObsId, observation.id);
      if (bridgeId) {
        observationBridgeIds[String(observation.id)] = bridgeId;
        lastObsBridgeId = bridgeId;
      }
    }
    for (const summary of pendingSummaries) {
      const existingBridgeId = summaryBridgeIds[String(summary.id)];
      const bridgeId = await pushSummary(client, project, table.id, summary, existingBridgeId);
      pushedSum += 1;
      highestSumId = Math.max(highestSumId, summary.id);
      if (bridgeId) summaryBridgeIds[String(summary.id)] = bridgeId;
    }
  } catch (err) {
    // Persist whatever did succeed before bubbling the error up — partial
    // progress is real progress and lets the next sync resume cleanly.
    writeMemoryProjectSyncState({
      ...before.syncState,
      project,
      hostedUserId: identity.userId,
      hostedBaseUrl: identity.hostedBaseUrl,
      bridgeTableId: table.id,
      bridgeTableFileName: table.fileName,
      lastPushedAt: new Date().toISOString(),
      lastObservationId: highestObsId,
      lastSummaryId: highestSumId,
      lastObservationBridgeId: lastObsBridgeId,
      observationBridgeIds,
      summaryBridgeIds,
    });
    return {
      status: "error",
      reason: err instanceof Error ? err.message : "Sync failed mid-flight",
      pushedObservations: pushedObs,
      pushedSummaries: pushedSum,
      lastObservationId: highestObsId,
      lastSummaryId: highestSumId,
      bridgeTableId: table.id,
      bridgeTableFileName: table.fileName,
    };
  }

  const next: MemoryProjectSyncState = {
    ...before.syncState,
    project,
    hostedUserId: identity.userId,
    hostedBaseUrl: identity.hostedBaseUrl,
    bridgeTableId: table.id,
    bridgeTableFileName: table.fileName,
    lastPushedAt: new Date().toISOString(),
    lastObservationId: highestObsId,
    lastSummaryId: highestSumId,
    lastObservationBridgeId: lastObsBridgeId,
    observationBridgeIds,
    summaryBridgeIds,
  };
  writeMemoryProjectSyncState(next);

  return {
    status: "ok",
    pushedObservations: pushedObs,
    pushedSummaries: pushedSum,
    lastObservationId: highestObsId,
    lastSummaryId: highestSumId,
    bridgeTableId: table.id,
    bridgeTableFileName: table.fileName,
  };
}

/**
 * Best-effort auto-sync — call this on chat-session end. Silent when the
 * user is not authed or auto-sync is off. Never throws. Designed to be
 * called from `runMemoryKnowledgeHub` after the user exits a thread.
 */
export async function autoSyncProjectIfReady(
  project: string,
): Promise<{ ran: boolean; result?: BoundSyncResult }> {
  const binding = inspectMemoryProfileBinding(project);
  if (!binding.authenticated) return { ran: false };
  if (!binding.autoSyncEnabled) return { ran: false };
  if (binding.pendingObservations === 0 && binding.pendingSummaries === 0) {
    return { ran: false };
  }

  try {
    const result = await syncProjectToProfile(project);
    return { ran: true, result };
  } catch {
    return { ran: false };
  }
}

// ---------------------------------------------------------------------------
// Pull side — forward-compat stub.
// ---------------------------------------------------------------------------

export interface PullResult {
  status: "ok" | "unavailable" | "error";
  reason?: string;
  pulledObservations: number;
  pulledSummaries: number;
}

export interface PullItem {
  bridgeId: string;
  fileName: string;
  metadata: Record<string, unknown>;
  observationId?: number;
  summaryId?: number;
  sessionId?: string;
  type?: string;
}

/**
 * Pull hosted-side memory items for this project via the real bridge
 * knowledge primitive. Lists items whose `metadata.table_id` matches the
 * project's bridge table (resolved via sync state) and returns metadata
 * describing each item.
 *
 * This is the source-of-truth read path for the hosted side. The local
 * JSON store remains the source of truth for *capture* — pull surfaces the
 * hosted-side state so the user can verify their data lives where they
 * expect. Merging pulled items back into the local store (de-duplicated by
 * `growthubCliObservationId`) is a follow-up once cross-machine flows are
 * exercised.
 */
export async function pullProjectMemoriesIfAvailable(
  project: string,
  _options?: { timeoutMs?: number },
): Promise<PullResult & { items?: PullItem[] }> {
  void _options;
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    return {
      status: "unavailable",
      reason: "No hosted session — connect your free Growthub account",
      pulledObservations: 0,
      pulledSummaries: 0,
    };
  }

  const state = readMemoryProjectSyncState(project);
  if (!state.bridgeTableId) {
    return {
      status: "unavailable",
      reason: "No bridge table bound to this project yet — run a Sync first to create one.",
      pulledObservations: 0,
      pulledSummaries: 0,
    };
  }

  const client = createGrowthubBridgeClient();
  try {
    const result = await client.listKnowledge({ tableId: state.bridgeTableId });
    const observationPathRe = new RegExp(`^growthub-cli-memory/${project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/observation-(\\d+)\\.md$`);
    const summaryPathRe = new RegExp(`^growthub-cli-memory/${project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/summary-(\\d+)\\.md$`);
    const items: PullItem[] = result.items.map((item: BridgeKnowledgeItem) => {
      const meta = (item.metadata ?? {}) as Record<string, unknown>;
      const observationMatch = item.file_name.match(observationPathRe);
      const summaryMatch = item.file_name.match(summaryPathRe);
      const observationId = typeof meta.growthubCliObservationId === "number"
        ? meta.growthubCliObservationId
        : observationMatch
          ? Number(observationMatch[1])
          : undefined;
      const summaryId = typeof meta.growthubCliSummaryId === "number"
        ? meta.growthubCliSummaryId
        : summaryMatch
          ? Number(summaryMatch[1])
          : undefined;
      return {
        bridgeId: item.id,
        fileName: item.file_name,
        metadata: meta,
        observationId: Number.isFinite(observationId) ? observationId : undefined,
        summaryId: Number.isFinite(summaryId) ? summaryId : undefined,
        sessionId: typeof meta.growthubCliSessionId === "string"
          ? meta.growthubCliSessionId
          : undefined,
        type: typeof meta.growthubCliType === "string" ? meta.growthubCliType : undefined,
      };
    });

    const pulledObs = items.filter((i) => i.observationId !== undefined).length;
    const pulledSum = items.filter((i) => i.summaryId !== undefined).length;

    // Reconcile per-record id maps with what the bridge actually has. This
    // is the 2-way step: if the hosted side knows about an observation we
    // pushed from another machine (or from a previous CLI install), we
    // learn its bridge id here so the next push upserts in place instead
    // of duplicating.
    const observationBridgeIds: Record<string, string> = {
      ...(state.observationBridgeIds ?? {}),
    };
    const summaryBridgeIds: Record<string, string> = {
      ...(state.summaryBridgeIds ?? {}),
    };
    for (const item of items) {
      if (item.observationId !== undefined) {
        observationBridgeIds[String(item.observationId)] = item.bridgeId;
      }
      if (item.summaryId !== undefined) {
        summaryBridgeIds[String(item.summaryId)] = item.bridgeId;
      }
    }

    writeMemoryProjectSyncState({
      ...state,
      project,
      lastPullAt: new Date().toISOString(),
      lastPullStatus: "ok",
      observationBridgeIds,
      summaryBridgeIds,
    });
    return {
      status: "ok",
      pulledObservations: pulledObs,
      pulledSummaries: pulledSum,
      items,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown pull error";
    const unavailable = message.includes("(404)");
    writeMemoryProjectSyncState({
      ...state,
      project,
      lastPullAt: new Date().toISOString(),
      lastPullStatus: unavailable ? "unavailable" : "error",
    });
    return {
      status: unavailable ? "unavailable" : "error",
      reason: message,
      pulledObservations: 0,
      pulledSummaries: 0,
    };
  }
}
