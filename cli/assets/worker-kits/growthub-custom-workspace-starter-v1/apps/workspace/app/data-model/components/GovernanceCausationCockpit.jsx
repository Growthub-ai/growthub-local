"use client";

/**
 * GovernanceCausationCockpit — the governed "supervise / audit authority"
 * surface inside the Workspace Helper sidecar
 * (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1 §3 worked example +
 * CEO_PRIMITIVE_COCKPIT_ROADMAP_V1 R3).
 *
 * Read-only. It reads the ONE endpoint that already exists
 * (`GET /api/workspace/agent-outcomes`), runs the PURE deriver
 * (`deriveGovernanceCausation`), and renders confirmed route-shop pairs as
 * "Background tasks"-grammar cards. It adds NO new route, NO new schema, NO new
 * PATCH field, NO new persistence, NO new visual vocabulary:
 *
 *   data lane:  GET /api/workspace/agent-outcomes → receipts[]
 *               → deriveGovernanceCausation({ receipts }) (pure)
 *   surface:    dm-* primitives only; icon set inherited from SwarmRunCockpit
 *               (ArrowUpRight / ChevronDown / ChevronRight).
 *
 * Every "Open" hands off to the EXISTING swarm-run surface for the row that was
 * reached for (when an addressable row is in the signal's objectRefs) — the
 * cockpit never executes and never mutates. Truthful telemetry: an unknown
 * elapsed renders "—", never 0.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { deriveGovernanceCausation } from "@/lib/governance-causation-console";

const STATUS_DOT = {
  clear: "ok",
  watch: "pending",
  alert: "fail",
};

const SEVERITY_LABEL = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function StatusSummary({ model }) {
  const { totals, status } = model;
  const headline = status === "clear"
    ? "No route-shopping detected across the receipt stream."
    : status === "alert"
      ? "Confirmed high-severity route-shopping — review before it repeats."
      : "Route-shopping observed — keep an eye on these actors.";
  return (
    <div className="dm-helper-toolcall dm-swarm-card" data-governance-summary={status}>
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={STATUS_DOT[status] || "pending"} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">Authority supervision</span>
        <span className="dm-run-console__hint">{model.totals.routeShopSignals} signal{model.totals.routeShopSignals === 1 ? "" : "s"}</span>
      </div>
      <div className="dm-helper-stream dm-swarm-card-desc">{headline}</div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint">{totals.receipts} receipt{totals.receipts === 1 ? "" : "s"}</span>
        <span className="dm-run-console__hint">{totals.actors} actor{totals.actors === 1 ? "" : "s"}</span>
        <span className="dm-run-console__hint">{totals.blockedDirect} blocked direct</span>
        <span className="dm-run-console__hint">{totals.executionProofs} proof attempt{totals.executionProofs === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

function ReceiptLine({ label, receiptId, summary }) {
  return (
    <div className="dm-swarm-card-meta" data-governance-receipt={receiptId || ""}>
      <span className="dm-field-label">{label}</span>
      <span className="dm-run-console__hint">{receiptId || "—"}</span>
      {summary ? <span className="dm-run-console__hint">{summary}</span> : null}
    </div>
  );
}

function SignalCard({ signal, expanded, onToggle, onOpen, isAttention }) {
  const target = signal.objectRefs && signal.objectRefs[0];
  const reach = target
    ? `${target.rowName ? `${target.rowName} · ` : ""}${target.objectId}`
    : "no addressable row";
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card"
      data-governance-signal={signal.signalId}
      data-governance-severity={signal.severity}
      data-governance-attention={isAttention ? "true" : "false"}
    >
      <button
        type="button"
        className="dm-helper-toolcall-row dm-swarm-card-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="dm-run-console__tree-dot" data-variant={signal.variant} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{signal.actor}</span>
        <span className="dm-run-console__hint">{SEVERITY_LABEL[signal.severity] || signal.severity}</span>
        {expanded
          ? <ChevronDown size={14} className="dm-helper-toolcall-chevron" aria-hidden="true" />
          : <ChevronRight size={14} className="dm-helper-toolcall-chevron" aria-hidden="true" />}
      </button>
      <div className="dm-helper-stream dm-swarm-card-desc">{signal.headline}</div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint dm-swarm-card-kind">Route-shop</span>
        <span className="dm-run-console__hint">{signal.elapsedLabel} elapsed</span>
        <span className="dm-run-console__hint">{signal.followOnSucceeded ? "proof accepted" : "proof held"}</span>
        {signal.handoff && (
          <button
            type="button"
            className="dm-btn-ghost dm-swarm-card-action"
            onClick={() => onOpen(signal.handoff)}
            aria-label={`Open ${reach} in Background tasks`}
            title="Open the targeted workflow in Background tasks"
          >
            Open
            <ArrowUpRight size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="dm-helper-toolcall-body">
          <ReceiptLine label="Blocked (direct)" receiptId={signal.blockedReceiptId} summary={signal.blockedSummary} />
          <ReceiptLine label="Follow-on (proof)" receiptId={signal.followOnReceiptId} summary={signal.followOnSummary} />
          <div className="dm-swarm-card-meta">
            <span className="dm-field-label">Reached for</span>
            <span className="dm-run-console__hint">{reach}</span>
          </div>
          {signal.policyVerdict && signal.policyVerdict.violationCodes.length > 0 && (
            <div className="dm-swarm-card-meta">
              <span className="dm-field-label">Why the direct lane refused</span>
              <span className="dm-run-console__hint">{signal.policyVerdict.violationCodes.join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GovernanceCausationCockpit({ onOpenArtifact }) {
  const [receipts, setReceipts] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const refreshReceipts = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/agent-outcomes");
      const data = await res.json();
      setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
      setLoadError("");
    } catch (err) {
      // Non-fatal — the cockpit renders a clear state and a retry affordance.
      setLoadError(err?.message || "Could not load the receipt stream.");
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

  return (
    <div className="dm-swarm-cockpit" data-governance-cockpit="" data-governance-status={model.status}>
      {loadError && (
        <div className="dm-helper-error" role="alert">
          <span>{loadError}</span>
        </div>
      )}
      <StatusSummary model={model} />
      <div className="dm-swarm-cockpit-list">
        {model.signals.length === 0 ? (
          <p className="dm-run-console__hint">
            No route-shopping detected. A signal appears here when an actor is
            blocked on the direct lane (PATCH /api/workspace) and then reaches for
            the same work through sandbox-run — the receipt stream already records
            every byte this needs.
          </p>
        ) : (
          model.signals.map((signal) => (
            <SignalCard
              key={signal.signalId}
              signal={signal}
              expanded={expandedId === signal.signalId}
              isAttention={model.attention?.signalId === signal.signalId}
              onToggle={() => setExpandedId((prev) => (prev === signal.signalId ? null : signal.signalId))}
              onOpen={handleOpen}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default GovernanceCausationCockpit;
