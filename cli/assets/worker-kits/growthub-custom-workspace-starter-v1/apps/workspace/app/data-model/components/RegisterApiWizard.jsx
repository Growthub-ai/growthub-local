"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, RefreshCw, X } from "lucide-react";
import { normalizeApiRegistryInput, resolverRequired } from "@/lib/api-registration";

/**
 * RegisterApiWizard — step-by-step no-code lane that creates an API Registry
 * row + optional resolver file, end to end. Built on the SAME visual language
 * as LiveSourcePanel (live-source-wizard / live-source-*), rendered inside the
 * existing modal chrome (dm-orch-modal). Backed by:
 *   - POST /api/workspace/register-api  (propose | apply)
 *   - GET  /api/workspace/env-key-catalog (auth resolution truth)
 *   - POST /api/workspace/test-api-record (connection test)
 *
 * Reinforces the mental model: the row is portable config, the secret lives
 * server-side in .env.local, the resolver is server file code.
 *
 * Steps: 1 Identity · 2 Request · 3 Auth · 4 Output · 5 Review/Test/Apply
 */

const STEP_LABELS = ["Identity", "Request", "Auth", "Output", "Review"];
const AUTH_MODES = [
  { id: "none", title: "No auth", hint: "Public endpoint — no credentials sent." },
  { id: "api-key", title: "API key header", hint: "x-api-key, value resolved server-side from your env." },
  { id: "bearer", title: "Bearer token", hint: "Authorization: Bearer <token>, resolved server-side." },
  { id: "custom", title: "Custom header", hint: "Your header name + the resolved value." },
];
const OUTPUT_MODES = [
  { id: "raw", title: "Raw response", hint: "Store/display the JSON as returned. No resolver file." },
  { id: "normalized", title: "Normalized rows", hint: "Generate a server resolver that shapes the response into rows." },
];

function slugFrom(v) {
  return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

export function RegisterApiWizard({ open, onClose, onApplied }) {
  const [step, setStep] = useState(1);
  const [idTouched, setIdTouched] = useState(false);
  const [form, setForm] = useState({
    name: "", integrationId: "", description: "",
    baseUrl: "", endpoint: "", method: "GET", sample: "",
    authMode: "none", authRef: "",
    outputMode: "raw", entityType: "", recordsPath: "",
  });
  const [envCatalog, setEnvCatalog] = useState(null);
  const [plan, setPlan] = useState(null);
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyReceipt, setApplyReceipt] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testState, setTestState] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStep(1); setIdTouched(false);
    setForm({ name: "", integrationId: "", description: "", baseUrl: "", endpoint: "", method: "GET", sample: "", authMode: "none", authRef: "", outputMode: "raw", entityType: "", recordsPath: "" });
    setPlan(null); setApplyReceipt(null); setTestState(null); setErr(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/workspace/env-key-catalog", { cache: "no-store" })
      .then((r) => r.json())
      .then((p) => setEnvCatalog(Array.isArray(p?.entries) ? p : null))
      .catch(() => setEnvCatalog(null));
  }, [open, applyReceipt]);

  function set(fields) {
    setForm((c) => {
      const next = { ...c, ...fields };
      if (!idTouched && fields.name !== undefined) next.integrationId = slugFrom(fields.name);
      return next;
    });
  }

  const engineInput = useMemo(() => ({
    name: form.name, integrationId: form.integrationId, description: form.description,
    baseUrl: form.baseUrl, endpoint: form.endpoint, method: form.method,
    authRef: form.authMode === "none" ? "" : form.authRef,
    needsResolver: form.outputMode === "normalized",
    entityType: form.entityType, recordsPath: form.recordsPath,
    connectorKind: form.outputMode === "normalized" ? "custom" : "http",
    resolverTemplateId: form.outputMode === "normalized" ? "custom-http-resolver" : "custom-http",
  }), [form]);

  const willNeedResolver = useMemo(() => resolverRequired(engineInput), [engineInput]);
  const localErrors = useMemo(() => normalizeApiRegistryInput(engineInput).errors, [engineInput]);

  const authConfigured = useMemo(() => {
    if (form.authMode === "none" || !form.authRef) return null;
    const e = (envCatalog?.entries || []).find((x) => x.slug === form.authRef || x.slug.toUpperCase() === form.authRef.toUpperCase());
    return e ? e.configured === true : false;
  }, [envCatalog, form.authRef, form.authMode]);

  const expectedEnvNames = useMemo(() => {
    const t = slugFrom(form.authRef).replace(/-/g, "_").toUpperCase();
    return t ? [t, `${t}_API_KEY`, `${t}_TOKEN`] : [];
  }, [form.authRef]);

  if (!open) return null;

  const canStep1 = Boolean(slugFrom(form.integrationId || form.name));
  const canStep2 = Boolean(form.baseUrl.trim() || form.endpoint.trim());
  const canStep3 = form.authMode === "none" || Boolean(form.authRef.trim());
  const canStep4 = form.outputMode === "raw" || Boolean(form.entityType.trim());
  const applied = applyReceipt?.ok === true;
  const partial = err?.where === "apply" && err?.resolver?.written === true;

  async function goReview() {
    setProposing(true); setErr(null); setPlan(null);
    try {
      const res = await fetch("/api/workspace/register-api", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "propose", input: engineInput }),
      });
      const p = await res.json();
      if (!res.ok) { setErr({ where: "propose", message: p.error || "Could not build plan", details: p.details }); return; }
      setPlan(p.plan); setStep(5);
    } catch (e) {
      setErr({ where: "propose", message: e.message || "Network error" });
    } finally { setProposing(false); }
  }

  async function apply() {
    setApplying(true); setErr(null); setApplyReceipt(null);
    try {
      const res = await fetch("/api/workspace/register-api", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "apply", input: engineInput }),
      });
      const p = await res.json();
      if (!res.ok) { setErr({ where: "apply", status: res.status, message: p.error, reason: p.reason, recovery: p.recovery, guidance: p.guidance, resolver: p.resolver }); return; }
      setApplyReceipt(p);
      if (typeof onApplied === "function") onApplied(p.workspaceConfig);
    } catch (e) {
      setErr({ where: "apply", message: e.message || "Network error" });
    } finally { setApplying(false); }
  }

  async function runTest() {
    setTesting(true); setTestState(null);
    try {
      const res = await fetch("/api/workspace/test-api-record", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ record: plan?.config?.row || {} }),
      });
      const p = await res.json();
      setTestState({ ok: p.ok === true, status: p.status, usedServerSecret: p.usedServerSecret, error: p.error, authRef: p.authRef });
    } catch (e) {
      setTestState({ ok: false, error: e.message || "Test request failed" });
    } finally { setTesting(false); }
  }

  return (
    <div className="dm-orch-modal-backdrop" onClick={onClose}>
      <section className="dm-orch-modal" role="dialog" aria-modal="true" aria-label="Register API"
        style={{ width: "min(680px, 94vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>
        <header className="dm-orch-modal-head">
          <div><p>Governed creation lane</p><h2>Register API</h2></div>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </header>

        <div className="dm-orch-modal-body" style={{ overflowY: "auto", flex: 1 }}>
          <div className="live-source-wizard">
            <div className="live-source-steps" role="list">
              {STEP_LABELS.map((label, idx) => {
                const s = idx + 1;
                const done = applied || step > s;
                const active = !applied && step === s;
                return (
                  <span key={s} className={`live-source-step${active ? " active" : ""}${done ? " done" : ""}`} role="listitem" aria-current={active ? "step" : undefined}>
                    <span className="live-source-step-dot">{done ? "✓" : s}</span>
                    <span className="live-source-step-label">{label}</span>
                  </span>
                );
              })}
            </div>

            {applied ? (
              <AppliedBody receipt={applyReceipt} testState={testState} testing={testing} onTest={runTest} onClose={onClose} />
            ) : step === 1 ? (
              <div className="live-source-step-body">
                <p className="live-source-step-title">What are you connecting?</p>
                <p className="live-source-step-hint">The API Registry row is portable config — it travels with your workspace. No secret is stored here.</p>
                <label className="live-source-field"><span>Integration name</span>
                  <input type="text" placeholder="LeadShark" value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
                <label className="live-source-field"><span>integrationId</span>
                  <input type="text" placeholder="leadshark" value={form.integrationId} onChange={(e) => { setIdTouched(true); setForm((c) => ({ ...c, integrationId: slugFrom(e.target.value) })); }} /></label>
                <label className="live-source-field"><span>Business purpose</span>
                  <input type="text" placeholder="Verified B2B lead records" value={form.description} onChange={(e) => set({ description: e.target.value })} /></label>
                <div className="live-source-nav">
                  <button type="button" className="live-source-back" onClick={onClose}>Cancel</button>
                  <button type="button" className="live-source-next" disabled={!canStep1} onClick={() => setStep(2)}>Next → Request</button>
                </div>
              </div>
            ) : step === 2 ? (
              <div className="live-source-step-body">
                <p className="live-source-step-title">Request contract</p>
                <p className="live-source-step-hint">Where the workspace calls. Auth is configured next — never put a key here.</p>
                <label className="live-source-field"><span>Base URL</span>
                  <input type="text" placeholder="https://api.leadshark.io" value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} /></label>
                <label className="live-source-field"><span>Endpoint</span>
                  <input type="text" placeholder="/v1/leads" value={form.endpoint} onChange={(e) => set({ endpoint: e.target.value })} /></label>
                <label className="live-source-field"><span>Method</span>
                  <select value={form.method} onChange={(e) => set({ method: e.target.value })}>
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select></label>
                <label className="live-source-field"><span>Sample request / notes (optional)</span>
                  <input type="text" placeholder='{"limit": 50}' value={form.sample} onChange={(e) => set({ sample: e.target.value })} /></label>
                <div className="live-source-nav">
                  <button type="button" className="live-source-back" onClick={() => setStep(1)}>← Back</button>
                  <button type="button" className="live-source-next" disabled={!canStep2} onClick={() => setStep(3)}>Next → Auth</button>
                </div>
              </div>
            ) : step === 3 ? (
              <div className="live-source-step-body">
                <p className="live-source-step-title">How does it authenticate?</p>
                <p className="live-source-step-hint">Only the env-key slug is stored in config. The value lives in <code>.env.local</code> server-side.</p>
                <div className="live-source-auth-toggle" role="radiogroup" aria-label="Auth mode">
                  {AUTH_MODES.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={form.authMode === m.id}
                      className={form.authMode === m.id ? "active" : ""} onClick={() => set({ authMode: m.id })}>
                      <strong>{m.title}</strong><em>{m.hint}</em>
                    </button>
                  ))}
                </div>
                {form.authMode !== "none" && (
                  <>
                    <label className="live-source-field"><span>authRef (env key slug)</span>
                      <input type="text" placeholder="leadshark" value={form.authRef} onChange={(e) => set({ authRef: e.target.value })} /></label>
                    {form.authRef && (
                      <div className={`live-source-test-result${authConfigured ? " success" : " error"}`}>
                        <strong>{authConfigured ? "✓ Resolves to a server-side value now" : `No value resolves yet for "${form.authRef}"`}</strong>
                        {!authConfigured && (
                          <p>Expected one of: {expectedEnvNames.map((n) => <code key={n} style={{ marginRight: 4 }}>{n}</code>)}.{" "}
                            <Link href="/settings/apis-webhooks" className="live-source-entry">Open Settings → APIs &amp; Webhooks</Link></p>
                        )}
                      </div>
                    )}
                  </>
                )}
                <div className="live-source-nav">
                  <button type="button" className="live-source-back" onClick={() => setStep(2)}>← Back</button>
                  <button type="button" className="live-source-next" disabled={!canStep3} onClick={() => setStep(4)}>Next → Output</button>
                </div>
              </div>
            ) : step === 4 ? (
              <div className="live-source-step-body">
                <p className="live-source-step-title">Output behavior</p>
                <p className="live-source-step-hint">Raw stores the JSON as-is. Normalized generates a server resolver file to shape rows.</p>
                <div className="live-source-auth-toggle" role="radiogroup" aria-label="Output mode">
                  {OUTPUT_MODES.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={form.outputMode === m.id}
                      className={form.outputMode === m.id ? "active" : ""} onClick={() => set({ outputMode: m.id })}>
                      <strong>{m.title}</strong><em>{m.hint}</em>
                      {m.id === "normalized" ? <span className="live-source-badge neutral">server file</span> : <span className="live-source-badge connected">config only</span>}
                    </button>
                  ))}
                </div>
                {form.outputMode === "normalized" && (
                  <>
                    <label className="live-source-field"><span>Entity type</span>
                      <input type="text" placeholder="leadshark.leads" value={form.entityType} onChange={(e) => set({ entityType: e.target.value })} /></label>
                    <label className="live-source-field"><span>Records path (optional)</span>
                      <input type="text" placeholder="data" value={form.recordsPath} onChange={(e) => set({ recordsPath: e.target.value })} /></label>
                    <p className="live-source-step-hint">A resolver file will be proposed under <code>lib/adapters/integrations/resolvers/</code>. You review the full source before it is written.</p>
                  </>
                )}
                {form.outputMode === "raw" && willNeedResolver && (
                  <p className="live-source-step-hint">This shape suggests custom normalization — consider “Normalized rows”.</p>
                )}
                <div className="live-source-nav">
                  <button type="button" className="live-source-back" onClick={() => setStep(3)}>← Back</button>
                  <button type="button" className="live-source-next" disabled={!canStep4 || proposing} onClick={goReview}>
                    {proposing ? "Building plan…" : "Next → Review"}
                  </button>
                </div>
              </div>
            ) : (
              <ReviewBody plan={plan} proposing={proposing} authConfigured={authConfigured} applying={applying} onApply={apply} onBack={() => setStep(4)} />
            )}

            {err && (
              <div className="live-source-test-result error">
                <strong>{err.message || "Something failed"}</strong>
                {err.reason && <p>{err.reason}</p>}
                {err.status === 409 && <p>{err.guidance || "This runtime is read-only. Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime, or edit growthub.config.json locally."}</p>}
                {partial && <p>Partial state: resolver <code>{err.resolver.path}</code> was written but the API Registry row was not saved. Re-apply to converge, or delete the file.</p>}
                {err.recovery && <p>Next: {err.recovery}</p>}
                {Array.isArray(err.details) && err.details.length > 0 && <p>{err.details.join("; ")}</p>}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ReviewBody({ plan, proposing, authConfigured, applying, onApply, onBack }) {
  if (proposing || !plan) {
    return <div className="live-source-step-body"><div className="live-source-testing"><RefreshCw size={15} className="spinning" /><span>Building governed plan…</span></div></div>;
  }
  const row = plan.config.row;
  return (
    <div className="live-source-step-body">
      <p className="live-source-step-title">Review &amp; apply</p>
      <div className="live-source-summary">
        <span><em>integrationId (config)</em> <strong>{row.integrationId}</strong></span>
        <span><em>request</em> <strong>{row.method} {plan.testPlan.url || "—"}</strong></span>
        <span><em>authRef (slug)</em> <strong>{row.authRef || "none"}</strong></span>
        <span><em>config target</em> <strong>{plan.config.mode === "object.create" ? "new API Registry object" : "append to API Registry"}</strong></span>
      </div>

      {plan.env.required && (
        <div className={`live-source-test-result${authConfigured || plan.env.configured ? " success" : " error"}`}>
          <strong>{authConfigured || plan.env.configured ? "✓ Auth resolves" : "Auth not resolved yet"}</strong>
          <p>{plan.env.hint}</p>
        </div>
      )}

      {plan.resolver.required ? (
        <div className="live-source-preview">
          <p className="live-source-step-hint">Server file (resolver) — required because output is normalized. Target <code>{plan.resolver.path}</code>. No secret is inlined.</p>
          <pre style={{ maxHeight: 200, overflow: "auto", fontSize: 11, margin: 0, whiteSpace: "pre-wrap" }}>{plan.resolver.source}</pre>
        </div>
      ) : (
        <p className="live-source-step-hint">No resolver file needed — the raw HTTP response is stored/displayed directly.</p>
      )}

      <p className="live-source-step-hint">Rollback: {plan.rollback.config}{plan.rollback.resolver ? `; ${plan.rollback.resolver}` : ""}.</p>

      <div className="live-source-nav">
        <button type="button" className="live-source-back" onClick={onBack}>← Back</button>
        <button type="button" className="live-source-apply" disabled={applying || !plan.valid} onClick={onApply}>
          {applying ? "Applying…" : "✓ Apply"}
        </button>
      </div>
    </div>
  );
}

function AppliedBody({ receipt, testState, testing, onTest, onClose }) {
  const steps = receipt?.activation?.steps || [];
  return (
    <div className="live-source-step-body">
      <p className="live-source-step-title">Applied</p>
      <div className="live-source-test-result success">
        <strong>✓ API Registry row {receipt.integrationId} saved</strong>
        <span>
          {receipt.config.mode === "object.create" ? "Created a new API Registry object. " : "Appended to the API Registry. "}
          {receipt.resolver?.required ? (receipt.resolver.written ? `Resolver written to ${receipt.resolver.path}.` : "Resolver required but not written.") : "No resolver needed."}
        </span>
      </div>

      <div className="live-source-summary">
        {steps.map((s) => (
          <span key={s.id}>
            <em>{s.label}</em> <strong>{s.status === "complete" ? "✓ ready" : s.status}</strong>
          </span>
        ))}
      </div>
      {!receipt.activation?.complete && receipt.activation?.nextStepId && (
        <p className="live-source-step-hint">Next: complete “{receipt.activation.nextStepId}”.</p>
      )}

      {!testState && !testing && (
        <button type="button" className="live-source-test-btn" onClick={onTest}><RefreshCw size={15} /> Test connection now</button>
      )}
      {testing && <div className="live-source-testing"><RefreshCw size={15} className="spinning" /><span>Testing…</span></div>}
      {testState && (
        <div className={`live-source-test-result${testState.ok ? " success" : " error"}`}>
          <strong>{testState.ok ? `✓ Connected (HTTP ${testState.status}${testState.usedServerSecret ? ", auth resolved" : ""})` : `Failed${testState.status ? ` (HTTP ${testState.status})` : ""}`}</strong>
          {!testState.ok && <p>{testState.error || "no response"}{testState.authRef ? ` — confirm the env key for "${testState.authRef}" in Settings.` : ""}</p>}
          <button type="button" className="live-source-retry" onClick={onTest} disabled={testing}>Re-test</button>
        </div>
      )}

      <div className="live-source-nav">
        <span />
        <button type="button" className="live-source-apply" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
