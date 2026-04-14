/**
 * CMS Capability Registry Client
 *
 * Treats the CMS-backed node/tool definitions as a first-class registry for
 * the CLI/runtime. This layer lets agents discover:
 *   - which core node primitives exist
 *   - which are available to the authenticated user/org
 *   - how they bind into pipelines
 *   - what execution shape they require
 *
 * Data sources:
 *   1. Hosted registry endpoint (primary — via HostedExecutionClient)
 *   2. Built-in fallback catalog (for offline / endpoint-not-deployed scenarios)
 *
 * The registry does NOT reimplement CMS semantics — it exposes them as
 * CLI/runtime-friendly node records.
 */

import {
  createHostedExecutionClient,
  type HostedCapabilityRecord,
} from "../hosted-execution-client/index.js";
import type {
  CmsCapabilityNode,
  CapabilityFamily,
  CapabilityQuery,
  CapabilityRegistryMeta,
} from "./types.js";

export type {
  CmsCapabilityNode,
  CapabilityFamily,
  CapabilityExecutionKind,
  CapabilityQuery,
  CapabilityRegistryMeta,
} from "./types.js";

export { CAPABILITY_FAMILIES } from "./types.js";

// ---------------------------------------------------------------------------
// Built-in fallback catalog
// ---------------------------------------------------------------------------

const BUILTIN_CAPABILITIES: CmsCapabilityNode[] = [
  {
    slug: "video-gen",
    displayName: "Video Generation",
    family: "video",
    executionKind: "hosted-execute",
    requiredBindings: ["provider-api-key"],
    outputTypes: ["video"],
    enabled: true,
    description: "Generate video content via hosted provider pipeline.",
  },
  {
    slug: "image-gen",
    displayName: "Image Generation",
    family: "image",
    executionKind: "hosted-execute",
    requiredBindings: ["provider-api-key"],
    outputTypes: ["image"],
    enabled: true,
    description: "Generate images via hosted provider pipeline.",
  },
  {
    slug: "slides-gen",
    displayName: "Slides Generation",
    family: "slides",
    executionKind: "hosted-execute",
    requiredBindings: ["provider-api-key", "template-id"],
    outputTypes: ["slides"],
    enabled: true,
    description: "Generate presentation slides from structured input.",
  },
  {
    slug: "text-gen",
    displayName: "Text Generation",
    family: "text",
    executionKind: "hosted-execute",
    requiredBindings: ["provider-api-key"],
    outputTypes: ["text"],
    enabled: true,
    description: "Generate text content via LLM provider.",
  },
  {
    slug: "data-snapshot",
    displayName: "Data Snapshot",
    family: "data",
    executionKind: "local-only",
    requiredBindings: ["data-source"],
    outputTypes: ["report"],
    enabled: true,
    description: "Capture a point-in-time data snapshot for downstream nodes.",
  },
  {
    slug: "provider-report",
    displayName: "Provider Assembly Report",
    family: "ops",
    executionKind: "provider-assembly",
    requiredBindings: ["connection-id"],
    outputTypes: ["report"],
    enabled: true,
    description: "Assemble and report on provider configuration status.",
  },
];

// ---------------------------------------------------------------------------
// Normalize hosted records to CmsCapabilityNode
// ---------------------------------------------------------------------------

function toCapabilityNode(record: HostedCapabilityRecord): CmsCapabilityNode {
  const familyMap: Record<string, CapabilityFamily> = {
    video: "video",
    image: "image",
    slides: "slides",
    text: "text",
    data: "data",
    ops: "ops",
  };

  return {
    slug: record.slug,
    displayName: record.displayName,
    family: familyMap[record.family] ?? "ops",
    executionKind: record.executionKind,
    requiredBindings: record.requiredBindings,
    outputTypes: record.outputTypes,
    enabled: record.enabled,
    manifestMetadata: record.metadata,
  };
}

// ---------------------------------------------------------------------------
// Query filter
// ---------------------------------------------------------------------------

function matchesQuery(node: CmsCapabilityNode, query: CapabilityQuery): boolean {
  if (query.enabledOnly !== false && !node.enabled) return false;
  if (query.family && node.family !== query.family) return false;
  if (query.executionKind && node.executionKind !== query.executionKind) return false;
  if (query.outputType && !node.outputTypes.includes(query.outputType)) return false;
  if (query.slug && !node.slug.includes(query.slug)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Registry client
// ---------------------------------------------------------------------------

export interface CmsCapabilityRegistryClient {
  /** Fetch all capabilities, optionally filtered. */
  listCapabilities(query?: CapabilityQuery): Promise<{ nodes: CmsCapabilityNode[]; meta: CapabilityRegistryMeta }>;
  /** Fetch a single capability by slug. */
  getCapability(slug: string): Promise<CmsCapabilityNode | null>;
  /** Fetch only the built-in fallback capabilities (no network). */
  listBuiltinCapabilities(query?: CapabilityQuery): { nodes: CmsCapabilityNode[]; meta: CapabilityRegistryMeta };
}

export function createCmsCapabilityRegistryClient(): CmsCapabilityRegistryClient {
  return {
    async listCapabilities(query) {
      let nodes: CmsCapabilityNode[];
      let source: "hosted" | "local-fallback";

      try {
        const executionClient = createHostedExecutionClient();
        const hostedRecords = await executionClient.getHostedCapabilities();

        if (hostedRecords.length > 0) {
          nodes = hostedRecords.map(toCapabilityNode);
          source = "hosted";
        } else {
          // Hosted returned empty — merge with built-in
          nodes = [...BUILTIN_CAPABILITIES];
          source = "local-fallback";
        }
      } catch {
        // Network failure or no session — use built-in catalog
        nodes = [...BUILTIN_CAPABILITIES];
        source = "local-fallback";
      }

      const enabledCount = nodes.filter((n) => n.enabled).length;
      const filtered = query ? nodes.filter((n) => matchesQuery(n, query)) : nodes;

      return {
        nodes: filtered,
        meta: {
          total: nodes.length,
          enabledCount,
          fetchedAt: new Date().toISOString(),
          source,
        },
      };
    },

    async getCapability(slug) {
      const { nodes } = await this.listCapabilities({ slug, enabledOnly: false });
      return nodes.find((n) => n.slug === slug) ?? null;
    },

    listBuiltinCapabilities(query) {
      const nodes = query
        ? BUILTIN_CAPABILITIES.filter((n) => matchesQuery(n, query))
        : [...BUILTIN_CAPABILITIES];

      return {
        nodes,
        meta: {
          total: BUILTIN_CAPABILITIES.length,
          enabledCount: BUILTIN_CAPABILITIES.filter((n) => n.enabled).length,
          fetchedAt: new Date().toISOString(),
          source: "local-fallback",
        },
      };
    },
  };
}
