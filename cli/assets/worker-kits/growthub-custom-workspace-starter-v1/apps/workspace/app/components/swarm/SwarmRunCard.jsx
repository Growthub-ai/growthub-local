"use client";

import { useState } from "react";
import { SwarmPhaseGroup } from "./SwarmPhaseGroup.jsx";
import { formatElapsedSince, formatTokens, runStatusLabel } from "./swarm-format.js";

/**
 * Run card — the Background-tasks workflow card:
 *   header: status dot · name · (stop ▢ while running / elapsed when finished)
 *   meta:   "Workflow 13s" · "16 Agents 244.5k Tokens"
 *   strip:  muted description
 *   body:   Phases — collapsible groups with dot strips and agent tables
 */
export function SwarmRunCard({ run, onStop, onStart, onSelectAgent, selectedAgentId, defaultOpenPhases = false }) {
  const [openPhases, setOpenPhases] = useState(() => new Set());
  const isRunning = run.status === "running";
  const isPending = run.status === "pending";
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
        <span className={`sw-dot sw-dot--${isRunning ? "running" : isPending ? "pending" : "done"}`} />
        <span className="sw-card__name">{run.name}</span>
        {isRunning && (
          <button type="button" className="sw-stop" aria-label="Stop run" onClick={() => onStop?.(run)}>
            <span className="sw-stop__square" />
          </button>
        )}
        {!isRunning && !isPending && <span className="sw-card__elapsed">{elapsed}</span>}
      </div>
      <div className="sw-card__meta">
        <span className="sw-card__kind">{run.runKind === "agent" ? "Agent" : "Workflow"}</span>
        <span className="sw-card__metaval">{isRunning ? elapsed : statusLabel}</span>
      </div>
      <div className="sw-card__meta">
        <span className="sw-card__metaval">{run.totals?.agents || 0} Agents</span>
        {run.totals?.tokens > 0 && <span className="sw-card__metaval">{formatTokens(run.totals.tokens)} Tokens</span>}
        {run.budget?.maxTokens != null && (
          <span className="sw-card__metaval sw-card__budget">
            budget {formatTokens(run.budget.spentTokens)}/{formatTokens(run.budget.maxTokens)}
          </span>
        )}
      </div>
      {run.description && <div className="sw-card__desc">{run.description}</div>}

      {isPending && (
        <div className="sw-card__approve">
          <button type="button" className="dm-btn-outline" onClick={() => onStart?.(run, { remember: false })}>
            Approve & start
          </button>
          <button type="button" className="dm-btn-ghost" onClick={() => onStart?.(run, { remember: true })}>
            Approve & remember
          </button>
        </div>
      )}

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

      {run.goal && (
        <div className={`sw-goal sw-goal--${run.goal.status}`}>
          <span className="sw-goal__mark">◎</span>
          <span>
            goal {run.goal.status}
            {run.goal.lastScore != null ? ` · ${run.goal.lastScore}` : ""}
          </span>
          {run.goal.lastReason && <span className="sw-goal__reason">{run.goal.lastReason}</span>}
        </div>
      )}
      {run.error && run.status === "error" && <div className="sw-card__error">{run.error}</div>}
    </div>
  );
}
