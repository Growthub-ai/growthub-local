"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { AUTH_MODES, OUTPUT_MODES } from "@/lib/workspace-creation-proposals";

const STEPS = ["identity", "request", "auth", "output", "preview", "test", "apply"];

export function RegisterApiWizard({ open, onClose, workspaceConfig, persistence, onApplied }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({
    name: "",
    integrationId: "",
    businessPurpose: "",
    description: "",
    baseUrl: "",
    endpoint: "",
    method: "GET",
    authMode: "env-ref",
    authRef: "",
    authHeaderName: "x-api-key",
    authPrefix: "",
    outputMode: "data-source",
    generateResolver: true,
  });
  const [bundle, setBundle] = useState(null);
  const [envCatalog, setEnvCatalog] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setBundle(null);
    setTestResult(null);
    setApplyResult(null);
    setError("");
    fetch("/api/workspace/env-key-catalog", { cache: "no-store" })
      .then((r) => r.json())
      .then(setEnvCatalog)
      .catch(() => setEnvCatalog(null));
  }, [open]);

  const authConfigured = useMemo(() => {
    if (draft.authMode === "none") return true;
    const slug = String(draft.authRef || draft.integrationId || "").trim();
    if (!slug || !envCatalog?.entries) return false;
    return envCatalog.entries.some((e) => e.slug === slug && e.configured);
  }, [draft, envCatalog]);

  const buildBundle = useCallback(async () => {
    const res = await fetch("/api/workspace/creation-proposal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "build", draft }),
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "Failed to build proposals");
    setBundle(payload.bundle);
    return payload.bundle;
  }, [draft]);

  async function goNext() {
    setError("");
    if (STEPS[step] === "preview") {
      try {
        await buildBundle();
      } catch (err) {
        setError(err.message || "Could not build preview");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function testApi() {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const apiRow = bundle?.proposals?.find((p) => p.payload?.objectType === "api-registry")?.payload?.row
        || {
          integrationId: draft.integrationId || draft.name,
          baseUrl: draft.baseUrl,
          endpoint: draft.endpoint,
          method: draft.method,
          authRef: draft.authRef || draft.integrationId,
          authHeaderName: draft.authHeaderName,
          authPrefix: draft.authPrefix,
        };
      const res = await fetch("/api/workspace/test-api-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ record: apiRow }),
      });
      const payload = await res.json();
      setTestResult(payload);
      if (!payload.ok) setError(payload.error || "API test failed");
    } catch (err) {
      setError(err.message || "API test failed");
    } finally {
      setTesting(false);
    }
  }

  async function applyBundle() {
    setApplying(true);
    setError("");
    try {
      const currentBundle = bundle || await buildBundle();
      const res = await fetch("/api/workspace/creation-proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", bundle: currentBundle }),
      });
      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.error || payload.guidance || "Apply failed");
        setApplyResult(payload);
        return;
      }
      setApplyResult(payload);
      onApplied?.(payload.workspaceConfig);
    } catch (err) {
      setError(err.message || "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  const readOnly = persistence?.canSave === false;
  const currentStep = STEPS[step];

  return (
    <div className="dm-json-modal-backdrop" onClick={onClose}>
      <section
        className="dm-json-modal dm-register-api-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Register API wizard"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p>Creation lane</p>
            <h2>Register API</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <nav className="dm-wizard-steps" aria-label="Wizard steps">
          {STEPS.map((id, index) => (
            <span key={id} className={index === step ? "is-active" : index < step ? "is-done" : ""}>
              {index < step ? <Check size={12} /> : null}
              {id}
            </span>
          ))}
        </nav>

        {readOnly && (
          <p className="dm-wizard-readonly">
            Read-only runtime — preview and test only. {persistence?.guidance || "Edit config locally to apply."}
          </p>
        )}

        {currentStep === "identity" && (
          <div className="dm-wizard-panel">
            <label>Name<input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="LeadShark API" /></label>
            <label>Integration ID<input value={draft.integrationId} onChange={(e) => setDraft((d) => ({ ...d, integrationId: e.target.value }))} placeholder="leadshark" /></label>
            <label>Business purpose<textarea value={draft.businessPurpose} onChange={(e) => setDraft((d) => ({ ...d, businessPurpose: e.target.value }))} rows={2} /></label>
            <label>Description<textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={2} /></label>
          </div>
        )}

        {currentStep === "request" && (
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

        {currentStep === "auth" && (
          <div className="dm-wizard-panel">
            <label>Auth mode
              <select value={draft.authMode} onChange={(e) => setDraft((d) => ({ ...d, authMode: e.target.value }))}>
                {AUTH_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            {draft.authMode !== "none" && (
              <>
                <label>authRef / env slug<input value={draft.authRef} onChange={(e) => setDraft((d) => ({ ...d, authRef: e.target.value }))} placeholder="leadshark" /></label>
                <label>Header name<input value={draft.authHeaderName} onChange={(e) => setDraft((d) => ({ ...d, authHeaderName: e.target.value }))} /></label>
                <p className={`dm-env-status ${authConfigured ? "is-ready" : "is-missing"}`}>
                  {authConfigured ? "Secret resolves in runtime" : "Secret not configured — "}
                  {!authConfigured && <Link href="/settings/apis-webhooks">save in Settings</Link>}
                </p>
              </>
            )}
          </div>
        )}

        {currentStep === "output" && (
          <div className="dm-wizard-panel">
            <label>Output mode
              <select value={draft.outputMode} onChange={(e) => setDraft((d) => ({ ...d, outputMode: e.target.value }))}>
                {OUTPUT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="dm-toggle-inline">
              <input type="checkbox" checked={draft.generateResolver} onChange={(e) => setDraft((d) => ({ ...d, generateResolver: e.target.checked }))} />
              Generate resolver file when needed
            </label>
          </div>
        )}

        {currentStep === "preview" && bundle && (
          <div className="dm-wizard-panel">
            <p>{bundle.businessGoal}</p>
            <ul className="dm-wizard-artifacts">
              {bundle.proposals.map((p) => (
                <li key={`${p.type}-${p.meta?.surface}`}>
                  <strong>{p.type}</strong> — {p.rationale}
                </li>
              ))}
            </ul>
            {bundle.warnings?.length > 0 && (
              <ul className="dm-wizard-warnings">{bundle.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            )}
          </div>
        )}

        {currentStep === "test" && (
          <div className="dm-wizard-panel">
            <p>Test the API contract before applying config changes.</p>
            <button type="button" className="dm-btn-primary-sm" disabled={testing || (draft.authMode !== "none" && !authConfigured)} onClick={testApi}>
              {testing ? "Testing…" : "Test API"}
            </button>
            {testResult && (
              <pre className="dm-wizard-test-result">{JSON.stringify({ ok: testResult.ok, status: testResult.status, authRef: testResult.authRef, usedServerSecret: testResult.usedServerSecret }, null, 2)}</pre>
            )}
          </div>
        )}

        {currentStep === "apply" && (
          <div className="dm-wizard-panel">
            <p>Apply governed proposals with receipts. No secret values are stored in config.</p>
            <button type="button" className="dm-btn-primary-sm" disabled={applying || readOnly} onClick={applyBundle}>
              {applying ? "Applying…" : "Apply proposals"}
            </button>
            {applyResult && (
              <pre className="dm-wizard-test-result">{JSON.stringify({ applied: applyResult.applied?.length, skipped: applyResult.skipped?.length, fileReceipts: applyResult.fileReceipts }, null, 2)}</pre>
            )}
          </div>
        )}

        {error && <p className="dm-wizard-error">{error}</p>}

        <footer className="dm-wizard-foot">
          <button type="button" className="dm-btn-outline" disabled={step === 0} onClick={goBack}>Back</button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="dm-btn-primary-sm" onClick={goNext}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" className="dm-btn-primary-sm" onClick={onClose}>Done</button>
          )}
        </footer>
      </section>
    </div>
  );
}
