/**
 * @growthub/api-contract — Execution event stream (CMS SDK v1)
 *
 * Canonical event union for Growthub execution streams.
 *
 * This is the one streaming contract that terminals, browser consoles,
 * chat surfaces, background agents, and future protocol bridges must
 * speak. It freezes the semantics already produced by the hosted
 * `/api/execute-workflow` NDJSON stream into a stable public shape.
 *
 * Wire format is NDJSON: each event is serialized on its own line.
 *
 * Rules:
 *   - Additive only — new event types may be appended, never renamed.
 *   - Every event carries an ISO-8601 `at` timestamp.
 *   - Consumers MUST ignore unknown event types without erroring.
 */
// ---------------------------------------------------------------------------
// Narrow helpers
// ---------------------------------------------------------------------------
/**
 * Type guard for an {@link ExecutionEvent}.
 *
 * Consumers SHOULD use this when parsing NDJSON lines rather than
 * pattern-matching event type strings by hand — it keeps their parser
 * robust against forward-compatible event additions.
 */
export function isExecutionEvent(value) {
    if (!value || typeof value !== "object")
        return false;
    const record = value;
    if (typeof record.type !== "string")
        return false;
    if (typeof record.at !== "string")
        return false;
    switch (record.type) {
        case "node_start":
        case "node_complete":
        case "node_error":
        case "credit_warning":
        case "progress":
        case "complete":
        case "error":
            return true;
        default:
            return false;
    }
}
//# sourceMappingURL=events.js.map