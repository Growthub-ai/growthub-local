import { z } from "zod";
import {
  AGENT_ROLES,
  TICKET_STAGE_HANDOFF_MODES,
  TICKET_STAGE_KINDS,
  TICKET_STATUSES,
} from "../constants.js";
import { normalizeTicketStageKey } from "../ticket-stages.js";

export const ticketStageDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1).max(120),
  kind: z.enum(TICKET_STAGE_KINDS).nullable().optional(),
  ownerRole: z.enum(AGENT_ROLES).nullable().optional(),
  handoffMode: z.enum(TICKET_STAGE_HANDOFF_MODES).nullable().optional(),
  instructions: z.string().nullable().optional(),
  exitCriteria: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export const ticketStageDefinitionsSchema = z.array(ticketStageDefinitionSchema).min(1).superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.forEach((definition, index) => {
    const normalizedKey = normalizeTicketStageKey(String(definition.key));
    if (!normalizedKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "key"],
        message: "Stage key must not be empty",
      });
      return;
    }
    if (seen.has(normalizedKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "key"],
        message: "Stage keys must be unique",
      });
      return;
    }
    seen.add(normalizedKey);
  });
});

export const createTicketSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  stageOrder: z.array(z.string().min(1)).min(1).optional(),
  stageDefinitions: ticketStageDefinitionsSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  instructions: z.string().optional(),
  leadAgentId: z.string().uuid().nullable().optional(),
});
export type CreateTicket = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  currentStage: z.string().min(1).optional(),
  stageOrder: z.array(z.string().min(1)).min(1).optional(),
  stageDefinitions: ticketStageDefinitionsSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  instructions: z.string().optional(),
  leadAgentId: z.string().uuid().nullable().optional(),
});
export type UpdateTicket = z.infer<typeof updateTicketSchema>;

export const advanceTicketStageSchema = z.object({});
export type AdvanceTicketStage = z.infer<typeof advanceTicketStageSchema>;
