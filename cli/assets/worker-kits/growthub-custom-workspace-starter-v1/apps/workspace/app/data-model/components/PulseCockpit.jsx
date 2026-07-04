"use client";

/**
 * PulseCockpit — the governed "/pulse" autonomic heartbeat surface inside the
 * Workspace Helper sidecar (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1, same
 * primitive class as CeoCockpit and ScheduleCockpit — including its TAB
 * condensation pattern).
 *
 * Four tabs, one job each:
 *   Attention — the single most valuable next move, plain language, with
 *               causation-derived one-click actions (fix / open / delegate).
 *   Checks    — the heartbeat fleet at any scale: search + real-state filters,
 *               fixed-shape truncated cards, windowed list.
 *   Policies  — the human rules table, edited in a sub-panel whose Save
 *               writes the SAME atomic workspace-policy rows through the
 *               existing governed PATCH lane (no side store, no new route).
 *   Report    — the daily digest: last-24h outcomes, insights, and the
 *               self-run checklist (heartbeat, coverage, auto-recovery) with
 *               governed one-click seeds for every missing step.
 *
 * Status language: real states with real capitalization (Stalled, Failed,
 * Running, Healthy, Idle) — no synthetic chips, no slug pills. Cards keep a
 * fixed shape regardless of content length (single truncated reason line).
 *
 * Mutation boundary: recovery = existing schedule route (read-only readiness;
 * resume only on the per-card human click); delegation/creation = seeded
 * helper proposals; policy edits = PATCH /api/workspace {dataModel} — the
 * exact lane the canvas uses. No new route, no client-side side state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Search, Settings2 } from "lucide-react";
import { derivePulseCockpit, PULSE_RULE_KINDS, WORKSPACE_POLICY_OBJECT_ID } from "@/lib/autonomic-pulse-console";

const HEARTBEAT_VARIANT = {
  healthy: "ok",
  running: "pending",
  idle: "pending",
  failed: "fail",
  stalled: "canceled",
};

function openWorkflowCanvas(entry) {
  if (!entry?.objectId || !entry?.name) return;
  const params = new URLSearchParams({ object: entry.objectId, row: entry.name, field: "orchestrationConfig" });
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

/* ---------------- Checks tab: fixed-shape heartbeat card ---------------- */

function HeartbeatCard({ entry, onRecover, busy, onOpen, onDelegate }) {
  const viaScheduleRoute = entry.recovery?.handoff === "add-ons-schedule-route";
  return (
    <div
      className="dm-helper-toolcall dm-swarm-card dm-pulse-card"
      data-pulse-card={entry.name}
      data-pulse-state={entry.heartbeat.state}
    >
      <div className="dm-swarm-card-head">
        <span className="dm-run-console__tree-dot" data-variant={HEARTBEAT_VARIANT[entry.heartbeat.state] || "pending"} />
        <span className="dm-helper-toolcall-title dm-swarm-card-title dm-pulse-truncate">{entry.name}</span>
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
        <span className="dm-run-console__hint dm-swarm-card-kind">{entry.statusLabel}</span>
        {entry.triggerKind && <span className="dm-run-console__hint">{entry.triggerKind}</span>}
        {entry.swarm && (
          <span className="dm-run-console__hint">
            {`Swarm${entry.swarm.lastRun?.score != null ? ` · score ${entry.swarm.lastRun.score}` : ""}${entry.swarm.lastRun?.totalTokens != null ? ` · ${entry.swarm.lastRun.totalTokens} tokens` : ""}${!entry.swarm.eligibilityReady ? " · Not runnable" : ""}`}
          </span>
        )}
        {entry.agentNodes && (
          <span className="dm-run-console__hint">
            {`${entry.agentNodes.count} agent step${entry.agentNodes.count === 1 ? "" : "s"}${entry.agentNodes.failed.length ? ` · ${entry.agentNodes.failed.length} failed` : ""}`}
          </span>
        )}
      </div>

      {entry.reasonLine && <div className="dm-run-console__hint dm-pulse-truncate">{entry.reasonLine}</div>}

      {(entry.recovery || entry.delegate) && (
        <div className="dm-schedule-card-actions">
          {entry.recovery && (
            <button
              type="button"
              className="dm-btn-ghost"
              onClick={() => (viaScheduleRoute ? onRecover(entry, { chain: true }) : onOpen(entry))}
              disabled={busy}
              title={entry.recovery.explain}
            >
              {entry.recovery.label}
            </button>
          )}
          {entry.delegate && (
            <button
              type="button"
              className="dm-btn-ghost"
              onClick={() => onDelegate(entry.delegate)}
              disabled={busy}
              title="Draft a governed agent-swarm proposal to diagnose and heal this workflow — you review it before anything runs"
            >
              {entry.delegate.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Attention tab: headline + plain-language findings ---------------- */

function AttentionView({ model, busyId, onRecover, onOpen, onDelegate, onRecoverFinding, onSeed }) {
  const a = model.attention;
  return (
    <div className="dm-pulse-section">
      {a ? (
        <div
          className="dm-helper-toolcall dm-swarm-card dm-pulse-card"
          data-pulse-attention=""
          data-pulse-card={a.kind === "heartbeat" ? a.heartbeat.name : undefined}
          data-pulse-state={a.kind === "heartbeat" ? a.heartbeat.heartbeat.state : undefined}
        >
          <div className="dm-swarm-card-head">
            <span className="dm-run-console__tree-dot" data-variant="fail" />
            <span className="dm-helper-toolcall-title dm-swarm-card-title dm-pulse-truncate">{a.headline}</span>
          </div>
          {a.explain && <div className="dm-helper-stream dm-swarm-card-desc dm-pulse-clamp">{a.explain}</div>}
          <div className="dm-schedule-card-actions">
            {a.kind === "heartbeat" && a.oneClick && (
              a.heartbeat.recovery?.handoff === "add-ons-schedule-route" ? (
                <button type="button" className="dm-btn-ghost" disabled={Boolean(busyId)} title={a.oneClick.does} onClick={() => onRecover(a.heartbeat, { chain: true })}>
                  {a.oneClick.label}
                </button>
              ) : (
                <button type="button" className="dm-btn-ghost" disabled={Boolean(busyId)} title={a.oneClick.does} onClick={() => onOpen(a.heartbeat)}>
                  {a.oneClick.label}
                </button>
              )
            )}
            {a.kind === "heartbeat" && a.delegate && (
              <button type="button" className="dm-btn-ghost" disabled={Boolean(busyId)} onClick={() => onDelegate(a.delegate)}>
                {a.delegate.label}
              </button>
            )}
            {a.kind === "finding" && a.oneClick && (
              <button type="button" className="dm-btn-ghost" disabled={Boolean(busyId)} title={a.oneClick.does} onClick={() => (a.finding.nextAction?.kind === "seed-proposal" ? onSeed(a.finding.nextAction) : onRecoverFinding(a.finding))}>
                {a.oneClick.label}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="dm-run-console__hint">Nothing needs you right now. The pulse keeps watching.</p>
      )}

      {model.findings.length > 0 && (
        <>
          <span className="dm-field-label">Rule checks that fired</span>
          <div className="dm-ceo-report-list" data-pulse-findings="">
            {model.findings.map((finding) => (
              <div key={`${finding.policyId}::${finding.ruleKind}`} className="dm-helper-toolcall dm-swarm-card dm-pulse-card" data-pulse-finding={finding.policyId} data-pulse-severity={finding.severity}>
                <div className="dm-swarm-card-head">
                  <span className="dm-run-console__tree-dot" data-variant={finding.severity === "critical" ? "fail" : "pending"} />
                  <span className="dm-helper-toolcall-title dm-swarm-card-title dm-pulse-truncate">{finding.plain.title}</span>
                  {finding.severity === "critical" && <span className="dm-run-console__hint">Critical</span>}
                </div>
                <div className="dm-helper-stream dm-swarm-card-desc dm-pulse-clamp">{finding.plain.why}</div>
                <div className="dm-schedule-card-actions">
                  {finding.nextAction?.kind === "seed-proposal" ? (
                    <button type="button" className="dm-btn-ghost" disabled={Boolean(busyId)} title={finding.plain.actionDoes} onClick={() => onSeed(finding.nextAction)}>
                      {finding.nextAction.label}
                    </button>
                  ) : (
                    <button type="button" className="dm-btn-ghost" disabled={Boolean(busyId)} title={finding.plain.actionDoes} onClick={() => onRecoverFinding(finding)}>
                      {finding.nextAction?.label || "Review"}
                    </button>
                  )}
                  <span className="dm-run-console__hint dm-pulse-truncate" title={finding.plain.actionOutcome}>{finding.plain.actionDoes}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Policies tab: atomic-table editor sub-panel ---------------- */

const EMPTY_DRAFT = { Name: "", ruleKind: "max-failed-runs", threshold: "0", severity: "warn", autoApprove: "false", enabled: "true", goal: "", description: "" };

function PoliciesView({ model, workspaceConfig, onConfigRefresh, onSeed }) {
  const [editing, setEditing] = useState(null); // draft row object or null
  const [editingIndex, setEditingIndex] = useState(-1); // -1 = new row
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const policyObject = useMemo(() => {
    const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
    return objects.find((o) => String(o?.id || "") === WORKSPACE_POLICY_OBJECT_ID
      || String(o?.label || o?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") === WORKSPACE_POLICY_OBJECT_ID) || null;
  }, [workspaceConfig]);

  // Save writes the SAME atomic rows through the governed PATCH lane the
  // canvas uses: clone dataModel, replace/append the row, PATCH, re-derive.
  const saveDraft = useCallback(async () => {
    if (!policyObject || !editing) return;
    if (!String(editing.Name || "").trim()) { setError("Give the rule a name."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const dataModel = JSON.parse(JSON.stringify(workspaceConfig.dataModel));
      const obj = (dataModel.objects || []).find((o) => String(o?.id || "") === String(policyObject.id));
      if (!obj) throw new Error("Policy table not found.");
      obj.rows = Array.isArray(obj.rows) ? obj.rows : [];
      if (editingIndex >= 0 && editingIndex < obj.rows.length) obj.rows[editingIndex] = { ...obj.rows[editingIndex], ...editing };
      else obj.rows.push({ ...editing });
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.workspaceConfig) throw new Error(payload?.error || "Save was blocked by workspace policy.");
      setNotice(`Saved "${editing.Name}" — the pulse evaluates it on the next beat.`);
      setEditing(null);
      setEditingIndex(-1);
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    } catch (err) {
      setError(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [policyObject, editing, editingIndex, workspaceConfig, onConfigRefresh]);

  if (!policyObject) {
    return (
      <div className="dm-pulse-section">
        <div className="dm-helper-toolcall dm-swarm-card dm-pulse-card">
          <div className="dm-swarm-card-head">
            <span className="dm-run-console__tree-dot" data-variant="pending" />
            <span className="dm-helper-toolcall-title dm-swarm-card-title">No rules table yet</span>
          </div>
          <div className="dm-helper-stream dm-swarm-card-desc">
            Your rules and use-case goal live as ordinary rows in a business object you own.
            Create it once; every rule you add is evaluated on each pulse beat.
          </div>
          <div className="dm-schedule-card-actions">
            <button
              type="button"
              className="dm-btn-ghost"
              onClick={() => onSeed({ seedIntent: "create_object", seedPrompt: "Create a custom business object named \"workspace-policy\" with columns ruleKind, threshold, severity, autoApprove, enabled, goal, description — rows will hold my pulse rules and use-case goal:" })}
            >
              Create rules table
            </button>
          </div>
        </div>
      </div>
    );
  }

  const rows = Array.isArray(policyObject.rows) ? policyObject.rows : [];

  return (
    <div className="dm-pulse-section" data-pulse-policies="">
      {error && <div className="dm-helper-error" role="alert"><span>{error}</span></div>}
      {notice && !error && <p className="dm-run-console__hint">{notice}</p>}

      {editing ? (
        <div className="dm-helper-toolcall dm-swarm-card dm-pulse-card" data-pulse-policy-editor="">
          <div className="dm-swarm-card-head">
            <span className="dm-helper-toolcall-title dm-swarm-card-title">{editingIndex >= 0 ? `Edit "${editing.Name}"` : "New rule"}</span>
          </div>
          <div className="dm-pulse-editor-grid">
            <label>Name<input value={editing.Name} onChange={(e) => setEditing({ ...editing, Name: e.target.value })} placeholder="e.g. no-stalls" /></label>
            <label>Rule
              <select value={editing.ruleKind} onChange={(e) => setEditing({ ...editing, ruleKind: e.target.value })}>
                {PULSE_RULE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label>Threshold<input type="number" value={editing.threshold} onChange={(e) => setEditing({ ...editing, threshold: e.target.value })} /></label>
            <label>Severity
              <select value={editing.severity} onChange={(e) => setEditing({ ...editing, severity: e.target.value })}>
                <option value="info">info</option><option value="warn">warn</option><option value="critical">critical</option>
              </select>
            </label>
            <label className="dm-pulse-editor-wide">Goal<input value={editing.goal} onChange={(e) => setEditing({ ...editing, goal: e.target.value })} placeholder="What outcome does this rule protect?" /></label>
            <label>Enabled
              <select value={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.value })}>
                <option value="true">true</option><option value="false">false</option>
              </select>
            </label>
            <label>Auto-recovery
              <select value={editing.autoApprove} onChange={(e) => setEditing({ ...editing, autoApprove: e.target.value })}>
                <option value="false">off</option><option value="true">safe checks only</option>
              </select>
            </label>
          </div>
          <div className="dm-schedule-card-actions">
            <button type="button" className="dm-btn-ghost" onClick={saveDraft} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" className="dm-btn-ghost" onClick={() => { setEditing(null); setEditingIndex(-1); }} disabled={saving}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="dm-schedule-card-actions">
          <button type="button" className="dm-btn-ghost" onClick={() => { setEditing({ ...EMPTY_DRAFT }); setEditingIndex(-1); }}>New rule</button>
        </div>
      )}

      <div className="dm-ceo-report-list">
        {rows.map((row, index) => (
          <div key={`${row?.Name || "rule"}-${index}`} className="dm-helper-toolcall dm-swarm-card dm-pulse-card" data-pulse-policy={row?.Name || ""}>
            <div className="dm-swarm-card-head">
              <span className="dm-run-console__tree-dot" data-variant={String(row?.enabled) === "false" ? "pending" : "ok"} />
              <span className="dm-helper-toolcall-title dm-swarm-card-title dm-pulse-truncate">{row?.Name || "(unnamed)"}</span>
              <button
                type="button"
                className="dm-btn-ghost dm-swarm-card-action"
                onClick={() => { setEditing({ ...EMPTY_DRAFT, ...row }); setEditingIndex(index); }}
                aria-label={`Edit rule ${row?.Name || index}`}
                title="Edit rule"
              >
                <Settings2 size={12} aria-hidden="true" />
              </button>
            </div>
            <div className="dm-swarm-card-meta">
              <span className="dm-run-console__hint">{String(row?.ruleKind || "")}</span>
              <span className="dm-run-console__hint">{`limit ${String(row?.threshold ?? "0")}`}</span>
              <span className="dm-run-console__hint">{String(row?.severity || "warn")}</span>
              {String(row?.enabled) === "false" && <span className="dm-run-console__hint">Off</span>}
            </div>
            {row?.goal && <div className="dm-run-console__hint dm-pulse-truncate">{`Goal: ${row.goal}`}</div>}
          </div>
        ))}
        {rows.length === 0 && <p className="dm-run-console__hint">No rules yet — add your first with New rule.</p>}
      </div>
    </div>
  );
}

/* ---------------- Report tab: daily digest + self-run checklist ---------------- */

function ReportView({ model, onSeed }) {
  const r = model.report;
  return (
    <div className="dm-pulse-section" data-pulse-report="">
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">{r.windowLabel}</span>
        <span className="dm-run-console__hint">{`${r.runsOk} run${r.runsOk === 1 ? "" : "s"} ok · ${r.runsFailed} failed`}</span>
      </div>
      <div className="dm-ceo-report-list">
        {r.insights.map((line) => (
          <div key={line} className="dm-helper-toolcall dm-swarm-card dm-pulse-card">
            <div className="dm-helper-stream dm-swarm-card-desc dm-pulse-clamp">{line}</div>
          </div>
        ))}
      </div>

      <span className="dm-field-label">{`Self-running workspace — ${r.selfRunComplete}/${r.selfRunTotal}`}</span>
      <div className="dm-ceo-report-list">
        {r.selfRun.map((step) => (
          <div key={step.id} className="dm-helper-toolcall dm-swarm-card dm-pulse-card" data-pulse-selfrun={step.id}>
            <div className="dm-swarm-card-head">
              <span className="dm-run-console__tree-dot" data-variant={step.done ? "ok" : "pending"} />
              <span className="dm-helper-toolcall-title dm-swarm-card-title dm-pulse-truncate">{step.label}</span>
            </div>
            <div className="dm-run-console__hint dm-pulse-clamp">{step.explain}</div>
            {!step.done && step.action && (
              <div className="dm-schedule-card-actions">
                <button type="button" className="dm-btn-ghost" onClick={() => onSeed(step.action)}>{step.action.label}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- The cockpit shell ---------------- */

export function PulseCockpit({ workspaceConfig, onConfigRefresh, onOpenArtifact, onSeedProposal, onOpenCeo, onOpenSetup }) {
  const [configuredEnvRefs, setConfiguredEnvRefs] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deriveTick, setDeriveTick] = useState(0);
  const [activeTab, setActiveTab] = useState(null); // resolved after first derive

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
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Latest run record per SWARM row (the pulse's quality/spend truth comes
  // from the same records the Swarm cockpit reads). Fetched once per card,
  // capped, through the existing sandbox-run GET — no new route.
  const [runRecordsByCard, setRunRecordsByCard] = useState({});
  const fetchedCardsRef = useRef(new Set());

  const model = useMemo(
    () => derivePulseCockpit({ workspaceConfig, configuredEnvRefs, receipts, runRecordsByCard, nowMs: Date.now() }),
    [workspaceConfig, configuredEnvRefs, receipts, runRecordsByCard, deriveTick],
  );

  useEffect(() => {
    const targets = model.heartbeats
      .filter((h) => h.swarm && !fetchedCardsRef.current.has(h.cardId))
      .slice(0, 20);
    if (!targets.length) return undefined;
    targets.forEach((h) => fetchedCardsRef.current.add(h.cardId));
    let cancelled = false;
    (async () => {
      const updates = {};
      await Promise.all(targets.map(async (h) => {
        try {
          const res = await fetch(`/api/workspace/sandbox-run?objectId=${encodeURIComponent(h.objectId)}&name=${encodeURIComponent(h.name)}`);
          const data = await res.json();
          const latest = Array.isArray(data?.records) && data.records.length > 0 ? data.records[0] : null;
          if (latest) updates[h.cardId] = latest;
        } catch { /* truthful: no record → no invented telemetry */ }
      }));
      if (!cancelled && Object.keys(updates).length) setRunRecordsByCard((prev) => ({ ...prev, ...updates }));
    })();
    return () => { cancelled = true; };
  }, [model.heartbeats]);

  const tab = activeTab || (model.attention || model.findings.length ? "attention" : "checks");

  const runRecoveryPass = useCallback(async (entry, { chain = false } = {}) => {
    const providerId = entry.providerId || model.defaultProvider?.providerId || "upstash";
    const productId = entry.productId || model.defaultProvider?.productId || "upstash-qstash";
    const base = `/api/workspace/add-ons/${providerId}/schedule`;
    const body = { productId, objectId: entry.objectId, rowId: entry.name };
    const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, action: "readiness" }) });
    const data = await res.json().catch(() => ({}));
    const r = data?.readiness;
    if (!res.ok || !r) {
      return { ok: false, message: `${entry.name}: readiness scan failed — ${data?.error || `HTTP ${res.status}`}` };
    }
    if (!r.ok) {
      return { ok: false, message: `${entry.name}: blocked — ${(r.blockingNodes?.[0]?.helperAction) || (r.deltaTags || []).join(", ")}` };
    }
    if (chain && entry.recovery?.then === "resume") {
      const resume = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, action: "resume" }) });
      const resumeData = await resume.json().catch(() => ({}));
      if (!resume.ok || resumeData?.ok === false) {
        return { ok: false, message: `${entry.name}: resume blocked after rescan — ${resumeData?.error || `HTTP ${resume.status}`}` };
      }
      return { ok: true, message: `${entry.name}: rescan + resume complete.` };
    }
    return { ok: true, message: `${entry.name}: readiness rescan complete (${r.status}).` };
  }, [model.defaultProvider]);

  const recoverHeartbeat = useCallback(async (entry, { chain = false } = {}) => {
    setError("");
    setNotice("");
    setBusyId(entry.cardId);
    try {
      const result = await runRecoveryPass(entry, { chain });
      if (result.ok) setNotice(result.message);
      else setError(result.message);
      setDeriveTick((t) => t + 1);
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    } catch (err) {
      setError(err?.message || "Recovery failed.");
    } finally {
      setBusyId("");
    }
  }, [runRecoveryPass, onConfigRefresh]);

  const runAutoRecovery = useCallback(async () => {
    setError("");
    setNotice("");
    setBusyId("auto-recovery");
    const outcomes = [];
    try {
      for (const entry of model.autoRecoveryTargets) {
        // eslint-disable-next-line no-await-in-loop
        outcomes.push(await runRecoveryPass(entry, { chain: false }).catch((err) => ({ ok: false, message: `${entry.name}: ${err?.message || "failed"}` })));
      }
      const failed = outcomes.filter((o) => !o.ok);
      if (failed.length) setError(failed.map((o) => o.message).join(" · "));
      const passed = outcomes.filter((o) => o.ok);
      if (passed.length) setNotice(`${passed.length}/${outcomes.length} readiness checks complete.`);
      setDeriveTick((t) => t + 1);
      if (typeof onConfigRefresh === "function") onConfigRefresh();
    } finally {
      setBusyId("");
    }
  }, [model.autoRecoveryTargets, runRecoveryPass, onConfigRefresh]);

  const recoverFinding = useCallback(async (finding) => {
    const action = finding.nextAction || {};
    if (action.handoff === "settings-apps") { window.location.assign("/settings/apps"); return; }
    if (action.handoff === "settings-env") { window.location.assign("/settings"); return; }
    if (action.handoff === "data-model") { setActiveTab("policies"); return; }
    if (action.handoff === "ceo-cockpit" && typeof onOpenCeo === "function") { onOpenCeo(); return; }
    if (action.handoff === "checks-tab") {
      // Land the user on exactly the affected cards: narrow via search when
      // the finding covers one workflow, otherwise show the fleet.
      const first = (action.targetCardIds || []).length === 1
        ? model.heartbeats.find((h) => h.cardId === action.targetCardIds[0])
        : null;
      setSearch(first ? first.name : "");
      setActiveFilter("all");
      setActiveTab("checks");
      return;
    }
    if (action.handoff === "add-ons-schedule-route") {
      const targets = (action.targetCardIds || [])
        .map((id) => model.heartbeats.find((h) => h.cardId === id))
        .filter(Boolean);
      if (!targets.length) { setNotice(`${finding.policyId}: no affected workflows to check.`); return; }
      setError("");
      setNotice("");
      setBusyId(finding.policyId);
      const outcomes = [];
      try {
        for (const entry of targets) {
          // eslint-disable-next-line no-await-in-loop
          outcomes.push(await runRecoveryPass(entry, { chain: false }).catch((err) => ({ ok: false, message: `${entry.name}: ${err?.message || "failed"}` })));
        }
        const failed = outcomes.filter((o) => !o.ok);
        if (failed.length) setError(failed.map((o) => o.message).join(" · "));
        else setNotice(`${finding.policyId}: ${outcomes.length} readiness check${outcomes.length === 1 ? "" : "s"} complete.`);
        setDeriveTick((t) => t + 1);
        if (typeof onConfigRefresh === "function") onConfigRefresh();
      } finally {
        setBusyId("");
      }
      return;
    }
    setNotice(finding.plain?.actionOutcome || finding.message);
  }, [model.heartbeats, runRecoveryPass, onConfigRefresh, onOpenCeo]);

  const seedFromAction = useCallback((action) => {
    if (typeof onSeedProposal !== "function") return;
    onSeedProposal(action?.seedPrompt || "Propose a governed loop:", action?.seedIntent || null);
  }, [onSeedProposal]);

  const onOpen = useCallback((entry) => {
    if (typeof onOpenArtifact === "function") onOpenArtifact(entry.artifact);
    openWorkflowCanvas(entry);
  }, [onOpenArtifact]);

  const text = search.trim().toLowerCase();
  const filtered = model.heartbeats.filter(
    (h) => matchesFilter(h, activeFilter)
      && (!text || h.name.toLowerCase().includes(text) || h.statusLabel.toLowerCase().includes(text) || h.triggerKind.toLowerCase().includes(text)),
  );
  const visible = filtered.slice(0, PULSE_VISIBLE_CAP);
  const overflow = filtered.length - visible.length;

  const TABS = [
    { id: "attention", label: model.findings.length > 0 || model.attention ? "Attention" : "Attention" },
    { id: "checks", label: "Checks" },
    { id: "policies", label: "Policies" },
    { id: "report", label: "Report" },
  ];

  return (
    <div className="dm-swarm-cockpit" data-pulse-cockpit="" data-pulse-mode={model.policySetupState === "none" ? "no-policy" : "operational"}>
      <div className="dm-swarm-section-row">
        <span className="dm-run-console__hint">
          {`${model.counts.workflows} workflow${model.counts.workflows === 1 ? "" : "s"} · ${model.counts.stalled} stalled · ${model.counts.failed} failed · ${model.counts.healthy} healthy`}
        </span>
        <span className="dm-run-console__hint" data-pulse-proof="">
          {model.pulseProof.workflowFound ? `Heartbeat: ${model.pulseProof.state}` : "No heartbeat yet"}
        </span>
      </div>

      <div className="dm-ceo-tabs dm-pulse-tabs" role="tablist" aria-label="Pulse cockpit sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "is-active" : ""}
            data-pulse-tab={t.id}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="dm-helper-error" role="alert"><span>{error}</span></div>}
      {notice && !error && <p className="dm-run-console__hint" data-pulse-notice="">{notice}</p>}

      {tab === "attention" && (
        <>
          {model.autoRecoveryTargets.length > 0 && (
            <div className="dm-schedule-card-actions">
              <button type="button" className="dm-btn-ghost" onClick={runAutoRecovery} disabled={Boolean(busyId)} title="Read-only readiness checks over the workflows your auto-approved rules cover — never resumes or mutates">
                {`Run safe auto-recovery (${model.autoRecoveryTargets.length})`}
              </button>
            </div>
          )}
          <AttentionView
            model={model}
            busyId={busyId}
            onRecover={recoverHeartbeat}
            onOpen={onOpen}
            onDelegate={seedFromAction}
            onRecoverFinding={recoverFinding}
            onSeed={seedFromAction}
          />
        </>
      )}

      {tab === "checks" && (
        <div className="dm-pulse-section">
          <div className="dm-schedule-search">
            <Search size={13} aria-hidden="true" />
            <input
              value={search}
              placeholder="Search workflows or status"
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search pulse checks"
            />
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
          <div className="dm-ceo-report-list" data-pulse-list="">
            {visible.map((entry) => (
              <HeartbeatCard key={entry.cardId} entry={entry} onRecover={recoverHeartbeat} busy={busyId === entry.cardId} onOpen={onOpen} onDelegate={seedFromAction} />
            ))}
          </div>
          {overflow > 0 && (
            <span className="dm-run-console__hint">{`Showing ${visible.length} of ${filtered.length} — refine with search or filters.`}</span>
          )}
          {filtered.length === 0 && <p className="dm-run-console__hint">No workflows match.</p>}
        </div>
      )}

      {tab === "policies" && (
        <PoliciesView model={model} workspaceConfig={workspaceConfig} onConfigRefresh={onConfigRefresh} onSeed={seedFromAction} />
      )}

      {tab === "report" && <ReportView model={model} onSeed={seedFromAction} />}
    </div>
  );
}

export default PulseCockpit;
