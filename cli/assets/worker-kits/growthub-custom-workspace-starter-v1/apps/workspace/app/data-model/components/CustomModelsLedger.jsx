"use client";

/**
 * Custom Models cockpit — the /custom-models sidecar view. A tabbed model
 * cockpit (Overview / Health / Usage / Versions / Settings) mirroring the CEO
 * primitives cockpit tab grammar (.dm-ceo-tabs) and the reference model-cockpit
 * layout: name + live status, clean metric tiles, an Actions column, and one
 * neutral "Next recommended action" card. Secondary workflow recipes and
 * governed settings stay in compact accordions so the primary outcome remains
 * obvious without discarding any evidence.
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
  deriveCustomModelCockpit,
  deriveCustomModelSuggestedActions,
  deriveCustomModelFocusActions,
} from "../../../lib/custom-models-ledger.js";
import { buildCustomModelWorkflowProposal } from "../../../lib/custom-model-workflow-proposal.js";
import TrainingLedger from "./TrainingLedger.jsx";

/**
 * One-click utilization — the CEO-cockpit pattern: a single click materializes
 * the ready-to-run orchestration graph as a governed DRAFT sandbox row (the
 * live orchestrationConfig is publish-owned; the canvas test-run → attest →
 * POST /api/workspace/workflow/publish path promotes it), then opens it on
 * the workflow canvas. Never a dead redirect: an existing row just opens.
 */
async function createDraftWorkflowAndOpen(model, action) {
  const proposal = buildCustomModelWorkflowProposal({
    modelId: model?.id || model?.name,
    variant: action?.variant,
    rationale: action?.whyNow,
  });
  const response = await fetch("/api/workspace/helper/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposals: [proposal], reviewedBy: "custom-models-cockpit" }),
  });
  const payload = await response.json().catch(() => ({}));
  const applied = Array.isArray(payload?.applied)
    ? payload.applied.find((receipt) => receipt?.type === proposal.type && receipt?.artifact)
    : null;
  if (!response.ok || !applied?.artifact) {
    const skipped = Array.isArray(payload?.skipped) ? payload.skipped[0]?.reason : "";
    throw new Error(String(skipped || payload?.error || "The governed workflow could not be created."));
  }
  const artifact = applied.artifact;
  window.location.href = `/workflows?object=${encodeURIComponent(artifact.objectId)}&row=${encodeURIComponent(artifact.rowName)}&field=orchestrationConfig`;
}

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
  const cockpit = useMemo(
    () => deriveCustomModelCockpit(model, { workspaceConfig, workspaceSourceRecords }),
    [model, workspaceConfig, workspaceSourceRecords],
  );
  const suggested = useMemo(
    () => deriveCustomModelSuggestedActions(model, { workspaceConfig }),
    [model, workspaceConfig],
  );
  const focus = useMemo(
    () => deriveCustomModelFocusActions(model, { workspaceConfig })[0] || null,
    [model, workspaceConfig],
  );
  const chatAction = suggested.actions.find((a) => a.variant === "chat") || null;
  const [busyAction, setBusyAction] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const runAction = async (action) => {
    if (!action?.enabled || busyAction) return;
    if (action.mode === "open" && action.openHref) {
      window.location.href = action.openHref;
      return;
    }
    setBusyAction(action.id);
    setActionMessage("");
    try {
      await createDraftWorkflowAndOpen(model, action);
    } catch (error) {
      setActionMessage(error?.message || "The workflow could not be created.");
    } finally {
      setBusyAction("");
    }
  };
  const statusPill = cockpit.availability?.available
    ? { label: cockpit.availability.label, cls: "is-ok" }
    : cockpit.health.tone === "ok" ? { label: cockpit.health.label, cls: "is-ok" }
      : cockpit.health.tone === "warn" ? { label: cockpit.health.label, cls: "is-warn" }
        : { label: cockpit.health.label, cls: "" };
  const canShowSettings = ["verified", "sandbox-ready", "complete"].includes(model.evidenceState)
    || Boolean(model.lastVerifiedAt && cockpit.registryBound);

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

        <p className="dm-cockpit-meta-line" data-model-meta="">
          {model.endpointMode}
          {" · served "}<strong>{cockpit.served || "—"}</strong>
          {" · "}{model.lastVerifiedAt ? `verified ${model.lastVerifiedAt.slice(0, 10)}` : "not verified yet"}
          {cockpit.outputHash ? ` · proof #${cockpit.outputHash}` : ""}
        </p>

        {/* Model loop — harvest → train → evaluate → serve in the SAME
            receipt-row grammar as the training modal's proof checklist
            (dm-cockpit-receipts / dm-status-chip). Every chip is governed
            evidence; renders only once the loop has begun so the
            pre-flywheel cockpit is unchanged. */}
        {cockpit.continuum?.active ? (
          <div className="dm-cockpit-receipts" data-model-continuum="" data-continuum-generation={cockpit.continuum.generation}>
            <p className="dm-api-action-card-eyebrow">Model loop{cockpit.continuum.generation >= 2 ? ` · generation ${cockpit.continuum.generation}` : ""}</p>
            <ul>
              {cockpit.continuum.loop.map((step) => (
                <li key={step.id} className="dm-cockpit-receipt" data-continuum-step={step.id} data-continuum-done={step.done ? "true" : "false"}>
                  <span className={`dm-cockpit-receipt-chip dm-status-chip${step.done ? " is-ok" : ""}`}>
                    <span className="dm-status-dot" aria-hidden="true" />{step.label}
                  </span>
                  <span className="dm-cockpit-receipt-text">
                    {step.id === "harvest" ? (cockpit.continuum.traceCount > 0 ? `${cockpit.continuum.traceCount} governed traces harvested` : "No traces yet — every reply through this model is harvested")
                      : step.id === "train" ? (step.done ? "Training receipt recorded" : cockpit.continuum.plan.mode === "harvest-only" ? "Runs when a capable machine is measured — the corpus keeps growing meanwhile" : `Plan sized to this machine: ${cockpit.continuum.plan.baseModel}`)
                        : step.id === "evaluate" ? (step.done ? "Benchmark wins promoted" : "Not benchmarked yet — wins gate routing priority")
                          : step.done ? `Serving your trained model — response tag ${cockpit.continuum.serving?.servedTag || ""} verified`
                            : cockpit.continuum.serving
                              ? (cockpit.continuum.serving.target === "local-base" ? "Serving the local base — every reply is harvested toward your next run" : "Serving via the teacher — every reply is harvested toward your next run")
                              : "Not serving yet — verify the endpoint"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Usage — every number counted from a stamped row/record, "—" where
            no evidence exists (the CeoCockpit convention, no invented figures). */}
        <p className="dm-cockpit-meta-line" data-model-usage="" title={cockpit.usage.usageBasis}>
          {cockpit.usage.provenRuns > 0 ? `${cockpit.usage.provenRuns} proven run${cockpit.usage.provenRuns === 1 ? "" : "s"}` : "no runs yet"}
          {" · "}{cockpit.usage.workflowsBound > 0 ? `${cockpit.usage.workflowsBound} workflow${cockpit.usage.workflowsBound === 1 ? "" : "s"}` : "no workflows"}
          {" · "}{(cockpit.usage.promptTokens + cockpit.usage.completionTokens) > 0 ? `${cockpit.usage.promptTokens + cockpit.usage.completionTokens} tokens (${cockpit.usage.promptTokens} in / ${cockpit.usage.completionTokens} out)` : "— tokens"}
          {" · "}{cockpit.usage.permissions.executionLane} · network {cockpit.usage.permissions.networkAllow ? "allowed" : "off"}
        </p>

        {/* Utilization — one primary click (create-or-open, never a dead
            redirect) + the other governed closed loops in the cockpit-steps
            grammar, closed by default. */}
        <div className="dm-cockpit-settings-actions" data-model-utilize="">
          {focus && chatAction ? (
            focus.mode === "open" ? (
              <a className="dm-btn-ghost" href={focus.openHref} data-model-focus-action="open">Open in canvas</a>
            ) : (
              <button
                type="button"
                className="dm-btn-primary-sm"
                disabled={!focus.enabled || Boolean(busyAction)}
                title={focus.enabled ? chatAction.proofProduced : focus.blockedReason}
                onClick={() => runAction(chatAction)}
                data-model-focus-action={focus.mode}
              >
                {busyAction === chatAction.id ? "Creating…" : "Create workflow"}
              </button>
            )
          ) : null}
        </div>
        {actionMessage ? <p className="dm-helper-error" role="alert" data-model-action-error="">{actionMessage}</p> : null}
        {suggested.hasActions ? (
          <details className="training-advanced" data-model-loops-accordion="">
            <summary>Closed loops ({suggested.ready} ready)</summary>
            <ul className="dm-cockpit-steps" aria-label="Model closed loops">
              {suggested.actions.filter((a) => a.variant !== "chat").map((a) => (
                <li key={a.id} className={`dm-cockpit-step${a.enabled ? "" : " dm-cockpit-step-muted"}`} data-model-loop={a.id}>
                  <span className={`dm-cockpit-step-chip dm-status-chip${a.enabled ? " is-ok" : ""}`}>
                    <span className="dm-status-dot" aria-hidden="true" />{a.enabled ? "ready" : "gated"}
                  </span>
                  <span className="dm-cockpit-step-body">
                    <span className="dm-cockpit-step-label">{a.title}</span>
                    <span className="dm-cockpit-step-desc">{a.enabled ? a.whyNow : a.blockedReason}</span>
                  </span>
                  <button
                    type="button"
                    className="dm-btn-ghost"
                    disabled={!a.enabled || Boolean(busyAction)}
                    title={a.enabled ? a.proofProduced : a.blockedReason}
                    onClick={() => runAction(a)}
                    data-model-loop-action={a.id}
                  >
                    {busyAction === a.id ? "Creating…" : a.mode === "open" ? "Open" : "Create"}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {canShowSettings ? (
          <details className="training-advanced" data-cockpit-settings-accordion="">
            <summary>Settings</summary>
            {cockpit.registryBound ? (
              <div className="dm-cockpit-config-grid">
                {cockpit.settingsFields.map((f) => <ConfigField key={f.key} field={f} />)}
              </div>
            ) : (
              <p className="dm-cockpit-subtle">No API Registry row bound yet — verify the endpoint in Training to populate the request contract.</p>
            )}
            <div className="dm-cockpit-settings-actions">
              {model.canExport
                ? <button type="button" className="dm-btn-ghost" onClick={() => exportManifest(model, workspaceConfig)} data-model-export="">Export developer manifest</button>
                : null}
              <a className="dm-btn-ghost" href={model.links.dataModel} data-model-duplicate="">Duplicate in Data Model</a>
              <a className="dm-btn-ghost" href={model.links.dataModel} data-model-delete="">Delete in Data Model</a>
            </div>
          </details>
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
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/workspace", { signal: controller.signal });
        if (!res.ok) throw new Error(`workspace request failed (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.workspaceConfig) setWorkspaceConfig(data.workspaceConfig);
        if (data?.workspaceSourceRecords) setWorkspaceSourceRecords(data.workspaceSourceRecords);
      } catch (fetchError) {
        if (fetchError?.name === "AbortError") return;
        if (!cancelled) setError("Workspace config unavailable — start the workspace app.");
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [providedConfig, providedRecords]);

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
      <div data-custom-models-ledger="" data-custom-models-empty="" data-custom-models-inline-training="">
        <TrainingLedger
          workspaceConfig={workspaceConfig}
          workspaceSourceRecords={workspaceSourceRecords}
          compactBootstrap
        />
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

      {verified === 0 ? (
        <div data-custom-models-inline-training="" data-custom-models-unverified-training="">
          <TrainingLedger
            workspaceConfig={workspaceConfig}
            workspaceSourceRecords={workspaceSourceRecords}
            compactBootstrap
          />
        </div>
      ) : null}
    </div>
  );
}
