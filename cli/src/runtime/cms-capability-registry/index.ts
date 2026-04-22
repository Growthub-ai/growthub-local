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
 * Data source:
 *   - Hosted registry endpoint via HostedExecutionClient
 *
 * The registry does NOT reimplement CMS semantics — it exposes them as
 * CLI/runtime-friendly node records.
 */

import type {
  CmsCapabilityNode,
  CapabilityFamily,
  CapabilityQuery,
  CapabilityRegistryMeta,
} from "./types.js";
import { resolveEnvelope } from "../manifest-registry/index.js";

export type {
  CmsCapabilityNode,
  CmsConnectorNode,
  CapabilityFamily,
  CapabilityExecutionKind,
  CapabilityQuery,
  CapabilityRegistryMeta,
  CmsNodeType,
  CmsVisibility,
  CmsExecutionBinding,
  CmsExecutionTokens,
} from "./types.js";

export { CAPABILITY_FAMILIES } from "./types.js";

// ---------------------------------------------------------------------------
// Query filter
// ---------------------------------------------------------------------------

function matchesQuery(node: CmsCapabilityNode, query: CapabilityQuery): boolean {
  if (query.enabledOnly !== false && !node.enabled) return false;
  if (query.family && node.family !== query.family) return false;
  if (query.executionKind && node.executionKind !== query.executionKind) return false;
  if (query.outputType && !node.outputTypes.includes(query.outputType)) return false;
  if (query.slug && !node.slug.includes(query.slug)) return false;
  if (query.search) {
    const term = query.search.toLowerCase();
    const haystack = `${node.slug} ${node.displayName} ${node.description ?? ""} ${node.category}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }
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
}

export function createCmsCapabilityRegistryClient(): CmsCapabilityRegistryClient {
  return {
    async listCapabilities(query) {
      const envelope = await resolveEnvelope();
      const nodes: CmsCapabilityNode[] = envelope.capabilities.map((m) => ({
        ...m.node,
        family: (m.node.family as CapabilityFamily),
      }));
      if (nodes.length === 0) {
        throw new Error("Hosted capability registry returned zero nodes. No local fallback is enabled.");
      }

      const enabledCount = nodes.filter((n) => n.enabled).length;
      const filtered = query ? nodes.filter((n) => matchesQuery(n, query)) : nodes;

      return {
        nodes: filtered,
        meta: {
          total: nodes.length,
          enabledCount,
          fetchedAt: envelope.fetchedAt,
          source: "hosted",
        },
      };
    },

    async getCapability(slug) {
      const { nodes } = await this.listCapabilities({ slug, enabledOnly: false });
      return nodes.find((n) => n.slug === slug) ?? null;
    },

  };
}
