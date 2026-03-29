interface ParsedPiOutput {
    sessionId: string | null;
    messages: string[];
    errors: string[];
    usage: {
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens: number;
        costUsd: number;
    };
    finalMessage: string | null;
    toolCalls: Array<{
        toolCallId: string;
        toolName: string;
        args: unknown;
        result: string | null;
        isError: boolean;
    }>;
}
export declare function parsePiJsonl(stdout: string): ParsedPiOutput;
export declare function isPiUnknownSessionError(stdout: string, stderr: string): boolean;
export {};
//# sourceMappingURL=parse.d.ts.map