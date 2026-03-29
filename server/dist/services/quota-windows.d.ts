import type { ProviderQuotaResult } from "@paperclipai/shared";
/**
 * Asks each registered adapter for its provider quota windows and aggregates the results.
 * Adapters that don't implement getQuotaWindows() are silently skipped.
 * Individual adapter failures are caught and returned as error results rather than
 * letting one provider's outage block the entire response.
 */
export declare function fetchAllQuotaWindows(): Promise<ProviderQuotaResult[]>;
//# sourceMappingURL=quota-windows.d.ts.map