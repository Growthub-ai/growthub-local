"use client";

import { useState } from "react";

export function RefFieldPicker({ currentRefConfig, availableObjects, onSelect, onCancel }) {
  const [step, setStep] = useState("pick-object");
  const [selectedObject, setSelectedObject] = useState(null);
  const [displayFieldId, setDisplayFieldId] = useState(currentRefConfig?.displayField || "");

  const labelFields = (obj) => (obj.fields || []).filter((f) => ["text", "email", "name", "url"].includes(f.type));

  function reset() {
    setStep("pick-object");
    setSelectedObject(null);
    setDisplayFieldId("");
  }

  return (
    <div className="dm-ref-field-picker">
      {step === "pick-object" && (
        <div className="dm-picker-step">
          <p className="dm-picker-hint">Select the object this field points to</p>
          <div className="dm-picker-list">
            {availableObjects.map((obj) => (
              <button
                key={obj.id}
                type="button"
                className={`dm-picker-option${selectedObject?.id === obj.id ? " selected" : ""}`}
                onClick={() => {
                  setSelectedObject(obj);
                  setDisplayFieldId("");
                  setStep("pick-display-field");
                }}
              >
                <span>{obj.label}</span>
                <span className="dm-picker-meta">{obj.fields?.length ?? 0} fields</span>
              </button>
            ))}
          </div>
          {onCancel && (
            <button type="button" className="dm-btn-ghost" onClick={onCancel}>Cancel</button>
          )}
        </div>
      )}
      {step === "pick-display-field" && selectedObject && (
        <div className="dm-picker-step">
          <p className="dm-picker-hint">Which field should display as the record label?</p>
          <div className="dm-picker-list">
            {labelFields(selectedObject).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`dm-picker-option${displayFieldId === f.id ? " selected" : ""}`}
                onClick={() => {
                  setDisplayFieldId(f.id);
                  setStep("pick-cardinality");
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className="dm-btn-ghost" onClick={() => setStep("pick-object")}>Back</button>
        </div>
      )}
      {step === "pick-cardinality" && selectedObject && displayFieldId && (
        <div className="dm-picker-step">
          <p className="dm-picker-hint">Relationship type</p>
          {[
            { value: "many-to-one", label: "Many to One", hint: "Each record points to one target" },
            { value: "one-to-many", label: "One to Many", hint: "Each record has many targets" },
            { value: "many-to-many", label: "Many to Many", hint: "Multiple targets per record" },
            { value: "one-to-one", label: "One to One", hint: "Single link both ways" }
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="dm-picker-card"
              onClick={() => {
                onSelect({
                  targetObjectType: selectedObject.objectType || "custom",
                  targetObjectId: selectedObject.id,
                  displayField: displayFieldId,
                  cardinality: opt.value
                });
                reset();
              }}
            >
              <strong>{opt.label}</strong>
              <span className="dm-picker-card-hint">{opt.hint}</span>
            </button>
          ))}
          <button type="button" className="dm-btn-ghost" onClick={() => setStep("pick-display-field")}>Back</button>
        </div>
      )}
    </div>
  );
}
