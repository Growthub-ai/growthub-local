"use client";

import { formatDuration, formatTokens } from "./swarm-format.js";

/**
 * 4-column agent row: Agent / Tokens / Tools / Time.
 * Missing values render blank (a running agent shows no tokens yet — never 0).
 * Click drills into the agent output panel.
 */
export function SwarmAgentRow({ agent, selected, onSelect }) {
  return (
    <tr
      className={`sw-agent-row${selected ? " sw-agent-row--selected" : ""}${agent.status === "running" ? " sw-agent-row--running" : ""}`}
      onClick={() => onSelect?.(agent)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect?.(agent);
      }}
    >
      <td className="sw-agent-row__label">{agent.label}</td>
      <td className="sw-agent-row__num">{formatTokens(agent.tokens)}</td>
      <td className="sw-agent-row__num">{Number.isFinite(agent.toolUses) ? agent.toolUses : ""}</td>
      <td className="sw-agent-row__num">{formatDuration(agent.durationMs)}</td>
    </tr>
  );
}

export function SwarmAgentTable({ agents, selectedAgentId, onSelect }) {
  return (
    <table className="sw-agent-table">
      <thead>
        <tr>
          <th>Agent</th>
          <th>Tokens</th>
          <th>Tools</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {(agents || []).map((agent) => (
          <SwarmAgentRow
            key={agent.id}
            agent={agent}
            selected={agent.id === selectedAgentId}
            onSelect={onSelect}
          />
        ))}
      </tbody>
    </table>
  );
}
