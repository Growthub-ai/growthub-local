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
 *   - Hosted registry endpoint via HostedExecutionClient (primary)
 *   - Derived from saved hosted workflows (fallback when registry unavailable)
 *   - Local TTL cache (advisory; bypassed by query.refresh=true)
 *
 * The registry does NOT reimplement CMS semantics — it exposes them as
 * CLI/runtime-friendly node records.
 */

import fs from "node:fs";
import path from "node:path";
import {
  createHostedExecutionClient,
  type HostedCapabilityRecord,
} from "../hosted-execution-client/index.js";
import { readSession, isSessionExpired } from "../../auth/session-store.js";
import { listHostedWorkflows, fetchHostedWorkflow } from "../../auth/hosted-client.js";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import type {
  CmsCapabilityNode,
  CapabilityFamily,
  CapabilityQuery,
  CapabilityRegistryMeta,
  CachedCapabilityRegistry,
  CapabilityCacheStatus,
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
  CachedCapabilityRegistry,
  CapabilityRegistryCacheMeta,
  CapabilityCacheStatus,
  InputTemplateField,
  OutputMappingEntry,
} from "./types.js";

export { CAPABILITY_FAMILIES } from "./types.js";

// ---------------------------------------------------------------------------
// TTL cache — advisory, file-backed, non-blocking
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function resolveCapabilityCachePath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "cache", "capability-registry.json");
}

function readCapabilityCache(): CachedCapabilityRegistry | null {
  try {
    const cachePath = resolveCapabilityCachePath();
    if (!fs.existsSync(cachePath)) return null;
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as unknown;
    if (
      typeof raw !== "object" || raw === null ||
      !("fetchedAt" in raw) || !("expiresAt" in raw) || !("nodes" in raw) ||
      !Array.isArray((raw as { nodes: unknown }).nodes)
    ) return null;
    return raw as CachedCapabilityRegistry;
  } catch {
    return null;
  }
}

function writeCapabilityCache(
  nodes: CmsCapabilityNode[],
  meta: { source: "hosted" | "derived"; total: number; enabledCount: number },
): void {
  try {
    const cachePath = resolveCapabilityCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const now = Date.now();
    const entry: CachedCapabilityRegistry = {
      fetchedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
      source: meta.source,
      total: meta.total,
      enabledCount: meta.enabledCount,
      nodes,
    };
    fs.writeFileSync(cachePath, `${JSON.stringify(entry, null, 2)}\n`, "utf-8");
  } catch {
    // Cache write is non-fatal — never block discovery
  }
}

function isCacheValid(cache: CachedCapabilityRegistry): boolean {
  return new Date(cache.expiresAt).getTime() > Date.now();
}

/** Clear the local capability registry cache. */
export function clearCapabilityCache(): void {
  try {
    const cachePath = resolveCapabilityCachePath();
    if (fs.existsSync(cachePath)) {
      fs.rmSync(cachePath);
    }
  } catch {
    // Non-fatal
  }
}

/** Return current cache state without loading node payloads. */
export function getCapabilityCacheStatus(): CapabilityCacheStatus {
  const cache = readCapabilityCache();
  if (!cache) return { exists: false, fresh: false };
  const fresh = isCacheValid(cache);
  const ageSeconds = Math.floor((Date.now() - new Date(cache.fetchedAt).getTime()) / 1000);
  return {
    exists: true,
    fresh,
    fetchedAt: cache.fetchedAt,
    expiresAt: cache.expiresAt,
    source: cache.source,
    total: cache.total,
    enabledCount: cache.enabledCount,
    ageSeconds,
  };
}

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
      endpoint_config: typeof executionTokens.endpoint_config === "object" && executionTokens.endpoint_config !== null
        ? executionTokens.endpoint_config as { env_var?: string; endpoint_type?: string }
        : undefined,
      migration_version: typeof executionTokens.migration_version === "string"
        ? executionTokens.migration_version
        : undefined,
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
  /** Fetch all capabilities, optionally filtered. Pass query.refresh=true to bypass cache. */
  listCapabilities(query?: CapabilityQuery): Promise<{ nodes: CmsCapabilityNode[]; meta: CapabilityRegistryMeta }>;
  /** Fetch a single capability by slug. */
  getCapability(slug: string): Promise<CmsCapabilityNode | null>;
}

export function createCmsCapabilityRegistryClient(): CmsCapabilityRegistryClient {
  return {
    async listCapabilities(query) {
      const forceRefresh = query?.refresh === true;

      // Check warm cache first (skip when forceRefresh or explicitly disabled)
      if (!forceRefresh) {
        const cached = readCapabilityCache();
        if (cached && isCacheValid(cached)) {
          const allNodes = cached.nodes.map((n) => n); // preserve shape
          const filtered = query ? allNodes.filter((n) => matchesQuery(n, query)) : allNodes;
          const ageSeconds = Math.floor((Date.now() - new Date(cached.fetchedAt).getTime()) / 1000);
          return {
            nodes: filtered,
            meta: {
              total: cached.total,
              enabledCount: cached.enabledCount,
              fetchedAt: cached.fetchedAt,
              source: "cache",
              fromCache: true,
              expiresAt: cached.expiresAt,
              cacheAgeSeconds: ageSeconds,
            },
          };
        }
      }

      // Fetch from hosted
      const executionClient = createHostedExecutionClient();
      let hostedRecords = await executionClient.getHostedCapabilities();
      let derivedSource: "hosted" | "derived" = "hosted";

      if (hostedRecords.length === 0) {
        hostedRecords = await deriveCapabilitiesFromHostedWorkflows();
        derivedSource = "derived";
      }

      if (hostedRecords.length === 0) {
        // Last resort: serve stale cache if available rather than hard-failing
        const staleCache = readCapabilityCache();
        if (staleCache) {
          const allNodes = staleCache.nodes;
          const filtered = query ? allNodes.filter((n) => matchesQuery(n, query)) : allNodes;
          const ageSeconds = Math.floor((Date.now() - new Date(staleCache.fetchedAt).getTime()) / 1000);
          return {
            nodes: filtered,
            meta: {
              total: staleCache.total,
              enabledCount: staleCache.enabledCount,
              fetchedAt: staleCache.fetchedAt,
              source: "cache",
              fromCache: true,
              expiresAt: staleCache.expiresAt,
              cacheAgeSeconds: ageSeconds,
            },
          };
        }
        throw new Error("Hosted capability registry returned zero nodes. No local fallback is enabled.");
      }

      const nodes = hostedRecords.map(toCapabilityNode);
      const enabledCount = nodes.filter((n) => n.enabled).length;

      // Persist to cache (non-blocking)
      writeCapabilityCache(nodes, { source: derivedSource, total: nodes.length, enabledCount });

      const filtered = query ? nodes.filter((n) => matchesQuery(n, query)) : nodes;
      const now = new Date().toISOString();

      return {
        nodes: filtered,
        meta: {
          total: nodes.length,
          enabledCount,
          fetchedAt: now,
          source: derivedSource,
          fromCache: false,
        },
      };
    },

    async getCapability(slug) {
      const { nodes } = await this.listCapabilities({ slug, enabledOnly: false });
      return nodes.find((n) => n.slug === slug) ?? null;
    },

  };
}
