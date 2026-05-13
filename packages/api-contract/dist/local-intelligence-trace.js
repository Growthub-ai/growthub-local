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
export function isLocalIntelligenceTraceEvent(value) {
    if (!value || typeof value !== "object")
        return false;
    const record = value;
    if (typeof record.type !== "string")
        return false;
    if (typeof record.at !== "string")
        return false;
    switch (record.type) {
        case "local-intelligence-adapter-selected":
        case "local-model-sandbox-run-started":
        case "local-model-sandbox-run-completed":
        case "local-model-tool-intent-proposed":
        case "local-model-tool-intent-rejected":
            return true;
        default:
            return false;
    }
}
//# sourceMappingURL=local-intelligence-trace.js.map