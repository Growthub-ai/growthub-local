/**
 * Growthub Workspace Provenance-Lineage V1 — bidirectional lineage deriver.
 *
 * The mirror twin of `deriveBlastRadius`. It exposes BOTH transitive directions
 * over the SAME edge taxonomy, named to MATCH the graph's own helper contract
 * (`findDependents` = incoming, `findDependencies` = outgoing) so an agent never
 * mis-reads a consumer as a producer:
 *
 *   - dependents    — transitive INCOMING closure (generalises `findDependents`):
 *                     the nodes that DEPEND ON this node — its consumers and the
 *                     things impacted if it changes (e.g. a widget that binds an
 *                     object is the object's dependent). "What depends on this?"
 *   - dependencies  — transitive OUTGOING closure (generalises `findDependencies`):
 *                     the nodes this one DEPENDS ON — what it is built from /
 *                     reads (e.g. an object's source record). "What does this
 *                     depend on?"
 *
 * `ancestors` / `descendants` are kept ONLY as backward-compatible aliases of
 * `dependents` / `dependencies` respectively — they read intuitively for the
 * run→artifact case but mislead for objects/widgets/dashboards, so prefer the
 * canonical names. The `direction` option accepts `dependents` | `dependencies`
 * | `both` (and the legacy `ancestors` | `descendants`).
 *
 * One bounded, cycle-safe, deterministic BFS — the same skeleton the spine uses.
 * No new graph, no new edges, no mutation, no secrets. `selectRunLineage` is the
 * flat single-run ancestor of this module.
 */

import { summarizeGraphNode } from "./workspace-metadata-graph.js";
import { deriveBlastRadius } from "./workspace-metadata-impact.js";

const PROVENANCE_KIND = "growthub-workspace-provenance-lineage-v1";
const PROVENANCE_VERSION = 1;

const DEFAULT_MAX_NODES = 500;

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Build the OUTGOING adjacency index once: `Map<fromId, Array<{ to, relation }>>`.
 * (The INCOMING/dependents direction is NOT re-implemented here — it reuses the
 * shipped `deriveBlastRadius` reverse closure, the single source of truth for
 * incoming-edge traversal.)
 */
function buildOutgoingIndex(graph) {
  const adjacency = new Map();
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  for (const edge of edges) {
    if (!edge || edge.from == null || edge.to == null) continue;
    const key = String(edge.from);
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key).push({ to: String(edge.to), relation: edge.relation });
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
 * @param {"dependents"|"dependencies"|"both"|"ancestors"|"descendants"} [options.direction="both"]
 * @param {number} [options.maxNodes=500] hard cap PER direction
 * @returns {object} `{ kind, version, origin, direction, dependents[], dependencies[],
 *   ancestors[] (alias of dependents), descendants[] (alias of dependencies),
 *   byType, truncated, summary, warnings }`
 */
function deriveProvenanceLineage(graph, originId, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes) && options.maxNodes > 0
    ? Math.floor(options.maxNodes)
    : DEFAULT_MAX_NODES;
  // Normalise the requested direction to the canonical names (legacy aliases
  // ancestors→dependents, descendants→dependencies).
  const requested = safeString(options.direction) || "both";
  const direction = requested === "ancestors" ? "dependents"
    : requested === "descendants" ? "dependencies"
      : ["dependents", "dependencies", "both"].includes(requested) ? requested
        : "both";

  const empty = (warning) => ({
    kind: PROVENANCE_KIND,
    version: PROVENANCE_VERSION,
    origin: null,
    direction,
    dependents: [],
    dependencies: [],
    ancestors: [],
    descendants: [],
    byType: { dependents: {}, dependencies: {} },
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

  let dependents = [];
  let dependencies = [];
  let truncated = false;

  if (direction === "dependents" || direction === "both") {
    // Reuse the spine — `dependents` IS the transitive incoming (reverse) closure
    // that deriveBlastRadius already computes. No second incoming BFS.
    const blast = deriveBlastRadius(graph, id, { maxNodes });
    dependents = blast.impacted;
    truncated = truncated || blast.truncated;
  }
  if (direction === "dependencies" || direction === "both") {
    const res = walk(buildOutgoingIndex(graph), nodesById, id, maxNodes);
    dependencies = res.reached;
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
    // Canonical names — match findDependents (incoming) / findDependencies (outgoing).
    dependents,
    dependencies,
    // Backward-compatible aliases (deprecated; can mislead for non-run nodes).
    ancestors: dependents,
    descendants: dependencies,
    byType: { dependents: countByType(dependents), dependencies: countByType(dependencies) },
    truncated,
    summary: summarizeLineage(originNode, dependents, dependencies, direction, truncated),
    warnings: []
  };
}

function summarizeLineage(originNode, dependents, dependencies, direction, truncated) {
  const label = originNode?.label || originNode?.id || "node";
  const tail = truncated ? " (truncated)" : "";
  if (direction === "dependents") {
    return dependents.length
      ? `${dependents.length} node(s) depend on "${label}"${tail}.`
      : `Nothing depends on "${label}".`;
  }
  if (direction === "dependencies") {
    return dependencies.length
      ? `"${label}" depends on ${dependencies.length} node(s)${tail}.`
      : `"${label}" depends on nothing.`;
  }
  return `"${label}": ${dependents.length} dependent(s), ${dependencies.length} dependenc(ies)${tail}.`;
}

export {
  PROVENANCE_KIND,
  PROVENANCE_VERSION,
  DEFAULT_MAX_NODES,
  deriveProvenanceLineage,
  summarizeLineage
};
