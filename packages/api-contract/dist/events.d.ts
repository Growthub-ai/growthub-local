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
export type ExecutionEventType = "node_start" | "node_complete" | "node_error" | "credit_warning" | "progress" | "complete" | "error";
export interface NodeStartEvent {
    type: "node_start";
    /** Node instance id within the executing pipeline. */
    nodeId: string;
    /** Capability slug being dispatched. */
    slug: string;
    /** ISO-8601 timestamp. */
    at: string;
}
export interface NodeCompleteEvent {
    type: "node_complete";
    nodeId: string;
    slug: string;
    /** Raw node output payload, if the runtime produced one. */
    output?: unknown;
    at: string;
}
export interface NodeErrorEvent {
    type: "node_error";
    nodeId: string;
    slug: string;
    /** Human-readable error message. */
    error: string;
    at: string;
}
export interface CreditWarningEvent {
    type: "credit_warning";
    /** Remaining credit balance reported by the runtime, when available. */
    availableCredits?: number;
    /** Optional human-facing message. */
    message?: string;
    at: string;
}
export interface ProgressEvent {
    type: "progress";
    /** Stage label (e.g. `rendering`, `polling`, `uploading`). */
    stage: string;
    /** Optional human-facing message. */
    message?: string;
    at: string;
}
export interface CompleteEvent {
    type: "complete";
    /** Execution id that just completed. */
    executionId: string;
    /** Optional summary payload. Consumers MUST tolerate missing fields. */
    summary?: unknown;
    at: string;
}
export interface ErrorEvent {
    type: "error";
    /** Human-readable error message describing the fatal failure. */
    message: string;
    at: string;
}
export type ExecutionEvent = NodeStartEvent | NodeCompleteEvent | NodeErrorEvent | CreditWarningEvent | ProgressEvent | CompleteEvent | ErrorEvent;
/**
 * Type guard for an {@link ExecutionEvent}.
 *
 * Consumers SHOULD use this when parsing NDJSON lines rather than
 * pattern-matching event type strings by hand — it keeps their parser
 * robust against forward-compatible event additions.
 */
export declare function isExecutionEvent(value: unknown): value is ExecutionEvent;
//# sourceMappingURL=events.d.ts.map