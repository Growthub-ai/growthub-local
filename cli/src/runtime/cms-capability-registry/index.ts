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
 * Phase B source-precedence (locked):
 *   1. Hosted `CapabilityManifestEnvelope` from `/api/cms/capabilities`
 *      (primary — canonical truth per S141).
 *   2. Local manifest cache — used only when the hosted fetch FAILS
 *      (transport / 404 / 501 / auth) OR when the contract version
 *      mismatches and a cached envelope exists.
 *   3. Legacy derivation from hosted workflows — emergency-only fallback
 *      for cold-start environments with no hosted manifest and no cache.
 *
 * The registry does NOT reimplement CMS semantics — it exposes them as
 * CLI/runtime-friendly node records projected from the public contract.
 */

import {
  createHostedExecutionClient,
  type HostedCapabilityRecord,
} from "../hosted-execution-client/index.js";
import {
  fetchCapabilityManifest,
  ManifestContractMismatchError,
  ManifestEndpointUnavailableError,
  ManifestMalformedError,
  ManifestUnauthenticatedError,
} from "../cms-manifest-client/index.js";
import {
  readManifestCache,
  writeManifestCache,
} from "../cms-manifest-cache/index.js";
import { projectManifestEnvelope } from "../cms-manifest-projection/index.js";
import { readSession, isSessionExpired } from "../../auth/session-store.js";
import { listHostedWorkflows, fetchHostedWorkflow } from "../../auth/hosted-client.js";
import type {
  CmsCapabilityNode,
  CapabilityFamily,
  CapabilityQuery,
  CapabilityRegistryMeta,
} from "./types.js";

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
// Normalize hosted records to CmsCapabilityNode (legacy fallback path)
// ---------------------------------------------------------------------------

function toCapabilityNode(record: HostedCapabilityRecord): CmsCapabilityNode {
  const familyMap: Record<string, CapabilityFamily> = {
    video: "video",
    image: "image",
    slides: "slides",
    text: "text",
    data: "data",
    ops: "ops",
    research: "research",
    vision: "vision",
  };

  const metadata = (record.metadata ?? {}) as Record<string, unknown>;
  const executionTokens = (metadata.executionTokens ?? metadata.execution_tokens ?? {}) as Record<string, unknown>;
  const inputTemplate = (executionTokens.input_template ?? metadata.input_template ?? {}) as Record<string, unknown>;
  const outputMapping = (executionTokens.output_mapping ?? metadata.output_mapping ?? {}) as Record<string, unknown>;
  const toolName = typeof executionTokens.tool_name === "string"
    ? executionTokens.tool_name
    : typeof metadata.tool_name === "string"
      ? metadata.tool_name
      : record.slug;
  const executionStrategy = typeof (metadata.executionStrategy ?? metadata.execution_strategy) === "string"
    ? (metadata.executionStrategy ?? metadata.execution_strategy) as "direct" | "sequential-with-persistence" | "async_operation"
    : "direct";
  return {
    slug: record.slug,
    displayName: record.displayName,
    icon: typeof metadata.icon === "string" ? metadata.icon : "",
    family: familyMap[record.family] ?? "ops",
    category: typeof metadata.category === "string" ? metadata.category : "automation",
    nodeType: (typeof metadata.nodeType === "string" ? metadata.nodeType : "tool_execution") as "tool_execution" | "cms_workflow",
    executionKind: record.executionKind,
    executionBinding: { type: "mcp_tool_call", strategy: executionStrategy },
    executionTokens: {
      tool_name: toolName,
      input_template: inputTemplate,
      output_mapping: outputMapping,
    },
    requiredBindings: record.requiredBindings,
    outputTypes: record.outputTypes,
    enabled: record.enabled,
    experimental: Boolean(metadata.experimental),
    visibility: (typeof metadata.visibility === "string" ? metadata.visibility : "authenticated") as "public" | "authenticated" | "admin",
    description: typeof metadata.description === "string" ? metadata.description : undefined,
    manifestMetadata: metadata,
  };
}

function inferFamilyFromSlug(slug: string): CapabilityFamily {
  const normalized = slug.toLowerCase();
  if (normalized.includes("video")) return "video";
  if (normalized.includes("image")) return "image";
  if (normalized.includes("slide")) return "slides";
  if (normalized.includes("research")) return "research";
  if (normalized.includes("vision")) return "vision";
  if (normalized.includes("text") || normalized.includes("llm")) return "text";
  if (normalized.includes("data")) return "data";
  return "ops";
}

async function deriveCapabilitiesFromHostedWorkflows(): Promise<HostedCapabilityRecord[]> {
  const session = readSession();
  if (!session || isSessionExpired(session)) return [];

  const list = await listHostedWorkflows(session);
  const workflows = list?.workflows ?? [];
  if (workflows.length === 0) return [];

  const bySlug = new Map<string, HostedCapabilityRecord>();

  for (const workflow of workflows.slice(0, 50)) {
    const detail = await fetchHostedWorkflow(session, workflow.workflowId);
    const nodes = Array.isArray(detail?.latestVersion?.config?.nodes)
      ? (detail?.latestVersion?.config?.nodes as Array<Record<string, unknown>>)
      : [];

    for (const node of nodes) {
      if (node.type !== "cmsNode") continue;
      const data = (node.data ?? {}) as Record<string, unknown>;
      const slug = typeof data.slug === "string" ? data.slug : null;
      if (!slug) continue;
      const inputs = (data.inputs ?? {}) as Record<string, unknown>;

      if (!bySlug.has(slug)) {
        bySlug.set(slug, {
          slug,
          family: inferFamilyFromSlug(slug),
          displayName: slug,
          executionKind: "hosted-execute",
          requiredBindings: [],
          outputTypes: [],
          enabled: true,
          metadata: {
            input_template: inputs,
            output_mapping: {},
            tool_name: slug,
            source: "derived-from-hosted-workflows",
          },
        });
      }
    }
  }

  return [...bySlug.values()];
}

// ---------------------------------------------------------------------------
// Query filter
// ---------------------------------------------------------------------------

function matchesQuery(node: CmsCapabilityNode, query: CapabilityQuery): boolean {
  if (query.enabledOnly !== false && !node.enabled) return false;
  if (query.includeExperimental !== true && node.experimental) return false;
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
// Internal source resolution
// ---------------------------------------------------------------------------

type RegistrySourceOutcome =
  | {
      kind: "manifest";
      nodes: CmsCapabilityNode[];
      fetchedAt: string;
      stale: boolean;
      stalenessReason?: string;
    }
  | {
      kind: "legacy";
      nodes: CmsCapabilityNode[];
      fetchedAt: string;
    };

async function resolveFromManifest(query?: CapabilityQuery): Promise<RegistrySourceOutcome> {
  try {
    const { envelope } = await fetchCapabilityManifest({
      includeExperimental: query?.includeExperimental === true,
      includeDisabled: query?.enabledOnly === false,
    });
    writeManifestCache(envelope);
    const projected = projectManifestEnvelope(envelope);
    return {
      kind: "manifest",
      nodes: projected.nodes,
      fetchedAt: projected.fetchedAt,
      stale: false,
    };
  } catch (err) {
    // Contract mismatch OR malformed body MUST NOT fall through to
    // legacy derivation. Stale cache is the only legal fallback.
    if (err instanceof ManifestContractMismatchError || err instanceof ManifestMalformedError) {
      const cached = readManifestCache();
      if (cached) {
        const projected = projectManifestEnvelope(cached);
        return {
          kind: "manifest",
          nodes: projected.nodes,
          fetchedAt: projected.fetchedAt,
          stale: true,
          stalenessReason:
            err instanceof ManifestContractMismatchError
              ? `Contract version mismatch (${err.message}); using cached manifest from ${projected.fetchedAt}.`
              : `Hosted manifest malformed (${err.message}); using cached manifest from ${projected.fetchedAt}.`,
        };
      }
      throw err;
    }

    // Transport / endpoint / auth failures — try cache, then legacy.
    if (
      err instanceof ManifestEndpointUnavailableError ||
      err instanceof ManifestUnauthenticatedError
    ) {
      const cached = readManifestCache();
      if (cached) {
        const projected = projectManifestEnvelope(cached);
        return {
          kind: "manifest",
          nodes: projected.nodes,
          fetchedAt: projected.fetchedAt,
          stale: true,
          stalenessReason: `Hosted manifest unavailable (${err.message}); using cached manifest from ${projected.fetchedAt}.`,
        };
      }
      return resolveFromLegacy();
    }

    throw err;
  }
}

async function resolveFromLegacy(): Promise<RegistrySourceOutcome> {
  const executionClient = createHostedExecutionClient();
  let hostedRecords = await executionClient.getHostedCapabilities();
  if (hostedRecords.length === 0) {
    hostedRecords = await deriveCapabilitiesFromHostedWorkflows();
  }
  if (hostedRecords.length === 0) {
    throw new Error(
      "Hosted capability registry returned zero nodes, cache is empty, and derivation produced nothing.",
    );
  }
  return {
    kind: "legacy",
    nodes: hostedRecords.map(toCapabilityNode),
    fetchedAt: new Date().toISOString(),
  };
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
      const outcome = await resolveFromManifest(query);
      const nodes = outcome.nodes;

      const enabledCount = nodes.filter((n) => n.enabled).length;
      const filtered = query ? nodes.filter((n) => matchesQuery(n, query)) : nodes;

      const meta: CapabilityRegistryMeta = {
        total: nodes.length,
        enabledCount,
        fetchedAt: outcome.fetchedAt,
        source: "hosted",
      };

      return { nodes: filtered, meta };
    },

    async getCapability(slug) {
      const { nodes } = await this.listCapabilities({ slug, enabledOnly: false });
      return nodes.find((n) => n.slug === slug) ?? null;
    },
  };
}
