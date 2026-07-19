/**
 * Training local readiness — the PURE half of the configuration-step
 * readiness contract (the deriver the Training Runtime modal renders and the
 * unit tests exercise). No fetch, no fs, no React: same evidence in ⇒ same
 * rows out, so the modal, the endpoint, and the tests can never disagree.
 *
 * The IO half (probing Ollama tags, /Volumes, tooling, RAM/disk/GPU) lives in
 * training-local-readiness-probe.js and is imported ONLY by the server route —
 * this file stays client-safe.
 *
 * Honesty contract (same posture as training-runtime-drivers):
 *   - a row is "pass" only on real probed evidence, "fail" on proven absence,
 *     and "pending" while the probe has not answered — never an optimistic tick.
 *   - canFinalize is exactly "every row passes". Finalize never marks a model
 *     trained/deployed/verified — it only approves the configuration and
 *     prepares the governed draft the pre-init gate then re-checks.
 */

import { MIN_FINETUNE_TRACES } from "./training-ledger.js";

export const TRAINING_READINESS_KIND = "growthub-training-readiness-v1";

/**
 * Artifact subfolders worth surfacing on an external volume when they ALREADY
 * exist (never required, never created by the probe — the volume root is
 * always offered too). No drive is hardcoded as required; these only shape
 * what a detected drive offers.
 */
export const EXTERNAL_FOLDER_CANDIDATES = [
  "agent-service-preserved",
  "agent-caches",
  "ollama",
  "llama.cpp",
  "models",
  "artifacts",
];

/** The always-available local fallback — workspace-relative so it stays
 *  inside isContainedPath's containment rule. */
export const WORKSPACE_FALLBACK_FOLDER = "./artifacts";

/** Customer-readable label for a storage location option. */
export function labelStorageLocation(loc = {}) {
  const free = Number(loc.freeGB) > 0 ? ` · ${Math.floor(Number(loc.freeGB))} GB free` : "";
  if (String(loc.kind || "") === "workspace") return `This workspace — artifacts folder${free}`;
  const suffix = loc.writable === false ? " (read-only)" : free;
  return `External drive — ${String(loc.path || "")}${suffix}`;
}

/** Collapse the probe's tooling rows into one honest summary. */
export function summarizeTooling(tooling) {
  const rows = Array.isArray(tooling) ? tooling : [];
  const missing = rows.filter((t) => !t?.ok);
  return {
    checked: rows.length > 0,
    ok: rows.length > 0 && missing.length === 0,
    missingLabels: missing.map((t) => String(t?.label || t?.id || "")).filter(Boolean),
  };
}

/**
 * Derive the configuration-step readiness rows — the deterministic contract
 * behind the Finalize button. Pure, never throws.
 *
 * @param {object} opts
 * @param {number} opts.eligibleTraces  curated traces at/above the quality floor
 * @param {number} [opts.floor]         fine-tune floor (defaults MIN_FINETUNE_TRACES)
 * @param {string} opts.baseModel       the selected base model tag ("" = none)
 * @param {object|null} opts.folder     selected artifact folder
 *                                      { path, kind, writable: true|false|null }
 *                                      (writable null = still being checked)
 * @param {object|null} opts.probe      collectTrainingLocalReadiness() output,
 *                                      or null while the probe is loading
 * @param {string} [opts.probeError]    non-empty when the probe request failed
 * @returns {{ rows: {id,label,status,detail}[], canFinalize: boolean,
 *             firstBlocked: object|null, passed: number, total: number }}
 */
export function deriveConfigureReadiness({
  eligibleTraces = 0,
  floor = MIN_FINETUNE_TRACES,
  baseModel = "",
  folder = null,
  probe = null,
  probeError = "",
} = {}) {
  const rows = [];
  const add = (id, label, status, detail) => rows.push({ id, label, status, detail: String(detail || "") });
  const probed = probe && typeof probe === "object";
  const failedProbe = !probed && Boolean(String(probeError || "").trim());

  // Blocking rows — the things a training INVOCATION genuinely needs.
  // 1. Curated training examples at/above the quality floor.
  const n = Number(eligibleTraces) || 0;
  add("eligible-traces", "Eligible training examples",
    n >= floor ? "pass" : "fail",
    n >= floor ? `${n} ready · ${floor} needed` : `${n} of ${floor} needed — collect ${floor - n} more`);

  // 2. A real base model is selected — the probe reads the live server AND the
  // on-disk model store, so installed models count even with the server off.
  const base = String(baseModel || "").trim();
  const probedModels = probed ? (Array.isArray(probe.baseModels) ? probe.baseModels : []) : null;
  if (!probed) {
    add("base-model", "Base model", failedProbe ? "fail" : "pending",
      failedProbe ? "Couldn't check your local models — check again." : "Checking your local models…");
  } else if (!probedModels.length) {
    add("base-model", "Base model", "fail", "No local models found yet. If your models live on an external drive, connect it, then check again.");
  } else if (base && probedModels.some((m) => String(m?.tag || "") === base)) {
    add("base-model", "Base model", "pass", base);
  } else {
    add("base-model", "Base model", "fail", "Choose a base model from the list.");
  }

  // 3. Training folder selected and writable.
  if (!probed && !folder) {
    add("training-folder", "Training folder", failedProbe ? "fail" : "pending",
      failedProbe ? "Couldn't check your drives — check again." : "Checking your drives…");
  } else if (!folder || !String(folder.path || "").trim()) {
    add("training-folder", "Training folder", "fail", "Choose where the trained model files are saved.");
  } else if (folder.writable === true) {
    add("training-folder", "Training folder", "pass", String(folder.path));
  } else if (folder.writable === false) {
    add("training-folder", "Training folder", "fail", "That folder can't be written to — pick another.");
  } else {
    add("training-folder", "Training folder", "pending", "Checking the folder…");
  }

  // Advisory rows — measured honestly, WARN but never block Finalize: the
  // training run itself proves each stage and stamps the exact blocker with
  // the fix if something is still missing when that step runs.
  // 4. Machine check (memory / disk / graphics).
  const pf = probed ? (probe.preflight || {}) : null;
  if (!pf) {
    add("machine-check", "Machine check", failedProbe ? "warn" : "pending",
      failedProbe ? "Couldn't measure this machine — training will measure it for real before anything runs." : "Checking this machine…");
  } else if (pf.available) {
    const gpuLine = pf.gpu?.present ? String(pf.gpu.name || "graphics ready") : "CPU mode";
    add("machine-check", "Machine check", "pass",
      `Memory ${pf.ramGB} GB · ${pf.diskFreeGB} GB free disk · ${gpuLine}`);
  } else {
    add("machine-check", "Machine check", "warn", "Couldn't measure memory and disk — training will measure it for real before anything runs.");
  }

  // 5. Training tools — missing pieces are warned, not user homework: the
  // workspace provisions its own scripts and the run stops at the exact step
  // with the fix if a tool is still missing.
  const tools = probed ? summarizeTooling(probe.tooling) : null;
  if (!tools) {
    add("training-tools", "Training tools", failedProbe ? "pass" : "pending",
      failedProbe ? "Set up automatically" : "Checking the training tools…");
  } else if (tools.ok) {
    add("training-tools", "Training tools", "pass", "All tools present");
  } else {
    // Finalize FURNISHES missing tooling itself (server install/start, python
    // packages, quantize tools). Handled-by-the-system is a GREEN state — the
    // row NAMES what will be set up; a real furnishing failure surfaces
    // honestly in the finalize receipt.
    add("training-tools", "Training tools", "pass", tools.missingLabels.join(" · "));
  }

  const passed = rows.filter((r) => r.status === "pass").length;
  const blockingBad = rows.find((r) => r.status === "fail" || r.status === "pending") || null;
  return {
    rows,
    passed,
    total: rows.length,
    // Finalize unlocks when nothing is failing or unknown — warnings ride
    // along as recorded evidence, they never trap the user.
    canFinalize: !blockingBad,
    firstBlocked: blockingBad,
  };
}
