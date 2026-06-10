"use client";

/**
 * SwarmRunCockpit — governed swarm run surface inside the Workspace Helper
 * sidecar (SWARM_RUN_CONTRACT_V1, Phases 4 + 7, parity P1–P5).
 *
 * Renders Running / Finished swarm runs as "Background tasks" using ONLY the
 * existing helper / tool-call / run-console grammar:
 *
 *   data lane:  sandbox-environment rows (findSwarmRunRows)
 *               → declared-phase skeleton from the row's graph
 *                 (deriveSwarmGraphProjection — renders BEFORE any run)
 *               → row.lastResponse + GET /api/workspace/sandbox-run history
 *                 (deriveSwarmRunProjection — the source of truth)
 *
 *   execution:  POST /api/workspace/sandbox-run ONLY (the existing route —
 *               nothing new). While the request is in flight the card shows
 *               the declared skeleton with pending dots and a truthful
 *               elapsed ticker; history polling converges on the persisted
 *               record. The cockpit never mutates workspace config and
 *               never spawns its own runtime.
 *
 * Truthful telemetry: pending/running cells render BLANK; "—" is reserved
 * for terminal agents whose adapter never reported a count. No estimates,
 * no null-to-zero coercion.
 *
 * Stop cancels the active client request only (no durable cancel primitive
 * exists). Clear hides finished cards from the local visible list only —
 * source-record history is never deleted from here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Icon set is strictly inherited grammar: ArrowUpRight/ChevronDown/
// ChevronRight from HelperSidecar, Play/Square from the existing
// run-console surfaces (OrchestrationRunTracePanel, SandboxRunPanel).
import { ArrowUpRight, ChevronDown, ChevronRight, Play, Square } from "lucide-react";
import {
  deriveSwarmDeltaProjection,
  deriveSwarmGraphProjection,
  deriveSwarmRunProjection,
  formatCompactRunDuration,
} from "@/lib/orchestration-run-console";
import {
  deriveHelperWidgetCausationState,
  deriveSwarmWorkflowExecutionEligibility,
  findSwarmRunRows,
} from "@/lib/workspace-swarm-proposal";

const RUN_POLL_MS = 3500;

function runKeyOf(objectId, name) {
  return `${objectId}::${name}`;
}

// Truthful display: pending/running agents show BLANK cells (the run has
// not reported yet); terminal agents with null telemetry show "—" (ran,
// never reported). Reported numbers are k-formatted (16.3k).
function formatCount(value, pending) {
  if (pending) return "";
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTokensLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return "— Tokens";
  return `${formatCount(value, false)} Tokens`;
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

// Dot tri-state (+failure): hollow = pending, blue = active, filled green =
// done, red = failed, solid grey = canceled/unknown.
function dotVariantFor(status) {
  if (status === "pending") return "pending";
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
        <span className="dm-helper-toolcall-title">{agent.label}</span>
        {onCollapse && (
          <button type="button" className="dm-btn-ghost" onClick={onCollapse}>
            Hide transcript
          </button>
        )}
      </div>
      <pre className="dm-helper-toolcall-json">
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
      <span className="dm-swarm-agent-cell dm-run-console__hint">{formatCount(agent.tokens, agent.pending)}</span>
      <span className="dm-swarm-agent-cell dm-run-console__hint">{formatCount(agent.tools, agent.pending)}</span>
      <span className="dm-swarm-agent-cell dm-run-console__hint">
        {agent.pending ? "" : agent.durationMs ? formatCompactRunDuration(agent.durationMs) : "—"}
      </span>
    </button>
  );
}

export function SwarmPhaseGroup({ phase, expanded, onToggle, selectedAgentId, onSelectAgent, onExpandTranscript }) {
  const agents = Array.isArray(phase.agents) ? phase.agents : [];
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || null;
  return (
    <div className="dm-helper-toolcall dm-swarm-phase" data-swarm-phase={phase.id}>
      <button
        type="button"
        className="dm-helper-toolcall-row dm-swarm-phase-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="dm-helper-toolcall-title">{phase.label}</span>
        {expanded
          ? <ChevronDown size={14} className="dm-helper-toolcall-chevron" aria-hidden="true" />
          : <ChevronRight size={14} className="dm-helper-toolcall-chevron" aria-hidden="true" />}
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
        <div className="dm-helper-toolcall-body dm-swarm-agent-table">
          <div className="dm-swarm-agent-row dm-swarm-agent-header" aria-hidden="true">
            <span className="dm-swarm-agent-name dm-run-console__hint">Agent</span>
            <span className="dm-swarm-agent-cell dm-run-console__hint">Tokens</span>
            <span className="dm-swarm-agent-cell dm-run-console__hint">Tools</span>
            <span className="dm-swarm-agent-cell dm-run-console__hint">Time</span>
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
  eligibility,
  helperWidgetState,
  onStop,
  onLaunch,
  launchDisabled,
  onExpandTranscript,
}) {
  const [expandedPhases, setExpandedPhases] = useState({});
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const phases = projection?.phases || [];
  const description = String(entry.row?.description || entry.row?.instructions || "").trim();
  const neverRun = !running && projection?.status === "pending";
  const finished = !running && projection && projection.status !== "pending";
  const ready = eligibility?.ready !== false && helperWidgetState?.ready !== false;
  const blockedGuidance = helperWidgetState?.ready === false
    ? helperWidgetState.guidance
    : eligibility?.guidance;
  const statusLabel = running
    ? formatCompactRunDuration(elapsedMs)
    : neverRun
      ? "Not run yet"
      : projection
        ? projection.status === "completed" ? "Completed" : projection.status
        : "Not run yet";

  return (
    <div className="dm-helper-toolcall dm-swarm-card" data-swarm-run={entry.row.Name} data-swarm-running={running ? "true" : "false"}>
      <div className="dm-swarm-card-head">
        <span
          className="dm-run-console__tree-dot"
          data-variant={running ? "active" : neverRun ? "pending" : projection ? dotVariantFor(projection.status) : "pending"}
        />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{entry.row.Name}</span>
        {finished && (
          <span className="dm-run-console__hint" data-swarm-total-duration="">
            {formatCompactRunDuration(projection.elapsedMs)}
          </span>
        )}
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
            disabled={launchDisabled || !ready}
            aria-label="Run swarm"
            title={ready ? "Run through sandbox-run" : blockedGuidance || "Execution target is not ready"}
          >
            <Play size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint dm-swarm-card-kind">Workflow</span>
        <span className="dm-run-console__hint">{statusLabel}</span>
      </div>
      {projection && (
        <div className="dm-swarm-card-meta">
          <span className="dm-run-console__hint">{`${projection.agentCount} Agents`}</span>
          <span className="dm-run-console__hint">{formatTokensLabel(projection.totalTokens)}</span>
          {eligibility && (
            <span className="dm-run-console__hint">
              {eligibility.ready ? `${eligibility.adapter}${eligibility.agentHost ? ` · ${eligibility.agentHost}` : ""}` : "Execution target needed"}
            </span>
          )}
        </div>
      )}
      {!ready && (
        <div className="dm-helper-error" role="status">
          <span>{blockedGuidance || "Execution target is not ready."}</span>
        </div>
      )}
      {ready && neverRun && (
        <div className="dm-helper-stream dm-swarm-card-desc">
          {eligibility.guidance}
        </div>
      )}
      {description && (
        <div className="dm-helper-stream dm-swarm-card-desc">{description}</div>
      )}
      {phases.length > 0 && (
        <div className="dm-swarm-phases">
          <span className="dm-helper-toolcall-title">Phases</span>
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
  helperWidgetState,
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
          <span className="dm-run-console__hint">Running</span>
          {running.map((entry) => {
            const key = runKeyOf(entry.objectId, entry.row.Name);
            return (
              <SwarmRunCard
                key={key}
                entry={entry}
                projection={projections.get(key) || null}
                running
                elapsedMs={elapsedByKey.get(key) || 0}
                eligibility={deriveSwarmWorkflowExecutionEligibility(entry)}
                helperWidgetState={helperWidgetState}
                onStop={() => onStop(entry)}
                onExpandTranscript={onExpandTranscript}
              />
            );
          })}
        </>
      )}

      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">Finished</span>
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
            eligibility={deriveSwarmWorkflowExecutionEligibility(entry)}
            helperWidgetState={helperWidgetState}
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
  const helperWidgetState = useMemo(
    () => deriveHelperWidgetCausationState(workspaceConfig),
    [workspaceConfig]
  );

  // Governed workflow rows — the ONLY data source besides run history.
  const workflows = useMemo(() => {
    const all = findSwarmRunRows(workspaceConfig);
    if (!focus) return all;
    const focused = all.filter(
      (entry) => entry.objectId === focus.objectId && String(entry.row?.Name || "") === String(focus.name || "")
    );
    // Tool-output Open is thread-bounded: render only the targeted swarm workflow row.
    return focused;
  }, [workspaceConfig, focus]);

  // In-flight launches — client state only. Stop aborts the request.
  const [runningKeys, setRunningKeys] = useState(() => new Set());
  const [elapsedByKey, setElapsedByKey] = useState(() => new Map());
  const [hiddenFinished, setHiddenFinished] = useState(() => new Set());
  const [launchError, setLaunchError] = useState("");
  const [liveEventsByKey, setLiveEventsByKey] = useState(() => new Map());
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

  // Elapsed ticker + light history polling while a run is in flight — the
  // poll stays as the convergence/fallback path even when streaming.
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
      const skeleton = deriveSwarmGraphProjection(entry.graph, { title: entry.row.Name });
      if (runningKeys.has(key)) {
        const elapsedMs = elapsedByKey.get(key) || 0;
        const liveProjection = deriveSwarmDeltaProjection(entry.graph, liveEventsByKey.get(key) || [], {
          title: entry.row.Name,
          elapsedMs
        });
        // Mid-run: live deltas hydrate the same projection shape as persisted
        // history. If the browser misses a chunk, the skeleton and polling
        // fallback still keep the card truthful until the final record lands.
        if (liveProjection) map.set(key, liveProjection);
        else if (skeleton) map.set(key, { ...skeleton, status: "running", elapsedMs });
        continue;
      }
      const record = historyByKey.get(key) || parseRowRecord(entry.row);
      const projection = record ? deriveSwarmRunProjection(record) : null;
      // Never-run rows show the full declared phase skeleton upfront (P1).
      if (projection) map.set(key, projection);
      else if (skeleton) map.set(key, skeleton);
    }
    return map;
  }, [workflows, historyByKey, runningKeys, elapsedByKey, liveEventsByKey]);

  const appendLiveEvent = useCallback((key, event) => {
    if (!event || typeof event !== "object") return;
    if (event.kind !== "growthub-sandbox-run-delta-v1") return;
    setLiveEventsByKey((prev) => {
      const next = new Map(prev);
      const prior = next.get(key) || [];
      next.set(key, [...prior, event].slice(-200));
      return next;
    });
  }, []);

  const readRunStream = useCallback(async ({ response, key }) => {
    if (!response.body || typeof response.body.getReader !== "function") {
      return response.json().catch(() => null);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPayload = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          appendLiveEvent(key, event);
          if (event.type === "sandbox-run.final") finalPayload = event.payload || null;
        } catch {
          // Ignore malformed cosmetic chunks; the final persisted record is
          // still fetched below.
        }
      }
    }
    const tail = buffer.trim();
    if (tail) {
      try {
        const event = JSON.parse(tail);
        appendLiveEvent(key, event);
        if (event.type === "sandbox-run.final") finalPayload = event.payload || null;
      } catch {
        // Non-fatal.
      }
    }
    return finalPayload;
  }, [appendLiveEvent]);

  const launch = useCallback(async (entry) => {
    const key = runKeyOf(entry.objectId, entry.row.Name);
    if (runningKeys.has(key)) return;
    setLaunchError("");
    const controller = new AbortController();
    controllersRef.current.set(key, controller);
    startedRef.current.set(key, Date.now());
    setRunningKeys((prev) => new Set(prev).add(key));
    setLiveEventsByKey((prev) => {
      const next = new Map(prev);
      next.set(key, []);
      return next;
    });
    setHiddenFinished((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    try {
      const res = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ objectId: entry.objectId, name: entry.row.Name, stream: true }),
        signal: controller.signal,
      });
      const data = await readRunStream({ response: res, key });
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
      // The persisted record is the source of truth — converge on it.
      await refreshHistory([entry]);
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    }
  }, [runningKeys, refreshHistory, onConfigRefresh, readRunStream]);

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
        <div className="dm-helper-error" role="alert">
          <span>{launchError}</span>
        </div>
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
        helperWidgetState={helperWidgetState}
      />
    </div>
  );
}
