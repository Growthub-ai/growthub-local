import type { Db } from "@paperclipai/db";
import { costEvents } from "@paperclipai/db";
import type { BudgetIncident, BudgetIncidentResolutionInput, BudgetOverview, BudgetPolicy, BudgetPolicySummary, BudgetPolicyUpsertInput, BudgetScopeType } from "@paperclipai/shared";
export type BudgetEnforcementScope = {
    companyId: string;
    scopeType: BudgetScopeType;
    scopeId: string;
};
export type BudgetServiceHooks = {
    cancelWorkForScope?: (scope: BudgetEnforcementScope) => Promise<void>;
};
export declare function budgetService(db: Db, hooks?: BudgetServiceHooks): {
    listPolicies: (companyId: string) => Promise<BudgetPolicy[]>;
    upsertPolicy: (companyId: string, input: BudgetPolicyUpsertInput, actorUserId: string | null) => Promise<BudgetPolicySummary>;
    overview: (companyId: string) => Promise<BudgetOverview>;
    evaluateCostEvent: (event: typeof costEvents.$inferSelect) => Promise<void>;
    getInvocationBlock: (companyId: string, agentId: string, context?: {
        issueId?: string | null;
        projectId?: string | null;
    }) => Promise<{
        scopeType: "company";
        scopeId: string;
        scopeName: string;
        reason: string;
    } | {
        scopeType: "agent";
        scopeId: string;
        scopeName: string;
        reason: string;
    } | {
        scopeType: "project";
        scopeId: string;
        scopeName: string;
        reason: string;
    } | null>;
    resolveIncident: (companyId: string, incidentId: string, input: BudgetIncidentResolutionInput, actorUserId: string) => Promise<BudgetIncident>;
};
//# sourceMappingURL=budgets.d.ts.map