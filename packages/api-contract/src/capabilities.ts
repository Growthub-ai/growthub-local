/**
 * CMS SDK v1 — Capabilities contract.
 *
 * Canonical types describing CMS-backed capability primitives. The shapes
 * here freeze the substrate already present in
 * `cli/src/runtime/cms-capability-registry/` and
 * `cli/src/runtime/hosted-execution-client/`; the SDK only renames and
 * publishes them as a stable public surface.
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

export type CapabilityNodeType = "tool_execution" | "cms_workflow";

export type CapabilityVisibility = "public" | "authenticated" | "admin";

export interface CapabilityExecutionBinding {
  type: "mcp_tool_call";
  strategy: "direct" | "sequential-with-persistence" | "async_operation";
  timeoutMs?: number;
  max_retries?: number;
  polling_interval?: number;
}

export interface CapabilityExecutionTokens {
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
 * Server-side capability record as returned by the hosted registry.
 * Slim shape. Clients normalize this into `CapabilityNode`.
 */
export interface CapabilityRecord {
  slug: string;
  family: string;
  displayName: string;
  executionKind: CapabilityExecutionKind;
  requiredBindings: string[];
  outputTypes: string[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Normalized client-side capability node. One record per CMS primitive,
 * enriched with display, binding, and execution metadata suitable for CLI,
 * hosted, and third-party surfaces.
 */
export interface CapabilityNode {
  slug: string;
  displayName: string;
  icon: string;
  family: CapabilityFamily;
  category: string;
  nodeType: CapabilityNodeType;
  executionKind: CapabilityExecutionKind;
  executionBinding: CapabilityExecutionBinding;
  executionTokens: CapabilityExecutionTokens;
  requiredBindings: string[];
  outputTypes: string[];
  enabled: boolean;
  experimental: boolean;
  visibility: CapabilityVisibility;
  description?: string;
  manifestMetadata?: Record<string, unknown>;
}

/**
 * Connector node for provider discovery. Surfaces the OAuth / tool
 * relationships a capability may depend on.
 */
export interface CapabilityConnectorNode {
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
}

export interface CapabilityRegistryMeta {
  total: number;
  enabledCount: number;
  fetchedAt: string;
  source: "hosted" | "local-extension" | "derived";
}
