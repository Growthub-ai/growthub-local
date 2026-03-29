export declare function parseOpenCodeJsonl(stdout: string): {
    sessionId: string | null;
    summary: string;
    usage: {
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
    };
    costUsd: number;
    errorMessage: string | null;
};
export declare function isOpenCodeUnknownSessionError(stdout: string, stderr: string): boolean;
//# sourceMappingURL=parse.d.ts.map