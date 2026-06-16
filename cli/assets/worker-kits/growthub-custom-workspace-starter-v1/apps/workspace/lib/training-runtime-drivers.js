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

/**
 * Lifecycle driver definitions in dependency order. Action tokens are the
 * §13 canonical vocabulary so page / sidecar / modal / cockpit all speak one
 * language. `choose_profile` is the action the `export → prepared` gap emits
 * (the user opens the modal and picks a profile); `fix_redaction`,
 * `export_gap_traces`, `prepare_next_training_run`, and `open_custom_models`
 * are conditional overrides applied below, not lifecycle rows.
 */
const DRIVER_DEFS = [
  { id: "collect", label: "Collect governed traces", action: "collect_traces" },
  { id: "curate", label: "Curate qualified traces", action: "curate_traces" },
  { id: "export", label: "Export training dataset", action: "export_dataset" },
  { id: "prepare", label: "Prepare training run", action: "prepare_training_run" },
  { id: "train", label: "Run training", action: "run_training" },
  { id: "import", label: "Import model artifact", action: "import_artifact" },
  { id: "register", label: "Register model endpoint", action: "register_endpoint" },
  { id: "verify", label: "Verify tuned model", action: "verify_tuned_model" },
  { id: "bind", label: "Bind smoke workflow", action: "bind_smoke_workflow" },
  { id: "smoke", label: "Run smoke test", action: "run_smoke_test" },
];

/**
 * Canonical destination per action — the CEO/Agent-Teams discipline: the
 * cockpit LINKS to the authority that owns the write, it never executes from
 * the card. Data Model = edit authority, API Registry = endpoint authority,
 * Workflow Canvas = graph/execution authority, /training = the runtime modal,
 * /custom-models = the completed-capability cockpit.
 */
const ACTION_DESTINATIONS = {
  collect_traces: { route: "/data-model", cta: "Open Data Model", authority: "training-traces" },
  fix_redaction: { route: "/data-model", cta: "Resolve redaction in Data Model", authority: "training-traces" },
  curate_traces: { route: "/training", cta: "Open training runtime", authority: "model-training" },
  export_dataset: { route: "/training", cta: "Export dataset", authority: "model-training" },
  choose_profile: { route: "/training", cta: "Choose training profile", authority: "model-training-run" },
  prepare_training_run: { route: "/training", cta: "Prepare training run", authority: "model-training-run" },
  run_training: { route: "/training", cta: "Open training runtime", authority: "model-training-run" },
  import_artifact: { route: "/training", cta: "Import artifact", authority: "model-training-run" },
  register_endpoint: { route: "/data-model", cta: "Open API Registry", authority: "api-registry" },
  verify_tuned_model: { route: "/data-model", cta: "Open API Registry test", authority: "api-registry" },
  bind_smoke_workflow: { route: "/workflows", cta: "Open Workflow Canvas", authority: "sandbox-environment" },
  run_smoke_test: { route: "/workflows", cta: "Run smoke workflow", authority: "sandbox-environment" },
  export_gap_traces: { route: "/training", cta: "Export gap traces", authority: "training-traces" },
  prepare_next_training_run: { route: "/training", cta: "Prepare next training run", authority: "model-training-run" },
  open_custom_models: { route: "/custom-models", cta: "Open Custom Models", authority: "model-training" },
  complete: { route: "/custom-models", cta: "Open Custom Models", authority: "model-training" },
};

export function destinationForAction(action) {
  return ACTION_DESTINATIONS[action] || ACTION_DESTINATIONS.complete;
}

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
    // Monotonic with runtime state: once the lifecycle has reached `exported`,
    // collection and curation are by definition done — a completed model never
    // regresses to "collect" just because traces were since cleared/exported.
    collect: pipeline.total > 0 || reached("exported"),
    curate: pipeline.graded >= MIN_FINETUNE_TRACES || reached("exported"),
    export: reached("exported"),
    // Monotonic: a model that reached a later stage (incl. the registry-first
    // `complete` path with no run receipt — surfaced separately as runGap) has
    // a prepared run behind it. The missing receipt is a gap flag, not a demotion.
    prepare: reached("prepared"),
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
    // Conditional action overrides on the ACTIVE step (the derivers decide,
    // never the JSX):
    //   - redaction-blocked traces are the obstacle → fix_redaction
    //   - exported-but-no-run → the next move is choosing a profile
    let action = def.action;
    let reason = completion[def.id] ? "complete" : blockedReason[def.id];
    if (state !== "complete" && i === activeIndex) {
      if (def.id === "curate" && pipeline.blocked > 0 && pipeline.graded < MIN_FINETUNE_TRACES) {
        action = "fix_redaction";
        reason = `${pipeline.blocked} trace(s) are redaction-blocked and cannot enter the corpus; resolve or replace them.`;
        state = "blocked";
      } else if (def.id === "curate" && pipeline.graded === 0 && pipeline.total > 0) {
        state = "blocked";
      } else if (def.id === "prepare" && runtime.state === "exported") {
        action = "choose_profile";
      }
    }
    const dest = destinationForAction(action);
    return {
      id: def.id,
      label: def.label,
      action,
      state,
      // §13 exact field names + back-compat aliases.
      impact: scoreTrainingDriverImpact(i, activeIndex, total),
      impactScore: scoreTrainingDriverImpact(i, activeIndex, total),
      reason,
      blockingProof: completion[def.id] ? "" : reason,
      destination: dest.route,
      cta: dest.cta,
      ctaLabel: dest.cta,
      canonicalDestination: dest.route,
      canonicalObject: dest.authority,
    };
  });

  // Feedback awareness for the complete state — a completed model is never
  // demoted; new gaps become the next cycle's action.
  const gapState = activeIndex < 0 ? deriveTrainingGapDrivers({ workspaceConfig, workspaceSourceRecords, slug, minScore }) : { hasGaps: false };
  const active = drivers.find((d) => d.state === "active" || d.state === "blocked") || null;
  let nextBestAction;
  if (activeIndex < 0) nextBestAction = gapState.hasGaps ? "export_gap_traces" : "open_custom_models";
  else nextBestAction = active?.action || "complete";
  const nextDest = destinationForAction(nextBestAction);
  const topBlocker = activeIndex < 0
    ? (gapState.hasGaps ? `Complete — ${gapState.totalGapSignals} improvement signal(s) ready for the next cycle.` : "Loop complete — verified, runnable, and improving from usage.")
    : (active?.reason || "");

  // Confidence = evidence depth: fraction of the lifecycle proven, lightly
  // boosted by corroborating run-receipt evidence. Deterministic, 0..1.
  const proven = drivers.filter((d) => d.state === "complete").length;
  const corroboration = (runState.present ? 0.05 : 0) + (runState.datasetExportLinked ? 0.05 : 0);
  const confidence = Number(Math.min(1, proven / total + corroboration).toFixed(4));

  return {
    nextBestAction,
    nextActionDestination: nextDest.route,
    nextActionCta: nextDest.cta,
    nextActionCanonicalObject: nextDest.authority,
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
  add("base_model_response", "Endpoint served the base model where a tuned tag was expected", baseModelResponses, "verify_tuned_model");

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
  add("failed_training_run", "Failed training runs — adjust profile/dataset and re-run", runState.failed ? runState.runs.filter((r) => r.stage === "failed").length : 0, "prepare_next_training_run");

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
