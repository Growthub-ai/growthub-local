"use client";

import { useMemo, useState } from "react";
import { FIELD_TYPE_REGISTRY } from "@/lib/field-type-registry";
import { RefValuePicker } from "@/app/components/data-model/RefValuePicker";
import { StatusChip, TagChip } from "@/app/components/data-model/StatusChip";

function resolveRefLabel(refConfig, rowId, allObjects) {
  if (!refConfig || !rowId) return "";
  const targetObj = (allObjects || []).find((o) => o.id === refConfig.targetObjectId);
  if (!targetObj) return rowId;
  const rows = Array.isArray(targetObj.rows) ? targetObj.rows : [];
  const targetRow = rows.find((r) => r.id === rowId);
  const rid = typeof targetRow?.id === "string" ? targetRow.id : "";
  const displayField = (targetObj.fields || []).find((f) => f.id === refConfig.displayField);
  const df = displayField?.id;
  if (targetRow?.data && df) return String(targetRow.data[df] ?? rowId);
  if (df && targetRow && targetRow[df] !== undefined) return String(targetRow[df]);
  return rid || rowId;
}

export function FieldCell({ field, record, allObjects, schemaFields, disabled, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const meta = FIELD_TYPE_REGISTRY[field.type] || FIELD_TYPE_REGISTRY.text;
  const value = useMemo(() => {
    if (record?.data && typeof record.data === "object") return record.data[field.id];
    return record?.[field.id];
  }, [record, field.id]);

  const targetObject = useMemo(() => {
    if (!field.refConfig) return null;
    return (allObjects || []).find((o) => o.id === field.refConfig.targetObjectId) || null;
  }, [allObjects, field.refConfig]);

  if (field.type === "lookup" && field.lookupConfig) {
    const throughFieldId = field.lookupConfig.throughFieldId;
    const throughVal = record?.data?.[throughFieldId] ?? record?.[throughFieldId];
    const throughFieldDef = (schemaFields || []).find((f) => f.id === throughFieldId);
    const resolved = throughFieldDef?.refConfig
      ? resolveLookupValue(throughFieldDef.refConfig, throughVal, field.lookupConfig.targetFieldId, allObjects)
      : "";
    return (
      <div className="dm-field-cell" data-field-type={field.type}>
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value muted">{resolved || "—"}</div>
      </div>
    );
  }

  if (field.type === "rollup") {
    return (
      <div className="dm-field-cell" data-field-type={field.type}>
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value muted">Σ rollup</div>
      </div>
    );
  }

  if (field.type === "select") {
    const opt = field.options?.find((o) => o.id === value);
    return (
      <div className="dm-field-cell" data-field-type={field.type}>
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value">
          {opt ? <StatusChip color={opt.color} label={opt.label} /> : <span className="dm-cell-empty">—</span>}
        </div>
      </div>
    );
  }

  if (field.type === "multiSelect") {
    const ids = Array.isArray(value) ? value : [];
    const opts = ids.map((id) => field.options?.find((o) => o.id === id)).filter(Boolean);
    return (
      <div className="dm-field-cell" data-field-type={field.type}>
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value tag-row">
          {opts.length ? opts.map((o) => <TagChip key={o.id} color={o.color} label={o.label} />) : <span className="dm-cell-empty">—</span>}
        </div>
      </div>
    );
  }

  if (field.type === "ref" && field.refConfig) {
    const label = value ? resolveRefLabel(field.refConfig, value, allObjects) : "";
    return (
      <div className="dm-field-cell" data-field-type={field.type}>
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value">
          <button type="button" className="dm-ref-chip-btn" disabled={disabled} onClick={() => setPickerOpen((o) => !o)}>
            {label || "Choose…"}
          </button>
          {pickerOpen && targetObject ? (
            <div className="dm-ref-picker-pop">
              <RefValuePicker
                refConfig={field.refConfig}
                targetObject={targetObject}
                currentValue={value}
                onChange={(next) => {
                  onChange(next);
                  setPickerOpen(false);
                }}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (field.type === "multiRef" && field.refConfig) {
    const ids = Array.isArray(value) ? value : [];
    return (
      <div className="dm-field-cell" data-field-type={field.type}>
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value">
          <div className="dm-ref-chips">
            {ids.map((id) => (
              <span key={id} className="dm-ref-chip">
                {resolveRefLabel(field.refConfig, id, allObjects)}
              </span>
            ))}
          </div>
          <button type="button" className="dm-btn-ghost" disabled={disabled} onClick={() => setPickerOpen((o) => !o)}>
            {pickerOpen ? "Close" : "Edit links"}
          </button>
          {pickerOpen && targetObject ? (
            <div className="dm-ref-picker-pop">
              <RefValuePicker
                refConfig={field.refConfig}
                targetObject={targetObject}
                currentValue={ids}
                onChange={(next) => onChange(next)}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="dm-field-cell" data-field-type={field.type}>
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value">
          <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        </div>
      </div>
    );
  }

  if (meta.readOnly) {
    return (
      <div className="dm-field-cell" data-field-type={field.type}>
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value muted">{String(value ?? "") || "—"}</div>
      </div>
    );
  }

  return (
    <div className="dm-field-cell" data-field-type={field.type}>
      <span className="dm-field-cell-label">{field.label}</span>
      <div className="dm-field-cell-value">
        <input
          type="text"
          className="dm-input-v2"
          disabled={disabled}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function resolveLookupValue(refConfig, throughValue, targetFieldId, allObjects) {
  if (!throughValue || !refConfig || !targetFieldId) return "";
  const targetObj = (allObjects || []).find((o) => o.id === refConfig.targetObjectId);
  if (!targetObj) return "";
  const rows = Array.isArray(targetObj.rows) ? targetObj.rows : [];
  const targetRow = rows.find((r) => r.id === throughValue);
  if (!targetRow) return "";
  if (targetRow.data && targetRow.data[targetFieldId] !== undefined) return String(targetRow.data[targetFieldId]);
  if (targetRow[targetFieldId] !== undefined) return String(targetRow[targetFieldId]);
  return "";
}
