"use client";

import { useMemo, useState } from "react";
import { StatusChip } from "@/app/components/data-model/StatusChip";

export function RefValuePicker({ refConfig, targetObject, currentValue, onChange, onClose }) {
  const [search, setSearch] = useState("");
  const displayField = targetObject?.fields?.find((f) => f.id === refConfig?.displayField);
  const rows = Array.isArray(targetObject?.rows) ? targetObject.rows : [];

  const isMulti = refConfig?.cardinality === "many-to-many" || refConfig?.cardinality === "one-to-many";
  const selected = useMemo(() => {
    if (isMulti) return Array.isArray(currentValue) ? currentValue : [];
    return currentValue ? [currentValue] : [];
  }, [currentValue, isMulti]);

  const statusField = useMemo(
    () => (targetObject?.fields || []).find((f) => f.type === "select"),
    [targetObject]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const label = resolveRowLabel(row, displayField?.id);
      return !q || String(label).toLowerCase().includes(q);
    });
  }, [rows, search, displayField]);

  return (
    <div className="dm-ref-value-picker" role="dialog" aria-label="Pick reference">
      <div className="dm-ref-value-picker-head">
        <input
          type="search"
          className="dm-input-v2"
          placeholder={`Search ${targetObject?.label || "records"}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {onClose ? (
          <button type="button" className="dm-btn-ghost" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <div className="dm-ref-option-list">
        {filtered.map((row) => {
          const rowId = typeof row.id === "string" && row.id ? row.id : "";
          const label = resolveRowLabel(row, displayField?.id) || rowId;
          const isSelected = selected.includes(rowId);
          let statusOpt = null;
          if (statusField) {
            const raw = row.data?.[statusField.id] ?? row[statusField.id];
            statusOpt = statusField.options?.find((o) => o.id === raw);
          }
          return (
            <button
              key={rowId || label}
              type="button"
              className={`dm-ref-option${isSelected ? " selected" : ""}`}
              onClick={() => {
                if (!rowId) return;
                if (isMulti) {
                  onChange(isSelected ? selected.filter((id) => id !== rowId) : [...selected, rowId]);
                } else {
                  onChange(isSelected ? null : rowId);
                }
              }}
            >
              {isSelected ? <span className="dm-ref-check">✓</span> : null}
              <span className="dm-ref-label">{label}</span>
              {statusOpt ? <StatusChip color={statusOpt.color} label={statusOpt.label} size="sm" /> : null}
            </button>
          );
        })}
        {filtered.length === 0 ? <p className="dm-cell-empty">No records match.</p> : null}
      </div>
    </div>
  );
}

function resolveRowLabel(row, displayFieldId) {
  if (!row || typeof row !== "object") return "";
  if (row.data && typeof row.data === "object" && displayFieldId) {
    return row.data[displayFieldId] ?? "";
  }
  if (displayFieldId && row[displayFieldId] !== undefined) return row[displayFieldId];
  return row.Name || row.label || row.Name || "";
}
