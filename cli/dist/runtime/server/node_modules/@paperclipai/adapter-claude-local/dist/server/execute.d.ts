import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
export declare function runClaudeLogin(input: {
    runId: string;
    agent: AdapterExecutionContext["agent"];
    config: Record<string, unknown>;
    context?: Record<string, unknown>;
    authToken?: string;
    onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}): Promise<{
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    loginUrl: string | null;
}>;
export declare function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
//# sourceMappingURL=execute.d.ts.map