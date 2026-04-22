/**
 * Envelope Producer
 *
 * Composes the existing hosted + derived capability sources into one
 * `CapabilityManifestEnvelope` (v1 public contract). Every entry is
 * stamped with explicit `ManifestProvenance` so downstream surfaces
 * can tell hosted, derived, and local-extension origins apart without
 * heuristics.
 *
 * Sources:
 *   1. Hosted capability endpoint via HostedExecutionClient.
 *   2. Fallback: derived from hosted workflow payloads (today's behavior).
 *   3. Local extension manifests layered on top.
 *
 * This wraps the already-shipped registry logic in
 * `cms-capability-registry/index.ts` — no new runtime semantics.
 */

import {
  createHostedExecutionClient,
  type HostedCapabilityRecord,
} from "../hosted-execution-client/index.js";
import { readSession, isSessionExpired } from "../../auth/session-store.js";
import { listHostedWorkflows, fetchHostedWorkflow } from "../../auth/hosted-client.js";
import {
  CAPABILITY_FAMILIES,
  type CapabilityFamily,
  type CapabilityManifest,
  type CapabilityManifestEnvelope,
  type ManifestProvenance,
} from "@growthub/api-contract";
import type { CmsCapabilityNode, CapabilityExecutionKind } from "../cms-capability-registry/index.js";
import {
  enrichInputSchema,
  enrichOutputSchema,
} from "../cms-node-contracts/schema-enrich.js";
import { loadLocalExtensionManifests, mergeLocalExtensions } from "./local-extensions.js";
import type { FetchEnvelopeOptions } from "./types.js";

// ---------------------------------------------------------------------------
// Shared CmsCapabilityNode shape (mirrors cms-capability-registry/index.ts)
// ---------------------------------------------------------------------------

const FAMILY_SET = new Set<string>(CAPABILITY_FAMILIES);

function normalizeFamily(raw: string): CapabilityFamily {
  return (FAMILY_SET.has(raw) ? raw : "ops") as CapabilityFamily;
}

function inferFamilyFromSlug(slug: string): CapabilityFamily {
  const n = slug.toLowerCase();
  if (n.includes("video")) return "video";
  if (n.includes("image")) return "image";
  if (n.includes("slide")) return "slides";
  if (n.includes("research")) return "research";
  if (n.includes("vision")) return "vision";
  if (n.includes("text") || n.includes("llm")) return "text";
  if (n.includes("data")) return "data";
  return "ops";
}

function toCapabilityNode(record: HostedCapabilityRecord): CmsCapabilityNode {
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
    family: normalizeFamily(record.family),
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

// ---------------------------------------------------------------------------
// Source fetchers (lifted verbatim from cms-capability-registry)
// ---------------------------------------------------------------------------

async function fetchHostedCapabilities(): Promise<HostedCapabilityRecord[]> {
  const client = createHostedExecutionClient();
  return client.getHostedCapabilities();
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
// Manifest composition
// ---------------------------------------------------------------------------

function toCapabilityManifest(
  node: CmsCapabilityNode,
  provenance: ManifestProvenance,
): CapabilityManifest {
  return {
    slug: node.slug,
    family: node.family,
    displayName: node.displayName,
    executionKind: node.executionKind as CapabilityExecutionKind,
    requiredBindings: node.requiredBindings ?? [],
    outputTypes: node.outputTypes ?? [],
    node: {
      slug: node.slug,
      displayName: node.displayName,
      icon: node.icon,
      family: node.family,
      category: node.category,
      nodeType: node.nodeType,
      executionKind: node.executionKind,
      executionBinding: node.executionBinding,
      executionTokens: node.executionTokens,
      requiredBindings: node.requiredBindings ?? [],
      outputTypes: node.outputTypes ?? [],
      enabled: node.enabled,
      experimental: node.experimental,
      visibility: node.visibility,
      description: node.description,
      manifestMetadata: node.manifestMetadata,
    },
    inputSchema: enrichInputSchema(node),
    outputSchema: enrichOutputSchema(node),
    provenance,
  };
}

function resolveHost(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const session = readSession();
  if (session?.hostedBaseUrl) return session.hostedBaseUrl;
  return "hosted";
}

/**
 * Produce a fresh envelope composed from hosted + derived + local-extension
 * sources. Never throws on empty hosted results — callers decide policy.
 */
export async function produceEnvelope(
  options: FetchEnvelopeOptions = {},
): Promise<CapabilityManifestEnvelope> {
  const host = resolveHost(options.host);
  const workspacePath = options.workspacePath ?? process.cwd();
  const now = new Date().toISOString();

  let hostedRecords: HostedCapabilityRecord[] = [];
  let envelopeSource: "hosted" | "local-extension" | "derived" = "hosted";

  if (!options.skipHosted) {
    hostedRecords = await fetchHostedCapabilities();
    if (hostedRecords.length === 0) {
      hostedRecords = await deriveCapabilitiesFromHostedWorkflows();
      if (hostedRecords.length > 0) envelopeSource = "derived";
    }
  }

  const hostedProvenance: ManifestProvenance = {
    originType: envelopeSource === "derived" ? "derived-from-workflow" : "hosted",
    sourceHost: host,
    recordedAt: now,
  };

  const hostedManifests: CapabilityManifest[] = hostedRecords
    .map(toCapabilityNode)
    .map((node) => toCapabilityManifest(node, hostedProvenance));

  const extensions = loadLocalExtensionManifests(workspacePath);
  const merged = mergeLocalExtensions(hostedManifests, extensions);

  if (hostedManifests.length === 0 && extensions.length > 0) {
    envelopeSource = "local-extension";
  }

  return {
    version: 1,
    host,
    fetchedAt: now,
    source: envelopeSource,
    capabilities: merged,
    provenance: {
      originType: envelopeSource === "derived" ? "derived-from-workflow" : envelopeSource === "local-extension" ? "local-extension" : "hosted",
      sourceHost: host,
      recordedAt: now,
    },
  };
}
