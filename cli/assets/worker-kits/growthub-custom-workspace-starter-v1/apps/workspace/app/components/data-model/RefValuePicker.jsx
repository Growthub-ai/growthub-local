"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { StatusChip } from "./dm-chips.jsx";

export function RefValuePicker({ refConfig, targetObject, currentValue, onChange }) {
  const [search, setSearch] = useState("");
  const displayField = (targetObject.fields || []).find((f) => f.id === refConfig.displayField);
  const isMulti = refConfig.cardinality === "many-to-many" || refConfig.cardinality === "one-to-many";
  const selected = useMemo(() => {
    if (isMulti) return Array.isArray(currentValue) ? currentValue : [];
    return currentValue ? [currentValue] : [];
  }, [currentValue, isMulti]);

  const rows = (targetObject.rows || []).filter((row) => {
    const label = String(row.data?.[displayField?.id ?? ""] ?? "");
    return label.toLowerCase().includes(search.trim().toLowerCase());
  });

  const statusField = (targetObject.fields || []).find((f) => f.type === "select");

  return (
    <div className="dm-ref-value-picker">
      <label className="dm-ref-search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          placeholder={`Search ${targetObject.label}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="dm-ref-option-list">
        {rows.map((row) => {
          const label = String(row.data?.[displayField?.id ?? ""] ?? row.id);
          const isSelected = selected.includes(row.id);
          const statusValue = statusField ? row.data?.[statusField.id] : null;
          const statusOpt = statusField?.options?.find((o) => o.id === statusValue);
          return (
            <button
              key={row.id}
              type="button"
              className={`dm-ref-option${isSelected ? " selected" : ""}`}
              onClick={() => {
                if (isMulti) {
                  onChange(isSelected ? selected.filter((id) => id !== row.id) : [...selected, row.id]);
                } else {
                  onChange(isSelected ? null : row.id);
                }
              }}
            >
              {isSelected && <span className="dm-ref-check">✓</span>}
              <span className="dm-ref-label">{label}</span>
              {statusOpt && <StatusChip color={statusOpt.color} label={statusOpt.label} size="sm" />}
            </button>
          );
        })}
        {rows.length === 0 && <p className="dm-ref-empty">No records found</p>}
      </div>
    </div>
  );
}
