export type RunLogStoreType = "local_file";
export interface RunLogHandle {
    store: RunLogStoreType;
    logRef: string;
}
export interface RunLogReadOptions {
    offset?: number;
    limitBytes?: number;
}
export interface RunLogReadResult {
    content: string;
    nextOffset?: number;
}
export interface RunLogFinalizeSummary {
    bytes: number;
    sha256?: string;
    compressed: boolean;
}
export interface RunLogStore {
    begin(input: {
        companyId: string;
        agentId: string;
        runId: string;
    }): Promise<RunLogHandle>;
    append(handle: RunLogHandle, event: {
        stream: "stdout" | "stderr" | "system";
        chunk: string;
        ts: string;
    }): Promise<void>;
    finalize(handle: RunLogHandle): Promise<RunLogFinalizeSummary>;
    read(handle: RunLogHandle, opts?: RunLogReadOptions): Promise<RunLogReadResult>;
}
export declare function getRunLogStore(): RunLogStore;
//# sourceMappingURL=run-log-store.d.ts.map