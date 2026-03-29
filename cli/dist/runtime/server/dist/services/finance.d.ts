import type { Db } from "@paperclipai/db";
import { financeEvents } from "@paperclipai/db";
export interface FinanceDateRange {
    from?: Date;
    to?: Date;
}
export declare function financeService(db: Db): {
    createEvent: (companyId: string, data: Omit<typeof financeEvents.$inferInsert, "companyId">) => Promise<{
        id: string;
        description: string | null;
        createdAt: Date;
        companyId: string;
        provider: string | null;
        agentId: string | null;
        goalId: string | null;
        projectId: string | null;
        billingCode: string | null;
        heartbeatRunId: string | null;
        issueId: string | null;
        biller: string;
        model: string | null;
        occurredAt: Date;
        costEventId: string | null;
        eventKind: string;
        direction: string;
        executionAdapterType: string | null;
        pricingTier: string | null;
        region: string | null;
        quantity: number | null;
        unit: string | null;
        amountCents: number;
        currency: string;
        estimated: boolean;
        externalInvoiceId: string | null;
        metadataJson: Record<string, unknown> | null;
    }>;
    summary: (companyId: string, range?: FinanceDateRange) => Promise<{
        companyId: string;
        debitCents: number;
        creditCents: number;
        netCents: number;
        estimatedDebitCents: number;
        eventCount: number;
    }>;
    byBiller: (companyId: string, range?: FinanceDateRange) => Promise<{
        biller: string;
        debitCents: number;
        creditCents: number;
        estimatedDebitCents: number;
        eventCount: number;
        kindCount: number;
        netCents: number;
    }[]>;
    byKind: (companyId: string, range?: FinanceDateRange) => Promise<{
        eventKind: string;
        debitCents: number;
        creditCents: number;
        estimatedDebitCents: number;
        eventCount: number;
        billerCount: number;
        netCents: number;
    }[]>;
    list: (companyId: string, range?: FinanceDateRange, limit?: number) => Promise<{
        id: string;
        description: string | null;
        createdAt: Date;
        companyId: string;
        provider: string | null;
        agentId: string | null;
        goalId: string | null;
        projectId: string | null;
        billingCode: string | null;
        heartbeatRunId: string | null;
        issueId: string | null;
        biller: string;
        model: string | null;
        occurredAt: Date;
        costEventId: string | null;
        eventKind: string;
        direction: string;
        executionAdapterType: string | null;
        pricingTier: string | null;
        region: string | null;
        quantity: number | null;
        unit: string | null;
        amountCents: number;
        currency: string;
        estimated: boolean;
        externalInvoiceId: string | null;
        metadataJson: Record<string, unknown> | null;
    }[]>;
};
//# sourceMappingURL=finance.d.ts.map