/**
 * GTM Agent Lifecycle Service — campaign-aware spin-up/tear-down.
 *
 * Extracted from nirholas/claude-code tasks/DreamTask lifecycle pattern +
 * coordinatorMode.ts phase management.
 *
 * Key design decisions:
 *   - NO stage management — campaigns use ticket→issues→execution workspaces directly.
 *     Stages were removed from GTM UI and don't align with Claude Code / Paperclip patterns.
 *   - Phase tracking lives at the agent run level via GrowthubPhaseTag in contextSnapshot.
 *   - Wraps (does NOT replace) heartbeat's enqueueWakeup system.
 *   - Uses agnostic GtmKnowledgeItemRecord for knowledge capture (via metadata, not new types).
 */

import type { Db } from "@paperclipai/db";
import { tickets, issues, agents } from "@paperclipai/db";
import { and, eq, desc } from "drizzle-orm";
import {
  readGtmCampaignMetadata,
  type GtmCampaignMetadata,
  type GtmCampaignKnowledgePolicy,
  type GrowthubPhaseTag,
} from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { acquireChromeLease, releaseChromeLease } from "./chrome-lease.js";
import { canScheduleRun } from "./compute-scheduler.js";
import { publishLiveEvent } from "./live-events.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GtmAgentPhase =
  | "idle"
  | "research"
  | "implementation"
  | "verification"
  | "completed"
  | "failed";

export interface GtmCampaignRunContext {
  ticketId: string;
  companyId: string;
  campaignMetadata: GtmCampaignMetadata;
  knowledgePolicy: GtmCampaignKnowledgePolicy;
  activeAgentRuns: Map<
    string,
    { agentId: string; runId: string; phase: GtmAgentPhase }
  >;
}

export type GtmLifecycleEvent =
  | { type: "campaign_started"; ticketId: string; agentIds: string[] }
  | {
      type: "agent_dispatched";
      ticketId: string;
      agentId: string;
      phase: GtmAgentPhase;
    }
  | {
      type: "agent_completed";
      ticketId: string;
      agentId: string;
      runId: string;
      phase: GtmAgentPhase;
    }
  | { type: "campaign_completed"; ticketId: string }
  | { type: "knowledge_captured"; ticketId: string; itemCount: number };

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

export async function createCampaignRunContext(
  db: Db,
  ticketId: string,
): Promise<GtmCampaignRunContext | null> {
  const ticketRow = await db
    .select({
      id: tickets.id,
      companyId: tickets.companyId,
      metadata: tickets.metadata,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .then((rows) => rows[0] ?? null);

  if (!ticketRow) return null;

  const campaignMeta = readGtmCampaignMetadata(ticketRow.metadata);
  if (!campaignMeta) return null;

  const knowledgePolicy = campaignMeta.settings?.knowledge ?? {
    saveRunOutputs: true,
    freezeWhenConnected: true,
  };

  return {
    ticketId,
    companyId: ticketRow.companyId,
    campaignMetadata: campaignMeta,
    knowledgePolicy,
    activeAgentRuns: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Agent dispatch (wraps heartbeat enqueueWakeup)
// ---------------------------------------------------------------------------

export interface SpinUpResult {
  success: boolean;
  reason?: string;
  chromeAcquired?: boolean;
}

/**
 * Prepares a GTM agent for dispatch by checking compute limits and chrome
 * availability. Returns whether the agent can be dispatched. The caller
 * (route handler) is responsible for calling heartbeat's enqueueWakeup()
 * with the phase tag injected into contextSnapshot.
 *
 * This intentionally does NOT call enqueueWakeup directly — keeping the
 * heartbeat service as the single entry point for agent dispatch.
 */
export function prepareCampaignAgentDispatch(
  ctx: GtmCampaignRunContext,
  agentId: string,
  phase: GtmAgentPhase,
  opts?: { requireChrome?: boolean },
): SpinUpResult {
  const requireChrome = opts?.requireChrome ?? false;

  // Check machine compute limits
  // We use claude_local as default — the actual adapter type is resolved
  // by heartbeat when it processes the wakeup request.
  const computeCheck = canScheduleRun("claude_local", requireChrome);
  if (!computeCheck.allowed) {
    return { success: false, reason: computeCheck.reason };
  }

  // Chrome pre-check (advisory — heartbeat also checks via chrome-lease)
  if (requireChrome) {
    const preCheckRunId = `pre-check-${agentId}`;
    const lease = acquireChromeLease(agentId, preCheckRunId);
    if (!lease.acquired) {
      return {
        success: false,
        reason: `Chrome browser held by agent ${lease.heldBy.agentId}`,
        chromeAcquired: false,
      };
    }
    // Release immediately — heartbeat will re-acquire during executeRun
    releaseChromeLease(preCheckRunId);
  }

  // Track in context
  ctx.activeAgentRuns.set(agentId, {
    agentId,
    runId: "", // Will be populated when heartbeat creates the run
    phase,
  });

  return { success: true, chromeAcquired: false };
}

/**
 * Builds the contextSnapshot additions for a GTM campaign agent dispatch.
 * The caller merges this into the wakeup request's contextSnapshot.
 */
export function buildCampaignWakeContext(
  ctx: GtmCampaignRunContext,
  phase: GtmAgentPhase,
): Record<string, unknown> {
  return {
    gtmCampaignTicketId: ctx.ticketId,
    gtmPhaseTag: phaseToGrowthubPhaseTag(phase),
    gtmKnowledgePolicy: ctx.knowledgePolicy,
  };
}

function phaseToGrowthubPhaseTag(
  phase: GtmAgentPhase,
): GrowthubPhaseTag | null {
  switch (phase) {
    case "research":
      return "research";
    case "implementation":
      return "implementation";
    case "verification":
      return "verification";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Post-run lifecycle
// ---------------------------------------------------------------------------

export function markAgentCompleted(
  ctx: GtmCampaignRunContext,
  agentId: string,
  runId: string,
): void {
  const entry = ctx.activeAgentRuns.get(agentId);
  if (entry) {
    entry.phase = "completed";
    entry.runId = runId;
  }
}

export function markAgentFailed(
  ctx: GtmCampaignRunContext,
  agentId: string,
  runId: string,
): void {
  const entry = ctx.activeAgentRuns.get(agentId);
  if (entry) {
    entry.phase = "failed";
    entry.runId = runId;
  }
}

export function removeAgent(
  ctx: GtmCampaignRunContext,
  agentId: string,
): void {
  ctx.activeAgentRuns.delete(agentId);
}

// ---------------------------------------------------------------------------
// Campaign completion check
// ---------------------------------------------------------------------------

export function isCampaignComplete(ctx: GtmCampaignRunContext): boolean {
  if (ctx.activeAgentRuns.size === 0) return false;
  for (const entry of ctx.activeAgentRuns.values()) {
    if (entry.phase !== "completed" && entry.phase !== "failed") {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Lifecycle event emission
// ---------------------------------------------------------------------------

export function emitLifecycleEvent(
  companyId: string,
  event: GtmLifecycleEvent,
): void {
  publishLiveEvent({
    companyId,
    type: "gtm.lifecycle",
    payload: event as unknown as Record<string, unknown>,
  });
  logger.info({ companyId, event }, "GTM lifecycle event");
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Reads GTM campaign metadata for a ticket, returning null if the ticket
 * is not a GTM campaign.
 */
export async function readTicketCampaignMetadata(
  db: Db,
  ticketId: string,
): Promise<GtmCampaignMetadata | null> {
  const row = await db
    .select({ metadata: tickets.metadata })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .then((rows) => rows[0] ?? null);
  return row ? readGtmCampaignMetadata(row.metadata) : null;
}

/**
 * Lists issues belonging to a GTM campaign ticket.
 */
export async function listCampaignIssues(
  db: Db,
  ticketId: string,
  companyId: string,
) {
  return db
    .select({
      id: issues.id,
      title: issues.title,
      status: issues.status,
      assigneeAgentId: issues.assigneeAgentId,
      executionWorkspaceId: issues.executionWorkspaceId,
    })
    .from(issues)
    .where(
      and(eq(issues.ticketId, ticketId), eq(issues.companyId, companyId)),
    )
    .orderBy(desc(issues.createdAt));
}
