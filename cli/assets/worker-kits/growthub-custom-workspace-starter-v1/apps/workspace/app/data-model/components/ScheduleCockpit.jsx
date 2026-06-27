"use client";

/**
 * ScheduleCockpit — the governed "/schedule" operations surface inside the
 * Workspace Helper sidecar (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1, same
 * primitive class as CeoCockpit).
 *
 *   workspace schedule cockpit =
 *     pure inventory (deriveScheduleCockpit)
 *   + causation-derived readiness (scanServerlessReadiness, via the deriver)
 *   + governed action buttons over the EXISTING schedule routes
 *
 * One universe, same workspace truth, new command entry path. The command is not
 * the feature — it is the canonical entry into the governed schedule universe.
 *
 * Read-only with respect to config: every action hands off to an existing
 * governed schedule route (install/pause/resume/readiness/uninstall) or the
 * Add-ons marketplace setup path. No client-side dataModel PATCH, no new route,
 * no new object type, no second compatibility check, no new visual grammar
 * beyond the existing dm-* primitives.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { deriveScheduleCockpit } from "@/lib/schedule-cockpit-console";

const STATE_VARIANT = {
  scheduled: "ok",
  paused: "pending",
  ready: "active",
  blocked: "fail",
  drifted: "canceled",
};

const SETUP_ROUTE = "/settings/add-ons";

function openWorkflowCanvas(card) {
  if (!card?.objectId || !card?.name) return;
  const params = new URLSearchParams({ object: card.objectId, row: card.name, field: "orchestrationConfig" });
  window.location.assign(`/workflows?${params.toString()}`);
}

function matchesFilter(card, filter) {
  switch (filter) {
    case "all": return true;
    case "scheduled": return card.state === "scheduled" || card.state === "paused";
    case "ready": return card.state === "ready";
    case "blocked": return card.state === "blocked" || card.state === "drifted";
    case "local": return card.locality === "local";
    case "missing-secret": return (card.readiness.deltaTags || []).includes("missing-server-secret");
    case "qstash": return card.provider === "QStash";
    case "custom": return card.provider === "Custom";
    default: return true;
  }
}

// Bound the rendered list so a workspace with hundreds of workflows stays a
// tidy, scrollable list. The attention pick shows above; overflow is disclosed.
const SCHEDULE_VISIBLE_CAP = 60;

function ScheduleCard({ card, onAction, busy, onOpen, onSeed }) {
  const action = card.nextAction;
  const needsAgentUpgrade = (card.readiness.deltaTags || []).includes("local-agent-upgrade-required");
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card"
      data-schedule-card={card.name}
      data-schedule-state={card.state}
    >
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={STATE_VARIANT[card.state] || "pending"} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{card.name}</span>
        <button
          type="button"
          className="dm-btn-ghost dm-swarm-card-action"
          onClick={() => onOpen(card)}
          aria-label={`Open workflow canvas: ${card.name}`}
          title="Open workflow"
        >
          <ArrowUpRight size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint dm-swarm-card-kind">{card.locality === "serverless" ? "Serverless" : "Local"}</span>
        {card.provider && <span className="dm-run-console__hint">{card.provider}</span>}
        {card.cron && <span className="dm-run-console__hint">{card.cron}</span>}
        {card.region && <span className="dm-run-console__hint">{card.region}</span>}
      </div>

      {card.scheduleId && (
        <div className="dm-swarm-card-meta">
          <span className="dm-run-console__hint" title="Installed schedule id">{card.scheduleId}</span>
          {card.lastRunStatus && (
            <span className="dm-run-console__hint">{`Last run ${card.lastRunStatus}`}</span>
          )}
        </div>
      )}

      {card.tags.length > 0 && (
        <div className="dm-schedule-tags">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="dm-schedule-tag"
              data-tag-tone={
                ["Blocked", "Serverless drift", "Missing secret", "Local agent upgrade required", "Last run failed"].includes(tag)
                  ? "alert"
                  : tag === "Scheduled" ? "ok" : "neutral"
              }
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {!card.readiness.ok && card.readiness.helperActions.length > 0 && (
        <div className="dm-helper-stream dm-swarm-card-desc">{card.readiness.helperActions[0]}</div>
      )}

      <div className="dm-schedule-card-actions">
        {/* Primary state action */}
        {action.kind === "setup-provider" ? (
          <button type="button" className="dm-btn-ghost" onClick={() => window.location.assign(SETUP_ROUTE)} disabled={busy}>
            {action.label}
          </button>
        ) : action.kind === "schedule" || action.kind === "manage" ? (
          <button type="button" className="dm-btn-ghost" onClick={() => onOpen(card)} disabled={busy}>
            {action.label}
          </button>
        ) : (
          <button type="button" className="dm-btn-ghost" onClick={() => onAction(action.kind, card)} disabled={busy}>
            {action.label}
          </button>
        )}
        {/* Always-available readiness rescan */}
        <button type="button" className="dm-btn-ghost" onClick={() => onAction("readiness", card)} disabled={busy} title="Run readiness scan">
          Readiness
        </button>
        {/* Lifecycle controls for an installed schedule */}
        {card.scheduleId && card.state !== "paused" && (
          <button type="button" className="dm-btn-ghost" onClick={() => onAction("pause", card)} disabled={busy}>Pause</button>
        )}
        {card.scheduleId && (
          <button type="button" className="dm-btn-ghost" onClick={() => onAction("uninstall", card)} disabled={busy} title="Uninstall & downgrade to local">Downgrade</button>
        )}
        {/* A local-agent node can't run serverless — seed a governed upgrade
            proposal (/swarm or API-backed runtime) rather than scheduling it. */}
        {needsAgentUpgrade && typeof onSeed === "function" && (
          <button
            type="button"
            className="dm-btn-ghost"
            onClick={() => onSeed(`Upgrade the local-agent node(s) in workflow "${card.name}" to an API-backed agent/runtime so it can run serverless:`)}
            disabled={busy}
            title="Seed a governed agent-upgrade proposal"
          >
            Upgrade agent
          </button>
        )}
      </div>
    </div>
  );
}

export function ScheduleCockpit({ workspaceConfig, focus, onConfigRefresh, onOpenArtifact, onSeedSwarm, onOpenSetup }) {
  const [configuredEnvRefs, setConfiguredEnvRefs] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState(focus?.name ? String(focus.name) : "");
  const [busyCard, setBusyCard] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace/env-status", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setConfiguredEnvRefs(Array.isArray(data?.configuredEnvRefs) ? data.configuredEnvRefs : []);
      } catch { /* deriver still renders structure-only readiness */ }
    })();
    (async () => {
      try {
        const res = await fetch("/api/workspace/agent-outcomes");
        const data = await res.json();
        if (cancelled) return;
        setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const model = useMemo(
    () => deriveScheduleCockpit({ workspaceConfig, configuredEnvRefs, receipts }),
    [workspaceConfig, configuredEnvRefs, receipts],
  );

  const providerFor = useCallback((card) => ({
    providerId: card.providerId || model.defaultProvider?.providerId || "upstash",
    productId: card.productId || model.defaultProvider?.productId || "upstash-qstash",
  }), [model.defaultProvider]);

  // All scheduler actions hand off to the EXISTING governed schedule routes.
  // No client-side dataModel PATCH; failures surface the receipt-backed reason.
  const runAction = useCallback(async (kind, card) => {
    setError("");
    setNotice("");
    setBusyCard(card.cardId);
    const { providerId, productId } = providerFor(card);
    const base = `/api/workspace/add-ons/${providerId}/schedule`;
    const body = { productId, objectId: card.objectId, rowId: card.name };
    try {
      let res;
      if (kind === "uninstall") {
        res = await fetch(base, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, action: kind }) });
      }
      const data = await res.json().catch(() => ({}));
      if (kind === "readiness") {
        const r = data?.readiness;
        if (r) setNotice(r.ok ? `${card.name}: serverless-ready (${r.status}).` : `${card.name}: blocked — ${(r.blockingNodes?.[0]?.helperAction) || (r.deltaTags || []).join(", ")}`);
        else setError(data?.error || "Readiness scan failed.");
        return;
      }
      if (!res.ok || data?.ok === false) {
        // Resume re-runs readiness server-side; a 422 means drift blocked it.
        const blocked = data?.readiness?.blockingNodes?.[0]?.helperAction;
        setError(blocked || data?.error || `${kind} failed (HTTP ${res.status}).`);
        return;
      }
      setNotice(`${card.name}: ${kind} ok.`);
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    } catch (err) {
      setError(err?.message || `${kind} failed.`);
    } finally {
      setBusyCard("");
    }
  }, [providerFor, onConfigRefresh]);

  const onOpen = useCallback((card) => {
    // Prefer the governed artifact handoff if the host wired one; else navigate.
    if (typeof onOpenArtifact === "function") {
      onOpenArtifact(card.artifact);
    }
    openWorkflowCanvas(card);
  }, [onOpenArtifact]);

  // ---- empty state: no scheduler product installed ----
  if (model.schedulerSetupState === "none") {
    return (
      <div className="dm-swarm-cockpit" data-schedule-cockpit="" data-schedule-mode="no-provider">
        <div className="dm-helper-toolcall dm-swarm-card">
          <div className="dm-swarm-card-head">
            <span className="dm-run-console__tree-dot" data-variant="pending" />
            <span className="dm-helper-toolcall-title dm-swarm-card-title">No scheduler installed yet</span>
          </div>
          <div className="dm-helper-stream dm-swarm-card-desc">
            Install a scheduler provider to activate Serverless Schedule for workflows.
            Upstash QStash/Workflow is the first-class default; a Custom scheduler plugin works too.
          </div>
          <div className="dm-schedule-card-actions">
            <button type="button" className="dm-btn-ghost" onClick={() => window.location.assign(SETUP_ROUTE)}>
              Set up scheduler
            </button>
            {typeof onOpenSetup === "function" && (
              <button type="button" className="dm-btn-ghost" onClick={onOpenSetup}>Open setup</button>
            )}
          </div>
        </div>
        {model.workflowCards.length > 0 && (
          <p className="dm-run-console__hint">
            {`${model.workflowCards.length} workflow${model.workflowCards.length === 1 ? "" : "s"} in this workspace will become schedulable once a provider is installed.`}
          </p>
        )}
      </div>
    );
  }

  // ---- operational state: inventory ----
  const text = search.trim().toLowerCase();
  const filtered = model.workflowCards.filter(
    (c) => matchesFilter(c, activeFilter)
      && (!text || c.name.toLowerCase().includes(text) || (c.tags || []).some((t) => t.toLowerCase().includes(text))),
  );
  const attention = model.attention && matchesFilter(model.attention, activeFilter) && (!text || model.attention.name.toLowerCase().includes(text))
    ? model.attention
    : null;
  const others = attention ? filtered.filter((c) => c.cardId !== attention.cardId) : filtered;
  const visible = others.slice(0, SCHEDULE_VISIBLE_CAP);
  const overflow = others.length - visible.length;

  return (
    <div className="dm-swarm-cockpit" data-schedule-cockpit="" data-schedule-mode="operational">
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {`${model.counts.total} workflow${model.counts.total === 1 ? "" : "s"} · ${model.counts.scheduled} scheduled · ${model.counts.ready} ready · ${model.counts.blocked + model.counts.drifted} blocked`}
        </span>
        {model.governance.blockedAttempts > 0 && (
          <span className="dm-run-console__hint" title="Blocked governance attempts in the outcome stream">
            {`${model.governance.blockedAttempts} blocked attempt${model.governance.blockedAttempts === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      <div className="dm-schedule-search">
        <Search size={13} aria-hidden="true" />
        <input
          value={search}
          placeholder="Search workflows or tags"
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search scheduled workflows"
        />
      </div>

      <div className="dm-schedule-filters" role="tablist" aria-label="Schedule filters">
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
      {notice && !error && <p className="dm-run-console__hint" data-schedule-notice="">{notice}</p>}

      {attention && (
        <>
          <span className="dm-field-label">Needs your attention</span>
          <ScheduleCard card={attention} onAction={runAction} busy={busyCard === attention.cardId} onOpen={onOpen} onSeed={onSeedSwarm} />
        </>
      )}

      {others.length > 0 ? (
        <>
          <span className="dm-run-console__hint">Workflows</span>
          <div className="dm-ceo-report-list" data-schedule-list="">
            {visible.map((card) => (
              <ScheduleCard key={card.cardId} card={card} onAction={runAction} busy={busyCard === card.cardId} onOpen={onOpen} onSeed={onSeedSwarm} />
            ))}
          </div>
          {overflow > 0 && (
            <span className="dm-run-console__hint">{`Showing ${visible.length} of ${others.length} — refine with search or filters.`}</span>
          )}
        </>
      ) : (
        !attention && <p className="dm-run-console__hint">No workflows match this filter.</p>
      )}
    </div>
  );
}

export default ScheduleCockpit;
