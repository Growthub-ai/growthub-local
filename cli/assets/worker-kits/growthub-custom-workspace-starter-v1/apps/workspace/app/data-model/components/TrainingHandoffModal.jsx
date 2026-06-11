"use client";

/**
 * Fine-tune handoff modal — the no-code bridge from distillation traces to
 * a deployed, registry-invocable tuned model. Same modal grammar as the
 * helper setup modal (dm-orch-modal classes, portal), same causation-driver
 * pattern as the API Registry cockpit.
 *
 * The journey (one modal, three panels, zero new routes):
 *   checklist → curate (per-row control + min-score + 10-trace floor gate)
 *             → final check (deployment target, summary)
 *             → prepare (chunked conversion with live progress to 100%:
 *               validate → convert → package/download → apply → verify)
 *             → done (registry row scaffolded; smoke-test via the existing
 *               API Registry cockpit; Unsloth command with the dataset path)
 *
 * Real mechanics, no fake work:
 *   - traces come from the REAL `training-traces` governed object rows
 *     (Pipeline V1 Phase-2.5 shape; Phase-3 eligibility predicate verbatim)
 *   - the dataset is the exact Phase-3 Unsloth JSONL {instruction,input,output}
 *   - writes happen ONLY through the existing governed PATCH (dataModel is
 *     allowlisted): exported flags stamped (Phase-3 parity), one versioned
 *     model-training row, one api-registry row from the chosen deployment
 *     target (lib/adapters/fine-tune-targets.js — adapter layer outside the
 *     workspace config, Ollama-local first-party default)
 *   - the user's explicit Confirm IS the review step (propose → review →
 *     apply, the helper contract)
 *   - actual QLoRA training stays external (§31.2 invariant): the done panel
 *     hands over the runnable command with the real dataset filename
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

const PHASE3_INSTRUCTION = "You are growthub-local-expert. Respect AWaC V2 invariants and the PATCH allowlist.";
const TRAINING_COLUMNS = ["Name", "status", "baseModel", "localModel", "lastExportAt", "lastExportId", "lastSourceId", "lastExportSummary", "description"];

function eligibleTraceRows(workspaceConfig, minScore) {
  const objects = workspaceConfig?.dataModel?.objects || [];
  const object = objects.find((o) => o?.id === TRACES_OBJECT_ID);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      Number(row?.qualityScore) >= minScore
      && String(row?.exported || "false").toLowerCase() !== "true"
      && String(row?.inputPrompt || "").trim()
      && String(row?.agentOutput || "").trim());
}

function toJsonlLine(row) {
  return `${JSON.stringify({ instruction: PHASE3_INSTRUCTION, input: String(row.inputPrompt), output: String(row.agentOutput) })}\n`;
}

export default function TrainingHandoffModal({ open, onClose, workspaceConfig, workspaceSourceRecords, onApplied }) {
  const [panel, setPanel] = useState("checklist"); // checklist | curate | prepare | done
  const [minScore, setMinScore] = useState(DEFAULT_MIN_SCORE);
  const [excluded, setExcluded] = useState(() => new Set());
  const [targetId, setTargetId] = useState(FINE_TUNE_TARGETS[0].id);
  const [progress, setProgress] = useState({ pct: 0, stage: "", stageId: "", converted: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(null);
  const [resume, setResume] = useState({ datasetDownloaded: false, datasetPath: "", lines: null });

  const handoff = deriveTrainingHandoffState({ workspaceConfig, workspaceSourceRecords, minScore });
  const candidates = useMemo(() => eligibleTraceRows(workspaceConfig, minScore), [workspaceConfig, minScore]);
  const selected = candidates.filter(({ index }) => !excluded.has(index));
  const floorMet = selected.length >= MIN_FINETUNE_TRACES;
  const target = resolveFineTuneTarget(targetId);

  if (!open || typeof document === "undefined") return null;

  const tick = (pct, stage, stageId, converted = 0) => new Promise((resolve) => {
    setProgress({ pct, stage, stageId: stageId || "", converted });
    setTimeout(resolve, 0);
  });

  async function runPrepare() {
    setPanel("prepare");
    setError("");
    setRecovery(null);
    let stage = "validate";
    try {
      // validate — Phase-3 predicate already applied; re-assert the floor.
      await tick(5, `Validating ${selected.length} curated traces`, "validate");
      if (!floorMet) throw new Error(`fine-tune floor not met: ${selected.length}/${MIN_FINETUNE_TRACES}`);

      // convert — chunked, causation-derived progress over real rows.
      stage = "convert";
      const lines = resume.lines || [];
      const chunk = 25;
      for (let i = lines.length; i < selected.length; i += chunk) {
        for (const { row } of selected.slice(i, i + chunk)) lines.push(toJsonlLine(row));
        await tick(10 + Math.round((Math.min(i + chunk, selected.length) / selected.length) * 55),
          `Converting ${Math.min(i + chunk, selected.length)}/${selected.length} to Unsloth JSONL`, "convert", Math.min(i + chunk, selected.length));
      }

      // package — real file download (browser-native, no new routes).
      const version = 1 + (workspaceConfig?.dataModel?.objects || [])
        .filter((o) => o?.objectType === TRAINING_OBJECT_TYPE)
        .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
        .filter((r) => /^.+-v\d+$/.test(String(r?.Name || ""))).length;
      stage = "package";
      const datasetPath = resume.datasetPath || `unsloth-dataset-v${version}.jsonl`;
      await tick(72, `Packaging ${datasetPath}`, "package", selected.length);
      if (!resume.datasetDownloaded) {
        const blob = new Blob(lines, { type: "application/jsonl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = datasetPath;
        a.click();
        URL.revokeObjectURL(url);
        setResume({ datasetDownloaded: true, datasetPath, lines });
      }

      // apply — one governed PATCH: exported stamps (Phase-3 parity) +
      // versioned model row + api-registry row from the chosen target.
      stage = "apply";
      await tick(82, "Applying governed rows (exported stamps · version row · registry row)", "apply", selected.length);
      const modelTag = `workspace-local-tuned-v${version}`;
      const { registryRow, versionRow, integrationId } = scaffoldHandoffRows({
        slug: "workspace-local", version, target, modelTag,
        datasetRecords: selected.length, datasetPath,
      });
      const selectedIdx = new Set(selected.map(({ index }) => index));
      const objects = (workspaceConfig?.dataModel?.objects || []).map((o) => {
        if (o?.id === TRACES_OBJECT_ID) {
          return { ...o, rows: (o.rows || []).map((row, i) => (selectedIdx.has(i) ? { ...row, exported: "true" } : row)) };
        }
        if (o?.objectType === TRAINING_OBJECT_TYPE) {
          return { ...o, rows: [...(o.rows || []), versionRow] };
        }
        if (o?.objectType === "api-registry") {
          return { ...o, rows: [...(o.rows || []), registryRow] };
        }
        return o;
      });
      if (!objects.some((o) => o?.objectType === TRAINING_OBJECT_TYPE)) {
        objects.push({
          id: TRAINING_OBJECT_ID, label: "Model Training", source: "Model Training",
          objectType: TRAINING_OBJECT_TYPE, icon: "Terminal", columns: TRAINING_COLUMNS,
          rows: [versionRow], binding: { mode: "manual", source: "Model Training" },
          relations: [], fieldSettings: { hidden: [], order: TRAINING_COLUMNS },
        });
      }
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: { objects } }),
      });
      if (!res.ok) throw new Error(`governed PATCH refused: ${(await res.text()).slice(0, 200)}`);
      const applied = await res.json();

      // verify — readback through the same GET the ledger uses.
      stage = "verify";
      await tick(94, "Verifying readback", "verify", selected.length);
      const check = await fetch("/api/workspace", { cache: "no-store" });
      const fresh = await check.json();
      const reg = (fresh?.workspaceConfig?.dataModel?.objects || [])
        .filter((o) => o?.objectType === "api-registry")
        .flatMap((o) => o.rows || [])
        .find((r) => r?.integrationId === integrationId);
      if (!reg) throw new Error("registry row not present after apply");

      await tick(100, "Complete", "verify", selected.length);
      setResult({ datasetPath, records: selected.length, integrationId, modelTag, version });
      if (typeof onApplied === "function" && applied?.workspaceConfig) onApplied(applied.workspaceConfig);
      setPanel("done");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      // Best-effort evidence readback so the recovery checklist derives
      // from reality (atomic PATCH: either all rows landed or none did).
      let readbackOk = null;
      let registryPresent = null;
      try {
        const probe = await fetch("/api/workspace", { cache: "no-store" });
        const data = await probe.json();
        readbackOk = Boolean(data?.workspaceConfig);
        registryPresent = (data?.workspaceConfig?.dataModel?.objects || [])
          .filter((o) => o?.objectType === "api-registry")
          .flatMap((o) => o.rows || [])
          .some((r) => String(r?.integrationId || "") === "workspace-local-model");
      } catch {
        readbackOk = false;
      }
      setRecovery(deriveHandoffRecovery({
        stage,
        message,
        online: typeof navigator === "undefined" ? true : navigator.onLine,
        readbackOk,
        registryPresent,
        datasetDownloaded: resume.datasetDownloaded,
      }));
      setPanel("recover");
    }
  }

  return createPortal((
    <div className="dm-orch-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="dm-orch-modal" role="dialog" aria-modal="true" aria-label="Fine-tune handoff" data-training-handoff="" onClick={(e) => e.stopPropagation()}>
        <div className="dm-orch-modal-head">
          <span className="dm-helper-toolcall-title">
            {panel === "curate" ? "Curate dataset" : panel === "prepare" ? "Preparing fine-tune" : panel === "recover" ? "Recover handoff" : panel === "done" ? "Handoff complete" : `Fine-tune handoff · ${handoff.score}/100`}
          </span>
          <button type="button" className="dm-btn-ghost" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Close">Close</button>
        </div>

        <div className="dm-orch-modal-body">
          {/* Persistent spine — the cockpit checklist sits above the form in
              every panel (registry-cockpit posture): one condensed row per
              step, status-dotted, no chrome. */}
          <div className="dm-helper-toolcall-row" data-handoff-spine="" style={{ flexWrap: "wrap", gap: 8 }}>
            {handoff.steps.map((step) => (
              <span key={step.id} className="dm-run-console__hint" data-spine-step={step.id} data-spine-status={step.status}>
                <span className="dm-run-console__tree-dot" aria-hidden="true" />{step.id}:{step.status === "complete" ? "✓" : step.status}
              </span>
            ))}
          </div>
          {error ? <div className="dm-helper-error">{error}</div> : null}

          {panel === "checklist" && (
            <div className="dm-orch-modal-list">
              {handoff.steps.map((step) => (
                <div key={step.id} className="dm-helper-toolcall dm-swarm-card" data-handoff-step={step.id} data-handoff-status={step.status}>
                  <div className="dm-helper-toolcall-row">
                    <span className="dm-helper-toolcall-title">{step.label}</span>
                    <span className="dm-run-console__hint">{step.status}</span>
                  </div>
                  <div className="dm-helper-stream dm-swarm-card-desc">{step.description}</div>
                </div>
              ))}
              <button type="button" className="dm-btn-ghost" data-handoff-curate="" disabled={candidates.length === 0} onClick={() => setPanel("curate")}>
                {candidates.length > 0 ? `Prepare fine-tune dataset (${candidates.length} curated traces)` : "No unexported curated traces yet"}
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
              </div>
              {candidates.map(({ row, index }) => (
                <div key={index} className="dm-helper-toolcall dm-swarm-card" data-handoff-trace={index}>
                  <div className="dm-helper-toolcall-row">
                    <label className="dm-helper-toolcall-title" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <input
                        type="checkbox"
                        checked={!excluded.has(index)}
                        onChange={() => {
                          const next = new Set(excluded);
                          if (next.has(index)) next.delete(index); else next.add(index);
                          setExcluded(next);
                        }}
                      />
                      <span>{String(row.inputPrompt).slice(0, 90)}</span>
                    </label>
                    <span className="dm-run-console__hint">score {row.qualityScore}</span>
                  </div>
                  <div className="dm-helper-stream dm-swarm-card-desc">{String(row.agentOutput).slice(0, 140)}</div>
                  {row.reason ? <div className="dm-run-console__hint">{row.reason}</div> : null}
                </div>
              ))}
              <button type="button" className="dm-btn-ghost" data-handoff-confirm="" disabled={!floorMet} onClick={runPrepare}>
                {floorMet
                  ? `Final check passed — prepare ${selected.length} records → ${target.label}`
                  : `Need ${MIN_FINETUNE_TRACES - selected.length} more curated traces`}
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

          {panel === "recover" && recovery && (
            <div className="dm-orch-modal-list" data-handoff-recover="">
              {recovery.items.map((item) => (
                <div key={item.id} className="dm-helper-toolcall dm-swarm-card" data-recover-item={item.id} data-recover-status={item.status}>
                  <div className="dm-helper-toolcall-row">
                    <span className="dm-helper-toolcall-title">{item.id}</span>
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
                <div className="dm-helper-toolcall-title">v{result.version} prepared · {result.records} records</div>
                <div className="dm-helper-stream dm-swarm-card-desc">
                  Dataset downloaded as {result.datasetPath}. Registry row `{result.integrationId}` scaffolded — open the API Registry cockpit to run the streamed smoke test once the tuned model is live.
                </div>
                <div className="dm-run-console__hint">Fine-tune (external, §31.2): run Unsloth/QLoRA over {result.datasetPath}, load weights via the generated Modelfile (`ollama create {result.modelTag}`), then select {result.modelTag} in Local Intelligence.</div>
              </div>
            </div>
          )}
        </div>

        <div className="dm-orch-modal-foot">
          {panel === "curate" || panel === "done" ? (
            <button type="button" className="dm-btn-ghost" onClick={() => setPanel("checklist")}>Back to checklist</button>
          ) : null}
          <span className="dm-run-console__hint" style={{ marginLeft: "auto" }}>
            Governed PATCH only · no training runs in this workspace
          </span>
        </div>
      </div>
    </div>
  ), document.body);
}
