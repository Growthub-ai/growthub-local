export type WorkspaceOperationLogStoreType = "local_file";
export interface WorkspaceOperationLogHandle {
    store: WorkspaceOperationLogStoreType;
    logRef: string;
}
export interface WorkspaceOperationLogReadOptions {
    offset?: number;
    limitBytes?: number;
}
export interface WorkspaceOperationLogReadResult {
    content: string;
    nextOffset?: number;
}
export interface WorkspaceOperationLogFinalizeSummary {
    bytes: number;
    sha256?: string;
    compressed: boolean;
}
export interface WorkspaceOperationLogStore {
    begin(input: {
        companyId: string;
        operationId: string;
    }): Promise<WorkspaceOperationLogHandle>;
    append(handle: WorkspaceOperationLogHandle, event: {
        stream: "stdout" | "stderr" | "system";
        chunk: string;
        ts: string;
    }): Promise<void>;
    finalize(handle: WorkspaceOperationLogHandle): Promise<WorkspaceOperationLogFinalizeSummary>;
    read(handle: WorkspaceOperationLogHandle, opts?: WorkspaceOperationLogReadOptions): Promise<WorkspaceOperationLogReadResult>;
}
export declare function getWorkspaceOperationLogStore(): WorkspaceOperationLogStore;
//# sourceMappingURL=workspace-operation-log-store.d.ts.map