"use client";

import { useEffect, useState } from "react";
import { FIELD_TYPE_REGISTRY, TYPE_GROUPS } from "@/lib/field-type-registry";
import { RefFieldPicker } from "@/app/components/data-model/RefFieldPicker";
import { SelectOptionsBuilder } from "@/app/components/data-model/SelectOptionsBuilder";

function generateFieldId() {
  return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function AddFieldModal({ open, objectId, availableObjects, objectFields, objectSections, onSave, onCancel }) {
  const [selectedType, setSelectedType] = useState(null);
  const [label, setLabel] = useState("");
  const [options, setOptions] = useState([]);
  const [refConfig, setRefConfig] = useState(null);
  const [lookupDraft, setLookupDraft] = useState({ throughFieldId: "", targetFieldId: "" });
  const [rollupDraft, setRollupDraft] = useState({ throughFieldId: "", aggregation: "count" });
  const [isRequired, setIsRequired] = useState(false);
  const [sectionId, setSectionId] = useState("default");

  useEffect(() => {
    if (!open) return;
    setSelectedType(null);
    setLabel("");
    setOptions([]);
    setRefConfig(null);
    setLookupDraft({ throughFieldId: "", targetFieldId: "" });
    setRollupDraft({ throughFieldId: "", aggregation: "count" });
    setIsRequired(false);
    setSectionId(objectSections[0]?.id || "default");
  }, [open, objectSections]);

  if (!open) return null;

  function submit() {
    if (!selectedType || !label.trim()) return;
    const id = generateFieldId();
    const base = {
      id,
      type: selectedType,
      label: label.trim(),
      isVisible: true,
      isRequired,
      sectionId,
      defaultValue: null
    };
    if (selectedType === "select" || selectedType === "multiSelect") {
      const cleaned = options.filter((o) => o.label.trim());
      if (!cleaned.length) return;
      base.options = cleaned;
      base.defaultValue = selectedType === "multiSelect" ? [] : null;
    }
    if (selectedType === "ref" || selectedType === "multiRef") {
      if (!refConfig) return;
      base.refConfig = refConfig;
      base.defaultValue = selectedType === "multiRef" ? [] : null;
    }
    if (selectedType === "lookup") {
      if (!lookupDraft.throughFieldId || !lookupDraft.targetFieldId) return;
      base.lookupConfig = {
        throughFieldId: lookupDraft.throughFieldId,
        targetFieldId: lookupDraft.targetFieldId
      };
    }
    if (selectedType === "rollup") {
      if (!rollupDraft.throughFieldId) return;
      base.rollupConfig = {
        throughFieldId: rollupDraft.throughFieldId,
        aggregation: rollupDraft.aggregation || "count"
      };
    }
    onSave(base);
  }

  const sections = objectSections.length ? objectSections : [{ id: "default", label: "Fields" }];

  return (
    <div className="dm-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="dm-modal" role="dialog" aria-label="Add field" onClick={(e) => e.stopPropagation()}>
        <header className="dm-modal-head">
          <h2>Add field</h2>
          <button type="button" className="dm-btn-ghost" onClick={onCancel}>
            Close
          </button>
        </header>
        <div className="dm-modal-body">
          {!selectedType ? (
            <div className="dm-field-type-grid">
              {TYPE_GROUPS.map((group) => (
                <div key={group.group} className="dm-type-group">
                  <h4>{group.group}</h4>
                  <div className="dm-type-cards">
                    {group.types.map((type) => {
                      const meta = FIELD_TYPE_REGISTRY[type];
                      return (
                        <button key={type} type="button" className="dm-type-card" onClick={() => setSelectedType(type)}>
                          <span className="dm-type-icon">{meta.icon}</span>
                          <span className="dm-type-label">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dm-field-config-panel">
              <button type="button" className="dm-btn-ghost" onClick={() => setSelectedType(null)}>
                ← Type
              </button>
              <label className="dm-field-label-v2">
                <span>Field name</span>
                <input className="dm-input-v2" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
              </label>
              {selectedType === "select" || selectedType === "multiSelect" ? (
                <SelectOptionsBuilder options={options} onChange={setOptions} />
              ) : null}
              {selectedType === "ref" || selectedType === "multiRef" ? (
                <RefFieldPicker
                  currentRefConfig={refConfig}
                  availableObjects={availableObjects}
                  excludeObjectId={objectId}
                  onSelect={setRefConfig}
                />
              ) : null}
              {selectedType === "lookup" ? (
                <div className="dm-picker-hint">
                  <label className="dm-field-label-v2">
                    <span>Through ref field</span>
                    <select
                      className="dm-input-v2"
                      value={lookupDraft.throughFieldId}
                      onChange={(e) => setLookupDraft((d) => ({ ...d, throughFieldId: e.target.value }))}
                    >
                      <option value="">—</option>
                      {(objectFields || []).filter((f) => f.type === "ref" || f.type === "multiRef").map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dm-field-label-v2">
                    <span>Target field id (on related object)</span>
                    <input
                      className="dm-input-v2"
                      value={lookupDraft.targetFieldId}
                      onChange={(e) => setLookupDraft((d) => ({ ...d, targetFieldId: e.target.value }))}
                    />
                  </label>
                </div>
              ) : null}
              {selectedType === "rollup" ? (
                <div className="dm-picker-hint">
                  <label className="dm-field-label-v2">
                    <span>Through ref field</span>
                    <select
                      className="dm-input-v2"
                      value={rollupDraft.throughFieldId}
                      onChange={(e) => setRollupDraft((d) => ({ ...d, throughFieldId: e.target.value }))}
                    >
                      <option value="">—</option>
                      {(objectFields || []).filter((f) => f.type === "ref" || f.type === "multiRef").map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dm-field-label-v2">
                    <span>Aggregation</span>
                    <select
                      className="dm-input-v2"
                      value={rollupDraft.aggregation}
                      onChange={(e) => setRollupDraft((d) => ({ ...d, aggregation: e.target.value }))}
                    >
                      {["count", "sum", "min", "max", "avg"].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <label className="dm-check-row">
                <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
                <span>Required</span>
              </label>
              <label className="dm-field-label-v2">
                <span>Section</span>
                <select className="dm-input-v2" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dm-modal-actions">
                <button type="button" className="dm-btn-primary" disabled={!label.trim()} onClick={submit}>
                  Save field
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
