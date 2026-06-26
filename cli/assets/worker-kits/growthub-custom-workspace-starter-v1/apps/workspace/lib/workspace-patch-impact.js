/**
 * Growthub Workspace Patch-Impact V1 — the single, authoritative "what does this
 * patch actually change?" deriver, shared by the preflight route and the CLI.
 *
 * A dataModel/dashboards PATCH REPLACES the whole array, so the patch body alone
 * is never "what changed". This diffs the CURRENT config against the MERGED
 * (post-patch) config and reports THREE classes of change, each with downstream
 * impact:
 *
 *   - added / modified objects + dashboards → seeded on the MERGED graph
 *     (their new dependents).
 *   - REMOVED objects + dashboards → seeded on the CURRENT graph, because the
 *     deleted node no longer exists in the merged graph; the surfaces that
 *     depended on it are the blast radius of deleting it. Without this, deleting
 *     a business surface would silently report no impact — the highest-risk
 *     false confidence.
 *
 * Pure: composes `deriveStaleSurfaces` (which composes the blast-radius spine),
 * no new traversal, no writes, no secrets.
 */

import { deriveStaleSurfaces } from "./workspace-stale-surfaces.js";

const PATCH_IMPACT_KIND = "growthub-workspace-patch-impact-v1";
const PATCH_IMPACT_VERSION = 1;

function objectIndex(config) {
  return new Map((config?.dataModel?.objects || []).map((o) => [o && o.id, JSON.stringify(o)]));
}
function dashboardIndex(config) {
  return new Map((config?.dashboards || []).map((d) => [d && (d.id || d.name), JSON.stringify(d)]));
}

/**
 * @param {object} currentGraph graph built from the CURRENT config (pre-patch)
 * @param {object} mergedGraph  graph built from the MERGED config (post-patch)
 * @param {object} currentConfig
 * @param {object} mergedConfig
 * @returns {object} `{ kind, version, scope, seeds[], total, byType, staleSurfaces[], removed[], summary, warnings }`
 */
function derivePatchImpact(currentGraph, mergedGraph, currentConfig, mergedConfig) {
  const empty = (warning) => ({
    kind: PATCH_IMPACT_KIND,
    version: PATCH_IMPACT_VERSION,
    scope: "changed-only",
    seeds: [],
    total: 0,
    byType: {},
    staleSurfaces: [],
    removed: [],
    summary: "No object or dashboard added, modified, or removed.",
    warnings: warning ? [warning] : []
  });

  if (!mergedGraph || !Array.isArray(mergedGraph.nodes)) return empty("merged graph missing");

  const curObjects = objectIndex(currentConfig);
  const mergedObjects = objectIndex(mergedConfig);
  const curDashboards = dashboardIndex(currentConfig);
  const mergedDashboards = dashboardIndex(mergedConfig);

  const changedObjectIds = new Set();
  const removedObjectIds = new Set();
  for (const [id, json] of mergedObjects) if (id && curObjects.get(id) !== json) changedObjectIds.add(id);
  for (const [id] of curObjects) if (id && !mergedObjects.has(id)) removedObjectIds.add(id);

  const changedDashboardIds = new Set();
  const removedDashboardIds = new Set();
  for (const [id, json] of mergedDashboards) if (id && curDashboards.get(id) !== json) changedDashboardIds.add(id);
  for (const [id] of curDashboards) if (id && !mergedDashboards.has(id)) removedDashboardIds.add(id);

  // ── added / modified: seed on the MERGED graph ──────────────────────────
  const changedSeeds = [];
  for (const node of mergedGraph.nodes) {
    if (node.type === "dataModelObject" && (changedObjectIds.has(node.summary?.objectId) || changedObjectIds.has(node.metadataId))) {
      changedSeeds.push(node.id);
    } else if (node.type === "dashboard" && (changedDashboardIds.has(node.metadataId) || changedDashboardIds.has(node.label))) {
      changedSeeds.push(node.id);
    }
  }
  const changedStale = changedSeeds.length ? deriveStaleSurfaces(mergedGraph, { seedIds: changedSeeds }) : null;

  // ── removed: seed on the CURRENT graph (the deleted node lived there) ────
  const removed = [];
  const currentNodes = (currentGraph && Array.isArray(currentGraph.nodes)) ? currentGraph.nodes : [];
  for (const node of currentNodes) {
    const isRemovedObject = node.type === "dataModelObject" && (removedObjectIds.has(node.summary?.objectId) || removedObjectIds.has(node.metadataId));
    const isRemovedDashboard = node.type === "dashboard" && (removedDashboardIds.has(node.metadataId) || removedDashboardIds.has(node.label));
    if (!isRemovedObject && !isRemovedDashboard) continue;
    const downstream = deriveStaleSurfaces(currentGraph, { seedIds: [node.id] });
    removed.push({
      id: node.id,
      type: node.type,
      label: node.label,
      metadataId: node.metadataId,
      affectedTotal: downstream.total,
      affected: downstream.staleSurfaces,
      summary: `Removing "${node.label}" affects ${downstream.total} downstream surface(s) that depend on it.`
    });
  }

  if (!changedStale && !removed.length) return empty();

  return {
    kind: PATCH_IMPACT_KIND,
    version: PATCH_IMPACT_VERSION,
    scope: "changed-only",
    seeds: changedStale ? changedStale.seeds : [],
    total: changedStale ? changedStale.total : 0,
    byType: changedStale ? changedStale.byType : {},
    staleSurfaces: changedStale ? changedStale.staleSurfaces : [],
    removed,
    summary: summarizePatchImpact(changedStale, removed),
    warnings: removed.length ? [`${removed.length} object/dashboard removal(s) — review affected downstream before applying.`] : []
  };
}

function summarizePatchImpact(changedStale, removed) {
  const parts = [];
  if (changedStale && changedStale.total) parts.push(`${changedStale.total} surface(s) stale from add/modify`);
  if (removed.length) {
    const affected = removed.reduce((sum, r) => sum + (r.affectedTotal || 0), 0);
    parts.push(`${removed.length} removal(s) affecting ${affected} downstream surface(s)`);
  }
  return parts.length ? `Patch impact: ${parts.join("; ")}.` : "No downstream impact.";
}

export {
  PATCH_IMPACT_KIND,
  PATCH_IMPACT_VERSION,
  derivePatchImpact,
  summarizePatchImpact
};
