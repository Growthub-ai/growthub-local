"use client";

/**
 * DataCockpit — the governed "/data" operations surface inside the
 * Workspace Helper sidecar (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1, same
 * primitive class as CeoCockpit and ScheduleCockpit).
 *
 *   workspace data cockpit =
 *     pure inventory (deriveDataCockpit)
 *   + lane-derived database capability (workspace-data, via the deriver)
 *   + governed action buttons over the EXISTING add-ons /data route
 *
 * One universe, same workspace truth, new command entry path. The command is not
 * the feature — it is the canonical entry into the governed data-sync universe.
 *
 * Read-only with respect to config: every action hands off to an existing
 * governed data route action (install-object/pull/push/bind-object) or the
 * Add-ons marketplace setup path. No client-side dataModel PATCH, no new route,
 * no new object type, no second capability check, no new visual grammar
 * beyond the existing dm-* primitives.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { deriveDataCockpit } from "@/lib/data-cockpit-console";

const STATE_VARIANT = {
  synced: "ok",
  "never-synced": "pending",
  blocked: "fail",
};

const SETUP_ROUTE = "/settings/add-ons";

function openDataModelObject(card) {
  if (!card?.objectId) return;
  const params = new URLSearchParams({ object: card.objectId });
  window.location.assign(`/data-model?${params.toString()}`);
}

function matchesFilter(card, filter) {
  if (filter === "all") return true;
  return card.filterBucket === filter;
}

// Bound the rendered list so a workspace with hundreds of synced tables stays
// a tidy, scrollable list. The attention pick shows above; overflow is disclosed.
const DATA_VISIBLE_CAP = 60;

function DataSyncCard({ card, onAction, busy, onOpen }) {
  const action = card.nextAction;
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card"
      data-data-card={card.name}
      data-data-state={card.state}
    >
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={STATE_VARIANT[card.state] || "pending"} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title">{card.name}</span>
        <button
          type="button"
          className="dm-btn-ghost dm-swarm-card-action"
          onClick={() => onOpen(card)}
          aria-label={`Open synced object: ${card.name}`}
          title="Open in Data Model"
        >
          <ArrowUpRight size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="dm-swarm-card-meta">
        <span className="dm-run-console__hint dm-swarm-card-kind">{card.provider}</span>
        {card.externalTable && <span className="dm-run-console__hint" title="External table">{card.externalTable}</span>}
        <span className="dm-run-console__hint">{`${card.rowCount} row${card.rowCount === 1 ? "" : "s"}`}</span>
        {card.correlationKey && <span className="dm-run-console__hint" title="Correlation key">{`key ${card.correlationKey}`}</span>}
      </div>

      {(card.lastSyncSummary || card.lastSyncReceiptId) && (
        <div className="dm-swarm-card-meta">
          {card.lastSyncSummary && (
            <span className="dm-run-console__hint" title="Last sync proof">{card.lastSyncSummary}</span>
          )}
          {card.lastSyncReceiptId && (
            <span className="dm-run-console__hint" title="Last sync receipt id">{card.lastSyncReceiptId}</span>
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
                tag === "Blocked" || tag.endsWith("conflicts")
                  ? "alert"
                  : tag === "Pulled" || tag === "Pushed" ? "ok" : "neutral"
              }
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {card.state === "blocked" && card.missingEnv.length > 0 && (
        <div className="dm-helper-stream dm-swarm-card-desc">
          {`Resolve provider env before syncing: ${card.missingEnv.join(", ")}.`}
        </div>
      )}

      <div className="dm-schedule-card-actions">
        {/* Primary state action */}
        {action.kind === "setup-provider" ? (
          <button type="button" className="dm-btn-ghost" onClick={() => window.location.assign(SETUP_ROUTE)} disabled={busy}>
            {action.label}
          </button>
        ) : (
          <button type="button" className="dm-btn-ghost" onClick={() => onAction(action.kind, card)} disabled={busy}>
            {action.label}
          </button>
        )}
        {/* Push is available once the binding can execute — local rows win. */}
        {card.state !== "blocked" && card.rowCount > 0 && (
          <button type="button" className="dm-btn-ghost" onClick={() => onAction("push", card)} disabled={busy} title="Push local rows to the external table">
            Push
          </button>
        )}
      </div>
    </div>
  );
}

export function DataCockpit({ workspaceConfig, onConfigRefresh, onOpenArtifact, onOpenSetup }) {
  const [configuredEnvRefs, setConfiguredEnvRefs] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busyCard, setBusyCard] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // External table inventory from the governed data route (read-only GET).
  const [envReady, setEnvReady] = useState(false);
  const [tables, setTables] = useState([]);
  const [tablesLoaded, setTablesLoaded] = useState(false);
  const [selectedTable, setSelectedTable] = useState("");

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
    () => deriveDataCockpit({ workspaceConfig, configuredEnvRefs, receipts }),
    [workspaceConfig, configuredEnvRefs, receipts],
  );

  const defaultProviderId = model.defaultProvider?.providerId || "supabase";

  const providerFor = useCallback((card) => ({
    providerId: card?.providerId || defaultProviderId,
  }), [defaultProviderId]);

  // Table inventory for the bind section — the governed GET reports envReady
  // alongside the PostgREST table probe; nothing here is guessed client-side.
  useEffect(() => {
    if (model.dataSetupState === "none") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspace/add-ons/${defaultProviderId}/data`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setEnvReady(Boolean(data?.envReady));
        const list = Array.isArray(data?.tables) ? data.tables : [];
        setTables(list);
        setSelectedTable((current) => current || list[0]?.name || "");
      } catch {
        if (!cancelled) { setEnvReady(false); setTables([]); }
      } finally {
        if (!cancelled) setTablesLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [defaultProviderId, model.dataSetupState]);

  // All data actions hand off to the EXISTING governed add-ons /data route.
  // No client-side dataModel PATCH; failures surface the receipt-backed reason.
  const postDataAction = useCallback(async ({ busyId, body, okNotice }) => {
    setError("");
    setNotice("");
    setBusyCard(busyId);
    const { providerId } = providerFor(body.card);
    try {
      const res = await fetch(`/api/workspace/add-ons/${providerId}/data`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body.payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const missing = Array.isArray(data?.missingEnv) && data.missingEnv.length
          ? ` Missing env: ${data.missingEnv.join(", ")}.`
          : "";
        setError(`${data?.error || `${body.payload.action} failed (HTTP ${res.status}).`}${missing}`);
        return;
      }
      const summary = data?.object?.lastSyncSummary || "";
      setNotice(summary ? `${okNotice} ${summary}` : okNotice);
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    } catch (err) {
      setError(err?.message || `${body.payload.action} failed.`);
    } finally {
      setBusyCard("");
    }
  }, [providerFor, onConfigRefresh]);

  const runAction = useCallback((kind, card) => postDataAction({
    busyId: card.cardId,
    body: { card, payload: { action: kind, objectId: card.objectId } },
    okNotice: `${card.name}: ${kind} ok.`,
  }), [postDataAction]);

  const runBind = useCallback((object) => postDataAction({
    busyId: object.objectId,
    body: { card: null, payload: { action: "bind-object", objectId: object.objectId, table: selectedTable } },
    okNotice: `${object.label}: bound to ${selectedTable}.`,
  }), [postDataAction, selectedTable]);

  const runInstall = useCallback(() => postDataAction({
    busyId: "__install-object__",
    body: { card: null, payload: { action: "install-object", table: selectedTable } },
    okNotice: `${selectedTable}: mirrored into the Data Model.`,
  }), [postDataAction, selectedTable]);

  const onOpen = useCallback((card) => {
    // Prefer the governed artifact handoff if the host wired one; else navigate.
    if (typeof onOpenArtifact === "function") {
      onOpenArtifact(card.artifact);
    }
    openDataModelObject(card);
  }, [onOpenArtifact]);

  // ---- empty state: no database product installed/verified ----
  if (model.dataSetupState === "none") {
    return (
      <div className="dm-swarm-cockpit" data-data-cockpit="" data-data-mode="no-provider">
        <div className="dm-helper-toolcall dm-swarm-card">
          <div className="dm-swarm-card-head">
            <span className="dm-run-console__tree-dot" data-variant="pending" />
            <span className="dm-helper-toolcall-title dm-swarm-card-title">No database product installed yet</span>
          </div>
          <div className="dm-helper-stream dm-swarm-card-desc">
            Install a database provider to sync external tables into governed workspace objects.
            Supabase Postgres (PostgREST) is the first-class default; any workspace-data product works too.
          </div>
          <div className="dm-schedule-card-actions">
            <button type="button" className="dm-btn-ghost" onClick={() => window.location.assign(model.setupRoute || SETUP_ROUTE)}>
              Set up database
            </button>
            {typeof onOpenSetup === "function" && (
              <button type="button" className="dm-btn-ghost" onClick={onOpenSetup}>Open setup</button>
            )}
          </div>
        </div>
        {model.bindableObjects.length > 0 && (
          <p className="dm-run-console__hint">
            {`${model.bindableObjects.length} object${model.bindableObjects.length === 1 ? "" : "s"} in this workspace will become bindable once a database product is verified.`}
          </p>
        )}
      </div>
    );
  }

  // ---- operational state: inventory ----
  const text = search.trim().toLowerCase();
  const matchesText = (card) => !text
    || card.name.toLowerCase().includes(text)
    || card.externalTable.toLowerCase().includes(text)
    || (card.tags || []).some((tag) => tag.toLowerCase().includes(text));
  const filtered = model.syncCards.filter((card) => matchesFilter(card, activeFilter) && matchesText(card));
  const attention = model.attention && matchesFilter(model.attention, activeFilter) && matchesText(model.attention)
    ? model.attention
    : null;
  const others = attention ? filtered.filter((card) => card.cardId !== attention.cardId) : filtered;
  const visible = others.slice(0, DATA_VISIBLE_CAP);
  const overflow = others.length - visible.length;

  return (
    <div className="dm-swarm-cockpit" data-data-cockpit="" data-data-mode="operational">
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {`${model.counts.total} synced object${model.counts.total === 1 ? "" : "s"} · ${model.counts.synced} synced · ${model.counts.neverSynced} never synced · ${model.counts.blocked} blocked`}
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
          placeholder="Search synced objects, tables, or tags"
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search synced objects"
        />
      </div>

      <div className="dm-schedule-filters" role="tablist" aria-label="Data sync filters">
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
      {notice && !error && <p className="dm-run-console__hint" data-data-notice="">{notice}</p>}

      {attention && (
        <>
          <span className="dm-field-label">Needs your attention</span>
          <DataSyncCard card={attention} onAction={runAction} busy={busyCard === attention.cardId} onOpen={onOpen} />
        </>
      )}

      {others.length > 0 ? (
        <>
          <span className="dm-run-console__hint">Synced objects</span>
          <div className="dm-ceo-report-list" data-data-list="">
            {visible.map((card) => (
              <DataSyncCard key={card.cardId} card={card} onAction={runAction} busy={busyCard === card.cardId} onOpen={onOpen} />
            ))}
          </div>
          {overflow > 0 && (
            <span className="dm-run-console__hint">{`Showing ${visible.length} of ${others.length} — refine with search or filters.`}</span>
          )}
        </>
      ) : (
        !attention && <p className="dm-run-console__hint">No synced objects match this filter.</p>
      )}

      {/* Bind section — every affordance is a hand-off to the governed data
          route (install-object mirrors a table; bind-object binds an existing
          governed object). Tables come from the route's read-only inventory. */}
      <span className="dm-field-label">Bind an external table</span>
      {!tablesLoaded ? (
        <p className="dm-run-console__hint">Loading external table inventory…</p>
      ) : !envReady ? (
        <p className="dm-run-console__hint">
          External tables unavailable — verify the database product in the Add-ons Marketplace, then reopen /data.
        </p>
      ) : (
        <>
          <div className="dm-swarm-section-row" data-data-bind-controls="">
            <select
              className="dm-helper-setup-select"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              aria-label="External table"
              disabled={!tables.length}
            >
              {tables.length
                ? tables.map((table) => <option key={table.name} value={table.name}>{table.name}</option>)
                : <option value="">No tables discovered</option>}
            </select>
            <button
              type="button"
              className="dm-btn-ghost"
              onClick={runInstall}
              disabled={!selectedTable || busyCard === "__install-object__"}
              title="Mirror this table into a new governed data-source object (initial pull)"
            >
              Mirror table
            </button>
          </div>
          {model.bindableObjects.length > 0 ? (
            <div className="dm-ceo-report-list" data-data-bind-list="">
              {model.bindableObjects.map((object) => (
                <div className="dm-helper-toolcall dm-swarm-card" key={object.objectId} data-data-bindable={object.objectId}>
                  <div className="dm-swarm-card-head">
                    <span className="dm-helper-toolcall-title dm-swarm-card-title">{object.label}</span>
                  </div>
                  <div className="dm-swarm-card-meta">
                    <span className="dm-run-console__hint dm-swarm-card-kind">{object.objectType}</span>
                    <span className="dm-run-console__hint">{`${object.rowCount} row${object.rowCount === 1 ? "" : "s"}`}</span>
                  </div>
                  <div className="dm-schedule-card-actions">
                    <button
                      type="button"
                      className="dm-btn-ghost"
                      onClick={() => runBind(object)}
                      disabled={!selectedTable || busyCard === object.objectId}
                      title={selectedTable ? `Bind ${object.label} to ${selectedTable}` : "Pick an external table first"}
                    >
                      {selectedTable ? `Bind to ${selectedTable}` : "Bind"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="dm-run-console__hint">No unbound objects eligible for binding.</p>
          )}
        </>
      )}
    </div>
  );
}

export default DataCockpit;
