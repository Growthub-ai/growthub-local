"use client";

/**
 * Training Runtime Modal — the no-code surface where Growthub Local OWNS the
 * full custom-model lifecycle, not a one-way export hand-off. Same modal
 * grammar as the helper setup modal (dm-orch-modal classes, portal), same
 * causation-driver pattern as the API Registry cockpit.
 *
 * The journey the user walks (one modal, owned return path, zero new routes):
 *   checklist → curate (per-row control + min-score + 10-trace floor gate)
 *             → profile (choose training profile · reserve tuned tag · base)
 *             → prepare (chunked dataset build with live progress: validate →
 *               convert → package/download → apply → verify; the apply writes,
 *               in ONE governed PATCH: exported stamps · version row · API
 *               Registry row · a PREPARED model-training-run receipt)
 *             → train (fine-tuning processing — continuous progress, the live
 *               run command, run-receipt status prepared→running, never a dark
 *               screen; honest: completion is gated on a real imported artifact)
 *             → import (attach artifact identity → imported run receipt; sets
 *               the version row's localModel — the tuned tag is now real)
 *             → verify (run the registry test; the response MUST carry the
 *               tuned tag — base/malformed/error demote, no fake proof)
 *             → bind (open the smoke workflow; the proof checklist)
 *             → done (complete capability + identity chain)
 *
 * Compute runs through the workspace-owned local runner and its discovered
 * Ollama/Unsloth/llama.cpp tooling. The lifecycle, receipts, artifact identity,
 * routing policy, verification, and user experience remain Growthub-controlled
 * and provable. Writes happen only through governed preflight + PATCH.
 */

import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, X, AlertTriangle } from "lucide-react";
import {
  DEFAULT_MIN_SCORE,
  MIN_FINETUNE_TRACES,
  TRACES_OBJECT_ID,
  TRAINING_OBJECT_ID,
  TRAINING_OBJECT_TYPE,
  deriveHandoffRecovery,
  deriveProgressStages,
} from "../../../lib/training-ledger.js";
import { isCustomModelRegistryRow } from "../../../lib/custom-models-ledger.js";
import {
  FINE_TUNE_TARGETS,
  LLAMA_CPP_LOCAL_TARGET_ID,
  buildLlamaCppInferenceControlPlane,
  resolveFineTuneTarget,
  scaffoldHandoffRows,
  rebindCustomModelServingIdentity,
} from "../../../lib/adapters/fine-tune-targets.js";
import { TRAINING_RUNTIME_PROFILES, resolveTrainingProfile, buildTrainingRunConfig } from "../../../lib/training-runtime-profiles.js";
import { buildTrainingRunReceipt, TRAINING_RUN_OBJECT_ID, TRAINING_RUN_OBJECT_TYPE, TRAINING_PROGRESS_STAGES } from "../../../lib/training-run-receipts.js";
import { deriveArtifactState } from "../../../lib/training-artifacts.js";
import { verifyTunedResponse } from "../../../lib/training-verification.js";
import { applyGenomeFieldSettings } from "../../../lib/workspace-genome.js";
import { deriveTrainingRuntimeState } from "../../../lib/training-runtime.js";
import { deriveTrainingRemediation, deriveTrainingProofChecklist, deriveTrainingCompletionReward, deriveTrainingStageIssue, deriveTrainingWaitState, deriveServingProfile, deriveTrainingResumeState, deriveLocalModelChoices, deriveStartTrainingReadiness } from "../../../lib/training-runtime-drivers.js";
import { deriveConfigureReadiness, labelStorageLocation } from "../../../lib/training-local-readiness.js";
import { buildPreInitProbeScript, derivePreInitState, PREINIT_RUN_KIND, PREINIT_INTENT, OLLAMA_BIN_CANDIDATES } from "../../../lib/training-preinit-probe.js";
import { PIPELINE_SCRIPTS } from "../../../lib/training-pipeline-scripts.js";
import { buildMothershipProxyRow } from "../../../lib/distillation-fleet.js";

const PHASE3_INSTRUCTION = "You are growthub-local-expert. Respect AWaC V2 invariants and the PATCH allowlist.";
const TRAINING_COLUMNS = ["Name", "status", "baseModel", "localModel", "lastExportAt", "lastExportId", "lastSourceId", "lastExportSummary", "description"];
const RUN_COLUMNS = [
  "trainingRunId", "modelTrainingRowId", "datasetExportId", "baseModel", "trainingProfile", "runnerMode",
  "status", "startedAt", "completedAt", "artifactType", "artifactModelTag", "artifactPath", "artifactSha256", "artifactQuantization",
  // Quant proof (fp16 → quantized bytes) + live thin-delta progress / preflight
  // the local runner stamps each stage boundary. runKind/preinit distinguish
  // Finalize's pre-init probe receipts from real training runs.
  "artifactSourceBytes", "artifactArtifactBytes", "progress", "preflight", "blockedReason", "runKind", "preinit", "schema",
];
const SLUG = "workspace-local";
/** Human labels for raw artifact types — the customer never sees bare "gguf". */
const ARTIFACT_TYPE_LABELS = {
  gguf: "A local model file (GGUF)",
  adapter: "A local adapter file",
  "merged-model": "A merged local model file",
  "ollama-model": "An Ollama model name",
  "openai-compatible-endpoint": "A running compatible endpoint",
};

/**
 * Customer-readable headline per canonical stage id — the top line of the
 * waiting UX (comment §5). The thin status line under it stays the real
 * receipt stamp (deriveTrainingWaitState); this only names what is happening
 * in plain language so the user is never staring at a bare stage token.
 */
const STAGE_HEADLINES = {
  preflight: "Checking your machine",
  distilling: "Building training data",
  "fine-tuning": "Fine-tuning locally",
  converting: "Converting the model",
  quantizing: "Quantizing the model",
  serving: "Registering the local model",
  verifying: "Testing the reply",
  complete: "Custom model live",
};
/** The seeded test prompt the response inspector opens with — editable, the
 *  same mental model as the API/Webhook test-event editor. */
const DEFAULT_TEST_PROMPT = "Reply in one short line to confirm you are the tuned workspace model.";
/** Sentinel value for the "Choose a specific folder…" storage option. */
const CUSTOM_FOLDER = "__custom__";

/**
 * Runner handshake deadline. A real local runner stamps its stage-0 preflight
 * receipt within seconds of spawning (it is the first thing it does, before any
 * compute). If NO receipt evidence at all arrives within this window, the
 * invocation never came up (or cannot reach this workspace) — the polling loop
 * stops and reconciles the run to a governed failure instead of spinning at 0%
 * forever. Once ANY stamp lands, the run has handshaked and polling continues
 * for as long as a genuinely long fine-tune needs — this bound applies ONLY to
 * the never-reported state.
 */
const RUNNER_HANDSHAKE_DEADLINE_MS = 120000;

function eligibleTraceRows(workspaceConfig, minScore) {
  const objects = workspaceConfig?.dataModel?.objects || [];
  const object = objects.find((o) => o?.id === TRACES_OBJECT_ID);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      String(row?.redactionStatus || "").toLowerCase() !== "blocked"
      && Number(row?.qualityScore) >= minScore
      && String(row?.inputPrompt || "").trim()
      && String(row?.agentOutput || "").trim());
}

/** Count redaction-blocked traces so the curate step can explain exclusions. */
function blockedTraceCount(workspaceConfig) {
  const object = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === TRACES_OBJECT_ID);
  return (Array.isArray(object?.rows) ? object.rows : []).filter((r) => String(r?.redactionStatus || "").toLowerCase() === "blocked").length;
}

function toJsonlLine(row) {
  return `${JSON.stringify({ instruction: PHASE3_INSTRUCTION, input: String(row.inputPrompt), output: String(row.agentOutput) })}\n`;
}

/** Flatten a run receipt into the governed table row shape. */
function runReceiptToRow(receipt) {
  return {
    trainingRunId: receipt.trainingRunId,
    modelTrainingRowId: receipt.modelTrainingRowId,
    datasetExportId: receipt.datasetExportId,
    baseModel: receipt.baseModel,
    trainingProfile: receipt.trainingProfile,
    runnerMode: receipt.runnerMode,
    status: receipt.status,
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    artifactType: receipt.artifact?.type || "",
    artifactModelTag: receipt.artifact?.modelTag || "",
    artifactPath: receipt.artifact?.path || "",
    artifactSha256: receipt.artifact?.sha256 || "",
    artifactQuantization: receipt.artifact?.quantization || "",
    // Quant proof (fp16 → quantized bytes) so deriveArtifactState can verify
    // the declared level survived a manual/import path too, not just the runner.
    artifactSourceBytes: receipt.artifact?.sourceBytes || 0,
    artifactArtifactBytes: receipt.artifact?.artifactBytes || 0,
    schema: receipt.schema,
  };
}

/**
 * Upsert the model-training-run object + a run row into a dataModel objects
 * array — the run table's own local fold-or-create (append to the existing
 * table, else create it once), upserting by trainingRunId. Self-contained, the
 * same discipline every governed writer in the workspace uses.
 */
function upsertRunRow(objects, runRow) {
  let found = false;
  const next = (objects || []).map((o) => {
    if (o?.objectType !== TRAINING_RUN_OBJECT_TYPE) return o;
    found = true;
    const rows = Array.isArray(o.rows) ? o.rows : [];
    const idx = rows.findIndex((r) => String(r?.trainingRunId || "") === runRow.trainingRunId);
    return { ...o, rows: idx >= 0 ? rows.map((r, i) => (i === idx ? { ...r, ...runRow } : r)) : [...rows, runRow] };
  });
  if (!found) {
    next.push({
      id: TRAINING_RUN_OBJECT_ID, label: "Model Training Runs", source: "Model Training Runs",
      objectType: TRAINING_RUN_OBJECT_TYPE, icon: "Cpu", columns: RUN_COLUMNS, rows: [runRow],
      binding: { mode: "manual", source: "Model Training Runs" },
      relations: [], fieldSettings: { hidden: [], order: RUN_COLUMNS },
    });
  }
  return next;
}

/** The governed sandbox-environment object that carries the real per-run
 *  training command the local runner executes. One object, one row per run. */
const TRAINING_RUNNER_SANDBOX_ID = "model-training-runner";
const RUNNER_COLUMNS = ["Name", "runtime", "command", "timeoutMs", "networkPolicy", "runLocality", "status"];
// Canonical stage → rank map embedded into the runner so its progress stamps
// carry {stageId, stageRank} the deriver + modal reason about (0-7 vocabulary).
const STAGE_RANK_BY_ID = TRAINING_PROGRESS_STAGES.reduce((acc, s) => { acc[s.id] = s.rank; return acc; }, {});

/**
 * The real training runner, emitted as a self-contained Node program. Run on
 * the user's machine it drives the WHOLE governed pipeline as one atomic
 * sandbox run — never a parallel runtime:
 *
 *   stage 0  PREFLIGHT  — probe RAM / GPU (nvidia-smi) / free disk (statfs)
 *                         against the resource floor; if short, stamp the run
 *                         `blocked` with an honest reason and STOP (no fake
 *                         pass, no compute).
 *   stage 1..n          — execute each ordered command (QLoRA fine-tune →
 *                         merge → GGUF convert → imatrix → quantize → ollama
 *                         create). Each boundary stamps a thin-delta progress
 *                         receipt the modal renders live.
 *   finalize            — pick the QUANTIZED gguf (not the fp16 source),
 *                         hash it, capture fp16→quantized bytes as quant proof,
 *                         make a REAL chat-completions call to the API Registry
 *                         row, and report — in one governed PATCH — the
 *                         `imported` receipt (with size proof) AND the row's
 *                         captured `lastResponse`. The loop closes itself with
 *                         a served, quantized, provably-tuned model.
 *
 * Everything it writes flows through the existing governed PATCH (dataModel
 * allowlist) onto the existing model-training-run + api-registry rows — the
 * causation spine, unchanged.
 */
function buildRunnerScript({ steps, stageRankById, artifactPath, modelTag, trainingRunId, quantization, integrationId, floor, workspaceUrl, datasetPath, minScore, ollamaBin, modelsDir, toolSearchDirs, venvPython }) {
  const P = JSON.stringify({
    steps: steps || [], stageRankById: stageRankById || {}, artifactPath: artifactPath || "",
    modelTag: modelTag || "", trainingRunId: trainingRunId || "", quantization: quantization || "q4_k_m",
    integrationId: integrationId || "", floor: floor || { ramGB: 0, diskGB: 0, vramGB: 0 },
    // Origin of the workspace that launched this run, baked in so the runner's
    // governed callback PATCHes reach the exact server (the sandbox spawns the
    // runner with a restricted env, so it cannot rely on GROWTHUB_WORKSPACE_URL).
    workspaceUrl: workspaceUrl || "",
    // Distillation inputs — the runner exports the curated traces to the REAL
    // JSONL the fine-tune consumes (a genuine stage with a genuine stamp).
    datasetPath: datasetPath || "unsloth-dataset.jsonl",
    minScore: Number(minScore) || DEFAULT_MIN_SCORE,
    instruction: PHASE3_INSTRUCTION,
    // Model-server ensure for the serving/verify stages.
    ollamaBin: ollamaBin || "",
    modelsDir: modelsDir || "",
    binCandidates: OLLAMA_BIN_CANDIDATES,
    // Workdir self-provisioning: the sandbox lane runs every command in a
    // FRESH throwaway workdir, so the runner must furnish its own cwd — the
    // workspace's pipeline scripts, plus links to the discovered llama.cpp
    // binaries — before any argv step resolves "./llama-quantize" or
    // "train.py" relative to it.
    pipelineScripts: PIPELINE_SCRIPTS,
    toolSearchDirs: Array.isArray(toolSearchDirs) ? toolSearchDirs : [],
    // The workspace-owned training venv the pre-init probe installed the
    // python stack into — the fine-tune/merge steps run on it.
    venvPython: venvPython || "",
  });
  return [
    "const { execFileSync, spawn } = require('node:child_process');",
    "const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const crypto = require('node:crypto');",
    `const P = ${P};`,
    "const WS = (P.workspaceUrl || process.env.GROWTHUB_WORKSPACE_URL || 'http://127.0.0.1:3000').replace(/\\/+$/, '');",
    "const matchReg = (row) => String(row.expectedModelTag || '') === P.modelTag || (P.integrationId && String(row.integrationId || '') === P.integrationId);",
    "const rankOf = (id) => Number(P.stageRankById[id]) || 0;",
    "const pctOf = (id) => Math.min(95, Math.round((rankOf(id) / 7) * 95));",
    "const N = P.steps.length;",
    // One governed write: read the workspace, map the model-training-run row
    // (matched by trainingRunId) with `patch`, PATCH it back. Every stage uses
    // this so progress/blocked/imported all ride the same allowlisted lane.
    // Monotonic progress merge AT THE WRITE BOUNDARY: a stale/duplicate runner
    // can never regress the single row's progress. Higher stageRank wins; same
    // stage advances only on higher counter, then higher pct.
    "  function mono(prev, next) {",
    "    if (!next) return prev || null; if (!prev) return next;",
    "    const pr = Number(prev.stageRank) || 0, nr = Number(next.stageRank) || 0;",
    "    if (nr > pr) return next; if (nr < pr) return prev;",
    "    const pc = Number(prev.counter ?? -1), nc = Number(next.counter ?? -1);",
    "    if (nc !== pc) return nc > pc ? next : prev;",
    "    return (Number(next.pct) || 0) >= (Number(prev.pct) || 0) ? next : prev;",
    "  }",
    "  async function patchDataModel(objects) {",
    "    const nextPatch = { dataModel: { objects } };",
    "    const pre = await fetch(`${WS}/api/workspace/patch/preflight`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextPatch) });",
    "    const verdict = await pre.json();",
    "    if (!pre.ok || verdict.ok !== true) throw new Error('governed preflight refused: ' + JSON.stringify(verdict.policy?.violations || verdict.schema?.errors || verdict));",
    "    const written = await fetch(`${WS}/api/workspace`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextPatch) });",
    "    if (!written.ok) throw new Error('governed PATCH refused: ' + (await written.text()).slice(0, 300));",
    "    return written.json();",
    "  }",
    "  async function stampRun(patch) {",
    "    try {",
    "      const r = await fetch(`${WS}/api/workspace`, { cache: 'no-store' }); const data = await r.json();",
    "      const objects = (data.workspaceConfig.dataModel.objects || []).map((o) => o.objectType === 'model-training-run' ? ({ ...o, rows: (o.rows || []).map((row) => {",
    "        if (String(row.trainingRunId) !== P.trainingRunId) return row;",
    "        const merged = { ...row, ...patch };",
    "        if (patch && patch.progress) merged.progress = mono(row.progress, patch.progress);",
    "        return merged;",
    "      }) }) : o);",
    "      await patchDataModel(objects);",
    "    } catch (e) { console.error('stampRun failed', (e && e.message) || e); throw e; }",
    "  }",
    "  const gb = (bytes) => Math.floor(Number(bytes || 0) / 1e9);",
    "(async () => {",
    // ---- workdir self-provisioning: the sandbox cwd is a fresh throwaway
    // dir — write the workspace's own pipeline scripts and link the REAL
    // discovered llama.cpp binaries into it so every argv step resolves.
    "  for (const [name, content] of Object.entries(P.pipelineScripts || {})) {",
    "    try { const p = path.join(process.cwd(), name); if (!fs.existsSync(p)) fs.writeFileSync(p, content); } catch (e) { console.error('provision failed ' + name, (e && e.message) || e); }",
    "  }",
    "  const which = (b) => { try { return execFileSync('which', [b], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).toString().trim(); } catch { return ''; } };",
    "  const binSearchDirs = [...P.toolSearchDirs.flatMap((d) => [d, path.join(d, 'build/bin')]), '/opt/homebrew/bin', '/usr/local/bin'];",
    "  for (const tool of ['llama-quantize', 'llama-imatrix']) {",
    "    const dest = path.join(process.cwd(), tool);",
    "    if (fs.existsSync(dest)) continue;",
    "    const found = binSearchDirs.map((d) => path.join(d, tool)).find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || which(tool);",
    "    if (found) { try { fs.symlinkSync(found, dest); console.log('LINKED ' + tool + ' -> ' + found); } catch { try { fs.copyFileSync(found, dest); fs.chmodSync(dest, 0o755); } catch {} } }",
    "  }",
    // Interpreter resolution, honestly: prefer the workspace-owned training
    // venv (where the pre-init probe installed torch/transformers/peft/trl —
    // system pythons are PEP 668 externally managed), else python3 on macOS.
    // The allowlisted step bin stays 'python'; this only picks WHICH python.
    "  const resolveBin = (b) => { if (b !== 'python') return b; if (P.venvPython && fs.existsSync(P.venvPython)) return P.venvPython; if (!which('python') && which('python3')) return 'python3'; return b; };",
    // ---- stage 0: preflight — deep system requirements check. -------------
    "  const ramGB = gb(os.totalmem());",
    "  let diskFreeGB = 0;",
    "  const artifactRoot = P.artifactPath ? path.resolve(P.artifactPath) : process.cwd();",
    "  try { fs.mkdirSync(artifactRoot, { recursive: true }); } catch {}",
    "  try { const s = fs.statfsSync(artifactRoot); diskFreeGB = gb(s.bavail * s.bsize); } catch { try { const s = fs.statfsSync('.'); diskFreeGB = gb(s.bavail * s.bsize); } catch {} }",
    "  let gpu = { present: false, name: '', vramFreeGB: 0 };",
    "  try { const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.free', '--format=csv,noheader,nounits'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (out) { const [name, freeMiB] = out.split('\\n')[0].split(',').map((s) => s.trim()); gpu = { present: true, name, vramFreeGB: Math.floor(Number(freeMiB) / 1024) }; } } catch {}",
    "  const preflight = { ramGB, diskFreeGB, gpu, floor: P.floor, cpuOnly: !gpu.present };",
    "  const shortfalls = [];",
    "  if (ramGB < P.floor.ramGB) shortfalls.push(`needs ${P.floor.ramGB} GB RAM, ${ramGB} GB present`);",
    "  if (diskFreeGB < P.floor.diskGB) shortfalls.push(`needs ${P.floor.diskGB} GB free disk, ${diskFreeGB} GB available`);",
    "  if (gpu.present && gpu.vramFreeGB < P.floor.vramGB) shortfalls.push(`needs ${P.floor.vramGB} GB VRAM, ${gpu.vramFreeGB} GB free`);",
    "  preflight.ok = shortfalls.length === 0;",
    "  if (!preflight.ok) {",
    "    const reason = 'Preflight blocked — ' + shortfalls.join('; ');",
    "    await stampRun({ status: 'blocked', blockedReason: reason, preflight, progress: { stageId: 'preflight', stageRank: 0, pct: 0, detail: reason, index: 0, total: N } });",
    "    console.error(reason); process.exit(1); return;",
    "  }",
    "  await stampRun({ preflight, progress: { stageId: 'preflight', stageRank: 0, pct: 2, detail: `System OK — RAM ${ramGB} GB, disk ${diskFreeGB} GB, ${gpu.present ? ('GPU ' + gpu.name) : 'CPU-only'}`, index: 0, total: N } });",
    // ---- ensure the model server — the serving + verify stages need it; an
    // installed-but-stopped server is started automatically (never homework).
    "  const findBin = () => { if (P.ollamaBin && fs.existsSync(P.ollamaBin)) return P.ollamaBin; try { const p = execFileSync('which', ['ollama'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).toString().trim(); if (p) return p; } catch {} for (const c of P.binCandidates) { try { if (fs.existsSync(c)) return c; } catch {} } return ''; };",
    "  const serverUp = async () => { try { const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) }); return r.ok; } catch { return false; } };",
    "  if (!(await serverUp())) { const bin = findBin(); if (bin) { const env2 = { ...process.env }; if (P.modelsDir) env2.OLLAMA_MODELS = P.modelsDir; try { const ch = spawn(bin, ['serve'], { detached: true, stdio: 'ignore', env: env2 }); ch.unref(); } catch {} for (let i = 0; i < 20 && !(await serverUp()); i += 1) await new Promise((r) => setTimeout(r, 1000)); } }",
    // ---- stage 1: DISTILL — export the curated governed traces to the REAL
    // JSONL the fine-tune consumes, on this machine (a genuine stage with a
    // genuine receipt stamp; the browser download is only the user's copy).
    "  await stampRun({ status: 'running', progress: { stageId: 'distilling', stageRank: rankOf('distilling'), pct: pctOf('distilling'), detail: 'Exporting curated traces to JSONL', index: 0, total: N } });",
    "  try {",
    "    const r0 = await fetch(`${WS}/api/workspace`, { cache: 'no-store' }); const d0 = await r0.json();",
    "    const tObj = (d0.workspaceConfig.dataModel.objects || []).find((o) => o.id === 'training-traces');",
    "    const tRows = (tObj && Array.isArray(tObj.rows) ? tObj.rows : []).filter((row) => String(row.redactionStatus || '').toLowerCase() !== 'blocked' && Number(row.qualityScore) >= P.minScore && String(row.inputPrompt || '').trim() && String(row.agentOutput || '').trim());",
    "    if (tRows.length < 10) throw new Error(`only ${tRows.length} eligible traces (need 10+)`);",
    "    const dsPath = path.resolve(P.datasetPath);",
    "    try { fs.mkdirSync(path.dirname(dsPath), { recursive: true }); } catch {}",
    "    fs.writeFileSync(dsPath, tRows.map((row) => JSON.stringify({ instruction: P.instruction, input: String(row.inputPrompt), output: String(row.agentOutput) })).join('\\n') + '\\n');",
    "    await stampRun({ progress: { stageId: 'distilling', stageRank: rankOf('distilling'), pct: pctOf('distilling'), detail: `Dataset ready — ${tRows.length} traces → ${dsPath}`, index: 0, total: N, counter: tRows.length, totalRecords: tRows.length } });",
    "  } catch (e) {",
    "    const reason = 'Distillation failed: ' + String((e && e.message) || e).split('\\n')[0];",
    "    await stampRun({ status: 'failed', blockedReason: reason, progress: { stageId: 'distilling', stageRank: rankOf('distilling'), pct: pctOf('distilling'), detail: reason, index: 0, total: N } });",
    "    console.error(reason); process.exit(1); return;",
    "  }",
    // ---- stages 1..n: execFile each ARGV step (no shell), stamp canonical id.
    "  for (let i = 0; i < N; i += 1) {",
    "    const step = P.steps[i];",
    "    await stampRun({ status: 'running', progress: { stageId: step.stageId, stageRank: rankOf(step.stageId), pct: pctOf(step.stageId), detail: step.label, index: i + 1, total: N } });",
    "    console.log(`STEP ${i + 1}/${N} [${step.stageId}]: ${step.bin} ${step.args.join(' ')}`);",
    "    try {",
    // Fine-tuning streams a governed progress protocol so step/loss/checkpoint
    // are REAL governed stamps (not aspirational): the trainer emits lines
    // `GH_PROGRESS {\"step\":n,\"total\":N,\"loss\":x,\"checkpoint\":\"path\"}`; each
    // one advances the SAME model-training-run receipt → live step/loss and a
    // resumable checkpoint. Other stages stay atomic execFileSync.
    "      if (step.stageId === 'fine-tuning') {",
    "        await new Promise((resolve, reject) => {",
    "          const child = spawn(resolveBin(step.bin), step.args, { stdio: ['ignore', 'pipe', 'inherit'] });",
    "          let buf = '';",
    "          child.stdout.on('data', (d) => {",
    "            buf += d.toString(); const lines = buf.split('\\n'); buf = lines.pop();",
    "            for (const ln of lines) {",
    "              process.stdout.write(ln + '\\n');",
    "              const m = ln.indexOf('GH_PROGRESS ');",
    "              if (m < 0) continue;",
    "              try {",
    "                const p = JSON.parse(ln.slice(m + 12));",
    "                const st = Number(p.step) || 0, tot = Number(p.total) || 0;",
    "                const frac = tot > 0 ? Math.min(1, st / tot) : 0;",
    "                stampRun({ status: 'running', progress: { stageId: 'fine-tuning', stageRank: rankOf('fine-tuning'), pct: Math.round(pctOf('fine-tuning') + frac * (pctOf('converting') - pctOf('fine-tuning'))), detail: `training step ${st}/${tot}`, index: i + 1, total: N, step: st, counter: st, totalRecords: tot, loss: Number(p.loss), checkpointPath: p.checkpoint ? String(p.checkpoint) : '' } });",
    "              } catch {}",
    "            }",
    "          });",
    "          child.on('error', reject);",
    "          child.on('close', (code) => code === 0 ? resolve() : reject(new Error('exit ' + code)));",
    "        });",
    "      } else { execFileSync(resolveBin(step.bin), step.args, { stdio: 'inherit' }); }",
    "    }",
    "    catch (e) {",
    "      // A stage failed → stamp a GOVERNED failed receipt naming the exact",
    "      // canonical stage so the remediation deriver offers the one-click fix.",
    "      // A fine-tune crash keeps its last checkpoint stamp, so the receipt",
    "      // stays resumable (deriveTrainingResumeState reads progress.checkpointPath).",
    "      const reason = `Stage failed: ${step.label} — ${String((e && e.message) || e).split('\\n')[0]}`;",
    "      const prev = { stageId: step.stageId, stageRank: rankOf(step.stageId), pct: pctOf(step.stageId), detail: reason, index: i + 1, total: N };",
    "      await stampRun({ status: 'failed', blockedReason: reason, progress: prev });",
    "      console.error(reason); process.exit(1); return;",
    "    }",
    "  }",
    // ---- finalize: pick the QUANTIZED gguf, capture fp16→quant proof. ------
    "  let file = '', quantBytes = 0, sourceBytes = 0;",
    "  try {",
    "    const dir = path.resolve(P.artifactPath);",
    "    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {",
    "      const ggufs = fs.readdirSync(dir).filter((f) => f.endsWith('.gguf')).map((f) => path.join(dir, f));",
    "      // Prefer the quantized artifact (model.<quant>.gguf); the fp16 source",
    "      // (model.f16.gguf / *.f16.*) is the size baseline, never the artifact.",
    "      const isSource = (f) => /f16|fp16/i.test(path.basename(f));",
    "      const quant = ggufs.filter((f) => new RegExp(P.quantization, 'i').test(path.basename(f)));",
    "      const nonSource = ggufs.filter((f) => !isSource(f));",
    "      file = quant[0] || nonSource[0] || ggufs[0] || '';",
    "      const src = ggufs.find(isSource);",
    "      if (src) { try { sourceBytes = fs.statSync(src).size; } catch {} }",
    "    } else if (fs.existsSync(dir)) { file = dir; }",
    "    if (file) { try { quantBytes = fs.statSync(file).size; } catch {} }",
    "  } catch {}",
    "  const sha = file ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '';",
    "  await stampRun({ progress: { stageId: 'verifying', stageRank: 6, pct: 97, detail: 'Calling the local model to prove it is the tuned model', index: N, total: N } });",
    "  const r = await fetch(`${WS}/api/workspace`, { cache: 'no-store' });",
    "  const data = await r.json();",
    "  const objs = data.workspaceConfig.dataModel.objects || [];",
    "  // The model is built + serving locally now — prove it with a real call.",
    "  const reg = objs.filter((o) => o.objectType === 'api-registry').flatMap((o) => o.rows || []).find(matchReg);",
    "  let chat = null, served = '';",
    "  if (reg && reg.baseUrl) {",
    "    try {",
    "      const ep = String(reg.endpoint || '/chat/completions');",
    "      const url = String(reg.baseUrl).replace(/\\/+$/, '') + (ep.startsWith('/') ? ep : '/' + ep);",
    "      const cr = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: P.modelTag, messages: [{ role: 'user', content: 'Reply in one short line to confirm you are the tuned workspace model.' }], stream: false }) });",
    "      const ct = await cr.text(); try { chat = JSON.parse(ct); } catch { chat = ct; }",
    "      served = (chat && typeof chat === 'object') ? String(chat.model || '') : '';",
    "    } catch (e) { chat = { error: { message: String((e && e.message) || e) } }; }",
    "  }",
    "  const now = new Date().toISOString();",
    "  const donePct = 100;",
    "  const objects = objs.map((o) => {",
    "    if (o.objectType === 'model-training-run') return { ...o, rows: (o.rows || []).map((row) => String(row.trainingRunId) === P.trainingRunId ? ({ ...row, status: 'imported', completedAt: now, artifactType: 'gguf', artifactModelTag: P.modelTag, artifactPath: file, artifactSha256: sha, artifactQuantization: P.quantization, artifactSourceBytes: sourceBytes, artifactArtifactBytes: quantBytes, progress: { stageId: 'complete', stageRank: 7, pct: donePct, detail: `Tuned model ${P.modelTag} built (${gb(quantBytes)} GB ${P.quantization}) and serving`, index: N, total: N } }) : row) };",
    // Registry row reads 'connected' ONLY when the served model equals the
    // expected tuned tag — a base/other model served never counts as connected.
    "    if (o.objectType === 'api-registry') return { ...o, rows: (o.rows || []).map((row) => matchReg(row) ? ({ ...row, lastResponse: typeof chat === 'string' ? chat : JSON.stringify(chat || ''), lastTested: now, status: (served && served === P.modelTag) ? 'connected' : (row.status || 'registered') }) : row) };",
    "    return o;",
    "  });",
    "  await patchDataModel(objects);",
    "  console.log('TRAINING_COMPLETE', sha, 'SERVED', served, 'BYTES', sourceBytes, '->', quantBytes);",
    "})().catch((e) => { console.error(e); process.exit(1); });",
  ].join("\n");
}

/**
 * Deterministic system-resource floor for the local pipeline, parsed from the
 * base model tag (…7b, …4b, …13b → param billions; default 7). The runner
 * must hold merged fp16 + f16 GGUF + quantized copy at once, so disk ≈ 2× fp16
 * + quant; QLoRA loads the base in 4-bit → VRAM ≈ 0.75 GB/B, RAM ≈ 3 GB/B.
 * Conservative floors, not exact — the preflight compares against these.
 */
function resourceFloorFor(baseModel) {
  const m = /(\d+(?:\.\d+)?)\s*b\b/i.exec(String(baseModel || ""));
  const b = m ? Number(m[1]) : 7;
  const quantPerB = 0.65; // ~q4_k_m
  return { baseParamsB: b, diskGB: Math.ceil(b * 2 * 2 + b * quantPerB), ramGB: Math.ceil(b * 3), vramGB: Math.ceil(b * 0.75) };
}

/** Upsert the runner sandbox object + its per-run row. Same fold-or-create
 *  discipline as upsertRunRow — append to the existing object, else create it. */
function upsertRunnerSandbox(objects, trainingRunId, runConfig, integrationId, runtimeHints = {}) {
  const workspaceUrl = typeof window !== "undefined" && window.location ? window.location.origin : "";
  const row = {
    Name: trainingRunId,
    runtime: "node",
    command: buildRunnerScript({
      steps: runConfig?.steps, stageRankById: STAGE_RANK_BY_ID, artifactPath: runConfig?.artifactPath,
      modelTag: runConfig?.outputModelTag, trainingRunId, quantization: runConfig?.quantization, integrationId,
      floor: resourceFloorFor(runConfig?.baseModel), workspaceUrl,
      datasetPath: runConfig?.datasetPath, minScore: runtimeHints.minScore,
      ollamaBin: runtimeHints.ollamaBin, modelsDir: runtimeHints.modelsDir,
      toolSearchDirs: runtimeHints.toolSearchDirs, venvPython: runtimeHints.venvPython,
    }),
    timeoutMs: 6 * 60 * 60 * 1000, // a real fine-tune can run for hours
    networkPolicy: "allow",
    runLocality: "local",
    status: "live",
  };
  let found = false;
  const next = (objects || []).map((o) => {
    if (o?.id !== TRAINING_RUNNER_SANDBOX_ID) return o;
    found = true;
    const rows = Array.isArray(o.rows) ? o.rows : [];
    const idx = rows.findIndex((r) => String(r?.Name || "") === trainingRunId);
    return { ...o, rows: idx >= 0 ? rows.map((r, i) => (i === idx ? { ...r, ...row } : r)) : [...rows, row] };
  });
  if (!found) {
    next.push({
      id: TRAINING_RUNNER_SANDBOX_ID, label: "Model Training Runner", source: "Model Training Runner",
      objectType: "sandbox-environment", icon: "Cpu", columns: RUNNER_COLUMNS, rows: [row],
      binding: { mode: "manual", source: "Model Training Runner" },
      relations: [], fieldSettings: { hidden: ["command"], order: RUNNER_COLUMNS },
    });
  }
  return next;
}

export default function TrainingHandoffModal({ open, onClose, workspaceConfig: providedConfig, workspaceSourceRecords, onApplied }) {
  const [liveConfig, setLiveConfig] = useState(null);
  const workspaceConfig = liveConfig || providedConfig;
  const [panel, setPanel] = useState("checklist"); // checklist|curate|profile|prepare|train|import|verify|bind|done|recover
  const [minScore, setMinScore] = useState(DEFAULT_MIN_SCORE);
  const [excluded, setExcluded] = useState(() => new Set());
  const [targetId, setTargetId] = useState(FINE_TUNE_TARGETS[0].id);
  const [profileId, setProfileId] = useState(TRAINING_RUNTIME_PROFILES[0].id);
  const [tunedTag, setTunedTag] = useState("");
  const [progress, setProgress] = useState({ pct: 0, stage: "", stageId: "", converted: 0 });
  const [trainPhase, setTrainPhase] = useState("idle"); // idle|starting|running
  // Progress is NOT stored in component state — deriveTrainingWaitState(liveRunRow)
  // is the single source (barPct/statusLine) over the governed receipt, updated
  // whenever polling calls setLiveConfig. No fabricated/duplicated bar.
  // The single derived one-click remedy shown when a stage fails — nothing
  // more than one line + one button (deriveTrainingRemediation owns the logic).
  const [remedy, setRemedy] = useState(null);
  // The specific classified stage issue on failure {stageId, issue, userMessage,
  // evidence, nextAction} — never a generic "training failed".
  const [stageIssue, setStageIssue] = useState(null);
  const pollRef = useRef(null);
  const [artifact, setArtifact] = useState({ type: "gguf", modelTag: "", path: "", sha256: "", quantization: "q4_k_m" });
  const [verifyResult, setVerifyResult] = useState(null);
  const [verificationEvidence, setVerificationEvidence] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [httpStatus, setHttpStatus] = useState(null); // real HTTP status from the test lane
  // Test-event mental model (mirrors the API/Webhook test-event flow): an
  // editable seeded prompt + a response inspector with Response/Trace/Details/
  // Proof tabs. State kept local; the send re-uses the governed test lane.
  const [testPrompt, setTestPrompt] = useState(DEFAULT_TEST_PROMPT);
  const [inspectorTab, setInspectorTab] = useState("response");
  const [traceFieldMap, setTraceFieldMap] = useState({
    input: "inputPrompt",
    output: "agentOutput",
    reward: "qualityScore",
    toolCalls: "reason",
  });
  // Adaptive base-model choice — defaults to the workspace-detected base, but
  // the user can pick any base their workspace actually carries (no hardcoded
  // Gemma/Ollama assumption).
  const [chosenBase, setChosenBase] = useState("");
  // Local substrate probe (real Ollama model tags · storage folders · tooling ·
  // machine preflight) from /api/workspace/training-readiness. null = not
  // answered yet — readiness rows render "pending", never an optimistic tick,
  // and the dropdowns only ever offer what the probe actually found.
  const [readinessProbe, setReadinessProbe] = useState(null);
  const [probeError, setProbeError] = useState("");
  // Artifact/training folder selection: a probed location path, or
  // CUSTOM_FOLDER with the typed path verified through the same endpoint.
  const [artifactFolder, setArtifactFolder] = useState("");
  const [customFolder, setCustomFolder] = useState("");
  const [customFolderCheck, setCustomFolderCheck] = useState(null);
  // Finalize lifecycle: idle → preparing (governed prepare) → probing (the
  // REAL pre-init sandbox run) → passed | failed. UI state is receipt-driven:
  // preInitReceipt is derivePreInitState() over the governed probe row.
  const [finalizePhase, setFinalizePhase] = useState("idle");
  const [preInitReceipt, setPreInitReceipt] = useState(null);
  // Behind-the-scenes setup feedback — the user is never left in the dark
  // while the API Registry row + Data Model model record are written.
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [busyPct, setBusyPct] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(null);
  const [resume, setResume] = useState({ datasetDownloaded: false, datasetPath: "", lines: null });

  // Stop polling the run receipt when the modal unmounts OR closes — the parent
  // toggles `open` without unmounting, so the close path must clear the timer
  // too (otherwise it keeps hitting /api/workspace on a hidden modal).
  useEffect(() => {
    if (!open && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [open]);

  // Evidence parity: when the modal opens, hydrate eligibility from FRESH
  // governed state rather than trusting the prop snapshot. On a manual restart
  // the parent can hand us a pre-hydration config whose training-traces haven't
  // landed yet — that renders a false "0 eligible" while /api/workspace already
  // returns the real traces (the browser/API/deriver disagreement flagged in
  // review). One no-store fetch on open makes all three agree. A fetch failure
  // keeps providedConfig — we never blank the modal on a transient error.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const probe = await fetch("/api/workspace", { cache: "no-store" });
        const data = await probe.json();
        if (!cancelled && data?.workspaceConfig) setLiveConfig(data.workspaceConfig);
      } catch { /* keep providedConfig on error — honest fallback, never a blank ledger */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Probe the local substrate when the configuration step opens — one bounded
  // read-only GET; a failure surfaces as an honest "couldn't check" row (the
  // user gets a Check-again action), never a fake pass or a silent fallback.
  useEffect(() => {
    if (!open || panel !== "profile") return;
    if (!readinessProbe) refreshReadiness();
    // Keep discovering automatically until models appear — the user is never
    // told to go check anything; the substrate probe (which also auto-starts
    // an installed-but-stopped model server) simply keeps looking.
    if (readinessProbe && (readinessProbe.baseModels || []).length > 0) return;
    const timer = setInterval(refreshReadiness, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panel, readinessProbe]);

  // Verify a hand-typed folder through the same endpoint (debounced) — the
  // folder readiness row stays "pending" until the server has really checked
  // containment + writability, so Finalize can only unlock on proven evidence.
  useEffect(() => {
    if (artifactFolder !== CUSTOM_FOLDER) return;
    const typed = customFolder.trim();
    setCustomFolderCheck(null);
    if (!typed) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/workspace/training-readiness?folder=${encodeURIComponent(typed)}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setCustomFolderCheck(data?.folderCheck || { path: typed, writable: false, detail: "Couldn't check this folder — try again." });
      } catch {
        if (!cancelled) setCustomFolderCheck({ path: typed, writable: false, detail: "Couldn't check this folder — try again." });
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [artifactFolder, customFolder]);

  async function refreshReadiness() {
    setProbeError("");
    try {
      const res = await fetch("/api/workspace/training-readiness", { cache: "no-store" });
      if (!res.ok) throw new Error(`readiness check failed (${res.status})`);
      const data = await res.json();
      setReadinessProbe(data);
      // Default the folder to the first writable discovered location once —
      // a real option only; the user can change it or type a specific path.
      setArtifactFolder((current) => current || (data?.storageLocations || []).find((l) => l.writable)?.path || "");
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : String(e));
    }
  }

  const candidates = useMemo(() => eligibleTraceRows(workspaceConfig, minScore), [workspaceConfig, minScore]);
  const selected = candidates.filter(({ index }) => !excluded.has(index));
  const floorMet = selected.length >= MIN_FINETUNE_TRACES;
  const blocked = blockedTraceCount(workspaceConfig);
  const target = resolveFineTuneTarget(targetId);
  const traceFieldOptions = [
    { value: "inputPrompt", label: "Input prompt" },
    { value: "agentOutput", label: "Agent output" },
    { value: "qualityScore", label: "Reward / score" },
    { value: "reason", label: "Tool calls / reason" },
    { value: "sessionDate", label: "Session date" },
    { value: "exported", label: "Exported flag" },
  ];
  const traceMapRows = [
    { key: "input", label: "Input", fileColumn: "inputPrompt", sample: selected[0]?.row?.inputPrompt || candidates[0]?.row?.inputPrompt || "" },
    { key: "output", label: "Output", fileColumn: "agentOutput", sample: selected[0]?.row?.agentOutput || candidates[0]?.row?.agentOutput || "" },
    { key: "reward", label: "Reward / score", fileColumn: "qualityScore", sample: selected[0]?.row?.qualityScore || candidates[0]?.row?.qualityScore || "" },
    { key: "toolCalls", label: "Tool calls", fileColumn: "reason", sample: selected[0]?.row?.reason || candidates[0]?.row?.reason || "" },
  ];
  const profile = resolveTrainingProfile(profileId);
  // Adaptive model/runtime choices derived from the workspace's OWN rows — so
  // the profile step reflects what this workspace carries, not a Gemma/Ollama
  // default. detectedBase is deriveLocalModelChoices' truth (no inline re-scan).
  const modelChoices = deriveLocalModelChoices({ workspaceConfig });
  // Base model truth ladder: once the local probe has answered, ONLY a really
  // installed model is selectable (ledger hints count only when still
  // installed); before the probe answers, keep the ledger-detected value so a
  // reopened modal is never blanked by a probe still in flight.
  const availableBases = readinessProbe ? (readinessProbe.baseModels || []).map((m) => String(m?.tag || "")).filter(Boolean) : null;
  const baseModel = (availableBases
    ? (chosenBase && availableBases.includes(chosenBase) ? chosenBase
      : availableBases.includes(modelChoices.detectedBase) ? modelChoices.detectedBase
        : availableBases[0] || "")
    : String(chosenBase || modelChoices.detectedBase || "")).trim();
  // Selected artifact/training folder — a probed location, or the typed path
  // with its server verification verdict (writable: null = still checking).
  const storageLocations = readinessProbe?.storageLocations || [];
  const chosenFolder = artifactFolder === CUSTOM_FOLDER
    ? (customFolder.trim()
      ? { path: customFolder.trim(), kind: "custom", writable: customFolderCheck ? Boolean(customFolderCheck.writable) : null, freeGB: customFolderCheck?.freeGB || 0 }
      : null)
    : (storageLocations.find((l) => l.path === artifactFolder) || null);

  if (!open || typeof document === "undefined") return null;

  const version = 1 + (workspaceConfig?.dataModel?.objects || [])
    .filter((o) => o?.objectType === TRAINING_OBJECT_TYPE)
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
    .filter((r) => /^.+-v\d+$/.test(String(r?.Name || ""))).length;
  const reservedTag = (tunedTag || `${SLUG}-tuned-v${version}`).trim();
  const datasetPath = resume.datasetPath || `unsloth-dataset-v${version}.jsonl`;
  // Artifact root = the user's chosen training folder (workspace fallback when
  // none picked yet) + the tuned tag — the runner mkdir -p's it on preflight.
  const artifactRootPath = chosenFolder?.path ? String(chosenFolder.path).replace(/\/+$/, "") : "./artifacts";
  const runConfig = buildTrainingRunConfig({ profileId: profile.id, baseModel, datasetPath, outputModelTag: reservedTag, artifactPath: `${artifactRootPath}/${reservedTag}` });
  // Plain-language run framing for the no-code profile step — the primary UX is
  // "what will this do + can it start", NOT the raw argv (that lives in Advanced).
  const floor = resourceFloorFor(baseModel);
  // A tag-specific safety failure drives a field-level error on the tag input,
  // not a scary command dump. Any other safety/missing reason is a clean block.
  const tagUnsafe = Boolean(runConfig.commandSafety && !runConfig.commandSafety.ok
    && (runConfig.commandSafety.reasons || []).some((r) => /model tag/i.test(String(r))));
  // Deterministic configuration-step readiness — the plain-language pass/fail/
  // pending rows behind the Finalize button (deriveConfigureReadiness owns the
  // logic; every pass is probed evidence, never an optimistic tick). Finalize
  // additionally requires the resolved run config itself to be argv-safe.
  const configureReadiness = deriveConfigureReadiness({
    eligibleTraces: selected.length,
    floor: MIN_FINETUNE_TRACES,
    baseModel,
    folder: chosenFolder,
    probe: readinessProbe,
    probeError,
  });
  const canFinalize = configureReadiness.canFinalize && runConfig.ready;
  // Live proof state — the SAME derivation /training and /custom-models use, so
  // the modal can never claim "complete" before the smoke run wrote outputHash.
  const liveRuntime = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug: SLUG });
  const smokeProven = liveRuntime.state === "complete";
  const liveOutputHash = liveRuntime.identityChain?.modelOutputHash || "";
  const liveSandboxRunId = liveRuntime.identityChain?.sandboxRunId || "";
  // Wire the driver intelligence into the UI: the 9-milestone proof checklist
  // and the completion reward are derived from the live governed rows so the
  // user sees exactly what is proven and what remains (never optimistic ticks).
  // The live bar/proof/reward must reflect the CURRENTLY active run (the id the
  // click minted), not the monotonic "best/latest across runs" — otherwise a
  // prior run's stage would drive this run's percentage. Fall back to latest for
  // the pre-run panels where no run is active yet.
  const activeRunId = String(result?.trainingRunId || "");
  const liveRunRow = (activeRunId
    ? (workspaceConfig?.dataModel?.objects || [])
        .filter((o) => o?.objectType === TRAINING_RUN_OBJECT_TYPE)
        .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
        .find((r) => String(r?.trainingRunId || "") === activeRunId)
    : null) || liveRuntime.runState?.latest || {};
  // Real governed run-receipt count (model-training-run rows) — the honest
  // "run receipts available" proof, never an always-true count.
  const runReceiptCount = (workspaceConfig?.dataModel?.objects || [])
    .filter((o) => o?.objectType === TRAINING_RUN_OBJECT_TYPE)
    .reduce((n, o) => n + (Array.isArray(o.rows) ? o.rows.length : 0), 0);
  // Select the custom-model registry row through the GOVERNED trait gate the
  // cockpit uses (kind/capabilityType), not a localhost heuristic.
  const liveRegistryRow = (workspaceConfig?.dataModel?.objects || [])
    .filter((o) => o?.objectType === "api-registry")
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
    .find((r) => isCustomModelRegistryRow(r, new Set([`${SLUG}-model`]))) || null;
  const smokeRun = liveOutputHash ? { outputHash: liveOutputHash } : null;
  const proofChecklist = deriveTrainingProofChecklist(liveRunRow, liveRegistryRow, smokeRun);
  // Wait-state for the control plane: stage/status + BAR all come from ONE
  // deriver over the governed receipt. barPct is the single progress truth.
  const liveWaitState = deriveTrainingWaitState(liveRunRow, Date.now());
  const runnerWaiting = trainPhase === "running"
    && Number(liveWaitState.barPct || 0) === 0
    && !liveRunRow?.progress?.stageId
    && String(liveRunRow?.status || "").toLowerCase() === "running";
  const runnerEndpoint = liveRegistryRow?.baseUrl
    ? `${String(liveRegistryRow.baseUrl).replace(/\/+$/, "")}${String(liveRegistryRow.endpoint || "/chat/completions").startsWith("/") ? liveRegistryRow.endpoint : `/${liveRegistryRow.endpoint || "chat/completions"}`}`
    : "the configured local endpoint";
  // Governed serving profile (adapter / mode / batching / speculative) + resume
  // state — proof-bound; deriveServingProfile.servedModel is the parsed served
  // tag, so the completion reward reuses it instead of re-parsing lastResponse.
  const servingProfile = deriveServingProfile(liveRegistryRow || {}, { expectedTag: artifact.modelTag || reservedTag });
  const resumeState = deriveTrainingResumeState(liveRunRow);
  const completionReward = deriveTrainingCompletionReward(liveRunRow, {
    apiRegistryRow: liveRegistryRow,
    servedModel: servingProfile.servedModel,
    smokeRun,
  });
  // Start-training readiness gate — the deterministic pre-initialization
  // contract that governs the ONE button that begins live local training. The
  // button and the invocation path behind it stay inert until every blocking
  // check (approved config · argv safety · draft-date-vs-blast-radius · first
  // quantization chunk · runner idle) is green. readyPct is a real, monotone
  // fraction of proven gates — never a fabricated 0% or an indeterminate spin.
  const startReadiness = deriveStartTrainingReadiness({ runConfig, result, workspaceConfig });

  // Close is gated while real work is in flight — abandoning mid-finalize or
  // mid-training loses progress, so it takes TWO explicit confirmations.
  function guardedClose() {
    const busyNow = finalizePhase === "preparing" || finalizePhase === "probing"
      || trainPhase === "starting" || trainPhase === "running";
    if (busyNow) {
      const what = trainPhase === "running" || trainPhase === "starting" ? "Training" : "Finalizing";
      if (!window.confirm(`${what} is still in progress. Abandoning this will lose progress. Close anyway?`)) return;
      if (!window.confirm("Are you sure? The in-progress work will be abandoned.")) return;
    }
    onClose();
  }

  const tick = (pct, stage, stageId, converted = 0) => new Promise((resolve) => {
    setProgress({ pct, stage, stageId: stageId || "", converted });
    setTimeout(resolve, 0);
  });

  async function patchObjects(transform) {
    // Read-latest-then-patch — the SAME discipline the runner script uses.
    // A governed write must never transform a stale render-closure snapshot:
    // sequential patches inside one click handler (running receipt → runner
    // row → reconcile) would otherwise overwrite each other's rows and the
    // runner's own live stamps, pinning the bar at 0%.
    const probe = await fetch("/api/workspace", { cache: "no-store" });
    if (!probe.ok) throw new Error(`workspace read refused: ${probe.status}`);
    const data = await probe.json();
    if (!data?.workspaceConfig) throw new Error("workspace read returned no governed config");
    const basis = data.workspaceConfig;
    const objects = transform(basis?.dataModel?.objects || []);
    const patch = { dataModel: { objects } };
    const preflight = await fetch("/api/workspace/patch/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const verdict = await preflight.json().catch(() => ({}));
    if (!preflight.ok || verdict?.ok !== true) {
      const reasons = verdict?.policy?.violations || verdict?.schema?.errors || [];
      throw new Error(`governed preflight refused: ${JSON.stringify(reasons).slice(0, 300)}`);
    }
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`governed PATCH refused: ${(await res.text()).slice(0, 200)}`);
    const applied = await res.json();
    if (applied?.workspaceConfig) {
      setLiveConfig(applied.workspaceConfig);
      if (typeof onApplied === "function") onApplied(applied.workspaceConfig);
    }
    return applied?.workspaceConfig || workspaceConfig;
  }

  // ---- finalize: ONE user action, two governed halves on the SAME lanes
  // training uses. (1) prepare — dataset + scaffold rows + PREPARED run
  // receipt (unchanged); (2) the pre-init probe — a REAL sandbox run
  // (intent: custom-model-preinit-probe) on the machine that will train,
  // whose governed receipt is the only thing that can unlock Start Training.
  // Finalize proves readiness to invoke — it never starts training and never
  // claims a trained/deployed/verified model.
  async function runFinalize() {
    if (finalizePhase === "preparing" || finalizePhase === "probing") return;
    setError("");
    setPreInitReceipt(null);
    setFinalizePhase("preparing");
    const prepared = await doPrepare();
    if (!prepared) { setFinalizePhase("idle"); return; }
    setFinalizePhase("probing");
    const outcome = await runPreInitProbe(prepared);
    if (outcome?.ok) {
      setFinalizePhase("passed");
      setPanel("train");
    } else {
      setFinalizePhase("failed");
    }
  }

  // ---- prepare: build the dataset + apply scaffold rows + PREPARED run receipt
  async function doPrepare() {
    setError("");
    setRecovery(null);
    let stage = "validate";
    try {
      await tick(5, `Validating ${selected.length} curated traces`, "validate");
      if (!floorMet) throw new Error(`fine-tune floor not met: ${selected.length}/${MIN_FINETUNE_TRACES}`);

      stage = "convert";
      const lines = resume.lines || [];
      const chunk = 25;
      for (let i = lines.length; i < selected.length; i += chunk) {
        for (const { row } of selected.slice(i, i + chunk)) lines.push(toJsonlLine(row));
        await tick(10 + Math.round((Math.min(i + chunk, selected.length) / selected.length) * 55),
          `Converting ${Math.min(i + chunk, selected.length)}/${selected.length} to Unsloth JSONL`, "convert", Math.min(i + chunk, selected.length));
      }

      stage = "package";
      await tick(72, `Packaging ${datasetPath}`, "package", selected.length);
      if (!resume.datasetDownloaded) {
        const blob = new Blob(lines, { type: "application/jsonl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = datasetPath; a.click();
        URL.revokeObjectURL(url);
        setResume({ datasetDownloaded: true, datasetPath, lines });
      }

      stage = "apply";
      await tick(82, "Applying governed rows (training data · version · registry · run receipt)", "apply", selected.length);
      const exportId = `ft_${version}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const { registryRow, versionRow, integrationId } = scaffoldHandoffRows({
        slug: SLUG, version, target, modelTag: reservedTag, datasetRecords: selected.length, datasetPath,
      });
      // version row carries the dataset export + base model so the lifecycle links.
      versionRow.baseModel = baseModel;
      versionRow.lastExportId = exportId;
      const preparedReceipt = buildTrainingRunReceipt({
        modelTrainingRowId: SLUG, datasetExportId: exportId, baseModel,
        trainingProfile: profile.id, runnerMode: profile.runnerMode, status: "prepared",
      });
      // Atomic proof-chain links on the API Registry row (§7/§11): the row
      // references the model-training row, the training run, and the tuned tag
      // the endpoint must serve to verify — so the chain is traceable from the
      // atomic row, not only reverse-derived.
      registryRow.modelTrainingRowId = `${SLUG}-v${version}`;
      registryRow.trainingRunId = preparedReceipt.trainingRunId;
      registryRow.expectedModelTag = reservedTag;
      // Unambiguous, deterministic custom-model identity — recognized by tag,
      // not only by reverse link. This is THE atomic custom-model object every
      // agent/sandbox/workflow binds to via apiRegistryId.
      registryRow.kind = "custom-model";
      registryRow.capabilityType = "custom-model-inference";
      const mothershipRow = buildMothershipProxyRow({
        modelTag: reservedTag,
        workspaceSlug: versionRow.Name,
        studentRegistryId: integrationId,
        fallbackBaseModel: baseModel,
        fallbackBaseUrl: String(target.baseUrl || "http://127.0.0.1:11434").replace(/\/v1\/?$/, ""),
      });
      mothershipRow.status = "registered";
      mothershipRow.method = "POST";
      mothershipRow.authRef = "";
      mothershipRow.connectorKind = "http";
      mothershipRow.executionLane = "sandbox-local";
      mothershipRow.description = `Governed serving identity for ${reservedTag}: verified student first, ${baseModel} fallback until promotion, every completed call harvested.`;
      const selectedIdx = new Set(selected.map(({ index }) => index));

      const fresh = await patchObjects((objects) => {
        let next = objects.map((o) => {
          if (o?.id === TRACES_OBJECT_ID) return { ...o, rows: (o.rows || []).map((row, i) => (selectedIdx.has(i) ? { ...row, exported: "true" } : row)) };
          if (o?.objectType === TRAINING_OBJECT_TYPE) return { ...o, rows: [...(o.rows || []), versionRow] };
          if (o?.objectType === "api-registry") {
            // Genome field visibility: now that a custom-model record is
            // present, reveal its binding fields in this table — without
            // touching the object's generic/nango fields (no leak).
            // UPSERT by integrationId: the atomic custom-model identity row
            // is one row forever — a re-prepare must refresh it, never
            // append a duplicate identity.
            const rows = Array.isArray(o.rows) ? o.rows : [];
            const upsert = (inputRows, nextRow) => {
              const existingIdx = inputRows.findIndex((r) => String(r?.integrationId || "") === String(nextRow.integrationId || ""));
              return existingIdx >= 0
                ? inputRows.map((r, i) => (i === existingIdx ? { ...r, ...nextRow } : r))
                : [...inputRows, nextRow];
            };
            const nextRows = upsert(upsert(rows, registryRow), mothershipRow);
            const withRow = { ...o, rows: nextRows };
            return { ...withRow, fieldSettings: applyGenomeFieldSettings(withRow) };
          }
          return o;
        });
        if (!next.some((o) => o?.objectType === TRAINING_OBJECT_TYPE)) {
          next.push({ id: TRAINING_OBJECT_ID, label: "Model Training", source: "Model Training", objectType: TRAINING_OBJECT_TYPE, icon: "Terminal", columns: TRAINING_COLUMNS, rows: [versionRow], binding: { mode: "manual", source: "Model Training" }, relations: [], fieldSettings: { hidden: [], order: TRAINING_COLUMNS } });
        }
        if (!next.some((o) => o?.objectType === "api-registry")) {
          const cols = ["integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse", "entityTypes", "description", "connectorKind", "resolverTemplateId", "schemaVersion", "capabilities", "executionLane", "kind", "capabilityType", "modelTrainingRowId", "trainingRunId", "expectedModelTag"];
          const apiObj = { id: "api-registry", label: "API Registry", source: "API Registry", objectType: "api-registry", icon: "Code", columns: cols, rows: [registryRow, mothershipRow], binding: { mode: "manual", source: "API Registry" }, relations: [], fieldSettings: { hidden: [], order: cols } };
          // Genome field visibility from the start — the custom-model record is
          // present, so its binding fields show; nango fields stay hidden.
          next.push({ ...apiObj, fieldSettings: applyGenomeFieldSettings(apiObj) });
        }
        next = upsertRunRow(next, runReceiptToRow(preparedReceipt));
        return next;
      });

      stage = "verify";
      await tick(94, "Verifying readback", "verify", selected.length);
      const reg = (fresh?.dataModel?.objects || []).filter((o) => o?.objectType === "api-registry").flatMap((o) => o.rows || []).find((r) => r?.integrationId === integrationId);
      if (!reg) throw new Error("registry row not present after apply");

      await tick(100, "Dataset ready · training run prepared", "verify", selected.length);
      // Stamp the approved-configuration timestamp (the "draft date") so the
      // Start-training readiness gate can check it against the tuned tag's blast
      // radius — a stale draft can never silently overwrite a live model.
      const prepared = { datasetPath, records: selected.length, integrationId, modelTag: reservedTag, version, exportId, trainingRunId: preparedReceipt.trainingRunId, draftAt: new Date().toISOString() };
      setResult(prepared);
      setArtifact((a) => ({ ...a, modelTag: reservedTag, type: profile.outputs.includes("gguf") ? "gguf" : profile.outputs[0] }));
      // The probe needs the registered endpoint identity — carry the real
      // read-back row values, never a guess.
      return { ...prepared, registryBaseUrl: String(reg.baseUrl || ""), registryEndpoint: String(reg.endpoint || "/chat/completions") };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      let readbackOk = null; let registryPresent = null;
      try {
        const probe = await fetch("/api/workspace", { cache: "no-store" });
        const data = await probe.json();
        readbackOk = Boolean(data?.workspaceConfig);
        registryPresent = (data?.workspaceConfig?.dataModel?.objects || []).filter((o) => o?.objectType === "api-registry").flatMap((o) => o.rows || []).some((r) => String(r?.integrationId || "") === `${SLUG}-model`);
      } catch { readbackOk = false; }
      setRecovery(deriveHandoffRecovery({ stage, message, online: typeof navigator === "undefined" ? true : navigator.onLine, readbackOk, registryPresent, datasetDownloaded: resume.datasetDownloaded }));
      setPanel("recover");
      return null;
    }
  }

  /** Upsert the pre-init probe runner row — same fold-or-create discipline and
   *  the SAME `model-training-runner` sandbox object the training runner uses
   *  (one execution lane, two intents), just a short probe timeout. */
  function upsertPreInitRunnerRow(objects, preInitRunId, script) {
    const row = {
      Name: preInitRunId, runtime: "node", command: script,
      // Long enough for the mandatory dependency ensure (automatic server
      // install/start + python training packages + quantize tools) on a
      // machine that has never trained before — torch alone is gigabytes.
      timeoutMs: 60 * 60 * 1000, networkPolicy: "allow", runLocality: "local", status: "live",
    };
    let found = false;
    const next = (objects || []).map((o) => {
      if (o?.id !== TRAINING_RUNNER_SANDBOX_ID) return o;
      found = true;
      const rows = Array.isArray(o.rows) ? o.rows : [];
      const idx = rows.findIndex((r) => String(r?.Name || "") === preInitRunId);
      return { ...o, rows: idx >= 0 ? rows.map((r, i) => (i === idx ? { ...r, ...row } : r)) : [...rows, row] };
    });
    if (!found) {
      next.push({
        id: TRAINING_RUNNER_SANDBOX_ID, label: "Model Training Runner", source: "Model Training Runner",
        objectType: "sandbox-environment", icon: "Cpu", columns: RUNNER_COLUMNS, rows: [row],
        binding: { mode: "manual", source: "Model Training Runner" },
        relations: [], fieldSettings: { hidden: ["command"], order: RUNNER_COLUMNS },
      });
    }
    return next;
  }

  // ---- pre-init probe: create the governed probe receipt + runner row, fire
  // the SAME sandbox-run lane training uses, then read the outcome back from
  // the governed receipt (never from component guesses).
  async function runPreInitProbe(prepared) {
    const startedAt = new Date().toISOString();
    const preInitRunId = `preinit_${startedAt.replace(/[:.]/g, "-")}`;
    try {
      const probeReceipt = buildTrainingRunReceipt({
        trainingRunId: preInitRunId, modelTrainingRowId: SLUG, datasetExportId: prepared.exportId,
        baseModel, trainingProfile: profile.id, runnerMode: profile.runnerMode, status: "prepared", startedAt,
      });
      const baseUrl = String(prepared.registryBaseUrl || "").replace(/\/+$/, "");
      const ep = String(prepared.registryEndpoint || "/chat/completions");
      const chatUrl = baseUrl ? `${baseUrl}${ep.startsWith("/") ? ep : `/${ep}`}` : "";
      const script = buildPreInitProbeScript({
        preInitRunId,
        baseModel,
        artifactPath: runConfig.artifactPath,
        modelTag: prepared.modelTag,
        floor: resourceFloorFor(baseModel),
        minScore,
        requiredTraces: MIN_FINETUNE_TRACES,
        ollamaUrl: baseUrl ? baseUrl.replace(/\/v1$/, "") : undefined,
        chatUrl,
        integrationId: prepared.integrationId,
        toolSearchDirs: (readinessProbe?.storageLocations || []).map((l) => String(l.path || "")).filter((p) => /\/llama\.cpp$/.test(p)),
        workspaceUrl: typeof window !== "undefined" && window.location ? window.location.origin : "",
        // Mandatory ensure: the probe starts (and if truly absent, adds) the
        // model server itself, pointed at the user's real model store, and
        // provisions the workspace's own pipeline scripts.
        ollamaBin: readinessProbe?.runtime?.ollama?.binPath || "",
        modelsDir: readinessProbe?.runtime?.ollama?.modelsDir || "",
        venvDir: readinessProbe?.runtime?.python?.venvDir || "",
        pipelineScripts: PIPELINE_SCRIPTS,
      });
      // One governed PATCH: the pre-init receipt row + the probe runner row.
      await patchObjects((objects) => {
        let next = upsertRunRow(objects, { ...runReceiptToRow(probeReceipt), runKind: PREINIT_RUN_KIND });
        next = upsertPreInitRunnerRow(next, preInitRunId, script);
        return next;
      });
      // Link the probe to the approved draft — the Start-training gate reads it.
      setResult({ ...prepared, preInitRunId });

      const res = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: TRAINING_RUNNER_SANDBOX_ID, name: preInitRunId, intent: PREINIT_INTENT, actor: "training-runtime-modal" }),
      });
      const data = await res.json().catch(() => null);
      if (data?.workspaceConfig) {
        setLiveConfig(data.workspaceConfig);
        if (typeof onApplied === "function") onApplied(data.workspaceConfig);
      }

      // Authoritative outcome = the governed receipt the probe stamped.
      let freshCfg = data?.workspaceConfig || null;
      if (!freshCfg) {
        try { const probe = await fetch("/api/workspace", { cache: "no-store" }); freshCfg = (await probe.json())?.workspaceConfig || null; } catch { freshCfg = null; }
        if (freshCfg) { setLiveConfig(freshCfg); if (typeof onApplied === "function") onApplied(freshCfg); }
      }
      const probeRow = (freshCfg?.dataModel?.objects || [])
        .filter((o) => o?.objectType === TRAINING_RUN_OBJECT_TYPE)
        .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
        .find((r) => String(r?.trainingRunId || "") === preInitRunId) || null;
      let state = derivePreInitState(probeRow || {});

      if (!state.present) {
        const stdout = String(data?.response?.stdout || "");
        const completed = /PREINIT_COMPLETE\s+PASS/i.test(stdout) && Number(data?.response?.exitCode) === 0 && !data?.response?.error;
        if (completed) {
          const parsedChecks = stdout.split(/\r?\n/).map((line) => {
            const m = /^CHECK\s+(PASS|WARN)\s+([^:]+):\s*(.*)$/.exec(line.trim());
            if (!m) return null;
            return {
              id: m[2],
              label: m[2].split("-").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" "),
              ok: true,
              detail: m[3],
              blocking: m[1] !== "WARN",
            };
          }).filter(Boolean);
          const endpointLine = parsedChecks.find((c) => c.id === "endpoint-200")?.detail || "";
          const endpointStatus = /HTTP\s+200/i.test(endpointLine) ? 200 : null;
          const passReceipt = {
            present: true,
            ok: true,
            checks: parsedChecks,
            blockedReason: "",
            endpointStatus,
            completedAt: new Date().toISOString(),
          };
          await patchObjects((objects) => objects.map((o) => (o?.objectType !== TRAINING_RUN_OBJECT_TYPE ? o : {
            ...o,
            rows: (Array.isArray(o.rows) ? o.rows : []).map((row) => (String(row?.trainingRunId || "") === preInitRunId
              ? { ...row, status: "prepared", blockedReason: "", preinit: { schema: "growthub-preinit-probe-v1", ok: true, checks: parsedChecks, endpointStatus, completedAt: passReceipt.completedAt } }
              : row)),
          })));
          state = passReceipt;
        } else {
        // The probe never stamped — reconcile the zombie row to a governed,
        // honest failure (same discipline as the training handshake deadline).
        const reason = String(data?.response?.stderr || data?.response?.error || stdout || "The pre-init check could not run on this machine.").trim().slice(0, 300);
        await patchObjects((objects) => objects.map((o) => (o?.objectType !== TRAINING_RUN_OBJECT_TYPE ? o : {
          ...o,
          rows: (Array.isArray(o.rows) ? o.rows : []).map((row) => (String(row?.trainingRunId || "") === preInitRunId
            ? { ...row, status: "blocked", blockedReason: reason, preinit: { schema: "growthub-preinit-probe-v1", ok: false, checks: [{ id: "probe-run", label: "Pre-init check ran", ok: false, detail: reason }], endpointStatus: null, completedAt: new Date().toISOString() } }
            : row)),
        })));
        state = { present: true, ok: false, checks: [{ id: "probe-run", label: "Pre-init check ran", ok: false, detail: reason }], blockedReason: reason, endpointStatus: null, completedAt: "" };
        }
      }

      // Stamp the model-training version row with the chosen folder + the
      // proven readiness state — allowed claims only ("ready-to-train" /
      // "blocked"), never trained/deployed/verified.
      await patchObjects((objects) => objects.map((o) => (o?.objectType !== TRAINING_OBJECT_TYPE ? o : {
        ...o,
        rows: (Array.isArray(o.rows) ? o.rows : []).map((r) => (String(r?.Name || "") === `${SLUG}-v${prepared.version}`
          ? { ...r, trainingFolder: artifactRootPath, readinessState: state.ok ? "ready-to-train" : "blocked" }
          : r)),
      })));

      setPreInitReceipt(state);
      if (!state.ok) setError(state.blockedReason || "The pre-init check did not pass.");
      return state;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      const failed = { present: false, ok: false, checks: [], blockedReason: message, endpointStatus: null, completedAt: "" };
      setPreInitReceipt(failed);
      return failed;
    }
  }

  // ---- train: ONE real click. Record the run RUNNING, stand up the governed
  // runner row carrying the real fine-tune command, kick it on the user's
  // machine through the existing sandbox-run lane, then track the REAL run
  // receipt to completion — a fine-tune may run minutes or many hours; the
  // modal stays live off real state and closes the loop itself.
  async function startTraining() {
    setError("");
    setRemedy(null);
    setStageIssue(null);
    // Pre-initialization gate: the live invocation cannot begin until EVERY
    // blocking readiness check is green (approved config · argv safety ·
    // draft-date-vs-blast-radius · first quantization chunk · runner idle).
    // This re-derives from fresh state at click time so a race that unblocks
    // the button can never let a stale/unsafe draft through to the runner.
    const gate = deriveStartTrainingReadiness({ runConfig, result, workspaceConfig });
    if (!gate.canStart) {
      setError(`Cannot start yet — ${gate.blockingReason}`);
      return;
    }
    // Governed gate: never fire an unsafe/not-ready config, and the one-click
    // runner only executes argv `steps` (legacy command profiles are
    // import-only). Both surface the exact reason instead of a dark failure.
    if (!runConfig.ready) {
      setError(`Cannot start: ${(runConfig.commandSafety?.reasons || runConfig.missingRequirements || []).join("; ") || "run config not ready"}.`);
      return;
    }
    if (!Array.isArray(runConfig.steps) || runConfig.steps.length === 0) {
      setError("This profile has no governed argv steps — it is import-only. Pick the one-click pipeline profile to run locally.");
      return;
    }
    setTrainPhase("starting");
    const startedAt = new Date().toISOString();
    const trainingRunId = `trainrun_${startedAt.replace(/[:.]/g, "-")}`;
    const exportId = result.exportId || `ft_${result.version || version}_${startedAt.replace(/[:.]/g, "-")}`;
    try {
      const runningReceipt = buildTrainingRunReceipt({
        trainingRunId, modelTrainingRowId: SLUG, datasetExportId: exportId,
        baseModel, trainingProfile: profile.id, runnerMode: profile.runnerMode, status: "running", startedAt,
      });
      const activeResult = { ...result, trainingRunId, exportId };
      setResult(activeResult);
      // One governed PATCH: running receipt + the runner sandbox row.
      await patchObjects((objects) => {
        let next = upsertRunRow(objects, runReceiptToRow(runningReceipt));
        next = upsertRunnerSandbox(next, trainingRunId, runConfig, result.integrationId, { minScore, ollamaBin: readinessProbe?.runtime?.ollama?.binPath || "", modelsDir: readinessProbe?.runtime?.ollama?.modelsDir || "", toolSearchDirs: (readinessProbe?.storageLocations || []).map((l) => String(l.path || "")).filter((pp) => /\/llama\.cpp$/.test(pp)), venvPython: readinessProbe?.runtime?.python?.venvDir ? `${readinessProbe.runtime.python.venvDir}/bin/python` : "" });
        return next;
      });
      setTrainPhase("running");

      // Begin the live receipt poll BEFORE firing the invocation: the
      // sandbox-run POST is synchronous and holds until the pipeline ends
      // (hours for a real fine-tune), while the runner stamps preflight →
      // distilling → training progress through governed PATCHes within
      // seconds. Awaiting the POST first would freeze the bar at 0% for the
      // whole run. A hard start failure reconciles through the runner path /
      // handshake deadline — the loop never spins at 0% forever.
      startRunPolling(startedAt, trainingRunId);
      triggerTrainingRunner(trainingRunId).then((started) => {
        if (!started) setTrainPhase("idle");
      }).catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setTrainPhase("idle");
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTrainPhase("idle");
    }
  }

  // Returns true when the runner was accepted (a receipt will be stamped as it
  // runs), false on a hard start failure so the caller does not begin a poll
  // loop that could only ever spin at 0%.
  async function triggerTrainingRunner(trainingRunIdOverride) {
    const trainingRunId = typeof trainingRunIdOverride === "string" ? trainingRunIdOverride : result?.trainingRunId;
    if (!trainingRunId) return false;
    setError("");
    await patchObjects((objects) => upsertRunnerSandbox(objects, trainingRunId, runConfig, result.integrationId, { minScore, ollamaBin: readinessProbe?.runtime?.ollama?.binPath || "", modelsDir: readinessProbe?.runtime?.ollama?.modelsDir || "", toolSearchDirs: (readinessProbe?.storageLocations || []).map((l) => String(l.path || "")).filter((pp) => /\/llama\.cpp$/.test(pp)), venvPython: readinessProbe?.runtime?.python?.venvDir ? `${readinessProbe.runtime.python.venvDir}/bin/python` : "" }));
    const res = await fetch("/api/workspace/sandbox-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: TRAINING_RUNNER_SANDBOX_ID, name: trainingRunId, intent: "model-training-run", actor: "training-runtime-modal" }),
    });
    if (!res.ok) {
      const message = (await res.text()).slice(0, 240);
      setError(`Runner did not start: ${message}`);
      return false;
    }
    const data = await res.json().catch(() => null);
    if (data?.workspaceConfig) {
      setLiveConfig(data.workspaceConfig);
      if (typeof onApplied === "function") onApplied(data.workspaceConfig);
    }
    if (data?.ok === false) {
      const message = String(data?.response?.stderr || data?.response?.error || data?.response?.stdout || "Runner failed before writing a receipt").trim();
      const fresh = await reconcileRunnerResult(trainingRunId, data?.response, message);
      setLiveConfig(fresh || data?.workspaceConfig || liveConfig);
      setTrainPhase("idle");
      return false;
    }
    return true;
  }

  async function reconcileRunnerResult(trainingRunId, response, fallbackMessage = "") {
    const reason = String(response?.stderr || response?.error || response?.stdout || fallbackMessage || "Runner failed before writing a receipt").trim();
    if (!reason) return null;
    return patchObjects((objects) => objects.map((o) => {
      if (o?.objectType !== TRAINING_RUN_OBJECT_TYPE) return o;
      return {
        ...o,
        rows: (Array.isArray(o.rows) ? o.rows : []).map((row) => {
          if (String(row?.trainingRunId || "") !== String(trainingRunId)) return row;
          return {
            ...row,
            status: /preflight blocked/i.test(reason) ? "blocked" : "failed",
            blockedReason: reason,
            preflight: row.preflight || {
              ok: false,
              floor: resourceFloorFor(runConfig?.baseModel),
              artifactPath: runConfig?.artifactPath || "",
            },
            progress: {
              ...(row.progress || {}),
              stageId: "preflight",
              stageRank: 0,
              pct: 0,
              detail: reason,
              index: 0,
              total: Array.isArray(runConfig?.steps) ? runConfig.steps.length : 0,
            },
          };
        }),
      };
    }));
  }

  // Apply the single derived remedy. Auto-fixable format cleansing runs the
  // deterministic rule (trim + strip control chars) through the governed PATCH,
  // then re-runs. Every other remedy re-runs the idempotent pipeline (same run
  // id) once the user has acted on the derived fix. Nothing else spins up.
  async function applyRemedy(r) {
    if (!r) return;
    setError("");
    if (r.action === "cleanse_traces") {
      const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
      const clean = (v) => String(v ?? "").replace(CTRL, "").trim();
      await patchObjects((objects) => objects.map((o) => (o?.id === "training-traces"
        ? { ...o, rows: (o.rows || []).map((row) => ({ ...row, inputPrompt: clean(row.inputPrompt), agentOutput: clean(row.agentOutput) })) }
        : o)));
    }
    setRemedy(null);
    await startTraining();
  }

  // Poll the REAL governed run receipt until the run reaches a terminal stage.
  // Drives the live bar from real state and auto-advances on a provable
  // artifact — for however long the fine-tune takes.
  function startRunPolling(startedAt, runIdOverride) {
    if (pollRef.current) clearInterval(pollRef.current);
    const startMs = Date.parse(startedAt) || Date.now();
    // The id to track. startTraining mints a new run id and calls setResult,
    // but this closure captured the pre-click `result` — so the caller passes
    // the id explicitly. The retry path (post-render) can fall back to state.
    const activeId = String(runIdOverride || result?.trainingRunId || "");
    // Liveness latch: flips true the instant ANY real receipt evidence lands.
    // Until then the handshake deadline governs; after, the run is genuinely
    // executing and polls for as long as the fine-tune needs.
    let sawStamp = false;
    pollRef.current = setInterval(async () => {
      try {
        const probe = await fetch("/api/workspace", { cache: "no-store" });
        if (!probe.ok) return;
        const data = await probe.json();
        const cfg = data?.workspaceConfig;
        if (!cfg) return;
        setLiveConfig(cfg);
        if (typeof onApplied === "function") onApplied(cfg);
        const rt = deriveTrainingRuntimeState({ workspaceConfig: cfg, workspaceSourceRecords, slug: SLUG });
        // Track THIS run specifically, keyed by the id minted at click. The
        // composed runState merges progress/stage/artifact MONOTONICALLY across
        // every run for the slug, so a prior run would otherwise defeat the
        // handshake deadline (stale stageId) or falsely close this one on the
        // first tick (a prior `imported` artifact). Read the raw row for this id
        // (`activeId` is resolved once at the top of startRunPolling).
        const rawRow = (cfg?.dataModel?.objects || [])
          .filter((o) => o?.objectType === TRAINING_RUN_OBJECT_TYPE)
          .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
          .find((r) => String(r?.trainingRunId || "") === activeId) || {};
        const mine = (rt.runState?.runs || []).find((r) => String(r.trainingRunId) === activeId) || null;
        const myStage = mine?.stage || (String(rawRow.status || "").toLowerCase() === "running" ? "running" : "prepared");
        // Handshaked once THIS run stamps preflight/progress or reaches a
        // terminal stage — never inferred from another run's evidence.
        if (String(rawRow?.progress?.stageId || "").trim() || rawRow?.preflight || ["trained", "imported", "failed"].includes(myStage)) sawStamp = true;

        if (myStage === "failed") {
          clearInterval(pollRef.current); pollRef.current = null;
          // SPECIFIC failure — classify the exact stage issue (not "training
          // failed"): {stageId, issue, userMessage, evidence, nextAction}.
          const issue = deriveTrainingStageIssue(rawRow, rawRow.preflight || null, String(rawRow.blockedReason || mine?.reason || ""));
          setStageIssue(issue);
          setError(issue.userMessage);
          // The one-click remedy for this exact failure point.
          const rem = deriveTrainingRemediation({ workspaceConfig: cfg, workspaceSourceRecords, minScore, slug: SLUG });
          setRemedy(rem.top || issue.nextAction);
          setTrainPhase("idle");
          return;
        }
        // Provable artifact for THIS run (runner hashed a real QUANTIZED GGUF
        // with a proven fp16→quant size delta) → close the loop.
        if (myStage === "imported" || mine?.artifact?.identified) {
          clearInterval(pollRef.current); pollRef.current = null;
          importArtifact({
            type: rawRow.artifactType || artifact.type,
            modelTag: rawRow.artifactModelTag || reservedTag,
            path: rawRow.artifactPath || "",
            sha256: rawRow.artifactSha256 || "",
            quantization: rawRow.artifactQuantization || artifact.quantization,
            sourceBytes: rawRow.artifactSourceBytes || 0,
            artifactBytes: rawRow.artifactArtifactBytes || 0,
          });
          return;
        }
        // Handshake deadline — the ONE thing that ends the "stuck at 0%" loop.
        // If no receipt evidence has arrived within the window, the invocation
        // never came up; stop polling, reconcile the zombie `running` row to a
        // governed failure (freeing the start gate), and drop to idle with an
        // actionable reason. A run that already stamped is never touched here.
        if (!sawStamp && (Date.now() - startMs) > RUNNER_HANDSHAKE_DEADLINE_MS) {
          clearInterval(pollRef.current); pollRef.current = null;
          const reason = `Local runner did not report within ${Math.round(RUNNER_HANDSHAKE_DEADLINE_MS / 1000)}s — it may not have started or cannot reach this workspace at ${runnerEndpoint}. Start the local runner for ${result.modelTag} and retry, or attach an existing result.`;
          const fresh = await reconcileRunnerResult(activeId, null, reason);
          if (fresh) { setLiveConfig(fresh); if (typeof onApplied === "function") onApplied(fresh); }
          const row = (fresh ? deriveTrainingRuntimeState({ workspaceConfig: fresh, workspaceSourceRecords, slug: SLUG }).runState?.latest : rt.runState?.latest) || {};
          setStageIssue(deriveTrainingStageIssue(row, row.preflight || null, reason));
          setError(reason);
          setTrainPhase("idle");
          return;
        }
        // The bar advances ONLY on real receipt progress: setLiveConfig(cfg)
        // above re-renders, and deriveTrainingWaitState(liveRunRow).barPct is
        // the bar. No side-channel, no fabrication — before the first stamp,
        // barPct is 0 and the status line says so.
      } catch { /* transient — keep polling */ }
    }, 5000);
  }

  // ---- import: record the artifact identity → imported receipt + tuned localModel.
  async function importArtifact(artifactOverride) {
    setError("");
    const a = (artifactOverride && typeof artifactOverride === "object") ? artifactOverride : artifact;
    const state = deriveArtifactState(a);
    if (!state.identified) {
      // Auto-close path can't prove it yet → fall back to the manual import
      // panel so the user can attach the result; manual path surfaces the error.
      if (artifactOverride) { setArtifact((prev) => ({ ...prev, ...a })); setPanel("import"); return; }
      setError(`Artifact not provable yet: ${state.reason}`); return;
    }
    if (artifactOverride) setArtifact((prev) => ({ ...prev, ...a }));
    setBusy(true);
    try {
      setBusyPct(20); setBusyMsg("Recording the imported artifact (governed run receipt)…");
      const importedReceipt = buildTrainingRunReceipt({
        trainingRunId: result.trainingRunId, modelTrainingRowId: SLUG, datasetExportId: result.exportId,
        baseModel, trainingProfile: profile.id, runnerMode: profile.runnerMode, status: "imported",
        startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), artifact: a,
      });
      setBusyPct(55); setBusyMsg("Activating the tuned model in the Data Model + API Registry record…");
      await patchObjects((objects) => {
        let next = upsertRunRow(objects, runReceiptToRow(importedReceipt));
        const inferenceControlPlane = target.id === LLAMA_CPP_LOCAL_TARGET_ID
          ? buildLlamaCppInferenceControlPlane({
              baseModel: { id: a.modelTag, path: a.path, sha256: a.sha256 },
              servedAlias: a.modelTag,
            })
          : null;
        // Activate ONE exact served identity across the whole release chain.
        // Attaching an already-installed model may legitimately choose a tag
        // different from the draft reservation; the training row, direct
        // registry record, and mothership policy must move together or the UI
        // would claim activation while the first real invocation requests a
        // nonexistent tag.
        return rebindCustomModelServingIdentity(next, {
          trainingRowId: `${SLUG}-v${result.version}`,
          integrationId: result.integrationId,
          modelTag: a.modelTag,
          inferenceControlPlane,
        });
      });
      setResult((current) => current ? { ...current, modelTag: a.modelTag } : current);
      setBusyPct(100); setBusyMsg(`Model record ready — ${a.modelTag} is registered. A real gateway invocation is still required before it is callable and verified.`);
      setPanel("verify");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- verify: run the registry test and surface the tuned-tag proof honestly.
  async function runVerify() {
    let candidateProof = null;
    setError("");
    setVerifying(true);
    setVerifyResult(null);
    setVerificationEvidence(null);
    setHttpStatus(null);
    setInspectorTab("response");
    try {
      const res = await fetch("/api/workspace/test-source", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId: result.integrationId, prompt: String(testPrompt || DEFAULT_TEST_PROMPT) }),
      });
      setHttpStatus(res.status); // the REAL HTTP status — never a fabricated 200
      const data = await res.json().catch(() => ({}));
      setVerificationEvidence(data);
      const responseBody = data?.response ?? null;
      const candidate = verifyTunedResponse({ expectedTag: artifact.modelTag || reservedTag, baseModel, responseBody });
      candidateProof = candidate;
      const gatewayVerified = res.ok
        && data?.ok === true
        && data?.tunedTagVerified === true
        && Boolean(data?.verificationReceipt)
        && candidate.verified;
      if (!gatewayVerified) {
        setVerifyResult({
          ...candidate,
          verified: false,
          reason: data?.error || candidate.reason || "the inference gateway did not return tuned-tag verification evidence",
        });
        setError(data?.error || candidate.reason || `Model verification failed (${res.status})`);
        return;
      }

      // The live call is read-only. Persist its response only through the
      // canonical preflight -> PATCH lane so the training ledger and future
      // mothership routing can consume the same durable tuned-tag proof.
      const testedAt = new Date().toISOString();
      await patchObjects((objects) => objects.map((object) => object?.objectType !== "api-registry"
        ? object
        : {
          ...object,
          rows: (object.rows || []).map((row) => String(row?.integrationId || "") !== String(result.integrationId || "")
            ? row
            : {
              ...row,
              status: "connected",
              lastTested: testedAt,
              lastResponse: JSON.stringify(responseBody),
              metadata: {
                ...(row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {}),
                lastVerificationReceipt: data.verificationReceipt,
              },
            }),
        }));
      setVerificationEvidence({ ...data, persistedAt: testedAt });
      setVerifyResult({ ...candidate, verificationReceipt: data.verificationReceipt });
      // Stay on the inspector so the user can read Response/Trace/Details/Proof
      // before advancing — an explicit "use it in a workflow" CTA moves on.
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (candidateProof?.verified) {
        setVerifyResult({ ...candidateProof, verified: false, demotion: "persistence", reason: `live invocation passed, but durable proof was not recorded: ${message}` });
      }
      setError(message);
    } finally {
      setVerifying(false);
    }
  }

  const runTag = result?.modelTag || reservedTag;
  const headTitle = ({
    curate: "Configure Traces", profile: "Train custom model", prepare: "Dataset Readiness",
    train: trainPhase === "running" ? `Training ${runTag}` : "Run training", import: "Attach model result",
    verify: "First invocation test", bind: "Run in workflow", recover: "Training blocked", done: "Proof loop complete",
  })[panel] || "Custom Model Training";
  // Status pill per panel — the reference's Ready to train / Running / Success /
  // Needs attention / Verified pill, using the app's own dm-status-chip tones.
  const pill = (() => {
    if (panel === "recover") return { label: "Needs attention", cls: "is-bad" };
    if (panel === "verify") return verifyResult?.verified ? { label: "Success", cls: "is-ok" } : verifyResult ? { label: "Not verified", cls: "is-bad" } : { label: "Ready to test", cls: "" };
    if (panel === "train") return stageIssue ? { label: "Needs attention", cls: "is-bad" } : trainPhase === "running" ? { label: "Running", cls: "is-running" } : startReadiness.canStart ? { label: "Ready to train", cls: "is-ok" } : { label: `Pre-init ${startReadiness.readyPct}%`, cls: "is-warn" };
    if (panel === "prepare") return { label: "Preparing", cls: "is-running" };
    if (panel === "done") return smokeProven ? { label: "Verified", cls: "is-ok" } : { label: "Proof pending", cls: "is-warn" };
    if (panel === "bind") return smokeProven ? { label: "Verified", cls: "is-ok" } : { label: "Bind", cls: "" };
    if (panel === "profile") {
      // No pill while finalizing — the button itself carries that state.
      if (finalizePhase === "preparing" || finalizePhase === "probing") return null;
      if (finalizePhase === "failed") return { label: "Needs attention", cls: "is-bad" };
      return canFinalize ? { label: "Ready to finalize", cls: "is-ok" } : readinessProbe ? { label: "Needs setup", cls: "is-warn" } : { label: "Checking readiness", cls: "" };
    }
    if (panel === "curate") return null; // the step title says it — no redundant pill
    return floorMet ? { label: "Ready to train", cls: "is-ok" } : { label: "Collect traces", cls: "is-warn" };
  })();

  return createPortal((
    <div className="dm-orch-modal-backdrop" role="presentation" onClick={guardedClose}>
      <div className="dm-orch-modal" role="dialog" aria-modal="true" aria-label="Training runtime" data-training-handoff="" data-training-panel={panel} onClick={(e) => e.stopPropagation()}>
        <div className="dm-orch-modal-head training-handoff-head">
          <div>
            <p className="dm-api-action-card-eyebrow">Custom model training</p>
            <h2>{headTitle}</h2>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {pill ? <span className={`dm-status-chip ${pill.cls}`} data-training-status={pill.label}><span className="dm-status-dot" aria-hidden="true" />{pill.label}</span> : null}
            <button type="button" className="dm-btn-ghost" onClick={guardedClose} aria-label="Close">Close</button>
          </div>
        </div>

        <div className="dm-orch-modal-body">
          {/* Two facts only — the deploy target is chosen in the configuration
              dropdown below; pre-announcing one here would be a false claim. */}
          <div className="training-handoff-summary">
            <div><strong>{selected.length}</strong><span>qualified traces</span></div>
            <div><strong>{MIN_FINETUNE_TRACES}</strong><span>minimum</span></div>
          </div>
          {error ? <div className="dm-helper-error">{error}</div> : null}
          {/* SPECIFIC failure card — the classified stage issue with evidence,
              not a generic "training failed". */}
          {stageIssue ? (
            <div className="dm-helper-toolcall dm-swarm-card" data-train-stage-issue={stageIssue.issue} data-train-issue-stage={stageIssue.stageId}>
              <div className="dm-helper-toolcall-title dm-swarm-card-title">{stageIssue.stageId} · {stageIssue.issue}</div>
              <div className="dm-helper-stream dm-swarm-card-desc">{stageIssue.userMessage}</div>
              {stageIssue.evidence && (stageIssue.evidence.step != null || stageIssue.evidence.vramFreeGB != null || stageIssue.evidence.sourceBytes != null) ? (
                <div className="dm-run-console__hint" data-train-issue-evidence="">
                  {stageIssue.evidence.step != null ? `step ${stageIssue.evidence.step}/${stageIssue.evidence.totalSteps ?? "?"} · ` : ""}
                  {stageIssue.evidence.vramFreeGB != null ? `VRAM ${stageIssue.evidence.vramFreeGB}/${stageIssue.evidence.requiredGB ?? "?"} GB · ` : ""}
                  {stageIssue.evidence.checkpointPath ? `checkpoint ${stageIssue.evidence.checkpointPath}` : ""}
                </div>
              ) : null}
            </div>
          ) : null}
          {remedy ? (
            <div className="dm-helper-toolcall dm-swarm-card" data-train-remedy={remedy.action || remedy.variant}>
              <div className="dm-helper-toolcall-title dm-swarm-card-title">Next action</div>
              <div className="dm-helper-stream dm-swarm-card-desc">{remedy.derivedFix || remedy.label}</div>
              <button type="button" className="training-action-primary" data-train-remedy-apply={remedy.action || remedy.variant} onClick={() => applyRemedy(remedy)}>
                {remedy.autoFixable ? remedy.cta : (remedy.label || "Re-run")}
              </button>
            </div>
          ) : null}

          {panel === "checklist" && (
            <div className="dm-orch-modal-list">
              {/* Reference "Eligible" card: eyebrow + title (in the head) + a
                  green-check Proof summary + Next step + Configure traces CTA. */}
              <section className="dm-api-action-card dm-api-action-card-muted" data-handoff-journey="" aria-label="Eligibility proof summary">
                <div className="dm-api-action-card-body">
                  <p className="dm-api-action-card-eyebrow">Proof summary</p>
                  <ul className="dm-api-action-checklist">
                    <li className={candidates.length > 0 ? "is-done" : "is-pending"}>
                      {candidates.length > 0 ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                      <span>Trace records found</span>
                      <b style={{ marginLeft: "auto", fontWeight: 600 }}>{candidates.length} records</b>
                    </li>
                    <li className={modelChoices.configured ? "is-done" : "is-pending"} data-eligible-runtime={modelChoices.configured ? "yes" : "no"}>
                      {modelChoices.configured ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                      <span>Local runtime detected</span>
                      <b style={{ marginLeft: "auto", fontWeight: 600 }}>{modelChoices.configured ? (modelChoices.runtimes[0]?.adapter || "runner ready") : "Set a runtime"}</b>
                    </li>
                    <li className={runReceiptCount > 0 ? "is-done" : "is-pending"} data-eligible-receipts={runReceiptCount}>
                      {runReceiptCount > 0 ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                      <span>Run receipts available</span>
                      <b style={{ marginLeft: "auto", fontWeight: 600 }}>{runReceiptCount > 0 ? `${runReceiptCount} receipts` : "none yet (first run)"}</b>
                    </li>
                  </ul>
                  <p className="dm-api-action-card-eyebrow" style={{ marginTop: 12 }}>Next step</p>
                  <p>Configure your distillation traces and start training your first custom model from verified traces.</p>
                </div>
              </section>
              <div className="training-handoff-action-row">
                <span className="training-handoff-eligibility" data-handoff-eligibility="">{selected.length} eligible · {MIN_FINETUNE_TRACES} required</span>
                <button type="button" className="dm-btn-primary" data-handoff-curate="" data-handoff-cta={candidates.length === 0 ? "collect" : floorMet ? "review-eligible" : "review-more"} disabled={candidates.length === 0} onClick={() => setPanel("curate")}>
                  {candidates.length === 0 ? "Collect more traces" : "Configure traces"}
                </button>
              </div>
            </div>
          )}

          {panel === "curate" && (
            <div className="dm-orch-modal-list">
              <section className="training-config-modal" data-handoff-configure-traces="">
                  <div className="training-config-panel">
                    <label className="training-config-field training-config-field-wide">
                      <span>Trace source</span>
                      <select value="training-traces" data-handoff-trace-source="" onChange={() => {}}>
                        <option value="training-traces">Distillation traces</option>
                      </select>
                      <em>{selected.length.toLocaleString()} records</em>
                    </label>

                    <div className="training-config-toolbar">
                      <label className="training-config-field">
                        <span>Min quality</span>
                        <select value={minScore} onChange={(e) => { setMinScore(Number(e.target.value)); setExcluded(new Set()); }} data-handoff-min-score="">
                          <option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
                        </select>
                      </label>
                      <label className="training-config-field">
                        <span>Deploy target</span>
                        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} data-handoff-target="">
                          {FINE_TUNE_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      </label>
                    </div>

                    <div className="training-map-table" data-handoff-field-map="">
                      <div className="training-map-head">
                        <span>Map trace fields</span>
                        <span>Sample</span>
                        <span>Field</span>
                      </div>
                      {traceMapRows.map((row) => (
                        <label key={row.key} className="training-map-row" data-handoff-trace={row.key}>
                          <span className="training-map-label">{row.label}</span>
                          <span className="training-map-sample">{String(row.sample || "No sample").slice(0, 64)}</span>
                          <select
                            value={traceFieldMap[row.key]}
                            onChange={(e) => setTraceFieldMap((current) => ({ ...current, [row.key]: e.target.value }))}
                            data-handoff-field-map-select={row.key}
                          >
                            {traceFieldOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>

                    {/* Counts live in the modal-top summary strip — repeating
                        them here was noise. The machine-readable floor state
                        stays as a data attribute for the e2e readbacks. */}
                    <div data-handoff-floor={floorMet ? "met" : "unmet"} style={{ display: "none" }} aria-hidden="true">{floorMet ? "met" : "unmet"}</div>
                    {!floorMet ? (
                      <div className="dm-run-console__hint">{MIN_FINETUNE_TRACES - selected.length} more curated traces required before training.</div>
                    ) : null}
                    {blocked > 0 ? (
                      <div className="dm-run-console__hint" data-handoff-redaction-blocked={blocked}>
                        {blocked} trace{blocked === 1 ? " is" : "s are"} blocked by redaction policy and cannot enter the training corpus.
                      </div>
                    ) : null}
                  </div>
              </section>
              <div className="training-handoff-action-row">
                <button type="button" className="training-action-primary" data-handoff-to-profile="" disabled={!floorMet} onClick={() => setPanel("profile")}>
                  {floorMet ? "Save configuration" : `Need ${MIN_FINETUNE_TRACES - selected.length} more curated traces`}
                </button>
              </div>
            </div>
          )}

          {panel === "profile" && (
            <div className="dm-orch-modal-list">
              {/* Reference "One-Click Train": an Impact summary the user reads
                  before pressing start — key/value rows, no raw commands. */}
              <section className="dm-api-action-card dm-api-action-card-muted" data-handoff-runsummary="" aria-label="Impact summary">
                <div className="dm-api-action-card-body">
                  <p className="dm-api-action-card-eyebrow">Impact summary</p>
                  <dl className="training-impact">
                    <div><dt>Source</dt><dd>{selected.length} distillation traces</dd></div>
                    <div><dt>Model name</dt><dd>{reservedTag}</dd></div>
                    <div><dt>Base model</dt><dd>{baseModel || "—"}</dd></div>
                    <div><dt>Artifact location</dt><dd data-handoff-artifact-location="">{chosenFolder?.path || "—"}</dd></div>
                    <div><dt>Compute</dt><dd>{profile.runnerMode === "local-command" ? "Local · " + (modelChoices.runtimes[0]?.adapter || "ollama") : profile.runnerMode}</dd></div>
                    <div><dt>Runtime</dt><dd>Measured after machine preflight</dd></div>
                    <div><dt>Provider charge</dt><dd>None · uses your local compute</dd></div>
                  </dl>
                  <p className="dm-api-action-card-note" data-handoff-resource-floor={`${floor.ramGB}/${floor.diskGB}/${floor.vramGB}`}>
                    One click runs training, quantization, and local serving. Needs ~{floor.ramGB} GB RAM · {floor.diskGB} GB disk{floor.vramGB ? ` · ${floor.vramGB} GB VRAM` : ""} — checked before anything runs. It must reply as <strong>{runConfig.verification.expectedModel}</strong> to verify.
                  </p>
                </div>
              </section>

              {/* Compact governed config — profile, adaptive base model, tuned
                  tag. Not raw prose; labelled fields. */}
              <section className="dm-api-action-card dm-api-action-card-muted training-config-fields" aria-label="Training configuration">
                <div className="dm-api-action-card-body">
                  <p className="dm-api-action-card-eyebrow">Configuration</p>
                  <label className="training-field"><span>Training profile</span>
                    <select value={profileId} onChange={(e) => setProfileId(e.target.value)} data-handoff-profile="">
                      {TRAINING_RUNTIME_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </label>
                  <div className="training-field" data-handoff-base-model-field=""><span>Base model</span>
                    {availableBases === null ? (
                      <div className="training-probe-note" data-handoff-base-model-loading="">
                        {probeError ? "Couldn't check your local models." : "Checking your local models…"}
                      </div>
                    ) : availableBases.length ? (
                      <select value={baseModel} onChange={(e) => setChosenBase(e.target.value)} data-handoff-base-model="" aria-label="Base model">
                        {(readinessProbe?.baseModels || []).map((m) => (
                          <option key={m.tag} value={m.tag}>{m.tag}{Number(m.sizeBytes) > 0 ? ` · ${(Number(m.sizeBytes) / 1e9).toFixed(1)} GB` : ""}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="training-probe-note" data-handoff-base-model-empty="">
                        Looking for your models — the drives and model store are re-checked automatically.
                      </div>
                    )}
                  </div>
                  <label className="training-field"><span>Training folder</span>
                    {readinessProbe === null ? (
                      <div className="training-probe-note" data-handoff-artifact-folder-loading="">
                        {probeError ? "Couldn't check your drives." : "Checking your drives…"}
                      </div>
                    ) : (
                      <select value={artifactFolder} onChange={(e) => setArtifactFolder(e.target.value)} data-handoff-artifact-folder="" aria-label="Training folder">
                        {!artifactFolder ? <option value="">Choose a folder…</option> : null}
                        {storageLocations.map((l) => (
                          <option key={l.path} value={l.path} disabled={!l.writable}>{labelStorageLocation(l)}</option>
                        ))}
                        <option value={CUSTOM_FOLDER}>Choose a specific folder…</option>
                      </select>
                    )}
                    <em>Artifact location — where the trained model files are written.</em>
                  </label>
                  {artifactFolder === CUSTOM_FOLDER ? (
                    <label className="training-field"><span>Folder path</span>
                      <input type="text" value={customFolder} placeholder="/Volumes/YourDrive/models" onChange={(e) => setCustomFolder(e.target.value)} data-handoff-artifact-folder-custom="" />
                      {customFolder.trim() ? (
                        <em data-handoff-folder-check={customFolderCheck ? (customFolderCheck.writable ? "writable" : "blocked") : "checking"}>
                          {customFolderCheck
                            ? (customFolderCheck.writable
                              ? `Folder is writable${Number(customFolderCheck.freeGB) > 0 ? ` · ${customFolderCheck.freeGB} GB free` : ""}`
                              : (customFolderCheck.detail || "That folder can't be written to — pick another."))
                            : "Checking the folder…"}
                        </em>
                      ) : null}
                    </label>
                  ) : null}
                  <label className="training-field"><span>Tuned model tag</span>
                    <input type="text" value={tunedTag} placeholder={`${SLUG}-tuned-v${version}`} onChange={(e) => setTunedTag(e.target.value)} data-handoff-tuned-tag="" aria-invalid={tagUnsafe ? "true" : undefined} aria-describedby={tagUnsafe ? "handoff-tag-error" : undefined} />
                  </label>
                  {tagUnsafe ? (
                    <div className="dm-field-error" id="handoff-tag-error" data-handoff-tag-error="">Use letters, numbers, dash, underscore, dot, slash, or colon only — no spaces or shell characters.</div>
                  ) : null}
                  {/* Runtime chip driven by the PROBE'S truth — running now, or
                      started automatically at finalize. Never a "configure it
                      yourself" warning. */}
                  {readinessProbe ? (
                    <div className="dm-cockpit-fields" data-handoff-runtime={readinessProbe.runtime?.ollama?.reachable ? "running" : "auto-start"} style={{ marginTop: 8 }}>
                      {readinessProbe.runtime?.ollama?.reachable
                        ? <span className="dm-status-chip is-ok" data-handoff-runtime-row="ollama" data-handoff-runtime-reachable="yes"><span className="dm-status-dot" aria-hidden="true" />Local runtime running · {String(readinessProbe.runtime.ollama.baseUrl || "").replace(/^https?:\/\//, "")}</span>
                        : <span className="dm-status-chip" data-handoff-runtime-autostart=""><span className="dm-status-dot" aria-hidden="true" />Runtime starts automatically at finalize</span>}
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Deterministic readiness rows — plain-language pass/fail/pending
                  evidence behind the Finalize button (replaces the old
                  "Cannot start yet" callout). Same card grammar and width as
                  the configuration card above. */}
              {(() => {
                // Receipt-driven rows once a probe attempt exists: the REAL
                // per-checkpoint evidence the sandbox probe stamped. Before an
                // attempt (or while probing), the local discovery rows show.
                const probing = finalizePhase === "probing";
                const receiptRows = preInitReceipt?.checks?.length
                  ? preInitReceipt.checks.map((c) => ({ id: c.id, label: c.label, status: c.ok ? "pass" : (c.blocking === false ? "warn" : "fail"), detail: c.detail }))
                  : null;
                const rows = receiptRows || configureReadiness.rows.map((r) => (probing && r.status !== "fail" ? { ...r, status: r.status === "pass" ? "pass" : "pending" } : r));
                const passedCount = rows.filter((r) => r.status === "pass").length;
                const failedAttempt = Boolean(preInitReceipt) && !preInitReceipt.ok;
                const eyebrow = failedAttempt ? "Troubleshooting — the pre-init check found a problem"
                  : probing ? "Running the pre-init check on this machine…"
                    : canFinalize ? "Ready to finalize" : "Before you can finalize";
                return (
                  <section
                    className="dm-api-action-card dm-api-action-card-muted"
                    data-handoff-readiness={failedAttempt ? "failed" : probing ? "probing" : canFinalize ? "ready" : "blocked"}
                    data-handoff-preinit-receipt={preInitReceipt ? (preInitReceipt.ok ? "pass" : "fail") : "none"}
                    {...(canFinalize && !failedAttempt ? {} : { "data-handoff-blocked": (failedAttempt ? preInitReceipt.checks.find((c) => !c.ok)?.id : configureReadiness.firstBlocked?.id) || "run-config" })}
                    aria-label="Readiness checks"
                  >
                    <div className="dm-api-action-card-body">
                      <p className="dm-api-action-card-eyebrow">{eyebrow}</p>
                      <ul className="dm-api-action-checklist training-readiness-rows" data-handoff-readiness-rows={`${passedCount}/${rows.length}`}>
                        {rows.map((r) => (
                          <li key={r.id} className={r.status === "pass" ? "is-done" : r.status === "fail" ? "is-fail" : r.status === "warn" ? "is-warn" : "is-pending"} data-handoff-readiness-row={r.id} data-handoff-readiness-status={r.status}>
                            {r.status === "pass" ? <Check size={14} aria-hidden="true" /> : r.status === "fail" ? <X size={14} aria-hidden="true" /> : r.status === "warn" ? <AlertTriangle size={14} aria-hidden="true" /> : <span className="training-readiness-pending" aria-hidden="true" />}
                            <span>{r.label}</span>
                            <b>{r.detail}</b>
                          </li>
                        ))}
                      </ul>
                      {failedAttempt ? (
                        <p className="dm-api-action-card-note" data-handoff-preinit-repair="">
                          Fix the failed item above, then press Retry finalize. Start Training stays locked until every check passes on this machine.
                        </p>
                      ) : null}
                      {configureReadiness.canFinalize && !runConfig.ready && !failedAttempt ? (
                        <p className="dm-api-action-card-note" data-handoff-runconfig-blocked="">Fix the highlighted field above, then finalize.</p>
                      ) : null}
                    </div>
                  </section>
                );
              })()}

              <details className="training-advanced" data-handoff-runconfig="">
                <summary>Advanced · exact command preview</summary>
                {runConfig.commands.length ? runConfig.commands.map((c, i) => (
                  <pre key={i} className="training-advanced-pre">{c}</pre>
                )) : <p className="dm-api-action-card-note">No command for this profile — import the served/attested artifact directly.</p>}
                {!runConfig.ready ? <p className="dm-api-action-card-note" data-runconfig-missing="">missing: {runConfig.missingRequirements.join(", ")}</p> : null}
                {runConfig.commandSafety && !runConfig.commandSafety.ok
                  ? <p className="dm-api-action-card-note" data-runconfig-unsafe="">unsafe: {runConfig.commandSafety.reasons.join("; ")}</p> : null}
              </details>

              <div className="training-handoff-action-row">
                <button type="button" className="dm-btn-ghost" onClick={() => setPanel("curate")} disabled={finalizePhase === "preparing" || finalizePhase === "probing"}>Back</button>
                {/* Finalize approves the configuration, prepares the governed
                    draft, and runs the REAL pre-init sandbox probe on this
                    machine — it never begins training. Start Training only
                    unlocks after the probe's governed receipt reads ok. */}
                {(() => {
                  const finalizing = finalizePhase === "preparing" || finalizePhase === "probing";
                  return (
                    <button type="button" className="dm-btn-primary" data-handoff-confirm="" data-handoff-finalize-phase={finalizePhase} disabled={!canFinalize || finalizing} onClick={runFinalize}>
                      {finalizing ? <span className="training-finalize-spinner" aria-hidden="true" /> : null}
                      {finalizing ? "Finalizing" : finalizePhase === "failed" ? "Retry finalize" : "Finalize"}
                    </button>
                  );
                })()}
              </div>
              {finalizePhase === "preparing" || finalizePhase === "probing" ? (
                <p className="dm-api-action-card-note" data-handoff-finalize-notice="">This may take a few minutes… Please do not close.</p>
              ) : null}
            </div>
          )}

          {panel === "prepare" && (
            <div className="dm-orch-modal-list" data-handoff-progress={progress.pct}>
              <div className="dm-helper-toolcall dm-swarm-card">
                <div className="dm-helper-toolcall-title">{progress.pct}%</div>
                <div style={{ borderBottom: "2px solid currentColor", width: `${progress.pct}%`, transition: "width 120ms linear" }} aria-hidden="true" />
                <div className="dm-helper-stream dm-swarm-card-desc">{progress.stage}</div>
              </div>
              {deriveProgressStages({ stage: progress.stageId, pct: progress.pct, converted: progress.converted, total: selected.length }).map((st) => (
                <div key={st.id} className="dm-helper-toolcall-row dm-swarm-phase-head" data-progress-stage={st.id} data-progress-status={st.status}>
                  <span className="dm-helper-toolcall-title">{st.id}</span>
                  <span className="dm-run-console__hint">{st.status}{st.detail ? ` · ${st.detail}` : ""}</span>
                </div>
              ))}
            </div>
          )}

          {panel === "train" && result && (
            <div className="dm-orch-modal-list" data-handoff-train={trainPhase}>
              {/* Reference "Training …" running panel: big % + real progress bar
                  (width = receipt pct only), then Events/Logs/Artifacts tabs, a
                  live event-delta list, and run stats. */}
              <section className="dm-api-action-card training-run-card" aria-label="Training run">
                <div className="dm-api-action-card-body" style={{ width: "100%" }}>
                  <div className="training-run-top">
                    <span className="training-run-pct" data-train-pct={liveWaitState.barPct} data-train-headline={liveRunRow?.progress?.stageId || ""}>
                      {liveWaitState.barPct}%
                    </span>
                    <span className="dm-api-action-card-note" data-train-elapsed="">{trainPhase === "running" ? (liveWaitState.elapsedLine || "starting…") : "Ready to run"}</span>
                  </div>
                  <div className={`training-progress-track${liveWaitState.barPct >= 100 ? " is-ready" : ""}`}
                    role="progressbar" aria-valuemin={0} aria-valuemax={100} {...(liveWaitState.barPct > 0 ? { "aria-valuenow": liveWaitState.barPct } : {})}>
                    <span style={{ width: `${liveWaitState.barPct}%` }} />
                  </div>
                  <div className="dm-api-action-card-note" data-train-status={trainPhase} data-train-wait-stage={liveWaitState.statusLine} style={{ marginTop: 6 }}>
                    {trainPhase === "running" ? (runnerWaiting ? "Runner not reporting yet · no preflight/progress stamp received" : `${STAGE_HEADLINES[liveRunRow?.progress?.stageId] || "Fine-tuning locally"} · ${liveWaitState.statusLine}`) : trainPhase === "starting" ? "Recording governed run…" : `Dataset v${result.version} (${result.records} records) ready — one click runs the fine-tune here.`}
                  </div>

                  {runnerWaiting ? (
                    <div className="dm-helper-toolcall dm-swarm-card" data-train-runner-waiting="" style={{ marginTop: 10 }}>
                      <div className="dm-helper-toolcall-title dm-swarm-card-title">Local runner has not stamped preflight</div>
                      <div className="dm-helper-stream dm-swarm-card-desc">
                        The governed run was created, but the local runner has not reported RAM/GPU/disk, fine-tune progress, or endpoint verification. Start the local runner or endpoint for <strong>{result.modelTag}</strong> at <strong>{runnerEndpoint}</strong>, then this panel will advance from the real receipt. If the model already exists on disk, attach that existing result instead of waiting here.
                      </div>
                    </div>
                  ) : null}
                  <div className="dm-tabs" role="tablist" style={{ marginTop: 12 }}>
                    <button type="button" role="tab" aria-selected="true" className="dm-tab-v2 active" data-train-tab="events">Events</button>
                    <a role="tab" className="dm-tab-v2" href="/data-model?object=model-training-run" data-train-tab="logs">Logs</a>
                    <a role="tab" className="dm-tab-v2" href="/data-model?object=model-training-run" data-train-tab="artifacts">Artifacts</a>
                  </div>

                  {/* Run stats — real receipt fields (step / loss / workers). */}
                  <div className="dm-cockpit-fields" style={{ marginTop: 10 }}>
                    {liveRunRow?.progress?.step != null ? <span className="dm-cockpit-field"><b>Step</b>{liveRunRow.progress.step}/{liveRunRow.progress.totalRecords || "?"}</span> : null}
                    {liveRunRow?.progress?.loss != null ? <span className="dm-cockpit-field"><b>Loss</b>{liveRunRow.progress.loss}</span> : null}
                    {liveRunRow?.progress?.counter != null && liveRunRow?.progress?.totalRecords != null ? <span className="dm-cockpit-field"><b>Accepted</b>{liveRunRow.progress.counter}/{liveRunRow.progress.totalRecords}</span> : null}
                    <span className="dm-cockpit-field"><b>Run</b>{result.trainingRunId.slice(0, 22)}</span>
                  </div>

                  {/* Live event deltas — each proven proof-checklist item is a
                      real governed event, most-recent first. */}
                  <div className="dm-cockpit-receipts" data-train-proof-progress={`${proofChecklist.done}/${proofChecklist.total}`}>
                    <p className="dm-api-action-card-eyebrow">Live event deltas</p>
                    <ul>
                      {proofChecklist.items.filter((i) => i.proven).slice(0, 6).map((i) => (
                        <li key={i.id} className="dm-cockpit-receipt">
                          <span className="dm-cockpit-receipt-chip dm-status-chip is-ok"><span className="dm-status-dot" aria-hidden="true" />{i.id.split("-")[0]}</span>
                          <span className="dm-cockpit-receipt-text">{i.label}</span>
                        </li>
                      ))}
                      {proofChecklist.done === 0 ? <li className="dm-cockpit-receipt"><span className="dm-cockpit-receipt-text">Waiting for the first runner stamp…</span></li> : null}
                    </ul>
                  </div>

                  {/* Resumable fine-tune — one-click resume on OOM. */}
                  {resumeState.resumable ? (
                    <div className="training-handoff-action-row" data-train-resume={resumeState.resumeAction?.variant} style={{ marginTop: 10 }}>
                      <span className="dm-api-action-card-note">{resumeState.reason}{resumeState.loss != null ? ` · loss ${resumeState.loss}` : ""}</span>
                      <button type="button" className="dm-btn-primary-sm" data-train-resume-apply="" onClick={() => applyRemedy(resumeState.resumeAction)}>{resumeState.resumeAction.label}</button>
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Governed scaffold proof — secondary. */}
              <div className="dm-cockpit-fields" data-prepare-scaffold="">
                <span className="dm-cockpit-field"><b>model</b>{SLUG}-v{result.version}</span>
                <span className="dm-cockpit-field"><b>export</b>{result.exportId.slice(0, 18)}</span>
                <span className="dm-cockpit-field"><b>connection</b>{result.integrationId}</span>
                <span className="dm-cockpit-field"><b>expects</b>{result.modelTag}</span>
              </div>

              {runConfig.commands.length ? (
                <details className="training-advanced" data-train-command="">
                  <summary>Advanced · exact command this runs on your machine</summary>
                  {runConfig.commands.map((c, i) => <pre key={i} className="training-advanced-pre">{c}</pre>)}
                </details>
              ) : null}

              {/* Pre-initialization readiness gate — the deterministic loading
                  state that must reach 100% before the live invocation can
                  begin. The bar width is a real fraction of proven blocking
                  gates (never a fabricated 0%); each check is a governed,
                  evidence-derived readiness signal. */}
              {trainPhase !== "running" ? (
                <section className="dm-api-action-card training-preinit-card" data-train-preinit={startReadiness.canStart ? "ready" : "gating"} aria-label="Pre-initialization readiness" style={{ marginTop: 4 }}>
                  <div className="dm-api-action-card-body" style={{ width: "100%" }}>
                    <div className="training-run-top">
                      <span className="dm-api-action-card-eyebrow">Pre-initialization</span>
                      <span className="training-run-pct" data-train-preinit-pct={startReadiness.readyPct}>{startReadiness.readyPct}%</span>
                    </div>
                    <div className={`training-progress-track${startReadiness.canStart ? " is-ready" : ""}`}
                      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={startReadiness.readyPct}>
                      <span style={{ width: `${startReadiness.readyPct}%` }} />
                    </div>
                    <div className="dm-api-action-card-note" data-train-preinit-label="" style={{ marginTop: 6 }}>{startReadiness.preInit.label}</div>
                    <ul className="training-preinit-checks" data-train-preinit-checks={`${startReadiness.preInit.done}/${startReadiness.preInit.total}`}>
                      {startReadiness.checks.map((c) => (
                        <li key={c.id} data-train-check={c.id} data-train-check-ok={c.ok ? "true" : "false"}>
                          <span className={`training-preinit-check-icon ${c.ok ? "is-ok" : "is-warn"}`}>
                            {c.ok ? <Check size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
                          </span>
                          <span className="training-preinit-check-label">{c.label}</span>
                          <span className="training-preinit-check-detail">{c.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              ) : null}

              <div className="training-handoff-action-row">
                <a className="dm-btn-outline" href="/data-model?object=model-training-run" data-train-open-runs="">Open in Runs</a>
                {trainPhase !== "running" ? (
                  <button type="button" className="dm-btn-primary" data-train-start="" data-train-ready={startReadiness.canStart ? "true" : "false"} data-train-ready-pct={startReadiness.readyPct} onClick={startTraining} disabled={trainPhase === "starting" || !startReadiness.canStart || !Array.isArray(runConfig.steps) || runConfig.steps.length === 0}>
                    {trainPhase === "starting" ? "Starting…" : Array.isArray(runConfig.steps) && runConfig.steps.length === 0 ? "Choose a training pipeline" : startReadiness.canStart ? "Start training" : `Locked · pre-init ${startReadiness.readyPct}%`}
                  </button>
                ) : (
                  <button type="button" className="dm-btn-primary" data-train-retry-runner="" onClick={() => { startRunPolling(new Date().toISOString()); triggerTrainingRunner(); }}>
                    Start runner
                  </button>
                )}
              </div>
            </div>
          )}

          {panel === "import" && result && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card">
                <div className="dm-helper-toolcall-title dm-swarm-card-title">Attach your model result</div>
                <div className="dm-helper-stream dm-swarm-card-desc">What did training produce? Growthub Local records its identity so your model is provable, not assumed.</div>
                <label className="dm-run-console__hint" style={{ display: "block", marginTop: 8 }}>Result type{" "}
                  <select value={artifact.type} onChange={(e) => {
                    const type = e.target.value;
                    const discoveredTag = type === "ollama-model" && availableBases?.length ? availableBases[0] : artifact.modelTag;
                    setArtifact({ ...artifact, type, modelTag: discoveredTag, ...(type === "ollama-model" ? { path: "", sha256: "" } : {}) });
                  }} data-import-type="">
                    {profile.outputs.concat(["openai-compatible-endpoint", "ollama-model"]).filter((v, i, a) => a.indexOf(v) === i).map((t) => <option key={t} value={t}>{ARTIFACT_TYPE_LABELS[t] || t}</option>)}
                  </select>
                </label>
                <label className="dm-run-console__hint" style={{ display: "block" }}>Model name{" "}
                  {artifact.type === "ollama-model" && availableBases?.length ? (
                    <select value={artifact.modelTag} onChange={(e) => setArtifact({ ...artifact, modelTag: e.target.value, path: "", sha256: "" })} data-import-tag="">
                      <option value="">Choose an installed model</option>
                      {availableBases.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={artifact.modelTag} onChange={(e) => setArtifact({ ...artifact, modelTag: e.target.value })} data-import-tag="" />
                  )}
                </label>
                {deriveArtifactState(artifact).tagOnly ? null : (
                  <>
                    <label className="dm-run-console__hint" style={{ display: "block" }}>Model file{" "}
                      <input type="text" value={artifact.path} placeholder="./artifacts/…" onChange={(e) => setArtifact({ ...artifact, path: e.target.value })} data-import-path="" />
                    </label>
                    <label className="dm-run-console__hint" style={{ display: "block" }}>File identity (sha256){" "}
                      <input type="text" value={artifact.sha256} onChange={(e) => setArtifact({ ...artifact, sha256: e.target.value })} data-import-sha="" />
                    </label>
                  </>
                )}
                {artifact.type === "ollama-model" ? <div className="dm-run-console__hint">Installed models are discovered from this machine; no file path or secret is needed.</div> : null}
                <div className="dm-run-console__hint" data-import-state={deriveArtifactState(artifact).identified ? "ok" : "incomplete"}>
                  {deriveArtifactState(artifact).identified ? "Your model result is provable — ready to attach." : deriveArtifactState(artifact).reason}
                </div>
              </div>
              {busy ? (
                <div className="dm-helper-toolcall dm-swarm-card" data-import-setup="">
                  <div className="dm-helper-toolcall-title">{busyPct}%</div>
                  <div style={{ borderBottom: "2px solid currentColor", width: `${busyPct}%`, transition: "width 140ms linear" }} aria-hidden="true" />
                  <div className="dm-helper-stream dm-swarm-card-desc">{busyMsg}</div>
                </div>
              ) : null}
              <button type="button" className="training-action-primary" data-import-confirm="" disabled={busy || !deriveArtifactState(artifact).identified} onClick={() => importArtifact()}>
                {busy ? "Setting up your model record…" : artifact.type === "ollama-model" ? "Use installed model & activate" : "Attach model & activate"}
              </button>
            </div>
          )}

          {panel === "verify" && result && (
            <div className="dm-orch-modal-list" data-verify-panel="">
              {/* Test-event editor — the SAME mental model as the API/Webhook
                  test event: edit the prompt, send it through the governed test
                  lane, inspect the response. */}
              <section className="dm-api-action-card dm-api-action-card-muted" aria-label="Send a test prompt">
                <div className="dm-api-action-card-body">
                  <p className="dm-api-action-card-eyebrow">Test event</p>
                  <p>Send a real prompt to your local model. It only verifies if the reply comes back as <strong>{artifact.modelTag || reservedTag}</strong> — not the base model.</p>
                  <textarea className="dm-helper-composer-textarea" data-verify-prompt="" rows={3} value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} style={{ width: "100%", marginTop: 8 }} aria-label="Test prompt" />
                  <div className="training-handoff-action-row" style={{ marginTop: 8 }}>
                    <button type="button" className="dm-btn-primary" data-verify-run="" onClick={runVerify} disabled={verifying || !String(testPrompt || "").trim()}>
                      {verifying ? "Sending test…" : verifyResult ? "Send test again" : "Send test event"}
                    </button>
                  </div>
                </div>
              </section>

              {/* Verified status — same status language as "Verified 200", tuned
                  to model proof. Honest: verified ONLY when served == tuned tag. */}
              {verifyResult && !verifying ? (() => {
                const raw = verificationEvidence?.response ?? "";
                let parsed = null; try { parsed = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null; } catch { parsed = null; }
                const content = (() => {
                  try { return String(parsed?.choices?.[0]?.message?.content || verifyResult.snippet || ""); } catch { return verifyResult.snippet || ""; }
                })();
                const gotResponse = Boolean(raw) || Boolean(verifyResult.servedModel) || Boolean(content);
                // Real captured HTTP status when the test lane was reached;
                // otherwise "responded" from the stamped row (never a fake 200).
                const httpLine = httpStatus != null ? `${httpStatus} ${httpStatus === 200 ? "OK" : ""}`.trim() : gotResponse ? "responded" : "no response";
                return (
                  <section className="dm-api-action-card" data-verify-result={verifyResult.verified ? "verified" : (verifyResult.demotion || "unverified")} aria-label="Invocation result">
                    <div className="dm-api-action-card-body" style={{ width: "100%" }}>
                      <p className="dm-api-action-card-eyebrow">Test status</p>
                      <ul className="dm-api-action-checklist" data-verify-status={verifyResult.verified ? "verified" : "demoted"}>
                        <li className={gotResponse ? "is-done" : "is-pending"}>{gotResponse ? <Check size={14} /> : <X size={14} />}<span>Completed</span><b style={{ marginLeft: "auto", fontWeight: 600 }}>{httpLine}</b></li>
                        <li className={verifyResult.verified ? "is-done" : "is-pending"}>{verifyResult.verified ? <Check size={14} /> : <X size={14} />}<span>Model</span><b style={{ marginLeft: "auto", fontWeight: 600 }}>{verifyResult.servedModel || "—"}</b></li>
                        <li className={verifyResult.verified ? "is-done" : "is-pending"}>{verifyResult.verified ? <Check size={14} /> : <X size={14} />}<span>Proof</span><b style={{ marginLeft: "auto", fontWeight: 600 }} data-verify-badges="">{verifyResult.verified ? "Not base model" : (verifyResult.demotion === "base-model" ? "Base model replied" : "Not verified")}</b></li>
                      </ul>
                      {/* Response inspector — Response / Trace / Details / Proof. */}
                      <div className="dm-tabs" role="tablist" data-verify-inspector="" style={{ marginTop: 10 }}>
                        {["response", "trace", "details", "proof"].map((t) => (
                          <button key={t} type="button" role="tab" aria-selected={inspectorTab === t} className={`dm-tab-v2${inspectorTab === t ? " active" : ""}`} data-verify-tab={t} onClick={() => setInspectorTab(t)}>
                            {t[0].toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>
                    <div className="dm-tab-content" data-verify-tab-content={inspectorTab} style={{ marginTop: 8 }}>
                      {inspectorTab === "response" ? (
                        <pre className="dm-helper-stream dm-swarm-card-desc" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }} data-verify-response="">
                          {content || (raw ? (typeof raw === "string" ? raw : JSON.stringify(raw, null, 2)) : "No response body stamped yet — send a test.")}
                        </pre>
                      ) : inspectorTab === "trace" ? (
                        <div data-verify-trace="">
                          <div className="dm-run-console__hint">request: {testPrompt.slice(0, 80)}{testPrompt.length > 80 ? "…" : ""}</div>
                          <div className="dm-run-console__hint">trainingRunId: {result.trainingRunId}</div>
                          <div className="dm-run-console__hint">apiRegistryId: {result.integrationId}</div>
                          <div className="dm-run-console__hint">modelTrainingRowId: {SLUG}-v{result.version}</div>
                          <div className="dm-run-console__hint">trace_id: {verificationEvidence?.verificationReceipt?.otel?.trace_id || "—"}</div>
                          <div className="dm-run-console__hint">span_id: {verificationEvidence?.verificationReceipt?.otel?.span_id || "—"}</div>
                        </div>
                      ) : inspectorTab === "details" ? (
                        <div data-verify-details="">
                          <div className="dm-run-console__hint">expected tuned tag: {artifact.modelTag || reservedTag}</div>
                          <div className="dm-run-console__hint">actual served model: {verifyResult.servedModel || "—"}</div>
                          <div className="dm-run-console__hint">base model: {baseModel || "—"}</div>
                          <div className="dm-run-console__hint">endpoint: {servingProfile.endpoint || "—"}</div>
                          <div className="dm-run-console__hint">serving adapter: {servingProfile.adapter}{servingProfile.continuousBatching ? " · continuous batching" : ""}{servingProfile.speculative ? " · speculative" : ""}</div>
                        </div>
                      ) : (
                        <div data-verify-proof="">
                          <div className="dm-run-console__hint">why proven: the gateway receipt and served response model must both bind to the exact tuned tag; a base-model or mismatched reply demotes it.</div>
                          <div className="dm-run-console__hint">gateway identity: {verificationEvidence?.verificationReceipt?.identity?.status || "not verified"}</div>
                          <div className="dm-run-console__hint">durable proof: {verificationEvidence?.persistedAt ? `api-registry (${result.integrationId}) stamped through governed PATCH at ${verificationEvidence.persistedAt}` : "not recorded"}</div>
                          <div className="dm-run-console__hint">would demote: reply model = base model, malformed body, or endpoint error.</div>
                          <div className="dm-run-console__hint" data-verify-proof-serving="">{servingProfile.reason}</div>
                        </div>
                      )}
                    </div>
                    </div>
                  </section>
                );
              })() : null}

              {verifyResult?.verified ? (
                <div className="training-handoff-action-row">
                  <button type="button" className="dm-btn-primary" data-verify-continue="" onClick={() => setPanel("bind")}>Continue to deploy</button>
                </div>
              ) : null}
            </div>
          )}

          {panel === "bind" && result && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card">
                <div className="dm-helper-toolcall-title dm-swarm-card-title">Run it once in a workflow</div>
                <div className="dm-helper-stream dm-swarm-card-desc">Use your model <strong>{result.integrationId}</strong> in a workflow and run it once. Completion is blocked until the run writes proof.</div>
                {/* Proof checklist — derived live, never a guess. */}
                <div className="dm-run-console__hint">Connected in a workflow: {liveRuntime.identityChain?.sandboxObjectId ? "yes" : "not yet"}</div>
                <div className="dm-run-console__hint">Workflow run: {liveSandboxRunId ? (liveRuntime.state === "complete" ? "passed" : "ran") : "not run"}</div>
                <div className="dm-run-console__hint">Proof hash: {liveOutputHash ? "present" : "missing"}</div>
                <div className="dm-run-console__hint" data-bind-completion={smokeProven ? "complete" : "blocked"}>Completion: {smokeProven ? "complete" : "blocked until the run writes proof"}</div>
                {/* Proof details — secondary. */}
                {liveOutputHash || liveRuntime.identityChain?.sandboxObjectId ? <div className="dm-run-console__hint">Proof details — expected: {artifact.modelTag || reservedTag} · outputHash: {liveOutputHash || "—"} · sandbox: {liveRuntime.identityChain?.sandboxObjectId || "—"} · registry: {result.integrationId}</div> : null}
                <a className="dm-run-console__hint" href={`/workflows`} data-bind-open-workflow="">Open Workflow Canvas →</a>
              </div>
              <button type="button" className="dm-btn-ghost" data-bind-refresh="" onClick={async () => {
                const probe = await fetch("/api/workspace", { cache: "no-store" });
                const fresh = await probe.json();
                if (fresh?.workspaceConfig) setLiveConfig(fresh.workspaceConfig);
              }}>
                Refresh proof
              </button>
              <button type="button" className="training-action-primary" data-bind-done="" onClick={() => setPanel("done")}>
                {smokeProven ? "View completed capability" : "View status (smoke proof still required)"}
              </button>
            </div>
          )}

          {panel === "recover" && recovery && (
            <div className="dm-orch-modal-list" data-handoff-recover="">
              {recovery.items.map((item) => (
                <div key={item.id} className="dm-helper-toolcall dm-swarm-card" data-recover-item={item.id} data-recover-status={item.status}>
                  <div className="dm-helper-toolcall-row">
                    <span className="dm-helper-toolcall-title">{item.label || item.id}</span>
                    <span className="dm-run-console__hint">{item.status}</span>
                  </div>
                  <div className="dm-helper-stream dm-swarm-card-desc">{item.description}</div>
                </div>
              ))}
              <button type="button" className="training-action-primary" data-handoff-retry="" disabled={!recovery.retryable} onClick={() => { setPanel("profile"); runFinalize(); }}>
                {recovery.retryable ? "Retry — resumes from where it stopped" : "Resolve blocked items above, then reopen"}
              </button>
              <button type="button" className="dm-btn-ghost" onClick={() => setPanel("curate")}>Back to curation</button>
            </div>
          )}

          {panel === "done" && result && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card" data-handoff-done="" data-handoff-terminal-state={smokeProven ? "complete" : verifyResult?.verified ? "verified-smoke-required" : "pending"}>
                {/* Proof-aware terminal state — "complete" ONLY when the same
                    derivation /custom-models uses proves verified endpoint +
                    sandbox run + outputHash. Otherwise it says exactly what is
                    still required. No fake completion. */}
                <div className="dm-helper-toolcall-title">
                  {smokeProven
                    ? `Custom model complete — ${result.modelTag}`
                    : verifyResult?.verified
                      ? `Model tested — workflow proof still required`
                      : `Model result attached — test still required`}
                </div>
                <div className="dm-helper-stream dm-swarm-card-desc">
                  {smokeProven
                    ? `Proven end to end: ${result.records} records → run ${result.trainingRunId} → imported artifact → registry ${result.integrationId} → verified tuned tag → sandbox run ${liveSandboxRunId} → outputHash #${liveOutputHash}.`
                    : `v${result.version}: ${result.records} records → run ${result.trainingRunId} → imported artifact → registry ${result.integrationId}${verifyResult?.verified ? " → verified tuned tag" : ""}. Bind it into a workflow and run once — completion is blocked until the smoke run writes an outputHash.`}
                </div>
                <div className="dm-run-console__hint">Identity chain: {SLUG}-v{result.version} → {result.exportId} → {result.trainingRunId} → {result.modelTag} → {result.integrationId}{verifyResult?.verified ? " → verified" : ""}{smokeProven ? ` → ${liveSandboxRunId} → #${liveOutputHash}` : ""}</div>
                {!smokeProven ? <a className="dm-run-console__hint" href="/workflows" data-done-open-workflow="">Open Workflow Canvas to run the smoke →</a> : null}
              </div>

              {/* The completion reward payload — the dopamine hit, derived, shown
                  ONLY when the whole chain holds. */}
              <div className="dm-helper-toolcall dm-swarm-card" data-training-reward={completionReward.live ? "live" : "pending"}>
                <div className="dm-helper-toolcall-title dm-swarm-card-title">{completionReward.headline}</div>
                {completionReward.live ? (
                  <div className="dm-helper-stream dm-swarm-card-desc">
                    tuned tag <strong>{completionReward.trainedTag}</strong> · base {completionReward.baseModel} · sha {String(completionReward.artifactSha).slice(0, 12)} · quant {completionReward.quantDelta} · endpoint {completionReward.localEndpoint} · verified model {completionReward.verifiedResponseModel} · outputHash #{completionReward.outputHash}
                  </div>
                ) : null}
                {/* Immediate next actions — the dopamine loop closes into doing
                    something with the model. Each NAVIGATES to a governed surface
                    (never mutates from here), same grammar as the ledger. */}
                {completionReward.live ? (
                  <div className="dm-helper-toolcall-row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }} data-training-reward-actions="">
                    <a className="training-action-primary" href="/workflows" data-reward-action="use-in-workflow">Use as workflow node</a>
                    <a className="dm-btn-ghost" href="/custom-models" data-reward-action="open-custom-models">Open Custom Models</a>
                    <a className="dm-btn-ghost" href="/training" data-reward-action="generate-training-data">Generate more training data</a>
                    <a className="dm-btn-ghost" href={`/data-model?object=${encodeURIComponent(result.integrationId)}`} data-reward-action="export-model-proof">Export model proof</a>
                  </div>
                ) : null}
              </div>

              {/* The 9-milestone proof checklist — proven only on real evidence. */}
              <div className="dm-helper-toolcall dm-swarm-card" data-training-proof-checklist={`${proofChecklist.done}/${proofChecklist.total}`}>
                <div className="dm-helper-toolcall-title dm-swarm-card-title">Proof checklist — {proofChecklist.done}/{proofChecklist.total}</div>
                {proofChecklist.items.map((it) => (
                  <div key={it.id} className="dm-run-console__hint" data-proof-item={it.id} data-proof-proven={it.proven ? "yes" : "no"}>
                    {it.proven ? "✓" : "•"} {it.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="dm-orch-modal-foot">
          {["curate", "profile", "done"].includes(panel) ? (
            <button type="button" className="dm-btn-ghost" onClick={() => setPanel("checklist")}>Back to checklist</button>
          ) : null}
        </div>
      </div>
    </div>
  ), document.body);
}
