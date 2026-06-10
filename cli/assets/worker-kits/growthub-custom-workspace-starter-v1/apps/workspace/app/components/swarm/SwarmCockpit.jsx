"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SwarmRunCard } from "./SwarmRunCard.jsx";
import { SwarmAgentCard } from "./SwarmAgentCard.jsx";
import { SwarmRunChip } from "./SwarmRunChip.jsx";
import { SwarmStatusLine } from "./SwarmStatusLine.jsx";
import { CommandKPalette } from "./CommandKPalette.jsx";
import { useSwarmRuns, useSwarmRunStream } from "./useSwarmRunStream.js";
import { formatDuration, formatTokens } from "./swarm-format.js";

/**
 * Swarm cockpit — the Background-tasks surface.
 *
 * View modes (sidecar contract): docked (inline chip) → slideout (right-edge
 * drawer) → expanded (full takeover). Esc collapses one level. The drawer is
 * the screenshot 1:1: "Background tasks" header, Running / Finished sections
 * with Clear, run cards with phase dot-strips, agent tables, drill-in output
 * rendered inside the tool-output frame.
 */
export function SwarmCockpit() {
  const [viewMode, setViewMode] = useState("docked"); // docked | slideout | expanded
  const [drill, setDrill] = useState(null); // { runId, agentId, agentLabel }
  const [palette, setPalette] = useState({ open: false, mode: "command" });
  const [loops, setLoops] = useState([]);
  const [notice, setNotice] = useState("");

  const open = viewMode !== "docked";
  const { running, finished, refresh } = useSwarmRuns(true);
  const liveRun = useSwarmRunStream(running.find((run) => run.status === "running")?.runId || null);
  const drillRun = useSwarmRunStream(drill?.runId || null);

  const mergedRunning = useMemo(
    () => running.map((run) => (liveRun && run.runId === liveRun.runId ? { ...run, ...liveRun } : run)),
    [running, liveRun]
  );

  const refreshLoops = useCallback(() => {
    fetch("/api/workspace/swarm-workflows", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.ok) setLoops(payload.loops || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshLoops();
    const timer = setInterval(refreshLoops, 10_000);
    return () => clearInterval(timer);
  }, [refreshLoops]);

  // Global keys: Cmd/Ctrl-K palette, Esc collapses a level.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette({ open: true, mode: "command" });
        return;
      }
      if (event.key === "Escape" && !palette.open) {
        if (drill) setDrill(null);
        else if (viewMode === "expanded") setViewMode("slideout");
        else if (viewMode === "slideout") setViewMode("docked");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewMode, drill, palette.open]);

  const api = useCallback(async (url, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!payload?.ok) setNotice(payload?.error || "request failed");
    else setNotice("");
    return payload;
  }, []);

  const startRun = useCallback(async (run, { remember }) => {
    await api("/api/workspace/swarm-runs", {
      action: "start",
      runId: run.runId,
      approve: true,
      remember,
      approvedBy: "cockpit"
    });
    refresh();
  }, [api, refresh]);

  const stopRun = useCallback(async (run) => {
    await api(`/api/workspace/swarm-runs/${run.runId}`, { action: "stop" });
    refresh();
  }, [api, refresh]);

  const clearFinished = useCallback(async () => {
    await api("/api/workspace/swarm-runs", { action: "clear" });
    refresh();
  }, [api, refresh]);

  const invokeCommand = useCallback(async (command, args) => {
    setPalette({ open: false, mode: "command" });
    if (command.resolve === "navigate" && command.href) {
      window.location.href = command.href;
      return;
    }
    if (command.resolve === "read" && command.name === "workflows") {
      setViewMode((mode) => (mode === "docked" ? "slideout" : mode));
      return;
    }
    if (command.resolve === "proposal") {
      if (command.name === "loop") {
        const workflowName = (args || "").split(/\s+/)[0];
        const payload = await api("/api/workspace/swarm-workflows", { action: "loop.start", workflowName });
        if (payload?.ok) refreshLoops();
        return;
      }
      const workflowName = command.workflow?.name
        || (command.name === "swarm" ? (args || "").split(/\s+/)[0] : command.name);
      const payload = await api("/api/workspace/swarm-runs", {
        action: "propose",
        workflowName,
        description: command.name === "swarm" ? (args || "").split(/\s+/).slice(1).join(" ") : args,
        reviewedBy: "cockpit"
      });
      if (payload?.ok) {
        setViewMode((mode) => (mode === "docked" ? "slideout" : mode));
        refresh();
      }
    }
  }, [api, refresh, refreshLoops]);

  const openDrill = useCallback((run, agent) => {
    setDrill({ runId: run.runId, agentId: agent.id, agentLabel: agent.label });
  }, []);

  const drillAgent = useMemo(() => {
    if (!drill || !drillRun) return null;
    for (const phase of drillRun.phases || []) {
      const agent = (phase.agents || []).find((entry) => entry.id === drill.agentId);
      if (agent) return { ...agent, phaseLabel: phase.label };
    }
    return null;
  }, [drill, drillRun]);

  const latestChipRun = mergedRunning[0] || finished[0] || null;

  return (
    <>
      {/* Docked chip — bottom-right, opens the drawer. */}
      {viewMode === "docked" && (
        <div className="sw-dock">
          {latestChipRun && <SwarmRunChip run={latestChipRun} onOpen={() => setViewMode("slideout")} />}
          <button type="button" className="sw-dock__toggle" onClick={() => setViewMode("slideout")}>
            Background tasks
          </button>
          <SwarmStatusLine running={mergedRunning} finished={finished} loops={loops} />
        </div>
      )}

      {open && (
        <div className={`sw-drawer sw-drawer--${viewMode}`} role="dialog" aria-label="Background tasks">
          <div className="sw-drawer__head">
            <span className="sw-drawer__title">Background tasks</span>
            <div className="sw-drawer__actions">
              <button
                type="button"
                className="sw-drawer__btn"
                onClick={() => setViewMode(viewMode === "expanded" ? "slideout" : "expanded")}
                aria-label={viewMode === "expanded" ? "Collapse" : "Expand"}
              >
                {viewMode === "expanded" ? "⤡" : "⤢"}
              </button>
              <button type="button" className="sw-drawer__btn" onClick={() => setViewMode("docked")} aria-label="Close">
                ×
              </button>
            </div>
          </div>

          {notice && <div className="sw-notice">{notice}</div>}

          <div className="sw-drawer__body">
            {drill && drillAgent ? (
              <div className="sw-drill">
                <button type="button" className="sw-link" onClick={() => setDrill(null)}>
                  ‹ Back
                </button>
                <div className="sw-drill__head">
                  <span className="sw-drill__label">{drillAgent.label}</span>
                  <span className="sw-drill__meta">
                    {drillAgent.phaseLabel}
                    {drillAgent.tokens ? ` · ${formatTokens(drillAgent.tokens)} tokens` : ""}
                    {drillAgent.durationMs ? ` · ${formatDuration(drillAgent.durationMs)}` : ""}
                  </span>
                </div>
                <pre className="sw-output">{drillAgent.output || "(no output yet)"}</pre>
              </div>
            ) : (
              <>
                <div className="sw-section">
                  <div className="sw-section__head">
                    <span>Running</span>
                  </div>
                  {mergedRunning.length === 0 && <div className="sw-empty">No running tasks</div>}
                  {mergedRunning.map((run) => (
                    <SwarmRunCard
                      key={run.runId}
                      run={run}
                      onStop={stopRun}
                      onStart={startRun}
                      onSelectAgent={openDrill}
                      selectedAgentId={drill?.agentId}
                      defaultOpenPhases={viewMode === "expanded"}
                    />
                  ))}
                </div>

                <div className="sw-section">
                  <div className="sw-section__head">
                    <span>Finished</span>
                    {finished.length > 0 && (
                      <button type="button" className="sw-link" onClick={clearFinished}>
                        Clear
                      </button>
                    )}
                  </div>
                  {finished.length === 0 && <div className="sw-empty">Nothing finished yet</div>}
                  {finished.map((run) =>
                    run.runKind === "agent" && (run.phases || []).length <= 1 ? (
                      <SwarmAgentCard
                        key={run.runId}
                        run={run}
                        onViewTranscript={(target) => {
                          const firstAgent = (target.phases || [])[0]?.agents?.[0];
                          if (firstAgent) openDrill(target, firstAgent);
                        }}
                      />
                    ) : (
                      <SwarmRunCard
                        key={run.runId}
                        run={run}
                        onStop={stopRun}
                        onStart={startRun}
                        onSelectAgent={openDrill}
                        selectedAgentId={drill?.agentId}
                      />
                    )
                  )}
                </div>
              </>
            )}
          </div>

          <div className="sw-drawer__foot">
            <button type="button" className="sw-link" onClick={() => setPalette({ open: true, mode: "slash" })}>
              / commands
            </button>
            <SwarmStatusLine running={mergedRunning} finished={finished} loops={loops} />
          </div>
        </div>
      )}

      <CommandKPalette
        open={palette.open}
        mode={palette.mode}
        onClose={() => setPalette({ open: false, mode: "command" })}
        onInvoke={invokeCommand}
      />
    </>
  );
}
