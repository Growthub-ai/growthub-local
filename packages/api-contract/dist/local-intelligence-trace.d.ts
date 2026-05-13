/**
 * @growthub/api-contract — Local Intelligence trace (CMS SDK v1)
 *
 * Kit-local and CLI-local trace event names for governed local-model
 * sandbox runs. Distinct from `./events.ts` (`ExecutionEvent` hosted
 * NDJSON) and `./pipeline-trace.ts` (pipeline stage boundaries).
 *
 * Rules:
 *   - Additive only.
 *   - JSON-serializable payloads.
 *   - Writers append NDJSON; readers ignore unknown `type` values.
 */
export type LocalIntelligenceTraceEventType = "local-intelligence-adapter-selected" | "local-model-sandbox-run-started" | "local-model-sandbox-run-completed" | "local-model-tool-intent-proposed" | "local-model-tool-intent-rejected";
export interface LocalIntelligenceTraceEnvelope {
    type: LocalIntelligenceTraceEventType;
    /** ISO-8601 timestamp. */
    at: string;
    /** Optional correlation id (e.g. sandbox task id). */
    taskId?: string;
}
export interface LocalIntelligenceAdapterSelectedEvent extends LocalIntelligenceTraceEnvelope {
    type: "local-intelligence-adapter-selected";
    adapterKind: "local-intelligence";
    mode: string;
    modelId?: string;
    endpoint?: string;
}
export interface LocalModelSandboxRunStartedEvent extends LocalIntelligenceTraceEnvelope {
    type: "local-model-sandbox-run-started";
    taskId: string;
    businessObjectType: string;
    businessObjectId?: string;
}
export interface LocalModelSandboxRunCompletedEvent extends LocalIntelligenceTraceEnvelope {
    type: "local-model-sandbox-run-completed";
    taskId: string;
    businessObjectType: string;
    latencyMs?: number;
    confidence?: number;
    warningCount?: number;
}
export interface LocalModelToolIntentProposedEvent extends LocalIntelligenceTraceEnvelope {
    type: "local-model-tool-intent-proposed";
    taskId: string;
    toolSlug: string;
    confidence?: number;
}
export interface LocalModelToolIntentRejectedEvent extends LocalIntelligenceTraceEnvelope {
    type: "local-model-tool-intent-rejected";
    taskId: string;
    toolSlug: string;
    reasons: string[];
}
export type LocalIntelligenceTraceEvent = LocalIntelligenceAdapterSelectedEvent | LocalModelSandboxRunStartedEvent | LocalModelSandboxRunCompletedEvent | LocalModelToolIntentProposedEvent | LocalModelToolIntentRejectedEvent;
export declare function isLocalIntelligenceTraceEvent(value: unknown): value is LocalIntelligenceTraceEvent;
//# sourceMappingURL=local-intelligence-trace.d.ts.map