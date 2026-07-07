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
 * Compute substrate stays external (local runner / container / Ollama-Unsloth
 * / llama.cpp / compatible endpoint) but the lifecycle, the run receipts, the
 * artifact identity, the verification, and the user's processing experience
 * are all Growthub Local-controlled and provable. Writes happen ONLY through
 * the existing governed PATCH (dataModel allowlist).
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
import { FINE_TUNE_TARGETS, resolveFineTuneTarget, scaffoldHandoffRows } from "../../../lib/adapters/fine-tune-targets.js";
import { TRAINING_RUNTIME_PROFILES, resolveTrainingProfile, buildTrainingRunConfig } from "../../../lib/training-runtime-profiles.js";
import { buildTrainingRunReceipt, TRAINING_RUN_OBJECT_ID, TRAINING_RUN_OBJECT_TYPE, TRAINING_PROGRESS_STAGES } from "../../../lib/training-run-receipts.js";
import { deriveArtifactState } from "../../../lib/training-artifacts.js";
import { verifyTunedResponse } from "../../../lib/training-verification.js";
import { applyGenomeFieldSettings } from "../../../lib/workspace-genome.js";
import { deriveTrainingRuntimeState } from "../../../lib/training-runtime.js";
import { deriveTrainingRemediation, deriveTrainingProofChecklist, deriveTrainingCompletionReward, deriveTrainingStageIssue, deriveTrainingWaitState, deriveServingProfile, deriveTrainingResumeState, deriveLocalModelChoices } from "../../../lib/training-runtime-drivers.js";

const PHASE3_INSTRUCTION = "You are growthub-local-expert. Respect AWaC V2 invariants and the PATCH allowlist.";
const TRAINING_COLUMNS = ["Name", "status", "baseModel", "localModel", "lastExportAt", "lastExportId", "lastSourceId", "lastExportSummary", "description"];
const RUN_COLUMNS = [
  "trainingRunId", "modelTrainingRowId", "datasetExportId", "baseModel", "trainingProfile", "runnerMode",
  "status", "startedAt", "completedAt", "artifactType", "artifactModelTag", "artifactPath", "artifactSha256", "artifactQuantization",
  // Quant proof (fp16 → quantized bytes) + live thin-delta progress / preflight
  // the local runner stamps each stage boundary.
  "artifactSourceBytes", "artifactArtifactBytes", "progress", "preflight", "blockedReason", "schema",
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
function buildRunnerScript({ steps, stageRankById, artifactPath, modelTag, trainingRunId, quantization, integrationId, floor, workspaceUrl }) {
  const P = JSON.stringify({
    steps: steps || [], stageRankById: stageRankById || {}, artifactPath: artifactPath || "",
    modelTag: modelTag || "", trainingRunId: trainingRunId || "", quantization: quantization || "q4_k_m",
    integrationId: integrationId || "", floor: floor || { ramGB: 0, diskGB: 0, vramGB: 0 },
    // Origin of the workspace that launched this run, baked in so the runner's
    // governed callback PATCHes reach the exact server (the sandbox spawns the
    // runner with a restricted env, so it cannot rely on GROWTHUB_WORKSPACE_URL).
    workspaceUrl: workspaceUrl || "",
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
    "  async function stampRun(patch) {",
    "    try {",
    "      const r = await fetch(`${WS}/api/workspace`, { cache: 'no-store' }); const data = await r.json();",
    "      const objects = (data.workspaceConfig.dataModel.objects || []).map((o) => o.objectType === 'model-training-run' ? ({ ...o, rows: (o.rows || []).map((row) => {",
    "        if (String(row.trainingRunId) !== P.trainingRunId) return row;",
    "        const merged = { ...row, ...patch };",
    "        if (patch && patch.progress) merged.progress = mono(row.progress, patch.progress);",
    "        return merged;",
    "      }) }) : o);",
    "      await fetch(`${WS}/api/workspace`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataModel: { objects } }) });",
    "    } catch (e) { console.error('stampRun failed', (e && e.message) || e); }",
    "  }",
    "  const gb = (bytes) => Math.floor(Number(bytes || 0) / 1e9);",
    "(async () => {",
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
    "          const child = spawn(step.bin, step.args, { stdio: ['ignore', 'pipe', 'inherit'] });",
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
    "      } else { execFileSync(step.bin, step.args, { stdio: 'inherit' }); }",
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
    "  await fetch(`${WS}/api/workspace`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataModel: { objects } }) });",
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
function upsertRunnerSandbox(objects, trainingRunId, runConfig, integrationId) {
  const workspaceUrl = typeof window !== "undefined" && window.location ? window.location.origin : "";
  const row = {
    Name: trainingRunId,
    runtime: "node",
    command: buildRunnerScript({
      steps: runConfig?.steps, stageRankById: STAGE_RANK_BY_ID, artifactPath: runConfig?.artifactPath,
      modelTag: runConfig?.outputModelTag, trainingRunId, quantization: runConfig?.quantization, integrationId,
      floor: resourceFloorFor(runConfig?.baseModel), workspaceUrl,
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
  const [verifying, setVerifying] = useState(false);
  const [httpStatus, setHttpStatus] = useState(null); // real HTTP status from the test lane
  // Test-event mental model (mirrors the API/Webhook test-event flow): an
  // editable seeded prompt + a response inspector with Response/Trace/Details/
  // Proof tabs. State kept local; the send re-uses the governed test lane.
  const [testPrompt, setTestPrompt] = useState(DEFAULT_TEST_PROMPT);
  const [inspectorTab, setInspectorTab] = useState("response");
  const [curateTab, setCurateTab] = useState("configuration");
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
  const baseModel = String(chosenBase || modelChoices.detectedBase || "").trim();

  if (!open || typeof document === "undefined") return null;

  const version = 1 + (workspaceConfig?.dataModel?.objects || [])
    .filter((o) => o?.objectType === TRAINING_OBJECT_TYPE)
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
    .filter((r) => /^.+-v\d+$/.test(String(r?.Name || ""))).length;
  const reservedTag = (tunedTag || `${SLUG}-tuned-v${version}`).trim();
  const datasetPath = resume.datasetPath || `unsloth-dataset-v${version}.jsonl`;
  const runConfig = buildTrainingRunConfig({ profileId: profile.id, baseModel, datasetPath, outputModelTag: reservedTag, artifactPath: `./artifacts/${reservedTag}` });
  // Plain-language run framing for the no-code profile step — the primary UX is
  // "what will this do + can it start", NOT the raw argv (that lives in Advanced).
  const floor = resourceFloorFor(baseModel);
  // A tag-specific safety failure drives a field-level error on the tag input,
  // not a scary command dump. Any other safety/missing reason is a clean block.
  const tagUnsafe = Boolean(runConfig.commandSafety && !runConfig.commandSafety.ok
    && (runConfig.commandSafety.reasons || []).some((r) => /model tag/i.test(String(r))));
  const blockReason = (() => {
    if (runConfig.ready) return null;
    if (tagUnsafe) return { code: "unsafe-tag", message: "The tuned model name isn't allowed. Fix the highlighted field above, then try again." };
    if (runConfig.commandSafety && !runConfig.commandSafety.ok) return { code: "unsafe-config", message: "This run can't be started safely with the current settings. Pick the one-click pipeline profile, or fix the highlighted field above." };
    if (runConfig.missingRequirements && runConfig.missingRequirements.length) return { code: "missing", message: `Almost there — first set: ${runConfig.missingRequirements.join(", ")}. The base model comes from the model row in the ledger.` };
    return { code: "not-ready", message: "This run configuration isn't ready yet." };
  })();
  // Live proof state — the SAME derivation /training and /custom-models use, so
  // the modal can never claim "complete" before the smoke run wrote outputHash.
  const liveRuntime = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug: SLUG });
  const smokeProven = liveRuntime.state === "complete";
  const liveOutputHash = liveRuntime.identityChain?.modelOutputHash || "";
  const liveSandboxRunId = liveRuntime.identityChain?.sandboxRunId || "";
  // Wire the driver intelligence into the UI: the 9-milestone proof checklist
  // and the completion reward are derived from the live governed rows so the
  // user sees exactly what is proven and what remains (never optimistic ticks).
  const liveRunRow = liveRuntime.runState?.latest || {};
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

  const tick = (pct, stage, stageId, converted = 0) => new Promise((resolve) => {
    setProgress({ pct, stage, stageId: stageId || "", converted });
    setTimeout(resolve, 0);
  });

  async function patchObjects(transform) {
    const objects = transform(workspaceConfig?.dataModel?.objects || []);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: { objects } }),
    });
    if (!res.ok) throw new Error(`governed PATCH refused: ${(await res.text()).slice(0, 200)}`);
    const applied = await res.json();
    if (applied?.workspaceConfig) {
      setLiveConfig(applied.workspaceConfig);
      if (typeof onApplied === "function") onApplied(applied.workspaceConfig);
    }
    return applied?.workspaceConfig || workspaceConfig;
  }

  // ---- prepare: build the dataset + apply scaffold rows + PREPARED run receipt
  async function runPrepare() {
    setPanel("prepare");
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
      const selectedIdx = new Set(selected.map(({ index }) => index));

      const fresh = await patchObjects((objects) => {
        let next = objects.map((o) => {
          if (o?.id === TRACES_OBJECT_ID) return { ...o, rows: (o.rows || []).map((row, i) => (selectedIdx.has(i) ? { ...row, exported: "true" } : row)) };
          if (o?.objectType === TRAINING_OBJECT_TYPE) return { ...o, rows: [...(o.rows || []), versionRow] };
          if (o?.objectType === "api-registry") {
            // Genome field visibility: now that a custom-model record is
            // present, reveal its binding fields in this table — without
            // touching the object's generic/nango fields (no leak).
            const withRow = { ...o, rows: [...(o.rows || []), registryRow] };
            return { ...withRow, fieldSettings: applyGenomeFieldSettings(withRow) };
          }
          return o;
        });
        if (!next.some((o) => o?.objectType === TRAINING_OBJECT_TYPE)) {
          next.push({ id: TRAINING_OBJECT_ID, label: "Model Training", source: "Model Training", objectType: TRAINING_OBJECT_TYPE, icon: "Terminal", columns: TRAINING_COLUMNS, rows: [versionRow], binding: { mode: "manual", source: "Model Training" }, relations: [], fieldSettings: { hidden: [], order: TRAINING_COLUMNS } });
        }
        if (!next.some((o) => o?.objectType === "api-registry")) {
          const cols = ["integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse", "entityTypes", "description", "connectorKind", "resolverTemplateId", "schemaVersion", "capabilities", "executionLane", "kind", "capabilityType", "modelTrainingRowId", "trainingRunId", "expectedModelTag"];
          const apiObj = { id: "api-registry", label: "API Registry", source: "API Registry", objectType: "api-registry", icon: "Code", columns: cols, rows: [registryRow], binding: { mode: "manual", source: "API Registry" }, relations: [], fieldSettings: { hidden: [], order: cols } };
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
      setResult({ datasetPath, records: selected.length, integrationId, modelTag: reservedTag, version, exportId, trainingRunId: preparedReceipt.trainingRunId });
      setArtifact((a) => ({ ...a, modelTag: reservedTag, type: profile.outputs.includes("gguf") ? "gguf" : profile.outputs[0] }));
      setPanel("train");
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
        next = upsertRunnerSandbox(next, trainingRunId, runConfig, result.integrationId);
        return next;
      });
      setTrainPhase("running");

      await triggerTrainingRunner(trainingRunId);

      startRunPolling(startedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTrainPhase("idle");
    }
  }

  async function triggerTrainingRunner(trainingRunIdOverride) {
    const trainingRunId = typeof trainingRunIdOverride === "string" ? trainingRunIdOverride : result?.trainingRunId;
    if (!trainingRunId) return;
    setError("");
    await patchObjects((objects) => upsertRunnerSandbox(objects, trainingRunId, runConfig, result.integrationId));
    const res = await fetch("/api/workspace/sandbox-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: TRAINING_RUNNER_SANDBOX_ID, name: trainingRunId, intent: "model-training-run", actor: "training-runtime-modal" }),
    });
    if (!res.ok) {
      const message = (await res.text()).slice(0, 240);
      setError(`Runner did not start: ${message}`);
      return;
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
    }
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
  function startRunPolling(startedAt) {
    if (pollRef.current) clearInterval(pollRef.current);
    const startMs = Date.parse(startedAt) || Date.now();
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
        const runStage = rt.runState?.runState || "running";
        const mins = Math.max(0, Math.round((Date.now() - startMs) / 60000));
        // Thin-delta progress the runner stamped each stage boundary (preflight
        // → fine-tune → quantize → serve). This IS the live bar — real state.
        const delta = rt.runState?.progress || null;

        if (runStage === "failed") {
          clearInterval(pollRef.current); pollRef.current = null;
          // SPECIFIC failure — classify the exact stage issue (not "training
          // failed"): {stageId, issue, userMessage, evidence, nextAction}.
          const row = rt.runState?.latest || {};
          const issue = deriveTrainingStageIssue(row, row.preflight || null, String(row.blockedReason || rt.runState?.reason || ""));
          setStageIssue(issue);
          setError(issue.userMessage);
          // The one-click remedy for this exact failure point.
          const rem = deriveTrainingRemediation({ workspaceConfig: cfg, workspaceSourceRecords, minScore, slug: SLUG });
          setRemedy(rem.top || issue.nextAction);
          setTrainPhase("idle");
          return;
        }
        // Provable artifact (runner hashed a real QUANTIZED GGUF with a proven
        // fp16→quant size delta) → close the loop.
        if (runStage === "imported" || rt.runState?.artifact?.identified) {
          clearInterval(pollRef.current); pollRef.current = null;
          const reported = rt.runState?.latest?.artifact || {};
          importArtifact({
            type: reported.type || artifact.type,
            modelTag: reported.modelTag || reservedTag,
            path: reported.path || "",
            sha256: reported.sha256 || "",
            quantization: reported.quantization || artifact.quantization,
            sourceBytes: reported.sourceBytes || 0,
            artifactBytes: reported.artifactBytes || 0,
          });
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
        // Activate the tuned tag on the version row — the model is now real.
        next = next.map((o) => {
          if (o?.objectType !== TRAINING_OBJECT_TYPE) return o;
          return { ...o, rows: (o.rows || []).map((r) => (String(r?.Name || "") === `${SLUG}-v${result.version}` ? { ...r, localModel: a.modelTag, status: "imported" } : r)) };
        });
        return next;
      });
      setBusyPct(100); setBusyMsg(`Model record ready — ${a.modelTag} is registered and callable. Verify the endpoint next.`);
      setPanel("verify");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- verify: run the registry test and surface the tuned-tag proof honestly.
  async function runVerify() {
    setError("");
    setVerifying(true);
    setVerifyResult(null);
    setHttpStatus(null);
    setInspectorTab("response");
    try {
      const reg = (workspaceConfig?.dataModel?.objects || []).filter((o) => o?.objectType === "api-registry").flatMap((o) => o.rows || []).find((r) => r?.integrationId === result.integrationId);
      // Use the existing governed API Registry test lane if present; otherwise
      // read the row's last stamped response. Either way verification is the
      // pure tuned-tag gate — never a fake pass. The edited test prompt rides
      // the same governed lane (same shape as the API/Webhook test event).
      let responseBody = reg?.lastResponse ?? null;
      try {
        const res = await fetch("/api/workspace/test-source", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ integrationId: result.integrationId, prompt: String(testPrompt || DEFAULT_TEST_PROMPT) }),
        });
        setHttpStatus(res.status); // the REAL HTTP status — never a fabricated 200
        if (res.ok) {
          const data = await res.json();
          responseBody = data?.response ?? data?.lastResponse ?? responseBody;
          // refresh config so the ledger/badges reflect the stamped test
          const probe = await fetch("/api/workspace", { cache: "no-store" });
          const fresh = await probe.json();
          if (fresh?.workspaceConfig) { setLiveConfig(fresh.workspaceConfig); if (typeof onApplied === "function") onApplied(fresh.workspaceConfig); }
        }
      } catch { /* fall back to stamped response */ }
      const v = verifyTunedResponse({ expectedTag: artifact.modelTag || reservedTag, baseModel, responseBody });
      setVerifyResult(v);
      // Stay on the inspector so the user can read Response/Trace/Details/Proof
      // before advancing — an explicit "use it in a workflow" CTA moves on.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    if (panel === "train") return stageIssue ? { label: "Needs attention", cls: "is-bad" } : trainPhase === "running" ? { label: "Running", cls: "is-running" } : { label: "Ready to run", cls: "" };
    if (panel === "prepare") return { label: "Preparing", cls: "is-running" };
    if (panel === "done") return smokeProven ? { label: "Verified", cls: "is-ok" } : { label: "Proof pending", cls: "is-warn" };
    if (panel === "bind") return smokeProven ? { label: "Verified", cls: "is-ok" } : { label: "Bind", cls: "" };
    if (panel === "profile") return (floorMet && runConfig.ready) ? { label: "Ready to train", cls: "is-ok" } : { label: "Needs setup", cls: "is-warn" };
    if (panel === "curate") return { label: "Configuration", cls: "" };
    return floorMet ? { label: "Ready to train", cls: "is-ok" } : { label: "Collect traces", cls: "is-warn" };
  })();

  return createPortal((
    <div className="dm-orch-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="dm-orch-modal" role="dialog" aria-modal="true" aria-label="Training runtime" data-training-handoff="" data-training-panel={panel} onClick={(e) => e.stopPropagation()}>
        <div className="dm-orch-modal-head training-handoff-head">
          <div>
            <p className="dm-api-action-card-eyebrow">Custom model training</p>
            <h2>{headTitle}</h2>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`dm-status-chip ${pill.cls}`} data-training-status={pill.label}><span className="dm-status-dot" aria-hidden="true" />{pill.label}</span>
            <button type="button" className="dm-btn-ghost" onClick={onClose} aria-label="Close">Close</button>
          </div>
        </div>

        <div className="dm-orch-modal-body">
          <div className="training-handoff-summary">
            <div><strong>{selected.length}</strong><span>qualified traces</span></div>
            <div><strong>{MIN_FINETUNE_TRACES}</strong><span>minimum</span></div>
            <div><strong>{target.label}</strong><span>target</span></div>
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
                <div className="training-config-tabs" role="tablist" aria-label="Trace configuration tabs">
                  <button type="button" role="tab" aria-selected={curateTab === "configuration"} className={curateTab === "configuration" ? "is-active" : ""} onClick={() => setCurateTab("configuration")}>Configuration</button>
                  <button type="button" role="tab" aria-selected={curateTab === "advanced"} className={curateTab === "advanced" ? "is-active" : ""} onClick={() => setCurateTab("advanced")}>Advanced</button>
                </div>

                {curateTab === "configuration" ? (
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

                    <div className="dm-run-console__hint" data-handoff-floor={floorMet ? "met" : "unmet"}>
                      {selected.length} of {candidates.length} selected · floor {MIN_FINETUNE_TRACES}
                      {floorMet ? " met" : ` — ${MIN_FINETUNE_TRACES - selected.length} more required`}
                      {target.requiredEnv.length ? ` · target env: ${target.requiredEnv.join(", ")}` : ""}
                    </div>
                    {blocked > 0 ? (
                      <div className="dm-run-console__hint" data-handoff-redaction-blocked={blocked}>
                        {blocked} trace{blocked === 1 ? " is" : "s are"} blocked by redaction policy and cannot enter the training corpus.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="training-handoff-trace-list">
                  {candidates.map(({ row, index }) => (
                    <div key={index} className="dm-helper-toolcall dm-swarm-card" data-handoff-trace={index}>
                      <div className="training-handoff-trace-row">
                        <label className="training-handoff-trace-title">
                          <input type="checkbox" checked={!excluded.has(index)} onChange={() => { const next = new Set(excluded); if (next.has(index)) next.delete(index); else next.add(index); setExcluded(next); }} />
                          <span>{String(row.inputPrompt).slice(0, 90)}</span>
                        </label>
                        <span className="dm-run-console__hint">score {row.qualityScore}</span>
                      </div>
                      <div className="dm-helper-stream dm-swarm-card-desc">{String(row.agentOutput).slice(0, 140)}</div>
                      {row.reason ? <div className="dm-run-console__hint">{row.reason}</div> : null}
                    </div>
                  ))}
                  </div>
                )}
              </section>
              <div className="training-handoff-action-row">
                <button type="button" className="training-action-primary" data-handoff-to-profile="" disabled={!floorMet} onClick={() => setPanel("profile")}>
                  {floorMet ? "Save configuration" : `Need ${MIN_FINETUNE_TRACES - selected.length} more curated traces`}
                </button>
                <span className="training-handoff-eligibility" data-handoff-eligibility="">
                  {selected.length} selected · floor {MIN_FINETUNE_TRACES}
                </span>
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
                    <div><dt>Compute</dt><dd>{profile.runnerMode === "local-command" ? "Local · " + (modelChoices.runtimes[0]?.adapter || "ollama") : profile.runnerMode}</dd></div>
                    <div><dt>Est. time</dt><dd>~{Math.max(5, Math.round(selected.length * 3.5))} minutes</dd></div>
                    <div><dt>Est. cost</dt><dd>$0.00 (local)</dd></div>
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
                  <label className="training-field"><span>Base model</span>
                    {modelChoices.baseModels.filter(Boolean).length ? (
                      <select value={baseModel} onChange={(e) => setChosenBase(e.target.value)} data-handoff-base-model="">
                        {[...new Set([baseModel, ...modelChoices.baseModels].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={baseModel} placeholder="e.g. qwen2.5-coder:7b" onChange={(e) => setChosenBase(e.target.value)} data-handoff-base-model="" />
                    )}
                  </label>
                  <label className="training-field"><span>Tuned model tag</span>
                    <input type="text" value={tunedTag} placeholder={`${SLUG}-tuned-v${version}`} onChange={(e) => setTunedTag(e.target.value)} data-handoff-tuned-tag="" aria-invalid={tagUnsafe ? "true" : undefined} aria-describedby={tagUnsafe ? "handoff-tag-error" : undefined} />
                  </label>
                  {tagUnsafe ? (
                    <div className="dm-field-error" id="handoff-tag-error" data-handoff-tag-error="">Use letters, numbers, dash, underscore, dot, slash, or colon only — no spaces or shell characters.</div>
                  ) : null}
                  <div className="dm-cockpit-fields" data-handoff-runtime={modelChoices.configured ? "configured" : "setup-needed"} style={{ marginTop: 8 }}>
                    {modelChoices.configured
                      ? modelChoices.runtimes.map((rt, i) => (
                          <span key={i} className="dm-status-chip is-ok" data-handoff-runtime-row={rt.adapter} data-handoff-runtime-reachable={rt.reachable ? "yes" : "no"}><span className="dm-status-dot" aria-hidden="true" />{rt.adapter}{rt.baseUrl ? ` · ${rt.baseUrl.replace(/^https?:\/\//, "")}` : ""}</span>
                        ))
                      : <span className="dm-status-chip is-warn" data-handoff-runtime-setup=""><span className="dm-status-dot" aria-hidden="true" />No local runtime configured</span>}
                    {modelChoices.hasLocalRunner ? <span className="dm-status-chip is-ok" data-handoff-runner-ready=""><span className="dm-status-dot" aria-hidden="true" />Local runner ready</span> : null}
                  </div>
                </div>
              </section>

              {blockReason ? (
                <section className="dm-api-action-card dm-api-action-card-muted" data-handoff-blocked={blockReason.code} aria-label="Cannot start">
                  <div className="dm-api-action-card-icon" aria-hidden="true"><AlertTriangle size={18} /></div>
                  <div className="dm-api-action-card-body">
                    <p className="dm-api-action-card-eyebrow">Cannot start yet</p>
                    <p>{blockReason.message}</p>
                  </div>
                </section>
              ) : null}

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
                <button type="button" className="dm-btn-ghost" onClick={() => setPanel("curate")}>Back</button>
                <button type="button" className="dm-btn-primary" data-handoff-confirm="" disabled={!floorMet || !runConfig.ready} onClick={runPrepare}>
                  Start training
                </button>
              </div>
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

              <div className="training-handoff-action-row">
                <a className="dm-btn-outline" href="/data-model?object=model-training-run" data-train-open-runs="">Open in Runs</a>
                {trainPhase !== "running" ? (
                  <button type="button" className="dm-btn-primary" data-train-start="" onClick={startTraining} disabled={trainPhase === "starting" || !runConfig.ready || !(runConfig.steps && runConfig.steps.length)}>
                    {trainPhase === "starting" ? "Starting…" : "Start training"}
                  </button>
                ) : (
                  <>
                    <button type="button" className="dm-btn-primary" data-train-retry-runner="" onClick={() => triggerTrainingRunner()}>
                      Start runner
                    </button>
                    <button type="button" className="dm-btn-ghost" data-train-to-import="" onClick={() => setPanel("import")}>Attach existing model result</button>
                  </>
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
                  <select value={artifact.type} onChange={(e) => setArtifact({ ...artifact, type: e.target.value })} data-import-type="">
                    {profile.outputs.concat(["openai-compatible-endpoint", "ollama-model"]).filter((v, i, a) => a.indexOf(v) === i).map((t) => <option key={t} value={t}>{ARTIFACT_TYPE_LABELS[t] || t}</option>)}
                  </select>
                </label>
                <label className="dm-run-console__hint" style={{ display: "block" }}>Model name{" "}
                  <input type="text" value={artifact.modelTag} onChange={(e) => setArtifact({ ...artifact, modelTag: e.target.value })} data-import-tag="" />
                </label>
                <label className="dm-run-console__hint" style={{ display: "block" }}>File path{" "}
                  <input type="text" value={artifact.path} placeholder="./artifacts/…" onChange={(e) => setArtifact({ ...artifact, path: e.target.value })} data-import-path="" />
                </label>
                <label className="dm-run-console__hint" style={{ display: "block" }}>File hash (sha256){" "}
                  <input type="text" value={artifact.sha256} onChange={(e) => setArtifact({ ...artifact, sha256: e.target.value })} data-import-sha="" />
                </label>
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
                {busy ? "Setting up your model record…" : "Attach model & activate"}
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
                const raw = liveRegistryRow?.lastResponse ?? "";
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
                          <div className="dm-run-console__hint">why proven: the served response model must equal the tuned tag; a base-model or mismatched reply demotes it.</div>
                          <div className="dm-run-console__hint">row stamped: api-registry ({result.integrationId}) lastResponse + status {servingProfile.servesTunedTag ? "connected" : "registered"}</div>
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
              <button type="button" className="training-action-primary" data-handoff-retry="" disabled={!recovery.retryable} onClick={runPrepare}>
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
