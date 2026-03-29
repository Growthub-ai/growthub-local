import type { Db } from "@paperclipai/db";
import { costEvents } from "@paperclipai/db";
import { type BudgetServiceHooks } from "./budgets.js";
export interface CostDateRange {
    from?: Date;
    to?: Date;
}
export declare function costService(db: Db, budgetHooks?: BudgetServiceHooks): {
    createEvent: (companyId: string, data: Omit<typeof costEvents.$inferInsert, "companyId">) => Promise<{
        id: string;
        createdAt: Date;
        companyId: string;
        provider: string;
        agentId: string;
        goalId: string | null;
        projectId: string | null;
        billingCode: string | null;
        heartbeatRunId: string | null;
        issueId: string | null;
        biller: string;
        billingType: string;
        model: string;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        costCents: number;
        occurredAt: Date;
    }>;
    summary: (companyId: string, range?: CostDateRange) => Promise<{
        companyId: string;
        spendCents: number;
        budgetCents: number;
        utilizationPercent: number;
    }>;
    byAgent: (companyId: string, range?: CostDateRange) => Promise<{
        agentId: string;
        agentName: string | null;
        agentStatus: string | null;
        costCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        apiRunCount: number;
        subscriptionRunCount: number;
        subscriptionCachedInputTokens: number;
        subscriptionInputTokens: number;
        subscriptionOutputTokens: number;
    }[]>;
    byProvider: (companyId: string, range?: CostDateRange) => Promise<{
        provider: string;
        biller: string;
        billingType: string;
        model: string;
        costCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        apiRunCount: number;
        subscriptionRunCount: number;
        subscriptionCachedInputTokens: number;
        subscriptionInputTokens: number;
        subscriptionOutputTokens: number;
    }[]>;
    byBiller: (companyId: string, range?: CostDateRange) => Promise<{
        biller: string;
        costCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        apiRunCount: number;
        subscriptionRunCount: number;
        subscriptionCachedInputTokens: number;
        subscriptionInputTokens: number;
        subscriptionOutputTokens: number;
        providerCount: number;
        modelCount: number;
    }[]>;
    /**
     * aggregates cost_events by provider for each of three rolling windows:
     * last 5 hours, last 24 hours, last 7 days.
     * purely internal consumption data, no external rate-limit sources.
     */
    windowSpend: (companyId: string) => Promise<{
        provider: string;
        biller: string;
        window: string;
        windowHours: 5 | 24 | 168;
        costCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
    }[]>;
    byAgentModel: (companyId: string, range?: CostDateRange) => Promise<{
        agentId: string;
        agentName: string | null;
        provider: string;
        biller: string;
        billingType: string;
        model: string;
        costCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
    }[]>;
    byProject: (companyId: string, range?: CostDateRange) => Promise<{
        projectId: string | null;
        projectName: string;
        costCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
    }[]>;
};
//# sourceMappingURL=costs.d.ts.map