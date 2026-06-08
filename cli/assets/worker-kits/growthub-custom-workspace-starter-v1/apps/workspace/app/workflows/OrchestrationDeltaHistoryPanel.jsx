"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function formatDeltaTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return "—";
  return tags.join(", ");
}

function OrchestrationDeltaHistoryPanel({ deltas = [], onBack }) {
  const entries = useMemo(
    () => (Array.isArray(deltas) ? [...deltas].reverse() : []),
    [deltas]
  );
  const [expanded, setExpanded] = useState(() => (entries[0] ? String(entries[0].version || entries[0].at || 0) : ""));

  if (!entries.length) {
    return (
      <div className="dm-workflow-delta-history">
        <header className="dm-workflow-delta-history__head">
          <div>
            <p className="dm-workflow-delta-history__eyebrow">Publish history</p>
            <h2>No published deltas yet</h2>
          </div>
          {onBack ? (
            <button type="button" className="dm-workflow-chip-btn" onClick={onBack}>
              Back to graph
            </button>
          ) : null}
        </header>
        <p className="dm-workflow-empty">Publish a tested draft to record version deltas here.</p>
      </div>
    );
  }

  return (
    <div className="dm-workflow-delta-history">
      <header className="dm-workflow-delta-history__head">
        <div>
          <p className="dm-workflow-delta-history__eyebrow">Publish history</p>
          <h2>{entries.length} published version{entries.length === 1 ? "" : "s"}</h2>
        </div>
        {onBack ? (
          <button type="button" className="dm-workflow-chip-btn" onClick={onBack}>
            Back to graph
          </button>
        ) : null}
      </header>
      <div className="dm-workflow-delta-timeline">
        {entries.map((entry, index) => {
          const key = String(entry.version || entry.at || index);
          const open = expanded === key;
          const nodeDeltas = Array.isArray(entry.nodeDeltas) ? entry.nodeDeltas : [];
          return (
            <article key={key} className="dm-workflow-delta-card">
              <button
                type="button"
                className="dm-workflow-delta-card__toggle"
                onClick={() => setExpanded(open ? "" : key)}
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="dm-workflow-delta-card__version">v{entry.version || "?"}</span>
                <span className="dm-workflow-delta-card__meta">
                  {entry.at ? new Date(entry.at).toLocaleString() : "—"}
                  {entry.deltaTags?.length ? ` · ${formatDeltaTags(entry.deltaTags)}` : ""}
                </span>
              </button>
              {open ? (
                <div className="dm-workflow-delta-card__body">
                  {entry.changeReason ? <p className="dm-workflow-delta-card__reason">{entry.changeReason}</p> : null}
                  <dl className="dm-workflow-delta-card__stats">
                    <div><dt>Nodes</dt><dd>{entry.nodeCount ?? "—"}</dd></div>
                    <div><dt>Edges</dt><dd>{entry.edgeCount ?? "—"}</dd></div>
                    {entry.draftRunId ? <div><dt>Draft run</dt><dd>{entry.draftRunId}</dd></div> : null}
                  </dl>
                  {nodeDeltas.length ? (
                    <ul className="dm-workflow-delta-node-list">
                      {nodeDeltas.map((delta) => (
                        <li key={`${key}-${delta.nodeId || delta.id || delta.label}`}>
                          <strong>{delta.label || delta.nodeId || "Node"}</strong>
                          {delta.deltaTags?.length ? <span> · {formatDeltaTags(delta.deltaTags)}</span> : null}
                          {delta.changeReason ? <p>{delta.changeReason}</p> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="dm-cell-empty">No per-node delta records for this publish.</p>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export { OrchestrationDeltaHistoryPanel };
