"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { OUTPUT_MODES, AUTH_MODES } from "@/lib/workspace-creation-proposals";
import { ResolverProposalStudio } from "./ResolverProposalStudio.jsx";

const STEPS = [
  { id: "identity", label: "Identity" },
  { id: "contract", label: "Request" },
  { id: "auth", label: "Auth" },
  { id: "output", label: "Output" },
  { id: "preview", label: "Preview" },
  { id: "test", label: "Test" },
  { id: "apply", label: "Apply" },
];

const EMPTY_DRAFT = {
  name: "",
  integrationId: "",
  businessPurpose: "",
  description: "",
  baseUrl: "",
  endpoint: "",
  method: "GET",
  authMode: "api-key-header",
  authRef: "",
  authHeaderName: "x-api-key",
  outputMode: "data-source",
  includeResolver: true,
  includeWorkflow: false,
};

export function RegisterApiWizard({ open, onClose, onApplied, persistence, initialDraft }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT, ...initialDraft });
  const [bundle, setBundle] = useState(null);
  const [envCatalog, setEnvCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [error, setError] = useState("");

  const step = STEPS[stepIndex];
  const readOnly = persistence?.canSave === false;

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setDraft({ ...EMPTY_DRAFT, ...initialDraft });
    setBundle(null);
    setTestResult(null);
    setApplyResult(null);
    setError("");
  }, [open, initialDraft]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/workspace/env-key-catalog")
      .then((r) => r.json())
      .then(setEnvCatalog)
      .catch(() => setEnvCatalog(null));
  }, [open]);

  const refreshBundle = useCallback(async (nextDraft) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/creation-proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: nextDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "proposal build failed");
      setBundle(data.bundle);
    } catch (err) {
      setError(err.message || "Failed to build proposals");
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || step.id !== "preview") return;
    refreshBundle(draft);
  }, [open, step.id, draft, refreshBundle]);

  const apiProposal = useMemo(
    () => bundle?.proposals?.find((p) => p.type === "creation.api-registry-row"),
    [bundle]
  );

  const authConfigured = useMemo(() => {
    const ref = draft.authRef?.trim();
    if (!ref || draft.authMode === "none") return true;
    return envCatalog?.entries?.some((e) => e.slug === ref && e.configured);
  }, [draft.authRef, draft.authMode, envCatalog]);

  const statusChip = useMemo(() => {
    if (readOnly) return { label: "Read-only runtime", tone: "warn" };
    if (applyResult?.ok) return { label: "Applied", tone: "good" };
    if (testResult?.ok) return { label: "Test passed", tone: "good" };
    if (testResult && !testResult.ok) return { label: "Test failed", tone: "bad" };
    if (!authConfigured && draft.authMode !== "none") return { label: "Auth unresolved", tone: "warn" };
    if (bundle?.status === "ready-to-apply") return { label: "Ready to apply", tone: "good" };
    return { label: "Draft", tone: "muted" };
  }, [readOnly, applyResult, testResult, authConfigured, draft.authMode, bundle]);

  async function runTest() {
    const row = apiProposal?.payload?.row || draft;
    setLoading(true);
    setTestResult(null);
    setError("");
    try {
      const res = await fetch("/api/workspace/test-api-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ record: row }),
      });
      const data = await res.json();
      setTestResult(data);
      if (!data.ok) setError(data.error || "API test failed");
    } catch (err) {
      setError(err.message || "Test request failed");
    } finally {
      setLoading(false);
    }
  }

  async function runApply() {
    if (!bundle?.proposals?.length) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/creation-proposals/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundle, writeResolver: true }),
      });
      const data = await res.json();
      setApplyResult(data);
      if (!data.ok) setError(data.error || "Apply failed");
      else onApplied?.(data);
    } catch (err) {
      setError(err.message || "Apply request failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="dm-orchestration-confirm dm-orchestration-confirm__backdrop" onClick={onClose} role="presentation">
      <section
        className="dm-orchestration-confirm__dialog dm-creation-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-api-wizard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dm-orchestration-confirm__head">
          <div>
            <p>Creation lane</p>
            <h2 id="register-api-wizard-title">Register API</h2>
            <span className={`dm-creation-status-chip is-${statusChip.tone}`}>{statusChip.label}</span>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <nav className="dm-creation-wizard-steps" aria-label="Wizard steps">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`dm-creation-wizard-step${i === stepIndex ? " is-active" : ""}${i < stepIndex ? " is-done" : ""}`}
              onClick={() => setStepIndex(i)}
            >
              {i < stepIndex ? <Check size={12} /> : null}
              {s.label}
            </button>
          ))}
        </nav>

        <div className="dm-orchestration-confirm__body dm-creation-wizard-body">
          {readOnly ? (
            <p className="dm-creation-readonly-note">
              This runtime is read-only. You can draft and test, but apply requires a writable local runtime.
              {persistence?.guidance ? ` ${persistence.guidance}` : ""}
            </p>
          ) : null}

          {step.id === "identity" ? (
            <div className="dm-creation-form-grid">
              <label>Name<input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="LeadShark API" /></label>
              <label>Integration ID<input value={draft.integrationId} onChange={(e) => setDraft((d) => ({ ...d, integrationId: e.target.value }))} placeholder="leadshark" /></label>
              <label>Business purpose<textarea value={draft.businessPurpose} onChange={(e) => setDraft((d) => ({ ...d, businessPurpose: e.target.value }))} rows={2} /></label>
              <label>Description<textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={2} /></label>
            </div>
          ) : null}

          {step.id === "contract" ? (
            <div className="dm-creation-form-grid">
              <label>Base URL<input value={draft.baseUrl} onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))} placeholder="https://api.example.com" /></label>
              <label>Endpoint<input value={draft.endpoint} onChange={(e) => setDraft((d) => ({ ...d, endpoint: e.target.value }))} placeholder="/v1/leads" /></label>
              <label>Method
                <select value={draft.method} onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value }))}>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
          ) : null}

          {step.id === "auth" ? (
            <div className="dm-creation-form-grid">
              <label>Auth mode
                <select value={draft.authMode} onChange={(e) => setDraft((d) => ({ ...d, authMode: e.target.value }))}>
                  {AUTH_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              {draft.authMode !== "none" ? (
                <>
                  <label>Auth ref (env slug)<input value={draft.authRef} onChange={(e) => setDraft((d) => ({ ...d, authRef: e.target.value }))} placeholder="leadshark" /></label>
                  <label>Header name<input value={draft.authHeaderName} onChange={(e) => setDraft((d) => ({ ...d, authHeaderName: e.target.value }))} /></label>
                  <p className="dm-creation-env-hint">
                    {authConfigured ? "Env resolves — secret stored server-side only." : "Save secret in Settings → APIs & Webhooks before testing."}
                    {" "}
                    <a href="/settings/apis-webhooks">Open settings</a>
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          {step.id === "output" ? (
            <div className="dm-creation-form-grid">
              <label>Output mode
                <select value={draft.outputMode} onChange={(e) => setDraft((d) => ({ ...d, outputMode: e.target.value }))}>
                  {OUTPUT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="dm-creation-checkbox">
                <input type="checkbox" checked={draft.includeResolver} onChange={(e) => setDraft((d) => ({ ...d, includeResolver: e.target.checked }))} />
                Generate resolver file when recommended
              </label>
              <label className="dm-creation-checkbox">
                <input type="checkbox" checked={draft.includeWorkflow} onChange={(e) => setDraft((d) => ({ ...d, includeWorkflow: e.target.checked }))} />
                Also propose sandbox workflow row
              </label>
            </div>
          ) : null}

          {step.id === "preview" ? (
            <div className="dm-creation-preview">
              {loading ? <p>Building proposals…</p> : null}
              {bundle ? (
                <>
                  <p><strong>Business goal:</strong> {bundle.businessGoal || draft.name}</p>
                  <ul className="dm-creation-proposal-list">
                    {bundle.proposals.map((p) => (
                      <li key={p.type}>
                        <code>{p.type}</code> — <span>{p.status}</span> — <em>{p.stateKind}</em>
                      </li>
                    ))}
                  </ul>
                  {bundle.proposals.find((p) => p.type === "creation.resolver-file") ? (
                    <ResolverProposalStudio proposal={bundle.proposals.find((p) => p.type === "creation.resolver-file")} compact />
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {step.id === "test" ? (
            <div className="dm-creation-test">
              <p>Test the API contract with server-resolved auth. No secret values are shown.</p>
              <button type="button" className="dm-btn-primary-sm" disabled={loading || !apiProposal} onClick={runTest}>
                <Play size={14} />
                {loading ? "Testing…" : "Test API"}
              </button>
              {testResult ? (
                <pre className="dm-run-console__output">{JSON.stringify({ ok: testResult.ok, status: testResult.status, authRef: testResult.authRef, usedServerSecret: testResult.usedServerSecret }, null, 2)}</pre>
              ) : null}
            </div>
          ) : null}

          {step.id === "apply" ? (
            <div className="dm-creation-apply">
              <p>Apply config rows and optional resolver file with receipts. Partial resolver failure will not mark activation ready.</p>
              <button type="button" className="dm-btn-primary" disabled={loading || readOnly || bundle?.status !== "ready-to-apply"} onClick={runApply}>
                {loading ? "Applying…" : "Apply proposals"}
              </button>
              {applyResult ? (
                <pre className="dm-run-console__output">{JSON.stringify(applyResult.receipt || applyResult, null, 2)}</pre>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="dm-creation-error" role="alert">
              <AlertCircle size={14} />
              {error}
            </p>
          ) : null}
        </div>

        <footer className="dm-orchestration-confirm__foot">
          <button type="button" className="dm-btn-outline" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
            <ChevronLeft size={14} />
            Back
          </button>
          <button type="button" className="dm-btn-primary-sm" disabled={stepIndex >= STEPS.length - 1} onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}>
            Next
            <ChevronRight size={14} />
          </button>
        </footer>
      </section>
    </div>
  );
}
