/**
 * Growthub API v1 — Capability Registry Types
 *
 * Canonical definitions for CMS-backed capability primitives. These mirror
 * the hosted CMS `workflow_node` content_type so the CLI, server, adapter
 * authors, and external API consumers all bind to one shape.
 *
 * Stability: v1. Additive changes only until v2.
 */

export type CapabilityFamily =
  | "video"
  | "image"
  | "slides"
  | "text"
  | "data"
  | "ops"
  | "research"
  | "vision";

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

export type CapabilityExecutionKind =
  | "hosted-execute"
  | "provider-assembly"
  | "local-only";

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

/**
 * Source of a capability node. Hosted is authoritative; local-extension
 * lives under `<forkPath>/.growthub-fork/capabilities/*.json`; hosted-derived
 * is reconstructed from saved workflow configs when the registry endpoint
 * is absent.
 */
export type CapabilitySource = "hosted" | "local-extension" | "hosted-derived";

export interface CapabilityProvenance {
  /** Source identifier. */
  source: CapabilitySource;
  /** Hash of the registry manifest this node was loaded from. */
  manifestHash?: string;
  /** ISO timestamp of when the node was fetched or read from disk. */
  fetchedAt: string;
  /** For local extensions: absolute path of the declaration file. */
  filePath?: string;
  /** For hosted: the URL the manifest was fetched from. */
  sourceUrl?: string;
}

export interface CmsCapabilityNode {
  slug: string;
  displayName: string;
  icon: string;
  family: CapabilityFamily;
  category: string;
  nodeType: CmsNodeType;
  executionKind: CapabilityExecutionKind;
  executionBinding: CmsExecutionBinding;
  executionTokens: CmsExecutionTokens;
  requiredBindings: string[];
  outputTypes: string[];
  enabled: boolean;
  experimental: boolean;
  visibility: CmsVisibility;
  description?: string;
  manifestMetadata?: Record<string, unknown>;
  /** Optional provenance; absent for legacy in-memory records. */
  provenance?: CapabilityProvenance;
}

export interface CmsConnectorNode {
  slug: string;
  displayName: string;
  icon: string;
  authType: string;
  tools: string[];
  description?: string;
  longDescription?: string;
  enabled: boolean;
  mcpProvider: string;
}

export interface CapabilityQuery {
  family?: CapabilityFamily;
  slug?: string;
  executionKind?: CapabilityExecutionKind;
  outputType?: string;
  enabledOnly?: boolean;
  search?: string;
  /** Filter by source (hosted only, local-extension only, etc). */
  source?: CapabilitySource;
}

export interface CapabilityRegistryMeta {
  total: number;
  enabledCount: number;
  fetchedAt: string;
  source: "hosted" | "cache" | "mixed";
  /** True when the response was served from the on-disk TTL cache. */
  cached?: boolean;
  /** Hash of the hosted manifest this response was derived from. */
  manifestHash?: string;
  /** Count of nodes added by local extensions. */
  localExtensionCount?: number;
}

/**
 * Wire shape returned by `GET /api/cli/capabilities`. This is what the
 * server promises; the CLI adapts it into `CmsCapabilityNode`.
 */
export interface HostedCapabilityRecord {
  slug: string;
  family: string;
  displayName: string;
  executionKind: CapabilityExecutionKind;
  requiredBindings: string[];
  outputTypes: string[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
}
