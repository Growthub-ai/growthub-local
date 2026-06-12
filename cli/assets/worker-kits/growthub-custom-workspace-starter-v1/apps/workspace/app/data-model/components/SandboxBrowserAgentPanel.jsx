"use client";

/**
 * Browser / local agent fast lane — record sidecar panel V1.
 *
 * Rendered inside the sandbox record drawer for rows that are browser/local-
 * agent relevant per `lib/sandbox-browser-agent-flow.js`. This is an exposure
 * of the existing governed execution path — NOT a new runtime:
 *
 *   template → runInputs envelope (growthub-workflow-run-inputs-v1)
 *            → POST /api/workspace/sandbox-run (the one existing route)
 *            → source-record receipt + row stamps
 *            → proof line rendered from persisted evidence only.
 *
 * Auth onboarding (Check / Login / Logout) stays in the adjacent
 * SandboxAgentAuthPanel — this panel only mirrors the stamped auth status so
 * there is exactly one control surface per concern. Serverless rows get a
 * read-only locality note; local browser/session access never pretends to
 * exist in the serverless lane.
 *
 * No raw JSON. No new design system. No new fetch surface.
 */

import { useMemo, useState } from "react";
import { Globe, Play, Workflow, FileText } from "lucide-react";
import { deriveSandboxBrowserAgentState } from "@/lib/sandbox-browser-agent-flow";
import {
  SANDBOX_BROWSER_RUN_TEMPLATES,
  SEND_MODES,
  buildBrowserRunInputsEnvelope,
  getBrowserRunInputTemplate
} from "@/lib/sandbox-browser-run-inputs";

const STATUS_LABEL = {
  ready: "Ready",
  blocked: "Blocked",
  running: "Running",
  connected: "Connected",
  failed: "Failed",
  "serverless-incompatible": "Local-only"
};

function statusKind(status) {
  if (status === "connected") return "ok";
  if (status === "failed") return "bad";
  if (status === "blocked" || status === "serverless-incompatible") return "warn";
  return "";
}

function proofLine(state) {
  const proof = state.browserProof;
  if (!proof) return "";
  if (state.status === "failed") return "Browser run failed before reaching target · open run output.";
  const runId = state.lastRun?.runId ? ` · run ${state.lastRun.runId}` : "";
  if (proof.reachedTarget) {
    const artifact = proof.artifact?.generated ? " · artifact generated" : "";
    return `Reached ${proof.platform || "target"}${artifact}${runId}`;
  }
  if (proof.fallbackUsed) return `Fallback used — browser target not reached${runId}`;
  return `Browser target not reached${runId}`;
}

export function SandboxBrowserAgentPanel({
  objectId,
  rowName,
  draft,
  workspaceConfig,
  disabled,
  onPatchDraft,
  onOpenGraph,
  onOpenTrace
}) {
  const [running, setRunning] = useState(false);
  const [templateId, setTemplateId] = useState("manual-browser-smoke");
  const [values, setValues] = useState({});
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState([]);

  const state = useMemo(
    () => deriveSandboxBrowserAgentState({ workspaceConfig, row: draft, objectId, running }),
    [workspaceConfig, draft, objectId, running]
  );

  const template = getBrowserRunInputTemplate(templateId);
  // Graph-declared input fields take precedence; template fields fill the
  // gap for command-based rows with no human-input node.
  const fields = useMemo(() => {
    const graphFields = Array.isArray(state.inputFields) ? state.inputFields : [];
    const templateFields = Array.isArray(template?.fields) ? template.fields : [];
    const seen = new Set(graphFields.map((f) => f.id));
    return [...graphFields, ...templateFields.filter((f) => !seen.has(f.id))];
  }, [state.inputFields, template]);

  if (!state.visible) return null;

  if (state.status === "serverless-incompatible") {
    return (
      <div className="dm-record-testbar" data-panel="sandbox-browser-agent" data-browser-agent-status={state.status}>
        <div className="dm-agent-auth-summary">
          <Globe size={15} aria-hidden />
          <div>
            <strong>Browser / local agent</strong>
            <span>Local-only capability</span>
          </div>
          <span className="dm-db-status warn" data-browser-agent-pill><span />Local-only</span>
        </div>
        <span className="dm-agent-auth-message">{state.guidance}</span>
      </div>
    );
  }

  const canAct = Boolean(objectId && rowName) && !disabled && state.canRun;

  function patchValue(fieldId, raw) {
    setValues((current) => ({ ...current, [fieldId]: raw }));
  }

  async function runFastLane() {
    if (!canAct || running) return;
    const built = buildBrowserRunInputsEnvelope({ templateId, values });
    if (!built.envelope) {
      setErrors([...built.validation.errors, ...built.validation.missing.map((id) => `"${id}" is required`)]);
      return;
    }
    setErrors([]);
    setRunning(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId, name: rowName, runInputs: built.envelope })
      });
      const payload = await res.json();
      const responseText = JSON.stringify(payload.response ?? payload, null, 2);
      const status = String(payload.status || "").toLowerCase() === "connected" ? "connected" : "failed";
      onPatchDraft?.({
        status,
        lastTested: payload.response?.ranAt || new Date().toISOString(),
        lastRunId: payload.runId || "",
        lastSourceId: payload.sourceId || "",
        lastResponse: responseText
      });
      setMessage(payload.ok
        ? `Run recorded · ${payload.runId || ""}`
        : (payload.response?.error || payload.error || "Run failed — open run output."));
    } catch (err) {
      setMessage(err?.message || "Sandbox run failed");
    } finally {
      setRunning(false);
    }
  }

  const line = proofLine(state);
  const authStatus = String(draft?.agentAuthStatus || "").trim();

  return (
    <div className="dm-record-testbar" data-panel="sandbox-browser-agent" data-browser-agent-status={state.status}>
      <div className="dm-agent-auth-summary">
        <Globe size={15} aria-hidden />
        <div>
          <strong>Browser / local agent</strong>
          <span>
            {state.runLocality} · {state.adapter}
            {state.agentHost ? ` · ${state.agentHost}` : ""}
            {authStatus ? ` · auth ${authStatus}` : ""}
          </span>
        </div>
        <span className={`dm-db-status ${statusKind(state.status)}`} data-browser-agent-pill>
          <span />
          {STATUS_LABEL[state.status] || state.status}
        </span>
      </div>

      {state.status === "blocked" ? (
        <span className="dm-agent-auth-message is-warning">{state.guidance}</span>
      ) : (
        <>
          <label className="dm-orchestration-config__field" htmlFor="dm-browser-template">
            <span>Workflow template</span>
            <select
              id="dm-browser-template"
              value={templateId}
              onChange={(e) => { setTemplateId(e.target.value); setErrors([]); }}
              disabled={running}
            >
              {SANDBOX_BROWSER_RUN_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            {template?.description ? <small className="dm-run-setup__help">{template.description}</small> : null}
          </label>

          <div className="dm-run-setup__fields" data-browser-agent-fields>
            {fields.map((field) => (
              <BrowserRunField
                key={field.id}
                field={field}
                value={values[field.id] ?? template?.defaults?.[field.id] ?? (field.type === "boolean" ? false : "")}
                onChange={(raw) => patchValue(field.id, raw)}
                disabled={running}
              />
            ))}
          </div>

          {errors.length > 0 && (
            <span className="dm-agent-auth-message is-warning" data-browser-agent-errors>
              {errors.join(" · ")}
            </span>
          )}

          <div className="dm-agent-auth-actions">
            <button
              type="button"
              className="dm-btn-primary-sm"
              disabled={!canAct || running}
              onClick={runFastLane}
              title={state.canRun ? "Run through the existing sandbox-run path" : state.guidance}
            >
              <Play size={13} aria-hidden />
              {running ? "Running…" : "Run sandbox"}
            </button>
            {typeof onOpenGraph === "function" && (
              <button type="button" className="dm-btn-ghost" disabled={running} onClick={onOpenGraph}>
                <Workflow size={13} aria-hidden /> Workflow Canvas
              </button>
            )}
            {typeof onOpenTrace === "function" && state.lastRun && (
              <button type="button" className="dm-btn-ghost" disabled={running} onClick={() => onOpenTrace({ runId: state.lastRun.runId })}>
                <FileText size={13} aria-hidden /> Run output
              </button>
            )}
          </div>
        </>
      )}

      {line && <span className="dm-agent-auth-message" data-browser-agent-proof>{line}</span>}
      {!line && message && <span className="dm-agent-auth-message">{message}</span>}
      {line && message && <span className="dm-agent-auth-message is-muted">{message}</span>}
      {!line && !message && state.guidance && state.status !== "blocked" && (
        <span className="dm-agent-auth-message is-muted">{state.guidance}</span>
      )}
    </div>
  );
}

function BrowserRunField({ field, value, onChange, disabled }) {
  const inputId = `dm-browser-input-${field.id}`;
  if (field.type === "boolean" || field.type === "checkbox") {
    return (
      <label className="dm-orchestration-config__field" htmlFor={inputId}>
        <span>{field.label}{field.required ? " *" : ""}</span>
        <span className="dm-run-setup__checkbox">
          <input
            id={inputId}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span>{field.helpText || "Enable"}</span>
        </span>
      </label>
    );
  }
  if (field.type === "select" && Array.isArray(field.options)) {
    return (
      <label className="dm-orchestration-config__field" htmlFor={inputId}>
        <span>{field.label}{field.required ? " *" : ""}</span>
        <select id={inputId} value={String(value || "")} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        {field.helpText ? <small className="dm-run-setup__help">{field.helpText}</small> : null}
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="dm-orchestration-config__field" htmlFor={inputId}>
        <span>{field.label}{field.required ? " *" : ""}</span>
        <textarea id={inputId} rows={3} value={String(value || "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
        {field.helpText ? <small className="dm-run-setup__help">{field.helpText}</small> : null}
      </label>
    );
  }
  return (
    <label className="dm-orchestration-config__field" htmlFor={inputId}>
      <span>{field.label}{field.required ? " *" : ""}</span>
      <input
        id={inputId}
        type={field.type === "url" ? "url" : "text"}
        value={String(value || "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.type === "url" ? "https://" : ""}
        disabled={disabled}
      />
      {field.helpText ? <small className="dm-run-setup__help">{field.helpText}</small> : null}
    </label>
  );
}

export { SEND_MODES };
