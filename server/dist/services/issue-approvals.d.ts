import type { Db } from "@paperclipai/db";
interface LinkActor {
    agentId?: string | null;
    userId?: string | null;
}
export declare function issueApprovalService(db: Db): {
    listApprovalsForIssue: (issueId: string) => Promise<{
        payload: Record<string, unknown>;
        id: string;
        companyId: string;
        type: string;
        requestedByAgentId: string | null;
        requestedByUserId: string | null;
        status: string;
        decisionNote: string | null;
        decidedByUserId: string | null;
        decidedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    listIssuesForApproval: (approvalId: string) => Promise<{
        id: string;
        companyId: string;
        projectId: string | null;
        goalId: string | null;
        parentId: string | null;
        title: string;
        description: string | null;
        status: string;
        priority: string;
        assigneeAgentId: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        issueNumber: number | null;
        identifier: string | null;
        requestDepth: number;
        billingCode: string | null;
        startedAt: Date | null;
        completedAt: Date | null;
        cancelledAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    link: (issueId: string, approvalId: string, actor?: LinkActor) => Promise<{
        createdAt: Date;
        companyId: string;
        approvalId: string;
        issueId: string;
        linkedByAgentId: string | null;
        linkedByUserId: string | null;
    }>;
    unlink: (issueId: string, approvalId: string) => Promise<void>;
    linkManyForApproval: (approvalId: string, issueIds: string[], actor?: LinkActor) => Promise<void>;
};
export {};
//# sourceMappingURL=issue-approvals.d.ts.map