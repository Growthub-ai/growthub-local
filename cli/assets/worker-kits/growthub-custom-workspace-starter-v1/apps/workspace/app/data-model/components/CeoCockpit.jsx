"use client";

/**
 * CeoCockpit — the governed "chief orchestrator" surface inside the Workspace
 * Helper sidecar (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1 +
 * CEO_PRIMITIVE_COCKPIT_ROADMAP_V1).
 *
 * Two state-derived modes, one /ceo view:
 *
 *   - bootstrap   — a first-use checklist that proves the full CEO loop once
 *     (create → test → launch → observe → review → govern → complete), then
 *     records a completion marker in workspace CONFIG and disappears forever
 *     for that workspace. The only mutation is the governed
 *     `ceo.bootstrap.complete` proposal through the existing helper/apply lane.
 *   - operational — the fleet oversight cockpit: every swarm workflow as a
 *     "direct report" with state, readiness, last outcome, and the single
 *     next move. Every "Open" hands off to the EXISTING Background Tasks
 *     (swarm-run) surface.
 *
 * Read-only with respect to execution: it never runs anything, never mutates
 * config except through helper/apply, invents no telemetry (unreported counts
 * render "—"), and adds no route, object type, or visual grammar beyond the
 * existing dm-* primitives.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
// Inherited icon grammar — same set the swarm cockpit uses.
import { ArrowUpRight } from "lucide-react";
import { deriveCeoCockpit } from "@/lib/ceo-cockpit-console";
import {
  deriveCeoBootstrapState,
  CEO_BOOTSTRAP_COMPLETE_PROPOSAL_TYPE,
} from "@/lib/ceo-bootstrap-console";

// k-formatting identical to SwarmRunCockpit's truthful display.
function formatCount(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const STATE_LABEL = {
  blocked: "Blocked",
  failing: "Failing",
  "never-run": "Not run yet",
  running: "Running",
  completed: "Completed",
};

// Checklist status → inherited run-console dot variant. No new vocabulary.
function checklistDotVariant(status) {
  switch (status) {
    case "complete": return "ok";
    case "ready": return "active";
    case "blocked": return "fail";
    case "pending":
    default: return "pending";
  }
}

// ---------------------------------------------------------------------------
// Operational mode — fleet of direct reports
// ---------------------------------------------------------------------------

function CeoReportCard({ report, onOpen, emphasis }) {
  const canOpen = Boolean(report.nextAction?.artifact && typeof onOpen === "function");
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card"
      data-ceo-report={report.name}
      data-ceo-state={report.state}
      data-ceo-emphasis={emphasis ? "true" : "false"}
    >
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={report.variant} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{report.name}</span>
        {canOpen && (
          <button
            type="button"
            className="dm-btn-ghost dm-swarm-card-action"
            onClick={() => onOpen(report.nextAction.artifact)}
            aria-label={`${report.nextAction.label}: ${report.name}`}
            title={report.nextAction.label}
          >
            <ArrowUpRight size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint dm-swarm-card-kind">Workflow</span>
        <span className="dm-run-console__hint">{STATE_LABEL[report.state] || report.state}</span>
      </div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint">{`${report.agentCount} Agents`}</span>
        <span className="dm-run-console__hint">
          {report.readiness.ready
            ? `${report.readiness.adapter}${report.readiness.agentHost ? ` · ${report.readiness.agentHost}` : ""}`
            : "Execution target needed"}
        </span>
        {report.lastRun && (
          <span className="dm-run-console__hint">{`${formatCount(report.lastRun.totalTokens)} Tokens`}</span>
        )}
      </div>
      <div className="dm-helper-stream dm-swarm-card-desc">{report.headline}</div>
    </div>
  );
}

// Bound the rendered fleet so a workspace with hundreds of workflows stays a
// tidy, scrollable list rather than an unbounded wall of cards. The attention
// pick is always shown above this; the overflow count points to Background
// Tasks for the full set. Records are never hidden by name collision — the
// cap is purely by count and disclosed.
const CEO_FLEET_VISIBLE_CAP = 50;

function CeoFleetView({ model, onOpenArtifact }) {
  const { fleet, attention, reports, governance } = model;
  // Filter by stable reportId, not name — duplicate Names must never drop or
  // merge a record from the fleet.
  const others = attention ? reports.filter((r) => r.reportId !== attention.reportId) : reports;
  const visible = others.slice(0, CEO_FLEET_VISIBLE_CAP);
  const overflow = others.length - visible.length;
  return (
    <>
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {`${fleet.total} workflow${fleet.total === 1 ? "" : "s"} · ${fleet.runnable} runnable · ${fleet.blocked} blocked · ${fleet.failing} failing`}
        </span>
        {governance.blockedAttempts > 0 && (
          <span className="dm-run-console__hint" title="Blocked governance attempts in the outcome stream">
            {`${governance.blockedAttempts} blocked attempt${governance.blockedAttempts === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      {reports.length === 0 && (
        <p className="dm-run-console__hint">
          No agent swarms yet. Use /swarm in the composer to propose one — once
          you apply it, the governed workflow appears here for you to oversee,
          launch, and review from Background Tasks.
        </p>
      )}

      {attention && (
        <>
          <span className="dm-field-label">Needs your attention</span>
          <CeoReportCard report={attention} onOpen={onOpenArtifact} emphasis />
        </>
      )}

      {others.length > 0 && (
        <>
          <span className="dm-run-console__hint">Fleet</span>
          <div className="dm-ceo-report-list" data-ceo-report-list="">
            {visible.map((report) => (
              <CeoReportCard key={report.reportId} report={report} onOpen={onOpenArtifact} />
            ))}
          </div>
          {overflow > 0 && (
            <span className="dm-run-console__hint">
              {`Showing ${visible.length} of ${others.length} workflows — open Background Tasks for the rest.`}
            </span>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Bootstrap mode — first-use closed-loop checklist
// ---------------------------------------------------------------------------

function CeoChecklistRow({ item, onAction, actionBusy }) {
  const action = item.nextAction;
  const actionable = action && (item.status === "ready" || item.status === "blocked");
  return (
    <div className="dm-helper-toolcall dm-swarm-card" data-ceo-step={item.id} data-ceo-status={item.status}>
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={checklistDotVariant(item.status)} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{item.label}</span>
        {actionable && (
          <button
            type="button"
            className="dm-btn-ghost dm-swarm-card-action"
            onClick={() => onAction(item)}
            disabled={actionBusy}
            aria-label={action.label}
            title={action.label}
          >
            {action.label}
          </button>
        )}
      </div>
      {item.guidance && (
        <div className="dm-helper-stream dm-swarm-card-desc">{item.guidance}</div>
      )}
    </div>
  );
}

function CeoBootstrapView({ model, onAction, actionBusy, error }) {
  const { checklist, progress, primaryAction } = model;
  return (
    <>
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {`Set up the CEO · ${progress.completed}/${progress.total} steps`}
        </span>
        {primaryAction && (
          <span className="dm-run-console__hint" title="Your next move">
            {`Next: ${primaryAction.label}`}
          </span>
        )}
      </div>

      <div className="dm-helper-stream dm-swarm-card-desc">
        You're operating as the workspace orchestrator (the CEO). Prove the loop
        once — create a swarm, validate it, launch it through Background Tasks,
        observe the result — and this checklist locks in and disappears.
      </div>

      {error && (
        <div className="dm-helper-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {checklist.map((item) => (
        <CeoChecklistRow key={item.id} item={item} onAction={onAction} actionBusy={actionBusy} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Container — derives the mode and wires actions to governed surfaces
// ---------------------------------------------------------------------------

export function CeoCockpit({ workspaceConfig, onOpenArtifact, onConfigRefresh, onSeedSwarm, onOpenSetup }) {
  // Optional governance rollup — read-only, graceful fallback to config-only.
  const [receipts, setReceipts] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshReceipts = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/agent-outcomes");
      const data = await res.json();
      setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
    } catch {
      // Non-fatal — the fleet/bootstrap still derives from config alone.
    }
  }, []);

  useEffect(() => {
    refreshReceipts();
  }, [refreshReceipts]);

  const fleetModel = useMemo(
    () => deriveCeoCockpit({ workspaceConfig, receipts }),
    [workspaceConfig, receipts]
  );
  const bootstrapModel = useMemo(
    () => deriveCeoBootstrapState({ workspaceConfig, receipts }),
    [workspaceConfig, receipts]
  );

  const handleOpenArtifact = useCallback(
    (artifact) => {
      if (artifact && typeof onOpenArtifact === "function") onOpenArtifact(artifact);
    },
    [onOpenArtifact]
  );

  // Mark CEO setup complete — the ONLY mutation, through the governed
  // helper/apply lane. The server refuses unless the loop is provably done.
  const markComplete = useCallback(async () => {
    setActionBusy(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/helper/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposals: [
            {
              type: CEO_BOOTSTRAP_COMPLETE_PROPOSAL_TYPE,
              affectedField: "dataModel",
              payload: {},
              rationale: "Mark CEO setup complete after proving the swarm loop end to end.",
            },
          ],
          reviewedBy: "user",
        }),
      });
      const data = await res.json();
      const skipped = Array.isArray(data?.skipped) ? data.skipped : [];
      if (data?.ok === false) {
        setError(data?.error || "Could not complete CEO setup.");
      } else if (skipped.length > 0) {
        setError(skipped[0]?.reason || "CEO setup is not ready to complete yet.");
      } else if (typeof onConfigRefresh === "function") {
        onConfigRefresh();
      }
    } catch (err) {
      setError(err?.message || "Apply failed.");
    } finally {
      setActionBusy(false);
    }
  }, [onConfigRefresh]);

  const handleChecklistAction = useCallback(
    (item) => {
      const action = item?.nextAction;
      if (!action) return;
      switch (action.kind) {
        case "open":
          handleOpenArtifact(action.artifact);
          break;
        case "seed-swarm":
          if (typeof onSeedSwarm === "function") onSeedSwarm();
          break;
        case "setup":
          if (typeof onOpenSetup === "function") onOpenSetup();
          break;
        case "mark-complete":
          markComplete();
          break;
        default:
          break;
      }
    },
    [handleOpenArtifact, onSeedSwarm, onOpenSetup, markComplete]
  );

  return (
    <div className="dm-swarm-cockpit" data-ceo-cockpit="" data-ceo-mode={bootstrapModel.mode}>
      {bootstrapModel.mode === "bootstrap" ? (
        <CeoBootstrapView
          model={bootstrapModel}
          onAction={handleChecklistAction}
          actionBusy={actionBusy}
          error={error}
        />
      ) : (
        <CeoFleetView model={fleetModel} onOpenArtifact={handleOpenArtifact} />
      )}
    </div>
  );
}

export default CeoCockpit;
