import type { UsageSummary } from "@paperclipai/adapter-utils";
export declare function parseClaudeStreamJson(stdout: string): {
    sessionId: string | null;
    model: string;
    costUsd: number | null;
    usage: UsageSummary | null;
    summary: string;
    resultJson: Record<string, unknown> | null;
};
export declare function extractClaudeLoginUrl(text: string): string | null;
export declare function detectClaudeLoginRequired(input: {
    parsed: Record<string, unknown> | null;
    stdout: string;
    stderr: string;
}): {
    requiresLogin: boolean;
    loginUrl: string | null;
};
export declare function describeClaudeFailure(parsed: Record<string, unknown>): string | null;
export declare function isClaudeMaxTurnsResult(parsed: Record<string, unknown> | null | undefined): boolean;
export declare function isClaudeUnknownSessionError(parsed: Record<string, unknown>): boolean;
//# sourceMappingURL=parse.d.ts.map