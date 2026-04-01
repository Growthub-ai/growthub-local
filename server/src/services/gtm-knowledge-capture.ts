/**
 * GTM Knowledge Capture Hook — post-run knowledge persistence.
 *
 * Extracted from nirholas/claude-code services/autoDream/autoDream.ts gate system +
 * memdir/memoryScan.ts file scanning pattern.
 *
 * Uses the agnostic GtmKnowledgeItemRecord primitive — all specificity lives in
 * the metadata field, matching how gh-app stores knowledge across Supabase + KV.
 * No new types created. Campaign run outputs become knowledge items with
 * metadata.origin = "campaign_run", metadata.connector_type = "heartbeat", etc.
 */

import { randomUUID } from "node:crypto";
import type {
  GtmCampaignMetadata,
  GtmCampaignKnowledgePolicy,
  GtmKnowledgeItemRecord,
  GtmState,
} from "@paperclipai/shared";
import { readGtmState, writeGtmState } from "./gtm-state.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Gate system (3 gates from autoDream pattern)
// ---------------------------------------------------------------------------

export interface KnowledgeCaptureGate {
  /** Whether knowledge capture is enabled by campaign policy */
  enabled: boolean;
  /** Whether capture is frozen (connected to gh-app + freezeWhenConnected) */
  frozen: boolean;
  /** Whether enough runs have occurred to justify capture */
  thresholdMet: boolean;
}

const MIN_RUNS_BEFORE_CAPTURE = 1;

export function evaluateKnowledgeCaptureGate(input: {
  knowledgePolicy: GtmCampaignKnowledgePolicy;
  connected: boolean;
  completedRunCount: number;
}): KnowledgeCaptureGate {
  const enabled = input.knowledgePolicy.saveRunOutputs;
  const frozen =
    input.connected && input.knowledgePolicy.freezeWhenConnected;
  const thresholdMet = input.completedRunCount >= MIN_RUNS_BEFORE_CAPTURE;

  return { enabled, frozen, thresholdMet };
}

export function shouldCaptureKnowledge(gate: KnowledgeCaptureGate): boolean {
  return gate.enabled && !gate.frozen && gate.thresholdMet;
}

// ---------------------------------------------------------------------------
// Knowledge capture
// ---------------------------------------------------------------------------

export interface KnowledgeCaptureInput {
  ticketId: string;
  runId: string;
  agentId: string;
  agentName: string;
  summary: string | null;
  resultJson: Record<string, unknown> | null;
  campaignMetadata: GtmCampaignMetadata;
}

export interface KnowledgeCaptureResult {
  captured: boolean;
  itemId: string | null;
  reason: string | null;
}

/**
 * Captures knowledge from a completed GTM campaign run.
 *
 * Creates a GtmKnowledgeItemRecord with campaign-specific metadata and
 * appends it to the GTM state's knowledge items. The item uses the
 * agnostic primitive — all campaign context lives in metadata fields.
 */
export function captureRunKnowledge(
  input: KnowledgeCaptureInput,
): KnowledgeCaptureResult {
  const { ticketId, runId, agentId, agentName, summary, campaignMetadata } =
    input;

  if (!summary || summary.trim().length === 0) {
    return { captured: false, itemId: null, reason: "No summary to capture" };
  }

  const now = new Date().toISOString();
  const itemId = randomUUID();
  const fileName = `campaign-${ticketId.slice(0, 8)}-run-${runId.slice(0, 8)}`;
  const storagePath = `knowledge/campaign-runs/${fileName}.md`;

  // Build the agnostic knowledge item — all specificity in metadata
  const item: GtmKnowledgeItemRecord = {
    id: itemId,
    agentSlug: agentName.toLowerCase().replace(/\s+/g, "-") || agentId,
    compressed: false,
    createdAt: now,
    fileName,
    isActive: true,
    itemCount: 1,
    metadata: {
      origin: "campaign_run",
      connector_type: "heartbeat",
      table_id: ticketId,
      workspace_id: campaignMetadata.settings?.knowledge
        ? "campaign"
        : null,
      notes: truncateSummary(summary, 500),
      // Campaign-specific context carried in the same metadata shape
      // that gh-app already understands via Supabase + KV
      ...(campaignMetadata.targetAudience
        ? { visibility: "campaign" }
        : {}),
    },
    sourceType: "item",
    storagePath,
    updatedAt: now,
    userId: agentId,
  };

  // Append to GTM state
  try {
    const state = readGtmState();
    const existingIndex = state.knowledge.items.findIndex(
      (existing) =>
        existing.metadata.origin === "campaign_run" &&
        existing.metadata.table_id === ticketId &&
        existing.agentSlug === item.agentSlug,
    );

    if (existingIndex >= 0) {
      // Update existing item from same agent + campaign
      state.knowledge.items[existingIndex] = {
        ...state.knowledge.items[existingIndex]!,
        updatedAt: now,
        metadata: {
          ...state.knowledge.items[existingIndex]!.metadata,
          notes: truncateSummary(summary, 500),
        },
        itemCount: (state.knowledge.items[existingIndex]!.itemCount ?? 0) + 1,
      };
    } else {
      state.knowledge.items.push(item);
    }

    writeGtmState(state);

    logger.info(
      {
        itemId,
        ticketId,
        runId,
        agentId,
        updated: existingIndex >= 0,
      },
      "GTM knowledge captured from campaign run",
    );

    return { captured: true, itemId, reason: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    logger.warn(
      { ticketId, runId, agentId, error: message },
      "Failed to capture GTM knowledge",
    );
    return { captured: false, itemId: null, reason: message };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateSummary(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 3) + "...";
}

/**
 * Checks if a heartbeat run's context indicates it belongs to a GTM campaign.
 * Used by heartbeat post-run finalization to decide whether to trigger capture.
 */
export function isGtmCampaignRun(
  contextSnapshot: Record<string, unknown> | null | undefined,
): boolean {
  if (!contextSnapshot) return false;
  return typeof contextSnapshot.gtmCampaignTicketId === "string";
}

/**
 * Extracts GTM campaign context from a heartbeat run's context snapshot.
 */
export function readGtmCampaignRunContext(
  contextSnapshot: Record<string, unknown>,
): {
  ticketId: string;
  phaseTag: string | null;
  knowledgePolicy: GtmCampaignKnowledgePolicy | null;
} | null {
  const ticketId = contextSnapshot.gtmCampaignTicketId;
  if (typeof ticketId !== "string") return null;
  const phaseTag =
    typeof contextSnapshot.gtmPhaseTag === "string"
      ? contextSnapshot.gtmPhaseTag
      : null;
  const rawPolicy = contextSnapshot.gtmKnowledgePolicy;
  const knowledgePolicy =
    rawPolicy &&
    typeof rawPolicy === "object" &&
    !Array.isArray(rawPolicy)
      ? (rawPolicy as GtmCampaignKnowledgePolicy)
      : null;
  return { ticketId, phaseTag, knowledgePolicy };
}
