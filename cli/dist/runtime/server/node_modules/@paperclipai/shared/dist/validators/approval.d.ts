import { z } from "zod";
export declare const createApprovalSchema: z.ZodObject<{
    type: z.ZodEnum<["hire_agent", "approve_ceo_strategy", "budget_override_required"]>;
    requestedByAgentId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    issueIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "hire_agent" | "approve_ceo_strategy" | "budget_override_required";
    payload: Record<string, unknown>;
    requestedByAgentId?: string | null | undefined;
    issueIds?: string[] | undefined;
}, {
    type: "hire_agent" | "approve_ceo_strategy" | "budget_override_required";
    payload: Record<string, unknown>;
    requestedByAgentId?: string | null | undefined;
    issueIds?: string[] | undefined;
}>;
export type CreateApproval = z.infer<typeof createApprovalSchema>;
export declare const resolveApprovalSchema: z.ZodObject<{
    decisionNote: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    decidedByUserId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    decidedByUserId: string;
    decisionNote?: string | null | undefined;
}, {
    decisionNote?: string | null | undefined;
    decidedByUserId?: string | undefined;
}>;
export type ResolveApproval = z.infer<typeof resolveApprovalSchema>;
export declare const requestApprovalRevisionSchema: z.ZodObject<{
    decisionNote: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    decidedByUserId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    decidedByUserId: string;
    decisionNote?: string | null | undefined;
}, {
    decisionNote?: string | null | undefined;
    decidedByUserId?: string | undefined;
}>;
export type RequestApprovalRevision = z.infer<typeof requestApprovalRevisionSchema>;
export declare const resubmitApprovalSchema: z.ZodObject<{
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    payload?: Record<string, unknown> | undefined;
}, {
    payload?: Record<string, unknown> | undefined;
}>;
export type ResubmitApproval = z.infer<typeof resubmitApprovalSchema>;
export declare const addApprovalCommentSchema: z.ZodObject<{
    body: z.ZodString;
}, "strip", z.ZodTypeAny, {
    body: string;
}, {
    body: string;
}>;
export type AddApprovalComment = z.infer<typeof addApprovalCommentSchema>;
//# sourceMappingURL=approval.d.ts.map