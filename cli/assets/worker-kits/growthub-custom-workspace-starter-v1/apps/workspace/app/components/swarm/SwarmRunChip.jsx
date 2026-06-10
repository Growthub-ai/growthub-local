"use client";

import { SwarmDotStrip } from "./SwarmDotStrip.jsx";
import { formatElapsedSince } from "./swarm-format.js";

/**
 * Compact inline chip — name, "Workflow · N Agents · 10s", mini dot strip, ›.
 * Click opens the run inside the Background-tasks drawer.
 */
export function SwarmRunChip({ run, onOpen }) {
  const agents = (run.phases || []).flatMap((phase) => phase.agents || []);
  return (
    <button type="button" className="sw-chip" onClick={() => onOpen?.(run)}>
      <span className="sw-chip__row">
        <span className="sw-chip__name">{run.name}</span>
        <span className="sw-chip__chevron">›</span>
      </span>
      <span className="sw-chip__meta">
        {run.runKind === "agent" ? "Agent" : "Workflow"}
        <span>{run.totals?.agents || 0} Agents</span>
        <span>{formatElapsedSince(run.startedAt, run.finishedAt)}</span>
      </span>
      <SwarmDotStrip agents={agents} />
    </button>
  );
}
