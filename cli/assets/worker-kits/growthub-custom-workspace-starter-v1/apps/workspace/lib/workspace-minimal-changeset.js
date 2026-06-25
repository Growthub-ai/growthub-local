/**
 * Growthub Workspace Minimal-ChangeSet V1 — the inverse of blast radius.
 *
 * Blast radius answers "if I change X, what goes stale?". This answers the
 * inverse planning question: "to make TARGET fresh/correct, what is the
 * smallest set of upstream nodes I must change first?".
 *
 * Honesty first: a provably-minimal set over an arbitrary graph is a search
 * problem. This V1 derives a SOUND, BOUNDED heuristic set — the upstream
 * sources on the target's provenance frontier — and labels it as such
 * (`optimal: false`). It composes the shipped derivers, builds NO new graph,
 * mutates nothing, exposes no secrets:
 *   - `deriveProvenanceLineage(target, { direction: "dependencies" })` → the
 *     transitive set the target depends on (its dependency cone — outgoing
 *     edges, what it is built from), since an edge A→B means "A depends on B".
 *   - the FRONTIER of that cone (the deepest dependency nodes, or the typed roots
 *     — sources / integrations / inputs) is the minimal change set: changing a
 *     frontier node is necessary; changing an interior node alone cannot fix a
 *     target whose staleness originates upstream of it.
 *   - `deriveBlastRadius` on each candidate confirms the target is actually in
 *     that candidate's downstream (soundness check), and reports the collateral
 *     surfaces each change would also touch (the cost of the fix).
 */

import { deriveProvenanceLineage } from "./workspace-provenance-lineage.js";
import { deriveBlastRadius } from "./workspace-metadata-impact.js";

const MIN_CHANGESET_KIND = "growthub-workspace-minimal-changeset-v1";
const MIN_CHANGESET_VERSION = 1;

// Node types that are typed "roots" of a provenance cone — changing the data at
// these is what actually refreshes everything downstream.
const ROOT_TYPES = new Set(["sourceRecord", "integration", "integrationEntity", "runInput"]);

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function summarizeNode(node) {
  if (!node || typeof node !== "object") return null;
  return { id: node.id, type: node.type, label: node.label, metadataId: node.metadataId };
}

/**
 * @param {object} graph a `buildWorkspaceMetadataGraph` envelope
 * @param {string} targetId the node you want fresh/correct
 * @param {object} [options]
 * @param {number} [options.maxNodes=500]
 * @returns {object} `{ kind, version, target, changeSet[], optimal, total, summary, warnings }`
 */
function deriveMinimalChangeSet(graph, targetId, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes) && options.maxNodes > 0
    ? Math.floor(options.maxNodes)
    : 500;

  const empty = (warning) => ({
    kind: MIN_CHANGESET_KIND,
    version: MIN_CHANGESET_VERSION,
    target: null,
    changeSet: [],
    optimal: false,
    total: 0,
    summary: "No change set computed.",
    warnings: warning ? [warning] : []
  });

  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    return empty("graph missing or malformed");
  }
  const id = safeString(targetId).trim();
  if (!id) return empty("targetId missing");

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const targetNode = nodesById.get(id);
  if (!targetNode) return empty(`target "${id}" not found in graph`);

  // 1. Dependency cone (what the target depends on — outgoing closure).
  const lineage = deriveProvenanceLineage(graph, id, { direction: "dependencies", maxNodes });
  const cone = lineage.dependencies;
  if (!cone.length) {
    const out = empty();
    out.target = summarizeNode(targetNode);
    out.summary = `"${targetNode.label || id}" depends on nothing upstream — change it directly.`;
    out.changeSet = [{ ...summarizeNode(targetNode), reason: "self (no upstream dependency)", collateral: 0 }];
    out.total = 1;
    return out;
  }

  // 2. Frontier = typed roots in the cone if any, else the deepest nodes.
  const roots = cone.filter((n) => ROOT_TYPES.has(n.type));
  let frontier = roots;
  if (!frontier.length) {
    const maxDistance = cone.reduce((m, n) => Math.max(m, n.distance), 0);
    frontier = cone.filter((n) => n.distance === maxDistance);
  }

  // 3. Soundness + cost: each frontier change must actually reach the target;
  //    its blast radius is the collateral cost of making that change.
  const changeSet = [];
  for (const candidate of frontier) {
    const blast = deriveBlastRadius(graph, candidate.id, { maxNodes });
    const reachesTarget = blast.impacted.some((n) => n.id === id);
    if (!reachesTarget) continue;
    changeSet.push({
      ...summarizeNode(nodesById.get(candidate.id)),
      reason: ROOT_TYPES.has(candidate.type) ? `root ${candidate.type} feeding the target` : "deepest upstream dependency",
      distanceToTarget: candidate.distance,
      collateral: blast.total
    });
  }

  changeSet.sort((a, b) =>
    a.collateral - b.collateral ||
    a.type.localeCompare(b.type) ||
    a.id.localeCompare(b.id)
  );

  return {
    kind: MIN_CHANGESET_KIND,
    version: MIN_CHANGESET_VERSION,
    target: summarizeNode(targetNode),
    changeSet,
    optimal: false,
    total: changeSet.length,
    summary: summarizeChangeSet(targetNode, changeSet),
    warnings: changeSet.length ? [] : ["no frontier node reaches the target — graph may be disconnected"]
  };
}

function summarizeChangeSet(targetNode, changeSet) {
  const label = targetNode?.label || targetNode?.id || "target";
  if (!changeSet.length) {
    return `No upstream change reaches "${label}" — it may already be a root, or the graph is disconnected.`;
  }
  const parts = changeSet.slice(0, 3).map((c) => `${c.type} "${c.label || c.id}"`);
  const more = changeSet.length > 3 ? `, +${changeSet.length - 3} more` : "";
  return `To refresh "${label}", change ${changeSet.length} upstream node(s) (heuristic, not provably minimal): ${parts.join(", ")}${more}.`;
}

export {
  MIN_CHANGESET_KIND,
  MIN_CHANGESET_VERSION,
  ROOT_TYPES,
  deriveMinimalChangeSet,
  summarizeChangeSet
};
