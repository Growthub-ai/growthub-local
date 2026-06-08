/**
 * Orchestration Delta History V1 — roadmap Phase 1.5 / 2.4.
 *
 * Pure read-side companion to the publish-time delta writer in
 * WorkflowSurface.publishGraph. Publish appends records to
 * `sandboxRow.orchestrationDeltas[]`; this module normalizes them for the
 * delta-history panel so the changelog the data model already stores becomes
 * operable (timeline + tag filter) instead of dead JSON.
 *
 * A stored delta record looks like:
 *   {
 *     at, version, previousVersion, field, action,
 *     changeReason, deltaTags: string[],
 *     nodeDeltas: [{ nodeId, nodeType, label, changeReason, deltaTags, previous, next }],
 *     nodeCount, edgeCount, draftRunId, draftTestedAt
 *   }
 *
 * This never executes anything and never touches secrets.
 */

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map((t) => clean(t).toLowerCase()).filter(Boolean))).sort();
}

function normalizeNodeDelta(nodeDelta) {
  return {
    nodeId: clean(nodeDelta?.nodeId),
    nodeType: clean(nodeDelta?.nodeType),
    label: clean(nodeDelta?.label) || clean(nodeDelta?.nodeId),
    changeReason: clean(nodeDelta?.changeReason),
    deltaTags: normalizeTags(nodeDelta?.deltaTags),
    requiresRetest: nodeDelta?.requiresRetest !== false,
    isNew: !nodeDelta?.previous,
  };
}

function normalizeDelta(delta, index, total) {
  const nodeDeltas = Array.isArray(delta?.nodeDeltas) ? delta.nodeDeltas.map(normalizeNodeDelta) : [];
  const deltaTags = normalizeTags(
    delta?.deltaTags && delta.deltaTags.length
      ? delta.deltaTags
      : nodeDeltas.flatMap((n) => n.deltaTags)
  );
  return {
    // Newest first carries the highest ordinal so the UI can show "v5".
    ordinal: total - index,
    at: clean(delta?.at),
    version: clean(delta?.version) || String(total - index),
    previousVersion: clean(delta?.previousVersion),
    action: clean(delta?.action) || "publish",
    field: clean(delta?.field),
    changeReason: clean(delta?.changeReason),
    deltaTags,
    nodeDeltas,
    nodeCount: Number.isFinite(delta?.nodeCount) ? delta.nodeCount : nodeDeltas.length,
    edgeCount: Number.isFinite(delta?.edgeCount) ? delta.edgeCount : 0,
    draftRunId: clean(delta?.draftRunId),
    draftTestedAt: clean(delta?.draftTestedAt),
  };
}

/**
 * Normalize and sort the delta history newest-first. Accepts the raw row array
 * or a JSON string column (sandbox rows can stringify JSON columns on
 * export/import). Always returns an array; never throws.
 */
function summarizeOrchestrationDeltas(rawDeltas) {
  let deltas = rawDeltas;
  if (typeof deltas === "string") {
    try {
      deltas = JSON.parse(deltas);
    } catch {
      deltas = [];
    }
  }
  if (!Array.isArray(deltas)) return [];
  // Stored oldest-first (append on publish); present newest-first.
  const ordered = [...deltas].reverse();
  return ordered.map((delta, index) => normalizeDelta(delta, index, deltas.length));
}

/** Distinct tags across the whole history, for the filter chip row. */
function collectDeltaTags(summaries) {
  const tags = new Set();
  for (const summary of summaries) for (const tag of summary.deltaTags) tags.add(tag);
  return Array.from(tags).sort();
}

/** Filter summaries to those carrying a given tag (case-insensitive). */
function filterDeltasByTag(summaries, tag) {
  const needle = clean(tag).toLowerCase();
  if (!needle) return summaries;
  return summaries.filter((s) => s.deltaTags.includes(needle));
}

export { summarizeOrchestrationDeltas, collectDeltaTags, filterDeltasByTag };
