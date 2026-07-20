/**
 * @growthub/api-contract — Governed Compute Realization (CMS SDK v1.8)
 *
 * The additive compute contract: the provider-neutral vocabulary that lets a
 * governed workspace describe WHERE a custom-model workload may execute —
 * local machine, serverless/burst GPU, warm capacity, or a distributed
 * cluster — without ever naming a mandatory vendor. Compute is a replaceable
 * REALIZATION of the existing custom-model lifecycle, never a second
 * universe: provider identity stays an ordinary API Registry row
 * (`metadata.computeProvider`, schema `growthub-compute-provider-v1`),
 * execution evidence stays `model-training-run` receipts + source records,
 * execution authority stays `POST /api/workspace/sandbox-run`, and promotion
 * stays evaluation-gated. No compute provider may promote a model; no
 * provider response becomes workspace truth merely because it returned 200.
 *
 * Runtime truth lives in the workspace app:
 *   - lib/compute-capacity-profiles.js     (pure Capacity Profiles + requirements)
 *   - lib/compute-provider-registry.js     (adapter registry + governed row validation)
 *   - lib/compute-resolver.js              (deterministic eligibility + ranking)
 *   - lib/compute-evidence.js              (normalized events + receipt extension)
 *   - lib/adapters/compute/*               (local / runpod / modal / ray adapters)
 *   - app/api/workspace/compute/route.js   (read-only derived state, no mutation)
 *
 * Additive contract: type definitions plus runtime-safe vocabulary constants
 * and runtime guards. No existing export is changed; the package stays
 * tree-shakeable (`sideEffects: false`).
 */
/** Closed list of the workload kinds this contract version names. */
export const COMPUTE_WORKLOAD_KINDS = [
    "training",
    "fine-tune",
    "distillation",
    "evaluation",
    "conversion",
    "quantization",
    "data-prep",
    "inference-serve",
    "harvest",
];
export const COMPUTE_AVAILABILITY_MODES = [
    "local",
    "on-demand",
    "queued",
    "warm",
    "reserved",
    "spot",
];
export const COMPUTE_CAPACITY_PROFILE_IDS = [
    "harvest-only",
    "serve-local",
    "burst-gpu",
    "warm-inference",
    "single-gpu-finetune",
    "multi-gpu-finetune",
    "distributed-training",
];
export const COMPUTE_ACCELERATOR_CLASSES = [
    "none",
    "any-gpu",
    "consumer-gpu",
    "datacenter-gpu",
    "high-memory-gpu",
];
export const COMPUTE_ALLOCATION_STATUSES = [
    "requested",
    "queued",
    "allocated",
    "running",
    "completed",
    "failed",
    "cancelled",
    "release-pending",
    "released",
    "release-failed",
];
export const COMPUTE_EVENT_TYPES = [
    "compute-requested",
    "compute-queued",
    "compute-allocated",
    "compute-running",
    "checkpoint-created",
    "compute-resuming",
    "compute-completed",
    "compute-failed",
    "compute-cancelled",
    "compute-release-requested",
    "compute-released",
    "compute-release-failed",
];
/** Schema id of a governed compute-provider API Registry row's metadata. */
export const COMPUTE_PROVIDER_ROW_SCHEMA = "growthub-compute-provider-v1";
/** Schema id of the persisted placement decision. */
export const COMPUTE_DECISION_SCHEMA = "growthub-compute-decision-v1";
/** Schema id of the composed receipt evidence block. */
export const COMPUTE_EVIDENCE_SCHEMA = "growthub-compute-evidence-v1";
/** Runtime guard for a governed compute-provider metadata block. */
export function isComputeProviderRowMetadata(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    return (v.schema === COMPUTE_PROVIDER_ROW_SCHEMA &&
        typeof v.adapterId === "string" &&
        v.adapterId.length > 0 &&
        Array.isArray(v.capacityProfiles) &&
        Array.isArray(v.availabilityModes) &&
        Array.isArray(v.requiredEnv));
}
/** Runtime guard for a persisted placement decision. */
export function isComputeDecision(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    return (v.schema === COMPUTE_DECISION_SCHEMA &&
        typeof v.capacityProfileId === "string" &&
        Array.isArray(v.candidates) &&
        typeof v.selectedProviderId === "string");
}
/** Runtime guard for a normalized compute event. */
export function isComputeEvent(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    return (typeof v.type === "string" &&
        COMPUTE_EVENT_TYPES.includes(v.type) &&
        typeof v.at === "string" &&
        typeof v.evidenceObservedAt === "string");
}
/**
 * Contract version sentinel for the compute surface. Additive changes keep
 * the literal `1`.
 */
export const WORKSPACE_COMPUTE_CONTRACT_VERSION = 1;
//# sourceMappingURL=compute.js.map