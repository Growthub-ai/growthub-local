"use client";

import { useState } from "react";

const DISPLAYABLE_TYPES = new Set(["text", "email", "longText", "phone", "url", "name"]);

export function RefFieldPicker({ currentRefConfig, availableObjects, excludeObjectId, onSelect, onCancel }) {
  const [step, setStep] = useState("pick-object");
  const [selectedObject, setSelectedObject] = useState(null);
  const [displayFieldId, setDisplayFieldId] = useState(currentRefConfig?.displayField || null);

  const objects = (availableObjects || []).filter((o) => o.id !== excludeObjectId);

  return (
    <div className="dm-ref-field-picker">
      {step === "pick-object" && (
        <div className="dm-picker-step">
          <p className="dm-picker-hint">Select the object this field points to</p>
          <div className="dm-picker-grid">
            {objects.map((obj) => (
              <button
                key={obj.id}
                type="button"
                className={`dm-picker-card${selectedObject?.id === obj.id ? " active" : ""}`}
                onClick={() => {
                  setSelectedObject(obj);
                  setStep("pick-display-field");
                }}
              >
                <strong>{obj.label}</strong>
                <span className="dm-picker-meta">{(obj.fields || obj.columns || []).length} fields</span>
              </button>
            ))}
          </div>
          {onCancel ? (
            <button type="button" className="dm-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      )}

      {step === "pick-display-field" && selectedObject && (
        <div className="dm-picker-step">
          <p className="dm-picker-hint">Which field should display as the record label?</p>
          <div className="dm-picker-grid">
            {(selectedObject.fields || [])
              .filter((f) => DISPLAYABLE_TYPES.has(f.type))
              .map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`dm-picker-card${displayFieldId === f.id ? " active" : ""}`}
                  onClick={() => {
                    setDisplayFieldId(f.id);
                    setStep("pick-cardinality");
                  }}
                >
                  {f.label}
                </button>
              ))}
          </div>
          <button type="button" className="dm-btn-ghost" onClick={() => setStep("pick-object")}>
            Back
          </button>
        </div>
      )}

      {step === "pick-cardinality" && selectedObject && displayFieldId && (
        <div className="dm-picker-step">
          <p className="dm-picker-hint">Relationship type</p>
          {[
            { value: "many-to-one", label: "Many to One", hint: "Each record points to one target" },
            { value: "one-to-many", label: "One to Many", hint: "Each record has many targets" },
            { value: "many-to-many", label: "Many to Many", hint: "Link many records both ways" },
            { value: "one-to-one", label: "One to One", hint: "Single link each side" }
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="dm-picker-row"
              onClick={() =>
                onSelect({
                  targetObjectType: selectedObject.objectType || "custom",
                  targetObjectId: selectedObject.id,
                  displayField: displayFieldId,
                  cardinality: opt.value
                })
              }
            >
              <strong>{opt.label}</strong>
              <span className="dm-picker-meta">{opt.hint}</span>
            </button>
          ))}
          <button type="button" className="dm-btn-ghost" onClick={() => setStep("pick-display-field")}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
