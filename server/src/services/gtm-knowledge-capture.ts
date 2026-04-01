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
import fs from "node:fs";
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

// ---------------------------------------------------------------------------
// Skill knowledge items — skills stored as GtmKnowledgeItemRecord entries
// ---------------------------------------------------------------------------

export interface SkillItemInput {
  name: string;
  description: string;
  body: string;
  source?: "paperclip" | "filesystem" | "custom";
}

export interface SkillItemView {
  id: string;
  name: string;
  description: string;
  body: string;
  source: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function isSkillItem(item: GtmKnowledgeItemRecord): boolean {
  return item.sourceType === "skill" || item.metadata.origin === "skill";
}

function toSkillView(item: GtmKnowledgeItemRecord): SkillItemView {
  return {
    id: item.id,
    name: item.fileName,
    description: item.metadata.notes ?? "",
    body: item.storagePath, // body stored inline in storagePath for skills
    source: item.metadata.connector_type ?? "custom",
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function listSkillKnowledgeItems(): SkillItemView[] {
  const state = readGtmState();
  return state.knowledge.items
    .filter((item) => isSkillItem(item) && item.isActive)
    .map(toSkillView);
}

export function getSkillKnowledgeItem(itemId: string): SkillItemView | null {
  const state = readGtmState();
  const item = state.knowledge.items.find((i) => i.id === itemId && isSkillItem(i));
  return item ? toSkillView(item) : null;
}

export function createSkillKnowledgeItem(input: SkillItemInput): SkillItemView {
  const now = new Date().toISOString();
  const itemId = randomUUID();
  const source = input.source ?? "custom";

  const item: GtmKnowledgeItemRecord = {
    id: itemId,
    agentSlug: "workspace",
    compressed: false,
    createdAt: now,
    fileName: input.name,
    isActive: true,
    itemCount: 1,
    metadata: {
      origin: "skill",
      connector_type: source,
      notes: truncateSummary(input.description, 500),
    },
    sourceType: "skill",
    storagePath: input.body, // store body inline
    updatedAt: now,
    userId: "system",
  };

  const state = readGtmState();
  state.knowledge.items.push(item);
  writeGtmState(state);

  logger.info({ itemId, name: input.name, source }, "Skill knowledge item created");
  return toSkillView(item);
}

export function updateSkillKnowledgeItem(
  itemId: string,
  patch: Partial<SkillItemInput>,
): SkillItemView | null {
  const state = readGtmState();
  const idx = state.knowledge.items.findIndex((i) => i.id === itemId && isSkillItem(i));
  if (idx < 0) return null;

  const now = new Date().toISOString();
  const existing = state.knowledge.items[idx]!;
  const updated: GtmKnowledgeItemRecord = {
    ...existing,
    updatedAt: now,
    ...(patch.name !== undefined ? { fileName: patch.name } : {}),
    ...(patch.body !== undefined ? { storagePath: patch.body } : {}),
    metadata: {
      ...existing.metadata,
      ...(patch.description !== undefined ? { notes: truncateSummary(patch.description, 500) } : {}),
      ...(patch.source !== undefined ? { connector_type: patch.source } : {}),
    },
  };
  state.knowledge.items[idx] = updated;
  writeGtmState(state);

  logger.info({ itemId }, "Skill knowledge item updated");
  return toSkillView(updated);
}

export function deleteSkillKnowledgeItem(itemId: string): boolean {
  const state = readGtmState();
  const idx = state.knowledge.items.findIndex((i) => i.id === itemId && isSkillItem(i));
  if (idx < 0) return false;

  state.knowledge.items[idx] = {
    ...state.knowledge.items[idx]!,
    isActive: false,
    updatedAt: new Date().toISOString(),
  };
  writeGtmState(state);

  logger.info({ itemId }, "Skill knowledge item deactivated");
  return true;
}

export function seedSkillsFromFilesystem(): { seeded: number } {
  const state = readGtmState();
  const existingNames = new Set(
    state.knowledge.items
      .filter((i) => isSkillItem(i))
      .map((i) => i.fileName),
  );

  let seeded = 0;

  // Import from ~/.claude/skills/
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeSkillsDir = `${homeDir}/.claude/skills`;
  try {
    const entries = fs.readdirSync(claudeSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      if (existingNames.has(entry.name)) continue;

      const skillMdPath = `${claudeSkillsDir}/${entry.name}/SKILL.md`;
      let body = "";
      let description = "";
      try {
        body = fs.readFileSync(skillMdPath, "utf8");
        const fmMatch = body.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const descMatch = fmMatch[1]?.match(/^description:\s*["']?(.*?)["']?\s*$/m);
          description = descMatch?.[1]?.trim() ?? "";
        }
      } catch { /* skip unreadable */ }

      createSkillKnowledgeItem({
        name: entry.name,
        description,
        body,
        source: "filesystem",
      });
      existingNames.add(entry.name);
      seeded++;
    }
  } catch { /* ~/.claude/skills/ doesn't exist — fine */ }

  if (seeded > 0) {
    logger.info({ seeded }, "Skills seeded from filesystem into knowledge items");
  }
  return { seeded };
}
