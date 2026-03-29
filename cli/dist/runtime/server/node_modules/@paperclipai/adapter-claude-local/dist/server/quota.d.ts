import type { ProviderQuotaResult, QuotaWindow } from "@paperclipai/adapter-utils";
export declare function claudeConfigDir(): string;
interface ClaudeAuthStatus {
    loggedIn: boolean;
    authMethod: string | null;
    subscriptionType: string | null;
}
export declare function readClaudeAuthStatus(): Promise<ClaudeAuthStatus | null>;
export declare function readClaudeToken(): Promise<string | null>;
/** Convert a 0-1 utilization fraction to a 0-100 integer percent. Returns null for null/undefined input. */
export declare function toPercent(utilization: number | null | undefined): number | null;
/** fetch with an abort-based timeout so a hanging provider api doesn't block the response indefinitely */
export declare function fetchWithTimeout(url: string, init: RequestInit, ms?: number): Promise<Response>;
export declare function fetchClaudeQuota(token: string): Promise<QuotaWindow[]>;
export declare function parseClaudeCliUsageText(text: string): QuotaWindow[];
export declare function captureClaudeCliUsageText(timeoutMs?: number): Promise<string>;
export declare function fetchClaudeCliQuota(): Promise<QuotaWindow[]>;
export declare function getQuotaWindows(): Promise<ProviderQuotaResult>;
export {};
//# sourceMappingURL=quota.d.ts.map