"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Play, Save, X } from "lucide-react";
import { ResolverProposalStudio } from "./ResolverProposalStudio.jsx";

const OUTPUT_MODES = [
  { id: "raw-response", label: "Raw response" },
  { id: "normalized-rows", label: "Normalized rows" },
  { id: "data-source", label: "Data Source" },
  { id: "workflow-action", label: "Workflow action" },
];

const AUTH_MODES = [
  { id: "none", label: "None" },
  { id: "bearer", label: "Bearer token" },
  { id: "api-key", label: "API key header" },
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
    outputMode: "data-source",
    sourceLabel: "",
  };
}

export function RegisterApiWizard({ open, onClose, persistence, onApplied }) {
  const [step, setStep] = useState("identity");
  const [draft, setDraft] = useState(blankDraft());
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const canSave = persistence?.canSave !== false;
  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    if (!open) return;
    setStep("identity");
    setDraft(blankDraft());
    setBundle(null);
    setMessage("");
    setTestResult(null);
    setApplyResult(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/workspace/creation/propose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft }),
        });
        const payload = await res.json();
        if (!cancelled) setBundle(payload);
      } catch (err) {
        if (!cancelled) setMessage(err?.message || "Could not build proposal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draft, open]);

  const apiRow = useMemo(() => bundle?.proposals?.find((p) => p.type === "creation.api-registry-row")?.payload?.row, [bundle]);
  const resolverProposal = useMemo(() => bundle?.proposals?.find((p) => p.type === "creation.resolver-file")?.payload, [bundle]);
  const envRequirements = bundle?.envAuthRequirements || [];

  if (!open) return null;

  function update(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function testApi() {
    if (!apiRow) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspace/test-api-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ record: apiRow }),
      });
      const payload = await res.json();
      setTestResult(payload);
      setMessage(payload.ok ? "API test passed." : payload.error || "API test failed.");
    } catch (err) {
      setMessage(err?.message || "API test failed.");
    } finally {
      setLoading(false);
    }
  }

  async function applyBundle() {
    if (!bundle?.proposals?.length) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspace/creation/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposals: bundle.proposals }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Apply failed");
      setApplyResult(payload);
      setMessage("Creation bundle applied.");
      onApplied?.(payload);
    } catch (err) {
      setMessage(err?.message || "Apply failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dm-modal-backdrop" role="dialog" aria-modal="true" aria-label="Register API">
      <section className="dm-modal dm-register-api-wizard">
        <header className="dm-modal-header">
          <div>
            <p className="dm-api-action-card-eyebrow">Creation lane</p>
            <h2>Register API</h2>
          </div>
          <button type="button" className="dm-icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>

        <nav className="dm-wizard-steps" aria-label="Wizard steps">
          {STEPS.map((id, index) => (
            <button
              key={id}
              type="button"
              className={`dm-wizard-step ${step === id ? "is-active" : ""} ${index < stepIndex ? "is-done" : ""}`}
              onClick={() => setStep(id)}
            >
              {index < stepIndex ? <Check size={12} /> : index + 1}
              <span>{id}</span>
            </button>
          ))}
        </nav>

        {!canSave ? (
          <p className="dm-run-console__warn">
            Read-only runtime — preview proposals only. Set <code>WORKSPACE_CONFIG_ALLOW_FS_WRITE=true</code> or run locally to apply.
          </p>
        ) : null}

        {step === "identity" ? (
          <div className="dm-wizard-panel">
            <label>Name<input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="LeadShark API" /></label>
            <label>Integration ID<input value={draft.integrationId} onChange={(e) => update({ integrationId: e.target.value })} placeholder="leadshark" /></label>
            <label>Business purpose<textarea value={draft.businessPurpose} onChange={(e) => update({ businessPurpose: e.target.value })} rows={2} /></label>
            <label>Description<textarea value={draft.description} onChange={(e) => update({ description: e.target.value })} rows={2} /></label>
          </div>
        ) : null}

        {step === "request" ? (
          <div className="dm-wizard-panel">
            <label>Base URL<input value={draft.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} placeholder="https://api.example.com" /></label>
            <label>Endpoint<input value={draft.endpoint} onChange={(e) => update({ endpoint: e.target.value })} placeholder="/v1/leads" /></label>
            <label>Method
              <select value={draft.method} onChange={(e) => update({ method: e.target.value })}>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
        ) : null}

        {step === "auth" ? (
          <div className="dm-wizard-panel">
            <label>Auth mode
              <select value={draft.authMode} onChange={(e) => update({ authMode: e.target.value })}>
                {AUTH_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Auth ref / env key<input value={draft.authRef} onChange={(e) => update({ authRef: e.target.value })} placeholder="leadshark" /></label>
            {draft.authMode === "custom-header" ? (
              <label>Header name<input value={draft.authHeaderName} onChange={(e) => update({ authHeaderName: e.target.value })} /></label>
            ) : null}
            {envRequirements.some((e) => !e.configured) ? (
              <p className="dm-run-console__warn">
                Secret not configured. <Link href="/settings/apis-webhooks">Save it in Settings</Link> then return here — resolution is immediate, no restart.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "output" ? (
          <div className="dm-wizard-panel">
            <div className="dm-segmented">
              {OUTPUT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={draft.outputMode === mode.id ? "is-active" : ""}
                  onClick={() => update({ outputMode: mode.id })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {draft.outputMode === "data-source" || draft.outputMode === "workflow-action" ? (
              <label>Data Source label<input value={draft.sourceLabel} onChange={(e) => update({ sourceLabel: e.target.value })} /></label>
            ) : null}
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="dm-wizard-panel">
            <h3>Generated artifacts</h3>
            <ul className="dm-api-action-checklist">
              {(bundle?.proposals || []).map((proposal) => (
                <li key={proposal.type} className="is-done"><Check size={14} /><span>{proposal.type}</span></li>
              ))}
            </ul>
            {bundle?.risks?.length ? (
              <div className="dm-run-console__warn">
                {bundle.risks.map((risk) => <p key={risk}>{risk}</p>)}
              </div>
            ) : null}
            {resolverProposal ? <ResolverProposalStudio proposal={resolverProposal} readOnly canSave={canSave} /> : null}
          </div>
        ) : null}

        {step === "test" ? (
          <div className="dm-wizard-panel">
            <p>Test the API contract before applying config changes.</p>
            <button type="button" className="dm-btn-primary-sm" disabled={loading || !apiRow} onClick={testApi}>
              {loading ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
              Test API
            </button>
            {testResult ? (
              <pre className="dm-run-console__output">{JSON.stringify({ ok: testResult.ok, status: testResult.status, authRef: testResult.authRef, usedServerSecret: testResult.usedServerSecret }, null, 2)}</pre>
            ) : null}
          </div>
        ) : null}

        {step === "apply" ? (
          <div className="dm-wizard-panel">
            <p>Apply governed proposals with receipts. Resolver files respect the filesystem gate.</p>
            <button type="button" className="dm-btn-primary-sm" disabled={loading || !canSave || !bundle?.validation?.ok} onClick={applyBundle}>
              {loading ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
              Apply bundle
            </button>
            {applyResult ? (
              <pre className="dm-run-console__output">{JSON.stringify(applyResult.receipt || applyResult, null, 2)}</pre>
            ) : null}
          </div>
        ) : null}

        {message ? <p className="dm-run-console__meta">{message}</p> : null}

        <footer className="dm-modal-footer">
          <button type="button" className="dm-btn-outline" disabled={stepIndex <= 0} onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])}>Back</button>
          <button type="button" className="dm-btn-primary-sm" disabled={stepIndex >= STEPS.length - 1} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)])}>
            Next <ArrowRight size={14} />
          </button>
        </footer>
      </section>
    </div>
  );
}
