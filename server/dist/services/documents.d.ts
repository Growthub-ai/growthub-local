import type { Db } from "@paperclipai/db";
export declare function extractLegacyPlanBody(description: string | null | undefined): string | null;
export declare function documentService(db: Db): {
    getIssueDocumentPayload: (issue: {
        id: string;
        description: string | null;
    }) => Promise<{
        planDocument: {
            latestRevisionId: string | null;
            latestRevisionNumber: number;
            createdByAgentId: string | null;
            createdByUserId: string | null;
            updatedByAgentId: string | null;
            updatedByUserId: string | null;
            createdAt: Date;
            updatedAt: Date;
            body?: string | undefined;
            id: string;
            companyId: string;
            issueId: string;
            key: string;
            title: string | null;
            format: string;
        } | null;
        documentSummaries: {
            latestRevisionId: string | null;
            latestRevisionNumber: number;
            createdByAgentId: string | null;
            createdByUserId: string | null;
            updatedByAgentId: string | null;
            updatedByUserId: string | null;
            createdAt: Date;
            updatedAt: Date;
            body?: string | undefined;
            id: string;
            companyId: string;
            issueId: string;
            key: string;
            title: string | null;
            format: string;
        }[];
        legacyPlanDocument: {
            key: "plan";
            body: string;
            source: "issue_description";
        } | null;
    }>;
    listIssueDocuments: (issueId: string) => Promise<{
        latestRevisionId: string | null;
        latestRevisionNumber: number;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        updatedByAgentId: string | null;
        updatedByUserId: string | null;
        createdAt: Date;
        updatedAt: Date;
        body?: string | undefined;
        id: string;
        companyId: string;
        issueId: string;
        key: string;
        title: string | null;
        format: string;
    }[]>;
    getIssueDocumentByKey: (issueId: string, rawKey: string) => Promise<{
        latestRevisionId: string | null;
        latestRevisionNumber: number;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        updatedByAgentId: string | null;
        updatedByUserId: string | null;
        createdAt: Date;
        updatedAt: Date;
        body?: string | undefined;
        id: string;
        companyId: string;
        issueId: string;
        key: string;
        title: string | null;
        format: string;
    } | null>;
    listIssueDocumentRevisions: (issueId: string, rawKey: string) => Promise<{
        id: string;
        companyId: string;
        documentId: string;
        issueId: string;
        key: string;
        revisionNumber: number;
        body: string;
        changeSummary: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        createdAt: Date;
    }[]>;
    upsertIssueDocument: (input: {
        issueId: string;
        key: string;
        title?: string | null;
        format: string;
        body: string;
        changeSummary?: string | null;
        baseRevisionId?: string | null;
        createdByAgentId?: string | null;
        createdByUserId?: string | null;
    }) => Promise<{
        created: false;
        document: {
            title: string | null;
            format: string;
            body: string;
            latestRevisionId: string;
            latestRevisionNumber: number;
            updatedByAgentId: string | null;
            updatedByUserId: string | null;
            updatedAt: Date;
            id: string;
            companyId: string;
            issueId: string;
            key: string;
            latestBody: string;
            createdByAgentId: string | null;
            createdByUserId: string | null;
            createdAt: Date;
        };
    } | {
        created: true;
        document: {
            id: string;
            companyId: string;
            issueId: string;
            key: string;
            title: string | null;
            format: string;
            body: string;
            latestRevisionId: string;
            latestRevisionNumber: number;
            createdByAgentId: string | null;
            createdByUserId: string | null;
            updatedByAgentId: string | null;
            updatedByUserId: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    deleteIssueDocument: (issueId: string, rawKey: string) => Promise<{
        body: string;
        latestRevisionId: string | null;
        id: string;
        companyId: string;
        issueId: string;
        key: string;
        title: string | null;
        format: string;
        latestBody: string;
        latestRevisionNumber: number;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        updatedByAgentId: string | null;
        updatedByUserId: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
};
//# sourceMappingURL=documents.d.ts.map