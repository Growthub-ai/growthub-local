"use client";

/**
 * CausationDriverCockpit — governed causal-proof-chain surface inside the
 * Workspace Helper sidecar (Causation Driver V1).
 *
 * This is the read-only forensic twin of SwarmRunCockpit. Where the swarm
 * cockpit STEERS a run forward (launch / stop), the causation driver REPLAYS
 * what already happened across the four governed lanes and infers why, using
 * ONLY the existing read-only receipt stream:
 *
 *   data lane:  GET /api/workspace/agent-outcomes (the existing route — nothing
 *               new) → deriveCausationChainProjection (pure: nodes = receipts,
 *               edges = directly-follows on a shared object scope, plus the
 *               route-shopping flag).
 *
 *   execution:  NONE. The driver never POSTs / PATCHes. Writes still flow
 *               through the existing governed routes. A light poll converges
 *               the view on new receipts; the manual Refresh button is the
 *               only control.
 *
 * Visual grammar is strictly inherited from the swarm cockpit: the same
 * `dm-helper-toolcall` card, the same `.dm-run-console__tree-dot[data-variant]`
 * status dots, the same `.dm-run-console__hint` meta text. New `dm-causation-*`
 * classes are layout-only and reuse those tokens.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Icon set inherited from the swarm cockpit / run-console grammar: ChevronDown/
// ChevronRight for the accordion, RefreshCw as the read-only convergence
// control (no Play/Square — the driver runs nothing), AlertTriangle for the
// route-shopping strip (same role as the swarm cockpit's dm-helper-error).
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import {
  CAUSATION_DRIVER_SIDECAR_CONFIG,
  CAUSATION_LANES,
  deriveCausationChainProjection,
  deriveCausationEligibility,
} from "@/lib/workspace-causation-driver";
import { deriveHelperWidgetCausationState } from "@/lib/workspace-swarm-proposal";

// Compact relative-gap label for an inferred edge (mirrors the run console's
// duration hints). Blank when no honest timestamp delta exists.
function formatGap(deltaMs) {
  if (deltaMs == null || !Number.isFinite(deltaMs)) return "";
  const secs = Math.max(0, Math.round(deltaMs / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

// One receipt node, rendered with the swarm cockpit's exact card chrome. The
// chevron accordion exposes the receipt's evidence (object refs, policy
// verdict, run/source ids, nextActions) the same way the swarm phase group
// exposes its agent table.
function CausationNodeCard({ node, incomingEdge }) {
  const [open, setOpen] = useState(false);
  const hasEvidence =
    node.objectRefs.length > 0
    || node.policyVerdict
    || node.runId
    || node.sourceId
    || node.version
    || node.nextActions.length > 0;
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card dm-causation-node"
      data-causation-node={node.receiptId}
      data-causation-lane={node.lane}
      data-route-shopping={incomingEdge?.routeShopping ? "true" : "false"}
    >
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={node.variant} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{node.kind}</span>
        {/* Lane signal stays in the inherited grey hint grammar — no colored
            chip — exactly like the swarm cockpit's meta line. */}
        <span className="dm-run-console__hint">{node.laneLabel}</span>
      </div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint dm-swarm-card-kind">{node.outcomeStatus}</span>
        {node.actor && <span className="dm-run-console__hint">{node.actor}</span>}
        {node.createdAt && <span className="dm-run-console__hint">{node.createdAt}</span>}
      </div>
      <div className="dm-helper-stream dm-swarm-card-desc">{node.summary}</div>
      {/* The inferred causal link INTO this node — the cockpit's "why". A
          route-shopping link reuses the inherited red "fail" dot variant; a
          plain directly-follows link uses the neutral "canceled" dot. */}
      {incomingEdge && (
        <div className={`dm-causation-edge${incomingEdge.stale ? " is-stale" : ""}`} data-route-shopping={incomingEdge.routeShopping ? "true" : "false"}>
          <span className="dm-run-console__tree-dot" data-variant={incomingEdge.routeShopping ? "fail" : "canceled"} />
          <span className="dm-run-console__hint">
            {incomingEdge.routeShopping ? "route-shopping ←" : "follows ←"} {incomingEdge.scope}
          </span>
          {formatGap(incomingEdge.deltaMs) && (
            <span className="dm-run-console__hint">{formatGap(incomingEdge.deltaMs)}{incomingEdge.stale ? " · stale" : ""}</span>
          )}
        </div>
      )}
      {hasEvidence && (
        <>
          <button
            type="button"
            className="dm-helper-toolcall-row dm-causation-evidence-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span className="dm-helper-toolcall-title">Evidence</span>
            {open
              ? <ChevronDown size={14} className="dm-helper-toolcall-chevron" aria-hidden="true" />
              : <ChevronRight size={14} className="dm-helper-toolcall-chevron" aria-hidden="true" />}
          </button>
          {open && (
            <div className="dm-helper-toolcall-body dm-causation-evidence">
              {node.objectRefs.length > 0 && (
                <p className="dm-run-console__hint">
                  Objects: {node.objectRefs.map((ref) => [ref?.objectId, ref?.rowName].filter(Boolean).join("::")).filter(Boolean).join(" · ")}
                </p>
              )}
              {node.policyVerdict && (
                <p className="dm-run-console__hint">
                  Policy: {node.policyVerdict.ok ? "ok" : "blocked"}
                  {Array.isArray(node.policyVerdict.violationCodes) && node.policyVerdict.violationCodes.length > 0
                    ? ` · ${node.policyVerdict.violationCodes.join(", ")}`
                    : ""}
                </p>
              )}
              {(node.runId || node.sourceId || node.version) && (
                <p className="dm-run-console__hint">
                  {[node.runId && `run ${node.runId}`, node.sourceId && `source ${node.sourceId}`, node.version && `v${node.version}`].filter(Boolean).join(" · ")}
                </p>
              )}
              {node.nextActions.length > 0 && (
                <p className="dm-run-console__hint">Next: {node.nextActions.join(" · ")}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CausationDriverCockpit({ workspaceConfig }) {
  const helperWidgetState = useMemo(
    () => deriveHelperWidgetCausationState(workspaceConfig),
    [workspaceConfig]
  );

  const [receipts, setReceipts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(CAUSATION_DRIVER_SIDECAR_CONFIG.source);
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data?.ok === false) {
        setError(data.error || "Could not read the receipt stream.");
        return;
      }
      setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
      setSummary(data?.summary || null);
    } catch (err) {
      if (mountedRef.current) setError(err?.message || "Could not read the receipt stream.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    // Light convergence poll — never mutates, only re-reads the stream.
    const poll = setInterval(refresh, CAUSATION_DRIVER_SIDECAR_CONFIG.pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(poll);
    };
  }, [refresh]);

  const projection = useMemo(() => deriveCausationChainProjection(receipts), [receipts]);
  const eligibility = useMemo(
    () => deriveCausationEligibility({ receipts, summary, helperWidgetState }),
    [receipts, summary, helperWidgetState]
  );

  // Incoming edge per node — the "why this happened" link the card renders.
  const incomingByNode = useMemo(() => {
    const map = new Map();
    for (const edge of projection.edges) {
      // Keep the most recent (closest) incoming edge; route-shopping always wins.
      const prior = map.get(edge.to);
      if (!prior || edge.routeShopping || (!prior.routeShopping && edge.from > prior.from)) {
        map.set(edge.to, edge);
      }
    }
    return map;
  }, [projection.edges]);

  // Newest-first for display — the operator scans the latest causality first,
  // matching the swarm cockpit's "Running then Finished" reverse-recency feel.
  const orderedNodes = useMemo(() => projection.nodes.slice().reverse(), [projection.nodes]);

  return (
    <div className="dm-swarm-cockpit dm-causation-cockpit" data-causation-cockpit="">
      {error && (
        <div className="dm-helper-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Lane legend — the spine of the visualization, read-only. */}
      <div className="dm-causation-legend" aria-label="Governed lanes">
        {CAUSATION_LANES.map((lane) => (
          <span key={lane.id} className="dm-causation-legend-item">
            <span className="dm-run-console__tree-dot" data-variant={lane.variant} />
            <span className="dm-run-console__hint">{lane.label}</span>
            <span className="dm-run-console__hint">{projection.laneCounts[lane.id] || 0}</span>
          </span>
        ))}
        <button
          type="button"
          className="dm-btn-ghost dm-causation-refresh"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh causal chain"
          title="Re-read the receipt stream"
        >
          <RefreshCw size={12} aria-hidden="true" />
        </button>
      </div>

      {/* Route-shopping alert strip — same role as the swarm cockpit's error
          banner, but it is a governance finding, not a runtime error. */}
      {projection.routeShopping.length > 0 && (
        <div className="dm-helper-error dm-causation-route-shopping" role="status">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>
            {projection.routeShopping.length} route-shopping pattern{projection.routeShopping.length === 1 ? "" : "s"} detected
            — a denied direct write followed by a privileged write on the same object.
          </span>
        </div>
      )}

      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">Causal chain</span>
        <span className="dm-run-console__hint">{projection.total} receipt{projection.total === 1 ? "" : "s"}</span>
      </div>

      <div className="dm-swarm-cockpit-list">
        {!eligibility.ready ? (
          <p className="dm-run-console__hint">{eligibility.guidance}</p>
        ) : (
          orderedNodes.map((node) => (
            <CausationNodeCard
              key={node.receiptId}
              node={node}
              incomingEdge={incomingByNode.get(node.index) || null}
            />
          ))
        )}
      </div>
    </div>
  );
}
