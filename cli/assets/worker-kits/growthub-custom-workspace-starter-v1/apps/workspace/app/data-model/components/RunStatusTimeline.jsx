"use client";

/**
 * RunStatusTimeline — presentational render of deriveRunStatusDeltas().
 *
 * Evidence-only: it shows whatever the pure projection produced and nothing
 * more. When the projection is log-derived it labels itself as such, so the
 * user is never misled into reading log heuristics as execution truth. Raw
 * stdout/stderr/JSON stays wherever the caller already renders it — this is
 * an additive summary, not a replacement.
 */

import { useMemo } from "react";
import { deriveRunStatusDeltas } from "@/lib/run-status-deltas";

const STATE_CLASS = { ok: "is-ok", bad: "is-bad", running: "is-running", waiting: "" };

export function RunStatusTimeline({ record }) {
  const delta = useMemo(() => deriveRunStatusDeltas(record), [record]);
  if (delta.phase === "idle" && delta.steps.length === 0) return null;
  return (
    <div className="dm-run-timeline" aria-label="Run status">
      {delta.steps.map((step, index) => (
        <div key={`${step.label}-${index}`} className={`dm-run-step ${STATE_CLASS[step.state] || ""}`.trim()}>
          <span className="dm-run-step-dot" aria-hidden="true" />
          <span className="dm-run-step-label">
            {step.label}
            {step.note && <span className="dm-run-step-note">{step.note}</span>}
          </span>
          {step.at && <span className="dm-run-step-meta">{step.at}</span>}
        </div>
      ))}
      {delta.derivedFrom === "logs" && (
        <p className="dm-run-derived-note">Derived from run logs and exit status — not per-step execution events.</p>
      )}
    </div>
  );
}

export default RunStatusTimeline;
