"use client";

import { useMemo, useState } from "react";
import { Play, X } from "lucide-react";
import { RUN_INPUTS_KIND } from "@/lib/orchestration-run-inputs";

/**
 * RunSetupPanel — sidecar surface for collecting manual run inputs before a
 * workflow execution. Mounted by WorkflowSurface only when the active
 * orchestration graph declares a `human-input` / form node with required
 * fields. For workflows with no manual inputs, this panel never renders.
 *
 * Invariants:
 *   - UI-only validation. The server validates again before persisting.
 *   - No secret values are accepted. Fields typed `secretRef` collect only
 *     the ref slug. Secret-looking keys (api_key, token, password, etc.)
 *     are coerced to secretRef on the server.
 *   - The panel reuses .dm-workflow-panel-head, .dm-orchestration-config*,
 *     .dm-btn-outline, .dm-workflow-chip-btn. No new design system.
 */
export function RunSetupPanel({ schema, running, onSubmit, onCancel }) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const [values, setValues] = useState(() => seedValues(fields));
  const [touched, setTouched] = useState({});

  const missing = useMemo(
    () => fields.filter((f) => f.required && !hasValue(values[f.id], f)).map((f) => f.id),
    [fields, values]
  );

  function patch(fieldId, raw) {
    setValues((current) => ({ ...current, [fieldId]: raw }));
  }

  function markTouched(fieldId) {
    setTouched((current) => ({ ...current, [fieldId]: true }));
  }

  function submit() {
    if (missing.length > 0) {
      const next = {};
      for (const id of missing) next[id] = true;
      setTouched((current) => ({ ...current, ...next }));
      return;
    }
    const envelope = {
      kind: RUN_INPUTS_KIND,
      source: "manual",
      values: Object.fromEntries(
        fields
          .map((field) => [field.id, normalizeForSubmission(field, values[field.id])])
          .filter(([, value]) => value !== undefined)
      ),
      files: []
    };
    onSubmit?.(envelope);
  }

  if (!schema?.requiresInput || fields.length === 0) {
    return (
      <div className="dm-run-setup">
        <p className="dm-run-setup__hint">This workflow has no manual inputs configured.</p>
        <div className="dm-run-setup__actions">
          <button type="button" className="dm-btn-outline" onClick={onCancel}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dm-run-setup">
      {schema.instructions ? (
        <p className="dm-run-setup__instructions">{schema.instructions}</p>
      ) : null}

      <div className="dm-run-setup__fields">
        {fields.map((field) => (
          <RunSetupField
            key={field.id}
            field={field}
            value={values[field.id]}
            touched={Boolean(touched[field.id])}
            onChange={(raw) => patch(field.id, raw)}
            onBlur={() => markTouched(field.id)}
          />
        ))}
      </div>

      <div className="dm-run-setup__notice">
        Inputs are validated server-side before the run. Secret-typed fields collect a ref slug only — never a raw value.
      </div>

      <div className="dm-run-setup__actions">
        <button type="button" className="dm-btn-outline" onClick={onCancel} disabled={running}>
          <X size={13} aria-hidden="true" /> Cancel
        </button>
        <button
          type="button"
          className="dm-workflow-chip-btn"
          onClick={submit}
          disabled={running || missing.length > 0}
          title={missing.length > 0 ? `Fill required fields: ${missing.join(", ")}` : "Run workflow with these inputs"}
        >
          <Play size={13} aria-hidden="true" /> {running ? "Running" : "Run workflow"}
        </button>
      </div>
    </div>
  );
}

function RunSetupField({ field, value, touched, onChange, onBlur }) {
  const showError = touched && field.required && !hasValue(value, field);
  const inputId = `dm-run-setup-${field.id}`;
  const help = field.helpText || (field.type === "secretRef" ? "Reference slug only — server resolves the secret." : "");

  return (
    <label className="dm-orchestration-config__field" htmlFor={inputId}>
      <span>
        {field.label}
        {field.required ? <em aria-hidden="true" className="dm-run-setup__required"> *</em> : null}
      </span>
      {renderInput(field, value, onChange, onBlur, inputId)}
      {help ? <small className="dm-run-setup__help">{help}</small> : null}
      {showError ? <small className="dm-run-setup__error">Required.</small> : null}
    </label>
  );
}

function renderInput(field, value, onChange, onBlur, inputId) {
  const safeValue = value == null ? "" : value;
  switch (field.type) {
    case "textarea":
    case "json":
      return (
        <textarea
          id={inputId}
          rows={field.type === "json" ? 6 : 4}
          value={typeof safeValue === "string" ? safeValue : JSON.stringify(safeValue, null, 2)}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={field.type === "json" ? "{ }" : ""}
        />
      );
    case "boolean":
    case "checkbox":
      return (
        <span className="dm-run-setup__checkbox">
          <input
            id={inputId}
            type="checkbox"
            checked={Boolean(safeValue)}
            onChange={(e) => onChange(e.target.checked)}
            onBlur={onBlur}
          />
          <span>{field.helpText || "Enable"}</span>
        </span>
      );
    case "number":
    case "integer":
      return (
        <input
          id={inputId}
          type="number"
          value={safeValue === "" ? "" : safeValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    case "email":
      return (
        <input
          id={inputId}
          type="email"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="name@example.com"
        />
      );
    case "url":
      return (
        <input
          id={inputId}
          type="url"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="https://"
        />
      );
    case "secretRef":
      return (
        <input
          id={inputId}
          type="text"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="ENV_REF_SLUG"
          autoComplete="off"
        />
      );
    default:
      return (
        <input
          id={inputId}
          type="text"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
  }
}

function seedValues(fields) {
  const out = {};
  for (const field of fields) {
    if (field.type === "boolean" || field.type === "checkbox") out[field.id] = false;
    else out[field.id] = "";
  }
  return out;
}

function hasValue(value, field) {
  if (field?.type === "boolean" || field?.type === "checkbox") return value === true;
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return Boolean(value);
}

function normalizeForSubmission(field, value) {
  if (field.type === "boolean" || field.type === "checkbox") return Boolean(value);
  if (field.type === "secretRef") {
    const text = typeof value === "string" ? value.trim() : "";
    return text ? { secretRef: text } : undefined;
  }
  if (field.type === "number" || field.type === "integer") {
    if (value === "" || value == null) return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }
  if (field.type === "json") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return value;
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : undefined;
  }
  return value;
}
