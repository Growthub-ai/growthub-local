import type { Db } from "@paperclipai/db";
import { executionWorkspaces } from "@paperclipai/db";
import type { ExecutionWorkspace } from "@paperclipai/shared";
type ExecutionWorkspaceRow = typeof executionWorkspaces.$inferSelect;
declare function toExecutionWorkspace(row: ExecutionWorkspaceRow): ExecutionWorkspace;
export declare function executionWorkspaceService(db: Db): {
    list: (companyId: string, filters?: {
        projectId?: string;
        projectWorkspaceId?: string;
        issueId?: string;
        status?: string;
        reuseEligible?: boolean;
    }) => Promise<ExecutionWorkspace[]>;
    getById: (id: string) => Promise<ExecutionWorkspace | null>;
    create: (data: typeof executionWorkspaces.$inferInsert) => Promise<ExecutionWorkspace | null>;
    update: (id: string, patch: Partial<typeof executionWorkspaces.$inferInsert>) => Promise<ExecutionWorkspace | null>;
};
export { toExecutionWorkspace };
//# sourceMappingURL=execution-workspaces.d.ts.map