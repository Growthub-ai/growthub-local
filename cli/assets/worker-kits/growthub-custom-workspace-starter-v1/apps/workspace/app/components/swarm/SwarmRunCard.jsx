"use client";

import { useState } from "react";
import { SwarmPhaseGroup } from "./SwarmPhaseGroup.jsx";
import { formatElapsedSince, formatTokens, runStatusLabel } from "./swarm-format.js";

/**
 * Run card — the Background-tasks workflow card:
 *   header: status dot · name · elapsed
 *   meta:   "Workflow · Completed" · "16 Agents · 244.5k Tokens"
 *   strip:  muted description
 *   body:   Phases — collapsible groups with dot strips and agent tables
 *
 * Pure presentation over the existing sandbox-run record projection.
 */
export function SwarmRunCard({ run, onSelectAgent, selectedAgentId, defaultOpenPhases = false }) {
  const [openPhases, setOpenPhases] = useState(() => new Set());
  const isRunning = run.status === "running";
  const elapsed = formatElapsedSince(run.startedAt, run.finishedAt);
  const statusLabel = runStatusLabel(run.status);

  const togglePhase = (phaseId) => {
    setOpenPhases((current) => {
      const next = new Set(current);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  return (
    <div className={`sw-card sw-card--${run.status}`}>
      <div className="sw-card__head">
        <span className={`sw-dot sw-dot--${isRunning ? "running" : run.status === "error" ? "error" : "done"}`} />
        <span className="sw-card__name">{run.name}</span>
        {!isRunning && run.durationMs != null && (
          <span className="sw-card__elapsed">{elapsed}</span>
        )}
      </div>
      <div className="sw-card__meta">
        <span className="sw-card__kind">{run.runKind === "agent" ? "Agent" : "Workflow"}</span>
        <span className="sw-card__metaval">{isRunning ? "Running…" : statusLabel}</span>
      </div>
      {(run.totals?.agents || 0) > 0 && (
        <div className="sw-card__meta">
          <span className="sw-card__metaval">{run.totals.agents} Agents</span>
          {run.totals.tokens > 0 && <span className="sw-card__metaval">{formatTokens(run.totals.tokens)} Tokens</span>}
        </div>
      )}
      {run.description && <div className="sw-card__desc">{run.description}</div>}

      {(run.phases || []).length > 0 && (
        <div className="sw-card__phases">
          <div className="sw-card__phases-title">Phases</div>
          {run.phases.map((phase) => (
            <SwarmPhaseGroup
              key={phase.id}
              phase={phase}
              expanded={defaultOpenPhases || openPhases.has(phase.id)}
              onToggle={togglePhase}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(agent) => onSelectAgent?.(run, agent)}
            />
          ))}
        </div>
      )}

      {run.error && run.status === "error" && <div className="sw-card__error">{run.error}</div>}
    </div>
  );
}
