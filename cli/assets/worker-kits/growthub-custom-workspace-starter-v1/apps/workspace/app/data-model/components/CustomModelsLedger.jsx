"use client";

/**
 * Custom Models cockpit — the /custom-models sidecar view. Read-first,
 * action-light: every status is derived by lib/custom-models-ledger.js
 * (which builds on the training-ledger evidence engine, so /training and
 * /custom-models can never disagree); every action either exports a clean
 * client-side manifest or NAVIGATES to the canonical source of truth
 * (API Registry cockpit, Workflow Canvas, Data Model). No destructive
 * writes here — delete and duplicate route to Data Model, the edit
 * authority. Background-tasks card grammar only; no new chrome.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { deriveCustomModelsState, buildCapabilityManifest, deriveCustomModelSuggestedActions } from "../../../lib/custom-models-ledger.js";
import { deriveTrainingGapDrivers } from "../../../lib/training-runtime-drivers.js";

function exportManifest(model, workspaceConfig) {
  const manifest = buildCapabilityManifest(model, { workspaceConfig });
  const blob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${manifest.apiRegistryId || manifest.modelTrainingId}-capability-v1.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function ActionMenu({ model, workspaceConfig }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState("");
  const item = (label, onClick, href) => href
    ? <a key={label} className="dm-btn-ghost" href={href} style={{ display: "block" }} role="menuitem">{label}</a>
    : <button key={label} type="button" className="dm-btn-ghost" style={{ display: "block", width: "100%", textAlign: "left" }} role="menuitem" onClick={onClick}>{label}</button>;
  // Truthful labels only: nothing here mutates — duplicate/delete are
  // two-step inline confirmations that NAVIGATE to Data Model, the edit
  // authority. No browser alert/confirm dialogs.
  const twoStep = (id, label, destination) => confirming === id
    ? item(`Confirm — finalize in Data Model`, () => { window.location.href = destination; })
    : item(label, () => setConfirming(id));
  return (
    <span style={{ position: "relative" }} data-model-actions={model.id}>
      <button type="button" className="dm-btn-ghost" aria-label={`Actions for ${model.name}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => { setOpen(!open); setConfirming(""); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setConfirming(""); } }}>⋮</button>
      {open ? (
        <span className="dm-helper-toolcall" role="menu" style={{ position: "absolute", right: 0, zIndex: 5, display: "block", maxHeight: 220, overflowY: "auto" }}>
          {item("Improve from gaps", null, model.links.training)}
          {item("View proof", null, model.links.registry)}
          {model.links.workflow ? item("Open workflow", null, model.links.workflow) : null}
          {item("Open model row", null, model.links.dataModel)}
          {model.canExport ? item("Export developer manifest", () => { setOpen(false); exportManifest(model, workspaceConfig); }) : null}
          {twoStep("duplicate", "Duplicate in Data Model", model.links.dataModel)}
          {twoStep("delete", "Delete in Data Model", model.links.dataModel)}
        </span>
      ) : null}
    </span>
  );
}

export default function CustomModelsLedger({ workspaceConfig: providedConfig, workspaceSourceRecords: providedRecords }) {
  const [workspaceConfig, setWorkspaceConfig] = useState(providedConfig || null);
  const [workspaceSourceRecords, setWorkspaceSourceRecords] = useState(providedRecords || null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");

  useEffect(() => {
    // Evidence parity: a config-only caller (the sidecar) must still fetch
    // source records — the sidecar and page may never derive different truth.
    if (providedConfig && providedRecords) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace");
        const data = await res.json();
        if (cancelled) return;
        if (data?.workspaceConfig) setWorkspaceConfig(data.workspaceConfig);
        if (data?.workspaceSourceRecords) setWorkspaceSourceRecords(data.workspaceSourceRecords);
      } catch {
        if (!cancelled) setError("Workspace config unavailable — start the workspace app.");
      }
    })();
    return () => { cancelled = true; };
  }, [providedConfig]);

  const state = useMemo(
    () => deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords }),
    [workspaceConfig, workspaceSourceRecords],
  );

  const visible = state.models.filter((m) =>
    (!query || `${m.name} ${m.modelVersion}`.toLowerCase().includes(query.toLowerCase()))
    && (!statusFilter || m.evidenceState === statusFilter)
    && (!modeFilter || m.endpointMode === modeFilter));

  const verified = state.models.filter((m) => ["verified", "sandbox-ready", "complete"].includes(m.evidenceState)).length;
  const sandboxReady = state.models.filter((m) => ["sandbox-ready", "complete"].includes(m.evidenceState)).length;
  const latest = state.filters.versions[state.filters.versions.length - 1] || "—";
  // Feedback awareness: a complete model is never demoted by new gaps, but
  // the cockpit surfaces them as the next training cycle's opportunity.
  const gaps = useMemo(() => deriveTrainingGapDrivers({ workspaceConfig, workspaceSourceRecords }), [workspaceConfig, workspaceSourceRecords]);
  const hasComplete = state.models.some((m) => m.evidenceState === "complete");

  // Evidence state → status pill tone (mirrors dm-status-chip across the app).
  const pill = (s) => s === "complete" ? { label: "Live", cls: "is-ok" }
    : s === "sandbox-ready" ? { label: "Sandbox-ready", cls: "is-ok" }
      : s === "verified" ? { label: "Verified", cls: "is-ok" }
        : s === "deployed" ? { label: "Deployed", cls: "" }
          : { label: s || "recorded", cls: "is-warn" };

  // Empty state — read-first, one clear destination. Never a blank screen.
  if (!error && state.models.length === 0) {
    return (
      <div data-custom-models-ledger="" data-custom-models-empty="">
        <section className="dm-api-action-card dm-api-action-card-muted" aria-label="No custom models yet">
          <div className="dm-api-action-card-body">
            <p className="dm-api-action-card-eyebrow">Custom Models</p>
            <h3>No verified custom models yet</h3>
            <p>A custom model appears here only once it has real evidence — a training run, an imported artifact, a verified endpoint. Open Training to turn governed workspace traces into a custom model.</p>
          </div>
          <a className="dm-btn-primary-sm dm-api-action-card-cta" href="/training" data-custom-models-open-training="">Open Training</a>
        </section>
      </div>
    );
  }

  return (
    <div data-custom-models-ledger="" className="dm-cockpit-page">
      {error ? <div className="dm-helper-error">{error}</div> : null}

      <section className="dm-api-action-card dm-api-action-card-muted" data-custom-models-summary="" aria-label="Custom models summary">
        <div className="dm-api-action-card-body" style={{ width: "100%" }}>
          <p className="dm-api-action-card-eyebrow">Custom Models</p>
          <div className="dm-cockpit-fields">
            <span className="dm-cockpit-field"><b>models</b>{state.models.length}</span>
            <span className="dm-cockpit-field"><b>verified</b>{verified}</span>
            <span className="dm-cockpit-field"><b>sandbox</b>{sandboxReady}</span>
            <span className="dm-cockpit-field"><b>latest</b>{latest}</span>
          </div>
          <p className="dm-api-action-card-note">{state.guidance}</p>
          {hasComplete && gaps.hasGaps ? (
            <p className="dm-api-action-card-note" data-custom-models-gaps={gaps.totalGapSignals}>Complete — and {gaps.totalGapSignals} new improvement signal(s) are ready for the next training cycle. {gaps.recommendation}</p>
          ) : null}
          <div className="dm-cockpit-filters">
            <input className="dm-cockpit-input" placeholder="Search name / version" value={query} onChange={(e) => setQuery(e.target.value)} data-models-search="" />
            <select className="dm-cockpit-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-models-status-filter="">
              <option value="">All statuses</option>
              {state.filters.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="dm-cockpit-select" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} data-models-mode-filter="">
              <option value="">All endpoints</option>
              {state.filters.endpointModes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>

      {visible.map((model) => {
        const st = pill(model.evidenceState);
        // End-state actions are the SAME causation-derived next actions the
        // training checklist uses — closed loop into REUSING the local model.
        const suggested = deriveCustomModelSuggestedActions(model, { workspaceConfig });
        return (
        <section className="dm-api-action-card" key={model.id} data-custom-model={model.id} data-model-state={model.evidenceState} aria-label={`Custom model ${model.name}`}>
          <div className="dm-api-action-card-body" style={{ width: "100%" }}>
            <div className="dm-cockpit-head" style={{ cursor: "default" }}>
              <div className="dm-api-action-card-body" style={{ gap: 2 }}>
                <p className="dm-api-action-card-eyebrow">Custom model</p>
                <h3>{model.name}</h3>
              </div>
              <span className={`dm-status-chip ${st.cls}`} data-model-status={st.label}><span className="dm-status-dot" aria-hidden="true" />{st.label}</span>
            </div>

            <div className="dm-cockpit-fields" style={{ marginTop: 8 }}>
              <span className="dm-cockpit-field"><b>version</b>{model.modelVersion || "—"}</span>
              <span className="dm-cockpit-field"><b>base</b>{model.baseModel || "—"}</span>
              <span className="dm-cockpit-field"><b>endpoint</b>{model.endpointMode}</span>
              {model.apiRegistryId ? <span className="dm-cockpit-field"><b>registry</b>{model.apiRegistryId}</span> : null}
              {model.lastVerifiedAt ? <span className="dm-cockpit-field"><b>verified</b>{model.lastVerifiedAt.slice(0, 16).replace("T", " ")}</span> : null}
              {model.modelOutputHash ? <span className="dm-cockpit-field"><b>output</b>#{model.modelOutputHash}</span> : model.snippetHash ? <span className="dm-cockpit-field"><b>snippet</b>#{model.snippetHash}</span> : null}
            </div>

            <p className="dm-api-action-card-note">Next: {model.nextAction}</p>

            {/* Primary reuse action + management menu. */}
            <div className="dm-cockpit-actions">
              {model.canTest
                ? <a className="dm-btn-primary-sm" href={model.links.registry} data-model-test="">Use model</a>
                : <a className="dm-btn-outline" href={model.links.training} data-model-test="">Open Training</a>}
              {model.links.workflow ? <a className="dm-btn-outline" href={model.links.workflow} data-model-workflow="">Open workflow</a> : null}
              <ActionMenu model={model} workspaceConfig={workspaceConfig} />
            </div>

            {/* Full operational metadata — every derived field, absence shown honestly. */}
            <details data-model-details="">
              <summary className="dm-cockpit-summary">Details</summary>
              <div className="dm-cockpit-fields" style={{ marginTop: 6 }}>
                <span className="dm-cockpit-field"><b>served</b>{model.lastResponseModel || "—"}</span>
                <span className="dm-cockpit-field"><b>verify</b>{model.verificationStatus}</span>
                <span className="dm-cockpit-field"><b>run</b>{model.lastSandboxRunId || "—"}</span>
                <span className="dm-cockpit-field"><b>resp#</b>{model.lastResponseHash || "—"}</span>
                <span className="dm-cockpit-field"><b>last inv</b>{model.lastInvocationSourceId ? "yes" : "—"}</span>
              </div>
              {model.servingProfile ? (
                <p className="dm-api-action-card-note" data-model-serving={model.servingProfile.adapter} data-serving-tuned={model.servingProfile.servesTunedTag ? "yes" : "no"}>
                  serving: {model.servingProfile.adapter} · mode {model.servingProfile.mode}
                  {model.servingProfile.continuousBatching ? " · continuous batching" : ""}
                  {model.servingProfile.speculative ? ` · speculative (draft ${model.servingProfile.speculative.draftModel})` : ""}
                  {" · "}{model.servingProfile.servesTunedTag ? "serves tuned tag ✓" : model.servingProfile.reason}
                </p>
              ) : null}
            </details>

            {/* Suggested actions — pure causation deriver, same next-action
                grammar as the training checklist; each routes to a governed
                surface to REUSE the local model (workflow node, more training
                data, browser-use agent, export). Never mutates directly. */}
            <details data-model-suggested-actions="" data-suggested-ready={`${suggested.ready}/${suggested.actions.length}`} open>
              <summary className="dm-cockpit-summary">Reuse this model — suggested actions ({suggested.ready}/{suggested.actions.length})</summary>
              <ul className="dm-api-action-checklist" style={{ marginTop: 8 }}>
                {suggested.actions.map((a) => (
                  <li key={a.id} className={a.enabled ? "is-done" : "is-pending"} data-suggested-action={a.id} data-action-enabled={a.enabled ? "yes" : "no"} data-action-variant={a.variant}>
                    {a.enabled ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                    <span><strong>{a.title}</strong> — {a.enabled ? a.whyNow : `needs: ${a.blockedReason}`}</span>
                    {a.enabled ? <a className="dm-btn-outline dm-cockpit-action-cta" href={a.openHref} data-action-open={a.variant} title={a.proofProduced}>Open in canvas</a> : null}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
        );
      })}
    </div>
  );
}
