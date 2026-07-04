"use client";

/**
 * PulseCockpit — the governed "/pulse" autonomic heartbeat surface inside the
 * Workspace Helper sidecar (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1, same
 * primitive class as CeoCockpit and ScheduleCockpit).
 *
 *   workspace pulse cockpit =
 *     heartbeat sensors (derivePulseCockpit — stall/timeout/failure detection)
 *   + policy findings (workspace-policy rows = the human objective function)
 *   + governed recovery hand-offs over the EXISTING schedule routes
 *
 * Read-only with respect to config: every recovery hands off to an existing
 * governed route (readiness rescan / resume via the add-ons schedule route),
 * the workflow canvas, /settings surfaces, or seeds a helper proposal. No
 * client-side dataModel PATCH, no new route, no new visual grammar beyond the
 * existing dm-* primitives.
 *
 * Auto-recovery boundary: findings a policy row marked autoApprove may be run
 * in one click ONLY when their recovery is a safe read-only kind (readiness
 * rescan). The deriver clamps everything else to manual — the human gate is
 * the trust boundary, mirrored from the helper propose→apply lane.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { derivePulseCockpit } from "@/lib/autonomic-pulse-console";

const HEARTBEAT_VARIANT = {
  healthy: "ok",
  running: "pending",
  idle: "pending",
  failed: "fail",
  stalled: "canceled",
};

const SEVERITY_TONE = { critical: "alert", warn: "alert", info: "neutral" };

function openWorkflowCanvas(card) {
  if (!card?.objectId || !card?.name) return;
  const params = new URLSearchParams({ object: card.objectId, row: card.name, field: "orchestrationConfig" });
  window.location.assign(`/workflows?${params.toString()}`);
}

function matchesFilter(entry, filter) {
  switch (filter) {
    case "all": return true;
    case "stalled": return entry.heartbeat.state === "stalled";
    case "failed": return entry.heartbeat.state === "failed";
    case "running": return entry.heartbeat.state === "running";
    case "healthy": return entry.heartbeat.state === "healthy";
    case "blocked": return entry.fleetState === "blocked" || entry.fleetState === "drifted";
    default: return true;
  }
}

const PULSE_VISIBLE_CAP = 60;

function HeartbeatCard({ entry, onRecover, busy, onOpen }) {
  const hb = entry.heartbeat;
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card"
      data-pulse-card={entry.name}
      data-pulse-state={hb.state}
    >
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={HEARTBEAT_VARIANT[hb.state] || "pending"} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{entry.name}</span>
        <button
          type="button"
          className="dm-btn-ghost dm-swarm-card-action"
          onClick={() => onOpen(entry)}
          aria-label={`Open workflow canvas: ${entry.name}`}
          title="Open workflow"
        >
          <ArrowUpRight size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint dm-swarm-card-kind">{hb.state}</span>
        {entry.triggerKind && <span className="dm-run-console__hint">{entry.triggerKind}</span>}
        {hb.reason && hb.reason !== "no-clock" && <span className="dm-run-console__hint">{hb.reason}</span>}
      </div>

      {entry.sensorTags.length > 0 && (
        <div className="dm-schedule-tags">
          {entry.sensorTags.map((tag) => (
            <span key={tag} className="dm-schedule-tag" data-tag-tone={["stalled-run", "run-failed", "missing-server-secret"].includes(tag) ? "alert" : "neutral"}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {entry.recovery && (
        <>
          <div className="dm-helper-stream dm-swarm-card-desc">{entry.recovery.explain}</div>
          <div className="dm-schedule-card-actions">
            {entry.recovery.handoff === "add-ons-schedule-route" ? (
              <button type="button" className="dm-btn-ghost" onClick={() => onRecover(entry)} disabled={busy}>
                {entry.recovery.label}
              </button>
            ) : (
              <button type="button" className="dm-btn-ghost" onClick={() => onOpen(entry)} disabled={busy}>
                {entry.recovery.label}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FindingCard({ finding, onRecoverFinding, onSeed, busy }) {
  return (
    <div className="dm-helper-toolcall dm-swarm-card" data-pulse-finding={finding.policyId} data-pulse-severity={finding.severity}>
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={finding.severity === "info" ? "pending" : "fail"} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{finding.policyId}</span>
      </div>
      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint">{finding.ruleKind}</span>
        <span className="dm-run-console__hint">{`observed ${finding.observed} · expected ${finding.expected}`}</span>
      </div>
      <div className="dm-schedule-tags">
        <span className="dm-schedule-tag" data-tag-tone={SEVERITY_TONE[finding.severity] || "neutral"}>{finding.severity}</span>
        <span className="dm-schedule-tag" data-tag-tone="neutral">{finding.sensorTag}</span>
        {finding.autoApprovable && <span className="dm-schedule-tag" data-tag-tone="ok">auto-recovery</span>}
        {finding.autoApproveClamped && <span className="dm-schedule-tag" data-tag-tone="alert">auto-approve clamped</span>}
      </div>
      <div className="dm-helper-stream dm-swarm-card-desc">{finding.message}</div>
      {finding.goal && <div className="dm-helper-stream dm-swarm-card-desc">{`Goal: ${finding.goal}`}</div>}
      <div className="dm-schedule-card-actions">
        {finding.nextAction?.kind === "seed-proposal" ? (
          <button type="button" className="dm-btn-ghost" onClick={() => onSeed(finding)} disabled={busy}>
            {finding.nextAction.label}
          </button>
        ) : (
          <button type="button" className="dm-btn-ghost" onClick={() => onRecoverFinding(finding)} disabled={busy}>
            {finding.nextAction?.label || "Review"}
          </button>
        )}
      </div>
    </div>
  );
}

export function PulseCockpit({ workspaceConfig, onConfigRefresh, onOpenArtifact, onSeedProposal, onOpenSetup }) {
  const [configuredEnvRefs, setConfiguredEnvRefs] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // One clock read per mount keeps the deriver deterministic per render pass.
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace/env-status", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setConfiguredEnvRefs(Array.isArray(data?.configuredEnvRefs) ? data.configuredEnvRefs : []);
      } catch { /* deriver still renders structure-only sensing */ }
    })();
    (async () => {
      try {
        const res = await fetch("/api/workspace/agent-outcomes");
        const data = await res.json();
        if (cancelled) return;
        setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
        setNowMs(Date.now());
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const model = useMemo(
    () => derivePulseCockpit({ workspaceConfig, configuredEnvRefs, receipts, nowMs }),
    [workspaceConfig, configuredEnvRefs, receipts, nowMs],
  );

  // Recovery hands off to the EXISTING governed schedule route: readiness
  // rescan (read-only) and, when the deriver chained it, resume (server-side
  // re-verified). No client-side PATCH; failures surface receipt-backed reasons.
  const recoverHeartbeat = useCallback(async (entry) => {
    setError("");
    setNotice("");
    setBusyId(entry.cardId);
    const providerId = entry.providerId || "upstash";
    const base = `/api/workspace/add-ons/${providerId}/schedule`;
    const body = { productId: entry.productId, objectId: entry.objectId, rowId: entry.name };
    try {
      const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, action: "readiness" }) });
      const data = await res.json().catch(() => ({}));
      const r = data?.readiness;
      if (r && !r.ok) {
        setError(`${entry.name}: blocked — ${(r.blockingNodes?.[0]?.helperAction) || (r.deltaTags || []).join(", ")}`);
        return;
      }
      if (entry.recovery?.then === "resume") {
        const resume = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, action: "resume" }) });
        const resumeData = await resume.json().catch(() => ({}));
        if (!resume.ok || resumeData?.ok === false) {
          setError(resumeData?.error || `${entry.name}: resume blocked after rescan.`);
          return;
        }
      }
      setNotice(`${entry.name}: recovery pass complete.`);
      setNowMs(Date.now());
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    } catch (err) {
      setError(err?.message || "Recovery failed.");
    } finally {
      setBusyId("");
    }
  }, [onConfigRefresh]);

  const recoverFinding = useCallback((finding) => {
    const handoff = finding.nextAction?.handoff;
    if (handoff === "settings-apps") { window.location.assign("/settings/apps"); return; }
    if (handoff === "settings-env") { window.location.assign("/settings"); return; }
    if (handoff === "data-model") { window.location.assign("/data-model"); return; }
    if (handoff === "agent-outcomes" && typeof onOpenSetup === "function") { onOpenSetup(); return; }
    // add-ons-schedule-route findings recover per-card above; surface guidance.
    setNotice(finding.nextAction?.explain || finding.message);
  }, [onOpenSetup]);

  const seedFromFinding = useCallback((finding) => {
    if (typeof onSeedProposal !== "function") return;
    onSeedProposal(
      finding.sensorTag === "pulse-proof-stale"
        ? `Propose a governed loop: create a scheduler-bound "workspace-pulse" heartbeat workflow that reads workspace readiness and outcome receipts each beat, so stalled or failed runs surface with governed recovery:`
        : `Propose a governed repair for policy "${finding.policyId}" (${finding.ruleKind}): ${finding.message}`,
    );
  }, [onSeedProposal]);

  const onOpen = useCallback((entry) => {
    if (typeof onOpenArtifact === "function") onOpenArtifact(entry.artifact);
    openWorkflowCanvas(entry);
  }, [onOpenArtifact]);

  const runAutoRecovery = useCallback(async () => {
    // Only deriver-clamped SAFE findings reach this button; each maps to
    // read-only readiness rescans across affected heartbeat cards.
    const targets = model.heartbeats.filter((h) => h.recovery?.kind === "readiness" && ["stalled", "failed"].includes(h.heartbeat.state));
    for (const entry of targets) {
      // Sequential on purpose: recovery is a governed pass, not a burst.
      // eslint-disable-next-line no-await-in-loop
      await recoverHeartbeat(entry);
    }
  }, [model.heartbeats, recoverHeartbeat]);

  const filtered = model.heartbeats.filter((h) => matchesFilter(h, activeFilter));
  const attentionEntry = model.attention?.kind === "heartbeat" ? model.attention.heartbeat : null;
  const others = attentionEntry ? filtered.filter((h) => h.cardId !== attentionEntry.cardId) : filtered;
  const visible = others.slice(0, PULSE_VISIBLE_CAP);
  const overflow = others.length - visible.length;

  return (
    <div className="dm-swarm-cockpit" data-pulse-cockpit="" data-pulse-mode={model.policySetupState === "none" ? "no-policy" : "operational"}>
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {`${model.counts.workflows} workflow${model.counts.workflows === 1 ? "" : "s"} · ${model.counts.stalled} stalled · ${model.counts.failed} failed · ${model.counts.healthy} healthy`}
        </span>
        {model.governance.blockedAttempts > 0 && (
          <span className="dm-run-console__hint" title="Blocked governance attempts in the outcome stream">
            {`${model.governance.blockedAttempts} blocked attempt${model.governance.blockedAttempts === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint" data-pulse-proof="">
          {model.pulseProof.workflowFound
            ? `Pulse beat: ${model.pulseProof.lastBeatAt || "no proof yet"} (${model.pulseProof.state})`
            : "No workspace-pulse heartbeat workflow yet."}
        </span>
        {model.deployment.projects > 0 && (
          <span className="dm-run-console__hint">
            {`${model.deployment.live} live deployment${model.deployment.live === 1 ? "" : "s"}${model.deployment.errored ? ` · ${model.deployment.errored} errored` : ""}`}
          </span>
        )}
      </div>

      <div className="dm-schedule-filters" role="tablist" aria-label="Pulse filters">
        {model.filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === f.id}
            className={`dm-schedule-filter${activeFilter === f.id ? " is-active" : ""}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {`${f.label} ${f.count}`}
          </button>
        ))}
      </div>

      {error && <div className="dm-helper-error" role="alert"><span>{error}</span></div>}
      {notice && !error && <p className="dm-run-console__hint" data-pulse-notice="">{notice}</p>}

      {model.policySetupState === "none" && (
        <div className="dm-helper-toolcall dm-swarm-card">
          <div className="dm-swarm-card-head">
            <span className="dm-run-console__tree-dot" data-variant="pending" />
            <span className="dm-helper-toolcall-title dm-swarm-card-title">No workspace policies yet</span>
          </div>
          <div className="dm-helper-stream dm-swarm-card-desc">
            Heartbeat sensing runs without setup. Add workspace-policy rows (rules, thresholds,
            your use-case goal) to turn sensing into governed findings — autoApprove may only
            authorize safe read-only recovery.
          </div>
          <div className="dm-schedule-card-actions">
            {typeof onSeedProposal === "function" && (
              <button
                type="button"
                className="dm-btn-ghost"
                onClick={() => onSeedProposal("Create a workspace-policy business object with rows for my rules, thresholds, and use-case goal (ruleKind, threshold, severity, autoApprove, enabled, goal):")}
              >
                Propose policy object
              </button>
            )}
          </div>
        </div>
      )}

      {model.autoApprovable.length > 0 && (
        <div className="dm-schedule-card-actions">
          <button type="button" className="dm-btn-ghost" onClick={runAutoRecovery} disabled={Boolean(busyId)} title="Runs read-only readiness rescans for auto-approved findings">
            {`Run safe auto-recovery (${model.autoApprovable.length})`}
          </button>
        </div>
      )}

      {model.findings.length > 0 && (
        <>
          <span className="dm-field-label">Policy findings</span>
          <div className="dm-ceo-report-list" data-pulse-findings="">
            {model.findings.map((finding) => (
              <FindingCard
                key={`${finding.policyId}::${finding.ruleKind}`}
                finding={finding}
                onRecoverFinding={recoverFinding}
                onSeed={seedFromFinding}
                busy={Boolean(busyId)}
              />
            ))}
          </div>
        </>
      )}

      {attentionEntry && (
        <>
          <span className="dm-field-label">Needs your attention</span>
          <HeartbeatCard entry={attentionEntry} onRecover={recoverHeartbeat} busy={busyId === attentionEntry.cardId} onOpen={onOpen} />
        </>
      )}

      {others.length > 0 ? (
        <>
          <span className="dm-run-console__hint">Heartbeats</span>
          <div className="dm-ceo-report-list" data-pulse-list="">
            {visible.map((entry) => (
              <HeartbeatCard key={entry.cardId} entry={entry} onRecover={recoverHeartbeat} busy={busyId === entry.cardId} onOpen={onOpen} />
            ))}
          </div>
          {overflow > 0 && (
            <span className="dm-run-console__hint">{`Showing ${visible.length} of ${others.length} — refine with filters.`}</span>
          )}
        </>
      ) : (
        !attentionEntry && <p className="dm-run-console__hint">No workflows match this filter.</p>
      )}
    </div>
  );
}

export default PulseCockpit;
