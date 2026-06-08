"use client";

import { ChevronDown, ChevronUp, History } from "lucide-react";
import { useMemo, useState } from "react";

function formatAt(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function DeltaEntry({ entry, expanded, onToggle }) {
  const nodeDeltas = Array.isArray(entry?.nodeDeltas) ? entry.nodeDeltas : [];
  const deltaTags = Array.isArray(entry?.deltaTags) ? entry.deltaTags : [];
  return (
    <article className="dm-delta-entry">
      <button type="button" className="dm-delta-entry__head" onClick={onToggle}>
        <div>
          <strong>v{entry?.version || "?"}</strong>
          <span className="dm-cell-empty">{formatAt(entry?.at)}</span>
        </div>
        <div className="dm-delta-entry__meta">
          {deltaTags.length > 0 && (
            <span className="dm-filter-chip">{deltaTags.join(", ")}</span>
          )}
          <span>{nodeDeltas.length} node change{nodeDeltas.length === 1 ? "" : "s"}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {expanded && (
        <div className="dm-delta-entry__body">
          {entry?.changeReason ? <p>{entry.changeReason}</p> : null}
          {entry?.draftRunId ? (
            <p className="dm-cell-empty">Draft run: {entry.draftRunId}</p>
          ) : null}
          {nodeDeltas.length === 0 ? (
            <p className="dm-cell-empty">No per-node deltas recorded.</p>
          ) : (
            <ul className="dm-delta-node-list">
              {nodeDeltas.map((delta, index) => (
                <li key={`${delta?.nodeId || index}:${index}`}>
                  <strong>{delta?.nodeId || "node"}</strong>
                  {delta?.deltaTags?.length ? ` · ${delta.deltaTags.join(", ")}` : ""}
                  {delta?.changeReason ? ` — ${delta.changeReason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function OrchestrationDeltaHistoryPanel({ row, onBack }) {
  const deltas = useMemo(() => {
    const raw = Array.isArray(row?.orchestrationDeltas) ? row.orchestrationDeltas : [];
    return [...raw].reverse();
  }, [row?.orchestrationDeltas]);

  const [expandedVersion, setExpandedVersion] = useState(deltas[0]?.version || null);
  const [tagFilter, setTagFilter] = useState("");

  const allTags = useMemo(() => {
    const tags = new Set();
    for (const entry of deltas) {
      for (const tag of entry?.deltaTags || []) {
        if (tag) tags.add(String(tag));
      }
    }
    return Array.from(tags).sort();
  }, [deltas]);

  const filtered = useMemo(() => {
    if (!tagFilter) return deltas;
    return deltas.filter((entry) => (entry?.deltaTags || []).includes(tagFilter));
  }, [deltas, tagFilter]);

  return (
    <div className="dm-orchestration-sidecar dm-workflow-orchestration dm-delta-history">
      <header className="dm-workflow-header">
        <div>
          <p className="dm-workflow-eyebrow"><History size={13} /> Publish history</p>
          <h1>{row?.Name || row?.name || "Workflow"}</h1>
        </div>
        <div className="dm-workflow-header-actions">
          {onBack ? (
            <button type="button" className="dm-workflow-chip-btn" onClick={onBack}>
              Back to graph
            </button>
          ) : null}
        </div>
      </header>

      {allTags.length > 0 && (
        <div className="dm-filter-chip-row" style={{ padding: "0 16px 8px" }}>
          <button
            type="button"
            className={`dm-filter-chip${!tagFilter ? " dm-chip-active" : ""}`}
            onClick={() => setTagFilter("")}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`dm-filter-chip${tagFilter === tag ? " dm-chip-active" : ""}`}
              onClick={() => setTagFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="dm-delta-history-list">
        {filtered.length === 0 ? (
          <p className="dm-workflow-empty">No publish deltas yet. Publish a tested draft to record version history.</p>
        ) : filtered.map((entry) => (
          <DeltaEntry
            key={`${entry?.version || ""}:${entry?.at || ""}`}
            entry={entry}
            expanded={String(expandedVersion) === String(entry?.version)}
            onToggle={() => setExpandedVersion(
              String(expandedVersion) === String(entry?.version) ? null : entry?.version
            )}
          />
        ))}
      </div>
    </div>
  );
}

export { OrchestrationDeltaHistoryPanel };
