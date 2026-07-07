"use client";

/**
 * Custom Models cockpit — the /custom-models sidecar view. A tabbed model
 * cockpit (Overview / Health / Usage / Versions / Settings) mirroring the CEO
 * primitives cockpit tab grammar (.dm-ceo-tabs) and the reference model-cockpit
 * layout: name + live status, clean metric tiles, an Actions column, and one
 * neutral "Next recommended action" card. Nothing is hidden behind accordions;
 * every tab surfaces real, derived substance.
 *
 * Read-first, action-light: every status is derived by lib/custom-models-ledger.js
 * (which builds on the training-ledger evidence engine, so /training and
 * /custom-models can never disagree); the Settings tab reflects the governed
 * API-Registry config read-only using the workflow-canvas node-config field
 * grammar (dropdowns + text fields) — editing authority stays in the Registry /
 * Data Model, so the cockpit can never write a divergent truth. No destructive
 * writes here — delete and duplicate route to Data Model, the edit authority.
 */

import { useEffect, useMemo, useState } from "react";
import {
  deriveCustomModelsState,
  buildCapabilityManifest,
  deriveCustomModelSuggestedActions,
  deriveCustomModelCockpit,
} from "../../../lib/custom-models-ledger.js";
import { deriveTrainingGapDrivers } from "../../../lib/training-runtime-drivers.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "Health" },
  { id: "usage", label: "Usage" },
  { id: "versions", label: "Versions" },
  { id: "settings", label: "Settings" },
];

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

// Canvas-mirror config field: read-only reflection of a governed value using
// the exact dm-orchestration-config__field grammar the workflow node panel
// uses (disabled control = governed, editing authority elsewhere).
function ConfigField({ field }) {
  return (
    <label className="dm-orchestration-config__field" data-config-field={field.key}>
      <span>{field.label}</span>
      {field.kind === "select" ? (
        <select value={String(field.value)} disabled aria-readonly="true">
          {(field.options || [String(field.value)]).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={field.kind === "number" ? "number" : "text"}
          value={field.value === "" ? "—" : field.value}
          disabled
          aria-readonly="true"
        />
      )}
    </label>
  );
}

function ModelCockpitCard({ model, workspaceConfig, workspaceSourceRecords }) {
  const [tab, setTab] = useState("overview");
  const cockpit = useMemo(
    () => deriveCustomModelCockpit(model, { workspaceConfig, workspaceSourceRecords }),
    [model, workspaceConfig, workspaceSourceRecords],
  );
  const suggested = useMemo(
    () => deriveCustomModelSuggestedActions(model, { workspaceConfig }),
    [model, workspaceConfig],
  );
  const rec = suggested.actions.find((a) => a.enabled) || suggested.actions[0] || null;

  const statusPill = model.evidenceState === "complete"
    ? { label: "Live", cls: "is-ok" }
    : cockpit.health.tone === "ok" ? { label: cockpit.health.label, cls: "is-ok" }
      : cockpit.health.tone === "warn" ? { label: cockpit.health.label, cls: "is-warn" }
        : { label: cockpit.health.label, cls: "" };

  return (
    <section
      className="dm-api-action-card"
      data-custom-model={model.id}
      data-model-state={model.evidenceState}
      aria-label={`Custom model ${model.name}`}
    >
      <div className="dm-api-action-card-body" style={{ width: "100%" }}>
        <div className="dm-cockpit-head">
          <div className="dm-api-action-card-body" style={{ gap: 2 }}>
            <p className="dm-api-action-card-eyebrow">Custom model</p>
            <h3>{model.name}</h3>
          </div>
          <span className={`dm-status-chip ${statusPill.cls}`} data-model-status={statusPill.label}>
            <span className="dm-status-dot" aria-hidden="true" />{statusPill.label}
          </span>
        </div>

        {/* Tabs — mirror the CEO primitives cockpit tab grammar. */}
        <div className="dm-cockpit-tabs" role="tablist" aria-label={`${model.name} sections`}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "is-active" : ""}
              onClick={() => setTab(t.id)}
              data-cockpit-tab={t.id}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW — tiles + Actions + one neutral recommended card. */}
        {tab === "overview" ? (
          <div data-cockpit-panel="overview">
            <div className="dm-cockpit-metrics">
              {cockpit.tiles.map((tile) => (
                <span key={tile.key} data-tile={tile.key} data-tile-tone={tile.tone || "neutral"}>
                  <small>{tile.label}</small>
                  <strong className={tile.tone === "ok" ? "is-ok" : ""}>{tile.value}</strong>
                  <span className="dm-cockpit-tile-sub">{tile.sub}</span>
                </span>
              ))}
            </div>

            <div className="dm-cockpit-overview-cols">
              <div className="dm-cockpit-col">
                <p className="dm-cockpit-col-title">Actions</p>
                {model.canTest
                  ? <a className="dm-btn-outline dm-cockpit-stacked-btn" href={model.links.registry} data-model-test="">Use model</a>
                  : <a className="dm-btn-outline dm-cockpit-stacked-btn" href={model.links.training} data-model-test="">Open Training</a>}
                {model.links.workflow
                  ? <a className="dm-btn-outline dm-cockpit-stacked-btn" href={model.links.workflow} data-model-workflow="">Open workflow</a>
                  : <a className="dm-btn-outline dm-cockpit-stacked-btn" href={model.links.training}>Improve from gaps</a>}
                <a className="dm-btn-outline dm-cockpit-stacked-btn" href={model.links.registry} data-model-proof="">View proof</a>
              </div>

              <div className="dm-cockpit-col dm-cockpit-rec" data-model-recommended={rec ? rec.variant : "none"}>
                <p className="dm-cockpit-col-title">Next recommended action</p>
                {rec ? (
                  <>
                    <p className="dm-cockpit-rec-title">{rec.title}</p>
                    <p className="dm-cockpit-subtle">{rec.enabled ? rec.whyNow : `Needs: ${rec.blockedReason}`}</p>
                    {rec.enabled
                      ? <a className="dm-btn-primary-sm dm-cockpit-rec-cta" href={rec.openHref} data-action-open={rec.variant} title={rec.proofProduced}>Open in canvas</a>
                      : <a className="dm-btn-outline dm-cockpit-rec-cta" href={model.links.training}>Resolve in Training</a>}
                  </>
                ) : (
                  <p className="dm-cockpit-subtle">No reuse actions available yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* HEALTH — evidence ladder + verification proof (real, demotion-safe). */}
        {tab === "health" ? (
          <div data-cockpit-panel="health">
            <ol className="dm-cockpit-ladder">
              {cockpit.ladder.map((rung) => (
                <li key={rung.key} data-rung={rung.key} data-done={rung.done ? "yes" : "no"}>
                  <span className="dm-cockpit-ladder-dot" aria-hidden="true" />
                  <span className="dm-cockpit-ladder-label">{rung.label}</span>
                </li>
              ))}
            </ol>
            <div className="dm-cockpit-facts">
              <div><span>Verification</span><strong>{model.verificationStatus}</strong></div>
              <div><span>Served tag</span><strong>{cockpit.served || "—"}</strong></div>
              <div><span>Output hash</span><strong>{cockpit.outputHash ? `#${cockpit.outputHash}` : "—"}</strong></div>
              <div data-model-serving={model.servingProfile ? model.servingProfile.adapter : "—"}>
                <span>Serving</span>
                <strong>
                  {model.servingProfile
                    ? `${model.servingProfile.adapter} · ${cockpit.servesTunedTag ? "serves tuned tag" : cockpit.servingReason || "unverified"}`
                    : "—"}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {/* USAGE — the real closed-loop reuse actions, fully surfaced (no
            accordion), plus governed run/invocation receipts. */}
        {tab === "usage" ? (
          <div data-cockpit-panel="usage" data-suggested-ready={`${suggested.ready}/${suggested.actions.length}`}>
            <ul className="dm-cockpit-actions-list">
              {suggested.actions.map((a) => (
                <li
                  key={a.id}
                  data-suggested-action={a.id}
                  data-action-enabled={a.enabled ? "yes" : "no"}
                  data-action-variant={a.variant}
                  className={a.enabled ? "" : "is-blocked"}
                >
                  <span className="dm-cockpit-action-name">{a.title}</span>
                  <span className="dm-cockpit-subtle">{a.enabled ? a.whyNow : `needs: ${a.blockedReason}`}</span>
                  {a.enabled
                    ? <a className="dm-btn-ghost dm-cockpit-action-cta" href={a.openHref} data-action-open={a.variant} title={a.proofProduced}>Open</a>
                    : null}
                </li>
              ))}
            </ul>
            <div className="dm-cockpit-facts">
              <div><span>Invocation receipts</span><strong>{cockpit.invocations.length || "—"}</strong></div>
              <div><span>Last sandbox run</span><strong>{model.lastSandboxRunId || "—"}</strong></div>
            </div>
          </div>
        ) : null}

        {/* VERSIONS — the tuned tag, base lineage, and verification timestamp. */}
        {tab === "versions" ? (
          <div data-cockpit-panel="versions">
            <div className="dm-cockpit-facts">
              <div><span>Tuned tag</span><strong>{model.modelVersion || model.localModel || "—"}</strong></div>
              <div><span>Base model</span><strong>{model.baseModel || "—"}</strong></div>
              <div><span>Verified</span><strong>{model.lastVerifiedAt ? model.lastVerifiedAt.slice(0, 10) : "—"}</strong></div>
              <div><span>Registry</span><strong>{model.apiRegistryId || "—"}</strong></div>
            </div>
            <p className="dm-cockpit-subtle" style={{ marginTop: 8 }}>
              Version lineage is governed in the Data Model. Retraining from gaps creates the next version — it never demotes this one.
            </p>
            <a className="dm-btn-ghost dm-cockpit-stacked-btn" href={model.links.dataModel} data-model-datamodel="">Open model row</a>
          </div>
        ) : null}

        {/* SETTINGS — governed config as canvas-style dropdowns + text fields
            (read-only), plus manifest export and Data Model edit routes. */}
        {tab === "settings" ? (
          <div data-cockpit-panel="settings">
            {cockpit.registryBound ? (
              <div className="dm-cockpit-config-grid">
                {cockpit.settingsFields.map((f) => <ConfigField key={f.key} field={f} />)}
              </div>
            ) : (
              <p className="dm-cockpit-subtle">No API Registry row bound yet — verify the endpoint in Training to populate the request contract.</p>
            )}
            <p className="dm-cockpit-subtle" style={{ marginTop: 8 }}>
              Config is governed — values reflect the API Registry row and are edited there, not here.
            </p>
            <div className="dm-cockpit-settings-actions">
              {model.canExport
                ? <button type="button" className="dm-btn-ghost" onClick={() => exportManifest(model, workspaceConfig)} data-model-export="">Export developer manifest</button>
                : null}
              <a className="dm-btn-ghost" href={model.links.dataModel} data-model-duplicate="">Duplicate in Data Model</a>
              <a className="dm-btn-ghost" href={model.links.dataModel} data-model-delete="">Delete in Data Model</a>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function CustomModelsLedger({ workspaceConfig: providedConfig, workspaceSourceRecords: providedRecords }) {
  const [workspaceConfig, setWorkspaceConfig] = useState(providedConfig || null);
  const [workspaceSourceRecords, setWorkspaceSourceRecords] = useState(providedRecords || null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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
    && (!statusFilter || m.evidenceState === statusFilter));

  const verified = state.models.filter((m) => ["verified", "sandbox-ready", "complete"].includes(m.evidenceState)).length;
  const latest = state.filters.versions[state.filters.versions.length - 1] || "—";

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

      <div className="dm-cockpit-topbar" data-custom-models-summary="">
        <div>
          <p className="dm-api-action-card-eyebrow">Custom Models</p>
          <p className="dm-cockpit-subtle">{state.models.length} model{state.models.length === 1 ? "" : "s"} · {verified} verified · latest {latest}</p>
        </div>
        <div className="dm-cockpit-filters">
          <input className="dm-cockpit-input" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} data-models-search="" />
          <select className="dm-cockpit-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-models-status-filter="">
            <option value="">All statuses</option>
            {state.filters.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {visible.map((model) => (
        <ModelCockpitCard
          key={model.id}
          model={model}
          workspaceConfig={workspaceConfig}
          workspaceSourceRecords={workspaceSourceRecords}
        />
      ))}
    </div>
  );
}
