"use client";

/**
 * CeoCockpit — the governed "chief orchestrator" oversight surface inside the
 * Workspace Helper sidecar (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1 +
 * CEO_PRIMITIVE_COCKPIT_ROADMAP_V1, item R1+R2).
 *
 * It mirrors SwarmRunCockpit's grammar exactly but is READ-ONLY: it never
 * executes, never mutates config, and introduces no new object, route, or
 * visual vocabulary. It renders the existing swarm-workflows fleet as the
 * CEO's "direct reports" — each with a state dot, a plain-language headline,
 * readiness, and a single next action that hands off to the EXISTING
 * Background Tasks (swarm-run) surface via onOpenReport.
 *
 * Data:
 *   - deriveCeoCockpit(config, receipts)  — the pure projection (no I/O here)
 *   - GET /api/workspace/agent-outcomes   — optional governance rollup, the
 *     same read endpoint the platform already exposes (graceful fallback)
 *
 * Telemetry is truthful: unreported counts render "—", never 0 or an estimate.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
// Inherited icon grammar — same set the swarm cockpit uses.
import { ArrowUpRight } from "lucide-react";
import { deriveCeoCockpit } from "@/lib/ceo-cockpit-console";

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
            onClick={() => onOpen(report)}
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

export function CeoCockpit({ workspaceConfig, onOpenReport }) {
  // Optional governance rollup — read-only, graceful fallback to fleet-only.
  const [receipts, setReceipts] = useState([]);

  const refreshReceipts = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/agent-outcomes");
      const data = await res.json();
      const list = Array.isArray(data?.receipts) ? data.receipts : [];
      setReceipts(list);
    } catch {
      // Non-fatal — the fleet view still derives from config alone.
    }
  }, []);

  useEffect(() => {
    refreshReceipts();
  }, [refreshReceipts]);

  const model = useMemo(
    () => deriveCeoCockpit({ workspaceConfig, receipts }),
    [workspaceConfig, receipts]
  );

  const { fleet, attention, reports, governance } = model;
  const others = attention
    ? reports.filter((r) => r.name !== attention.name)
    : reports;

  return (
    <div className="dm-swarm-cockpit" data-ceo-cockpit="">
      {/* Fleet rollup — one line, aggregate-first (no thousands of rows). */}
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

      {/* The single next move — the CEO's causation "next action". */}
      {attention && (
        <>
          <span className="dm-field-label">Needs your attention</span>
          <CeoReportCard report={attention} onOpen={onOpenReport} emphasis />
        </>
      )}

      {/* The rest of the fleet. */}
      {others.length > 0 && (
        <>
          <span className="dm-run-console__hint">Fleet</span>
          {others.map((report) => (
            <CeoReportCard key={`${report.objectId}::${report.name}`} report={report} onOpen={onOpenReport} />
          ))}
        </>
      )}
    </div>
  );
}

export default CeoCockpit;
