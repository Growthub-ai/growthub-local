/**
 * CMS Capability Registry Client
 *
 * Treats the CMS-backed node/tool definitions as a first-class registry for
 * the CLI/runtime. Layers:
 *
 *   1. Hosted authority   — GET /api/cli/capabilities
 *   2. On-disk TTL cache  — ~/.paperclip/manifests/<host>.capabilities.json
 *   3. Local extensions   — <forkPath>/.growthub-fork/capabilities/*.json
 *   4. Hosted-derived     — reconstructed from saved workflows when the
 *                           registry endpoint is absent (legacy path)
 *
 * Reads layer in this order: cache (when fresh) → hosted (refresh on miss
 * / when forced) → local extensions merged on top. Provenance is preserved
 * on every node so agents, renderers, and diffs can explain where each
 * capability came from.
 */

import {
  createHostedExecutionClient,
  type HostedCapabilityRecord,
} from "../hosted-execution-client/index.js";
import { readSession, isSessionExpired } from "../../auth/session-store.js";
import { listHostedWorkflows, fetchHostedWorkflow } from "../../auth/hosted-client.js";
import type {
  CmsCapabilityNode,
  CapabilityFamily,
  CapabilityQuery,
  CapabilityRegistryMeta,
  CapabilitySource,
} from "@growthub/api-contract/capabilities";
import {
  buildCapabilityManifestEnvelope,
  computeManifestDrift,
  type CapabilityManifestEnvelope,
  type ManifestDriftReport,
} from "./manifest.js";
import {
  readCachedManifest,
  writeCachedManifest,
  clearCachedManifest,
  resolveManifestCachePath,
  CAPABILITY_CACHE_DEFAULT_TTL_SECONDS,
} from "./cache.js";
import {
  readLocalCapabilityExtensions,
  mergeLocalExtensions,
  resolveLocalExtensionDir,
  type LocalExtensionScanResult,
} from "./local-extensions.js";

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
  CapabilitySource,
  CapabilityProvenance,
} from "./types.js";

export { CAPABILITY_FAMILIES } from "./types.js";
export {
  hashCapabilityNodes,
  buildCapabilityManifestEnvelope,
  computeManifestDrift,
  type CapabilityManifestEnvelope,
  type ManifestDriftReport,
} from "./manifest.js";
export {
  readLocalCapabilityExtensions,
  resolveLocalExtensionDir,
  mergeLocalExtensions,
  LOCAL_EXTENSIONS_DIRNAME,
} from "./local-extensions.js";
export {
  validateCmsCapabilityNode,
  validateLocalCapabilityExtension,
} from "./schema.js";
export {
  resolveManifestCachePath,
  clearCachedManifest,
  CAPABILITY_CACHE_DEFAULT_TTL_SECONDS,
} from "./cache.js";

// ---------------------------------------------------------------------------
// Normalize hosted records to CmsCapabilityNode
// ---------------------------------------------------------------------------

function toCapabilityNode(
  record: HostedCapabilityRecord,
  provenance: { source: CapabilitySource; sourceUrl?: string; fetchedAt: string; manifestHash?: string },
): CmsCapabilityNode {
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
    provenance: {
      source: provenance.source,
      sourceUrl: provenance.sourceUrl,
      fetchedAt: provenance.fetchedAt,
      manifestHash: provenance.manifestHash,
    },
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
  if (query.family && node.family !== query.family) return false;
  if (query.executionKind && node.executionKind !== query.executionKind) return false;
  if (query.outputType && !node.outputTypes.includes(query.outputType)) return false;
  if (query.slug && !node.slug.includes(query.slug)) return false;
  if (query.source && node.provenance?.source !== query.source) return false;
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

export interface CapabilityRefreshResult {
  envelope: CapabilityManifestEnvelope;
  cachePath: string;
  drift: ManifestDriftReport;
}

export interface CmsCapabilityRegistryClient {
  /** Fetch all capabilities, optionally filtered. Uses cache + local extensions. */
  listCapabilities(query?: CapabilityQuery): Promise<{ nodes: CmsCapabilityNode[]; meta: CapabilityRegistryMeta }>;
  /** Fetch a single capability by slug (uses the same merge pipeline). */
  getCapability(slug: string): Promise<CmsCapabilityNode | null>;
  /** Force a hosted refresh, rewriting the cache and reporting drift. */
  refresh(opts?: { ttlSeconds?: number }): Promise<CapabilityRefreshResult>;
  /** Read cached envelope without touching hosted (null if no cache). */
  readCachedEnvelope(): CapabilityManifestEnvelope | null;
  /** Drop the on-disk cache; next read re-fetches. */
  clearCache(): boolean;
  /** Scan local extensions under registered forks (no hosted call). */
  scanLocalExtensions(): LocalExtensionScanResult;
}

export interface CmsCapabilityRegistryClientOptions {
  /** Cache TTL in seconds. Defaults to the hosted suggested TTL or 5 min. */
  ttlSeconds?: number;
  /** If true, bypass the on-disk cache and fetch hosted every time. */
  bypassCache?: boolean;
}

function resolveHostedBaseUrl(): string {
  const session = readSession();
  return session?.hostedBaseUrl ?? "https://app.growthub.local";
}

async function fetchHostedEnvelope(opts: { sourceUrl: string }): Promise<CapabilityManifestEnvelope> {
  const executionClient = createHostedExecutionClient();
  let hostedRecords = await executionClient.getHostedCapabilities();
  let derived = false;
  if (hostedRecords.length === 0) {
    hostedRecords = await deriveCapabilitiesFromHostedWorkflows();
    derived = true;
  }
  if (hostedRecords.length === 0) {
    throw new Error(
      "Hosted capability registry returned zero nodes. No local fallback is enabled.",
    );
  }
  const fetchedAt = new Date().toISOString();
  const sourceLabel: CapabilitySource = derived ? "hosted-derived" : "hosted";
  const envelope = buildCapabilityManifestEnvelope(
    hostedRecords.map((r) => toCapabilityNode(r, {
      source: sourceLabel,
      sourceUrl: opts.sourceUrl,
      fetchedAt,
    })),
    { sourceUrl: opts.sourceUrl, fetchedAt, suggestedTtlSeconds: CAPABILITY_CACHE_DEFAULT_TTL_SECONDS },
  );
  // Stamp every node with the computed registry hash for provenance.
  for (const node of envelope.nodes) {
    if (node.provenance) node.provenance.manifestHash = envelope.meta.registryHash;
  }
  return envelope;
}

export function createCmsCapabilityRegistryClient(
  options?: CmsCapabilityRegistryClientOptions,
): CmsCapabilityRegistryClient {
  const ttlSeconds = options?.ttlSeconds;
  const bypassCache = options?.bypassCache ?? false;

  async function loadEnvelope(): Promise<{ envelope: CapabilityManifestEnvelope; cached: boolean }> {
    const sourceUrl = resolveHostedBaseUrl();

    if (!bypassCache) {
      const cached = readCachedManifest(sourceUrl, { ttlSeconds });
      if (cached?.isFresh) {
        return { envelope: cached.envelope, cached: true };
      }
    }

    try {
      const envelope = await fetchHostedEnvelope({ sourceUrl });
      writeCachedManifest(sourceUrl, envelope);
      return { envelope, cached: false };
    } catch (err) {
      // Last-resort: fall back to stale cache rather than failing closed.
      const cached = readCachedManifest(sourceUrl, { ttlSeconds: Number.POSITIVE_INFINITY });
      if (cached) return { envelope: cached.envelope, cached: true };
      throw err;
    }
  }

  async function assembleRegistry(): Promise<{
    nodes: CmsCapabilityNode[];
    meta: CapabilityRegistryMeta;
    cached: boolean;
  }> {
    const { envelope, cached } = await loadEnvelope();
    const scan = readLocalCapabilityExtensions();
    const merged = mergeLocalExtensions(envelope.nodes, scan);

    const enabledCount = merged.nodes.filter((n) => n.enabled).length;
    const source: CapabilityRegistryMeta["source"] =
      merged.localExtensionCount > 0 ? "mixed" : cached ? "cache" : "hosted";

    return {
      nodes: merged.nodes,
      meta: {
        total: merged.nodes.length,
        enabledCount,
        fetchedAt: envelope.meta.fetchedAt,
        source,
        cached,
        manifestHash: envelope.meta.registryHash,
        localExtensionCount: merged.localExtensionCount,
      },
      cached,
    };
  }

  return {
    async listCapabilities(query) {
      const { nodes, meta } = await assembleRegistry();
      const filtered = query ? nodes.filter((n) => matchesQuery(n, query)) : nodes;
      return { nodes: filtered, meta };
    },

    async getCapability(slug) {
      const { nodes } = await assembleRegistry();
      return nodes.find((n) => n.slug === slug) ?? null;
    },

    async refresh(refreshOpts) {
      const sourceUrl = resolveHostedBaseUrl();
      const priorCache = readCachedManifest(sourceUrl, {
        ttlSeconds: Number.POSITIVE_INFINITY,
      });
      const envelope = await fetchHostedEnvelope({ sourceUrl });
      const cachePath = writeCachedManifest(sourceUrl, envelope);
      const drift = computeManifestDrift(priorCache?.envelope ?? null, envelope);
      return { envelope, cachePath, drift };
    },

    readCachedEnvelope() {
      const sourceUrl = resolveHostedBaseUrl();
      const cached = readCachedManifest(sourceUrl, { ttlSeconds: Number.POSITIVE_INFINITY });
      return cached?.envelope ?? null;
    },

    clearCache() {
      const sourceUrl = resolveHostedBaseUrl();
      return clearCachedManifest(sourceUrl);
    },

    scanLocalExtensions() {
      return readLocalCapabilityExtensions();
    },
  };
}
