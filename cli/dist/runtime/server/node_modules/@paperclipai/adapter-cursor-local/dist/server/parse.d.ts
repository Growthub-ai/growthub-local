export declare function parseCursorJsonl(stdout: string): {
    sessionId: string | null;
    summary: string;
    usage: {
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
    };
    costUsd: number | null;
    errorMessage: string | null;
};
export declare function isCursorUnknownSessionError(stdout: string, stderr: string): boolean;
//# sourceMappingURL=parse.d.ts.map