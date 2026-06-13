"use client";

/**
 * EligibilityCockpit — read-only cockpit for the eligibility & causation
 * driver model. Same sidecar shell, same minimal chrome as SwarmRunCockpit
 * (dm-helper-toolcall card surface, dm-run-console dots/hints, dm-db-status
 * chips); zero new lanes, zero mutation, zero new receipt kind.
 *
 * It reads the SHIPPED receipt stream (`GET /api/workspace/agent-outcomes`)
 * and renders the pure derivation from `eligibility-causation.js`:
 *
 *   - Route-shopping detections (blocked untrusted-direct → execution-proof
 *     by the same actor) — the directly-detectable governance signal.
 *   - Per-actor eligibility, each verdict explained by its causal drivers,
 *     every driver citing the receiptIds that produced it.
 *
 * Aggregate-first, calm presentation — the same posture as Workspace Lens.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import { deriveEligibilityModel, ELIGIBILITY_COCKPIT_VIEW } from "./eligibility-causation.js";

const VERDICT_CHIP = {
  blocked: { mod: "bad", label: "Blocked" },
  watch: { mod: "warn", label: "Watch" },
  eligible: { mod: "ok", label: "Eligible" },
  observed: { mod: "", label: "Observed" },
};

const VERDICT_DOT = { blocked: "fail", watch: "active", eligible: "ok", observed: "pending" };

const EFFECT_CHIP = { block: "bad", watch: "warn", eligible: "ok", none: "" };

function StatusChip({ mod, children }) {
  return <span className={"dm-db-status" + (mod ? ` ${mod}` : "")}>{children}</span>;
}

function shortId(receiptId) {
  const id = String(receiptId || "");
  return id.length > 14 ? `…${id.slice(-12)}` : id;
}

function formatWhen(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "—";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return iso;
  }
}

function ActorCard({ actor }) {
  const [open, setOpen] = useState(actor.verdict === "blocked");
  const chip = VERDICT_CHIP[actor.verdict] || VERDICT_CHIP.observed;
  const dot = VERDICT_DOT[actor.verdict] || "pending";
  return (
    <div className="dm-helper-toolcall dm-swarm-card dm-elig-actor" data-elig-verdict={actor.verdict}>
      <button
        type="button"
        className="dm-swarm-card-head dm-elig-actor-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        <span className="dm-run-console__tree-dot" data-variant={dot} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{actor.actor}</span>
        <StatusChip mod={chip.mod}>{chip.label}</StatusChip>
      </button>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint">{`${actor.receipts} receipts`}</span>
        {actor.blockedAttempts > 0 && (
          <span className="dm-run-console__hint">{`${actor.blockedAttempts} blocked`}</span>
        )}
        {actor.routeShoppingEvents > 0 && (
          <span className="dm-run-console__hint">{`${actor.routeShoppingEvents} route-shopping`}</span>
        )}
        <span className="dm-run-console__hint">{formatWhen(actor.lastActivityAt)}</span>
      </div>
      {open && (
        <ul className="dm-elig-drivers">
          {actor.drivers.length === 0 ? (
            <li className="dm-cockpit-receipt">
              <span className="dm-cockpit-receipt-text">No causal drivers — read/observe activity only.</span>
            </li>
          ) : (
            actor.drivers.map((driver) => (
              <li key={driver.code} className="dm-cockpit-receipt dm-elig-driver">
                <StatusChip mod={EFFECT_CHIP[driver.effect]}>{driver.code}</StatusChip>
                <span className="dm-cockpit-receipt-text">
                  {driver.detail}
                  {driver.count > 1 ? ` ×${driver.count}` : ""}
                  {driver.receiptIds.length > 0 && (
                    <span className="dm-elig-refs">
                      {driver.receiptIds.map((id) => (
                        <code key={id} className="dm-elig-ref" title={id}>{shortId(id)}</code>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function RouteShoppingCard({ detection }) {
  return (
    <div className="dm-helper-toolcall dm-swarm-card dm-elig-route" data-elig-severity={detection.severity}>
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant="fail" />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{detection.actor}</span>
        <StatusChip mod={detection.severity === "high" ? "bad" : "warn"}>
          {detection.severity === "high" ? "Shared object" : "Same actor"}
        </StatusChip>
      </div>
      <div className="dm-helper-stream dm-swarm-card-desc">
        Blocked <code className="dm-elig-ref" title={detection.blocked.receiptId}>{shortId(detection.blocked.receiptId)}</code>
        {detection.blocked.violationCodes.length > 0 ? ` (${detection.blocked.violationCodes.join(", ")})` : ""}
        {" → execution-proof "}
        <code className="dm-elig-ref" title={detection.proof.receiptId}>{shortId(detection.proof.receiptId)}</code>
        {detection.sharedObjectIds.length > 0 ? ` on ${detection.sharedObjectIds.join(", ")}` : ""}
      </div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint">{formatWhen(detection.blocked.createdAt)}</span>
        {detection.proof.outcomeStatus && (
          <span className="dm-run-console__hint">{`proof: ${detection.proof.outcomeStatus}`}</span>
        )}
      </div>
    </div>
  );
}

export function EligibilityCockpit() {
  const [receipts, setReceipts] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${ELIGIBILITY_COCKPIT_VIEW.source}?limit=200`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error("Receipt stream unavailable");
      setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
    } catch (err) {
      setError(err?.message || "Could not load the receipt stream.");
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const model = useMemo(() => deriveEligibilityModel(receipts || []), [receipts]);

  return (
    <div className="dm-swarm-cockpit dm-elig-cockpit">
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {model.summary.actors} actors · {model.summary.routeShoppingEvents} route-shopping · {model.summary.receipts} receipts
        </span>
        <button
          type="button"
          className="dm-btn-ghost dm-swarm-card-action"
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          title="Re-read the receipt stream"
        >
          <RefreshCw size={12} aria-hidden="true" />
        </button>
      </div>

      {error && (
        <div className="dm-helper-error" role="alert">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {receipts !== null && model.summary.receipts === 0 && !error && (
        <div className="dm-helper-stream">
          No receipts yet. The eligibility cockpit derives purely from the agent outcome stream — run an agent and its receipts appear here.
        </div>
      )}

      {model.routeShopping.length > 0 && (
        <div className="dm-elig-section">
          <div className="dm-swarm-section-row">
            <span className="dm-helper-toolcall-title">
              <AlertTriangle size={12} aria-hidden="true" /> Route-shopping ({model.routeShopping.length})
            </span>
          </div>
          <div className="dm-swarm-cockpit-list">
            {model.routeShopping.map((detection, i) => (
              <RouteShoppingCard key={`${detection.blocked.receiptId}-${i}`} detection={detection} />
            ))}
          </div>
        </div>
      )}

      {model.actors.length > 0 && (
        <div className="dm-elig-section">
          <div className="dm-swarm-section-row">
            <span className="dm-helper-toolcall-title">
              <ShieldCheck size={12} aria-hidden="true" /> Actor eligibility ({model.actors.length})
            </span>
          </div>
          <div className="dm-swarm-cockpit-list">
            {model.actors.map((actor) => (
              <ActorCard key={actor.actor} actor={actor} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
