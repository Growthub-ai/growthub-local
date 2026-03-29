import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
export declare function companyService(db: Db): {
    list: () => Promise<({
        id: string;
        name: string;
        description: string | null;
        status: string;
        issuePrefix: string;
        issueCounter: number;
        budgetMonthlyCents: number;
        spentMonthlyCents: number;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoAssetId: string | null;
        createdAt: Date;
        updatedAt: Date;
    } & {
        spentMonthlyCents: number;
    } & {
        logoUrl: string | null;
    })[]>;
    getById: (id: string) => Promise<({
        id: string;
        name: string;
        description: string | null;
        status: string;
        issuePrefix: string;
        issueCounter: number;
        budgetMonthlyCents: number;
        spentMonthlyCents: number;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoAssetId: string | null;
        createdAt: Date;
        updatedAt: Date;
    } & {
        spentMonthlyCents: number;
    } & {
        logoUrl: string | null;
    }) | null>;
    create: (data: typeof companies.$inferInsert) => Promise<{
        id: string;
        name: string;
        description: string | null;
        status: string;
        issuePrefix: string;
        issueCounter: number;
        budgetMonthlyCents: number;
        spentMonthlyCents: number;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoAssetId: string | null;
        createdAt: Date;
        updatedAt: Date;
    } & {
        spentMonthlyCents: number;
    } & {
        logoUrl: string | null;
    }>;
    update: (id: string, data: Partial<typeof companies.$inferInsert> & {
        logoAssetId?: string | null;
    }) => Promise<({
        logoAssetId: string | null;
        id: string;
        name: string;
        description: string | null;
        status: string;
        pauseReason: string | null;
        pausedAt: Date | null;
        issuePrefix: string;
        issueCounter: number;
        budgetMonthlyCents: number;
        spentMonthlyCents: number;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        createdAt: Date;
        updatedAt: Date;
    } & {
        spentMonthlyCents: number;
    } & {
        logoUrl: string | null;
    }) | null>;
    archive: (id: string) => Promise<({
        id: string;
        name: string;
        description: string | null;
        status: string;
        issuePrefix: string;
        issueCounter: number;
        budgetMonthlyCents: number;
        spentMonthlyCents: number;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoAssetId: string | null;
        createdAt: Date;
        updatedAt: Date;
    } & {
        spentMonthlyCents: number;
    } & {
        logoUrl: string | null;
    }) | null>;
    remove: (id: string) => Promise<{
        id: string;
        name: string;
        description: string | null;
        status: string;
        pauseReason: string | null;
        pausedAt: Date | null;
        issuePrefix: string;
        issueCounter: number;
        budgetMonthlyCents: number;
        spentMonthlyCents: number;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    stats: () => Promise<Record<string, {
        agentCount: number;
        issueCount: number;
    }>>;
};
//# sourceMappingURL=companies.d.ts.map