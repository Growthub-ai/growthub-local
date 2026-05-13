"use client";

import { useMemo, useState } from "react";
import { FIELD_TYPE_REGISTRY } from "@/lib/field-type-registry";
import { RefFieldPicker } from "./RefFieldPicker.jsx";
import { SelectOptionsBuilder } from "./SelectOptionsBuilder.jsx";

const TYPE_GROUPS = [
  { group: "Text", types: ["text", "longText", "email", "phone", "url"] },
  { group: "Number", types: ["number", "currency", "rating"] },
  { group: "Date", types: ["date", "dateTime"] },
  { group: "Choice", types: ["boolean", "select", "multiSelect"] },
  { group: "Reference", types: ["ref", "multiRef", "lookup", "rollup"] },
  { group: "Composite", types: ["name", "address", "links"] },
  { group: "Computed", types: ["formula"] }
];

function generateFieldId() {
  return `fld_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function LookupConfigPicker({ objectFields, availableObjects, value, onChange }) {
  const refFields = objectFields.filter((f) => f.type === "ref" || f.type === "multiRef");
  const through = refFields.find((f) => f.id === value.throughFieldId);
  const targetObj = through?.refConfig?.targetObjectId
    ? availableObjects.find((o) => o.id === through.refConfig.targetObjectId)
    : null;
  const targetFields = (targetObj?.fields || []).filter((f) => !["lookup", "rollup", "formula"].includes(f.type));

  return (
    <div className="dm-lookup-config">
      <label className="dm-field-label-v2">
        <span>Through relation</span>
        <select
          value={value.throughFieldId || ""}
          onChange={(e) => onChange({ ...value, throughFieldId: e.target.value, targetFieldId: "" })}
        >
          <option value="">Select…</option>
          {refFields.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>
      {targetObj && (
        <label className="dm-field-label-v2">
          <span>Target field</span>
          <select
            value={value.targetFieldId || ""}
            onChange={(e) => onChange({ ...value, targetFieldId: e.target.value })}
          >
            <option value="">Select…</option>
            {targetFields.map((f) => (
              <option key={f.id} value={f.id}>{f.label} ({f.type})</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function RollupConfigPicker({ objectFields, value, onChange }) {
  const refFields = objectFields.filter((f) => f.type === "ref" || f.type === "multiRef");
  return (
    <div className="dm-lookup-config">
      <label className="dm-field-label-v2">
        <span>Through relation</span>
        <select
          value={value.throughFieldId || ""}
          onChange={(e) => onChange({ ...value, throughFieldId: e.target.value })}
        >
          <option value="">Select…</option>
          {refFields.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>
      <label className="dm-field-label-v2">
        <span>Aggregation</span>
        <select
          value={value.aggregation || "count"}
          onChange={(e) => onChange({ ...value, aggregation: e.target.value })}
        >
          {["count", "sum", "min", "max"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
    </div>
  );
}

export function AddFieldModal({
  open,
  objectFields,
  objectSections,
  availableObjects,
  excludeObjectId,
  onSave,
  onCancel
}) {
  const [selectedType, setSelectedType] = useState(null);
  const [fieldConfig, setFieldConfig] = useState({
    label: "",
    isRequired: false,
    sectionId: objectSections[0]?.id || "sec_main",
    options: [],
    refConfig: null,
    lookupConfig: { throughFieldId: "", targetFieldId: "" },
    rollupConfig: { throughFieldId: "", aggregation: "count" }
  });

  const objectsForRef = useMemo(
    () => (availableObjects || []).filter((o) => o.id !== excludeObjectId),
    [availableObjects, excludeObjectId]
  );

  if (!open) return null;

  function handleSave() {
    const id = generateFieldId();
    const base = {
      id,
      type: selectedType,
      label: fieldConfig.label?.trim() || "Untitled field",
      isVisible: true,
      isRequired: Boolean(fieldConfig.isRequired),
      sectionId: fieldConfig.sectionId || objectSections[0]?.id || "sec_main",
      defaultValue: null
    };
    if (selectedType === "select" || selectedType === "multiSelect") {
      base.options = fieldConfig.options?.length ? fieldConfig.options : [{ id: "opt_1", label: "Option 1", color: "#94a3b8" }];
      base.defaultValue = selectedType === "multiSelect" ? [] : base.options[0]?.id || null;
    }
    if (selectedType === "ref" || selectedType === "multiRef") {
      base.refConfig = fieldConfig.refConfig;
    }
    if (selectedType === "lookup") {
      base.lookupConfig = fieldConfig.lookupConfig;
    }
    if (selectedType === "rollup") {
      base.rollupConfig = fieldConfig.rollupConfig;
    }
    onSave(base);
    setSelectedType(null);
    setFieldConfig({
      label: "",
      isRequired: false,
      sectionId: objectSections[0]?.id || "sec_main",
      options: [],
      refConfig: null,
      lookupConfig: { throughFieldId: "", targetFieldId: "" },
      rollupConfig: { throughFieldId: "", aggregation: "count" }
    });
  }

  const canSave =
    selectedType &&
    fieldConfig.label?.trim() &&
    (selectedType !== "select" && selectedType !== "multiSelect" || (fieldConfig.options || []).length) &&
    (selectedType !== "ref" && selectedType !== "multiRef" || fieldConfig.refConfig?.targetObjectId) &&
    (selectedType !== "lookup" || (fieldConfig.lookupConfig?.throughFieldId && fieldConfig.lookupConfig?.targetFieldId)) &&
    (selectedType !== "rollup" || fieldConfig.rollupConfig?.throughFieldId);

  return (
    <div className="dm-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="dm-modal" role="dialog" aria-modal="true" aria-label="Add field" onClick={(e) => e.stopPropagation()}>
        <header className="dm-modal-head">
          <h2>Add field</h2>
          <button type="button" className="dm-btn-ghost" onClick={onCancel}>Close</button>
        </header>
        {!selectedType && (
          <div className="dm-field-type-grid">
            {TYPE_GROUPS.map((group) => (
              <div key={group.group} className="dm-type-group">
                <h4>{group.group}</h4>
                <div className="dm-type-cards">
                  {group.types.map((type) => {
                    const meta = FIELD_TYPE_REGISTRY[type];
                    if (!meta) return null;
                    return (
                      <button key={type} type="button" className="dm-type-card" onClick={() => setSelectedType(type)}>
                        <span className="dm-type-icon" aria-hidden>{meta.icon}</span>
                        <span className="dm-type-label">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {selectedType && (
          <div className="dm-field-config-panel">
            <button type="button" className="dm-btn-ghost" onClick={() => setSelectedType(null)}>← Type</button>
            <label className="dm-field-label-v2">
              <span>Field name</span>
              <input
                className="dm-input-v2"
                value={fieldConfig.label ?? ""}
                onChange={(e) => setFieldConfig((prev) => ({ ...prev, label: e.target.value }))}
              />
            </label>
            {["select", "multiSelect"].includes(selectedType) && (
              <SelectOptionsBuilder
                options={fieldConfig.options || []}
                onChange={(opts) => setFieldConfig((prev) => ({ ...prev, options: opts }))}
              />
            )}
            {["ref", "multiRef"].includes(selectedType) && (
              <RefFieldPicker
                currentRefConfig={fieldConfig.refConfig}
                availableObjects={objectsForRef}
                onSelect={(cfg) => setFieldConfig((prev) => ({ ...prev, refConfig: cfg }))}
              />
            )}
            {selectedType === "lookup" && (
              <LookupConfigPicker
                objectFields={objectFields}
                availableObjects={objectsForRef}
                value={fieldConfig.lookupConfig || { throughFieldId: "", targetFieldId: "" }}
                onChange={(cfg) => setFieldConfig((prev) => ({ ...prev, lookupConfig: cfg }))}
              />
            )}
            {selectedType === "rollup" && (
              <RollupConfigPicker
                objectFields={objectFields}
                value={fieldConfig.rollupConfig || { throughFieldId: "", aggregation: "count" }}
                onChange={(cfg) => setFieldConfig((prev) => ({ ...prev, rollupConfig: cfg }))}
              />
            )}
            <label className="dm-check-row">
              <input
                type="checkbox"
                checked={Boolean(fieldConfig.isRequired)}
                onChange={(e) => setFieldConfig((prev) => ({ ...prev, isRequired: e.target.checked }))}
              />
              <span>Required</span>
            </label>
            <label className="dm-field-label-v2">
              <span>Section</span>
              <select
                value={fieldConfig.sectionId || ""}
                onChange={(e) => setFieldConfig((prev) => ({ ...prev, sectionId: e.target.value }))}
              >
                {objectSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <div className="dm-modal-actions">
              <button type="button" className="dm-btn-outline" onClick={onCancel}>Cancel</button>
              <button type="button" className="dm-btn-primary" disabled={!canSave} onClick={handleSave}>Save field</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
