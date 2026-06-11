/**
 * Training ledger — pure eligibility driver (CAUSATION_ITT_ELIGIBILITY_DRIVERS).
 *
 * Deterministic functions over workspace evidence only: the `model-training`
 * custom object rows stamped by `growthub intelligence export` (the same
 * lastRunId/lastSourceId/lastResponse stamping pattern sandbox-run uses) and
 * the `training:` source-record keys. No fetch, no React, no config writes —
 * the HelperSidecar training view and the /training page both render from
 * this one derivation so the sidecar and the page can never disagree.
 *
 * Low-entropy guidance contract (the causation-driver rule — state becomes
 * eligibility, eligibility becomes the next action):
 *   - "blocked"   → no trace evidence yet; next = do real governed work
 *   - "eligible"  → traces exist beyond the last export; next = export
 *   - "complete"  → latest export covers current evidence; next = fine-tune
 */

export const TRAINING_OBJECT_ID = "model-training";
export const TRAINING_OBJECT_TYPE = "model-training";
export const TRAINING_SOURCE_PREFIX = "training:";

/** Safe JSON parse for row-stamped summaries; returns null, never throws. */
export function parseExportSummary(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function trainingObject(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return null;
  return objects.find((o) => o?.objectType === TRAINING_OBJECT_TYPE) || null;
}

/**
 * Derive the full ledger state from workspace evidence.
 *
 * @param {object} input
 * @param {object} input.workspaceConfig - the governed workspace config
 * @returns {{
 *   present: boolean,
 *   models: Array<{
 *     name: string, status: string, baseModel: string, localModel: string,
 *     lastExportAt: string, lastExportId: string, lastSourceId: string,
 *     summary: { recordCount?: number, surfaces?: Record<string, number>,
 *                escalations?: number, rewardMean?: number, path?: string } | null
 *   }>,
 *   coverage: { exports: number, records: number, escalations: number, surfaces: Record<string, number> },
 *   eligibility: { state: "blocked" | "eligible" | "complete", next: string }
 * }}
 */
export function deriveTrainingLedgerState({ workspaceConfig } = {}) {
  const object = trainingObject(workspaceConfig);
  const rows = Array.isArray(object?.rows) ? object.rows : [];

  const models = rows.map((row) => ({
    name: String(row?.Name || "").trim(),
    status: String(row?.status || "").trim(),
    baseModel: String(row?.baseModel || "").trim(),
    localModel: String(row?.localModel || "").trim(),
    lastExportAt: String(row?.lastExportAt || "").trim(),
    lastExportId: String(row?.lastExportId || "").trim(),
    lastSourceId: String(row?.lastSourceId || "").trim(),
    summary: parseExportSummary(row?.lastExportSummary),
  }));

  const exported = models.filter((m) => m.lastExportId);
  const coverage = exported.reduce(
    (acc, m) => {
      acc.exports += 1;
      acc.records += Number(m.summary?.recordCount) || 0;
      acc.escalations += Number(m.summary?.escalations) || 0;
      const surfaces = m.summary?.surfaces;
      if (surfaces && typeof surfaces === "object") {
        for (const [key, value] of Object.entries(surfaces)) {
          acc.surfaces[key] = (acc.surfaces[key] || 0) + (Number(value) || 0);
        }
      }
      return acc;
    },
    { exports: 0, records: 0, escalations: 0, surfaces: {} },
  );

  let eligibility;
  if (!object || models.length === 0) {
    eligibility = {
      state: "blocked",
      next: "No training ledger yet — run governed work (helper applies, swarm runs), then export traces.",
    };
  } else if (coverage.exports === 0) {
    eligibility = {
      state: "eligible",
      next: "Traces accumulate from governed work — run `growthub intelligence export` to create the first corpus.",
    };
  } else {
    eligibility = {
      state: "complete",
      next: "Latest corpus exported — hand the JSONL to your fine-tune loop, then select the tuned localModel.",
    };
  }

  return { present: Boolean(object), models, coverage, eligibility };
}
