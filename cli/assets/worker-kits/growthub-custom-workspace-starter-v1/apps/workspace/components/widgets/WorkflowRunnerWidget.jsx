"use client";

import { useEffect, useState } from "react";

function WorkflowRunnerWidget({ widget }) {
  const workflowId = widget.config?.workflowId;
  const [state, setState] = useState({ status: "idle", workflow: null });
  const [runState, setRunState] = useState({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/workflows${workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : ""}`)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        const workflow = payload.workflows?.find((item) => item.id === workflowId)
          || payload.workflows?.[0]
          || null;
        setState({ status: "ok", workflow, source: payload.source, mode: payload.mode });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: "error", error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  async function handleRun() {
    if (!state.workflow) return;
    setRunState({ status: "running" });
    try {
      const response = await fetch("/api/workspace/workflows/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowId: state.workflow.id })
      });
      const payload = await response.json();
      setRunState({ status: response.ok ? "ok" : "error", payload });
    } catch (error) {
      setRunState({ status: "error", error: error.message });
    }
  }

  return (
    <div className="widget-workflow">
      <header className="widget-header">
        <span className="widget-kind">workflow</span>
        <strong>{widget.title || "Workflow runner"}</strong>
      </header>
      {state.workflow ? (
        <div className="widget-workflow-body">
          <p className="widget-workflow-id"><code>{state.workflow.id}</code></p>
          {state.workflow.description ? <p>{state.workflow.description}</p> : null}
          <button type="button" onClick={handleRun} disabled={runState.status === "running"}>
            {runState.status === "running" ? "Running..." : "Validate / dry-run"}
          </button>
          {runState.status !== "idle" ? (
            <p className="widget-workflow-result">
              <code>{runState.payload?.executionMode || runState.status}</code>
              <span>{runState.payload?.message || runState.error || "ok"}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="widget-empty">
          <p>
            No workflow configured. Set <code>config.workflowId</code> or pick one from
            <code> /api/workspace/workflows</code>.
          </p>
        </div>
      )}
    </div>
  );
}

export default WorkflowRunnerWidget;
