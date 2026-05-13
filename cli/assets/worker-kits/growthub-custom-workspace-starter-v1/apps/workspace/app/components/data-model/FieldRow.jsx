"use client";

import { FIELD_TYPE_REGISTRY } from "@/lib/field-type-registry";

export function FieldRowMenu({ fieldId, canDelete, onEdit, onDelete }) {
  return (
    <div className="dm-field-row-menu">
      <button type="button" className="dm-btn-ghost" onClick={onEdit}>
        Edit
      </button>
      {canDelete ? (
        <button type="button" className="dm-btn-ghost danger" onClick={onDelete}>
          Delete
        </button>
      ) : null}
    </div>
  );
}

export function FieldRow({
  field,
  onVisibilityToggle,
  onEditField,
  onDeleteField,
  targetLabel
}) {
  const meta = FIELD_TYPE_REGISTRY[field.type] || FIELD_TYPE_REGISTRY.text;
  return (
    <div className="dm-field-row" data-field-id={field.id}>
      <span className="dm-drag-handle" aria-hidden>
        ⠿
      </span>
      <span className="dm-field-type-icon" title={meta.label}>
        {meta.icon}
      </span>
      <span className="dm-field-label">{field.label}</span>
      <span className="dm-field-type-badge">{meta.label}</span>
      {field.refConfig && targetLabel ? <span className="dm-ref-target-badge">→ {targetLabel}</span> : null}
      {field.isRequired ? (
        <span className="dm-required-dot" title="Required">
          ●
        </span>
      ) : null}
      <button
        type="button"
        className={`dm-visibility-toggle${field.isVisible === false ? " off" : ""}`}
        onClick={() => {
          const current = field.isVisible !== false;
          onVisibilityToggle(field.id, !current);
        }}
        aria-label={field.isVisible === false ? "Show field" : "Hide field"}
      >
        {field.isVisible === false ? "👁‍🗨" : "👁"}
      </button>
      <FieldRowMenu
        fieldId={field.id}
        canDelete={!field.isStandard}
        onEdit={() => onEditField(field.id)}
        onDelete={() => onDeleteField(field.id)}
      />
    </div>
  );
}
