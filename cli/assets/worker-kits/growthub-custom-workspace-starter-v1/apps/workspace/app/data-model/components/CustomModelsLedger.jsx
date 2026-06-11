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
import { deriveCustomModelsState, buildCapabilityManifest } from "../../../lib/custom-models-ledger.js";

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
          {model.canExport ? item("Export capability manifest", () => { setOpen(false); exportManifest(model, workspaceConfig); }) : null}
          {item("Open API Registry test", null, model.links.registry)}
          {model.links.workflow ? item("Open Workflow Canvas", null, model.links.workflow) : null}
          {item("Open model row", null, model.links.dataModel)}
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

  return (
    <div data-custom-models-ledger="">
      {error ? <div className="dm-helper-error">{error}</div> : null}

      <div className="dm-helper-toolcall dm-swarm-card" data-custom-models-summary="">
        <div className="dm-run-console__hint">
          {state.models.length} custom models · {verified} verified · {sandboxReady} sandbox-ready · latest {latest}
        </div>
        <div className="dm-helper-stream dm-swarm-card-desc">{state.guidance}</div>
        <div className="dm-helper-toolcall-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="dm-run-console__hint" placeholder="search name/version" value={query} onChange={(e) => setQuery(e.target.value)} data-models-search="" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-models-status-filter="">
            <option value="">all statuses</option>
            {state.filters.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} data-models-mode-filter="">
            <option value="">all endpoints</option>
            {state.filters.endpointModes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {visible.map((model) => (
        <div className="dm-helper-toolcall dm-swarm-card" key={model.id} data-custom-model={model.id} data-model-state={model.evidenceState}>
          <div className="dm-helper-toolcall-row">
            <span className="dm-helper-toolcall-title dm-swarm-card-title">{model.name}</span>
            {/* Test routes to the canonical API Registry cockpit for this
                row — proof is written there, never faked from this view. */}
            {/* "Open test" — this NAVIGATES to the canonical registry
                cockpit where the real test runs and writes proof; it does
                not invoke anything from here, so it never says "Test". */}
            {model.canTest
              ? <a className="dm-btn-ghost" href={model.links.registry} data-model-test="">Open test</a>
              : <a className="dm-btn-ghost" href={model.links.training} data-model-test="">Open Training</a>}
            <ActionMenu model={model} workspaceConfig={workspaceConfig} />
          </div>
          <div className="dm-run-console__hint">
            {model.modelVersion || "no version tag"} · {model.endpointMode} · {model.evidenceState}
            {model.baseModel ? ` · base ${model.baseModel}` : ""}
          </div>
          <div className="dm-run-console__hint">
            {model.apiRegistryId ? `registry ${model.apiRegistryId}` : "no registry row"}
            {model.lastVerifiedAt ? ` · verified ${model.lastVerifiedAt.slice(0, 16).replace("T", " ")}` : ""}
            {model.lastSandboxRunId ? ` · run ${model.lastSandboxRunId}` : ""}
            {model.modelOutputHash ? ` · output #${model.modelOutputHash}` : model.snippetHash ? ` · snippet #${model.snippetHash}` : ""}
          </div>
          <div className="dm-helper-stream dm-swarm-card-desc">Next: {model.nextAction}</div>
        </div>
      ))}
    </div>
  );
}
