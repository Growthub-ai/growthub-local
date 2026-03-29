export declare function parseCodexJsonl(stdout: string): {
    sessionId: string | null;
    summary: string;
    usage: {
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
    };
    errorMessage: string | null;
};
export declare function isCodexUnknownSessionError(stdout: string, stderr: string): boolean;
//# sourceMappingURL=parse.d.ts.map