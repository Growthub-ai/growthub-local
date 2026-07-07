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
import { SUPPORTED_QUANTIZATIONS } from "./training-artifacts.js";

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
  // Remediation actions — the one-click derived solutions the SAME modal
  // offers when a lifecycle stage fails. Each lands on the runtime modal
  // (the /training authority), never a new surface.
  remediate_preflight: { route: "/training", cta: "Lower footprint & re-run", authority: "model-training-run" },
  requantize_artifact: { route: "/training", cta: "Re-quantize & re-run", authority: "model-training-run" },
  cleanse_traces: { route: "/training", cta: "Clean & reformat traces", authority: "training-traces" },
  rechunk_corpus: { route: "/training", cta: "Re-chunk corpus & re-run", authority: "model-training-run" },
  retry_finetune: { route: "/training", cta: "Adjust & re-run the fine-tune", authority: "model-training-run" },
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

// ===========================================================================
// Remediation sub-registry — the SAME pure-deriver brain applied to execution
// failure points, so every stage that can fail yields a deterministic, one-
// click derived solution surfaced minimally in the SAME modal (never a new
// surface, never auto-run without the user's click). It consumes the composed
// runtime state (preflight, progress, artifact.quant, run failure) and the
// corpus format/shard derivers below, and emits ranked remedies exactly like
// the lifecycle drivers — one governed action token each, keyed to the same
// receipt lifecycle. Pure, seeded, never throws.
// ===========================================================================

const TRACES_OBJECT_ID = "training-traces";

/**
 * Curation quality floors. 10 is the hard fine-tune floor (OpenAI SFT / local
 * QLoRA minimum); 50 is the "high-quality custom model" floor the pipeline
 * treats as the confident tier. Both are academically grounded minimums, not
 * targets — more is better, these are the gates.
 */
export const HIGH_QUALITY_TRACE_FLOOR = 50;

/**
 * Deterministic shard/chunk plan for the local distillation → conversion pass.
 * A large corpus is processed in ordered, content-addressable chunks so the
 * runner can stream shards through distillation → fine-tune conversion without
 * holding the whole set in memory, and each shard is idempotent by index +
 * dataset sha (re-runs reproduce the exact same shards — never re-fabricated).
 * This is the governed orchestration layer that FEEDS the trainer's clustering
 * deterministically; it does not itself implement expert/weight internals.
 * Pure, never throws.
 */
export function deriveShardPlan({ totalRecords = 0, chunkSize = 64, datasetSha = "" } = {}) {
  const total = Math.max(0, Math.floor(Number(totalRecords) || 0));
  const size = Math.max(1, Math.floor(Number(chunkSize) || 64));
  const shardCount = Math.ceil(total / size) || 0;
  const sha = String(datasetSha || "").trim();
  const shards = [];
  for (let i = 0; i < shardCount; i += 1) {
    const start = i * size;
    const end = Math.min(total, start + size);
    shards.push({
      index: i,
      start,
      end,
      count: end - start,
      // Content-addressable, deterministic shard id: same corpus sha + index
      // ⇒ same key on every re-run (idempotent shard identity).
      shardKey: `${sha || "nosha"}:${i}:${start}-${end}`,
    });
  }
  return { totalRecords: total, chunkSize: size, shardCount, shards };
}

/**
 * Trace-format state — the deterministic, agentic-cleansing target. Scans the
 * governed `training-traces` rows and classifies each as clean, auto-cleanable
 * (whitespace / control-char / non-serializable content a fixed rule can
 * normalize into strict JSONL), or needs-grade (present content but no quality
 * score — routes to curation, never auto-graded). Redaction-blocked rows are
 * never cleansable. Pure, never throws — the rules are fixed and deterministic.
 */
export function deriveTraceFormatState({ workspaceConfig, minScore = DEFAULT_MIN_SCORE } = {}) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((o) => o?.id === TRACES_OBJECT_ID);
  const rows = Array.isArray(object?.rows) ? object.rows : [];

  let clean = 0, autoCleanable = 0, needsGrade = 0, blocked = 0;
  const issues = [];
  const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/; // control chars (excl. tab/newline/cr)
  rows.forEach((row, index) => {
    if (String(row?.redactionStatus || "").toLowerCase() === "blocked") { blocked += 1; return; }
    const prompt = String(row?.inputPrompt ?? "");
    const output = String(row?.agentOutput ?? "");
    if (!prompt.trim() || !output.trim()) return; // empty ⇒ not a trace, ignored
    const untrimmed = prompt !== prompt.trim() || output !== output.trim();
    const control = CONTROL.test(prompt) || CONTROL.test(output);
    const hasScore = Number.isFinite(Number(row?.qualityScore));
    if (untrimmed || control) {
      autoCleanable += 1;
      issues.push({ index, fix: "reformat", reason: control ? "control characters in trace" : "untrimmed whitespace" });
    } else if (!hasScore) {
      needsGrade += 1;
      issues.push({ index, fix: "grade", reason: "reasoning trace present but ungraded" });
    } else {
      clean += 1;
    }
  });

  return {
    total: rows.length,
    clean,
    autoCleanable,
    needsGrade,
    blocked,
    // Only whitespace/control normalization is safe to auto-apply with fixed
    // rules; grading is a curation decision, never auto-written.
    needsCleanse: autoCleanable > 0,
    issues,
  };
}

/**
 * The unified remediation deriver. For each execution failure point it emits a
 * ranked, deterministic, one-click remedy grounded in the real receipt state.
 * `autoFixable` marks remedies a fixed rule can apply agentically on one click
 * (trace cleansing, lower-footprint re-run); the rest re-run the governed
 * runner with an adjusted, derived parameter. Never auto-executes — it derives
 * the button; the modal shows the single top remedy minimally. Pure.
 */
export function deriveTrainingRemediation({ workspaceConfig, workspaceSourceRecords, minScore = DEFAULT_MIN_SCORE, slug = "workspace-local" } = {}) {
  const runtime = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug });
  const runState = runtime.runState || {};
  const format = deriveTraceFormatState({ workspaceConfig, minScore });
  const remedies = [];

  const push = (r) => {
    const dest = destinationForAction(r.action);
    remedies.push({ ...r, destination: dest.route, cta: dest.cta, canonicalObject: dest.authority, oneClick: true });
  };

  // 1. Preflight blocked — system shortfall. Highest severity (nothing ran).
  const pf = runState.preflight;
  if (runState.runState === "failed" && pf && pf.ok === false) {
    push({
      id: "preflight", failurePoint: "preflight", severity: 1.0, autoFixable: true,
      action: "remediate_preflight",
      reason: String(runState.latest?.blockedReason || runState.reason || "Preflight blocked — insufficient system resources."),
      // Deterministic derived fix: shrink the footprint that failed — lower the
      // quant target one step and/or reduce shard size so the disk/RAM/VRAM
      // floor drops, then re-run the same run id.
      derivedFix: "Lower the quant footprint (e.g. q8_0 → q4_k_m) and reduce shard size, then re-run.",
    });
  }

  // 2. Quantization contradiction — the file is not actually quantized.
  const quant = runState.artifact?.quant;
  if (quant && quant.measured && !quant.verified) {
    push({
      id: "quant", failurePoint: "quantize", severity: 0.9, autoFixable: false,
      action: "requantize_artifact",
      reason: quant.reason,
      derivedFix: "Re-run the quantize stage (imatrix + llama-quantize) — the produced GGUF did not shrink from fp16.",
    });
  }

  // 3. Corpus format — reasoning traces need cleansing/reformatting to JSONL.
  if (format.needsCleanse) {
    push({
      id: "format", failurePoint: "distill", severity: 0.6, autoFixable: true,
      action: "cleanse_traces",
      reason: `${format.autoCleanable} reasoning trace(s) need normalization to strict JSONL (whitespace/control chars).`,
      derivedFix: "Apply the deterministic cleanse rules (trim + strip control chars), re-serialize as JSONL.",
    });
  }

  // 4. Fine-tune run failed (non-preflight) — retry with an adjusted profile.
  if (runState.runState === "failed" && !(pf && pf.ok === false)) {
    push({
      id: "finetune", failurePoint: "fine-tune", severity: 0.8, autoFixable: false,
      action: "retry_finetune",
      reason: String(runState.reason || "The fine-tune run reported a failure."),
      derivedFix: "Re-run the same run id with the adjusted profile/dataset — resumes the receipt, never forks.",
    });
  }

  remedies.sort((a, b) => b.severity - a.severity);
  return {
    remedies,
    hasRemedies: remedies.length > 0,
    // The SINGLE top remedy the modal renders minimally (one line + one button).
    top: remedies[0] || null,
    format,
  };
}

// ===========================================================================
// Stage-event failure catalog + explicit causation-driver functions.
// The driver layer never says just "training failed": it classifies the exact
// stage issue, carries the evidence, and returns the ONE-CLICK next action.
// Pure, deterministic, never throws — GPU-free and fully unit-testable. Every
// entry is grounded in a real failure mode (HF Trainer callbacks/checkpoints,
// torch CUDA OOM, nvidia-smi readings, ollama create/chat, argv execution).
// ===========================================================================

/** Per-stage known-failure catalog → issue code, severity, message, action. */
export const TRAINING_STAGE_ISSUES = {
  preflight: [
    { issue: "preflight_blocked", match: (r) => String(r?.status) === "blocked" || r?.preflight?.ok === false, severity: "blocked", action: "remediate_preflight",
      message: (e) => e.shortfall || "Your machine does not meet the resource floor. Nothing started yet." },
  ],
  distilling: [
    { issue: "distill_floor_unmet", match: (_, __, l) => /floor|too few|min.*trace/i.test(l), severity: "blocked", action: "cleanse_traces", message: (e) => `${e.accepted || 0}/${e.totalRecords || 0} examples distilled — below the floor.` },
    { issue: "distill_format_failed", match: (_, __, l) => /jsonl|schema|empty prompt|invalid row/i.test(l), severity: "blocked", action: "cleanse_traces", message: (e) => `${e.rejected || 0} traces failed format — cleanse and retry the failed range.` },
    { issue: "distill_teacher_failed", match: (_, __, l) => /teacher|rate.?limit|api error|timeout/i.test(l), severity: "blocked", action: "retry_finetune", message: () => "The teacher endpoint was unavailable — retry the failed range only." },
  ],
  "fine-tuning": [
    { issue: "fine_tune_oom", match: (_, __, l) => /outofmemory|cuda out of memory|oom/i.test(l), severity: "blocked", action: "retry_finetune_smaller_batch", message: (e) => `Fine-tuning stopped at step ${e.step ?? "?"}/${e.totalSteps ?? "?"}: GPU memory ran out.` },
    { issue: "fine_tune_dependency_failed", match: (_, __, l) => /modulenotfound|importerror|no module named/i.test(l), severity: "blocked", action: "retry_finetune", message: () => "A required package is missing on the runner." },
    { issue: "fine_tune_unstable_loss", match: (_, __, l) => /nan loss|loss.*nan|diverg/i.test(l), severity: "blocked", action: "retry_finetune", message: () => "Loss went NaN — lower the learning rate and re-run." },
    { issue: "fine_tune_interrupted", match: (_, __, l) => /killed|sigkill|interrupted|checkpoint.*fail/i.test(l), severity: "blocked", action: "retry_finetune", message: (e) => `Run interrupted at step ${e.step ?? "?"} — resume from checkpoint.` },
  ],
  converting: [
    { issue: "convert_failed", match: () => true, severity: "blocked", action: "retry_finetune", message: () => "Training finished, but GGUF conversion failed — validate merged model + tokenizer, re-run conversion." },
  ],
  quantizing: [
    { issue: "quant_size_contradiction", match: (r) => { const q = r?.artifact ? deriveArtifactStateSafe(r.artifact) : null; return q && q.quant && q.quant.measured && !q.quant.verified; }, severity: "blocked", action: "requantize_artifact",
      message: (e) => `Quantization did not prove ${e.quant || "the level"}: ${gbSafe(e.sourceBytes)} → ${gbSafe(e.artifactBytes)}.` },
    { issue: "quant_failed", match: (_, __, l) => /imatrix|llama-quantize|corrupt|f16.*missing/i.test(l), severity: "blocked", action: "requantize_artifact", message: () => "Quantization failed — retry, choose a supported level, or free disk." },
  ],
  serving: [
    { issue: "serve_registration_failed", match: () => true, severity: "blocked", action: "retry_finetune", message: () => "Model built, but local serving is not registered yet — start Ollama, retry create with a unique tag." },
  ],
  verifying: [
    { issue: "verify_base_model", match: (r, __, l) => /served the base|base.?model/i.test(l) || r?.__verify === "base", severity: "blocked", action: "verify_tuned_model", message: (e) => `Endpoint answered, but it served ${e.servedModel || "the base model"}, not your tuned model.` },
    { issue: "verify_mismatch", match: (r) => r?.__verify === "mismatch", severity: "blocked", action: "verify_tuned_model", message: (e) => `Endpoint served ${e.servedModel || "a different tag"} — refresh the registry row and retry.` },
    { issue: "verify_no_output_hash", match: (r) => r?.__verify === "no-output-hash", severity: "warn", action: "run_smoke_test", message: () => "Verified the tag, but no workflow outputHash yet — run it once to complete." },
  ],
  complete: [
    { issue: "registry_unbound", match: (r) => r?.__complete === "registry-unbound", severity: "warn", action: "register_endpoint", message: () => "Artifact exists but no API Registry row is bound." },
    { issue: "completion_unproven", match: (r) => r?.__complete === "unproven", severity: "warn", action: "run_smoke_test", message: () => "Trained and served — one proof step remains: run it once." },
    { issue: "duplicate_run", match: (r) => r?.__complete === "duplicate", severity: "warn", action: "prepare_next_training_run", message: () => "A duplicate run row was detected — dedupe by trainingRunId." },
  ],
};

function gbSafe(b) { const n = Number(b); return Number.isFinite(n) && n > 0 ? `${(n / 1e9).toFixed(1)} GB` : "?"; }
/**
 * Read a run row's artifact as the GOVERNED shape: rows persist FLAT columns
 * (artifactType/artifactModelTag/artifactPath/artifactSha256/artifactQuantization/
 * artifactSourceBytes/artifactArtifactBytes); the nested `artifact` object is
 * only present on sidecar receipts. Reconstruct from flat when absent so every
 * driver reads the real row, not an assumed nested object.
 */
function rowArtifact(runRow) {
  if (runRow?.artifact && typeof runRow.artifact === "object") return runRow.artifact;
  if (runRow?.artifactType || runRow?.artifactModelTag) {
    return { type: runRow.artifactType, modelTag: runRow.artifactModelTag, path: runRow.artifactPath, sha256: runRow.artifactSha256, quantization: runRow.artifactQuantization, sourceBytes: runRow.artifactSourceBytes, artifactBytes: runRow.artifactArtifactBytes };
  }
  return {};
}
// Local guard: artifact-state without importing (drivers already read receipts).
function deriveArtifactStateSafe(a) { try { return { quant: { measured: Number(a?.sourceBytes) > 0 && Number(a?.artifactBytes) > 0, verified: Number(a?.artifactBytes) > 0 && Number(a?.sourceBytes) > 0 && (Number(a.artifactBytes) / Number(a.sourceBytes)) < 0.9 } }; } catch { return null; } }

/**
 * Classify the exact stage issue for a failed/blocked run. Returns the rich
 * driver object { stageId, issue, severity, userMessage, evidence, nextAction }
 * (the user-spec shape) — not a generic "failed". Pure.
 */
export function deriveTrainingStageIssue(runRow = {}, systemProbe = null, logs = "") {
  const progress = runRow?.progress && typeof runRow.progress === "object" ? runRow.progress : {};
  const stageId = String(progress.stageId || "").trim() || (String(runRow?.status) === "blocked" ? "preflight" : "fine-tuning");
  const log = String(logs || runRow?.blockedReason || "");
  const pf = runRow?.preflight || systemProbe || {};
  const artifact = rowArtifact(runRow);
  const evidence = {
    step: progress.counter, totalSteps: progress.totalRecords || progress.total,
    accepted: progress.counter, totalRecords: progress.totalRecords, rejected: progress.rejected,
    quant: artifact.quantization, sourceBytes: artifact.sourceBytes, artifactBytes: artifact.artifactBytes,
    vramFreeGB: pf?.gpu?.vramFreeGB, requiredGB: pf?.floor?.vramGB, ramGB: pf?.ramGB, diskFreeGB: pf?.diskFreeGB,
    checkpointPath: progress.checkpointPath, servedModel: runRow?.__servedModel, shortfall: runRow?.blockedReason,
  };
  const candidates = TRAINING_STAGE_ISSUES[stageId] || [];
  const hit = candidates.find((c) => { try { return c.match(runRow, systemProbe, log); } catch { return false; } });
  if (!hit) return { stageId, issue: `${stageId}_failed`, severity: "blocked", userMessage: log || `The ${stageId} stage failed.`, evidence, nextAction: deriveTrainingNextAction({ action: "retry_finetune", stageId }) };
  return { stageId, issue: hit.issue, severity: hit.severity, userMessage: hit.message(evidence), evidence, nextAction: deriveTrainingNextAction({ action: hit.action, stageId, issue: hit.issue }) };
}

/** The one-click next action for an issue (routes through the sanctioned modal). */
export function deriveTrainingNextAction({ action, stageId, issue } = {}) {
  const dest = destinationForAction(action);
  const labels = {
    remediate_preflight: "Lower footprint & re-run", requantize_artifact: "Re-quantize & re-run",
    cleanse_traces: "Clean & reformat traces", retry_finetune: "Adjust & re-run the fine-tune",
    retry_finetune_smaller_batch: "Resume with a smaller batch", verify_tuned_model: "Re-test the endpoint",
    run_smoke_test: "Run it once in a workflow", register_endpoint: "Bind the API Registry row",
    prepare_next_training_run: "Prepare a fresh run",
  };
  return { label: labels[action] || "Re-run", action: action === "retry_finetune_smaller_batch" ? "retry_finetune" : action, variant: action, oneClick: true, stageId: stageId || "", issue: issue || "", destination: dest.route, cta: dest.cta };
}

/**
 * Waiting-UX state (never fabricated progress). Bar pct comes ONLY from the
 * receipt; elapsed + last-proof age are reported SEPARATELY as text.
 */
export function deriveTrainingWaitState(runRow = {}, nowMs = 0) {
  const p = runRow?.progress && typeof runRow.progress === "object" ? runRow.progress : null;
  const hasProgress = Boolean(p && (Number(p.pct) > 0 || p.stageId));
  const startMs = Date.parse(runRow?.startedAt || "") || 0;
  const proofMs = Date.parse(runRow?.lastProofAt || runRow?.completedAt || runRow?.startedAt || "") || 0;
  const mins = startMs && nowMs ? Math.max(0, Math.round((nowMs - startMs) / 60000)) : null;
  const proofAgoS = proofMs && nowMs ? Math.max(0, Math.round((nowMs - proofMs) / 1000)) : null;
  const statusLine = hasProgress
    ? [p.stageId && `${p.stageId}`, (p.counter != null && p.totalRecords != null) ? `step ${p.counter}/${p.totalRecords}` : null, p.detail].filter(Boolean).join(" · ")
    : "Waiting for runner stamp…";
  return { waiting: !hasProgress, barPct: hasProgress ? Math.max(0, Math.min(100, Number(p.pct) || 0)) : 0, statusLine, elapsedLine: mins != null ? `Running for ${mins}m${proofAgoS != null ? ` · last proof ${proofAgoS}s ago` : ""}` : "" };
}

/**
 * The 9-milestone proof checklist — each item is proven ONLY by real evidence
 * on the governed rows (no optimistic ticks). Pure.
 */
export function deriveTrainingProofChecklist(runRow = {}, apiRegistryRow = null, smokeRun = null) {
  const a = rowArtifact(runRow);
  const pf = runRow?.preflight || {};
  const quantProven = Number(a.sourceBytes) > 0 && Number(a.artifactBytes) > 0 && (Number(a.artifactBytes) / Number(a.sourceBytes)) < 0.9;
  const served = String(apiRegistryRow?.lastResponse ? tryModel(apiRegistryRow.lastResponse) : "");
  const outputHash = String(smokeRun?.outputHash || runRow?.outputHash || "").trim();
  const items = [
    { id: "preflight-pass", label: "Preflight passed", proven: pf?.ok === true, evidence: { ramGB: pf.ramGB, diskFreeGB: pf.diskFreeGB, gpu: pf.gpu } },
    { id: "distilling-counter", label: "Corpus distilled", proven: Number(runRow?.progress?.totalRecords) > 0 || Number(runRow?.datasetRecords) > 0, evidence: { totalRecords: runRow?.progress?.totalRecords } },
    { id: "finetune-step", label: "Fine-tune ran", proven: ["trained", "imported"].includes(String(runRow?.status)) || Boolean(a.type), evidence: { status: runRow?.status } },
    { id: "convert-gguf", label: "GGUF produced", proven: /gguf/i.test(String(a.type)) && Boolean(a.path), evidence: { path: a.path } },
    { id: "quant-size-proof", label: "Quantization proven by size delta", proven: quantProven, evidence: { sourceBytes: a.sourceBytes, artifactBytes: a.artifactBytes, quant: a.quantization } },
    { id: "ollama-create", label: "Served on Ollama", proven: String(apiRegistryRow?.status) === "connected", evidence: { status: apiRegistryRow?.status } },
    { id: "chat-verify-tuned", label: "Endpoint serves the tuned tag (not base)", proven: Boolean(served) && served === String(a.modelTag || apiRegistryRow?.expectedModelTag || ""), evidence: { servedModel: served, expected: a.modelTag } },
    { id: "registry-live", label: "API Registry row bound", proven: Boolean(apiRegistryRow), evidence: { integrationId: apiRegistryRow?.integrationId } },
    { id: "workflow-smoke-outputhash", label: "Workflow smoke wrote outputHash", proven: Boolean(outputHash), evidence: { outputHash } },
  ];
  const done = items.filter((i) => i.proven).length;
  return { items, done, total: items.length, complete: done === items.length };
}

function tryModel(s) { try { const p = typeof s === "string" ? JSON.parse(s) : s; return String(p?.model || "").trim(); } catch { return ""; } }

/**
 * The concrete completion reward — the dopamine payload. Only returns `live:
 * true` when the whole proof chain holds; otherwise names what remains. Pure.
 */
export function deriveTrainingCompletionReward(runRow = {}, verification = null) {
  const a = rowArtifact(runRow);
  const checklist = deriveTrainingProofChecklist(runRow, verification?.apiRegistryRow || null, verification?.smokeRun || null);
  const live = checklist.complete;
  return {
    live,
    headline: live ? "Your custom model is live locally." : `Almost — ${checklist.total - checklist.done} proof step(s) remain.`,
    trainedTag: String(a.modelTag || ""), baseModel: String(runRow?.baseModel || ""), artifactSha: String(a.sha256 || ""),
    quantDelta: (Number(a.sourceBytes) > 0 && Number(a.artifactBytes) > 0) ? `${gbSafe(a.sourceBytes)} → ${gbSafe(a.artifactBytes)} (${a.quantization || ""})` : "",
    localEndpoint: String(verification?.apiRegistryRow?.baseUrl || ""), verifiedResponseModel: String(verification?.servedModel || ""), outputHash: String(verification?.smokeRun?.outputHash || runRow?.outputHash || ""),
    checklist,
  };
}

// ===========================================================================
// Long-running pipeline safety — resume state + serving profile capability.
// Governed, resumable, failure-aware; pure + testable. Proof-bound: serving
// optimizations are recorded from the registry row and never claimed without
// a served-tag readback proving the tuned MAIN model is still the authority.
// ===========================================================================

/**
 * Resume state for an interrupted fine-tune: reads the last checkpoint the run
 * stamped and returns the one-click resume action (smaller batch on OOM). A
 * failure with no checkpoint honestly reports a full re-run, never a fake
 * mid-file recovery. Pure.
 */
export function deriveTrainingResumeState(runRow = {}) {
  const p = runRow?.progress && typeof runRow.progress === "object" ? runRow.progress : {};
  const failed = String(runRow?.status) === "failed";
  const atFineTune = String(p.stageId) === "fine-tuning";
  const checkpointPath = p.checkpointPath ? String(p.checkpointPath) : "";
  const step = Number(p.step) || 0;
  const oom = /out of memory|oom/i.test(String(runRow?.blockedReason || ""));
  const resumable = failed && atFineTune && Boolean(checkpointPath);
  return {
    resumable,
    checkpointPath,
    step,
    loss: Number.isFinite(Number(p.loss)) ? Number(p.loss) : null,
    resumeAction: resumable
      ? { label: oom ? "Resume from checkpoint with a smaller batch" : "Resume from checkpoint", action: "retry_finetune", variant: oom ? "retry_finetune_smaller_batch" : "retry_finetune", oneClick: true, args: { resumeFrom: checkpointPath, fromStep: step, smallerBatch: oom } }
      : null,
    reason: resumable
      ? `Resumable from ${checkpointPath} (step ${step})`
      : failed ? "Failed with no checkpoint — quantization/other stages restart from the last completed prior artifact, not mid-file." : "",
  };
}

/** Serving adapters the workspace records as governed capabilities. */
export const SERVING_ADAPTERS = ["ollama", "llama.cpp-server", "vllm", "openai-compatible"];

/**
 * Governed serving profile from an API Registry row — the ACTUAL serving
 * adapter/mode/flags + optional continuous-batching and speculative-decoding,
 * proof-bound to a served-tag readback. `servesTunedTag` is the authority
 * proof: the served MAIN model must equal the tuned tag (a speculative draft
 * model never routes the user back to the base). Pure, no throughput claims.
 */
export function deriveServingProfile(registryRow = {}, { expectedTag = "" } = {}) {
  const local = String(registryRow?.baseUrl || "").includes(":11434");
  const declared = String(registryRow?.servingAdapter || (local ? "ollama" : "openai-compatible"));
  const adapter = SERVING_ADAPTERS.includes(declared) ? declared : "openai-compatible";
  const served = tryModel(registryRow?.lastResponse);
  const expected = String(expectedTag || registryRow?.expectedModelTag || "");
  const servesTuned = Boolean(served) && served === expected;
  return {
    adapter,
    mode: String(registryRow?.servingMode || "single"),
    continuousBatching: registryRow?.continuousBatching === true,
    speculative: registryRow?.speculativeDraftModel
      ? { draftModel: String(registryRow.speculativeDraftModel), mainModel: expected }
      : null,
    flags: registryRow?.servingFlags && typeof registryRow.servingFlags === "object" ? registryRow.servingFlags : {},
    endpoint: `${String(registryRow?.baseUrl || "")}${String(registryRow?.endpoint || "")}`,
    servedModel: served,
    // Proof: the tuned MAIN model is the authority — never a throughput claim.
    servesTunedTag: servesTuned,
    verified: servesTuned,
    reason: servesTuned
      ? `Serving ${served} via ${adapter}${registryRow?.continuousBatching ? " (continuous batching)" : ""}${registryRow?.speculativeDraftModel ? " (speculative)" : ""}`
      : served ? `Endpoint served ${served}, not the tuned tag ${expected || "(none)"}` : "no served-model proof yet",
  };
}

/**
 * Adaptive local-model & runtime choices — derived from the workspace's OWN
 * rows so the profile step never hardcodes a "Gemma / Ollama is the only path"
 * assumption. The customer sees the base models and runtimes THEIR workspace
 * actually carries; if none are configured they get an honest setup-needed
 * state instead of a fake default. Pure, no-I/O, never-throws.
 *
 * Sources of truth, in priority order:
 *   - base models   → distinct `baseModel` on model-training rows (the model
 *                     the user already picked), else the seeded fallbacks.
 *   - local models  → distinct `localModel` on model-training rows (already
 *                     tuned tags — reusable as a resume/rebase base).
 *   - runtimes      → the ACTUAL serving adapter of every api-registry row
 *                     that looks like a model endpoint (ollama :11434 →
 *                     "ollama", other chat endpoints → "openai-compatible"),
 *                     plus a live `model-training-runner` sandbox row implying
 *                     a local runner is present. `configured` is true only when
 *                     at least one real runtime row was found.
 */
export function deriveLocalModelChoices({ workspaceConfig, fallbackBaseModels = [] } = {}) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rowsOf = (pred) => objects.filter(pred).flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
  const trainingRows = rowsOf((o) => o?.objectType === "model-training");
  const registryRows = rowsOf((o) => o?.objectType === "api-registry");

  const distinct = (values) => [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
  const baseModels = distinct(trainingRows.map((r) => r.baseModel));
  const localModels = distinct(trainingRows.map((r) => r.localModel));

  // A registry row is a model runtime when it advertises chat-completions /
  // custom-model kind or points at a chat endpoint — never a generic data row.
  const isModelRow = (r) =>
    String(r?.kind || "") === "custom-model"
    || /chat-completions|inference/i.test(String(r?.capabilities || r?.capabilityType || r?.entityTypes || ""))
    || /\/chat\/completions/i.test(String(r?.endpoint || ""));
  const runtimes = [];
  const seenAdapters = new Set();
  for (const r of registryRows.filter(isModelRow)) {
    const adapter = String(r?.baseUrl || "").includes(":11434") ? "ollama" : String(r?.servingAdapter || "openai-compatible");
    const key = `${adapter}::${String(r?.baseUrl || "")}`;
    if (seenAdapters.has(key)) continue;
    seenAdapters.add(key);
    runtimes.push({
      adapter: SERVING_ADAPTERS.includes(adapter) ? adapter : "openai-compatible",
      baseUrl: String(r?.baseUrl || ""),
      integrationId: String(r?.integrationId || ""),
      status: String(r?.status || "registered"),
      reachable: String(r?.status || "") === "connected",
      expectedModelTag: String(r?.expectedModelTag || r?.localModel || ""),
    });
  }
  const hasRunner = objects.some((o) => o?.id === "model-training-runner" && (o.rows || []).some((r) => String(r?.status || "") === "live"));

  const configured = runtimes.length > 0 || hasRunner;
  const detectedBase = baseModels[0] || "";
  return {
    baseModels: baseModels.length ? baseModels : distinct(fallbackBaseModels),
    localModels,
    runtimes,
    hasLocalRunner: hasRunner,
    configured,
    detectedBase,
    guidance: configured
      ? (detectedBase
        ? `Training ${detectedBase}${runtimes.length ? ` · ${runtimes.length} runtime${runtimes.length === 1 ? "" : "s"} detected` : " · local runner ready"}`
        : `${runtimes.length} runtime${runtimes.length === 1 ? "" : "s"} detected — pick a base model to train`)
      : "No local model runtime configured yet — set a base model in the ledger and a local runner (Ollama / llama.cpp server / vLLM / any OpenAI-compatible endpoint).",
  };
}

// ===========================================================================
// Start-Training readiness gate — the pre-initialization contract for the ONE
// button that begins real, live, local training. This is NOT a new runtime and
// it never executes, fetches, or mutates: it derives, purely from the already-
// governed prepared draft + the resolved run config, whether the live
// invocation may begin, and a DETERMINISTIC readiness percentage (never a
// fabricated 0% or an indeterminate spinner) the modal renders as the pre-
// initialization loading state. The Start-training button — and the invocation
// code path behind it — stay inert until every blocking check is green.
//
// The blocking gates enforced before initialization can begin:
//   1. final-config-approved — the user's approved final configuration exists
//      as a real prepared draft (export id + curated records at/above the
//      fine-tune floor). This is the "prior state, same configuration, after
//      the user approved their final training setup".
//   2. command-safe          — the resolved run config is argv-safe and ready
//      (no shell injection, allowlisted bins, requirements met, argv steps).
//   3. draft-blast-radius     — the approved DRAFT DATE is checked against the
//      blast radius of its tuned tag: if a live/connected model already serves
//      this tag, the draft must be strictly NEWER than that live surface, so a
//      stale draft can never silently overwrite a model already in use. A valid
//      check is required — an unparseable draft date fails closed.
//   4. quant-producible       — the declared quantization is a supported level
//      AND the resolved pipeline actually contains a quantize stage that emits
//      it, so "quantized" is a promise the invocation can keep. (The produced-
//      byte proof cannot exist before a model is built, so it is NOT asserted
//      here — that would be fabrication.)
//   5. runner-idle            — no training run for this model is already live,
//      so a click can never fan out a second concurrent live invocation.
//
// Pure, seeded, never throws: same governed evidence in ⇒ same readiness out.
// ===========================================================================

/** Parse the approved draft's timestamp. Prefer an explicit ISO `draftAt`;
 *  fall back to reconstructing it from the `ft_<v>_<iso-with-dashes>` export id
 *  the prepare step stamps. Returns epoch ms, or NaN when no valid date exists
 *  (a draft with no provable date is not a valid draft — the gate fails). */
export function parseDraftDate(result = {}) {
  const explicit = Date.parse(String(result?.draftAt || ""));
  if (Number.isFinite(explicit)) return explicit;
  // exportId: ft_<version>_2026-07-07T12-34-56-789Z (":"/"." replaced by "-").
  const raw = String(result?.exportId || result?.trainingRunId || "");
  const seg = raw.replace(/^(?:ft|trainrun)_(?:\d+_)?/, "");
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(seg);
  if (m) return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return NaN;
}

/**
 * Blast radius of a tuned tag: the governed surfaces a new run would overwrite
 * — a connected API-registry endpoint already serving the tag, and any model-
 * training row whose localModel already resolves to it. Each carries the last
 * time it was proven live, so the draft-date check can require a strictly newer
 * draft before overwriting. Pure, never throws.
 */
export function deriveTagBlastRadius(workspaceConfig, tag) {
  const wanted = String(tag || "").trim();
  const surfaces = [];
  if (!wanted) return { surfaces, latestLiveAt: 0 };
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const o of objects) {
    const rows = Array.isArray(o?.rows) ? o.rows : [];
    if (o?.objectType === "api-registry") {
      for (const r of rows) {
        const served = tryModel(r?.lastResponse);
        const bound = String(r?.expectedModelTag || "").trim() === wanted || served === wanted;
        if (bound && String(r?.status || "") === "connected") {
          surfaces.push({ kind: "endpoint", ref: String(r?.integrationId || r?.baseUrl || ""), at: Date.parse(String(r?.lastTested || "")) || 0 });
        }
      }
    } else if (o?.objectType === "model-training") {
      for (const r of rows) {
        if (String(r?.localModel || "").trim() === wanted) {
          surfaces.push({ kind: "model", ref: String(r?.Name || ""), at: Date.parse(String(r?.lastExportAt || "")) || 0 });
        }
      }
    }
  }
  const latestLiveAt = surfaces.reduce((mx, s) => Math.max(mx, Number(s.at) || 0), 0);
  return { surfaces, latestLiveAt };
}

/**
 * Derive the Start-training readiness gate. Pure, never throws.
 *
 * @param {object} opts
 * @param {object} opts.runConfig     buildTrainingRunConfig() output for the draft
 * @param {object} opts.result        the prepared draft { exportId, records, modelTag, draftAt, trainingRunId }
 * @param {object} opts.workspaceConfig governed config (for blast-radius + live-run reads)
 * @param {number} [opts.floor]       fine-tune record floor (defaults to MIN_FINETUNE_TRACES)
 * @param {number} [opts.nowMs]       clock for the draft-date check (0 skips freshness comparison)
 * @returns {{
 *   checks: object[], readyPct: number, canStart: boolean, blockingReason: string,
 *   preInit: { pct: number, done: number, total: number, complete: boolean, label: string }
 * }}
 */
export function deriveStartTrainingReadiness({ runConfig, result, workspaceConfig, floor = MIN_FINETUNE_TRACES, nowMs = 0 } = {}) {
  const cfg = runConfig || {};
  const draft = result || {};
  const tag = String(draft.modelTag || cfg.outputModelTag || "").trim();
  const records = Number(draft.records) || 0;
  const checks = [];
  const add = (id, label, ok, detail) => checks.push({ id, label, ok: Boolean(ok), detail: String(detail || ""), blocking: true });

  // 1. Final configuration approved — a real prepared draft exists.
  const approved = Boolean(String(draft.exportId || "").trim()) && records >= floor;
  add("final-config-approved", "Final configuration approved",
    approved,
    approved ? `Approved draft ${String(draft.exportId).slice(0, 22)} · ${records} curated records`
      : `Prepare and approve the configuration first (${records}/${floor} curated records).`);

  // 2. Command safety — argv-safe, ready, has executable steps.
  const safeReasons = (cfg.commandSafety && cfg.commandSafety.ok === false) ? (cfg.commandSafety.reasons || []) : [];
  const hasSteps = Array.isArray(cfg.steps) && cfg.steps.length > 0;
  const commandSafe = Boolean(cfg.ready) && safeReasons.length === 0 && hasSteps;
  add("command-safe", "Run command validated",
    commandSafe,
    commandSafe ? `${cfg.steps.length} argv step(s) · allowlisted bins · injection-safe`
      : safeReasons.length ? safeReasons.join("; ")
        : !hasSteps ? "This profile is import-only — pick the one-click pipeline profile to run locally."
          : (cfg.missingRequirements || []).length ? `Set: ${cfg.missingRequirements.join(", ")}.` : "Run configuration not ready.");

  // 3. Draft date vs blast radius — a stale draft never overwrites a live model.
  const draftAt = parseDraftDate(draft);
  const { surfaces, latestLiveAt } = deriveTagBlastRadius(workspaceConfig, tag);
  let blastOk;
  let blastDetail;
  if (!Number.isFinite(draftAt)) {
    blastOk = false;
    blastDetail = "The approved draft has no valid date — re-prepare the configuration.";
  } else if (surfaces.length === 0) {
    blastOk = true;
    blastDetail = `Draft date valid · no live model serves "${tag}" (blast radius 0).`;
  } else if (draftAt > latestLiveAt) {
    blastOk = true;
    blastDetail = `Draft is newer than ${surfaces.length} live surface(s) for "${tag}" — safe to overwrite.`;
  } else {
    blastOk = false;
    blastDetail = `A live model already serves "${tag}" (blast radius ${surfaces.length}). Re-approve the configuration — your draft predates the live model.`;
  }
  add("draft-blast-radius", "Draft date checked against blast radius", blastOk, blastDetail);

  // 4. Quantization is really producible. The declared level must be supported
  // AND the resolved pipeline must actually contain a `quantizing` stage that
  // emits it — otherwise "quantized" is a promise the invocation could never
  // keep. This is the strongest quant guarantee provable BEFORE any compute;
  // the produced-byte proof (fp16 → quant delta) cannot exist until a model is
  // built, so claiming to validate quantized bytes here would be fabrication.
  const quant = String(cfg.quantization || "").trim();
  const quantKnown = SUPPORTED_QUANTIZATIONS.includes(quant);
  const quantStage = (Array.isArray(cfg.steps) ? cfg.steps : []).find((s) => String(s?.stageId || "") === "quantizing");
  const quantOk = quantKnown && Boolean(quantStage);
  add("quant-producible", "Quantization step validated",
    quantOk,
    quantOk ? `${quant} supported · quantize stage present ("${String(quantStage.label || "quantizing")}")`
      : !quantKnown ? `Unsupported quantization "${quant || "(none)"}" (expected ${SUPPORTED_QUANTIZATIONS.join(" / ")}).`
        : `No quantize stage in this profile — it cannot produce a ${quant || "quantized"} artifact.`);

  // 5. Runner idle — no concurrent live run. Only a run that is running AND
  // actually REPORTING progress (a real stamped stage) counts as live: a
  // `running` row that never handshaked is a reclaimable zombie (its runner
  // never came up or could not reach the workspace) and must NOT permanently
  // wedge a fresh start — otherwise a stuck invocation traps the user forever.
  const liveRun = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((o) => o?.objectType === "model-training-run")
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
    .find((r) => String(r?.status || "").toLowerCase() === "running" && String(r?.progress?.stageId || "").trim());
  const runnerIdle = !liveRun;
  add("runner-idle", "No training run already live", runnerIdle,
    runnerIdle ? "No concurrent live run — safe to initialize."
      : `Run ${String(liveRun?.trainingRunId || "").slice(0, 22)} is live and reporting — wait for it or attach its result.`);

  const total = checks.length;
  const done = checks.filter((c) => c.ok).length;
  const canStart = done === total;
  // Deterministic readiness percentage — evidence-derived, monotone, and never
  // a fabricated 0%: it is exactly the fraction of blocking gates proven green.
  const readyPct = total ? Math.round((done / total) * 100) : 0;
  const firstFail = checks.find((c) => !c.ok) || null;
  return {
    checks,
    readyPct,
    canStart,
    blockingReason: firstFail ? firstFail.detail : "",
    preInit: {
      pct: readyPct,
      done,
      total,
      complete: canStart,
      label: canStart ? "Pre-initialization complete — ready to begin training"
        : `Pre-initialization ${done}/${total} — ${firstFail ? firstFail.label.toLowerCase() : "checking"}`,
    },
  };
}
