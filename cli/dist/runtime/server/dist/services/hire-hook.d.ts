import type { Db } from "@paperclipai/db";
export interface NotifyHireApprovedInput {
    companyId: string;
    agentId: string;
    source: "join_request" | "approval";
    sourceId: string;
    approvedAt?: Date;
}
/**
 * Invokes the adapter's onHireApproved hook when an agent is approved (join-request or hire_agent approval).
 * Failures are non-fatal: we log and write to activity, never throw.
 */
export declare function notifyHireApproved(db: Db, input: NotifyHireApprovedInput): Promise<void>;
//# sourceMappingURL=hire-hook.d.ts.map