/**
 * Training runtime drivers — the causal prioritization brain. This is the
 * ONE piece pulled forward from PR #235: its pure, no-I/O, never-throws
 * deriver discipline and its counterfactual marginal-impact ranking — NOT
 * its simulation cockpit, swarm-predictability routes, or /simulate
 * surface. Those stay deferred. Here the concept answers a single product
 * question:
 *
 *   "What is the highest-impact next action that moves THIS model-training
 *    loop toward a verified, usable capability?"
 *
 * It consumes deriveTrainingRuntimeState (the composed lifecycle) and the
 * distillation pipeline state, and emits a ranked driver list, a single
 * next-best action, the top blocker, and an evidence-depth confidence. It
 * never runs a model, never fetches, never mutates config, never schedules
 * — it only ranks the next LOCAL action. Seeded and deterministic: same
 * evidence in, same ranking out.
 */

import { deriveDistillationPipelineState, DEFAULT_MIN_SCORE, MIN_FINETUNE_TRACES } from "./training-ledger.js";
import { deriveTrainingRuntimeState } from "./training-runtime.js";

/** Lifecycle driver definitions in dependency order. */
const DRIVER_DEFS = [
  { id: "collect", label: "Collect governed traces", action: "collect_traces" },
  { id: "curate", label: "Curate qualified traces", action: "curate_traces" },
  { id: "export", label: "Export training corpus", action: "export_corpus" },
  { id: "prepare", label: "Prepare training run", action: "prepare_run" },
  { id: "train", label: "Run training", action: "run_training" },
  { id: "import", label: "Import model artifact", action: "import_artifact" },
  { id: "register", label: "Register model endpoint", action: "register_endpoint" },
  { id: "verify", label: "Verify tuned tag", action: "test_endpoint" },
  { id: "bind", label: "Bind into sandbox/workflow", action: "bind_sandbox" },
  { id: "smoke", label: "Run sandbox smoke", action: "run_smoke" },
];

/**
 * Counterfactual marginal impact: the FIRST incomplete driver unblocks
 * everything downstream, so it carries the highest impact; each subsequent
 * pending step is discounted by distance. Completed drivers have zero
 * marginal impact (already realized). Pure, deterministic.
 */
export function scoreTrainingDriverImpact(index, activeIndex, total) {
  if (activeIndex < 0) return 0; // loop complete — nothing marginal left
  if (index < activeIndex) return 0; // already complete
  const distance = index - activeIndex; // 0 = the active blocker
  const remaining = total - activeIndex;
  // Active step gets full weight; downstream decays linearly over what is left.
  return Number(Math.max(0, (remaining - distance) / remaining).toFixed(4));
}

/**
 * Rank next actions: returns the drivers from the active one onward, each
 * with its marginal impact, highest first (the active blocker leads).
 */
export function rankTrainingNextActions(drivers) {
  return drivers
    .filter((d) => d.state === "active" || d.state === "pending" || d.state === "blocked")
    .slice()
    .sort((a, b) => b.impact - a.impact);
}

/**
 * Derive the full readiness driver set. Pure, never throws.
 *
 * @returns {{
 *   nextBestAction: string, topBlocker: string, confidence: number,
 *   drivers: object[], evidence: object, state: string, publicState: string,
 *   runGap: boolean
 * }}
 */
export function deriveTrainingRuntimeDrivers({ workspaceConfig, workspaceSourceRecords, minScore = DEFAULT_MIN_SCORE, slug = "workspace-local" } = {}) {
  const runtime = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug });
  const pipeline = deriveDistillationPipelineState({ workspaceConfig, minScore });
  const ledger = runtime.ledger;
  const runState = runtime.runState;

  const latestModel = ledger.models[ledger.models.length - 1] || null;
  const tunedTagVerified = Boolean(ledger.models.some((m) => m.bondedRegistry?.validated));
  const registryLinked = Boolean(ledger.models.some((m) => m.bondedRegistry && m.bondedRegistry.status !== "missing"));
  const sandboxLinked = Boolean(runtime.identityChain?.sandboxObjectId);
  const sandboxRunProven = Boolean(runtime.identityChain?.modelOutputHash);
  const latestExportLinked = Boolean(ledger.models.some((m) => m.evidence === "linked")) || (!ledger.models.some((m) => m.evidence !== "none") ? false : ledger.coverage.exports > 0);

  const evidence = {
    totalTraces: pipeline.total,
    qualifiedTraces: pipeline.graded,
    unexportedQualifiedTraces: pipeline.unexported,
    latestExportLinked,
    runPrepared: runState.present,
    artifactImported: runState.runState === "imported",
    registryLinked,
    tunedTagVerified,
    sandboxLinked,
    sandboxRunProven,
  };

  // Map lifecycle completion to driver states from the composed runtime
  // state — the single source of truth, so drivers can never disagree with
  // the ledger badge.
  const reached = (s) => RUNTIME_RANK[runtime.state] >= RUNTIME_RANK[s];
  const completion = {
    collect: pipeline.total > 0,
    curate: pipeline.graded >= MIN_FINETUNE_TRACES,
    export: reached("exported"),
    prepare: reached("prepared") && runState.present,
    train: reached("trained"),
    import: reached("imported"),
    register: reached("deployed"),
    verify: reached("verified"),
    bind: reached("sandbox-ready"),
    smoke: reached("complete"),
  };

  // Blocker reasons keyed by driver id (low-entropy, evidence-derived).
  const blockedReason = {
    collect: "No governed traces yet — do real workspace work and harvest it.",
    curate: `${pipeline.graded} of ${MIN_FINETUNE_TRACES} qualified traces (qualityScore ≥ ${minScore}).`,
    export: pipeline.unexported > 0 ? `${pipeline.unexported} qualified traces awaiting export.` : "Run `growthub intelligence export` to stamp the ledger.",
    prepare: "Pick a training profile and reserve a tuned model tag.",
    train: "Execute the prepared run on your chosen runner.",
    import: runState.present ? `Artifact not provable: ${runState.artifact.reason}.` : "Import the artifact identity (path + sha256 + model tag).",
    register: "Register the local/compatible endpoint as an API Registry row.",
    verify: "Endpoint has not returned the tuned model tag yet (base/malformed responses demote).",
    bind: "Reference the verified registry row from a sandbox/workflow.",
    smoke: "Run the sandbox smoke to write outputHash proof.",
  };

  // First incomplete driver = active blocker.
  let activeIndex = DRIVER_DEFS.findIndex((d) => !completion[d.id]);
  const total = DRIVER_DEFS.length;

  const drivers = DRIVER_DEFS.map((def, i) => {
    let state;
    if (completion[def.id]) state = "complete";
    else if (i === activeIndex) state = "active";
    else state = "pending";
    // Hard blocker: the active step has a real evidence obstacle (vs. just
    // being the next pending step). Redaction-blocked traces block curate.
    if (state === "active" && def.id === "curate" && pipeline.graded === 0 && pipeline.total > 0) state = "blocked";
    return {
      id: def.id,
      label: def.label,
      action: def.action,
      state,
      impact: scoreTrainingDriverImpact(i, activeIndex, total),
      reason: completion[def.id] ? "complete" : blockedReason[def.id],
    };
  });

  const active = drivers.find((d) => d.state === "active" || d.state === "blocked") || null;
  const nextBestAction = activeIndex < 0 ? "complete" : (active?.action || "complete");
  const topBlocker = activeIndex < 0 ? "Loop complete — improve from new usage evidence." : (active?.reason || "");

  // Confidence = evidence depth: fraction of the lifecycle proven, lightly
  // boosted by corroborating run-receipt evidence. Deterministic, 0..1.
  const proven = drivers.filter((d) => d.state === "complete").length;
  const corroboration = (runState.present ? 0.05 : 0) + (runState.datasetExportLinked ? 0.05 : 0);
  const confidence = Number(Math.min(1, proven / total + corroboration).toFixed(4));

  return {
    nextBestAction,
    topBlocker,
    confidence,
    drivers,
    evidence,
    state: runtime.state,
    publicState: runtime.publicState,
    runGap: runtime.runGap,
    ranked: rankTrainingNextActions(drivers),
  };
}

const RUNTIME_RANK = ["blocked", "eligible", "exported", "prepared", "running", "trained", "imported", "deployed", "verified", "sandbox-ready", "complete"]
  .reduce((acc, s, i) => { acc[s] = i; return acc; }, {});

// ---------------------------------------------------------------------------
// Trace-gap classification — the feedback loop's brain. Detects NEW training
// opportunities created by custom-model use. Pure: it only POINTS the user
// at harvest/export; it never auto-writes traces (v1 invariant). Each gap is
// derived from existing governed evidence.
// ---------------------------------------------------------------------------

function registryRowsOf(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.filter((o) => o?.objectType === "api-registry").flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
}

function sandboxRowsOf(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.filter((o) => o?.objectType === "sandbox-environment").flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
}

export function deriveTrainingGapDrivers({ workspaceConfig, workspaceSourceRecords, slug = "workspace-local", minScore = DEFAULT_MIN_SCORE } = {}) {
  const gaps = [];
  const add = (id, label, count, recommendedAction, sourceRef = "") => {
    if (count > 0) gaps.push({ id, label, count, recommendedAction, sourceRef });
  };

  // Failed sandbox runs from a custom model → high-impact preference traces.
  let failedSandbox = 0;
  for (const r of sandboxRowsOf(workspaceConfig)) {
    try {
      const parsed = JSON.parse(String(r?.lastResponse || "null"));
      if (parsed && (parsed.ok === false || (Number.isFinite(Number(parsed.exitCode)) && Number(parsed.exitCode) !== 0))) failedSandbox += 1;
    } catch { /* ignore */ }
  }
  add("failed_sandbox_run", "Failed sandbox runs — capture as corrective traces", failedSandbox, "collect_traces");

  // Base-model responses where a tuned tag was expected → verification gap.
  let baseModelResponses = 0;
  const tunedTags = new Set(
    (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
      .filter((o) => o?.objectType === "model-training")
      .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
      .map((r) => String(r?.localModel || "").trim())
      .filter(Boolean),
  );
  for (const r of registryRowsOf(workspaceConfig)) {
    try {
      const parsed = JSON.parse(String(r?.lastResponse || "null"));
      const served = String(parsed?.model || "").trim();
      if (served && tunedTags.size > 0 && !tunedTags.has(served) && String(r?.baseModel || "") === served) baseModelResponses += 1;
    } catch { /* ignore */ }
  }
  add("base_model_response", "Endpoint served the base model where a tuned tag was expected", baseModelResponses, "test_endpoint");

  // Rejected / corrected helper proposals → preference data.
  const receipts = workspaceSourceRecords?.["helper:apply:receipts"];
  const receiptRows = Array.isArray(receipts?.records) ? receipts.records : [];
  const rejected = receiptRows.filter((r) => String(r?.outcome || "") === "skipped").length;
  const corrected = receiptRows.filter((r) => String(r?.outcome || "") === "corrected" || r?.correctedFrom).length;
  add("rejected_proposal", "Rejected helper proposals — negative preference traces", rejected, "collect_traces");
  add("corrected_proposal", "Corrected helper proposals — high-signal preference traces", corrected, "collect_traces");

  // Self-eval exhaustion (escalations) recorded in the export history.
  const exportHist = workspaceSourceRecords?.[`training:model-training:${slug}`];
  let escalations = 0;
  for (const rec of (Array.isArray(exportHist?.records) ? exportHist.records : [])) escalations += Number(rec?.escalations) || 0;
  add("self_eval_exhausted", "Self-eval escalations — failure modes to train against", escalations, "collect_traces");

  // Low-quality traces below the curation floor.
  const pipeline = deriveDistillationPipelineState({ workspaceConfig, minScore });
  add("low_quality_traces", "Traces below the quality floor — re-grade or correct", Math.max(0, pipeline.total - pipeline.graded), "curate_traces");

  // Failed training runs.
  const runState = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug }).runState;
  add("failed_training_run", "Failed training runs — adjust profile/dataset and re-run", runState.failed ? runState.runs.filter((r) => r.stage === "failed").length : 0, "prepare_run");

  const totalGapSignals = gaps.reduce((acc, g) => acc + g.count, 0);
  return {
    gaps: gaps.sort((a, b) => b.count - a.count),
    totalGapSignals,
    hasGaps: gaps.length > 0,
    recommendation: gaps.length === 0
      ? "No new training gaps detected from recent usage."
      : `Re-train from gaps: ${gaps[0].label.toLowerCase()} (${gaps[0].count}).`,
  };
}
