/**
 * @growthub/api-contract — Adapters (CMS SDK v1)
 *
 * Public, type-only surface for the generic adapter contract.
 *
 * The adapter rule (frozen in `docs/ADAPTER_CONTRACTS_V1.md`) is:
 *
 *   adapter = env-or-config selector
 *           + provider-specific implementation
 *           + normalized output shape
 *
 * Domain code (skills, helpers, app routes, pipeline stages) consumes
 * the normalized output. It MUST NOT branch on provider internals.
 *
 * This module describes adapter boundaries. It does not call providers.
 *
 * Rules:
 *   - Additive only. Existing adapter docs and env names stay valid.
 *   - No runtime behavior. The SDK describes the boundary; the kit owns
 *     the implementation behind it.
 *   - SDK types are preferred where they exist (e.g.
 *     `DynamicRegistryPipeline`, `ExecutionEvent` from `./execution`
 *     and `./events`).
 *   - BYOK is first-class. A `byo-api-key` mode is never a second-tier
 *     code path.
 */
/**
 * Open-ended union so kits can introduce new adapter families (e.g.
 * `transcription`, `vector-store`) without an SDK release. The standard
 * families are enumerated for discoverability.
 */
export type AdapterKind = "generative" | "persistence" | "auth" | "payment" | "integration" | "reporting" | "hosted-bridge" | "byo-api-key" | "external-repo-handoff" | (string & {});
/**
 * One mode within an adapter. The mode is selected at runtime via env
 * or config; multiple modes share the same normalized output shape.
 *
 * Examples:
 *   - `generative` adapter, mode `growthub-pipeline`
 *   - `generative` adapter, mode `byo-api-key`
 *   - `persistence` adapter, mode `postgres`
 *   - `auth` adapter, mode `clerk`
 */
export interface AdapterMode {
    /** Mode identifier (e.g. `growthub-pipeline`, `byo-api-key`, `postgres`). */
    id: string;
    /**
     * Env var name the kit reads to select this mode (e.g.
     * `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER`).
     */
    envSelector?: string;
    /** Required env vars for this mode to be valid. */
    requiredEnv?: string[];
    /** Free-form human description. */
    description?: string;
}
/**
 * Describes the input the adapter accepts. SDK types are referenced by
 * name when one applies (e.g. `DynamicRegistryPipeline`,
 * `CapabilityManifestEnvelope`).
 */
export interface AdapterInputRef {
    /** Free-form descriptor of the input shape. */
    shape: string;
    /**
     * Optional reference to the SDK type name that captures this input
     * (e.g. `DynamicRegistryPipeline`).
     */
    sdkTypeRef?: string;
    /**
     * Optional artifact path when the input is read from disk
     * (e.g. `output/<client>/<project>/brief/pipeline-brief.md`).
     */
    artifactPath?: string;
}
/**
 * Describes the normalized output the adapter produces. Two modes for
 * the same adapter MUST produce the same output shape.
 */
export interface AdapterOutputRef {
    /** Free-form descriptor of the output shape. */
    shape: string;
    /**
     * Optional reference to the SDK type name that captures this output
     * (e.g. `ExecutionEvent`, `CapabilityRecord`).
     */
    sdkTypeRef?: string;
    /**
     * Optional artifact path when the output is written to disk
     * (e.g. `output/<client>/<project>/generative/manifest.json`).
     */
    artifactPath?: string;
}
/**
 * A resolved connection that the integration / hosted-bridge adapter
 * exposes to domain code. Captures the minimum fields downstream code
 * needs to reason about a provider connection without reading provider
 * SDKs.
 *
 * Mirrors the agency-portal integration adapter's normalized lanes
 * (data sources, workspace integrations).
 */
export interface NormalizedConnectionRef {
    /** Connection identifier (kebab-case). */
    id: string;
    /** Provider name (e.g. `windsor`, `google-analytics`, `meta`, `shopify`). */
    provider: string;
    /** Lane the connection belongs to (e.g. `data-source`, `integration`). */
    lane: string;
    /** Whether the connection is currently usable. */
    status?: "ok" | "missing-credentials" | "error" | (string & {});
    /** Free-form human description. */
    description?: string;
}
/**
 * One adapter declaration. Captures the env selector, the supported
 * modes, the input shape, and the normalized output shape. A kit may
 * declare multiple adapters (one per family).
 */
export interface AdapterContractRef {
    /** Adapter identifier (e.g. `creative-video-pipeline-generative`). */
    id: string;
    /** Adapter family. */
    kind: AdapterKind;
    /**
     * Env var name the kit reads to select among `modes[]` at runtime
     * (e.g. `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER`).
     */
    envSelector?: string;
    /** Modes the adapter supports. */
    modes: AdapterMode[];
    /** Input shape the adapter accepts. */
    input?: AdapterInputRef;
    /** Normalized output shape the adapter produces. */
    output?: AdapterOutputRef;
    /**
     * Pipeline stage ids that consume this adapter (when the adapter
     * is part of a Pipeline Kit).
     */
    usedByStages?: string[];
    /** Free-form human description. */
    description?: string;
    /**
     * Optional doc reference (e.g.
     * `docs/adapter-contracts.md` inside the kit, or
     * `docs/ADAPTER_CONTRACTS_V1.md` at the repo root).
     */
    spec?: string;
}
/**
 * Sentinel for adapter-contract consumers. Additive changes keep this
 * literal `1`.
 */
export declare const ADAPTER_CONTRACT_VERSION: 1;
//# sourceMappingURL=adapters.d.ts.map