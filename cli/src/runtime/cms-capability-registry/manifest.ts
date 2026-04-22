/**
 * CMS Capability Manifest — canonical hashing + envelope helpers.
 *
 * The manifest envelope mirrors `@growthub/api-contract/manifest` and
 * is shared by:
 *   - hosted /api/cli/capabilities (wire response)
 *   - local TTL cache (on-disk representation)
 *   - `growthub capability diff` (drift detection)
 */

import crypto from "node:crypto";
import type {
  CmsCapabilityNode,
  CapabilityFamily,
} from "@growthub/api-contract/capabilities";
import type {
  CapabilityManifestEnvelope,
  CapabilityManifestMeta,
  ManifestDriftReport,
  ManifestDriftSeverity,
} from "@growthub/api-contract/manifest";

export type {
  CapabilityManifestEnvelope,
  CapabilityManifestMeta,
  LocalCapabilityExtension,
  ManifestDriftReport,
  ManifestDriftSeverity,
} from "@growthub/api-contract/manifest";

/**
 * Deterministic hash over the node list. Two envelopes built from the same
 * node contents hash identically regardless of input ordering.
 */
export function hashCapabilityNodes(nodes: CmsCapabilityNode[]): string {
  const sortable = nodes.map((node) => normalizeForHash(node));
  sortable.sort((a, b) => a.slug.localeCompare(b.slug));
  const canonical = JSON.stringify(sortable);
  return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

function normalizeForHash(node: CmsCapabilityNode): Record<string, unknown> {
  // Provenance + enabled flags are operator-scoped; strip them for the
  // registry identity hash so moving a fork between machines doesn't
  // flip the hash.
  return {
    slug: node.slug,
    displayName: node.displayName,
    icon: node.icon,
    family: node.family,
    category: node.category,
    nodeType: node.nodeType,
    executionKind: node.executionKind,
    executionBinding: node.executionBinding,
    executionTokens: node.executionTokens,
    requiredBindings: [...node.requiredBindings].sort(),
    outputTypes: [...node.outputTypes].sort(),
    experimental: node.experimental,
    visibility: node.visibility,
    description: node.description ?? "",
  };
}

export function buildCapabilityManifestEnvelope(
  nodes: CmsCapabilityNode[],
  opts: {
    sourceUrl: string;
    publishedAt?: string;
    fetchedAt?: string;
    suggestedTtlSeconds?: number;
  },
): CapabilityManifestEnvelope {
  const registryHash = hashCapabilityNodes(nodes);
  const familyCounts: Partial<Record<CapabilityFamily, number>> = {};
  for (const node of nodes) {
    familyCounts[node.family] = (familyCounts[node.family] ?? 0) + 1;
  }

  const meta: CapabilityManifestMeta = {
    sourceUrl: opts.sourceUrl,
    publishedAt: opts.publishedAt,
    fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
    registryHash,
    nodeCount: nodes.length,
    enabledCount: nodes.filter((n) => n.enabled).length,
    familyCounts,
    suggestedTtlSeconds: opts.suggestedTtlSeconds,
  };

  return {
    version: 1,
    meta,
    nodes,
  };
}

/**
 * Compare two envelopes and describe the drift between them. Useful for
 * `growthub capability diff` and CI gates that ship with a pinned
 * registry hash.
 */
export function computeManifestDrift(
  local: CapabilityManifestEnvelope | null,
  remote: CapabilityManifestEnvelope,
): ManifestDriftReport {
  const evaluatedAt = new Date().toISOString();
  const remoteHash = remote.meta.registryHash;
  const localHash = local?.meta.registryHash ?? "";

  if (!local) {
    return {
      severity: "hash-mismatch",
      addedSlugs: remote.nodes.map((n) => n.slug),
      removedSlugs: [],
      mutatedSlugs: [],
      localHash,
      remoteHash,
      evaluatedAt,
    };
  }

  if (localHash === remoteHash) {
    return {
      severity: "none",
      addedSlugs: [],
      removedSlugs: [],
      mutatedSlugs: [],
      localHash,
      remoteHash,
      evaluatedAt,
    };
  }

  const localBySlug = new Map(local.nodes.map((n) => [n.slug, n]));
  const remoteBySlug = new Map(remote.nodes.map((n) => [n.slug, n]));

  const addedSlugs: string[] = [];
  const removedSlugs: string[] = [];
  const mutatedSlugs: string[] = [];

  for (const slug of remoteBySlug.keys()) {
    if (!localBySlug.has(slug)) addedSlugs.push(slug);
  }
  for (const slug of localBySlug.keys()) {
    if (!remoteBySlug.has(slug)) removedSlugs.push(slug);
  }
  for (const [slug, node] of remoteBySlug) {
    const prior = localBySlug.get(slug);
    if (!prior) continue;
    if (hashCapabilityNodes([prior]) !== hashCapabilityNodes([node])) {
      mutatedSlugs.push(slug);
    }
  }

  const severity: ManifestDriftSeverity = addedSlugs.length
    ? "node-added"
    : removedSlugs.length
      ? "node-removed"
      : mutatedSlugs.length
        ? "node-mutated"
        : "hash-mismatch";

  return {
    severity,
    addedSlugs: addedSlugs.sort(),
    removedSlugs: removedSlugs.sort(),
    mutatedSlugs: mutatedSlugs.sort(),
    localHash,
    remoteHash,
    evaluatedAt,
  };
}
