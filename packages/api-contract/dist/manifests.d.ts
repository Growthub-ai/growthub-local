/**
 * @growthub/api-contract — Manifest registry (CMS SDK v1)
 *
 * Canonical, portable, inspectable manifest envelope for the Growthub
 * capability registry.
 *
 * This formalizes what growthub-local already does:
 *   - hosted capability results are first-class truth
 *   - derived-from-workflow records are a fallback
 *   - local extensions are additive
 *
 * Making this explicit lets CLI, hosted UI, harnesses, and third-party
 * adapters agree on one discovery primitive without reverse-engineering
 * CLI internals.
 */
import type { CapabilityExecutionKind, CapabilityFamily, CapabilityNode } from "./capabilities.js";
import type { NodeInputSchema, NodeOutputSchema } from "./schemas.js";
import type { ProviderAssemblyHints } from "./providers.js";
import type { ExecutionMode } from "./execution.js";
/**
 * Where a capability manifest was sourced from.
 *
 *   - `hosted`                 — returned by the hosted capability endpoint.
 *   - `local-extension`        — loaded from a local manifest extension file.
 *   - `derived-from-workflow`  — reconstructed from hosted workflow payloads.
 */
export type ManifestOriginType = "hosted" | "local-extension" | "derived-from-workflow";
export interface ManifestProvenance {
    originType: ManifestOriginType;
    /** Host that served the hosted manifest, when applicable. */
    sourceHost?: string;
    /** Hosted workflow id, when the capability was derived from one. */
    sourceWorkflowId?: string;
    /** Source manifest id, when available. */
    sourceManifestId?: string;
    /** Filesystem path of a local extension manifest, when applicable. */
    localExtensionPath?: string;
    /** ISO-8601 timestamp when provenance was recorded. */
    recordedAt?: string;
    /** Optional free-form note. */
    note?: string;
}
/**
 * Execution hints a manifest can carry so consumers can render and route
 * a capability without having to decode `input_template` defaults.
 *
 * These are *hints only*. The authoritative dispatch shape is still
 * {@link CapabilityNode.executionTokens}.
 */
export interface CapabilityExecutionHints {
    /** Preferred execution mode for this capability, if the manifest ships one. */
    preferredMode?: ExecutionMode;
    /** Allowed execution modes, if the manifest constrains them. */
    allowedModes?: ExecutionMode[];
    /** Approximate runtime budget in milliseconds. */
    approxRuntimeMs?: number;
    /** Hints for async / long-running capabilities. */
    longRunning?: boolean;
}
/**
 * Per-capability manifest entry.
 *
 * This is the machine-readable contract a third-party builder, hosted
 * UI, or harness should consume. It is a superset of
 * {@link CapabilityNode}: it adds input / output schemas, provider
 * hints, execution hints, and provenance.
 *
 * Consumers that only need the render-level shape can ignore the
 * schema / provenance fields and use {@link CapabilityManifest.node}.
 */
export interface CapabilityManifest {
    slug: string;
    family: CapabilityFamily | string;
    displayName: string;
    executionKind: CapabilityExecutionKind;
    requiredBindings: string[];
    outputTypes: string[];
    /** Full, render-ready capability node for this slug. */
    node: CapabilityNode;
    /** Schema-driven input contract. */
    inputSchema?: NodeInputSchema;
    /** Schema-driven output contract. */
    outputSchema?: NodeOutputSchema;
    /** Provider assembly hints (non-authoritative). */
    providerHints?: ProviderAssemblyHints;
    /** Execution-layer hints (non-authoritative). */
    executionHints?: CapabilityExecutionHints;
    /** Provenance for this manifest entry. */
    provenance: ManifestProvenance;
}
/**
 * A single drift marker between a cached manifest and a newly-fetched one.
 */
export interface ManifestDriftMarker {
    slug: string;
    /** What kind of change was observed. */
    change: "added" | "removed" | "executionKind" | "requiredBindings" | "outputTypes" | "enabled" | "schema";
    /** Optional human-facing description. */
    description?: string;
}
export interface ManifestDriftReport {
    /** ISO timestamp of the comparison. */
    comparedAt: string;
    markers: ManifestDriftMarker[];
}
/**
 * Top-level manifest envelope.
 *
 * Version 1 of the envelope is intentionally narrow — every future
 * version MUST keep these fields and MAY add new ones additively.
 */
export interface CapabilityManifestEnvelope {
    version: 1;
    /** Hosted base URL or logical host identifier this envelope represents. */
    host: string;
    /** ISO timestamp when the envelope was fetched / composed. */
    fetchedAt: string;
    /** Where the capabilities in this envelope originated. */
    source: "hosted" | "local-extension" | "derived";
    /** Capabilities contained in the envelope. */
    capabilities: CapabilityManifest[];
    /** Optional envelope-level provenance. */
    provenance?: ManifestProvenance;
    /** Optional drift report vs. a prior cached envelope. */
    drift?: ManifestDriftReport;
}
//# sourceMappingURL=manifests.d.ts.map