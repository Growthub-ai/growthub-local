"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";

function formatAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function DeltaEntry({ entry, expanded, onToggle }) {
  const tags = Array.isArray(entry?.deltaTags) ? entry.deltaTags : [];
  const nodeDeltas = Array.isArray(entry?.nodeDeltas) ? entry.nodeDeltas : [];
  return (
    <article className="dm-delta-entry">
      <button type="button" className="dm-delta-entry__head" onClick={onToggle}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <div>
          <strong>v{entry?.version || "?"}</strong>
          <span>{formatAt(entry?.at)}</span>
        </div>
        {tags.length > 0 && (
          <div className="dm-delta-entry__tags">
            {tags.map((tag) => (
              <span key={tag} className="dm-filter-chip">{tag}</span>
            ))}
          </div>
        )}
      </button>
      {expanded && (
        <div className="dm-delta-entry__body">
          {entry?.changeReason ? <p className="dm-delta-entry__reason">{entry.changeReason}</p> : null}
          <ul className="dm-delta-entry__nodes">
            {nodeDeltas.length === 0 ? (
              <li>No per-node deltas recorded.</li>
            ) : nodeDeltas.map((delta) => (
              <li key={`${delta?.nodeId || ""}-${delta?.field || ""}`}>
                <strong>{delta?.nodeId || "node"}</strong>
                {delta?.changeReason ? ` — ${delta.changeReason}` : ""}
                {Array.isArray(delta?.deltaTags) && delta.deltaTags.length > 0
                  ? ` [${delta.deltaTags.join(", ")}]`
                  : ""}
              </li>
            ))}
          </ul>
          {entry?.draftRunId ? (
            <p className="dm-cell-empty" style={{ fontSize: 11 }}>
              Test run: <code>{entry.draftRunId}</code>
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

function OrchestrationDeltaHistoryPanel({ sandboxRow, onBack }) {
  const deltas = useMemo(() => {
    const raw = sandboxRow?.orchestrationDeltas;
    if (Array.isArray(raw)) return [...raw].reverse();
    if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? [...parsed].reverse() : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [sandboxRow]);

  const [expandedId, setExpandedId] = useState(deltas[0]?.version || null);

  return (
    <div className="dm-orchestration-delta-history">
      <header className="dm-workflow-panel-head">
        <span><History size={14} aria-hidden="true" /> Publish history</span>
        {onBack ? (
          <button type="button" className="dm-workflow-icon-btn" onClick={onBack}>Back to graph</button>
        ) : null}
      </header>
      {deltas.length === 0 ? (
        <p className="dm-workflow-empty">No publish deltas yet. Save, test, and publish to record version history.</p>
      ) : (
        <div className="dm-delta-timeline">
          {deltas.map((entry) => (
            <DeltaEntry
              key={`${entry?.version || ""}-${entry?.at || ""}`}
              entry={entry}
              expanded={String(expandedId) === String(entry?.version)}
              onToggle={() => setExpandedId(
                String(expandedId) === String(entry?.version) ? null : entry?.version
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { OrchestrationDeltaHistoryPanel };
