/**
 * CMS Capability Registry — Type Definitions
 *
 * First-class registry types for CMS-backed node primitives.
 * These mirror the real production `workflow_node` content_type from the
 * hosted CMS so the CLI can discover, inspect, and use them as starter
 * templates for dynamic pipeline assembly.
 */

// ---------------------------------------------------------------------------
// Capability node families
// ---------------------------------------------------------------------------

export type CapabilityFamily = "video" | "image" | "slides" | "text" | "data" | "ops" | "research" | "vision";

export const CAPABILITY_FAMILIES: readonly CapabilityFamily[] = [
  "video",
  "image",
  "slides",
  "text",
  "data",
  "ops",
  "research",
  "vision",
] as const;

export type CapabilityExecutionKind = "hosted-execute" | "provider-assembly" | "local-only";

// ---------------------------------------------------------------------------
// CMS workflow node types — matches production schema
// ---------------------------------------------------------------------------

export type CmsNodeType = "tool_execution" | "cms_workflow";

export type CmsVisibility = "public" | "authenticated" | "admin";

export interface CmsExecutionBinding {
  type: "mcp_tool_call";
  strategy: "direct" | "sequential-with-persistence" | "async_operation";
  timeoutMs?: number;
  max_retries?: number;
  polling_interval?: number;
}

export interface CmsExecutionTokens {
  tool_name: string;
  input_template: Record<string, unknown>;
  output_mapping: Record<string, unknown>;
  endpoint_config?: {
    env_var?: string;
    endpoint_type?: string;
  };
  migration_version?: string;
}

// ---------------------------------------------------------------------------
// CMS capability node — the core registry primitive
// ---------------------------------------------------------------------------

export interface CmsCapabilityNode {
  /** Unique slug identifying this capability (e.g. "video-generation", "llm-text-generation"). */
  slug: string;
  /** Human-readable display name. */
  displayName: string;
  /** Icon emoji for the node. */
  icon: string;
  /** Capability family classification. */
  family: CapabilityFamily;
  /** CMS category (e.g. "automation", "media_generation"). */
  category: string;
  /** CMS node type. */
  nodeType: CmsNodeType;
  /** How this node executes. */
  executionKind: CapabilityExecutionKind;
  /** Execution binding configuration. */
  executionBinding: CmsExecutionBinding;
  /** Execution tokens with input template and output mapping. */
  executionTokens: CmsExecutionTokens;
  /** Binding keys required before execution (provider keys, connection refs). */
  requiredBindings: string[];
  /** Output artifact types this node can produce. */
  outputTypes: string[];
  /** Whether this node is enabled for the current user/org. */
  enabled: boolean;
  /** Whether this is experimental. */
  experimental: boolean;
  /** Visibility level. */
  visibility: CmsVisibility;
  /** Optional description. */
  description?: string;
  /** Opaque CMS metadata forwarded from the registry. */
  manifestMetadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// CMS connector node — for provider discovery
// ---------------------------------------------------------------------------

export interface CmsConnectorNode {
  /** Unique slug. */
  slug: string;
  /** Display name. */
  displayName: string;
  /** Icon path or emoji. */
  icon: string;
  /** Auth type (e.g. "oauth_first_party", "api_token"). */
  authType: string;
  /** Tool slugs owned by this connector. */
  tools: string[];
  /** Description. */
  description?: string;
  /** Long description. */
  longDescription?: string;
  /** Whether this connector is active. */
  enabled: boolean;
  /** Provider identifier. */
  mcpProvider: string;
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
  /** Text search across slug, displayName, description. */
  search?: string;
  /** Bypass local TTL cache and fetch fresh from hosted. */
  refresh?: boolean;
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
  /** Source of the data. */
  source: "hosted" | "derived" | "cache";
  /** Whether this result came from local TTL cache. */
  fromCache?: boolean;
  /** ISO timestamp when the cache entry expires (only present when fromCache=true). */
  expiresAt?: string;
  /** Age of the cache entry in seconds (only present when fromCache=true). */
  cacheAgeSeconds?: number;
}

// ---------------------------------------------------------------------------
// Local TTL cache types
// ---------------------------------------------------------------------------

export interface CapabilityRegistryCacheMeta {
  fetchedAt: string;
  expiresAt: string;
  source: "hosted" | "derived";
  total: number;
  enabledCount: number;
}

/** Full cache snapshot stored on disk. */
export interface CachedCapabilityRegistry extends CapabilityRegistryCacheMeta {
  nodes: CmsCapabilityNode[];
}

/** Summary returned by getCapabilityCacheStatus() — no node payloads. */
export interface CapabilityCacheStatus {
  exists: boolean;
  fresh: boolean;
  fetchedAt?: string;
  expiresAt?: string;
  source?: "hosted" | "derived";
  total?: number;
  enabledCount?: number;
  /** Seconds elapsed since the cache was written. */
  ageSeconds?: number;
}

// ---------------------------------------------------------------------------
// Execution token inspection helpers
// ---------------------------------------------------------------------------

/** A single field extracted from executionTokens.input_template for display. */
export interface InputTemplateField {
  key: string;
  value: unknown;
  /** JS typeof of the value. */
  valueType: string;
  /** True when value is "" or null or undefined. */
  isEmpty: boolean;
}

/** A single mapping entry extracted from executionTokens.output_mapping for display. */
export interface OutputMappingEntry {
  key: string;
  /** JSON path expression or constant value pointing to the output field. */
  path: unknown;
  description?: string;
}
