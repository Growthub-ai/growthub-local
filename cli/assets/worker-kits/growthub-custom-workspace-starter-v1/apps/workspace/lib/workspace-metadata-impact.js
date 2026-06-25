/**
 * Growthub Workspace Blast-Radius V1 — transitive impact deriver.
 *
 * Answers the one question the single-hop primitives cannot: *if I change (or
 * remove) this node, what is the FULL downstream set that goes stale?*
 *
 * The metadata graph (`workspace-metadata-graph.js`) already ships:
 *   - `findDependents(graph, nodeId)`  — the nodes ONE hop upstream (incoming edges)
 *   - `selectImpactedNodes(graph, nodeId)` (selectors) — a thin wrapper over it
 *
 * Both stop at the first hop. Editing a field surfaces the widgets that use it,
 * but NOT the dashboards that contain those widgets, nor the runs that executed
 * a workflow whose node reads the object. This module generalises
 * `findDependents` into its transitive closure: a deterministic breadth-first
 * walk of incoming edges, returning every reachable dependent with its hop
 * distance and the relation it was reached through.
 *
 * It is a PURE module — no React, no fetch, no fs, no writes, no localStorage,
 * no CSS. It introduces NO new graph, NO new mutation path: it reads the
 * read-only graph the Workspace Map already builds, and emits a low-entropy
 * view-model that the Map inspector, `patch/preflight`, the CLI `plan` command,
 * and an MCP `simulate_causal_impact` tool can all consume from one source of
 * truth. It contains no secrets — it carries only the same compact node
 * summaries the graph already exposes.
 *
 * Determinism: results are ordered (distance → type → id) and the BFS visits
 * each node once, so a cycle in the graph terminates and the output diffs
 * cleanly between calls.
 */

const BLAST_RADIUS_KIND = "growthub-workspace-blast-radius-v1";
const BLAST_RADIUS_VERSION = 1;

// Bound the walk so a pathological graph can never produce an unbounded
// payload. Honest truncation (`truncated: true`) beats a silent cap.
const DEFAULT_MAX_NODES = 500;

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function summarizeOrigin(node) {
  if (!node || typeof node !== "object") return null;
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    metadataId: node.metadataId
  };
}

/**
 * Build a `Map<toId, Array<{ from, relation }>>` of incoming edges once, so the
 * transitive walk is linear in (nodes + edges) instead of calling the O(N)
 * `findDependents` per visited node. This is the transitive form of
 * `findDependents`; the per-hop semantics are identical.
 */
function buildIncomingIndex(graph) {
  const incoming = new Map();
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  for (const edge of edges) {
    if (!edge || edge.from == null || edge.to == null) continue;
    const key = String(edge.to);
    if (!incoming.has(key)) incoming.set(key, []);
    incoming.get(key).push({ from: String(edge.from), relation: edge.relation });
  }
  return incoming;
}

/**
 * Compute the blast radius of a node — every node that transitively depends on
 * it (reverse edge closure).
 *
 * @param {object} graph    a `buildWorkspaceMetadataGraph` envelope
 * @param {string} originId the metadataId of the node being changed/removed
 * @param {object} [options]
 * @param {number} [options.maxNodes=500] hard cap on impacted nodes
 * @param {number} [options.maxDistance] optional hop limit (omit = unbounded)
 * @returns {object} `{ kind, version, origin, impacted[], byType, total, maxDistanceReached, truncated, summary, warnings }`
 */
function deriveBlastRadius(graph, originId, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes) && options.maxNodes > 0
    ? Math.floor(options.maxNodes)
    : DEFAULT_MAX_NODES;
  const maxDistance = Number.isFinite(options.maxDistance) && options.maxDistance > 0
    ? Math.floor(options.maxDistance)
    : Infinity;

  const empty = (warning) => ({
    kind: BLAST_RADIUS_KIND,
    version: BLAST_RADIUS_VERSION,
    origin: null,
    impacted: [],
    byType: {},
    total: 0,
    maxDistanceReached: 0,
    truncated: false,
    summary: "No impact computed.",
    warnings: warning ? [warning] : []
  });

  const id = safeString(originId).trim();
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    return empty("graph missing or malformed");
  }
  if (!id) return empty("originId missing");

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const originNode = nodesById.get(id);
  if (!originNode) return empty(`origin "${id}" not found in graph`);

  const incoming = buildIncomingIndex(graph);

  const visited = new Set([id]);
  const impacted = [];
  let truncated = false;
  let maxDistanceReached = 0;

  // FIFO queue → breadth-first, so the first time a node is reached is via its
  // shortest dependency path (the most direct reason it goes stale).
  const queue = [{ id, distance: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.distance >= maxDistance) continue;
    const dependents = incoming.get(current.id) || [];
    for (const { from, relation } of dependents) {
      if (visited.has(from)) continue;
      const node = nodesById.get(from);
      if (!node) continue;
      if (impacted.length >= maxNodes) {
        truncated = true;
        continue;
      }
      visited.add(from);
      const distance = current.distance + 1;
      maxDistanceReached = Math.max(maxDistanceReached, distance);
      impacted.push({
        id: node.id,
        type: node.type,
        label: node.label,
        metadataId: node.metadataId,
        distance,
        viaRelation: relation
      });
      queue.push({ id: from, distance });
    }
  }

  // Deterministic order: nearest first, then by type, then by id.
  impacted.sort((a, b) =>
    a.distance - b.distance ||
    a.type.localeCompare(b.type) ||
    a.id.localeCompare(b.id)
  );

  const byType = {};
  for (const entry of impacted) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
  }

  return {
    kind: BLAST_RADIUS_KIND,
    version: BLAST_RADIUS_VERSION,
    origin: summarizeOrigin(originNode),
    impacted,
    byType,
    total: impacted.length,
    maxDistanceReached,
    truncated,
    summary: summarizeBlastRadius(originNode, impacted, byType, truncated),
    warnings: []
  };
}

/**
 * One human sentence for the inspector chip / PR comment / CLI line.
 * Pure string assembly — never throws.
 */
function summarizeBlastRadius(originNode, impacted, byType, truncated) {
  const label = originNode?.label || originNode?.id || "node";
  if (!impacted.length) {
    return `Changing "${label}" has no downstream impact — nothing depends on it.`;
  }
  const parts = Object.keys(byType)
    .sort()
    .map((type) => `${byType[type]} ${type}`);
  const tail = truncated ? " (truncated)" : "";
  return `Changing "${label}" affects ${impacted.length} downstream node(s): ${parts.join(", ")}${tail}.`;
}

export {
  BLAST_RADIUS_KIND,
  BLAST_RADIUS_VERSION,
  DEFAULT_MAX_NODES,
  deriveBlastRadius,
  summarizeBlastRadius
};
