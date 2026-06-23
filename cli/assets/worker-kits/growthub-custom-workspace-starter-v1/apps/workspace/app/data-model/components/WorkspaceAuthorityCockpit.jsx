"use client";

/**
 * WorkspaceAuthorityCockpit — the ONE governed "is this workspace safe,
 * healthy, understandable, and governed enough for agents to act?" surface
 * inside the Workspace Helper sidecar (Workspace Authority Intelligence V1).
 *
 * This is the convergence of the two formerly-separate cockpits:
 *   - the workspace health / agent context projection (#250), and
 *   - the governance causation / route-shopping projection (#251).
 *
 * It reads ONLY existing GET read models — `/api/workspace/health`,
 * `/api/workspace/agent-context`, `/api/workspace/agent-outcomes` — and runs
 * the shared PURE derivers (`deriveGovernanceCausation`, `deriveAuthorityStatus`,
 * `deriveAuthorityNextActions`) to compose one operator view. Derivation logic
 * lives in the libs, never here; this component only fetches + renders.
 *
 * Read-only. It adds NO route, NO PATCH field, NO schema, NO persistence, NO
 * execution. Every "Open" hands off to an EXISTING surface: a governance
 * route-shop signal opens the swarm-run detail (via onOpenArtifact); a health
 * issue navigates to the Data Model / Builder / Workflows surface where it is
 * fixed. The same closed loop as the CEO cockpit: open → read the one thing
 * that needs review → Open the fix surface → act → Refresh → confirm cleared.
 *
 * State machine (every state rendered — no blank first frame, no false clear):
 *   loading   first fetch in flight        → "Reading workspace authority…"
 *   error     a read model failed          → error + Retry (never a fake clear)
 *   loaded    composed authority model     → status + Needs-attention + sections
 *
 * Truthful telemetry: an unknown elapsed renders "—"; read warnings from the
 * health route are surfaced as read-confidence warnings, never laundered into
 * a healthy display.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { deriveGovernanceCausation } from "@/lib/governance-causation-console";
import {
  deriveAuthorityStatus,
  deriveAuthorityNextActions,
} from "@/lib/workspace-authority-intelligence";

const STATUS_LABEL = { clear: "Clear", watch: "Watch", attention: "Attention" };
const STATUS_DOT = { clear: "ok", watch: "pending", attention: "fail" };
const HEALTH_DOT = { healthy: "ok", degraded: "pending", unhealthy: "fail" };
const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low", error: "Error", warning: "Warning" };

const ISSUE_TYPE_LABEL = {
  stale_widget: "Stale widget",
  missing_source: "Missing source",
  dangling_edge: "Broken reference",
  unhealthy_pipeline: "Failing pipeline",
  untested_pipeline: "Untested pipeline",
};

// Bound the rendered lists so a busy workspace stays a tidy, scrollable
// surface. The attention pick is always shown above; overflow is disclosed.
const AUTHORITY_VISIBLE_CAP = 25;

// Map a normalized next-action artifact to the EXISTING surface route. Unknown
// query params are inert in Next.js, so precise deep links never break a page.
// swarm-run is NOT mapped here — it is handed to onOpenArtifact (in-sidecar).
function hrefForArtifact(artifact) {
  if (!artifact) return null;
  switch (artifact.surface) {
    case "data-model":
      return artifact.objectId
        ? `/data-model?object=${encodeURIComponent(artifact.objectId)}`
        : "/data-model";
    case "builder":
      return "/";
    case "workflow-canvas":
      return artifact.objectId && artifact.rowName
        ? `/workflows?object=${encodeURIComponent(artifact.objectId)}&row=${encodeURIComponent(artifact.rowName)}&field=orchestrationConfig`
        : "/workflows";
    case "source-refresh":
      return "/data-model";
    default:
      return null;
  }
}

// One flat action card — mirrors CeoReportCard / SignalCard grammar (dot +
// title + hand-off action; meta rows; reason as description). No new icon set.
function ActionCard({ action, onOpen, emphasis }) {
  const canOpen = Boolean(action.artifact && typeof onOpen === "function");
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card"
      data-authority-action={action.id}
      data-authority-source={action.source}
      data-authority-severity={action.severity}
      data-authority-emphasis={emphasis ? "true" : "false"}
    >
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={action.source === "governance" ? "fail" : action.severity === "error" ? "fail" : "pending"} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{action.label}</span>
        {canOpen && (
          <button
            type="button"
            className="dm-btn-ghost dm-swarm-card-action"
            onClick={() => onOpen(action)}
            aria-label={`Open the fix surface for ${action.label}`}
            title={action.source === "governance" ? "Open the targeted workflow in Background tasks" : "Open the fix surface"}
          >
            <ArrowUpRight size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint dm-swarm-card-kind">
          {action.source === "governance" ? "Governance" : "Health"}
        </span>
        <span className="dm-run-console__hint">{SEVERITY_LABEL[action.severity] || action.severity}</span>
      </div>
      {action.reason && <div className="dm-helper-stream dm-swarm-card-desc">{action.reason}</div>}
    </div>
  );
}

export function WorkspaceAuthorityCockpit({ onOpenArtifact }) {
  const [health, setHealth] = useState(null);
  const [agentContext, setAgentContext] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [healthRes, contextRes, outcomesRes] = await Promise.all([
        fetch("/api/workspace/health"),
        fetch("/api/workspace/agent-context"),
        fetch("/api/workspace/agent-outcomes"),
      ]);
      if (!healthRes.ok) throw new Error(`health read returned ${healthRes.status}`);
      if (!contextRes.ok) throw new Error(`agent-context read returned ${contextRes.status}`);
      if (!outcomesRes.ok) throw new Error(`receipt stream returned ${outcomesRes.status}`);
      const [healthData, contextData, outcomesData] = await Promise.all([
        healthRes.json(),
        contextRes.json(),
        outcomesRes.json(),
      ]);
      setHealth(healthData || null);
      setAgentContext(contextData || null);
      setReceipts(Array.isArray(outcomesData?.receipts) ? outcomesData.receipts : []);
      setLoaded(true);
    } catch (err) {
      // Non-fatal — render an explicit error + Retry, never a misleading
      // "all clear". Prior data (if any) is kept so a transient refresh
      // failure does not blank a populated cockpit.
      setLoadError(err?.message || "Could not read the workspace authority read models.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const governance = useMemo(() => deriveGovernanceCausation({ receipts }), [receipts]);
  const status = useMemo(() => deriveAuthorityStatus({ health, governance }), [health, governance]);
  const nextActions = useMemo(
    () => deriveAuthorityNextActions({ health, governance, agentContext }),
    [health, governance, agentContext]
  );

  const handleOpen = useCallback(
    (action) => {
      const artifact = action?.artifact;
      if (!artifact) return;
      if (artifact.surface === "swarm-run") {
        if (typeof onOpenArtifact === "function") {
          onOpenArtifact({ surface: "swarm-run", objectId: artifact.objectId, name: artifact.name });
        }
        return;
      }
      const href = hrefForArtifact(artifact);
      if (href && typeof window !== "undefined") window.location.assign(href);
    },
    [onOpenArtifact]
  );

  const healthStatus = health?.status || "healthy";
  const issues = Array.isArray(health?.issues) ? health.issues : [];
  const readWarnings = Array.isArray(health?.warnings) ? health.warnings : [];
  const capabilities = Array.isArray(agentContext?.capabilities) ? agentContext.capabilities : [];
  const ctxSummary = agentContext?.summary && typeof agentContext.summary === "object" ? agentContext.summary : null;

  const attention = nextActions[0] || null;
  const others = attention ? nextActions.slice(1) : nextActions;
  const visibleOthers = others.slice(0, AUTHORITY_VISIBLE_CAP);
  const overflow = others.length - visibleOthers.length;

  const govSignals = Array.isArray(governance?.signals) ? governance.signals : [];

  return (
    <div className="dm-swarm-cockpit" data-authority-cockpit="" data-authority-status={loaded ? status : "loading"}>
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {loaded ? (
            <>
              <span className="dm-run-console__tree-dot" data-variant={STATUS_DOT[status] || "pending"} />
              {` ${STATUS_LABEL[status] || status} · ${issues.length} health issue${issues.length === 1 ? "" : "s"} · ${govSignals.length} governance signal${govSignals.length === 1 ? "" : "s"}`}
            </>
          ) : (
            "Workspace authority intelligence"
          )}
        </span>
        <button
          type="button"
          className="dm-btn-ghost"
          onClick={refresh}
          disabled={loading}
          title="Re-read the workspace authority read models"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loadError && (
        <div className="dm-helper-error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="dm-btn-ghost" onClick={refresh} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {!loaded && !loadError && <p className="dm-run-console__hint">Reading workspace authority…</p>}

      {loaded && (
        <>
          {/* Unified "Needs your attention" — one card spanning health + governance. */}
          {attention ? (
            <>
              <span className="dm-field-label">Needs your attention</span>
              <ActionCard action={attention} onOpen={handleOpen} emphasis />
            </>
          ) : (
            <p className="dm-run-console__hint">
              Nothing needs your attention. Health is {healthStatus} and no route-shopping has
              been detected across the receipt stream.
            </p>
          )}

          {others.length > 0 && (
            <>
              <span className="dm-run-console__hint">All signals</span>
              <div className="dm-swarm-cockpit-list" data-authority-action-list="">
                {visibleOthers.map((action) => (
                  <ActionCard key={action.id} action={action} onOpen={handleOpen} />
                ))}
              </div>
              {overflow > 0 && (
                <span className="dm-run-console__hint">{`Showing ${visibleOthers.length} of ${others.length} signals.`}</span>
              )}
            </>
          )}

          {/* Workspace Health section. */}
          <div className="dm-swarm-section-row">
            <span className="dm-field-label">
              <span className="dm-run-console__tree-dot" data-variant={HEALTH_DOT[healthStatus] || "pending"} />
              {` Workspace health — ${healthStatus}`}
            </span>
          </div>
          {issues.length === 0 ? (
            <p className="dm-run-console__hint">
              No issues detected. Widgets, sources, references, and pipelines are consistent.
            </p>
          ) : (
            <div className="dm-swarm-cockpit-list" data-authority-health-list="">
              {issues.slice(0, AUTHORITY_VISIBLE_CAP).map((issue, index) => {
                const ref = issue.widgetId || issue.objectId || issue.workflow || issue.sourceId || "";
                return (
                  <div
                    key={`${issue.type}::${ref}::${index}`}
                    className="dm-helper-toolcall dm-swarm-card"
                    data-authority-health-issue={issue.type}
                    data-authority-health-severity={issue.severity}
                  >
                    <div className="dm-swarm-card-head">
                      <span className="dm-run-console__tree-dot" data-variant={issue.severity === "error" ? "fail" : "pending"} />
                      <span className="dm-helper-toolcall-title dm-swarm-card-title">
                        {ISSUE_TYPE_LABEL[issue.type] || issue.type}
                      </span>
                    </div>
                    <div className="dm-swarm-card-meta">
                      <span className="dm-run-console__hint dm-swarm-card-kind">{issue.severity}</span>
                      {ref && <span className="dm-run-console__hint">{ref}</span>}
                    </div>
                    <div className="dm-helper-stream dm-swarm-card-desc">{issue.reason}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Agent Context section. */}
          <div className="dm-swarm-section-row">
            <span className="dm-field-label">Agent context</span>
            {ctxSummary && (
              <span className="dm-run-console__hint">{ctxSummary.name || "workspace"}</span>
            )}
          </div>
          {ctxSummary ? (
            <div className="dm-swarm-card-meta" data-authority-context-summary="">
              <span className="dm-run-console__hint">{`${ctxSummary.objects ?? 0} objects`}</span>
              <span className="dm-run-console__hint">{`${ctxSummary.widgets ?? 0} widgets`}</span>
              <span className="dm-run-console__hint">{`${ctxSummary.workflows ?? 0} workflows`}</span>
              <span className="dm-run-console__hint">{`${ctxSummary.dashboards ?? 0} dashboards`}</span>
              <span className="dm-run-console__hint">{`${ctxSummary.sourceRecords ?? 0} source records`}</span>
            </div>
          ) : (
            <p className="dm-run-console__hint">No agent context available yet.</p>
          )}
          {capabilities.length > 0 && (
            <div className="dm-swarm-card-meta" data-authority-capabilities="">
              {capabilities.map((cap) => (
                <span key={cap} className="dm-run-console__hint dm-swarm-card-kind">{cap}</span>
              ))}
            </div>
          )}

          {/* Governance causation section. */}
          <div className="dm-swarm-section-row">
            <span className="dm-field-label">Governance causation</span>
            <span className="dm-run-console__hint">
              {`${governance.totals.routeShopSignals} route-shop · ${governance.totals.highSeverity} high`}
            </span>
          </div>
          {governance.totals.receipts === 0 ? (
            <p className="dm-run-console__hint">
              No agent activity recorded yet. Once mutations and runs flow through the governed
              lanes, this section correlates a blocked direct attempt with a later sandbox-run by
              the same actor — route-shopping — from the receipt stream alone.
            </p>
          ) : govSignals.length === 0 ? (
            <p className="dm-run-console__hint">
              {`No route-shopping detected across ${governance.totals.receipts} receipt${governance.totals.receipts === 1 ? "" : "s"} from ${governance.totals.actors} actor${governance.totals.actors === 1 ? "" : "s"}.`}
            </p>
          ) : (
            <div className="dm-swarm-cockpit-list" data-authority-governance-list="">
              {govSignals.slice(0, AUTHORITY_VISIBLE_CAP).map((signal) => {
                const target = signal.objectRefs && signal.objectRefs[0];
                const reach = target
                  ? `${target.rowName ? `${target.rowName} · ` : ""}${target.objectId}`
                  : "no addressable row";
                return (
                  <div
                    key={signal.signalId}
                    className="dm-helper-toolcall dm-swarm-card"
                    data-authority-governance-signal={signal.signalId}
                    data-authority-governance-severity={signal.severity}
                  >
                    <div className="dm-swarm-card-head">
                      <span className="dm-run-console__tree-dot" data-variant={signal.variant} />
                      <span className="dm-helper-toolcall-title dm-swarm-card-title">{signal.actor}</span>
                      {signal.handoff && (
                        <button
                          type="button"
                          className="dm-btn-ghost dm-swarm-card-action"
                          onClick={() => handleOpen({ artifact: signal.handoff })}
                          aria-label={`Open ${reach} in Background tasks`}
                          title="Open the targeted workflow in Background tasks"
                        >
                          <ArrowUpRight size={12} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <div className="dm-swarm-card-meta">
                      <span className="dm-run-console__hint dm-swarm-card-kind">Route-shop</span>
                      <span className="dm-run-console__hint">{SEVERITY_LABEL[signal.severity] || signal.severity}</span>
                      <span className="dm-run-console__hint">{signal.elapsedLabel} elapsed</span>
                      <span className="dm-run-console__hint">{signal.followOnSucceeded ? "proof accepted" : "proof held"}</span>
                    </div>
                    <div className="dm-helper-stream dm-swarm-card-desc">{signal.headline}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Read-confidence warnings — surfaced, never laundered into healthy. */}
          {readWarnings.length > 0 && (
            <>
              <span className="dm-run-console__hint" data-authority-read-warnings="">
                {`${readWarnings.length} read warning${readWarnings.length === 1 ? "" : "s"} — health is derived with reduced confidence.`}
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default WorkspaceAuthorityCockpit;
