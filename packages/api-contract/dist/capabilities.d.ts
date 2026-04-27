/**
 * @growthub/api-contract — Capabilities (CMS SDK v1)
 *
 * Frozen public surface for the Growthub capability registry.
 *
 * These types mirror the already-shipped growthub-local CLI capability
 * registry contract in `cli/src/runtime/cms-capability-registry/types.ts`.
 * They are the *public, stable* version of that contract.
 *
 * Rules:
 *   - Additive only.
 *   - No runtime behavior.
 *   - Hosted records remain the source of truth; locally-derived /
 *     locally-extended records are represented with explicit provenance.
 */
/**
 * Canonical capability family taxonomy.
 *
 * These are the stable family buckets the CLI, hosted surfaces, harnesses,
 * and third-party adapters are expected to reason over.
 */
export type CapabilityFamily = "video" | "image" | "slides" | "text" | "data" | "ops" | "research" | "vision";
export declare const CAPABILITY_FAMILIES: readonly CapabilityFamily[];
/**
 * How a capability node is expected to execute.
 *
 *   - `hosted-execute`     — dispatched through the hosted execution bridge.
 *   - `provider-assembly`  — requires provider assembly before execution.
 *   - `local-only`         — runs entirely in the local runtime.
 */
export type CapabilityExecutionKind = "hosted-execute" | "provider-assembly" | "local-only";
export type CapabilityNodeType = "tool_execution" | "cms_workflow";
export type CapabilityVisibility = "public" | "authenticated" | "admin";
export type CapabilityExecutionStrategy = "direct" | "sequential-with-persistence" | "async_operation";
export interface CapabilityExecutionBinding {
    /** Binding transport. Today this is always an MCP-style tool call. */
    type: "mcp_tool_call";
    /** How the hosted execution bridge should drive this node. */
    strategy: CapabilityExecutionStrategy;
    /** Optional per-node timeout override in milliseconds. */
    timeoutMs?: number;
    /** Optional retry budget. */
    max_retries?: number;
    /** Optional polling interval (ms) for async operations. */
    polling_interval?: number;
}
export interface CapabilityExecutionTokens {
    /** Tool name that the hosted runtime dispatches to. */
    tool_name: string;
    /** Input template shape — drives default binding and form derivation. */
    input_template: Record<string, unknown>;
    /** Output mapping shape — drives downstream artifact wiring. */
    output_mapping: Record<string, unknown>;
    /** Optional endpoint routing config (env var, endpoint type). */
    endpoint_config?: {
        env_var?: string;
        endpoint_type?: string;
    };
    /** Migration version tag forwarded from the CMS. */
    migration_version?: string;
}
/**
 * The narrow, wire-level record returned by the hosted capability endpoint.
 *
 * This is intentionally a *subset* of {@link CapabilityNode} so the hosted
 * surface can evolve independently while the public SDK stays stable.
 */
export interface CapabilityRecord {
    slug: string;
    family: CapabilityFamily | string;
    displayName: string;
    executionKind: CapabilityExecutionKind;
    requiredBindings: string[];
    outputTypes: string[];
    enabled: boolean;
    metadata?: Record<string, unknown>;
}
/**
 * The canonical SDK-shaped capability node.
 *
 * This is the form that surfaces (CLI, hosted UI, harnesses, third-party)
 * should build against. It captures everything a consumer needs to:
 *
 *   - render the node
 *   - classify it
 *   - know how it executes
 *   - enumerate the bindings it requires
 *   - know what outputs it produces
 */
export interface CapabilityNode {
    /** Stable slug identifier. */
    slug: string;
    /** Human-facing display name. */
    displayName: string;
    /** Icon hint (emoji or short identifier). */
    icon: string;
    /** Family classification. */
    family: CapabilityFamily;
    /** CMS category hint (e.g. `automation`, `media_generation`). */
    category: string;
    /** Node type. */
    nodeType: CapabilityNodeType;
    /** How this node executes. */
    executionKind: CapabilityExecutionKind;
    /** Execution binding configuration. */
    executionBinding: CapabilityExecutionBinding;
    /** Execution tokens (input template + output mapping + routing). */
    executionTokens: CapabilityExecutionTokens;
    /** Binding keys required before execution can start. */
    requiredBindings: string[];
    /** Output artifact types this node can produce. */
    outputTypes: string[];
    /** Whether this node is enabled for the current principal. */
    enabled: boolean;
    /** Experimental flag. */
    experimental: boolean;
    /** Visibility level. */
    visibility: CapabilityVisibility;
    /** Optional description. */
    description?: string;
    /** Opaque forwarded metadata. */
    manifestMetadata?: Record<string, unknown>;
}
export interface CapabilityQuery {
    /** Filter by family. */
    family?: CapabilityFamily;
    /** Filter by slug substring (fuzzy). */
    slug?: string;
    /** Filter by execution kind. */
    executionKind?: CapabilityExecutionKind;
    /** Filter by output type. */
    outputType?: string;
    /** If `false`, include disabled capabilities. Defaults to `true`. */
    enabledOnly?: boolean;
    /** If `true`, include experimental/admin-hidden capabilities. Defaults to `false`. */
    includeExperimental?: boolean;
    /** Free-text search across slug, display name, description, category. */
    search?: string;
}
/**
 * Origin of a capability registry listing response.
 *
 * `hosted`           — hosted CMS registry endpoint.
 * `local-extension`  — user-provided local manifest extension.
 * `derived`          — reconstructed from hosted workflow payloads.
 */
export type CapabilityRegistrySource = "hosted" | "local-extension" | "derived";
export interface CapabilityRegistryMeta {
    /** Total capability count in the response. */
    total: number;
    /** Count of capabilities enabled for the current principal. */
    enabledCount: number;
    /** ISO timestamp of data freshness. */
    fetchedAt: string;
    /** Where this response came from. */
    source: CapabilityRegistrySource;
}
//# sourceMappingURL=capabilities.d.ts.map