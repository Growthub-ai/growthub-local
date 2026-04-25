/**
 * @growthub/api-contract — Pipeline Trace (CMS SDK v1)
 *
 * Public, type-only surface for stage-boundary trace events.
 *
 * Distinct from `./events.ts` (which types hosted CLI/SDK
 * `ExecutionEvent` NDJSON streams). This module types the events a
 * Pipeline Kit appends to `.growthub-fork/trace.jsonl` at every stage
 * boundary.
 *
 * The convention is documented in
 * `docs/PIPELINE_TRACE_CONVENTION_V1.md`.
 *
 * Rules:
 *   - Additive only. Kits emitting only legacy event names
 *     (`stage-complete`, `adapter-selected`, etc.) stay valid; readers
 *     handle both.
 *   - No runtime behavior. Writers append NDJSON lines; readers parse
 *     them.
 *   - Events MUST be JSON-serializable.
 */
// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------
const PIPELINE_TRACE_EVENT_TYPES = new Set([
    "pipeline_stage_started",
    "pipeline_stage_completed",
    "pipeline_stage_failed",
    "pipeline_artifact_written",
    "pipeline_handoff_created",
]);
/**
 * Returns `true` when the value is a v1 pipeline trace event. Returns
 * `false` for legacy kit-local event names (e.g. `stage-complete`),
 * which remain valid in `trace.jsonl` but are not part of this union.
 */
export function isPipelineTraceEvent(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const v = value;
    if (typeof v.type !== "string")
        return false;
    if (!PIPELINE_TRACE_EVENT_TYPES.has(v.type))
        return false;
    if (typeof v.kitId !== "string")
        return false;
    if (typeof v.pipelineId !== "string")
        return false;
    if (typeof v.timestamp !== "string")
        return false;
    return true;
}
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
/**
 * Sentinel for `PipelineTraceEvent` consumers. Additive changes (new
 * event types) keep this literal `1`; renames or removals force a bump.
 */
export const PIPELINE_TRACE_VERSION = 1;
//# sourceMappingURL=pipeline-trace.js.map