"use client";

import { useEffect, useState } from "react";

function DeployChecklistPanel({ onClose }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/deploy/status")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setState({ status: "ok", payload });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: "error", error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const checks = state.payload?.checks || [];
  const ready = checks.filter((check) => check.ok).length;
  const total = checks.length || 0;

  return (
    <div className="workspace-deploy-overlay" role="dialog" aria-modal="true">
      <div className="workspace-deploy-panel">
        <header>
          <strong>Deploy readiness</strong>
          <button type="button" onClick={onClose} aria-label="Close deploy panel">×</button>
        </header>
        {state.status === "loading" ? <p>Checking…</p> : null}
        {state.status === "error" ? <p className="workspace-error">Failed to read deploy status: {state.error}</p> : null}
        {state.status === "ok" ? (
          <>
            <p className="workspace-deploy-summary">
              <span className="workspace-deploy-count">{ready}/{total}</span>
              <span>checks ready</span>
            </p>
            <ul className="workspace-deploy-list">
              {checks.map((check) => (
                <li key={check.id} className={check.ok ? "ok" : "missing"}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                  {check.guidance ? <code>{check.guidance}</code> : null}
                </li>
              ))}
            </ul>
            {state.payload?.nextCommand ? (
              <p className="workspace-deploy-next">
                <span>Next command</span>
                <code>{state.payload.nextCommand}</code>
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default DeployChecklistPanel;
