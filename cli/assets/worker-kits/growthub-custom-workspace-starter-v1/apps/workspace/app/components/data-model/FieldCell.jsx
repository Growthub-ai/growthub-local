"use client";

import { useMemo, useState } from "react";
import { RefChip, StatusChip, TagChip } from "./dm-chips.jsx";
import { RefValuePicker } from "./RefValuePicker.jsx";

function buildObjectMap(allObjects) {
  const map = new Map();
  (allObjects || []).forEach((object) => {
    if (object?.id) map.set(object.id, object);
  });
  return map;
}

function resolveRefLabel(refConfig, rowId, objectMap) {
  if (!refConfig?.targetObjectId || !rowId) return rowId;
  const targetObj = objectMap.get(refConfig.targetObjectId);
  if (!targetObj) return rowId;
  const targetRow = (targetObj.rows || []).find((r) => r.id === rowId);
  const displayField = (targetObj.fields || []).find((f) => f.id === refConfig.displayField);
  const v = targetRow?.data?.[displayField?.id ?? ""];
  return v !== undefined && v !== null && v !== "" ? String(v) : rowId;
}

function resolveLookupDisplay(field, rowData, fieldsOnObject, objectMap) {
  const through = fieldsOnObject.find((f) => f.id === field.lookupConfig?.throughFieldId);
  if (!through?.refConfig) return "—";
  const refVal = rowData[through.id];
  if (refVal === undefined || refVal === null || refVal === "") return "—";
  const targetObj = objectMap.get(through.refConfig.targetObjectId);
  if (!targetObj) return "—";
  const targetRow = (targetObj.rows || []).find((r) => r.id === refVal);
  const tf = (targetObj.fields || []).find((f) => f.id === field.lookupConfig.targetFieldId);
  const raw = targetRow?.data?.[tf?.id ?? ""];
  return raw === undefined || raw === null ? "—" : String(raw);
}

function resolveRollupDisplay(field, rowData, fieldsOnObject, objectMap) {
  const through = fieldsOnObject.find((f) => f.id === field.rollupConfig?.throughFieldId);
  if (!through?.refConfig) return "—";
  const raw = rowData[through.id];
  if (through.type === "multiRef" && Array.isArray(raw)) {
    return field.rollupConfig?.aggregation === "count" ? String(raw.length) : String(raw.length);
  }
  if (through.type === "ref" && raw) {
    return field.rollupConfig?.aggregation === "count" ? "1" : "—";
  }
  return "0";
}

export function FieldCell({ field, rowData, hostObject, allObjects, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const objectMap = useMemo(() => buildObjectMap(allObjects), [allObjects]);
  const fieldsOnObject = hostObject?.fields || [];
  const cellValue = rowData?.[field.id];

  if (field.type === "formula") {
    return (
      <div className="dm-field-cell read-only">
        <span className="dm-field-cell-label">{field.label}</span>
        <span className="dm-field-cell-value muted">Formula (read-only)</span>
      </div>
    );
  }

  if (field.type === "lookup") {
    const text = resolveLookupDisplay(field, rowData || {}, fieldsOnObject, objectMap);
    return (
      <div className="dm-field-cell read-only">
        <span className="dm-field-cell-label">{field.label}</span>
        <span className="dm-field-cell-value">{text}</span>
      </div>
    );
  }

  if (field.type === "rollup") {
    const text = resolveRollupDisplay(field, rowData || {}, fieldsOnObject, objectMap);
    return (
      <div className="dm-field-cell read-only">
        <span className="dm-field-cell-label">{field.label}</span>
        <span className="dm-field-cell-value">{text}</span>
      </div>
    );
  }

  const targetObj = field.refConfig ? objectMap.get(field.refConfig.targetObjectId) : null;

  function renderValue() {
    switch (field.type) {
      case "select": {
        const opt = field.options?.find((o) => o.id === cellValue);
        return opt ? <StatusChip color={opt.color} label={opt.label} /> : <span className="dm-cell-empty">—</span>;
      }
      case "multiSelect": {
        const ids = Array.isArray(cellValue) ? cellValue : [];
        const opts = ids.map((id) => field.options?.find((o) => o.id === id)).filter(Boolean);
        return (
          <div className="dm-tag-row">
            {opts.map((o) => <TagChip key={o.id} color={o.color} label={o.label} />)}
          </div>
        );
      }
      case "ref":
        return cellValue ? (
          <RefChip
            label={resolveRefLabel(field.refConfig, cellValue, objectMap)}
            objectType={field.refConfig?.targetObjectType}
          />
        ) : <span className="dm-cell-empty">—</span>;
      case "multiRef": {
        const ids = Array.isArray(cellValue) ? cellValue : [];
        return (
          <div className="dm-tag-row">
            {ids.map((id) => (
              <RefChip
                key={id}
                label={resolveRefLabel(field.refConfig, id, objectMap)}
                objectType={field.refConfig?.targetObjectType}
              />
            ))}
          </div>
        );
      }
      case "boolean":
        return (
          <input
            type="checkbox"
            checked={Boolean(cellValue)}
            onChange={(e) => onUpdate(field.id, e.target.checked)}
          />
        );
      case "rating": {
        const n = Number(cellValue) || 0;
        return (
          <div className="dm-rating-row">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`dm-rating-star${star <= n ? " on" : ""}`}
                onClick={() => onUpdate(field.id, star)}
                aria-label={`Rate ${star}`}
              >
                ★
              </button>
            ))}
          </div>
        );
      }
      default:
        return isEditing ? (
          <input
            className="dm-field-inline-input"
            type="text"
            value={cellValue ?? ""}
            onChange={(e) => onUpdate(field.id, e.target.value)}
            onBlur={() => setIsEditing(false)}
            autoFocus
          />
        ) : (
          <span
            className="dm-field-inline-display"
            onClick={() => setIsEditing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setIsEditing(true)}
          >
            {cellValue === null || cellValue === undefined || cellValue === "" ? (
              <span className="dm-cell-empty">—</span>
            ) : (
              String(cellValue)
            )}
          </span>
        );
    }
  }

  if ((field.type === "ref" || field.type === "multiRef") && refOpen && targetObj) {
    return (
      <div className="dm-field-cell">
        <span className="dm-field-cell-label">{field.label}</span>
        <div className="dm-field-cell-value">
          <RefValuePicker
            refConfig={field.refConfig}
            targetObject={targetObj}
            currentValue={cellValue}
            onChange={(next) => {
              onUpdate(field.id, next);
              if (field.type === "ref") setRefOpen(false);
            }}
          />
          <button type="button" className="dm-btn-ghost" onClick={() => setRefOpen(false)}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dm-field-cell" data-field-type={field.type}>
      <span className="dm-field-cell-label">{field.label}</span>
      <div
        className="dm-field-cell-value"
        onClick={() => {
          if (field.type === "ref" || field.type === "multiRef") setRefOpen(true);
        }}
        role={field.type === "ref" || field.type === "multiRef" ? "button" : undefined}
        onKeyDown={(e) => {
          if ((field.type === "ref" || field.type === "multiRef") && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setRefOpen(true);
          }
        }}
        tabIndex={field.type === "ref" || field.type === "multiRef" ? 0 : undefined}
      >
        {renderValue()}
      </div>
    </div>
  );
}
