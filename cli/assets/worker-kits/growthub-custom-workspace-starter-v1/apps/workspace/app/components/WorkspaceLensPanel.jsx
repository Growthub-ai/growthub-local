"use client";

/**
 * WorkspaceLensPanel — the post-activation operating surface.
 *
 * Workspace Lens is NOT onboarding. It is the ongoing, minimal, filterable,
 * agent-assignable stream of derived workspace state that the user unlocks
 * after completing setup. It renders the secondary lenses from
 * `deriveWorkspaceState` as aggregate-first cards (summaries + next action +
 * drill-down), never raw records, and keeps the human view aligned with the
 * machine `deriveSwarmConditionPacket` packet.
 *
 * Invariants (inherited from the lens layer):
 *   - Pure derivation in. No mutation, no secrets in the output.
 *   - Aggregate-first: one card per lens. Detail rows live in Data Model /
 *     run console / dashboards — this surface shows the causal summary.
 *   - Neutral, calm presentation: gray scale, collapsed by default, no
 *     semantic color overload, no icon spam.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { deriveWorkspaceState, deriveSwarmConditionPacket } from "@/lib/workspace-activation";

// Lens state → a single neutral status word the whole surface filters on.
function lensStatusKind(lens) {
  if (lens.complete) return "ready";
  if ((lens.steps || []).some((s) => s.status === "blocked")) return "blocked";
  return "pending";
}

const STATUS_LABEL = { ready: "Ready", blocked: "Blocked", pending: "In progress" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "blocked", label: "Blocked" },
  { id: "ready", label: "Ready" },
  { id: "assignable", label: "Agent-assignable" },
  { id: "persistence", label: "Persistence" },
  { id: "observability", label: "Runs" },
  { id: "deploy", label: "Deploy" },
  { id: "tasks", label: "Tasks" },
  { id: "app-build", label: "App build" },
];

export function WorkspaceLensPanel({ workspaceConfig, workspaceSourceRecords, metadataGraph }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);

  const composed = useMemo(
    () => deriveWorkspaceState({ workspaceConfig, workspaceSourceRecords, metadataGraph }),
    [workspaceConfig, workspaceSourceRecords, metadataGraph],
  );
  const lenses = useMemo(() => Object.values(composed.lenses || {}), [composed]);

  const counts = useMemo(() => {
    let ready = 0; let blocked = 0; let assignable = 0;
    for (const lens of lenses) {
      const kind = lensStatusKind(lens);
      if (kind === "ready") ready += 1;
      if (kind === "blocked") blocked += 1;
      if (!lens.complete && lens.nextStepId) assignable += 1;
    }
    return { total: lenses.length, ready, blocked, assignable };
  }, [lenses]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lenses.filter((lens) => {
      const kind = lensStatusKind(lens);
      if (filter === "blocked" && kind !== "blocked") return false;
      if (filter === "ready" && kind !== "ready") return false;
      if (filter === "assignable" && (lens.complete || !lens.nextStepId)) return false;
      if (["persistence", "observability", "deploy", "tasks", "app-build"].includes(filter) && lens.lensId !== filter) return false;
      if (q) {
        const hay = `${lens.title} ${lens.headline} ${(lens.steps || []).map((s) => s.label).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lenses, filter, query]);

  return (
    <div className="workspace-lens">
      <header className="workspace-lens-head">
        <div>
          <h1 className="workspace-lens-title">Workspace Lens</h1>
          <p className="workspace-lens-subtitle">Live derived state for this workspace.</p>
        </div>
        <p className="workspace-lens-score" aria-label="Workspace lens summary">
          {counts.total} lenses · {counts.ready} ready · {counts.blocked} blocked · {counts.assignable} agent-assignable
        </p>
      </header>

      <div className="workspace-lens-controls">
        <div className="workspace-lens-filters" role="tablist" aria-label="Filter lenses">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={"workspace-lens-filter" + (filter === f.id ? " is-active" : "")}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="workspace-lens-search"
          placeholder="Search lenses, workflows, objects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search lenses"
        />
      </div>

      <ul className="workspace-lens-stream" role="list">
        {visible.map((lens) => {
          const kind = lensStatusKind(lens);
          const next = (lens.steps || []).find((s) => s.id === lens.nextStepId) || null;
          const blockedStep = (lens.steps || []).find((s) => s.status === "blocked") || null;
          const isOpen = expanded === lens.lensId;
          const packet = isOpen
            ? deriveSwarmConditionPacket({ workspaceConfig, workspaceSourceRecords, metadataGraph }, { lensId: lens.lensId })
            : null;
          return (
            <li key={lens.lensId} className={"workspace-lens-card is-" + kind} data-lens={lens.lensId}>
              <button
                type="button"
                className="workspace-lens-card-head"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : lens.lensId)}
              >
                <span className="workspace-lens-card-title">{lens.title}</span>
                <span className={"workspace-lens-chip is-" + kind}>{STATUS_LABEL[kind]}</span>
                <span className="workspace-lens-card-progress">{lens.completedCount}/{lens.totalCount}</span>
                <ChevronDown
                  size={14}
                  className={"workspace-lens-caret" + (isOpen ? " is-open" : "")}
                  aria-hidden="true"
                />
              </button>
              <p className="workspace-lens-card-headline">{lens.headline}</p>
              {!lens.complete && next ? (
                <div className="workspace-lens-card-next">
                  <span className="workspace-lens-next-label">Next:</span>
                  {next.href ? (
                    <Link href={next.href} className="workspace-lens-next-link">{next.cta || next.label}</Link>
                  ) : (
                    <span>{next.label}</span>
                  )}
                </div>
              ) : null}

              {isOpen ? (
                <div className="workspace-lens-card-detail">
                  <ol className="workspace-lens-steps" role="list">
                    {(lens.steps || []).map((s) => (
                      <li key={s.id} className={"workspace-lens-step is-" + s.status}>
                        <span className="workspace-lens-step-label">{s.label}</span>
                        <span className="workspace-lens-step-status">{s.status}</span>
                        {s.hint ? <span className="workspace-lens-step-hint">{s.hint}</span> : null}
                      </li>
                    ))}
                  </ol>
                  {blockedStep ? (
                    <p className="workspace-lens-blocked">Blocked: {blockedStep.label}</p>
                  ) : null}
                  {packet ? (
                    <div className="workspace-lens-agent">
                      <p className="workspace-lens-agent-title">
                        {lens.complete ? "Agent condition (resolved)" : "Assignable to an agent"}
                      </p>
                      <p className="workspace-lens-agent-row"><span>Goal</span>{packet.goal}</p>
                      <p className="workspace-lens-agent-row"><span>State</span>{packet.currentState}</p>
                      {packet.prerequisite ? (
                        <p className="workspace-lens-agent-row"><span>Prerequisite</span>{packet.prerequisite}</p>
                      ) : null}
                      <p className="workspace-lens-agent-row"><span>Tools</span>{packet.availableTools.join(" · ")}</p>
                      <p className="workspace-lens-agent-row"><span>Evidence</span>{packet.expectedEvidence.join(" · ")}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="workspace-lens-empty">No lenses match this filter.</li>
        ) : null}
      </ul>
    </div>
  );
}
