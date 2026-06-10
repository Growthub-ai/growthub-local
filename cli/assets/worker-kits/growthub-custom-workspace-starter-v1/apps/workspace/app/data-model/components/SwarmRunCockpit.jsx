"use client";

/**
 * SwarmRunCockpit — governed swarm run surface inside the Workspace Helper
 * sidecar (SWARM_RUN_CONTRACT_V1, Phase 4).
 *
 * Renders Running / Finished swarm runs as "Background tasks" using ONLY the
 * existing helper / tool-call / run-console grammar:
 *
 *   data lane:  sandbox-environment rows (findSwarmRunRows)
 *               → row.lastResponse + GET /api/workspace/sandbox-run history
 *               → deriveSwarmRunProjection (orchestration-run-console)
 *               → this component
 *
 *   execution:  POST /api/workspace/sandbox-run ONLY. The cockpit never
 *               mutates workspace config and never spawns its own runtime.
 *
 * Stop cancels the active client request only (no durable cancel primitive
 * exists). Clear hides finished cards from the local visible list only —
 * source-record history is never deleted from here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, Play, Square } from "lucide-react";
import {
  deriveSwarmRunProjection,
  formatRunDuration,
} from "@/lib/orchestration-run-console";
import { findSwarmRunRows } from "@/lib/workspace-swarm-proposal";

const RUN_POLL_MS = 3500;

function runKeyOf(objectId, name) {
  return `${objectId}::${name}`;
}

// "—" is the truthful placeholder for telemetry the adapter never reported.
function formatCount(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTokensLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return "— Tokens";
  return `${formatCount(value)} Tokens`;
}

function parseRowRecord(row) {
  const raw = row?.lastResponse;
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function dotVariantFor(status) {
  if (status === "completed") return "ok";
  if (status === "failed") return "fail";
  if (status === "running" || status === "executing" || status === "info") return "active";
  return "canceled";
}

export function SwarmAgentTranscript({ agent, onCollapse }) {
  if (!agent) return null;
  return (
    <div className="dm-swarm-transcript" data-swarm-transcript="">
      <div className="dm-swarm-transcript-head">
        <span className="dm-field-label">{agent.label}</span>
        {onCollapse && (
          <button type="button" className="dm-btn-ghost" onClick={onCollapse}>
            Hide transcript
          </button>
        )}
      </div>
      <pre className="dm-helper-toolcall-json dm-swarm-transcript-body">
        {agent.transcript || "(no output)"}
      </pre>
    </div>
  );
}

export function SwarmAgentRow({ agent, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`dm-swarm-agent-row${selected ? " is-selected" : ""}`}
      data-swarm-agent={agent.id}
      data-swarm-agent-status={agent.status}
      onClick={onSelect}
    >
      <span className="dm-swarm-agent-name">
        <span className="dm-run-console__tree-dot" data-variant={dotVariantFor(agent.status)} />
        {agent.label}
      </span>
      <span className="dm-swarm-agent-cell">{formatCount(agent.tokens)}</span>
      <span className="dm-swarm-agent-cell">{formatCount(agent.tools)}</span>
      <span className="dm-swarm-agent-cell">
        {agent.durationMs ? formatRunDuration(agent.durationMs) : "—"}
      </span>
    </button>
  );
}

export function SwarmPhaseGroup({ phase, expanded, onToggle, selectedAgentId, onSelectAgent, onExpandTranscript }) {
  const agents = Array.isArray(phase.agents) ? phase.agents : [];
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || null;
  return (
    <div className="dm-swarm-phase" data-swarm-phase={phase.id}>
      <button
        type="button"
        className="dm-swarm-phase-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="dm-swarm-phase-label">{phase.label}</span>
        {expanded
          ? <ChevronDown size={14} aria-hidden="true" />
          : <ChevronRight size={14} aria-hidden="true" />}
      </button>
      <div className="dm-swarm-dotstrip" aria-label={`${phase.label} agent states`}>
        {agents.map((agent) => (
          <span
            key={agent.id}
            className="dm-run-console__tree-dot"
            data-variant={dotVariantFor(agent.status)}
            title={`${agent.label} — ${agent.status}`}
          />
        ))}
      </div>
      {expanded && agents.length > 0 && (
        <div className="dm-swarm-agent-table">
          <div className="dm-swarm-agent-row dm-swarm-agent-header" aria-hidden="true">
            <span className="dm-swarm-agent-name">Agent</span>
            <span className="dm-swarm-agent-cell">Tokens</span>
            <span className="dm-swarm-agent-cell">Tools</span>
            <span className="dm-swarm-agent-cell">Time</span>
          </div>
          {agents.map((agent) => (
            <SwarmAgentRow
              key={agent.id}
              agent={agent}
              selected={agent.id === selectedAgentId}
              onSelect={() => onSelectAgent(agent.id === selectedAgentId ? null : agent.id)}
            />
          ))}
          {selectedAgent && (
            <>
              <SwarmAgentTranscript agent={selectedAgent} onCollapse={() => onSelectAgent(null)} />
              {onExpandTranscript && (
                <button
                  type="button"
                  className="dm-btn-ghost dm-swarm-transcript-expand"
                  onClick={() => onExpandTranscript(selectedAgent)}
                >
                  Expand
                  <ArrowUpRight size={12} aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SwarmRunCard({
  entry,
  projection,
  running,
  elapsedMs,
  onStop,
  onLaunch,
  launchDisabled,
  onExpandTranscript,
}) {
  const [expandedPhases, setExpandedPhases] = useState({});
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const phases = projection?.phases || [];
  const description = String(entry.row?.description || entry.row?.instructions || "").trim();
  const statusLabel = running
    ? formatRunDuration(elapsedMs)
    : projection
      ? projection.status === "completed" ? "Completed" : projection.status
      : "Not run yet";

  return (
    <div className="dm-helper-toolcall dm-swarm-card" data-swarm-run={entry.row.Name} data-swarm-running={running ? "true" : "false"}>
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={running ? "active" : projection ? dotVariantFor(projection.status) : "canceled"} />
        <span className="dm-swarm-card-title">{entry.row.Name}</span>
        {running ? (
          <button
            type="button"
            className="dm-btn-ghost dm-swarm-card-action"
            onClick={onStop}
            aria-label="Stop run"
            title="Stop — cancels the active request"
          >
            <Square size={12} aria-hidden="true" />
          </button>
        ) : onLaunch ? (
          <button
            type="button"
            className="dm-btn-ghost dm-swarm-card-action"
            onClick={onLaunch}
            disabled={launchDisabled}
            aria-label="Run swarm"
            title="Run through sandbox-run"
          >
            <Play size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="dm-swarm-card-meta">
        <span className="dm-swarm-card-kind">Workflow</span>
        <span>{statusLabel}</span>
      </div>
      {(projection || running) && (
        <div className="dm-swarm-card-meta">
          <span>{projection ? `${projection.agentCount} Agents` : "…"}</span>
          <span>{projection ? formatTokensLabel(projection.totalTokens) : "— Tokens"}</span>
        </div>
      )}
      {description && (
        <div className="dm-swarm-card-desc">{description}</div>
      )}
      {phases.length > 0 && (
        <div className="dm-swarm-phases">
          <span className="dm-field-label">Phases</span>
          {phases.map((phase) => (
            <SwarmPhaseGroup
              key={phase.id}
              phase={phase}
              expanded={!!expandedPhases[phase.id]}
              onToggle={() => setExpandedPhases((prev) => ({ ...prev, [phase.id]: !prev[phase.id] }))}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              onExpandTranscript={onExpandTranscript}
            />
          ))}
        </div>
      )}
      {!projection && !running && (
        <p className="dm-run-console__hint">
          Apply created this governed workflow row. Launch it to record the first run.
        </p>
      )}
    </div>
  );
}

export function SwarmRunList({
  workflows,
  runningKeys,
  elapsedByKey,
  projections,
  hiddenFinished,
  onStop,
  onLaunch,
  onClearFinished,
  onExpandTranscript,
}) {
  const running = workflows.filter((entry) => runningKeys.has(runKeyOf(entry.objectId, entry.row.Name)));
  const finished = workflows.filter((entry) => {
    const key = runKeyOf(entry.objectId, entry.row.Name);
    return !runningKeys.has(key) && !hiddenFinished.has(key);
  });

  return (
    <div className="dm-swarm-cockpit-list">
      {running.length > 0 && (
        <>
          <span className="dm-field-hint dm-swarm-section-label">Running</span>
          {running.map((entry) => {
            const key = runKeyOf(entry.objectId, entry.row.Name);
            return (
              <SwarmRunCard
                key={key}
                entry={entry}
                projection={projections.get(key) || null}
                running
                elapsedMs={elapsedByKey.get(key) || 0}
                onStop={() => onStop(entry)}
                onExpandTranscript={onExpandTranscript}
              />
            );
          })}
        </>
      )}

      <div className="dm-swarm-section-row">
        <span className="dm-field-hint dm-swarm-section-label">Finished</span>
        {finished.length > 0 && (
          <button type="button" className="dm-btn-ghost" onClick={onClearFinished} title="Hide finished cards from this list — run history stays in source records">
            Clear
          </button>
        )}
      </div>
      {finished.length === 0 && running.length === 0 && (
        <p className="dm-run-console__hint">
          No swarm runs yet. Use /swarm in the composer to propose one — apply
          creates the governed workflow row, then launch it from here.
        </p>
      )}
      {finished.map((entry) => {
        const key = runKeyOf(entry.objectId, entry.row.Name);
        return (
          <SwarmRunCard
            key={key}
            entry={entry}
            projection={projections.get(key) || null}
            running={false}
            elapsedMs={0}
            onLaunch={() => onLaunch(entry)}
            launchDisabled={runningKeys.size > 0}
            onExpandTranscript={onExpandTranscript}
          />
        );
      })}
    </div>
  );
}

export function SwarmRunCockpit({ workspaceConfig, focus, onConfigRefresh, onExpandTranscript }) {
  // Governed workflow rows — the ONLY data source besides run history.
  const workflows = useMemo(() => {
    const all = findSwarmRunRows(workspaceConfig);
    if (!focus) return all;
    const focused = all.filter(
      (entry) => entry.objectId === focus.objectId && String(entry.row?.Name || "") === String(focus.name || "")
    );
    // Focused entry first, everything else below — same list, same grammar.
    const rest = all.filter((entry) => !focused.includes(entry));
    return [...focused, ...rest];
  }, [workspaceConfig, focus]);

  // In-flight launches — client state only. Stop aborts the request.
  const [runningKeys, setRunningKeys] = useState(() => new Set());
  const [elapsedByKey, setElapsedByKey] = useState(() => new Map());
  const [hiddenFinished, setHiddenFinished] = useState(() => new Set());
  const [launchError, setLaunchError] = useState("");
  // Latest run record per workflow, sourced from source-record history so a
  // page refresh keeps runs visible. Falls back to row.lastResponse.
  const [historyByKey, setHistoryByKey] = useState(() => new Map());
  const controllersRef = useRef(new Map());
  const startedRef = useRef(new Map());

  const refreshHistory = useCallback(async (entries) => {
    const updates = [];
    await Promise.all(entries.map(async (entry) => {
      const key = runKeyOf(entry.objectId, entry.row.Name);
      try {
        const res = await fetch(
          `/api/workspace/sandbox-run?objectId=${encodeURIComponent(entry.objectId)}&name=${encodeURIComponent(entry.row.Name)}`
        );
        const data = await res.json();
        const latest = Array.isArray(data?.records) && data.records.length > 0 ? data.records[0] : null;
        if (latest) updates.push([key, latest]);
      } catch {
        // Non-fatal — row.lastResponse remains the fallback.
      }
    }));
    if (updates.length > 0) {
      setHistoryByKey((prev) => {
        const next = new Map(prev);
        for (const [key, record] of updates) next.set(key, record);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (workflows.length > 0) refreshHistory(workflows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows.length]);

  // Elapsed ticker + light polling while a run is in flight — same model as
  // OrchestrationRunTracePanel's live polling for active runs.
  useEffect(() => {
    if (runningKeys.size === 0) return undefined;
    const tick = setInterval(() => {
      setElapsedByKey(() => {
        const next = new Map();
        for (const [key, startedAt] of startedRef.current) {
          next.set(key, Date.now() - startedAt);
        }
        return next;
      });
    }, 1000);
    const poll = setInterval(() => {
      const active = workflows.filter((entry) => runningKeys.has(runKeyOf(entry.objectId, entry.row.Name)));
      if (active.length > 0) refreshHistory(active);
    }, RUN_POLL_MS);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [runningKeys, workflows, refreshHistory]);

  const projections = useMemo(() => {
    const map = new Map();
    for (const entry of workflows) {
      const key = runKeyOf(entry.objectId, entry.row.Name);
      const record = historyByKey.get(key) || parseRowRecord(entry.row);
      const projection = record ? deriveSwarmRunProjection(record) : null;
      if (projection) map.set(key, projection);
    }
    return map;
  }, [workflows, historyByKey]);

  const launch = useCallback(async (entry) => {
    const key = runKeyOf(entry.objectId, entry.row.Name);
    if (runningKeys.has(key)) return;
    setLaunchError("");
    const controller = new AbortController();
    controllersRef.current.set(key, controller);
    startedRef.current.set(key, Date.now());
    setRunningKeys((prev) => new Set(prev).add(key));
    setHiddenFinished((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    try {
      const res = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: entry.objectId, name: entry.row.Name }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok === false && data.error) setLaunchError(String(data.error));
    } catch (err) {
      if (err?.name !== "AbortError") setLaunchError(err?.message || "run failed");
    } finally {
      controllersRef.current.delete(key);
      startedRef.current.delete(key);
      setRunningKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      await refreshHistory([entry]);
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    }
  }, [runningKeys, refreshHistory, onConfigRefresh]);

  const stop = useCallback((entry) => {
    const key = runKeyOf(entry.objectId, entry.row.Name);
    const controller = controllersRef.current.get(key);
    if (controller) controller.abort();
  }, []);

  const clearFinished = useCallback(() => {
    setHiddenFinished(() => {
      const next = new Set();
      for (const entry of workflows) {
        const key = runKeyOf(entry.objectId, entry.row.Name);
        if (!runningKeys.has(key)) next.add(key);
      }
      return next;
    });
  }, [workflows, runningKeys]);

  return (
    <div className="dm-swarm-cockpit" data-swarm-cockpit="">
      {launchError && (
        <p className="dm-run-console__hint dm-swarm-launch-error" role="alert">{launchError}</p>
      )}
      <SwarmRunList
        workflows={workflows}
        runningKeys={runningKeys}
        elapsedByKey={elapsedByKey}
        projections={projections}
        hiddenFinished={hiddenFinished}
        onStop={stop}
        onLaunch={launch}
        onClearFinished={clearFinished}
        onExpandTranscript={onExpandTranscript}
      />
    </div>
  );
}
