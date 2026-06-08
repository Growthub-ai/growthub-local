"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, GitBranch, History } from "lucide-react";
import {
  summarizeOrchestrationDeltas,
  collectDeltaTags,
  filterDeltasByTag,
} from "@/lib/workspace-orchestration-deltas";

/**
 * Workflow Delta History panel — roadmap Phase 1.5 / 2.4.
 *
 * Read-only timeline of `sandboxRow.orchestrationDeltas[]`, the changelog that
 * publishGraph already writes but nothing rendered. Mirrors the run-trace
 * panel's chrome (back affordance, dm-run-console__* sections) so it slots into
 * the same sidecar surface. Tag chips reuse the publish-time deltaTags
 * (model / prompt / routing / guardrail …) as a Twenty-style filter.
 */
function formatTimestamp(iso) {
  const text = String(iso || "").trim();
  if (!text) return "—";
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return text;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return text;
  }
}

export function WorkflowDeltaHistoryPanel({ row, onBack, onOpenGraph }) {
  const [activeTag, setActiveTag] = useState("");
  const summaries = useMemo(() => summarizeOrchestrationDeltas(row?.orchestrationDeltas), [row?.orchestrationDeltas]);
  const tags = useMemo(() => collectDeltaTags(summaries), [summaries]);
  const visible = useMemo(() => filterDeltasByTag(summaries, activeTag), [summaries, activeTag]);

  return (
    <div className="dm-run-console">
      <div className="dm-run-console__head">
        <button type="button" className="dm-workflow-chip-btn" onClick={onBack}>
          <ArrowLeft size={13} /> Back
        </button>
        <span className="dm-run-console__title">
          <History size={14} /> Publish history
        </span>
        {onOpenGraph && (
          <button type="button" className="dm-workflow-chip-btn" onClick={onOpenGraph}>
            Edit graph
          </button>
        )}
      </div>

      {summaries.length === 0 ? (
        <p className="dm-workflow-empty">
          No publish history yet. Each successful publish appends a versioned delta here.
        </p>
      ) : (
        <>
          {tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0 10px" }}>
              <button
                type="button"
                className={`dm-workflow-chip-btn${activeTag === "" ? " dm-chip-active" : ""}`}
                style={{ padding: "2px 10px", borderRadius: 999, fontSize: 11 }}
                onClick={() => setActiveTag("")}
              >
                All
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`dm-workflow-chip-btn${activeTag === tag ? " dm-chip-active" : ""}`}
                  style={{ padding: "2px 10px", borderRadius: 999, fontSize: 11 }}
                  onClick={() => setActiveTag(activeTag === tag ? "" : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <ol className="dm-run-console__lifecycle" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visible.map((delta) => (
              <li key={`${delta.version}-${delta.at}`} className="dm-run-console__section" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <GitBranch size={13} /> v{delta.version}
                    {delta.previousVersion ? (
                      <span className="dm-run-console__lifecycle-dur">from v{delta.previousVersion}</span>
                    ) : null}
                  </strong>
                  <span className="dm-run-console__lifecycle-at">{formatTimestamp(delta.at)}</span>
                </div>

                {delta.changeReason ? <p style={{ margin: "4px 0" }}>{delta.changeReason}</p> : null}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "4px 0" }}>
                  {delta.deltaTags.map((tag) => (
                    <span
                      key={tag}
                      className="dm-workflow-chip-btn"
                      style={{ padding: "1px 8px", borderRadius: 999, fontSize: 10, cursor: "default" }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="dm-run-console__lifecycle-dur" style={{ marginBottom: 4 }}>
                  {delta.nodeCount} node{delta.nodeCount === 1 ? "" : "s"} · {delta.edgeCount} edge{delta.edgeCount === 1 ? "" : "s"}
                  {delta.draftRunId ? ` · tested run ${delta.draftRunId.slice(0, 8)}` : ""}
                </div>

                {delta.nodeDeltas.length > 0 && (
                  <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                    {delta.nodeDeltas.map((node) => (
                      <li key={node.nodeId} className="dm-run-console__lifecycle-dur" style={{ listStyle: "disc" }}>
                        <span>{node.isNew ? "added " : "changed "}</span>
                        <strong>{node.label}</strong>
                        {node.changeReason ? <span> — {node.changeReason}</span> : null}
                        {node.deltaTags.length ? <span> [{node.deltaTags.join(", ")}]</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
