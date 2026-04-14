/**
 * CMS Capability Registry — Type Definitions
 *
 * First-class registry types for CMS-backed node primitives.
 * These let agents discover which core node primitives exist, which are
 * available to the authenticated user/org, and how they bind into pipelines.
 */

// ---------------------------------------------------------------------------
// Capability node families
// ---------------------------------------------------------------------------

export type CapabilityFamily = "video" | "image" | "slides" | "text" | "data" | "ops";

export const CAPABILITY_FAMILIES: readonly CapabilityFamily[] = [
  "video",
  "image",
  "slides",
  "text",
  "data",
  "ops",
] as const;

export type CapabilityExecutionKind = "hosted-execute" | "provider-assembly" | "local-only";

// ---------------------------------------------------------------------------
// CMS capability node — the core registry primitive
// ---------------------------------------------------------------------------

export interface CmsCapabilityNode {
  /** Unique slug identifying this capability (e.g. "video-gen", "text-gen"). */
  slug: string;
  /** Human-readable display name. */
  displayName: string;
  /** Capability family classification. */
  family: CapabilityFamily;
  /** How this node executes. */
  executionKind: CapabilityExecutionKind;
  /** Binding keys required before execution (provider keys, connection refs). */
  requiredBindings: string[];
  /** Output artifact types this node can produce. */
  outputTypes: string[];
  /** Whether this node is enabled for the current user/org. */
  enabled: boolean;
  /** Optional description. */
  description?: string;
  /** Opaque CMS metadata forwarded from the registry. */
  manifestMetadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Registry query types
// ---------------------------------------------------------------------------

export interface CapabilityQuery {
  /** Filter by family. */
  family?: CapabilityFamily;
  /** Filter by slug substring (fuzzy). */
  slug?: string;
  /** Filter by execution kind. */
  executionKind?: CapabilityExecutionKind;
  /** Filter by output type. */
  outputType?: string;
  /** Only return enabled capabilities. Defaults to true. */
  enabledOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Registry response metadata
// ---------------------------------------------------------------------------

export interface CapabilityRegistryMeta {
  /** Total capabilities in the registry. */
  total: number;
  /** Number of capabilities enabled for the current user. */
  enabledCount: number;
  /** ISO timestamp of registry data freshness. */
  fetchedAt: string;
  /** Source of the data: hosted endpoint or local fallback. */
  source: "hosted" | "local-fallback";
}
