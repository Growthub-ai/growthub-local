"use client";

import { SwarmDotStrip } from "./SwarmDotStrip.jsx";
import { SwarmAgentTable } from "./SwarmAgentRow.jsx";

/**
 * Collapsible phase row: label + chevron, dot strip underneath, and the
 * Agent/Tokens/Tools/Time table when expanded.
 */
export function SwarmPhaseGroup({ phase, expanded, onToggle, selectedAgentId, onSelectAgent }) {
  return (
    <div className={`sw-phase${expanded ? " sw-phase--open" : ""}`}>
      <button type="button" className="sw-phase__head" onClick={() => onToggle?.(phase.id)}>
        <span className="sw-phase__label">{phase.label}</span>
        <span className="sw-phase__chevron">{expanded ? "⌄" : "›"}</span>
      </button>
      <div className="sw-phase__dots">
        <SwarmDotStrip agents={phase.agents} />
      </div>
      {expanded && (phase.agents || []).length > 0 && (
        <SwarmAgentTable
          agents={phase.agents}
          selectedAgentId={selectedAgentId}
          onSelect={onSelectAgent}
        />
      )}
    </div>
  );
}
