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

function surfaceLine(surfaces) {
  const entries = Object.entries(surfaces || {}).filter(([, n]) => n > 0);
  if (!entries.length) return "no traces yet";
  return entries.map(([k, n]) => `${k} ${n}`).join(" · ");
}

function evidenceLine(model) {
  if (model.evidence === "linked") return `source record linked · ${model.lastSourceId}`;
  if (model.evidence === "missing") return "source record missing — rerun `growthub intelligence export`";
  if (model.evidence === "unverified") return "source record not verified in this view";
  return null;
}

export default function TrainingLedger({ workspaceConfig: providedConfig, workspaceSourceRecords: providedRecords }) {
  const [workspaceConfig, setWorkspaceConfig] = useState(providedConfig || null);
  const [workspaceSourceRecords, setWorkspaceSourceRecords] = useState(providedRecords || null);
  const [error, setError] = useState("");
  const [handoffOpen, setHandoffOpen] = useState(false);

  useEffect(() => {
    if (providedConfig) return;
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

  return (
    <div data-training-ledger="">
      {error ? <div className="dm-helper-error">{error}</div> : null}

      {/* Eligibility — the one low-entropy awareness line (causation driver). */}
      <div className="dm-helper-toolcall dm-swarm-card" data-training-eligibility={state.eligibility.state}>
        <div className="dm-helper-toolcall-title dm-swarm-card-title">
          {state.eligibility.state === "complete"
            ? "Corpus exported"
            : state.eligibility.state === "eligible"
              ? "Export eligible"
              : "Gathering evidence"}
        </div>
        <div className="dm-helper-stream dm-swarm-card-desc">{state.eligibility.next}</div>
        <div className="dm-run-console__hint">
          {state.coverage.exports} verified exports · {state.coverage.records} records · {state.coverage.escalations} escalation diagnoses
        </div>
        <div className="dm-run-console__hint">{surfaceLine(state.coverage.surfaces)}</div>
        {pipeline.present ? (
          <div className="dm-run-console__hint" data-training-pipeline="">
            {pipeline.graded} curated traces (score ≥ {pipeline.minScore}) · {pipeline.unexported} awaiting export
            {pipeline.ready ? " · fine-tune floor met" : ` · ${pipeline.remaining} more to reach ${pipeline.threshold}`}
          </div>
        ) : null}
        <button
          type="button"
          className="dm-btn-ghost"
          data-training-handoff-open=""
          onClick={() => setHandoffOpen(true)}
        >
          Continue to fine-tune
        </button>
      </div>

      <TrainingHandoffModal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        workspaceConfig={workspaceConfig}
        workspaceSourceRecords={workspaceSourceRecords}
        onApplied={(fresh) => setWorkspaceConfig(fresh)}
      />

      {/* One card per tracked model — same card grammar as background tasks. */}
      {state.models.map((model) => {
        const summary = model.sidecarRecord || model.summary;
        const evidence = evidenceLine(model);
        return (
          <div className="dm-helper-toolcall dm-swarm-card" key={model.name} data-training-model={model.name} data-training-evidence={model.evidence}>
            <div className="dm-helper-toolcall-title dm-swarm-card-title">{model.name || "(unnamed model)"}</div>
            <div className="dm-run-console__hint">
              {model.localModel ? `localModel ${model.localModel}` : "no concrete model selected"}
              {model.baseModel ? ` · base ${model.baseModel}` : ""}
              {model.status ? ` · ${model.status}` : ""}
            </div>
            {model.evidence === "none" ? (
              <div className="dm-helper-stream dm-swarm-card-desc">No exports yet for this model.</div>
            ) : (
              <>
                <div className="dm-helper-stream dm-swarm-card-desc">
                  Last export {formatWhen(model.lastExportAt)}
                  {model.evidence !== "missing" && summary
                    ? ` · ${Number(summary.recordCount) || 0} records${Number.isFinite(summary.rewardMean) ? ` · reward mean ${summary.rewardMean}` : ""}`
                    : ""}
                </div>
                {evidence ? <div className="dm-run-console__hint">{evidence}</div> : null}
                {model.evidence !== "missing" && summary?.path ? (
                  <div className="dm-run-console__hint">{summary.path}</div>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
