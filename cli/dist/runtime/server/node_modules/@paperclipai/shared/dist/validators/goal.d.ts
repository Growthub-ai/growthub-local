import { z } from "zod";
export declare const createGoalSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    level: z.ZodDefault<z.ZodOptional<z.ZodEnum<["company", "team", "agent", "task"]>>>;
    status: z.ZodDefault<z.ZodOptional<z.ZodEnum<["planned", "active", "achieved", "cancelled"]>>>;
    parentId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    ownerAgentId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "cancelled" | "planned" | "achieved";
    title: string;
    level: "agent" | "company" | "team" | "task";
    description?: string | null | undefined;
    parentId?: string | null | undefined;
    ownerAgentId?: string | null | undefined;
}, {
    title: string;
    status?: "active" | "cancelled" | "planned" | "achieved" | undefined;
    description?: string | null | undefined;
    parentId?: string | null | undefined;
    level?: "agent" | "company" | "team" | "task" | undefined;
    ownerAgentId?: string | null | undefined;
}>;
export type CreateGoal = z.infer<typeof createGoalSchema>;
export declare const updateGoalSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    level: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["company", "team", "agent", "task"]>>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["planned", "active", "achieved", "cancelled"]>>>>;
    parentId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    ownerAgentId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    status?: "active" | "cancelled" | "planned" | "achieved" | undefined;
    description?: string | null | undefined;
    title?: string | undefined;
    parentId?: string | null | undefined;
    level?: "agent" | "company" | "team" | "task" | undefined;
    ownerAgentId?: string | null | undefined;
}, {
    status?: "active" | "cancelled" | "planned" | "achieved" | undefined;
    description?: string | null | undefined;
    title?: string | undefined;
    parentId?: string | null | undefined;
    level?: "agent" | "company" | "team" | "task" | undefined;
    ownerAgentId?: string | null | undefined;
}>;
export type UpdateGoal = z.infer<typeof updateGoalSchema>;
//# sourceMappingURL=goal.d.ts.map