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

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  deriveTrainingHandoffState,
  DEFAULT_MIN_SCORE,
  MIN_FINETUNE_TRACES,
  TRACES_OBJECT_ID,
  TRAINING_OBJECT_ID,
  TRAINING_OBJECT_TYPE,
  deriveHandoffRecovery,
  deriveProgressStages,
} from "../../../lib/training-ledger.js";
import { FINE_TUNE_TARGETS, resolveFineTuneTarget, scaffoldHandoffRows } from "../../../lib/adapters/fine-tune-targets.js";
import { TRAINING_RUNTIME_PROFILES, resolveTrainingProfile, buildTrainingRunConfig } from "../../../lib/training-runtime-profiles.js";
import { buildTrainingRunReceipt, TRAINING_RUN_OBJECT_ID, TRAINING_RUN_OBJECT_TYPE } from "../../../lib/training-run-receipts.js";
import { deriveArtifactState } from "../../../lib/training-artifacts.js";
import { verifyTunedResponse } from "../../../lib/training-verification.js";
import { applyGenomeFieldSettings } from "../../../lib/workspace-genome.js";

const PHASE3_INSTRUCTION = "You are growthub-local-expert. Respect AWaC V2 invariants and the PATCH allowlist.";
const TRAINING_COLUMNS = ["Name", "status", "baseModel", "localModel", "lastExportAt", "lastExportId", "lastSourceId", "lastExportSummary", "description"];
const RUN_COLUMNS = [
  "trainingRunId", "modelTrainingRowId", "datasetExportId", "baseModel", "trainingProfile", "runnerMode",
  "status", "startedAt", "completedAt", "artifactType", "artifactModelTag", "artifactPath", "artifactSha256", "artifactQuantization", "schema",
];
const SLUG = "workspace-local";

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
    schema: receipt.schema,
  };
}

/** Upsert the model-training-run object + a run row into a dataModel objects array. */
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
  const [artifact, setArtifact] = useState({ type: "gguf", modelTag: "", path: "", sha256: "", quantization: "q4_k_m" });
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  // Behind-the-scenes setup feedback — the user is never left in the dark
  // while the API Registry row + Data Model model record are written.
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [busyPct, setBusyPct] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(null);
  const [resume, setResume] = useState({ datasetDownloaded: false, datasetPath: "", lines: null });

  const handoff = deriveTrainingHandoffState({ workspaceConfig, workspaceSourceRecords, minScore });
  const candidates = useMemo(() => eligibleTraceRows(workspaceConfig, minScore), [workspaceConfig, minScore]);
  const selected = candidates.filter(({ index }) => !excluded.has(index));
  const floorMet = selected.length >= MIN_FINETUNE_TRACES;
  const blocked = blockedTraceCount(workspaceConfig);
  const target = resolveFineTuneTarget(targetId);
  const profile = resolveTrainingProfile(profileId);
  const baseModel = String(workspaceConfig?.dataModel?.objects?.find((o) => o?.objectType === TRAINING_OBJECT_TYPE)?.rows?.[0]?.baseModel || "").trim();

  if (!open || typeof document === "undefined") return null;

  const version = 1 + (workspaceConfig?.dataModel?.objects || [])
    .filter((o) => o?.objectType === TRAINING_OBJECT_TYPE)
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
    .filter((r) => /^.+-v\d+$/.test(String(r?.Name || ""))).length;
  const reservedTag = (tunedTag || `${SLUG}-tuned-v${version}`).trim();
  const datasetPath = resume.datasetPath || `unsloth-dataset-v${version}.jsonl`;
  const runConfig = buildTrainingRunConfig({ profileId: profile.id, baseModel, datasetPath, outputModelTag: reservedTag, artifactPath: `./artifacts/${reservedTag}` });

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

  // ---- train: mark the run RUNNING (governed) and keep the user informed.
  async function startTraining() {
    setError("");
    setTrainPhase("starting");
    try {
      const runningReceipt = buildTrainingRunReceipt({
        trainingRunId: result.trainingRunId, modelTrainingRowId: SLUG, datasetExportId: result.exportId,
        baseModel, trainingProfile: profile.id, runnerMode: profile.runnerMode, status: "running", startedAt: new Date().toISOString(),
      });
      await patchObjects((objects) => upsertRunRow(objects, runReceiptToRow(runningReceipt)));
      setTrainPhase("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTrainPhase("idle");
    }
  }

  // ---- import: record the artifact identity → imported receipt + tuned localModel.
  async function importArtifact() {
    setError("");
    const state = deriveArtifactState(artifact);
    if (!state.identified) { setError(`Artifact not provable yet: ${state.reason}`); return; }
    setBusy(true);
    try {
      setBusyPct(20); setBusyMsg("Recording the imported artifact (governed run receipt)…");
      const importedReceipt = buildTrainingRunReceipt({
        trainingRunId: result.trainingRunId, modelTrainingRowId: SLUG, datasetExportId: result.exportId,
        baseModel, trainingProfile: profile.id, runnerMode: profile.runnerMode, status: "imported",
        startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), artifact,
      });
      setBusyPct(55); setBusyMsg("Activating the tuned model in the Data Model + API Registry record…");
      await patchObjects((objects) => {
        let next = upsertRunRow(objects, runReceiptToRow(importedReceipt));
        // Activate the tuned tag on the version row — the model is now real.
        next = next.map((o) => {
          if (o?.objectType !== TRAINING_OBJECT_TYPE) return o;
          return { ...o, rows: (o.rows || []).map((r) => (String(r?.Name || "") === `${SLUG}-v${result.version}` ? { ...r, localModel: artifact.modelTag, status: "imported" } : r)) };
        });
        return next;
      });
      setBusyPct(100); setBusyMsg(`Model record ready — ${artifact.modelTag} is registered and callable. Verify the endpoint next.`);
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
    try {
      const reg = (workspaceConfig?.dataModel?.objects || []).filter((o) => o?.objectType === "api-registry").flatMap((o) => o.rows || []).find((r) => r?.integrationId === result.integrationId);
      // Use the existing governed API Registry test lane if present; otherwise
      // read the row's last stamped response. Either way verification is the
      // pure tuned-tag gate — never a fake pass.
      let responseBody = reg?.lastResponse ?? null;
      try {
        const res = await fetch("/api/workspace/test-source", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ integrationId: result.integrationId }),
        });
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
      if (v.verified) setPanel("bind");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifying(false);
    }
  }

  const headTitle = ({
    curate: "Review training data", profile: "Choose training profile", prepare: "Preparing handoff",
    train: "Fine-tuning in progress", import: "Import the trained model", verify: "Verify the endpoint",
    bind: "Bind into a workflow", recover: "Recovery", done: "Custom model ready",
  })[panel] || "Train custom model";

  return createPortal((
    <div className="dm-orch-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="dm-orch-modal" role="dialog" aria-modal="true" aria-label="Training runtime" data-training-handoff="" data-training-panel={panel} onClick={(e) => e.stopPropagation()}>
        <div className="dm-orch-modal-head training-handoff-head">
          <div>
            <p>Custom model training</p>
            <h2>{headTitle}</h2>
          </div>
          <button type="button" className="dm-btn-ghost" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Close">Close</button>
        </div>

        {/* Lifecycle rail — the user always sees where they are; no dark
            states. Reuses the run-console dot grammar; labels via title. */}
        <div className="dm-run-console__tree" data-training-rail={panel} style={{ padding: "8px 16px 0" }} aria-label="Training lifecycle">
          {[["curate", "Distill"], ["profile", "Profile"], ["prepare", "Dataset"], ["train", "Train"], ["import", "Import"], ["verify", "Verify"], ["bind", "Run"]].map(([id, label]) => {
            const order = ["curate", "profile", "prepare", "train", "import", "verify", "bind", "done"];
            const cur = order.indexOf(panel === "recover" ? "prepare" : panel);
            const me = order.indexOf(id);
            const variant = panel === "done" || me < cur ? "ok" : me === cur ? "active" : "pending";
            return <span key={id} className="dm-run-console__tree-dot" data-variant={variant} data-rail-step={id} title={`${label}${variant === "ok" ? " — done" : variant === "active" ? " — current" : ""}`} />;
          })}
        </div>

        <div className="dm-orch-modal-body">
          <div className="training-handoff-summary">
            <div><strong>{selected.length}</strong><span>qualified traces</span></div>
            <div><strong>{MIN_FINETUNE_TRACES}</strong><span>minimum</span></div>
            <div><strong>{target.label}</strong><span>target</span></div>
          </div>
          {error ? <div className="dm-helper-error">{error}</div> : null}

          {panel === "checklist" && (
            <div className="dm-orch-modal-list">
              <div className="training-handoff-process">
                <div><strong>1. Distill</strong><span>Select high-quality traces from real workspace activity.</span></div>
                <div><strong>2. Train</strong><span>Pick a training profile; Growthub Local prepares and tracks the run.</span></div>
                <div><strong>3. Import</strong><span>Attach the trained artifact — the tuned model becomes real and provable.</span></div>
                <div><strong>4. Verify & Run</strong><span>Prove the tuned tag, then invoke it in a workflow.</span></div>
              </div>
              <button type="button" className="dm-btn-ghost" data-handoff-curate="" disabled={candidates.length === 0} onClick={() => setPanel("curate")}>
                {candidates.length > 0 ? `Review ${candidates.length} traces` : "No qualified traces yet"}
              </button>
            </div>
          )}

          {panel === "curate" && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card">
                <div className="dm-helper-toolcall-row">
                  <label className="dm-run-console__hint">
                    min quality{" "}
                    <select value={minScore} onChange={(e) => { setMinScore(Number(e.target.value)); setExcluded(new Set()); }} data-handoff-min-score="">
                      <option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
                    </select>
                  </label>
                  <label className="dm-run-console__hint" style={{ marginLeft: 12 }}>
                    deploy target{" "}
                    <select value={targetId} onChange={(e) => setTargetId(e.target.value)} data-handoff-target="">
                      {FINE_TUNE_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </label>
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
              <div className="training-handoff-trace-list">
              {candidates.map(({ row, index }) => (
                <div key={index} className="dm-helper-toolcall dm-swarm-card" data-handoff-trace={index}>
                  <div className="dm-helper-toolcall-row">
                    <label className="dm-helper-toolcall-title" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
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
              <button type="button" className="dm-btn-ghost" data-handoff-to-profile="" disabled={!floorMet} onClick={() => setPanel("profile")}>
                {floorMet ? "Choose training profile" : `Need ${MIN_FINETUNE_TRACES - selected.length} more curated traces`}
              </button>
            </div>
          )}

          {panel === "profile" && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card">
                <label className="dm-run-console__hint">training profile{" "}
                  <select value={profileId} onChange={(e) => setProfileId(e.target.value)} data-handoff-profile="">
                    {TRAINING_RUNTIME_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <div className="dm-helper-stream dm-swarm-card-desc">{profile.description}</div>
                <label className="dm-run-console__hint" style={{ display: "block", marginTop: 8 }}>tuned model tag{" "}
                  <input type="text" value={tunedTag} placeholder={`${SLUG}-tuned-v${version}`} onChange={(e) => setTunedTag(e.target.value)} data-handoff-tuned-tag="" />
                </label>
                <div className="dm-run-console__hint">base model: {baseModel || "(select in the ledger first)"} · runner: {profile.runnerMode} · outputs: {profile.outputs.join(", ")}</div>
              </div>
              <div className="dm-helper-toolcall dm-swarm-card" data-handoff-runconfig="">
                <div className="dm-helper-toolcall-title dm-swarm-card-title">Generated run config</div>
                {runConfig.commands.length ? runConfig.commands.map((c, i) => (
                  <pre key={i} className="dm-helper-stream dm-swarm-card-desc" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c}</pre>
                )) : <div className="dm-run-console__hint">No command for this profile — import the served/attested artifact directly.</div>}
                <div className="dm-run-console__hint">verification expects response model = <strong>{runConfig.verification.expectedModel}</strong></div>
                {!runConfig.ready ? <div className="dm-run-console__hint" data-runconfig-missing="">missing: {runConfig.missingRequirements.join(", ")}</div> : null}
              </div>
              <button type="button" className="dm-btn-ghost" data-handoff-confirm="" disabled={!floorMet} onClick={runPrepare}>
                Prepare dataset & training run
              </button>
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
              <div className="dm-helper-toolcall dm-swarm-card">
                <div className="dm-helper-toolcall-title">
                  {trainPhase === "running" ? "Fine-tuning in progress" : trainPhase === "starting" ? "Starting run…" : "Ready to fine-tune"}
                </div>
                <div style={{ borderBottom: "2px solid currentColor", width: trainPhase === "running" ? "100%" : trainPhase === "starting" ? "40%" : "15%", transition: "width 160ms linear" }} aria-hidden="true" />
                <div className="dm-run-console__hint" data-train-status={trainPhase}>{trainPhase === "running" ? "Run recorded as in progress — tracked by Growthub Local" : trainPhase === "starting" ? "Recording run…" : "Not started"}</div>
                <div className="dm-helper-stream dm-swarm-card-desc">
                  {trainPhase === "running"
                    ? `Your ${profile.label} run is in progress on the local runner. Growthub Local is tracking run ${result.trainingRunId} — this view stays live; nothing is marked complete until you import a real artifact.`
                    : `Dataset v${result.version} (${result.records} records) is saved as ${result.datasetPath}. Start the run to record a governed training run; you stay informed the whole way.`}
                </div>
              </div>

              {runConfig.commands.length ? (
                <div className="dm-helper-toolcall dm-swarm-card" data-train-command="">
                  <div className="dm-helper-toolcall-title dm-swarm-card-title">Run this on your local runner</div>
                  {runConfig.commands.map((c, i) => <pre key={i} className="dm-helper-stream dm-swarm-card-desc" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c}</pre>)}
                  <div className="dm-run-console__hint">Dataset already on disk: {result.datasetPath}. The run targets tuned tag {result.modelTag}.</div>
                </div>
              ) : (
                <div className="dm-helper-toolcall dm-swarm-card">
                  <div className="dm-run-console__hint">This profile imports an already-served model — no local command. Start, then import the served tag.</div>
                </div>
              )}

              {trainPhase !== "running" ? (
                <button type="button" className="dm-btn-ghost" data-train-start="" onClick={startTraining} disabled={trainPhase === "starting"}>
                  {trainPhase === "starting" ? "Starting…" : "Start fine-tuning"}
                </button>
              ) : (
                <button type="button" className="dm-btn-ghost" data-train-to-import="" onClick={() => setPanel("import")}>
                  My run finished — import the artifact
                </button>
              )}
            </div>
          )}

          {panel === "import" && result && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card">
                <div className="dm-helper-toolcall-title dm-swarm-card-title">Attach the trained artifact</div>
                <div className="dm-helper-stream dm-swarm-card-desc">Growthub Local records the artifact identity so the tuned model is provable, not assumed. File artifacts need a path + sha256; served/named runtimes need only the model tag.</div>
                <label className="dm-run-console__hint" style={{ display: "block", marginTop: 8 }}>type{" "}
                  <select value={artifact.type} onChange={(e) => setArtifact({ ...artifact, type: e.target.value })} data-import-type="">
                    {profile.outputs.concat(["openai-compatible-endpoint", "ollama-model"]).filter((v, i, a) => a.indexOf(v) === i).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="dm-run-console__hint" style={{ display: "block" }}>model tag{" "}
                  <input type="text" value={artifact.modelTag} onChange={(e) => setArtifact({ ...artifact, modelTag: e.target.value })} data-import-tag="" />
                </label>
                <label className="dm-run-console__hint" style={{ display: "block" }}>artifact path{" "}
                  <input type="text" value={artifact.path} placeholder="./artifacts/…" onChange={(e) => setArtifact({ ...artifact, path: e.target.value })} data-import-path="" />
                </label>
                <label className="dm-run-console__hint" style={{ display: "block" }}>sha256{" "}
                  <input type="text" value={artifact.sha256} onChange={(e) => setArtifact({ ...artifact, sha256: e.target.value })} data-import-sha="" />
                </label>
                <div className="dm-run-console__hint" data-import-state={deriveArtifactState(artifact).identified ? "ok" : "incomplete"}>
                  {deriveArtifactState(artifact).identified ? "Artifact is provable — ready to import." : deriveArtifactState(artifact).reason}
                </div>
              </div>
              {busy ? (
                <div className="dm-helper-toolcall dm-swarm-card" data-import-setup="">
                  <div className="dm-helper-toolcall-title">{busyPct}%</div>
                  <div style={{ borderBottom: "2px solid currentColor", width: `${busyPct}%`, transition: "width 140ms linear" }} aria-hidden="true" />
                  <div className="dm-helper-stream dm-swarm-card-desc">{busyMsg}</div>
                </div>
              ) : null}
              <button type="button" className="dm-btn-ghost" data-import-confirm="" disabled={busy || !deriveArtifactState(artifact).identified} onClick={importArtifact}>
                {busy ? "Setting up model record…" : "Import artifact & activate tuned tag"}
              </button>
            </div>
          )}

          {panel === "verify" && result && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card">
                <div className="dm-helper-toolcall-title dm-swarm-card-title">Verify the endpoint serves the tuned weights</div>
                <div className="dm-helper-stream dm-swarm-card-desc">The registry test must return <strong>{artifact.modelTag || reservedTag}</strong>. A base-model, malformed, or error response will NOT verify — there is no fake proof.</div>
                {verifying ? (
                  <>
                    <div style={{ borderBottom: "2px solid currentColor", width: "70%", transition: "width 160ms linear" }} aria-hidden="true" />
                    <div className="dm-run-console__hint">Calling the registered endpoint and checking the response model tag…</div>
                  </>
                ) : null}
                {verifyResult && !verifying ? (
                  <div className="dm-run-console__hint" data-verify-result={verifyResult.verified ? "verified" : verifyResult.demotion}>
                    {verifyResult.verified ? `✓ ${verifyResult.reason}` : `Not verified — ${verifyResult.reason}`}
                  </div>
                ) : null}
              </div>
              <button type="button" className="dm-btn-ghost" data-verify-run="" onClick={runVerify} disabled={verifying}>
                {verifying ? "Testing endpoint…" : verifyResult && !verifyResult.verified ? "Re-test endpoint" : "Test endpoint"}
              </button>
            </div>
          )}

          {panel === "bind" && result && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card">
                <div className="dm-helper-toolcall-title dm-swarm-card-title">Bind into a sandbox/workflow smoke</div>
                <div className="dm-helper-stream dm-swarm-card-desc">Reference registry row <strong>{result.integrationId}</strong> from a sandbox row or an api-registry-call workflow node, then run it once. A successful run writes the outputHash that completes the capability.</div>
                <a className="dm-run-console__hint" href={`/workflows`} data-bind-open-workflow="">Open Workflows →</a>
              </div>
              <button type="button" className="dm-btn-ghost" data-bind-done="" onClick={() => setPanel("done")}>
                Done — track completion on the ledger
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
              <button type="button" className="dm-btn-ghost" data-handoff-retry="" disabled={!recovery.retryable} onClick={runPrepare}>
                {recovery.retryable ? "Retry — resumes from where it stopped" : "Resolve blocked items above, then reopen"}
              </button>
              <button type="button" className="dm-btn-ghost" onClick={() => setPanel("curate")}>Back to curation</button>
            </div>
          )}

          {panel === "done" && result && (
            <div className="dm-orch-modal-list">
              <div className="dm-helper-toolcall dm-swarm-card" data-handoff-done="">
                <div className="dm-helper-toolcall-title">Custom model {result.modelTag} — lifecycle owned end to end</div>
                <div className="dm-helper-stream dm-swarm-card-desc">
                  v{result.version}: {result.records} records → run {result.trainingRunId} → imported artifact → registry `{result.integrationId}`{verifyResult?.verified ? " → verified tuned tag" : ""}. Bind it into a workflow and run once to write the final outputHash — /training and /custom-models track the proof live.
                </div>
                <div className="dm-run-console__hint">Identity chain: {SLUG}-v{result.version} → {result.exportId} → {result.trainingRunId} → {result.modelTag} → {result.integrationId}{verifyResult?.verified ? " → verified" : ""}</div>
              </div>
            </div>
          )}
        </div>

        <div className="dm-orch-modal-foot">
          {["curate", "profile", "done"].includes(panel) ? (
            <button type="button" className="dm-btn-ghost" onClick={() => setPanel("checklist")}>Back to checklist</button>
          ) : null}
          <span className="dm-run-console__hint" style={{ marginLeft: "auto" }}>
            {panel === "train" ? "Growthub Local owns the run lifecycle — you stay informed at every step." : "Nothing is marked custom or verified without real artifact + endpoint proof."}
          </span>
        </div>
      </div>
    </div>
  ), document.body);
}
