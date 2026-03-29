import type { Db } from "@paperclipai/db";
/**
 * Delete plugin log rows older than `retentionDays`.
 *
 * Deletes in batches of `DELETE_BATCH_SIZE` to keep transaction sizes
 * bounded and avoid holding locks for extended periods.
 *
 * @returns The total number of rows deleted.
 */
export declare function prunePluginLogs(db: Db, retentionDays?: number): Promise<number>;
/**
 * Start a periodic plugin log cleanup interval.
 *
 * @param db - Database connection
 * @param intervalMs - How often to run (default: 1 hour)
 * @param retentionDays - How many days of logs to keep (default: 7)
 * @returns A cleanup function that stops the interval
 */
export declare function startPluginLogRetention(db: Db, intervalMs?: number, retentionDays?: number): () => void;
//# sourceMappingURL=plugin-log-retention.d.ts.map