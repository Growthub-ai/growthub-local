/**
 * Lightweight cron expression parser and next-run calculator.
 *
 * Supports standard 5-field cron expressions:
 *
 *   ┌────────────── minute (0–59)
 *   │ ┌──────────── hour   (0–23)
 *   │ │ ┌────────── day of month (1–31)
 *   │ │ │ ┌──────── month  (1–12)
 *   │ │ │ │ ┌────── day of week (0–6, Sun=0)
 *   │ │ │ │ │
 *   * * * * *
 *
 * Supported syntax per field:
 *   - `*`        — any value
 *   - `N`        — exact value
 *   - `N-M`      — range (inclusive)
 *   - `N/S`      — start at N, step S (within field bounds)
 *   - `* /S`     — every S (from field min)   [no space — shown to avoid comment termination]
 *   - `N-M/S`    — range with step
 *   - `N,M,...`  — list of values, ranges, or steps
 *
 * @module
 */
/**
 * A parsed cron schedule. Each field is a sorted array of valid integer values
 * for that field.
 */
export interface ParsedCron {
    minutes: number[];
    hours: number[];
    daysOfMonth: number[];
    months: number[];
    daysOfWeek: number[];
}
/**
 * Parse a cron expression string into a structured {@link ParsedCron}.
 *
 * @param expression — A standard 5-field cron expression.
 * @returns Parsed cron with sorted valid values for each field.
 * @throws {Error} on invalid syntax.
 *
 * @example
 * ```ts
 * const parsed = parseCron("0 * * * *"); // every hour at minute 0
 * // parsed.minutes === [0]
 * // parsed.hours === [0,1,2,...,23]
 * ```
 */
export declare function parseCron(expression: string): ParsedCron;
/**
 * Validate a cron expression string. Returns `null` if valid, or an error
 * message string if invalid.
 *
 * @param expression — A cron expression string to validate.
 * @returns `null` on success, error message on failure.
 */
export declare function validateCron(expression: string): string | null;
/**
 * Calculate the next run time after `after` for the given parsed cron schedule.
 *
 * Starts from the minute immediately following `after` and walks forward
 * until a matching minute is found (up to a safety limit of ~4 years to
 * prevent infinite loops on impossible schedules).
 *
 * @param cron  — Parsed cron schedule.
 * @param after — The reference date. The returned date will be strictly after this.
 * @returns The next matching `Date`, or `null` if no match found within the search window.
 */
export declare function nextCronTick(cron: ParsedCron, after: Date): Date | null;
/**
 * Convenience: parse a cron expression and compute the next run time.
 *
 * @param expression — 5-field cron expression string.
 * @param after — Reference date (defaults to `new Date()`).
 * @returns The next matching Date, or `null` if no match within 4 years.
 * @throws {Error} if the cron expression is invalid.
 */
export declare function nextCronTickFromExpression(expression: string, after?: Date): Date | null;
//# sourceMappingURL=cron.d.ts.map