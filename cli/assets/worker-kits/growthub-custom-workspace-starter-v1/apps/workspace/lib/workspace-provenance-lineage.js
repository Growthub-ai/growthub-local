/**
 * Growthub Workspace Provenance-Lineage V1 — bidirectional lineage deriver.
 *
 * The mirror twin of `deriveBlastRadius`. Blast radius walks INCOMING edges
 * (reverse closure) to answer "what depends on X?". Lineage exposes BOTH
 * transitive directions over the SAME edge taxonomy:
 *
 *   - ancestors   — transitive INCOMING closure: the nodes that reference,
 *                   produce, or contribute to this node's current state
 *                   (e.g. for an output artifact: the run that produced it, the
 *                   workflow that ran, the sandbox/agent host, the inputs it
 *                   consumed). This answers "what led to this?".
 *   - descendants — transitive OUTGOING closure: the nodes this one feeds or
 *                   depends on downstream. This answers "what does this reach?".
 *
 * It reuses the per-hop semantics of the shipped `findDependents` (incoming)
 * and `findDependencies` (outgoing) and generalises them to their transitive
 * closure with one bounded, cycle-safe, deterministic BFS — the same skeleton
 * the spine uses. No new graph, no new edges, no mutation, no secrets.
 *
 * `selectRunLineage` is the flat, single-run ancestor of this module; this is
 * its transitive generalisation across every node type and the full edge set.
 */

import { summarizeGraphNode } from "./workspace-metadata-graph.js";

const PROVENANCE_KIND = "growthub-workspace-provenance-lineage-v1";
const PROVENANCE_VERSION = 1;

const DEFAULT_MAX_NODES = 500;

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Build a directional adjacency index once: `Map<nodeId, Array<{ to, relation }>>`
 * where `to` is the neighbour reached by following `direction`.
 *   - "incoming": neighbours are edge.from for every edge whose edge.to === id
 *   - "outgoing": neighbours are edge.to   for every edge whose edge.from === id
 */
function buildAdjacency(graph, direction) {
  const adjacency = new Map();
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  for (const edge of edges) {
    if (!edge || edge.from == null || edge.to == null) continue;
    const key = direction === "incoming" ? String(edge.to) : String(edge.from);
    const neighbour = direction === "incoming" ? String(edge.from) : String(edge.to);
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key).push({ to: neighbour, relation: edge.relation });
  }
  return adjacency;
}

/**
 * Bounded, cycle-safe BFS from `originId` over a pre-built adjacency index.
 * Mirrors the blast-radius walk: FIFO queue → shortest path first, each node
 * visited once, honest truncation past `maxNodes`.
 */
function walk(adjacency, nodesById, originId, maxNodes) {
  const visited = new Set([originId]);
  const reached = [];
  let truncated = false;
  let maxDistanceReached = 0;
  const queue = [{ id: originId, distance: 0 }];
  while (queue.length) {
    const current = queue.shift();
    const neighbours = adjacency.get(current.id) || [];
    for (const { to, relation } of neighbours) {
      if (visited.has(to)) continue;
      const node = nodesById.get(to);
      if (!node) continue;
      if (reached.length >= maxNodes) {
        truncated = true;
        continue;
      }
      visited.add(to);
      const distance = current.distance + 1;
      maxDistanceReached = Math.max(maxDistanceReached, distance);
      reached.push({
        id: node.id,
        type: node.type,
        label: node.label,
        metadataId: node.metadataId,
        distance,
        viaRelation: relation
      });
      queue.push({ id: to, distance });
    }
  }
  reached.sort((a, b) =>
    a.distance - b.distance ||
    a.type.localeCompare(b.type) ||
    a.id.localeCompare(b.id)
  );
  return { reached, truncated, maxDistanceReached };
}

/**
 * @param {object} graph a `buildWorkspaceMetadataGraph` envelope
 * @param {string} originId the metadataId to trace lineage for
 * @param {object} [options]
 * @param {"ancestors"|"descendants"|"both"} [options.direction="both"]
 * @param {number} [options.maxNodes=500] hard cap PER direction
 * @returns {object} `{ kind, version, origin, ancestors[], descendants[], byType, truncated, summary, warnings }`
 */
function deriveProvenanceLineage(graph, originId, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes) && options.maxNodes > 0
    ? Math.floor(options.maxNodes)
    : DEFAULT_MAX_NODES;
  const direction = ["ancestors", "descendants", "both"].includes(options.direction)
    ? options.direction
    : "both";

  const empty = (warning) => ({
    kind: PROVENANCE_KIND,
    version: PROVENANCE_VERSION,
    origin: null,
    direction,
    ancestors: [],
    descendants: [],
    byType: { ancestors: {}, descendants: {} },
    truncated: false,
    summary: "No lineage computed.",
    warnings: warning ? [warning] : []
  });

  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    return empty("graph missing or malformed");
  }
  const id = safeString(originId).trim();
  if (!id) return empty("originId missing");

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const originNode = nodesById.get(id);
  if (!originNode) return empty(`origin "${id}" not found in graph`);

  let ancestors = [];
  let descendants = [];
  let truncated = false;

  if (direction === "ancestors" || direction === "both") {
    const res = walk(buildAdjacency(graph, "incoming"), nodesById, id, maxNodes);
    ancestors = res.reached;
    truncated = truncated || res.truncated;
  }
  if (direction === "descendants" || direction === "both") {
    const res = walk(buildAdjacency(graph, "outgoing"), nodesById, id, maxNodes);
    descendants = res.reached;
    truncated = truncated || res.truncated;
  }

  const countByType = (entries) => {
    const out = {};
    for (const entry of entries) out[entry.type] = (out[entry.type] || 0) + 1;
    return out;
  };

  return {
    kind: PROVENANCE_KIND,
    version: PROVENANCE_VERSION,
    origin: summarizeGraphNode(originNode),
    direction,
    ancestors,
    descendants,
    byType: { ancestors: countByType(ancestors), descendants: countByType(descendants) },
    truncated,
    summary: summarizeLineage(originNode, ancestors, descendants, direction, truncated),
    warnings: []
  };
}

function summarizeLineage(originNode, ancestors, descendants, direction, truncated) {
  const label = originNode?.label || originNode?.id || "node";
  const tail = truncated ? " (truncated)" : "";
  if (direction === "ancestors") {
    return ancestors.length
      ? `"${label}" derives from ${ancestors.length} upstream node(s)${tail}.`
      : `"${label}" has no recorded upstream lineage.`;
  }
  if (direction === "descendants") {
    return descendants.length
      ? `"${label}" feeds ${descendants.length} downstream node(s)${tail}.`
      : `"${label}" feeds nothing downstream.`;
  }
  return `"${label}": ${ancestors.length} upstream, ${descendants.length} downstream node(s)${tail}.`;
}

export {
  PROVENANCE_KIND,
  PROVENANCE_VERSION,
  DEFAULT_MAX_NODES,
  deriveProvenanceLineage,
  summarizeLineage
};
