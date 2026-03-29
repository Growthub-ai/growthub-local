import type { Db } from "@paperclipai/db";
import { workspaceOperations } from "@paperclipai/db";
import type { WorkspaceOperation, WorkspaceOperationPhase, WorkspaceOperationStatus } from "@paperclipai/shared";
type WorkspaceOperationRow = typeof workspaceOperations.$inferSelect;
declare function toWorkspaceOperation(row: WorkspaceOperationRow): WorkspaceOperation;
export interface WorkspaceOperationRecorder {
    attachExecutionWorkspaceId(executionWorkspaceId: string | null): Promise<void>;
    recordOperation(input: {
        phase: WorkspaceOperationPhase;
        command?: string | null;
        cwd?: string | null;
        metadata?: Record<string, unknown> | null;
        run: () => Promise<{
            status?: WorkspaceOperationStatus;
            exitCode?: number | null;
            stdout?: string | null;
            stderr?: string | null;
            system?: string | null;
            metadata?: Record<string, unknown> | null;
        }>;
    }): Promise<WorkspaceOperation>;
}
export declare function workspaceOperationService(db: Db): {
    getById: (id: string) => Promise<WorkspaceOperation | null>;
    createRecorder(input: {
        companyId: string;
        heartbeatRunId?: string | null;
        executionWorkspaceId?: string | null;
    }): WorkspaceOperationRecorder;
    listForRun: (runId: string, executionWorkspaceId?: string | null) => Promise<WorkspaceOperation[]>;
    listForExecutionWorkspace: (executionWorkspaceId: string) => Promise<WorkspaceOperation[]>;
    readLog: (operationId: string, opts?: {
        offset?: number;
        limitBytes?: number;
    }) => Promise<{
        content: string;
        nextOffset?: number;
        operationId: string;
        store: string;
        logRef: string;
    }>;
};
export { toWorkspaceOperation };
//# sourceMappingURL=workspace-operations.d.ts.map