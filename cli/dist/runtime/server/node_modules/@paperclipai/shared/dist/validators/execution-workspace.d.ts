import { z } from "zod";
export declare const executionWorkspaceStatusSchema: z.ZodEnum<["active", "idle", "in_review", "archived", "cleanup_failed"]>;
export declare const updateExecutionWorkspaceSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["active", "idle", "in_review", "archived", "cleanup_failed"]>>;
    cleanupEligibleAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    cleanupReason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    metadata: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strict", z.ZodTypeAny, {
    status?: "active" | "archived" | "idle" | "in_review" | "cleanup_failed" | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    cleanupEligibleAt?: string | null | undefined;
    cleanupReason?: string | null | undefined;
}, {
    status?: "active" | "archived" | "idle" | "in_review" | "cleanup_failed" | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    cleanupEligibleAt?: string | null | undefined;
    cleanupReason?: string | null | undefined;
}>;
export type UpdateExecutionWorkspace = z.infer<typeof updateExecutionWorkspaceSchema>;
//# sourceMappingURL=execution-workspace.d.ts.map