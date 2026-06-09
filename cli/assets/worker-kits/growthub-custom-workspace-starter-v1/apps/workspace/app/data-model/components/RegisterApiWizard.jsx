"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Play, X } from "lucide-react";
import { ResolverProposalStudio } from "./ResolverProposalStudio.jsx";

const OUTPUT_MODES = [
  { id: "raw-response", label: "Raw response", description: "Store test output only — no resolver or data source." },
  { id: "normalized-rows", label: "Normalized rows", description: "Generate a resolver and Data Source for tabular records." },
  { id: "data-source", label: "Data Source", description: "Create a governed Data Source backed by your API." },
  { id: "workflow-action", label: "Workflow action", description: "Wire a Sandbox/Workflow cockpit for orchestration." },
];

const AUTH_MODES = [
  { id: "none", label: "None" },
  { id: "api-key", label: "API key header" },
  { id: "bearer", label: "Bearer token" },
  { id: "custom-header", label: "Custom header" },
];

const STEPS = ["identity", "request", "auth", "output", "preview", "test", "apply"];

function blankDraft() {
  return {
    name: "",
    integrationId: "",
    businessPurpose: "",
    description: "",
    baseUrl: "",
    endpoint: "",
    method: "GET",
    authMode: "api-key",
    authRef: "",
    authHeaderName: "x-api-key",
    authPrefix: "",
    outputMode: "data-source",
    entityType: "records",
  };
}

export function RegisterApiWizard({ open, onClose, persistence, onApplied, readOnly }) {
  const [step, setStep] = useState("identity");
  const [draft, setDraft] = useState(blankDraft);
  const [bundle, setBundle] = useState(null);
  const [envCatalog, setEnvCatalog] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyReceipt, setApplyReceipt] = useState(null);
  const [error, setError] = useState("");

  const stepIndex = STEPS.indexOf(step);

  const refreshBundle = useCallback(async (nextDraft, extra = {}) => {
    const res = await fetch("/api/workspace/creation-proposals/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: { ...nextDraft, ...extra } }),
    });
    const payload = await res.json().catch(() => ({}));
    if (payload?.bundle) setBundle(payload.bundle);
    return payload?.bundle;
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep("identity");
    setDraft(blankDraft());
    setBundle(null);
    setTestResult(null);
    setApplyReceipt(null);
    setError("");
    fetch("/api/workspace/env-key-catalog")
      .then((r) => r.json())
      .then(setEnvCatalog)
      .catch(() => setEnvCatalog(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      refreshBundle(draft, { testPassed: testResult?.ok === true, lastTested: testResult?.ok ? new Date().toISOString() : undefined });
    }, 300);
    return () => clearTimeout(handle);
  }, [draft, open, refreshBundle, testResult?.ok]);

  const envEntry = useMemo(() => {
    const slug = String(draft.authRef || draft.integrationId || "").trim();
    if (!slug || !envCatalog?.entries) return null;
    return envCatalog.entries.find((e) => e.slug === slug) || null;
  }, [draft.authRef, draft.integrationId, envCatalog]);

  const resolverProposal = useMemo(
    () => (bundle?.proposals || []).find((p) => p.type === "creation.resolver-file")?.payload || null,
    [bundle]
  );

  async function runTest() {
    setTesting(true);
    setError("");
    setTestResult(null);
    const apiRow = bundle?.proposals?.find((p) => p.type === "creation.api-registry-row")?.payload?.row;
    if (!apiRow) {
      setError("Complete the draft before testing.");
      setTesting(false);
      return;
    }
    try {
      const res = await fetch("/api/workspace/test-api-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ record: apiRow }),
      });
      const payload = await res.json().catch(() => ({}));
      setTestResult(payload);
      if (!payload.ok) setError(payload.error || "API test failed");
      else await refreshBundle(draft, { testPassed: true, lastTested: new Date().toISOString() });
      setStep("test");
    } catch (err) {
      setError(err?.message || "Test request failed");
    } finally {
      setTesting(false);
    }
  }

  async function applyBundle() {
    if (!bundle || readOnly) return;
    setApplying(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/creation-proposals/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundle }),
      });
      const payload = await res.json().catch(() => ({}));
      setApplyReceipt(payload);
      if (!res.ok) {
        setError(payload.error || payload.activationNote || "Apply failed");
        return;
      }
      setStep("apply");
      onApplied?.(payload);
    } catch (err) {
      setError(err?.message || "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="dm-orchestration-confirm dm-orchestration-confirm__backdrop" role="presentation" onClick={onClose}>
      <section
        className="dm-orchestration-confirm__dialog dm-register-api-wizard"
        role="dialog"
        aria-label="Register API wizard"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dm-orchestration-confirm__head">
          <div>
            <p className="dm-api-action-card-eyebrow">Creation lane</p>
            <h2>Register API</h2>
            <p>Intent → API Registry → auth → test → apply with receipts. No secrets in config.</p>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close wizard">
            <X size={18} />
          </button>
        </header>

        <nav className="dm-wizard-steps" aria-label="Wizard steps">
          {STEPS.map((id, index) => (
            <button
              key={id}
              type="button"
              className={`dm-wizard-step ${step === id ? "is-active" : ""} ${index < stepIndex ? "is-done" : ""}`}
              onClick={() => setStep(id)}
            >
              {index < stepIndex ? <Check size={12} aria-hidden="true" /> : index + 1}
              <span>{id}</span>
            </button>
          ))}
        </nav>

        {readOnly && (
          <div className="workspace-readiness-row warn">
            <span>Runtime</span>
            <em>{persistence?.guidance || "This runtime is read-only. Edit growthub.config.json locally or enable filesystem writes."}</em>
          </div>
        )}

        {step === "identity" && (
          <div className="dm-wizard-panel">
            <label>Name<input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="LeadShark API" /></label>
            <label>Integration ID<input value={draft.integrationId} onChange={(e) => setDraft((d) => ({ ...d, integrationId: e.target.value }))} placeholder="leadshark" /></label>
            <label>Business purpose<textarea value={draft.businessPurpose} onChange={(e) => setDraft((d) => ({ ...d, businessPurpose: e.target.value }))} rows={2} /></label>
            <label>Description<textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={2} /></label>
          </div>
        )}

        {step === "request" && (
          <div className="dm-wizard-panel">
            <label>Base URL<input value={draft.baseUrl} onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))} placeholder="https://api.example.com" /></label>
            <label>Endpoint<input value={draft.endpoint} onChange={(e) => setDraft((d) => ({ ...d, endpoint: e.target.value }))} placeholder="/v1/leads" /></label>
            <label>Method
              <select value={draft.method} onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value }))}>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
        )}

        {step === "auth" && (
          <div className="dm-wizard-panel">
            <label>Auth mode
              <select value={draft.authMode} onChange={(e) => setDraft((d) => ({ ...d, authMode: e.target.value }))}>
                {AUTH_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Auth ref (env slug)<input value={draft.authRef} onChange={(e) => setDraft((d) => ({ ...d, authRef: e.target.value }))} placeholder="leadshark" /></label>
            {draft.authMode !== "none" && (
              <>
                <label>Header name<input value={draft.authHeaderName} onChange={(e) => setDraft((d) => ({ ...d, authHeaderName: e.target.value }))} /></label>
                {draft.authMode === "bearer" && <label>Prefix<input value={draft.authPrefix || "Bearer"} onChange={(e) => setDraft((d) => ({ ...d, authPrefix: e.target.value }))} /></label>}
              </>
            )}
            <div className="dm-env-chip-row">
              <span className={`dm-env-chip ${envEntry?.configured ? "is-configured" : "is-missing"}`}>
                {envEntry?.configured ? "env configured" : "env missing"}
              </span>
              <Link href="/settings/apis-webhooks" className="workspace-readiness-action">
                <ExternalLink size={14} aria-hidden="true" /> Save secret in Settings
              </Link>
            </div>
          </div>
        )}

        {step === "output" && (
          <div className="dm-wizard-panel">
            {OUTPUT_MODES.map((mode) => (
              <label key={mode.id} className={`dm-output-mode-card ${draft.outputMode === mode.id ? "is-selected" : ""}`}>
                <input type="radio" name="outputMode" checked={draft.outputMode === mode.id} onChange={() => setDraft((d) => ({ ...d, outputMode: mode.id }))} />
                <strong>{mode.label}</strong>
                <span>{mode.description}</span>
              </label>
            ))}
          </div>
        )}

        {step === "preview" && bundle && (
          <div className="dm-wizard-panel">
            <p><strong>Surfaces:</strong> {(bundle.targetSurfaces || []).join(", ")}</p>
            <p><strong>Resolver:</strong> {bundle.resolverNeed}</p>
            <ul className="dm-api-action-checklist">
              {(bundle.proposals || []).map((p) => (
                <li key={p.type} className={p.validation?.valid ? "is-done" : "is-pending"}>
                  {p.validation?.valid ? <Check size={14} /> : <X size={14} />}
                  <span>{p.type.replace("creation.", "")}</span>
                </li>
              ))}
            </ul>
            {resolverProposal && <ResolverProposalStudio proposal={resolverProposal} readOnly />}
            {(bundle.risks || []).map((risk) => <p key={risk} className="dm-wizard-risk">{risk}</p>)}
          </div>
        )}

        {step === "test" && (
          <div className="dm-wizard-panel">
            <button type="button" className="dm-btn-primary-sm" disabled={testing} onClick={runTest}>
              <Play size={14} aria-hidden="true" /> {testing ? "Testing…" : "Test API"}
            </button>
            {testResult && (
              <pre className="dm-run-console__stdout">{JSON.stringify({ ok: testResult.ok, status: testResult.status, usedServerSecret: testResult.usedServerSecret }, null, 2)}</pre>
            )}
          </div>
        )}

        {step === "apply" && (
          <div className="dm-wizard-panel">
            {applyReceipt?.applied?.length ? (
              <ul className="dm-api-action-checklist">
                {applyReceipt.applied.map((item) => (
                  <li key={item.type} className="is-done"><Check size={14} /><span>{item.type}</span></li>
                ))}
              </ul>
            ) : null}
            {applyReceipt?.activationNote && <p>{applyReceipt.activationNote}</p>}
          </div>
        )}

        {error && <p className="dm-wizard-error" role="alert">{error}</p>}

        <footer className="dm-orchestration-confirm__actions">
          <button type="button" className="dm-btn-outline" disabled={stepIndex <= 0} onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])}>Back</button>
          {step !== "apply" && (
            <button type="button" className="dm-btn-outline" onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)])}>Next</button>
          )}
          {step === "preview" && (
            <button type="button" className="dm-btn-primary-sm" disabled={readOnly || applying || !bundle?.validation?.draftComplete} onClick={applyBundle}>
              {applying ? "Applying…" : "Apply proposals"}
            </button>
          )}
          {(step === "test" || step === "preview") && (
            <button type="button" className="dm-btn-outline" disabled={testing} onClick={runTest}>
              {testing ? "Testing…" : "Test"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
