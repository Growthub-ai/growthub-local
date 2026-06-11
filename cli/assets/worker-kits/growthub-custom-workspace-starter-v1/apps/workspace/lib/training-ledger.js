/**
 * Training ledger — pure eligibility driver (CAUSATION_ITT_ELIGIBILITY_DRIVERS).
 *
 * Deterministic functions over workspace evidence only: the `model-training`
 * custom object rows stamped by `growthub intelligence export` (the same
 * lastRunId/lastSourceId/lastResponse stamping pattern sandbox-run uses) and
 * the `training:` source-record keys in the workspace sidecar. No fetch, no
 * React, no config writes — the HelperSidecar training view and the
 * /training page both render from this one derivation so the sidecar and
 * the page can never disagree.
 *
 * Evidence cross-check: a row's export claim (`lastExportId`) is only
 * trusted when the sidecar record at `lastSourceId` exists and carries the
 * same exportId. A claim without matching sidecar evidence never reads as
 * complete — it surfaces as missing evidence with a rerun instruction.
 * Callers that pass only `workspaceConfig` (no source records) keep the
 * pre-evidence behavior: claims render unverified rather than failing.
 *
 * Low-entropy guidance contract (the causation-driver rule — state becomes
 * eligibility, eligibility becomes the next action):
 *   - "blocked"   → no trace evidence yet; next = do real governed work
 *   - "eligible"  → rows exist without a verified export; next = export
 *                   (covers both "never exported" and "claim without
 *                   sidecar evidence — rerun export")
 *   - "complete"  → latest export claim matches its training:* record;
 *                   next = fine-tune handoff
 */

export const TRAINING_OBJECT_ID = "model-training";
export const TRAINING_OBJECT_TYPE = "model-training";
export const TRAINING_SOURCE_PREFIX = "training:";

/** Safe JSON parse for row-stamped summaries; returns null, never throws. */
export function parseExportSummary(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function trainingObject(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return null;
  return objects.find((o) => o?.objectType === TRAINING_OBJECT_TYPE) || null;
}

function sidecarRecordFor(workspaceSourceRecords, sourceId) {
  if (!sourceId) return null;
  const entry = workspaceSourceRecords?.[sourceId];
  if (!entry || typeof entry !== "object") return null;
  const records = Array.isArray(entry.records) ? entry.records : [];
  return { entry, records };
}

/**
 * Evidence status for a single row's export claim.
 *
 *   - "none"       → row has no export claim
 *   - "unverified" → claim present but caller supplied no source records
 *   - "missing"    → claim present, sidecar record absent or exportId mismatch
 *   - "linked"     → claim present and sidecar record carries the same exportId
 */
function deriveRowEvidence(row, workspaceSourceRecords, verifiable) {
  const lastExportId = String(row?.lastExportId || "").trim();
  if (!lastExportId) return { status: "none", record: null };
  if (!verifiable) return { status: "unverified", record: null };

  const lastSourceId = String(row?.lastSourceId || "").trim();
  const sidecar = sidecarRecordFor(workspaceSourceRecords, lastSourceId);
  if (!sidecar) return { status: "missing", record: null };

  const match = sidecar.records.find((r) => String(r?.exportId || "").trim() === lastExportId) || null;
  if (!match) return { status: "missing", record: null };
  return { status: "linked", record: match };
}

/**
 * Derive the full ledger state from workspace evidence.
 *
 * @param {object} input
 * @param {object} input.workspaceConfig - the governed workspace config
 * @param {object} [input.workspaceSourceRecords] - the sidecar source-record
 *   map from GET /api/workspace (or the seed). Optional for backward
 *   compatibility: when absent, export claims render unverified.
 */
export function deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords } = {}) {
  const object = trainingObject(workspaceConfig);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  const verifiable = Boolean(workspaceSourceRecords) && typeof workspaceSourceRecords === "object";

  const models = rows.map((row) => {
    const evidence = deriveRowEvidence(row, workspaceSourceRecords, verifiable);
    return {
      name: String(row?.Name || "").trim(),
      status: String(row?.status || "").trim(),
      baseModel: String(row?.baseModel || "").trim(),
      localModel: String(row?.localModel || "").trim(),
      lastExportAt: String(row?.lastExportAt || "").trim(),
      lastExportId: String(row?.lastExportId || "").trim(),
      lastSourceId: String(row?.lastSourceId || "").trim(),
      summary: parseExportSummary(row?.lastExportSummary),
      evidence: evidence.status,
      sidecarRecord: evidence.record,
    };
  });

  // Coverage counts only evidence-backed exports when verification is
  // possible; unverified claims count when it is not (legacy callers).
  const countable = models.filter((m) => (verifiable ? m.evidence === "linked" : m.evidence !== "none"));
  const coverage = countable.reduce(
    (acc, m) => {
      const summary = m.sidecarRecord || m.summary;
      acc.exports += 1;
      acc.records += Number(summary?.recordCount) || 0;
      acc.escalations += Number(summary?.escalations) || 0;
      const surfaces = summary?.surfaces;
      if (surfaces && typeof surfaces === "object") {
        for (const [key, value] of Object.entries(surfaces)) {
          acc.surfaces[key] = (acc.surfaces[key] || 0) + (Number(value) || 0);
        }
      }
      return acc;
    },
    { exports: 0, records: 0, escalations: 0, surfaces: {} },
  );

  const claims = models.filter((m) => m.evidence !== "none");
  const missingEvidence = verifiable && claims.some((m) => m.evidence === "missing");

  let eligibility;
  if (!object || models.length === 0) {
    eligibility = {
      state: "blocked",
      next: "No training ledger yet — do governed work (helper applies, swarm runs), then export traces.",
    };
  } else if (claims.length === 0) {
    eligibility = {
      state: "eligible",
      next: "Training traces accumulate from governed work — run `growthub intelligence export` to create the first corpus.",
    };
  } else if (missingEvidence && coverage.exports === 0) {
    eligibility = {
      state: "eligible",
      next: "Export row exists but source-record evidence is missing — rerun `growthub intelligence export`.",
    };
  } else {
    eligibility = {
      state: "complete",
      next: "Latest corpus exported — hand the JSONL to your fine-tune loop, then select the tuned localModel.",
    };
  }

  return { present: Boolean(object), models, coverage, eligibility, missingEvidence };
}
