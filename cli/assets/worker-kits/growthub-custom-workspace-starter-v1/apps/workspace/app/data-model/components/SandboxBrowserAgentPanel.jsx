"use client";

/**
 * Browser / local agent fast lane V1 — record sidecar panel.
 *
 * First-party no-code surface for browser-capable local sandbox rows.
 * Eligibility, status, and proof come from the pure deriver
 * (`lib/sandbox-browser-agent-flow.js`); run-input templates come from
 * `lib/sandbox-browser-run-inputs.js`. Execution stays on the EXISTING
 * sandbox-run path — this panel only assembles the
 * `growthub-workflow-run-inputs-v1` envelope and hands it to the drawer's
 * runSandbox, which POSTs /api/workspace/sandbox-run.
 *
 * No raw JSON. No new run route. No browser-auth store. Proof lines are
 * evidence-driven from persisted run records and never overclaim.
 */

import { useMemo, useState } from "react";
import { Globe, Play, Workflow } from "lucide-react";
import {
  buildBrowserRunInputsEnvelope,
  getBrowserRunInputTemplate,
  listBrowserRunInputTemplates,
  buildTemplateDefaults,
  validateBrowserRunInputValues,
  SEND_MODES
} from "@/lib/sandbox-browser-run-inputs";

const STATUS_LABEL = {
  ready: "Ready",
  blocked: "Blocked",
  connected: "Connected",
  failed: "Failed",
  "serverless-incompatible": "Local-only"
};

function statusKind(status) {
  if (status === "connected") return "ok";
  if (status === "ready") return "";
  if (status === "failed") return "bad";
  if (status === "blocked" || status === "serverless-incompatible") return "warn";
  return "";
}

function LaneStatusPill({ status }) {
  return (
    <span className={`dm-db-status ${statusKind(status)}`} data-browser-lane-status={status || "hidden"}>
      <span />
      {STATUS_LABEL[status] || "Hidden"}
    </span>
  );
}

function fieldEditorFor(field, value, onChange, disabled) {
  if (field.id === "sendMode" || field.type === "select") {
    const options = Array.isArray(field.options) && field.options.length ? field.options : SEND_MODES;
    return (
      <select value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }
  if (field.type === "boolean" || field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value === true || value === "true"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  return (
    <input
      type={field.type === "url" ? "url" : "text"}
      value={String(value ?? "")}
      disabled={disabled}
      placeholder={field.helpText || ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SandboxBrowserAgentPanel({ state, disabled, running, onRun, onOpenCanvas }) {
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState({});
  const [preflight, setPreflight] = useState(null);

  const templates = useMemo(() => listBrowserRunInputTemplates(), []);
  const template = getBrowserRunInputTemplate(templateId);
  // Graph schema fields are authoritative; templates only pre-fill them.
  const fields = state?.requiresInput && state.inputFields.length
    ? state.inputFields.map((f) => {
        const templateField = template?.fields?.find((tf) => tf.id === f.id);
        return templateField ? { ...f, ...templateField, required: f.required || templateField.required } : f;
      })
    : (template?.fields || []);

  if (!state || !state.visible) return null;

  const isServerlessNote = state.status === "serverless-incompatible";
  const proof = state.browserProof;
  const lastRun = state.lastRun;

  function applyTemplate(nextId) {
    setTemplateId(nextId);
    setPreflight(null);
    setValues((current) => ({ ...buildTemplateDefaults(nextId), ...current }));
  }

  function setFieldValue(id, value) {
    setValues((current) => ({ ...current, [id]: value }));
    setPreflight(null);
  }

  function handleRun() {
    if (fields.length === 0) {
      onRun?.(null);
      return;
    }
    const check = validateBrowserRunInputValues(
      template || { fields },
      values
    );
    const missingFromSchema = fields
      .filter((f) => f.required && f.type !== "boolean")
      .filter((f) => {
        const raw = values[f.id];
        return raw == null || (typeof raw === "string" && !raw.trim());
      })
      .map((f) => f.id);
    const missing = Array.from(new Set([...check.missing, ...missingFromSchema]));
    if (missing.length > 0 || check.errors.length > 0) {
      setPreflight({ missing, errors: check.errors });
      return;
    }
    setPreflight(null);
    onRun?.(buildBrowserRunInputsEnvelope({ templateId, values, source: "manual" }));
  }

  return (
    <div className="dm-record-testbar" data-panel="sandbox-browser-agent" data-browser-lane-state={state.status}>
      <div className="dm-agent-auth-summary">
        <Globe size={15} aria-hidden />
        <div>
          <strong>Browser / local agent</strong>
          <span>
            {state.runLocality} · {state.adapter}
            {state.agentHost ? ` · ${state.agentHost}` : ""}
          </span>
        </div>
        <LaneStatusPill status={state.status} />
      </div>

      {state.guidance && (
        <span className="dm-agent-auth-message" data-browser-lane-guidance>
          {state.guidance}
        </span>
      )}

      {proof && (
        <span
          className="dm-agent-auth-message"
          data-browser-lane-proof
          data-reached-target={proof.reachedTarget ? "true" : "false"}
        >
          {proof.reachedTarget
            ? `Reached ${proof.platform || "target"}${proof.title ? ` · ${proof.title}` : ""}${state.lastArtifact ? " · artifact generated" : ""} · run ${proof.runId || lastRun?.runId || ""}`
            : `Browser run did not reach target${proof.fallbackUsed ? " (fallback used)" : ""} · run ${proof.runId || lastRun?.runId || ""}`}
        </span>
      )}

      {!isServerlessNote && fields.length > 0 && (
        <div className="dm-record-fields" data-browser-lane-inputs>
          {templates.length > 0 && !state.requiresInput && (
            <label className="dm-field">
              <span>Template</span>
              <select value={templateId} disabled={disabled || running} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Choose a workflow template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
          )}
          {fields.map((field) => (
            <label key={field.id} className="dm-field" data-run-input-field={field.id}>
              <span>
                {field.label || field.id}
                {field.required ? " *" : ""}
              </span>
              {fieldEditorFor(field, values[field.id], (v) => setFieldValue(field.id, v), disabled || running)}
            </label>
          ))}
        </div>
      )}

      {preflight && (
        <span className="dm-agent-auth-message is-warning" data-browser-lane-preflight>
          {[
            preflight.missing.length ? `Missing required: ${preflight.missing.join(", ")}.` : "",
            ...preflight.errors
          ].filter(Boolean).join(" ")}
        </span>
      )}

      <div className="dm-agent-auth-actions">
        {!isServerlessNote && (
          <button
            type="button"
            className="dm-btn-primary-sm"
            disabled={disabled || running || !state.canRun}
            onClick={handleRun}
            title="Run through the existing sandbox-run path"
          >
            <Play size={13} aria-hidden />
            {running ? "Running…" : (state.nextAction?.id === "run-sandbox" ? state.nextAction.label : "Run sandbox")}
          </button>
        )}
        <a className="dm-btn-ghost" href="/workflows" title="Open the Background Tasks / workflow run surface">
          Open Background Tasks
        </a>
        {typeof onOpenCanvas === "function" && (
          <button type="button" className="dm-btn-ghost" onClick={onOpenCanvas} title="Open this row's workflow graph">
            <Workflow size={13} aria-hidden />
            Open Workflow Canvas
          </button>
        )}
      </div>
    </div>
  );
}
