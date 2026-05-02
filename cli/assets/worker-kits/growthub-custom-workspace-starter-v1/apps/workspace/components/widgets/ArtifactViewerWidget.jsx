"use client";

import { useEffect, useState } from "react";

function ArtifactViewerWidget({ widget }) {
  const [state, setState] = useState({ status: "idle", artifacts: [] });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/artifacts")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setState({
          status: payload.error ? "error" : "ok",
          artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
          source: payload.source,
          error: payload.error || null
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: "error", error: error.message, artifacts: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="widget-artifacts">
      <header className="widget-header">
        <span className="widget-kind">artifacts</span>
        <strong>{widget.title || "Outputs"}</strong>
      </header>
      {state.artifacts.length ? (
        <ul className="widget-artifact-list">
          {state.artifacts.slice(0, 6).map((artifact) => (
            <li key={artifact.id}>
              <strong>{artifact.title || artifact.id}</strong>
              <code>{artifact.kind || artifact.mimeType || "artifact"}</code>
              {artifact.source?.workflowId ? <span>{artifact.source.workflowId}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="widget-empty">
          <p>No artifacts yet. Run a workflow or connect the Growthub Bridge.</p>
        </div>
      )}
      {state.source ? <code className="widget-artifact-source">{state.source}</code> : null}
    </div>
  );
}

export default ArtifactViewerWidget;
