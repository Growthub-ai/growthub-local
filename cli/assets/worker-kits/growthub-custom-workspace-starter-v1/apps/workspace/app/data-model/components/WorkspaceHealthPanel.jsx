"use client";

/**
 * Growthub Workspace Health & Agent Context V1 — read-only health panel.
 *
 * Surfaces the workspace health summary from `GET /api/workspace/health`:
 * the rolled-up status, the issue list (errors before warnings), and the
 * metrics readout. Each issue carries a deep link into the EXISTING surface
 * where it is fixed, so the panel is a self-contained closed loop:
 *
 *     check → see issues → open the fix surface → re-check → confirm resolved.
 *
 * Mounting status (V1):
 *   This component SHIPS with the worker kit but is NOT mounted by the
 *   existing builder / lens / data-model surfaces — identical to
 *   `WorkspaceGraphInspectorPanel`. Mounting is intentionally deferred so the
 *   V1 scope stays the typed projection + GET route + this read surface, and
 *   no shared navigation pattern is changed. Operators that want it now import
 *   it directly:
 *
 *     import { WorkspaceHealthPanel } from "@/app/data-model/components/WorkspaceHealthPanel.jsx";
 *
 * V1 invariants (inherited from the metadata graph layer):
 *   - Read-only. No edits, no deletes, no mutation calls.
 *   - No fetch of provider data — only `GET /api/workspace/health`.
 *   - No secrets rendered.
 *   - No new colors, icons, or globals.css grammar — semantic structure only,
 *     mirroring WorkspaceGraphInspectorPanel.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const STATUS_LABEL = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
};

const ISSUE_TYPE_LABEL = {
  stale_widget: "Stale widget",
  missing_source: "Missing source",
  dangling_edge: "Broken reference",
  unhealthy_pipeline: "Failing pipeline",
  untested_pipeline: "Untested pipeline",
};

const METRIC_LABEL = {
  totalObjects: "Objects",
  liveBackedObjects: "Live-backed objects",
  totalWidgets: "Widgets",
  staleWidgets: "Stale widgets",
  danglingEdges: "Broken references",
  missingSources: "Missing sources",
  totalWorkflows: "Workflows",
  totalDashboards: "Dashboards",
  totalSourceRecords: "Source records",
  unhealthyPipelines: "Failing pipelines",
  untestedPipelines: "Untested pipelines",
};

// Each issue links into the surface where it is resolved. These are EXISTING
// routes — no new navigation pattern is introduced. Unknown query params are
// inert in Next.js, so precise deep links never break a page.
function fixTargetFor(issue) {
  switch (issue?.type) {
    case "missing_source":
      return issue.objectId
        ? { href: `/data-model?object=${encodeURIComponent(issue.objectId)}`, label: "Open in Data Model" }
        : { href: "/data-model", label: "Open Data Model" };
    case "dangling_edge":
      return issue.ref?.objectId
        ? { href: `/data-model?object=${encodeURIComponent(issue.ref.objectId)}`, label: "Open in Data Model" }
        : { href: "/", label: "Open in Builder" };
    case "stale_widget":
      return { href: "/", label: "Open in Builder" };
    case "unhealthy_pipeline":
    case "untested_pipeline":
      return { href: "/workflows", label: "Open Workflows" };
    default:
      return { href: "/", label: "Open Builder" };
  }
}

function issueTypeLabel(type) {
  return ISSUE_TYPE_LABEL[type] || type;
}

function metricLabel(key) {
  return METRIC_LABEL[key] || key;
}

export function WorkspaceHealthPanel() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checkedAt, setCheckedAt] = useState("");

  const loadHealth = useCallback(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    fetch("/api/workspace/health")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((envelope) => {
        if (canceled) return;
        setHealth(envelope || null);
        setCheckedAt(new Date().toISOString());
      })
      .catch((err) => {
        if (canceled) return;
        setError(err?.message || "Failed to load workspace health");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }, []);

  useEffect(() => loadHealth(), [loadHealth]);

  const status = health?.status || "healthy";
  const issues = Array.isArray(health?.issues) ? health.issues : [];
  const metrics = health?.metrics && typeof health.metrics === "object" ? health.metrics : {};
  const warnings = Array.isArray(health?.warnings) ? health.warnings : [];
  const errorIssues = issues.filter((issue) => issue.severity === "error");
  const warningIssues = issues.filter((issue) => issue.severity !== "error");

  const renderIssue = (issue, index) => {
    const target = fixTargetFor(issue);
    const ref = issue.widgetId || issue.objectId || issue.workflow || issue.sourceId || "";
    return (
      <li key={`${issue.type}::${ref}::${index}`} className={`workspace-health-issue is-${issue.severity}`}>
        <div className="workspace-health-issue-head">
          <span className="workspace-health-issue-type">{issueTypeLabel(issue.type)}</span>
          <span className="workspace-health-issue-severity">{issue.severity}</span>
          {ref ? <span className="workspace-health-issue-ref">{ref}</span> : null}
        </div>
        <p className="workspace-health-issue-reason">{issue.reason}</p>
        <Link href={target.href} className="workspace-health-issue-fix">{target.label}</Link>
      </li>
    );
  };

  return (
    <div className="workspace-health" aria-label="Workspace health">
      <header className="workspace-health-header">
        <div>
          <h3>Workspace health</h3>
          <p className="workspace-health-subtitle">
            Read-only summary of stale widgets, missing sources, broken references, and pipeline state.
          </p>
        </div>
        <button
          type="button"
          className="workspace-health-recheck"
          onClick={loadHealth}
          disabled={loading}
        >
          {loading ? "Checking…" : "Re-check"}
        </button>
      </header>

      {error ? (
        <p className="workspace-health-error" role="alert">
          Could not load workspace health: {error}
        </p>
      ) : null}

      {loading && !health ? (
        <p className="workspace-health-loading">Checking workspace health…</p>
      ) : null}

      {health ? (
        <>
          <div className={`workspace-health-status is-${status}`}>
            <span className="workspace-health-status-label">Status</span>
            <strong className="workspace-health-status-value">{STATUS_LABEL[status] || status}</strong>
            <span className="workspace-health-status-count">
              {issues.length === 0
                ? "All checks passing"
                : `${errorIssues.length} error${errorIssues.length === 1 ? "" : "s"} · ${warningIssues.length} warning${warningIssues.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {issues.length === 0 ? (
            <p className="workspace-health-empty">
              No issues detected. Widgets, sources, references, and pipelines are consistent.
            </p>
          ) : (
            <div className="workspace-health-issues">
              {errorIssues.length ? (
                <section className="workspace-health-issue-group">
                  <h4>Errors ({errorIssues.length})</h4>
                  <ul>{errorIssues.map(renderIssue)}</ul>
                </section>
              ) : null}
              {warningIssues.length ? (
                <section className="workspace-health-issue-group">
                  <h4>Warnings ({warningIssues.length})</h4>
                  <ul>{warningIssues.map(renderIssue)}</ul>
                </section>
              ) : null}
            </div>
          )}

          <section className="workspace-health-metrics">
            <h4>Metrics</h4>
            <dl>
              {Object.entries(metrics)
                .filter(([key]) => key !== "status")
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{metricLabel(key)}</dt>
                    <dd>{value === null || value === "" ? "—" : String(value)}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {warnings.length ? (
            <section className="workspace-health-warnings" role="note">
              <h4>Read warnings ({warnings.length})</h4>
              <ul>
                {warnings.map((warning, index) => (
                  <li key={`warn::${index}`}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {checkedAt ? (
            <p className="workspace-health-checked-at">Last checked {checkedAt}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default WorkspaceHealthPanel;
