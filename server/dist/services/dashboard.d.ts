import type { Db } from "@paperclipai/db";
export declare function dashboardService(db: Db): {
    summary: (companyId: string) => Promise<{
        companyId: string;
        agents: {
            active: number;
            running: number;
            paused: number;
            error: number;
        };
        tasks: Record<string, number>;
        costs: {
            monthSpendCents: number;
            monthBudgetCents: number;
            monthUtilizationPercent: number;
        };
        pendingApprovals: number;
        budgets: {
            activeIncidents: number;
            pendingApprovals: number;
            pausedAgents: number;
            pausedProjects: number;
        };
    }>;
};
//# sourceMappingURL=dashboard.d.ts.map