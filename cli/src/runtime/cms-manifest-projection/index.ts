/**
 * CMS Manifest Projection
 *
 * Phase B primitive: projects a `CapabilityManifestEnvelope` (canonical
 * contract truth) into the CLI's existing `CmsCapabilityNode` shape so
 * the rest of the CLI registry / discovery / configure paths do not
 * need to be rewritten.
 *
 * Rules (Phase B, locked):
 *   - preserve provenance — `manifestMetadata.__provenance`
 *   - preserve the hosted input schema — `manifestMetadata.inputSchema`
 *     (this is what B6 reads as "hosted field-definition truth")
 *   - preserve the hosted output schema — `manifestMetadata.outputSchema`
 *   - preserve provider + execution hints under the same prefix
 *   - do not mutate the manifest capability node; if the manifest entry
 *     ships a complete node, use it as the base and only decorate
 *     `manifestMetadata`.
 *
 * Non-goals:
 *   - this projection does not validate / normalize the envelope
 *     (that is `cms-manifest-client`'s job).
 *   - this projection does not diff cached state (`cms-manifest-diff`).
 */

import type {
  CapabilityFamily as PublicCapabilityFamily,
  CapabilityManifest,
  CapabilityManifestEnvelope,
  CapabilityNode as PublicCapabilityNode,
  ManifestProvenance,
} from "@growthub/api-contract";
import {
  CAPABILITY_FAMILIES,
  type CmsCapabilityNode,
  type CapabilityFamily,
} from "../cms-capability-registry/index.js";

// ---------------------------------------------------------------------------
// Family coercion
// ---------------------------------------------------------------------------

function coerceFamily(value: PublicCapabilityFamily | string): CapabilityFamily {
  const known = CAPABILITY_FAMILIES as readonly string[];
  if (known.includes(value as CapabilityFamily)) {
    return value as CapabilityFamily;
  }
  return "ops";
}

// ---------------------------------------------------------------------------
// Metadata merge
// ---------------------------------------------------------------------------

function buildManifestMetadata(
  baseMetadata: Record<string, unknown> | undefined,
  entry: CapabilityManifest,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...(baseMetadata ?? {}),
  };

  if (entry.inputSchema) merged.inputSchema = entry.inputSchema;
  if (entry.outputSchema) merged.outputSchema = entry.outputSchema;
  if (entry.providerHints) merged.providerHints = entry.providerHints;
  if (entry.executionHints) merged.executionHints = entry.executionHints;
  merged.__provenance = entry.provenance satisfies ManifestProvenance;

  return merged;
}

// ---------------------------------------------------------------------------
// Entry → node projection
// ---------------------------------------------------------------------------

function projectEntry(entry: CapabilityManifest): CmsCapabilityNode {
  const node = entry.node as PublicCapabilityNode;
  const family = coerceFamily(entry.family);

  return {
    slug: entry.slug,
    displayName: node?.displayName ?? entry.displayName,
    icon: typeof node?.icon === "string" ? node.icon : "",
    family,
    category: typeof node?.category === "string" ? node.category : "automation",
    nodeType: (node?.nodeType ?? "tool_execution") as CmsCapabilityNode["nodeType"],
    executionKind: entry.executionKind,
    executionBinding: node?.executionBinding ?? {
      type: "mcp_tool_call",
      strategy: "direct",
    },
    executionTokens: node?.executionTokens ?? {
      tool_name: entry.slug,
      input_template: {},
      output_mapping: {},
    },
    requiredBindings: entry.requiredBindings,
    outputTypes: entry.outputTypes,
    enabled: typeof node?.enabled === "boolean" ? node.enabled : true,
    experimental: typeof node?.experimental === "boolean" ? node.experimental : false,
    visibility: (node?.visibility ?? "authenticated") as CmsCapabilityNode["visibility"],
    description: typeof node?.description === "string" ? node.description : undefined,
    manifestMetadata: buildManifestMetadata(node?.manifestMetadata as Record<string, unknown> | undefined, entry),
  };
}

// ---------------------------------------------------------------------------
// Envelope → nodes projection
// ---------------------------------------------------------------------------

export interface ProjectedRegistry {
  nodes: CmsCapabilityNode[];
  host: string;
  fetchedAt: string;
  source: CapabilityManifestEnvelope["source"];
}

export function projectManifestEnvelope(envelope: CapabilityManifestEnvelope): ProjectedRegistry {
  const seen = new Set<string>();
  const nodes: CmsCapabilityNode[] = [];

  for (const entry of envelope.capabilities) {
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    nodes.push(projectEntry(entry));
  }

  return {
    nodes,
    host: envelope.host,
    fetchedAt: envelope.fetchedAt,
    source: envelope.source,
  };
}

// ---------------------------------------------------------------------------
// Accessors for consumers that want schema / provenance back from a node
// ---------------------------------------------------------------------------

/**
 * Extract the hosted input schema (if any) from a projected node.
 *
 * Consumers (B6 configure path, `introspectNodeContract`) use this to prefer
 * hosted schema truth over locally-inferred `input_template` heuristics.
 */
export function readProjectedInputSchema(node: CmsCapabilityNode): unknown {
  return node.manifestMetadata?.inputSchema;
}

/**
 * Extract the hosted output schema (if any) from a projected node.
 */
export function readProjectedOutputSchema(node: CmsCapabilityNode): unknown {
  return node.manifestMetadata?.outputSchema;
}

/**
 * Extract the provenance marker (if any) from a projected node.
 */
export function readProjectedProvenance(node: CmsCapabilityNode): ManifestProvenance | undefined {
  const provenance = node.manifestMetadata?.__provenance;
  if (!provenance || typeof provenance !== "object") return undefined;
  return provenance as ManifestProvenance;
}
