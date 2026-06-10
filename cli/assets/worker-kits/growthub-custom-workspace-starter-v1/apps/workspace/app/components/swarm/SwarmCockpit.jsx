"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SwarmRunCard } from "./SwarmRunCard.jsx";
import { SwarmStatusLine } from "./SwarmStatusLine.jsx";
import { CommandKPalette } from "./CommandKPalette.jsx";
import { useSwarmWorkspace } from "./useSwarmRunStream.js";
import { formatDuration, formatTokens } from "./swarm-format.js";

/**
 * Swarm cockpit — the Background-tasks surface, on EXISTING routes only.
 *
 * Network contract (hard rule, after the polling regression):
 *   - docked: ZERO requests
 *   - drawer open: one GET /api/workspace; explicit Refresh re-fetches
 *   - launch: one POST /api/workspace/sandbox-run (the existing governed
 *     runner) — the in-flight POST is the live "running" signal
 *
 * View modes: docked → slideout → expanded; Esc collapses a level.
 */
export function SwarmCockpit() {
  const [viewMode, setViewMode] = useState("docked"); // docked | slideout | expanded
  const [drill, setDrill] = useState(null); // { run, agent }
  const [palette, setPalette] = useState({ open: false, mode: "command" });

  const { runs, workflows, launches, error, loading, refresh, launch } = useSwarmWorkspace();
  const open = viewMode !== "docked";

  // One fetch when the drawer opens. Nothing while docked.
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

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

  const running = launches;
  const finished = runs;

  const invokeCommand = useCallback(async (command) => {
    setPalette({ open: false, mode: "command" });
    if (command.resolve === "navigate" && command.href) {
      window.location.href = command.href;
      return;
    }
    if (command.resolve === "launch" && command.workflow) {
      setViewMode((mode) => (mode === "docked" ? "slideout" : mode));
      await launch(command.workflow);
    }
  }, [launch]);

  const drillAgent = useMemo(() => {
    if (!drill) return null;
    return { ...drill.agent, phaseLabel: drill.phaseLabel || "" };
  }, [drill]);

  const openDrill = useCallback((run, agent) => {
    const phase = (run.phases || []).find((entry) => (entry.agents || []).some((a) => a.id === agent.id));
    setDrill({ run, agent, phaseLabel: phase?.label || "" });
  }, []);

  return (
    <>
      {viewMode === "docked" && (
        <div className="sw-dock">
          <button type="button" className="sw-dock__toggle" onClick={() => setViewMode("slideout")}>
            Background tasks
          </button>
        </div>
      )}

      {open && (
        <div className={`sw-drawer sw-drawer--${viewMode}`} role="dialog" aria-label="Background tasks">
          <div className="sw-drawer__head">
            <span className="sw-drawer__title">Background tasks</span>
            <div className="sw-drawer__actions">
              <button type="button" className="sw-drawer__btn" onClick={refresh} aria-label="Refresh" disabled={loading}>
                ↻
              </button>
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

          {error && <div className="sw-notice">{error}</div>}

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
                <pre className="sw-output">{drillAgent.output || "(no output recorded)"}</pre>
              </div>
            ) : (
              <>
                {workflows.length > 0 && (
                  <div className="sw-section">
                    <div className="sw-section__head">
                      <span>Workflows</span>
                    </div>
                    {workflows.map((workflow) => (
                      <div key={workflow.name} className="sw-workflow-row">
                        <span className="sw-workflow-row__name">{workflow.name}</span>
                        <button type="button" className="dm-btn-outline" onClick={() => launch(workflow)}>
                          Run
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="sw-section">
                  <div className="sw-section__head">
                    <span>Running</span>
                  </div>
                  {running.length === 0 && <div className="sw-empty">No running tasks</div>}
                  {running.map((run) => (
                    <SwarmRunCard key={run.runId} run={run} onSelectAgent={openDrill} selectedAgentId={drill?.agent?.id} />
                  ))}
                </div>

                <div className="sw-section">
                  <div className="sw-section__head">
                    <span>Finished</span>
                  </div>
                  {finished.length === 0 && <div className="sw-empty">{loading ? "Loading…" : "Nothing finished yet"}</div>}
                  {finished.map((run) => (
                    <SwarmRunCard
                      key={run.runId}
                      run={run}
                      onSelectAgent={openDrill}
                      selectedAgentId={drill?.agent?.id}
                      defaultOpenPhases={viewMode === "expanded"}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="sw-drawer__foot">
            <button type="button" className="sw-link" onClick={() => setPalette({ open: true, mode: "slash" })}>
              / commands
            </button>
            <SwarmStatusLine running={running} finished={finished} loops={[]} />
          </div>
        </div>
      )}

      <CommandKPalette
        open={palette.open}
        mode={palette.mode}
        workflows={workflows}
        onClose={() => setPalette({ open: false, mode: "command" })}
        onInvoke={invokeCommand}
      />
    </>
  );
}
