import {
  TICKET_STAGES,
  type TicketStage,
  type AgentRole,
  type TicketStageHandoffMode,
  type TicketStageKind,
} from "./constants.js";
import type { TicketStageDefinition } from "./types/ticket.js";

const LEGACY_STAGE_KIND_BY_KEY: Partial<Record<TicketStage, TicketStageKind>> = {
  planning: "planning",
  execution: "execution",
  review: "review",
  qa: "qa",
  human: "human",
};

export interface NormalizeTicketStagesInput {
  stageDefinitions?: TicketStageDefinition[] | null;
  stageOrder?: string[] | null;
}

export function normalizeTicketStageKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function formatTicketStageLabel(value: string): string {
  return value
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMetadata(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeStageDefinition(definition: TicketStageDefinition, index: number): TicketStageDefinition {
  const keySource = definition.key?.trim() || definition.label?.trim() || `stage_${index + 1}`;
  const key = normalizeTicketStageKey(keySource);
  const label = normalizeOptionalText(definition.label) ?? formatTicketStageLabel(key);

  return {
    key,
    label,
    kind: definition.kind ?? LEGACY_STAGE_KIND_BY_KEY[key as TicketStage] ?? "custom",
    ownerRole: (definition.ownerRole ?? null) as AgentRole | null,
    handoffMode: (definition.handoffMode ?? null) as TicketStageHandoffMode | null,
    instructions: normalizeOptionalText(definition.instructions),
    exitCriteria: normalizeOptionalText(definition.exitCriteria),
    metadata: normalizeMetadata(definition.metadata),
  };
}

export function normalizeTicketStageDefinitions(input?: NormalizeTicketStagesInput | null): TicketStageDefinition[] {
  const normalizedDefinitions = (input?.stageDefinitions ?? [])
    .map((definition, index) => normalizeStageDefinition(definition, index))
    .filter((definition) => definition.key.length > 0);

  if (normalizedDefinitions.length > 0) {
    const seen = new Set<string>();
    return normalizedDefinitions.filter((definition) => {
      if (seen.has(definition.key)) return false;
      seen.add(definition.key);
      return true;
    });
  }

  const fallbackStageOrder =
    input?.stageOrder?.filter((stage): stage is string => typeof stage === "string" && stage.trim().length > 0) ??
    [...TICKET_STAGES];

  return fallbackStageOrder.map((stage, index) =>
    normalizeStageDefinition(
      {
        key: stage,
        label: formatTicketStageLabel(stage),
        kind: LEGACY_STAGE_KIND_BY_KEY[stage as TicketStage] ?? "custom",
      },
      index,
    ),
  );
}

export function buildTicketStageOrder(stageDefinitions: TicketStageDefinition[]): string[] {
  return stageDefinitions.map((stage) => stage.key);
}

export function getTicketStageDefinition(
  stageDefinitions: TicketStageDefinition[],
  key: string | null | undefined,
): TicketStageDefinition | null {
  if (!key) return null;
  return stageDefinitions.find((stage) => stage.key === key) ?? null;
}

export function resolveTicketCurrentStage(
  currentStage: string | null | undefined,
  stageDefinitions: TicketStageDefinition[],
): string {
  const stageOrder = buildTicketStageOrder(stageDefinitions);
  if (currentStage && stageOrder.includes(currentStage)) return currentStage;
  return stageOrder[0] ?? TICKET_STAGES[0];
}

export function createGtmStagePreset(): TicketStageDefinition[] {
  return normalizeTicketStageDefinitions({
    stageDefinitions: [
      {
        key: "planning",
        label: "Planning",
        kind: "planning",
        ownerRole: "ceo",
        handoffMode: "context_only",
        instructions: "Define the campaign objective, target audience, and offer before execution begins.",
        exitCriteria: "The execution agent has a bounded campaign brief and success definition.",
      },
      {
        key: "execution",
        label: "Execution",
        kind: "execution",
        ownerRole: "cmo",
        handoffMode: "seamless",
        instructions: "Ship the active GTM work for this campaign stage using the approved brief and assets.",
        exitCriteria: "Execution artifacts are ready for QA review with outcomes captured in the stage issue.",
      },
      {
        key: "qa",
        label: "QA",
        kind: "qa",
        ownerRole: "qa",
        handoffMode: "context_only",
        instructions: "Validate messaging, links, assets, and campaign readiness before human review.",
        exitCriteria: "QA has either approved the work or recorded concrete fixes for execution.",
      },
      {
        key: "human",
        label: "Human Review",
        kind: "human",
        ownerRole: "ceo",
        handoffMode: "manual",
        instructions: "Review the GTM output and decide whether to advance, revise, or close the campaign.",
        exitCriteria: "A human operator has approved the campaign outcome or sent it back with direction.",
      },
    ],
  });
}
