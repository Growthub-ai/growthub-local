import { z } from "zod";
import { APPROVAL_TYPES } from "../constants.js";
export const createApprovalSchema = z.object({
    type: z.enum(APPROVAL_TYPES),
    requestedByAgentId: z.string().uuid().optional().nullable(),
    payload: z.record(z.unknown()),
    issueIds: z.array(z.string().uuid()).optional(),
});
export const resolveApprovalSchema = z.object({
    decisionNote: z.string().optional().nullable(),
    decidedByUserId: z.string().optional().default("board"),
});
export const requestApprovalRevisionSchema = z.object({
    decisionNote: z.string().optional().nullable(),
    decidedByUserId: z.string().optional().default("board"),
});
export const resubmitApprovalSchema = z.object({
    payload: z.record(z.unknown()).optional(),
});
export const addApprovalCommentSchema = z.object({
    body: z.string().min(1),
});
//# sourceMappingURL=approval.js.map