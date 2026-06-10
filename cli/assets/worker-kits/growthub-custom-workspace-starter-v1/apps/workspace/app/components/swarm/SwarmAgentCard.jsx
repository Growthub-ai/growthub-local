"use client";

/**
 * Standalone background-agent card:
 *   "Smoke test dispatch B" / "Agent Completed" / "View transcript"
 */
export function SwarmAgentCard({ run, onViewTranscript }) {
  return (
    <div className="sw-card sw-card--agent">
      <div className="sw-card__head">
        <span className="sw-dot sw-dot--done" />
        <span className="sw-card__name">{run.name}</span>
      </div>
      <div className="sw-card__meta">
        <span className="sw-card__kind">Agent</span>
        <span className="sw-card__metaval">
          {run.status === "done" ? "Completed" : run.status === "error" ? "Failed" : "Stopped"}
        </span>
      </div>
      <button type="button" className="sw-link" onClick={() => onViewTranscript?.(run)}>
        View transcript
      </button>
    </div>
  );
}
