import { z } from "zod";
import { TICKET_STATUSES } from "../constants.js";

export const createTicketSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  stageOrder: z.array(z.string().min(1)).optional(),
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
  stageOrder: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.unknown()).optional(),
  instructions: z.string().optional(),
  leadAgentId: z.string().uuid().nullable().optional(),
});
export type UpdateTicket = z.infer<typeof updateTicketSchema>;

export const advanceTicketStageSchema = z.object({});
export type AdvanceTicketStage = z.infer<typeof advanceTicketStageSchema>;
