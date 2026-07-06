/**
 * Training run receipts — the governed lifecycle layer that makes Growthub
 * Local OWN the model-training run, not just hand a corpus off and hope.
 * No React, no fetch, no fs. Pure derivation over a sidecar namespace.
 *
 * The correction over a weak "export then train elsewhere" framing: a
 * training attempt is a first-class, provable Growthub Local object. Compute
 * may run through a local command, a container, a manual attestation, or a
 * compatible runtime (the runnerMode), but the RECEIPT — dataset linkage,
 * profile, artifact identity, status — lives in the workspace as governed
 * evidence. No new objectType and no PATCH allowlist change: receipts are
 * appended to the source-record sidecar under `training-run:model-training:
 * <slug>`, exactly parallel to the `training:model-training:<slug>` export
 * history the CLI already writes.
 *
 * This is the bridge that splits PR #229's compressed ladder into honest
 * internal sub-states between `exported` and `deployed`:
 *   exported → prepared → running → trained → imported → deployed → …
 * Each promotion needs NEW receipt evidence; a status string alone never
 * advances past what its artifact can prove (artifactImportComplete gates
 * `imported`).
 */

import { deriveArtifactState } from "./training-artifacts.js";

export const TRAINING_RUN_SCHEMA = "growthub-local-model-training-run-v1";
export const TRAINING_RUN_SOURCE_PREFIX = "training-run:";
export const TRAINING_OBJECT_ID = "model-training";
/**
 * Governed data-model object the Training Runtime modal writes run receipts
 * into through the existing PATCH allowlist (dataModel). Read alongside the
 * CLI-owned `training-run:*` sidecar so BOTH write lanes — app modal and CLI
 * — feed one lifecycle deriver and can never disagree.
 */
export const TRAINING_RUN_OBJECT_ID = "model-training-run";
export const TRAINING_RUN_OBJECT_TYPE = "model-training-run";

/** Sidecar source-record key for a slug's run-receipt history. */
export function trainingRunSourceKey(slug = "workspace-local") {
  return `${TRAINING_RUN_SOURCE_PREFIX}${TRAINING_OBJECT_ID}:${slug}`;
}

/** Run-receipt rows the app modal persists in the governed dataModel object. */
function runRowsFromConfig(workspaceConfig, slug) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((o) => o?.objectType === TRAINING_RUN_OBJECT_TYPE);
  if (!object) return [];
  return (Array.isArray(object.rows) ? object.rows : [])
    .filter((r) => r && typeof r === "object")
    .filter((r) => !slug || String(r?.modelTrainingRowId || "") === slug)
    .map(normalizeRunRow);
}

/** A persisted run row stores the artifact as flat columns or a JSON blob. */
function normalizeRunRow(row) {
  let artifact = row?.artifact;
  if (typeof artifact === "string") { try { artifact = JSON.parse(artifact); } catch { artifact = null; } }
  if (!artifact && (row?.artifactType || row?.artifactModelTag)) {
    artifact = { type: row.artifactType, modelTag: row.artifactModelTag, path: row.artifactPath, sha256: row.artifactSha256, quantization: row.artifactQuantization };
  }
  return { ...row, artifact };
}

/** Ordered run lifecycle stages (monotonic — higher = further along). */
export const RUN_STAGES = ["none", "prepared", "running", "trained", "imported"];
const STAGE_RANK = RUN_STAGES.reduce((acc, s, i) => { acc[s] = i; return acc; }, {});

/**
 * Normalize one receipt's recorded status into a provable run stage.
 * Demotion is the whole point: a receipt claiming `imported` (or
 * `verified`) whose artifact is not identifiable demotes to `trained`.
 *
 * @returns {{ stage: "prepared"|"running"|"trained"|"imported"|"failed", reason: string, artifact: object }}
 */
export function classifyRunStatus(receipt) {
  const status = String(receipt?.status || "").trim().toLowerCase();
  const artifact = deriveArtifactState(receipt?.artifact);

  if (status === "failed") return { stage: "failed", reason: "training run failed", artifact };
  if (status === "prepared" || status === "") return { stage: "prepared", reason: "run prepared — config recorded, not yet executed", artifact };
  if (status === "running") return { stage: "running", reason: "run executing", artifact };

  // completed / imported / verified all claim an artifact exists. The
  // artifact must be PROVABLE to read as imported; otherwise it is at most
  // `trained` (weights claimed, identity not yet established).
  if (status === "completed" || status === "imported" || status === "verified") {
    if (artifact.identified) return { stage: "imported", reason: "artifact identified and importable", artifact };
    return { stage: "trained", reason: `run completed but artifact not provable: ${artifact.reason}`, artifact };
  }
  return { stage: "prepared", reason: `unrecognized status "${status}" — treated as prepared`, artifact };
}

/** Parse the run-receipt history for a slug. Never throws. */
export function parseTrainingRunReceipts(workspaceSourceRecords, slug = "workspace-local") {
  const entry = workspaceSourceRecords?.[trainingRunSourceKey(slug)];
  if (!entry || typeof entry !== "object") return [];
  return Array.isArray(entry.records) ? entry.records.filter((r) => r && typeof r === "object") : [];
}

/**
 * Derive the run state for a slug from the governed sidecar. Pure.
 *
 * @returns {{
 *   present: boolean, runState: string, runs: object[], latest: object|null,
 *   stage: string, stageRank: number, datasetExportLinked: boolean,
 *   artifact: object, failed: boolean, reason: string
 * }}
 */
export function deriveTrainingRunState({ workspaceConfig, workspaceSourceRecords, slug = "workspace-local", knownExportIds = [] } = {}) {
  // Merge BOTH write lanes: CLI-owned sidecar history + app-owned governed
  // data-model rows. Either path can advance the lifecycle.
  const receipts = [...parseTrainingRunReceipts(workspaceSourceRecords, slug), ...runRowsFromConfig(workspaceConfig, slug)];
  if (receipts.length === 0) {
    return { present: false, runState: "none", runs: [], latest: null, stage: "none", stageRank: 0, datasetExportLinked: false, artifact: deriveArtifactState(null), failed: false, reason: "no training run recorded" };
  }

  const exportSet = new Set((knownExportIds || []).filter(Boolean).map(String));
  const classified = receipts.map((receipt) => {
    const c = classifyRunStatus(receipt);
    return {
      receipt,
      ...c,
      datasetExportLinked: exportSet.size === 0 ? Boolean(String(receipt?.datasetExportId || "").trim()) : exportSet.has(String(receipt?.datasetExportId || "")),
    };
  });

  // The ledger advances on the BEST provable run; failures are surfaced but
  // never block a later successful run from counting.
  let best = classified[0];
  for (const c of classified) {
    const rank = STAGE_RANK[c.stage] ?? 0;
    if (rank >= (STAGE_RANK[best.stage] ?? 0)) best = c;
  }
  const latest = classified[classified.length - 1];
  const anyFailed = classified.some((c) => c.stage === "failed");

  const stage = best.stage === "failed" ? "prepared" : best.stage;
  return {
    present: true,
    runState: best.stage,
    runs: classified.map((c) => ({ trainingRunId: String(c.receipt?.trainingRunId || ""), profile: String(c.receipt?.trainingProfile || ""), runnerMode: String(c.receipt?.runnerMode || ""), stage: c.stage, reason: c.reason, datasetExportLinked: c.datasetExportLinked, artifact: c.artifact, startedAt: String(c.receipt?.startedAt || ""), completedAt: String(c.receipt?.completedAt || "") })),
    latest: latest.receipt,
    stage,
    stageRank: STAGE_RANK[stage] ?? 0,
    datasetExportLinked: best.datasetExportLinked,
    artifact: best.artifact,
    failed: anyFailed,
    reason: best.reason,
  };
}

/**
 * Build a `model-training-run` receipt — pure shape factory shared by the
 * Training Runtime modal (prepare step) and the seed/QA harness so they
 * stamp identical evidence. Returns the receipt object; the caller appends
 * it to the sidecar through its own governed write lane.
 */
export function buildTrainingRunReceipt({
  trainingRunId,
  modelTrainingRowId,
  datasetExportId = "",
  baseModel = "",
  trainingProfile = "",
  runnerMode = "local-command",
  status = "prepared",
  startedAt = "",
  completedAt = "",
  artifact = null,
  metrics = null,
  receipts = [],
  now = "",
} = {}) {
  const at = startedAt || now || new Date().toISOString();
  const id = String(trainingRunId || "").trim() || `trainrun_${at.replace(/[:.]/g, "-")}`;
  return {
    schema: TRAINING_RUN_SCHEMA,
    trainingRunId: id,
    modelTrainingRowId: String(modelTrainingRowId || "").trim(),
    datasetExportId: String(datasetExportId || "").trim(),
    baseModel: String(baseModel || "").trim(),
    trainingProfile: String(trainingProfile || "").trim(),
    runnerMode: String(runnerMode || "").trim(),
    status: String(status || "prepared").trim(),
    startedAt: at,
    completedAt: String(completedAt || "").trim(),
    artifact: artifact && typeof artifact === "object" ? {
      type: String(artifact.type || ""),
      path: String(artifact.path || ""),
      modelTag: String(artifact.modelTag || ""),
      sha256: String(artifact.sha256 || ""),
      quantization: String(artifact.quantization || "none"),
    } : null,
    metrics: metrics && typeof metrics === "object" ? {
      trainExamples: Number(metrics.trainExamples) || 0,
      evalExamples: Number(metrics.evalExamples) || 0,
      loss: metrics.loss == null ? null : Number(metrics.loss),
      evalPassRate: metrics.evalPassRate == null ? null : Number(metrics.evalPassRate),
    } : { trainExamples: 0, evalExamples: 0, loss: null, evalPassRate: null },
    receipts: Array.isArray(receipts) ? receipts.map(String) : [],
  };
}
