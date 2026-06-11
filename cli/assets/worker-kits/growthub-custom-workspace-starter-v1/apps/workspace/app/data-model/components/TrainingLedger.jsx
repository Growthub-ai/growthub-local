"use client";

/**
 * Training ledger view — renders inside the helper sidecar (the `/training`
 * slash command, identical entry path to `/workflows` → background tasks)
 * and full-width on /training. Read-only by contract: it derives everything
 * through the pure eligibility driver in lib/training-ledger.js and mutates
 * nothing — exports happen through the CLI, model selection through the
 * existing Local Intelligence flow.
 *
 * Visual language is the background-tasks card vocabulary (dm-swarm-card,
 * dm-run-console__hint) — no new chrome, no icons.
 */

import { useEffect, useState } from "react";
import { deriveTrainingLedgerState } from "../../../lib/training-ledger.js";

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

export default function TrainingLedger({ workspaceConfig: provided }) {
  const [workspaceConfig, setWorkspaceConfig] = useState(provided || null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (provided) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace");
        const data = await res.json();
        if (!cancelled && data?.workspaceConfig) setWorkspaceConfig(data.workspaceConfig);
      } catch {
        if (!cancelled) setError("Workspace config unavailable — start the workspace app.");
      }
    })();
    return () => { cancelled = true; };
  }, [provided]);

  const state = deriveTrainingLedgerState({ workspaceConfig });

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
          {state.coverage.exports} exports · {state.coverage.records} records · {state.coverage.escalations} escalation diagnoses
        </div>
        <div className="dm-run-console__hint">{surfaceLine(state.coverage.surfaces)}</div>
      </div>

      {/* One card per tracked model — same card grammar as background tasks. */}
      {state.models.map((model) => (
        <div className="dm-helper-toolcall dm-swarm-card" key={model.name} data-training-model={model.name}>
          <div className="dm-helper-toolcall-title dm-swarm-card-title">{model.name || "(unnamed model)"}</div>
          <div className="dm-run-console__hint">
            {model.localModel ? `localModel ${model.localModel}` : "no concrete model selected"}
            {model.baseModel ? ` · base ${model.baseModel}` : ""}
            {model.status ? ` · ${model.status}` : ""}
          </div>
          {model.lastExportId ? (
            <>
              <div className="dm-helper-stream dm-swarm-card-desc">
                Last export {formatWhen(model.lastExportAt)} · {Number(model.summary?.recordCount) || 0} records
                {Number.isFinite(model.summary?.rewardMean) ? ` · reward mean ${model.summary.rewardMean}` : ""}
              </div>
              {model.summary?.path ? <div className="dm-run-console__hint">{model.summary.path}</div> : null}
            </>
          ) : (
            <div className="dm-helper-stream dm-swarm-card-desc">No exports yet for this model.</div>
          )}
        </div>
      ))}
    </div>
  );
}
