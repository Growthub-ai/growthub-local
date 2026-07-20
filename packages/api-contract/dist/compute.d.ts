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
/**
 * What kind of work a compute allocation carries. Open union: a workspace may
 * name a new workload kind without a contract release, and readers pass
 * unknown kinds through rather than discarding them.
 */
export type ComputeWorkloadKind = "training" | "fine-tune" | "distillation" | "evaluation" | "conversion" | "quantization" | "data-prep" | "inference-serve" | "harvest" | (string & {});
/** Closed list of the workload kinds this contract version names. */
export declare const COMPUTE_WORKLOAD_KINDS: readonly ["training", "fine-tune", "distillation", "evaluation", "conversion", "quantization", "data-prep", "inference-serve", "harvest"];
/**
 * How capacity becomes available:
 *   - "local"      the operator's own machine (owned, zero marginal cost)
 *   - "on-demand"  allocated per request (burst)
 *   - "queued"     submitted to a shared queue; start time not guaranteed
 *   - "warm"       pre-provisioned capacity held ready (low-latency start)
 *   - "reserved"   contracted/enterprise cluster capacity
 *   - "spot"       interruptible discounted capacity
 */
export type ComputeAvailabilityMode = "local" | "on-demand" | "queued" | "warm" | "reserved" | "spot" | (string & {});
export declare const COMPUTE_AVAILABILITY_MODES: readonly ["local", "on-demand", "queued", "warm", "reserved", "spot"];
/**
 * Governed Capacity Profile ids — the pure placement vocabulary the training
 * plan compiles into. A profile describes a SHAPE of capacity, never a
 * vendor. Open union so a workspace can define additional profiles.
 */
export type ComputeCapacityProfileId = "harvest-only" | "serve-local" | "cpu-local-finetune" | "burst-gpu" | "warm-inference" | "single-gpu-finetune" | "multi-gpu-finetune" | "distributed-training" | (string & {});
export declare const COMPUTE_CAPACITY_PROFILE_IDS: readonly ["harvest-only", "serve-local", "cpu-local-finetune", "burst-gpu", "warm-inference", "single-gpu-finetune", "multi-gpu-finetune", "distributed-training"];
/**
 * Accelerator class floors, coarsest-useful granularity. Placement reasons
 * about class + VRAM floor, never a provider SKU string; provider adapters
 * map classes to their own catalog internally.
 */
export type ComputeAcceleratorClass = "none" | "any-gpu" | "consumer-gpu" | "datacenter-gpu" | "high-memory-gpu" | (string & {});
export declare const COMPUTE_ACCELERATOR_CLASSES: readonly ["none", "any-gpu", "consumer-gpu", "datacenter-gpu", "high-memory-gpu"];
/** Distributed shape a workload requires. `null`/absent = single worker. */
export interface ComputeDistributedRequirements {
    /** Total workers (>= 2 for a genuinely distributed workload). */
    workers: number;
    /** GPUs each worker must carry. */
    gpusPerWorker: number;
    /** All workers must start together (gang scheduling) or not at all. */
    gangScheduling: boolean;
    /** Requires high-bandwidth inter-node interconnect (NVLink/EFA/IB class). */
    highBandwidthInterconnect: boolean;
}
/** Where the workload may run and where its data may reside. */
export interface ComputeLocalityRequirements {
    /** Acceptable regions ([] = anywhere). */
    regions: string[];
    /** Data-residency boundary the provider must satisfy ("" = none). */
    dataResidency: string;
}
/**
 * Provider-neutral resource floors derived FROM the training plan (the plan
 * decides WHAT to train; requirements only describe the capacity shape that
 * training needs). All floors; 0 = no floor / unknown.
 */
export interface ComputeRequirements {
    workloadKind: ComputeWorkloadKind;
    acceleratorClass: ComputeAcceleratorClass;
    /** GPUs per worker (0 = CPU-only workload). */
    gpuCount: number;
    /** Minimum VRAM per GPU in GB. */
    minVramPerGpuGB: number;
    /** Minimum CPU cores. */
    minCpuCores: number;
    /** Minimum system memory in GB. */
    minRamGB: number;
    /** Minimum free storage in GB (weights + artifacts + checkpoints). */
    minDiskGB: number;
    /** The run must be checkpointable (long-running / resumable work). */
    checkpointRequired: boolean;
    /** Distributed shape; null for single-worker workloads. */
    distributed: ComputeDistributedRequirements | null;
    locality: ComputeLocalityRequirements;
    /** Expected duration in minutes (0 = unknown). */
    estimatedDurationMinutes: number;
}
/**
 * Budget policy the resolver enforces BEFORE allocation. Under "hard-cap",
 * unknown cost is ineligible unless `allowUnknownCost` is explicitly true —
 * unknown price is never treated as zero.
 */
export interface ComputeBudgetPolicy {
    mode: "hard-cap" | "advisory" | "unlimited";
    /** Total spend ceiling in USD (0 = no total ceiling). */
    maxTotalUsd: number;
    /** Hourly spend ceiling in USD (0 = no hourly ceiling). */
    maxHourlyUsd: number;
    /** Explicit opt-in for unknown-cost candidates under a hard cap. */
    allowUnknownCost: boolean;
}
/**
 * What one configured provider can truthfully carry. Derived from the
 * adapter + the governed API Registry row; secret-safe (env-var NAMES only).
 */
export interface ComputeProviderCapabilities {
    /** Stable provider identity — the governed row's integrationId. */
    providerId: string;
    /** Which registered adapter realizes this provider. */
    adapterId: string;
    /** Capacity Profiles this provider can honestly execute. */
    capacityProfiles: ComputeCapacityProfileId[];
    availabilityModes: ComputeAvailabilityMode[];
    acceleratorClasses: ComputeAcceleratorClass[];
    /** Highest per-GPU VRAM the provider can offer in GB (0 = unknown). */
    maxVramPerGpuGB: number;
    /** Max GPUs on a single worker (0 = unknown). */
    maxGpusPerWorker: number;
    /** Max workers for one workload (1 = no multi-node support). */
    maxWorkers: number;
    supportsCheckpointing: boolean;
    supportsResume: boolean;
    supportsGangScheduling: boolean;
    /** Regions offered ([] = unknown/any). */
    regions: string[];
    /** Env-var NAMES the adapter needs resolved server-side. Never values. */
    requiredEnv: string[];
}
/**
 * Cost basis for a quote — what unit the provider charges in and where the
 * number came from. "unknown" is a first-class honest value.
 */
export interface ComputeCostBasis {
    kind: "per-second" | "per-hour" | "per-job" | "owned-hardware" | "unknown";
    /** Cost per unit in USD (0 when unknown or owned). */
    unitUsd: number;
    /** Where the price came from (e.g. "provider-price-api", "static-catalog"). */
    source: string;
}
/**
 * A provider's answer to "what would this requirement cost, and can you take
 * it right now?". Quotes are observations, not commitments: `quoteObservedAt`
 * stamps when the observation was made and `quoteExpiresAt` bounds how long
 * the resolver may act on it. An expired quote is not evidence.
 */
export interface ComputeProviderQuote {
    providerId: string;
    capacityProfileId: ComputeCapacityProfileId;
    /** Whether the provider reports it can satisfy the requirements. */
    available: boolean;
    availabilityMode: ComputeAvailabilityMode;
    costBasis: ComputeCostBasis;
    /** Estimated total for the workload in USD; null = unknown (never 0). */
    estimatedTotalUsd: number | null;
    /** Expected queue latency in seconds (0 = immediate / unknown). */
    queueLatencySeconds: number;
    /** ISO timestamp the quote was observed. */
    quoteObservedAt: string;
    /** ISO timestamp after which the quote must not be relied on. */
    quoteExpiresAt: string;
    /** Provider-native quote/offer reference ("" when none). */
    quoteRef: string;
}
/**
 * Stable reference tying a provider-side resource to the governed run —
 * carried on allocations, events, checkpoints, and artifacts so every piece
 * of provider evidence resolves back to the ONE workspace identity chain.
 */
export interface ComputeRunRef {
    /** Governed training run id (`model-training-run` receipt identity). */
    trainingRunId: string;
    /** Governed model-training row slug (custom-model identity). */
    modelTrainingRowId: string;
    providerId: string;
    capacityProfileId: ComputeCapacityProfileId;
    /** Provider-native resource id (pod/job/cluster id; "" until allocated). */
    providerResourceId: string;
}
/** Allocation lifecycle statuses (provider-neutral). */
export type ComputeAllocationStatus = "requested" | "queued" | "allocated" | "running" | "completed" | "failed" | "cancelled" | "release-pending" | "released" | "release-failed";
export declare const COMPUTE_ALLOCATION_STATUSES: readonly ["requested", "queued", "allocated", "running", "completed", "failed", "cancelled", "release-pending", "released", "release-failed"];
/**
 * A governed capacity allocation. `idempotencyKeyHash` is the hash of the
 * deterministic allocation identity (trainingRunId + attempt + profile +
 * provider): a replayed governed request MUST resolve to the same hash so a
 * duplicate expensive allocation can be refused instead of silently created.
 * `releaseConfirmed=false` on a terminal state means capacity may still
 * exist and cost may still be accruing — the honest failure surface.
 */
export interface ComputeAllocation {
    allocationId: string;
    runRef: ComputeRunRef;
    status: ComputeAllocationStatus;
    idempotencyKeyHash: string;
    availabilityMode: ComputeAvailabilityMode;
    costBasis: ComputeCostBasis;
    /** ISO timestamps ("" until reached). */
    requestedAt: string;
    allocatedAt: string;
    releasedAt: string;
    /** True only when the provider CONFIRMED the capacity is gone. */
    releaseConfirmed: boolean;
    /** Resources the provider reports it actually allocated. */
    allocated: {
        gpuType: string;
        gpuCount: number;
        workers: number;
        region: string;
    } | null;
}
/**
 * Normalized compute event vocabulary — the ONE event stream every provider
 * adapter is normalized into. Provider-native webhooks/status payloads never
 * advance workspace state directly; they become one of these, with the
 * supporting evidence attached.
 */
export type ComputeEventType = "compute-requested" | "compute-queued" | "compute-allocated" | "compute-running" | "checkpoint-created" | "compute-resuming" | "compute-completed" | "compute-failed" | "compute-cancelled" | "compute-release-requested" | "compute-released" | "compute-release-failed";
export declare const COMPUTE_EVENT_TYPES: readonly ["compute-requested", "compute-queued", "compute-allocated", "compute-running", "checkpoint-created", "compute-resuming", "compute-completed", "compute-failed", "compute-cancelled", "compute-release-requested", "compute-released", "compute-release-failed"];
/**
 * One normalized compute event. `evidenceObservedAt` stamps when the
 * WORKSPACE observed the supporting evidence (vs `at`, when the provider
 * claims it happened) — the gap between the two is the staleness surface
 * forged/stale-event defenses reason about.
 */
export interface ComputeEvent {
    type: ComputeEventType;
    /** ISO timestamp the event claims to have occurred. */
    at: string;
    /** ISO timestamp the workspace observed the evidence for it. */
    evidenceObservedAt: string;
    /** Who asserted it: the provider, the workspace runtime, or an operator. */
    source: "provider" | "workspace" | "operator";
    runRef: ComputeRunRef;
    /** Provider-native event/sequence id ("" when none). */
    providerEventId: string;
    /** Bounded human detail. */
    detail: string;
    workSpecHash?: string;
    requirementsHash?: string;
}
/**
 * Checkpoint evidence. A checkpoint is resumable only when its identity is
 * provable (locator + content identity); a claimed checkpoint with no
 * identity cannot satisfy `checkpointRequired`.
 */
export interface ComputeCheckpointRef {
    checkpointId: string;
    runRef: ComputeRunRef;
    /** Storage locator (path/URI inside governed storage; never credentials). */
    locator: string;
    /** Content identity ("" = unproven checkpoint). */
    sha256: string;
    /** Training step the checkpoint captures (0 = unknown). */
    step: number;
    sizeBytes: number;
    createdAt: string;
    evidenceObservedAt: string;
    workSpecHash?: string;
}
/**
 * Artifact evidence a completed run must return. Mirrors the existing
 * `model-training-run` artifact floors: an artifact with no locator or no
 * sha256 identity is NOT importable and the run is non-promotable — a
 * provider "completed" status alone never substitutes.
 */
export interface ComputeArtifactRef {
    runRef: ComputeRunRef;
    /** Artifact kind (mirrors training artifact types, open for new kinds). */
    kind: "adapter" | "gguf" | "merged-model" | "checkpoint" | (string & {});
    locator: string;
    sha256: string;
    sizeBytes: number;
    evidenceObservedAt: string;
    workSpecHash?: string;
    requirementsHash?: string;
    verifiedSha256?: string;
    verificationKind?: string;
}
export interface ComputeIntent {
    schema: "growthub-compute-intent-v1";
    capacityProfileId: ComputeCapacityProfileId;
    requirements: ComputeRequirements;
    requirementsHash: string;
    policy: ComputeBudgetPolicy & Record<string, unknown>;
    intentHash: string;
}
export interface ComputeWorkSpec {
    schema: "growthub-training-execution-spec-v1";
    intentHash: string;
    requirementsHash: string;
    capacityProfileId: ComputeCapacityProfileId;
    trainingRunId: string;
    modelTrainingRowId: string;
    training: Record<string, unknown>;
    dataset: Record<string, unknown>;
    output: Record<string, unknown>;
    workSpecHash: string;
}
/** Machine-readable reason a candidate was excluded or out-ranked. */
export interface ComputeCandidateVerdict {
    providerId: string;
    eligible: boolean;
    /** Stable machine-readable reason codes (e.g. "insufficient-vram"). */
    reasonCodes: string[];
    /** Human-readable reasons, parallel to reasonCodes. */
    reasons: string[];
    /** Rank among eligible candidates (0 = selected; -1 = ineligible). */
    rank: number;
    quote: ComputeProviderQuote | null;
}
/**
 * The deterministic placement decision. Equivalent inputs must produce an
 * equivalent decision; every non-selected candidate carries its verdict so a
 * skipped provider is always explainable. Persisted INSIDE the existing
 * `model-training-run` receipt (`compute.decision`), never a separate store.
 */
export interface ComputeDecision {
    schema: typeof COMPUTE_DECISION_SCHEMA;
    capacityProfileId: ComputeCapacityProfileId;
    requirements: ComputeRequirements;
    budget: ComputeBudgetPolicy;
    /** "auto" (policy-ranked) or an explicit provider pin. */
    selectionMode: "auto" | "explicit";
    selectedProviderId: string;
    /** Why the selected candidate won ([] when nothing selected). */
    selectedReasons: string[];
    candidates: ComputeCandidateVerdict[];
    decidedAt: string;
    evidenceObservedAt: string;
}
/**
 * The composed compute evidence block a `model-training-run` receipt may
 * carry (`receipt.compute`). Everything optional and additive: pre-compute
 * receipts and readers are entirely unaffected.
 */
export interface ComputeEvidence {
    schema: typeof COMPUTE_EVIDENCE_SCHEMA;
    capacityProfileId: ComputeCapacityProfileId;
    decision: ComputeDecision | null;
    allocation: ComputeAllocation | null;
    events: ComputeEvent[];
    checkpoints: ComputeCheckpointRef[];
    artifact: ComputeArtifactRef | null;
    intent?: ComputeIntent | null;
    workSpec?: ComputeWorkSpec | null;
    intentHash?: string;
    requirementsHash?: string;
    workSpecHash?: string;
    evidenceObservedAt: string;
}
/**
 * The provider adapter surface. Adapters are the ONLY provider-specific
 * layer: they map Capacity Profiles to their own catalog internally and are
 * forbidden from leaking provider fields into portable plans, mutating
 * workspace state, or advancing lifecycle without evidence. Every method is
 * async and returns normalized contract shapes. `ctx.resolveEnv` hands the
 * adapter server-side secret VALUES by env NAME at call time — secrets never
 * live in rows, receipts, or adapter state.
 */
export interface ComputeProviderAdapter {
    adapterId: string;
    label: string;
    /** Static truth about what the adapter can do (before any credential). */
    describeCapabilities(config: Record<string, unknown>): ComputeProviderCapabilities;
    /** Observe live capacity/prices. Never allocates. */
    inspectCapacity(ctx: ComputeAdapterContext): Promise<ComputeProviderQuote>;
    /** Allocate capacity only. Must honor idempotency. */
    allocate(ctx: ComputeAdapterContext): Promise<ComputeAllocation>;
    /** Submit the exact immutable work spec to the verified allocation. */
    execute(ctx: ComputeAdapterContext): Promise<ComputeEvent[]>;
    /** Observe current provider-side status, normalized to events. */
    status(ctx: ComputeAdapterContext): Promise<ComputeEvent[]>;
    /** Resume only from a proven checkpoint in this work-spec lineage. */
    resume(ctx: ComputeAdapterContext, checkpoint: ComputeCheckpointRef): Promise<ComputeEvent[]>;
    /** Request cooperative cancellation. */
    cancel(ctx: ComputeAdapterContext): Promise<ComputeEvent[]>;
    /** Release/terminate capacity. Must report release-failed honestly. */
    release(ctx: ComputeAdapterContext): Promise<ComputeEvent[]>;
}
/** Call-time context handed to adapter methods. */
export interface ComputeAdapterContext {
    runRef: ComputeRunRef;
    requirements: ComputeRequirements;
    capacityProfileId: ComputeCapacityProfileId;
    /** Deterministic idempotency key hash for this governed request. */
    idempotencyKeyHash: string;
    intent: ComputeIntent;
    workSpec: ComputeWorkSpec;
    intentHash: string;
    requirementsHash: string;
    workSpecHash: string;
    /** Governed row config (secret-free; env NAMES only). */
    providerConfig: Record<string, unknown>;
    /** Server-side env resolution by NAME. Returns "" when absent. */
    resolveEnv(name: string): string;
    /** Bounded fetch the runtime injects (tests inject a fake). */
    fetchJson(url: string, init?: Record<string, unknown>): Promise<unknown>;
}
/** Schema id of a governed compute-provider API Registry row's metadata. */
export declare const COMPUTE_PROVIDER_ROW_SCHEMA: "growthub-compute-provider-v1";
/** Schema id of the persisted placement decision. */
export declare const COMPUTE_DECISION_SCHEMA: "growthub-compute-decision-v1";
/** Schema id of the composed receipt evidence block. */
export declare const COMPUTE_EVIDENCE_SCHEMA: "growthub-compute-evidence-v1";
/**
 * Governed compute-provider row metadata (`row.metadata.computeProvider`).
 * An ordinary API Registry row becomes a compute provider by carrying this
 * block; nothing else changes about the row. `requiredEnv` is env-var NAMES;
 * no credential value may ever enter the row.
 */
export interface ComputeProviderRowMetadata {
    schema: typeof COMPUTE_PROVIDER_ROW_SCHEMA;
    adapterId: string;
    capacityProfiles: ComputeCapacityProfileId[];
    availabilityModes: ComputeAvailabilityMode[];
    requiredEnv: string[];
    /** Declared execution lane (mirrors sandbox lanes). */
    executionLane: "sandbox-local" | "sandbox-serverless" | (string & {});
    /** Optional secret-free adapter configuration (regions, endpoint refs…). */
    config?: Record<string, unknown>;
}
/** Runtime guard for a governed compute-provider metadata block. */
export declare function isComputeProviderRowMetadata(value: unknown): value is ComputeProviderRowMetadata;
/** Runtime guard for a persisted placement decision. */
export declare function isComputeDecision(value: unknown): value is ComputeDecision;
/** Runtime guard for a normalized compute event. */
export declare function isComputeEvent(value: unknown): value is ComputeEvent;
/**
 * Contract version sentinel for the compute surface. Additive changes keep
 * the literal `1`.
 */
export declare const WORKSPACE_COMPUTE_CONTRACT_VERSION: 1;
//# sourceMappingURL=compute.d.ts.map