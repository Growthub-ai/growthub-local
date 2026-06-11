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

/**
 * Distillation Pipeline V1 anchors (helpers/{harvest-cursor-traces,
 * grade-raw-pairs,upload-graded-traces,export-training-traces}.mjs).
 * `training-traces` rows are written by Phase 2.5 with
 * {sessionDate, inputPrompt, agentOutput, qualityScore, reason, exported}
 * and consumed by Phase 3 (qualityScore >= minScore && exported !== "true").
 */
export const TRACES_OBJECT_ID = "training-traces";
/** Phase-2.5/3 default curation floor (critic-grader 1–5 scale). */
export const DEFAULT_MIN_SCORE = 4;
/**
 * Minimum curated examples before a fine-tune run is worth starting.
 * OpenAI's supervised fine-tuning API enforces 10 examples as the hard
 * floor; local QLoRA practice (Unsloth) treats ~10 as the same minimum.
 */
export const MIN_FINETUNE_TRACES = 10;

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

/**
 * Distillation pipeline state — pure derivation over the `training-traces`
 * object that Pipeline V1 Phases 2.5/3 read and write. No new semantics:
 * "graded" and "unexported" use exactly the Phase-3 eligibility predicate.
 */
export function deriveDistillationPipelineState({ workspaceConfig, minScore = DEFAULT_MIN_SCORE } = {}) {
  const objects = workspaceConfig?.dataModel?.objects;
  const object = Array.isArray(objects) ? objects.find((o) => o?.id === TRACES_OBJECT_ID) : null;
  const rows = Array.isArray(object?.rows) ? object.rows : [];

  let graded = 0;
  let unexported = 0;
  let exportedCount = 0;
  for (const row of rows) {
    const qualifies = Number(row?.qualityScore) >= minScore
      && String(row?.inputPrompt || "").trim()
      && String(row?.agentOutput || "").trim();
    if (!qualifies) continue;
    graded += 1;
    if (String(row?.exported || "false").toLowerCase() === "true") exportedCount += 1;
    else unexported += 1;
  }

  return {
    present: Boolean(object),
    total: rows.length,
    graded,
    unexported,
    exportedCount,
    minScore,
    threshold: MIN_FINETUNE_TRACES,
    ready: graded >= MIN_FINETUNE_TRACES,
    remaining: Math.max(0, MIN_FINETUNE_TRACES - graded),
  };
}

function hasActiveLocalModel(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return { active: false, localModel: "" };
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      if (String(row?.adapter || "") === "local-intelligence" && String(row?.localModel || "").trim()) {
        return { active: true, localModel: String(row.localModel).trim() };
      }
    }
  }
  return { active: false, localModel: "" };
}

function hasRegisteredModelEndpoint(workspaceConfig, slug) {
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return false;
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      const integrationId = String(row?.integrationId || "");
      const baseUrl = String(row?.baseUrl || "");
      // Convention: register the tuned model as `<ledger-row>-model`, or any
      // row pointing at a local OpenAI-compatible runtime (Ollama :11434).
      if (integrationId === `${slug}-model` || baseUrl.includes(":11434")) return true;
    }
  }
  return false;
}

/**
 * Fine-tune handoff cockpit — the same causation-driver pattern as the API
 * Registry creation spine: workspace evidence in, ordered steps out, each
 * `complete | eligible | pending`, each with the exact shipping command.
 * Every step maps 1:1 to Distillation Pipeline V1 + the documented
 * fine-tune loop (NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE §31.2):
 * collect → curate → gather threshold → export SFT JSONL → QLoRA fine-tune
 * → activate localModel → register the endpoint as an API Registry row.
 */
export function deriveTrainingHandoffState({
  workspaceConfig,
  workspaceSourceRecords,
  minScore = DEFAULT_MIN_SCORE,
  slug = "workspace-local",
} = {}) {
  const pipeline = deriveDistillationPipelineState({ workspaceConfig, minScore });
  const ledger = deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords });
  const corpusLinked = ledger.models.some((m) => m.evidence === "linked" || m.evidence === "unverified");
  const model = hasActiveLocalModel(workspaceConfig);
  const registered = hasRegisteredModelEndpoint(workspaceConfig, slug);

  const sftExportCommand = [
    "node helpers/export-training-traces.mjs \\",
    "  --workspace http://localhost:3000 \\",
    `  --traces-object ${TRACES_OBJECT_ID} \\`,
    `  --min-score ${minScore} \\`,
    "  --out ./distillation/unsloth-batch.jsonl",
  ].join("\n");

  const steps = [
    {
      id: "collect",
      label: "Collect traces",
      status: pipeline.present && pipeline.total > 0 ? "complete" : "eligible",
      hint: pipeline.present && pipeline.total > 0
        ? `${pipeline.total} rows in ${TRACES_OBJECT_ID}`
        : "Harvest agent transcripts into governed rows (Pipeline V1 Phases 1–2.5).",
      command: "node helpers/harvest-cursor-traces.mjs --in <transcripts> --out ./distillation/raw-pairs.jsonl",
    },
    {
      id: "curate",
      label: "Curate (critic-graded)",
      status: pipeline.graded > 0 ? "complete" : pipeline.total > 0 ? "eligible" : "pending",
      hint: pipeline.graded > 0
        ? `${pipeline.graded} rows at qualityScore ≥ ${minScore}`
        : `Grade pairs via the critic-grader sandbox row, upload rows ≥ ${minScore}.`,
      command: "node helpers/grade-raw-pairs.mjs --in ./distillation/raw-pairs.jsonl --out ./distillation/graded.jsonl",
    },
    {
      id: "gather",
      label: `Reach ${MIN_FINETUNE_TRACES} curated traces`,
      status: pipeline.ready ? "complete" : pipeline.graded > 0 ? "eligible" : "pending",
      hint: pipeline.ready
        ? `${pipeline.graded} curated — fine-tune floor met`
        : `${pipeline.graded} of ${MIN_FINETUNE_TRACES} — ${pipeline.remaining} more curated traces needed.`,
    },
    {
      id: "export-sft",
      label: "Export SFT JSONL",
      status: pipeline.exportedCount > 0 && pipeline.unexported === 0
        ? "complete"
        : pipeline.unexported > 0 ? "eligible" : "pending",
      hint: pipeline.unexported > 0
        ? `${pipeline.unexported} curated rows awaiting export (Unsloth {instruction,input,output}).`
        : pipeline.exportedCount > 0
          ? `${pipeline.exportedCount} rows exported and deduped`
          : "Runs once curated rows exist.",
      command: sftExportCommand,
    },
    {
      id: "corpus",
      label: "Export governed-evidence corpus",
      status: corpusLinked ? "complete" : "eligible",
      hint: corpusLinked
        ? "Ledger stamp linked to training:* evidence"
        : "Preference-pair corpus (applied/skipped, rewards, self-eval).",
      command: "growthub intelligence export --workspace <apps/workspace>",
    },
    {
      id: "finetune",
      label: "Fine-tune (external QLoRA)",
      status: pipeline.exportedCount > 0 || corpusLinked ? "eligible" : "pending",
      hint: "Unsloth/QLoRA over the exported JSONL; Unsloth emits the Ollama Modelfile for the result. No training runs in this workspace.",
    },
    {
      id: "activate",
      label: "Activate tuned localModel",
      status: model.active ? "complete" : "pending",
      hint: model.active
        ? `localModel ${model.localModel}`
        : "Load weights (ollama create from the generated Modelfile), then select the concrete localModel in Local Intelligence.",
      command: "ollama create <slug>-tuned -f ./Modelfile",
    },
    {
      id: "register",
      label: "Register model endpoint",
      status: registered ? "complete" : model.active ? "eligible" : "pending",
      hint: registered
        ? "API Registry row present — the tuned model is invocable as a governed source"
        : `Register the local endpoint (e.g. http://127.0.0.1:11434/v1) as API Registry row \`${slug}-model\` via /register-api.`,
    },
  ];

  const completedCount = steps.filter((s) => s.status === "complete").length;
  return { steps, completedCount, totalCount: steps.length, pipeline, slug, minScore };
}
