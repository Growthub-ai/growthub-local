"use client";

/**
 * SimulationCockpit — governed swarm-society simulation surface inside the
 * Workspace Helper sidecar. It is the predictive sibling of SwarmRunCockpit and
 * reuses the IDENTICAL sidecar grammar/CSS (dm-swarm-cockpit, dm-helper-toolcall,
 * dm-swarm-card, dm-run-console__hint/__tree-dot, dm-helper-setup-*, dm-btn-*).
 *
 * It is read-only: it calls GET /api/workspace/swarm-predictability (the
 * Swarm Society Simulation V1 deriver) with the shared cockpit configuration
 * and renders the Predictability Report. It NEVER mutates workspace config,
 * never executes sandbox-run, and writes nothing — simulation receipts are
 * derived server-side in memory (isSimulation:true).
 *
 * The same cockpit is opened two ways, sharing this one component + config:
 *   - the Workspace Lens action button (initialView="simulation") ;
 *   - the `/simulate` helper command (view-switch in the sidecar composer).
 */

import { useCallback, useMemo, useState } from "react";
import { Play } from "lucide-react";
import {
  SIMULATION_PARAM_FIELDS,
  DEFAULT_SIMULATION_PARAMS,
  buildSimulationQuery,
  clampSimulationParam,
  verdictPresentation,
  summarizeSimulationReport,
} from "@/lib/simulation-cockpit-config";

function MetricRow({ label, value }) {
  return (
    <div className="dm-swarm-card-meta">
      <span className="dm-run-console__hint">{label}</span>
      <span className="dm-run-console__hint">{value}</span>
    </div>
  );
}

function ReportCard({ report }) {
  const v = verdictPresentation(report.verdict);
  return (
    <div className="dm-helper-toolcall dm-swarm-card" data-sim-report={report.verdict}>
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={v.variant} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{v.label}</span>
        <span className="dm-run-console__hint">{`fidelity ${report.fidelity ?? 0}`}</span>
      </div>
      <MetricRow label="Expected violations / 1k" value={report.expectedViolationRatePer1000 ?? "—"} />
      <MetricRow label="Swarm stability" value={report.swarmStability ?? "—"} />
      <MetricRow label="Safe concurrency" value={report.safeConcurrency ?? "—"} />
      <MetricRow label="Mean time to resolve (ticks)" value={report.meanTimeToResolveTicks ?? "—"} />
      {report.rationale && (
        <div className="dm-helper-stream dm-swarm-card-desc">{report.rationale}</div>
      )}
      {Array.isArray(report.contentionHotspots) && report.contentionHotspots.length > 0 && (
        <div className="dm-swarm-phases">
          <span className="dm-helper-toolcall-title">Contention hotspots</span>
          {report.contentionHotspots.slice(0, 5).map((h) => (
            <div key={h.objectId} className="dm-swarm-card-meta">
              <span className="dm-run-console__hint">{h.objectId}</span>
              <span className="dm-run-console__hint">{`${h.contention} contested`}</span>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(report.behaviorProfiles) && report.behaviorProfiles.length > 0 && (
        <div className="dm-swarm-phases">
          <span className="dm-helper-toolcall-title">Behavior profiles (from receipts)</span>
          {report.behaviorProfiles.slice(0, 6).map((p) => (
            <div key={p.key} className="dm-swarm-card-meta">
              <span className="dm-run-console__hint">{p.key}</span>
              <span className="dm-run-console__hint">
                {`blocked ${p.blockedRate} · route-shop ${p.routeShoppingRate}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SimulationCockpit({ onConfigRefresh }) {
  const [params, setParams] = useState(() => ({ ...DEFAULT_SIMULATION_PARAMS }));
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const summary = useMemo(() => (report ? summarizeSimulationReport(report) : ""), [report]);

  const setParam = useCallback((key, raw) => {
    setParams((prev) => ({ ...prev, [key]: raw }));
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError("");
    try {
      const res = await fetch(buildSimulationQuery(params));
      const data = await res.json();
      setReport(data);
      // Closed loop: the report is derived from the agent-outcome receipt
      // stream — refresh the host config so the Data Model records stay in sync.
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    } catch (err) {
      setError(err?.message || "simulation failed");
    } finally {
      setRunning(false);
    }
  }, [params, running, onConfigRefresh]);

  return (
    <div className="dm-swarm-cockpit" data-sim-cockpit="">
      {error && (
        <div className="dm-helper-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="dm-helper-setup-section" data-sim-config="">
        {SIMULATION_PARAM_FIELDS.map((field) => (
          <div key={field.key} className="dm-helper-setup-section">
            <label className="dm-helper-setup-label" htmlFor={`sim-${field.key}`}>{field.label}</label>
            <input
              id={`sim-${field.key}`}
              type="number"
              className="dm-helper-setup-input"
              min={field.min}
              max={field.max}
              value={params[field.key]}
              onChange={(e) => setParam(field.key, e.target.value)}
              onBlur={(e) => setParam(field.key, clampSimulationParam(field.key, e.target.value))}
              data-sim-param={field.key}
            />
            <span className="dm-field-hint">{field.hint}</span>
          </div>
        ))}
        <button
          type="button"
          className="dm-btn-primary"
          onClick={run}
          disabled={running}
          data-sim-run=""
        >
          <Play size={12} aria-hidden="true" />
          {running ? "Simulating…" : "Run simulation"}
        </button>
      </div>

      {summary && <p className="dm-run-console__hint" data-sim-summary="">{summary}</p>}

      {report
        ? <ReportCard report={report} />
        : (
          <p className="dm-run-console__hint">
            Run a swarm-society simulation to forecast violation density, contention
            hotspots, swarm stability, and the safe concurrency limit before cloning
            this workspace to a new tenant. Profiles are learned from your governed
            agent-outcome receipts — no execution, nothing is written.
          </p>
        )}
    </div>
  );
}
