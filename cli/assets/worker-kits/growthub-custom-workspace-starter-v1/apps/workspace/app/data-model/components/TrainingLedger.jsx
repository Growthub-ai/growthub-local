"use client";

/**
 * Training ledger view — renders inside the helper sidecar (the `/training`
 * slash command, identical entry path to `/workflows` → background tasks)
 * and full-width on /training. Read-only by contract: it derives everything
 * through the pure eligibility driver in lib/training-ledger.js and mutates
 * nothing — exports happen through the CLI, model selection through the
 * existing Local Intelligence flow.
 *
 * Evidence-grounded rendering: export claims are cross-checked against the
 * `training:*` sidecar records returned by GET /api/workspace
 * (workspaceSourceRecords). A claim renders "source record linked" only
 * when the record resolves and exportIds match; a claim without evidence
 * renders the rerun instruction; counts are never invented.
 *
 * Visual language is the background-tasks card vocabulary (dm-swarm-card,
 * dm-run-console__hint) — no new chrome, no icons.
 */

import { useEffect, useState } from "react";
import { deriveTrainingLedgerState, deriveDistillationPipelineState } from "../../../lib/training-ledger.js";
import TrainingHandoffModal from "./TrainingHandoffModal.jsx";

function formatWhen(iso) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toISOString().replace("T", " ").slice(0, 16);
}

function activeModelLabel(models, workspaceConfig) {
  const concrete = models.find((model) => model.localModel)?.localModel;
  if (concrete) return concrete;
  const base = models.find((model) => model.baseModel)?.baseModel;
  if (base) return base;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    const row = (Array.isArray(object.rows) ? object.rows : []).find((candidate) => String(candidate?.localModel || "").trim());
    if (row) return String(row.localModel).trim();
  }
  return "Not selected";
}

function modelOptionsFromDataModel(workspaceConfig) {
  const options = new Set();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    if (object?.objectType === "model-training") {
      for (const row of rows) {
        if (String(row?.baseModel || "").trim()) options.add(String(row.baseModel).trim());
        if (String(row?.localModel || "").trim()) options.add(String(row.localModel).trim());
      }
    }
    if (object?.objectType === "sandbox-environment") {
      for (const row of rows) {
        if (String(row?.localModel || "").trim()) options.add(String(row.localModel).trim());
      }
    }
  }
  return [...options];
}

export default function TrainingLedger({ workspaceConfig: providedConfig, workspaceSourceRecords: providedRecords }) {
  const [workspaceConfig, setWorkspaceConfig] = useState(providedConfig || null);
  const [workspaceSourceRecords, setWorkspaceSourceRecords] = useState(providedRecords || null);
  const [error, setError] = useState("");
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState("");

  useEffect(() => {
    // Evidence parity with the page: config-only callers still fetch records.
    if (providedConfig && providedRecords) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace");
        const data = await res.json();
        if (cancelled) return;
        if (data?.workspaceConfig) setWorkspaceConfig(data.workspaceConfig);
        if (data?.workspaceSourceRecords) setWorkspaceSourceRecords(data.workspaceSourceRecords);
      } catch {
        if (!cancelled) setError("Workspace config unavailable — start the workspace app.");
      }
    })();
    return () => { cancelled = true; };
  }, [providedConfig]);

  const state = deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords });
  const pipeline = deriveDistillationPipelineState({ workspaceConfig });
  const sourceOptions = state.models
    .map((model) => {
      const sourceId = String(model.lastSourceId || "").trim();
      const summary = model.sidecarRecord || model.summary || {};
      const sourcePath = String(summary.path || "").trim();
      if (!sourceId && !sourcePath) return null;
      const label = sourcePath ? sourcePath.split("/").filter(Boolean).pop() || sourcePath : sourceId;
      return { value: sourceId || label, label, sourceId, model };
    })
    .filter(Boolean);
  const selectedSource = sourceOptions.find((option) => option.value === selectedSourceId) || sourceOptions[0] || null;
  const primaryModel = selectedSource?.model || state.models[0] || {};
  const summary = primaryModel.sidecarRecord || primaryModel.summary || {};
  const curatedTraces = pipeline.graded;
  const readinessTarget = pipeline.threshold || 10;
  const nextMilestone = curatedTraces < 10 ? 10 : curatedTraces < 25 ? 25 : curatedTraces < 40 ? 40 : 50;
  const priorMilestone = nextMilestone === 10 ? 0 : nextMilestone === 25 ? 10 : nextMilestone === 40 ? 25 : 40;
  const readinessProgress = curatedTraces >= 50
    ? 100
    : Math.max(0, Math.min(100, Math.round(((curatedTraces - priorMilestone) / (nextMilestone - priorMilestone)) * 100)));
  const modelLabel = activeModelLabel(state.models, workspaceConfig);
  const modelOptions = modelOptionsFromDataModel(workspaceConfig);
  const canAdvance = pipeline.ready;
  const updateModelSelection = async (nextModel) => {
    if (!nextModel || !workspaceConfig?.dataModel) return;
    const objects = (workspaceConfig.dataModel.objects || []).map((object) => {
      if (object?.objectType !== "model-training") return object;
      return {
        ...object,
        rows: (object.rows || []).map((row, index) => (
          index === 0
            ? { ...row, baseModel: nextModel, localModel: row.localModel || "" }
            : row
        )),
      };
    });
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: { ...workspaceConfig.dataModel, objects } }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Model selection update failed.");
      return;
    }
    setWorkspaceConfig(data.workspaceConfig);
    setError("");
  };

  return (
    <div data-training-ledger="">
      {error ? <div className="dm-helper-error">{error}</div> : null}

      <div className="training-stats-card" data-training-eligibility={state.eligibility.state}>
        <div className="training-stats-head">
          <div>
            <div className="training-stats-title">Distillation Stats</div>
            <div className="training-stats-subtitle">{formatWhen(primaryModel.lastExportAt)}</div>
          </div>
        </div>

        <div className="training-section training-config-section">
          <div className="training-section-title">Configuration</div>
          <label className="training-field-row">
            <span>Model</span>
            <select
              className="training-model-select"
              value={modelLabel === "Not selected" ? "" : modelLabel}
              onChange={(event) => updateModelSelection(event.target.value)}
              disabled={modelOptions.length === 0}
              aria-label="Training model"
            >
              {modelOptions.length === 0 ? <option value="">Not selected</option> : null}
              {modelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="training-field-row">
            <span>Training data</span>
            <select
              className="training-model-select"
              value={selectedSource?.value || ""}
              onChange={(event) => setSelectedSourceId(event.target.value)}
              aria-label="Training data"
            >
              {sourceOptions.length === 0 ? <option value="">No export selected</option> : null}
              {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <div className="training-progress-block">
          <div className="training-progress-meta">
            <span>Next Training Milestone</span>
            <strong>{curatedTraces >= 50 ? `${curatedTraces}+` : `${curatedTraces} / ${nextMilestone}`}</strong>
          </div>
          <div className={`training-progress-track${pipeline.ready ? " is-ready" : ""}`} aria-label={`Training depth ${curatedTraces} toward ${nextMilestone} qualified traces`}>
            <span style={{ width: `${readinessProgress}%` }} />
          </div>
          <div className="training-progress-marks">
            <span>{priorMilestone === 0 ? "start" : priorMilestone}</span>
            <span>{nextMilestone}{nextMilestone === readinessTarget ? " fine-tune gate" : " next"}</span>
          </div>
          <div className="training-readiness-grid">
            <span>
              <strong>{curatedTraces}</strong>
              <small>qualified traces</small>
            </span>
            <span>
              <strong>{readinessTarget}</strong>
              <small>fine-tune gate</small>
            </span>
            <span>
              <strong>{nextMilestone}</strong>
              <small>next milestone</small>
            </span>
          </div>
        </div>

        <div className="training-section">
          <div className="training-section-title">Training Quality</div>
          <div className="training-chip-row">
            <span className="training-chip">Escalations: <strong>{state.coverage.escalations}</strong></span>
            <span className="training-chip">Reward Mean: <strong>{Number.isFinite(summary.rewardMean) ? summary.rewardMean : "—"}</strong></span>
          </div>
        </div>

        <div className="training-action-row">
          <div className="training-action-help-wrap">
            <button
              type="button"
              className="training-action-primary"
              data-training-handoff-open=""
              disabled={!canAdvance}
              onClick={() => setHandoffOpen(true)}
              aria-describedby="training-action-help"
            >
              Train Custom Model
            </button>
            <div className="training-action-help" id="training-action-help" role="tooltip">
              <strong>Train Custom Model</strong>
              <span>Uses the selected training data and model setting to prepare a governed fine-tune handoff.</span>
              <span>The model is not marked custom or verified until the real training run and endpoint test write evidence back to the Data Model.</span>
            </div>
          </div>
        </div>
      </div>

      <TrainingHandoffModal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        workspaceConfig={workspaceConfig}
        workspaceSourceRecords={workspaceSourceRecords}
        onApplied={(fresh) => setWorkspaceConfig(fresh)}
      />
    </div>
  );
}
