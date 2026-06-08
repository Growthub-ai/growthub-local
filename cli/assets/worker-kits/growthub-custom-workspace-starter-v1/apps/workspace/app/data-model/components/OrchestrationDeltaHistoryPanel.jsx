"use client";

import { GitBranch } from "lucide-react";

function formatDeltaTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return "—";
  return tags.join(", ");
}

function summarizeNodeDeltas(nodeDeltas) {
  if (!Array.isArray(nodeDeltas) || !nodeDeltas.length) return "No node-level changes recorded.";
  const changed = nodeDeltas.filter((delta) => delta?.action && delta.action !== "unchanged");
  if (!changed.length) return "No structural node changes.";
  return changed
    .slice(0, 5)
    .map((delta) => `${delta.nodeId || "node"}: ${delta.action || "updated"}`)
    .join(" · ");
}

function OrchestrationDeltaHistoryPanel({ deltas = [], onBack }) {
  const sorted = [...deltas].sort((a, b) => String(b?.at || "").localeCompare(String(a?.at || "")));

  return (
    <div className="dm-orchestration-sidecar dm-workflow-orchestration">
      <div className="dm-orchestration-sidecar__body">
        <div className="dm-orchestration-sidecar__config-col" style={{ maxWidth: "100%" }}>
          <div className="dm-workflow-panel-head">
            <button type="button" className="dm-workflow-icon-btn" onClick={onBack} aria-label="Back to graph editor">
              ←
            </button>
            <span>Publish history</span>
            <em>{sorted.length} version{deltas.length === 1 ? "" : "s"}</em>
          </div>
          {sorted.length === 0 ? (
            <p className="dm-workflow-empty">No publish deltas yet. Publish a tested draft to record version history.</p>
          ) : (
            <ul className="dm-delta-history-list">
              {sorted.map((delta, index) => (
                <li key={`${delta.version || index}-${delta.at || index}`} className="dm-delta-history-item">
                  <div className="dm-delta-history-item__head">
                    <GitBranch size={14} aria-hidden="true" />
                    <strong>v{delta.version || "?"}</strong>
                    <span className="dm-delta-history-item__meta">
                      {delta.at ? new Date(delta.at).toLocaleString() : "—"}
                    </span>
                  </div>
                  {delta.changeReason ? (
                    <p className="dm-delta-history-item__reason">{delta.changeReason}</p>
                  ) : null}
                  <p className="dm-delta-history-item__tags">
                    Tags: {formatDeltaTags(delta.deltaTags)}
                  </p>
                  <p className="dm-delta-history-item__summary">
                    {summarizeNodeDeltas(delta.nodeDeltas)}
                  </p>
                  <p className="dm-cell-empty" style={{ fontSize: 11, marginTop: 4 }}>
                    {delta.nodeCount ?? 0} nodes · {delta.edgeCount ?? 0} edges
                    {delta.draftRunId ? ` · run ${String(delta.draftRunId).slice(0, 12)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export { OrchestrationDeltaHistoryPanel };
