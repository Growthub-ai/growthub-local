/**
 * Growthub Workspace Stale-Surfaces V1 — freshness-aware impact deriver.
 *
 * Answers the question the spine (`deriveBlastRadius`) cannot answer on its
 * own: *given the changes the graph already records, which downstream surfaces
 * are stale RIGHT NOW?* — with no change-event argument required.
 *
 * The metadata graph already timestamps the only nodes whose freshness is
 * observable: `run.ranAt`, `sourceRecord.fetchedAt`, and
 * `pipelineHealth.latestRanAt`. When one of those upstream nodes changes, the
 * surfaces that DEPEND on it (its reverse-edge closure) are the surfaces now
 * showing old data. This module seeds the EXISTING `deriveBlastRadius` closure
 * from those freshly-changed nodes and labels the reachable dependents stale.
 *
 * It builds NO new graph and NO second traversal engine — it composes the
 * shipped blast-radius deriver and the timestamps the graph already carries.
 * Pure: no React, no fetch, no fs, no writes, no secrets. Deterministic:
 * results are ordered (distance → type → id) and the union de-duplicates, so
 * the output diffs cleanly between calls.
 *
 * Relationship to `selectStaleMetadataGroups` (single-hop, group-level): that
 * selector answers "given THIS change event, which metadata GROUPS reload?".
 * This deriver answers "given the timestamps already in the graph, which
 * specific NODES are stale, transitively?". They are complementary; this one
 * is node-level and needs no caller-supplied event.
 */

import { deriveBlastRadius } from "./workspace-metadata-impact.js";

const STALE_SURFACES_KIND = "growthub-workspace-stale-surfaces-v1";
const STALE_SURFACES_VERSION = 1;

const DEFAULT_MAX_NODES = 500;

// Summary fields that observably timestamp a node's last refresh. Ordered by
// the precision of "this node changed at T". The newest of these wins.
const FRESHNESS_FIELDS = ["ranAt", "fetchedAt", "latestRanAt"];

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Parse a node's last-known-fresh timestamp (ms epoch) from its summary, or
 * null when the node carries no observable freshness. Never throws.
 */
function nodeFreshAt(node) {
  const summary = node && typeof node === "object" ? node.summary : null;
  if (!summary || typeof summary !== "object") return null;
  let newest = null;
  for (const field of FRESHNESS_FIELDS) {
    const raw = summary[field];
    if (!raw) continue;
    const ms = Date.parse(safeString(raw));
    if (Number.isNaN(ms)) continue;
    if (newest == null || ms > newest) newest = ms;
  }
  return newest;
}

/**
 * Compute the surfaces that are stale given the freshness already recorded in
 * the graph.
 *
 * @param {object} graph a `buildWorkspaceMetadataGraph` envelope
 * @param {object} [options]
 * @param {string|number} [options.since] only treat nodes changed at/after
 *        this instant (ISO string or ms epoch) as seeds. Omit to seed from
 *        every node that carries a freshness timestamp.
 * @param {string[]} [options.seedIds] explicit seed node ids (e.g. the nodes a
 *        just-applied PATCH touched). When given, `since` is ignored and these
 *        ids are the change set — this is the preflight/`plan` entry point.
 * @param {number} [options.maxNodes=500] hard cap on stale surfaces.
 * @returns {object} `{ kind, version, since, seeds[], staleSurfaces[], byType, total, truncated, summary, warnings }`
 */
function deriveStaleSurfaces(graph, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes) && options.maxNodes > 0
    ? Math.floor(options.maxNodes)
    : DEFAULT_MAX_NODES;

  const empty = (warning) => ({
    kind: STALE_SURFACES_KIND,
    version: STALE_SURFACES_VERSION,
    since: null,
    seeds: [],
    staleSurfaces: [],
    byType: {},
    total: 0,
    truncated: false,
    summary: "No stale surfaces computed.",
    warnings: warning ? [warning] : []
  });

  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    return empty("graph missing or malformed");
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  // ── Resolve the change set (the seeds) ──────────────────────────────────
  let sinceMs = null;
  let seeds = [];
  const explicit = Array.isArray(options.seedIds) ? options.seedIds.map(safeString).filter(Boolean) : null;

  if (explicit && explicit.length) {
    for (const id of explicit) {
      const node = nodesById.get(id);
      if (node) seeds.push({ node, changedAtMs: nodeFreshAt(node) });
    }
  } else {
    if (options.since != null) {
      const raw = options.since;
      sinceMs = typeof raw === "number" ? raw : Date.parse(safeString(raw));
      if (Number.isNaN(sinceMs)) sinceMs = null;
    }
    for (const node of graph.nodes) {
      const changedAtMs = nodeFreshAt(node);
      if (changedAtMs == null) continue;
      if (sinceMs != null && changedAtMs < sinceMs) continue;
      seeds.push({ node, changedAtMs });
    }
  }

  if (!seeds.length) {
    const out = empty();
    out.since = sinceMs;
    out.summary = "No recently-changed nodes — nothing is stale.";
    return out;
  }

  // ── Union the reverse closures of every seed (reuse the spine) ──────────
  // A downstream node is stale relative to a seed when its own last-fresh
  // timestamp predates the seed's change (or it carries none — it cannot prove
  // freshness, so it is reported stale honestly rather than silently fresh).
  const staleById = new Map();
  for (const { node: seedNode, changedAtMs } of seeds) {
    const blast = deriveBlastRadius(graph, seedNode.id, { maxNodes });
    for (const impacted of blast.impacted) {
      const target = nodesById.get(impacted.id);
      const targetFreshAt = nodeFreshAt(target);
      const isStale = changedAtMs == null
        ? true
        : targetFreshAt == null || targetFreshAt < changedAtMs;
      if (!isStale) continue;
      const existing = staleById.get(impacted.id);
      // Keep the nearest / most-recent reason for each stale surface.
      if (!existing || impacted.distance < existing.distance) {
        staleById.set(impacted.id, {
          id: impacted.id,
          type: impacted.type,
          label: impacted.label,
          metadataId: impacted.metadataId,
          distance: impacted.distance,
          viaRelation: impacted.viaRelation,
          staleSinceSeed: seedNode.id,
          lastFreshAt: targetFreshAt != null ? new Date(targetFreshAt).toISOString() : null
        });
      }
    }
  }

  let staleSurfaces = Array.from(staleById.values());
  let truncated = false;
  if (staleSurfaces.length > maxNodes) {
    staleSurfaces = staleSurfaces.slice(0, maxNodes);
    truncated = true;
  }

  staleSurfaces.sort((a, b) =>
    a.distance - b.distance ||
    a.type.localeCompare(b.type) ||
    a.id.localeCompare(b.id)
  );

  const byType = {};
  for (const entry of staleSurfaces) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
  }

  return {
    kind: STALE_SURFACES_KIND,
    version: STALE_SURFACES_VERSION,
    since: sinceMs,
    seeds: seeds.map(({ node }) => ({ id: node.id, type: node.type, label: node.label, metadataId: node.metadataId })),
    staleSurfaces,
    byType,
    total: staleSurfaces.length,
    truncated,
    summary: summarizeStaleSurfaces(seeds, staleSurfaces, byType, truncated),
    warnings: []
  };
}

/**
 * One human sentence for the inspector chip / preflight line / CLI output.
 * Pure string assembly — never throws.
 */
function summarizeStaleSurfaces(seeds, staleSurfaces, byType, truncated) {
  if (!staleSurfaces.length) {
    return `${seeds.length} recent change(s) — no downstream surface is stale.`;
  }
  const parts = Object.keys(byType)
    .sort()
    .map((type) => `${byType[type]} ${type}`);
  const tail = truncated ? " (truncated)" : "";
  return `${seeds.length} recent change(s) leave ${staleSurfaces.length} surface(s) stale: ${parts.join(", ")}${tail}.`;
}

export {
  STALE_SURFACES_KIND,
  STALE_SURFACES_VERSION,
  DEFAULT_MAX_NODES,
  deriveStaleSurfaces,
  summarizeStaleSurfaces,
  nodeFreshAt
};
