"use client";

/**
 * GovernanceCausationCockpit — the governed "supervise / audit authority"
 * surface inside the Workspace Helper sidecar
 * (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1 §3 worked example +
 * CEO_PRIMITIVE_COCKPIT_ROADMAP_V1 R3).
 *
 * Read-only. It reads the ONE endpoint that already exists
 * (`GET /api/workspace/agent-outcomes`), runs the PURE deriver
 * (`deriveGovernanceCausation`), and renders confirmed route-shop pairs using
 * the SAME grammar the CEO cockpit uses — a totals section-row, a single
 * "Needs your attention" emphasized card, then the capped history list. It adds
 * NO new route, NO new schema, NO new PATCH field, NO new persistence, NO new
 * visual vocabulary; the only icon is the inherited ArrowUpRight (the CEO
 * cockpit's hand-off affordance).
 *
 * Closed-loop mental model (mirrors the CEO cockpit exactly): open → read the
 * one thing that needs review → Open the targeted workflow (hand-off to the
 * EXISTING swarm-run surface) → act there → Refresh → confirm it cleared.
 *
 * State machine (every state is rendered — no blank first frame):
 *   loading        first fetch in flight                → "Reading the receipt stream…"
 *   error          fetch failed                         → error + Retry (no misleading "clear")
 *   empty-activity loaded, 0 receipts                   → "No agent activity recorded yet"
 *   clear          loaded, receipts > 0, 0 signals      → "No route-shopping detected"
 *   watch          ≥1 signal, none high                 → attention + history
 *   alert          ≥1 high-severity signal              → attention + history
 *
 * Truthful telemetry: an unknown elapsed renders "—", never 0.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { deriveGovernanceCausation } from "@/lib/governance-causation-console";

const STATUS_DOT = { clear: "ok", watch: "pending", alert: "fail" };
const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

// Bound the rendered list so a workspace with a long shop history stays a tidy,
// scrollable list. The attention pick is always shown above this; the overflow
// count is disclosed. Mirrors CEO_FLEET_VISIBLE_CAP.
const GOVERNANCE_VISIBLE_CAP = 50;

// One flat signal card — mirrors CeoReportCard (dot + title + hand-off action;
// meta rows; headline as description). No expand/collapse, no extra icon: every
// piece of evidence is visible inline so there is no hidden state.
function SignalCard({ signal, onOpen, emphasis }) {
  const canOpen = Boolean(signal.handoff && typeof onOpen === "function");
  const target = signal.objectRefs && signal.objectRefs[0];
  const reach = target
    ? `${target.rowName ? `${target.rowName} · ` : ""}${target.objectId}`
    : "no addressable row";
  const violations = signal.policyVerdict?.violationCodes || [];
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card"
      data-governance-signal={signal.signalId}
      data-governance-severity={signal.severity}
      data-governance-emphasis={emphasis ? "true" : "false"}
    >
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={signal.variant} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{signal.actor}</span>
        {canOpen && (
          <button
            type="button"
            className="dm-btn-ghost dm-swarm-card-action"
            onClick={() => onOpen(signal.handoff)}
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
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint">Reached for {reach}</span>
        {violations.length > 0 && (
          <span className="dm-run-console__hint" title="Why the direct lane refused">
            Refused: {violations.join(", ")}
          </span>
        )}
      </div>
      <div className="dm-helper-stream dm-swarm-card-desc">{signal.headline}</div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint" title="The two receipts this signal correlates">
          {signal.blockedReceiptId} → {signal.followOnReceiptId}
        </span>
      </div>
    </div>
  );
}

export function GovernanceCausationCockpit({ onOpenArtifact }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const refreshReceipts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/workspace/agent-outcomes");
      if (!res.ok) throw new Error(`receipt stream returned ${res.status}`);
      const data = await res.json();
      setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
      setLoaded(true);
    } catch (err) {
      // Non-fatal — render an explicit error + Retry, never a misleading
      // "all clear". The previous receipts (if any) are kept so a transient
      // refresh failure does not blank a populated cockpit.
      setLoadError(err?.message || "Could not read the receipt stream.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshReceipts();
  }, [refreshReceipts]);

  const model = useMemo(() => deriveGovernanceCausation({ receipts }), [receipts]);

  const handleOpen = useCallback(
    (artifact) => {
      if (artifact && typeof onOpenArtifact === "function") onOpenArtifact(artifact);
    },
    [onOpenArtifact]
  );

  const { totals, signals, attention, status } = model;
  // Filter by stable signalId, never by actor — two shops by the same actor
  // must both survive in the history list.
  const others = attention ? signals.filter((s) => s.signalId !== attention.signalId) : signals;
  const visible = others.slice(0, GOVERNANCE_VISIBLE_CAP);
  const overflow = others.length - visible.length;

  const summaryLine = `${totals.routeShopSignals} signal${totals.routeShopSignals === 1 ? "" : "s"}`
    + ` · ${totals.highSeverity} high`
    + ` · ${totals.blockedDirect} blocked direct`
    + ` · ${totals.executionProofs} proof attempt${totals.executionProofs === 1 ? "" : "s"}`;

  return (
    <div className="dm-swarm-cockpit" data-governance-cockpit="" data-governance-status={loaded ? status : "loading"}>
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {loaded ? summaryLine : "Authority supervision"}
        </span>
        <button
          type="button"
          className="dm-btn-ghost"
          onClick={refreshReceipts}
          disabled={loading}
          title="Re-read the receipt stream"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loadError && (
        <div className="dm-helper-error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="dm-btn-ghost" onClick={refreshReceipts} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {!loaded && !loadError && (
        <p className="dm-run-console__hint">Reading the receipt stream…</p>
      )}

      {loaded && (
        <>
          {totals.receipts === 0 ? (
            <p className="dm-run-console__hint">
              No agent activity recorded yet. Once mutations and runs flow through
              the governed lanes, this cockpit correlates a blocked direct attempt
              (PATCH /api/workspace) with a later sandbox-run by the same actor —
              route-shopping — from the receipt stream alone.
            </p>
          ) : signals.length === 0 ? (
            <p className="dm-run-console__hint">
              No route-shopping detected across {totals.receipts} receipt
              {totals.receipts === 1 ? "" : "s"} from {totals.actors} actor
              {totals.actors === 1 ? "" : "s"}. A signal appears here when an actor
              is blocked on the direct lane and then reaches for the same work
              through sandbox-run.
            </p>
          ) : (
            <>
              {attention && (
                <>
                  <span className="dm-field-label">Needs your attention</span>
                  <SignalCard signal={attention} onOpen={handleOpen} emphasis />
                </>
              )}
              {others.length > 0 && (
                <>
                  <span className="dm-run-console__hint">All signals</span>
                  <div className="dm-swarm-cockpit-list" data-governance-list="">
                    {visible.map((signal) => (
                      <SignalCard key={signal.signalId} signal={signal} onOpen={handleOpen} />
                    ))}
                  </div>
                  {overflow > 0 && (
                    <span className="dm-run-console__hint">
                      {`Showing ${visible.length} of ${others.length} signals.`}
                    </span>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default GovernanceCausationCockpit;
