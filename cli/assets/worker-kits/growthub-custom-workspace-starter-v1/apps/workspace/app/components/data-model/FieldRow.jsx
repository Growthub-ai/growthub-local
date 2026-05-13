"use client";

import { useState } from "react";
import { FIELD_TYPE_REGISTRY } from "@/lib/field-type-registry";
import { MoreHorizontal, Eye, EyeOff, GripVertical } from "lucide-react";

function RefTargetBadge({ targetObjectId, targetObjectType }) {
  if (!targetObjectId) return null;
  return (
    <span className="dm-ref-target-badge" title={targetObjectType || ""}>
      → {targetObjectId}
    </span>
  );
}

function FieldRowMenu({ canDelete, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dm-field-row-menu-wrap">
      <button type="button" className="dm-field-row-menu-btn" aria-label="Field actions" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="dm-field-row-menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => { onEdit(); setOpen(false); }}>Edit</button>
          {canDelete && (
            <button type="button" role="menuitem" className="danger" onClick={() => { onDelete(); setOpen(false); }}>Delete</button>
          )}
        </div>
      )}
    </div>
  );
}

export function FieldRow({
  field,
  onVisibilityToggle,
  onEditField,
  onDeleteField,
  onReorder
}) {
  const meta = FIELD_TYPE_REGISTRY[field.type] || FIELD_TYPE_REGISTRY.text;
  return (
    <div
      className="dm-field-row"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("fieldId", field.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const dragId = event.dataTransfer.getData("fieldId");
        if (dragId && dragId !== field.id) onReorder(dragId, field.id);
      }}
      data-field-id={field.id}
    >
      <span className="dm-field-row-drag" aria-label="Reorder">
        <GripVertical size={14} />
      </span>
      <span className="dm-field-type-icon" aria-hidden>{meta.icon}</span>
      <span className="dm-field-label">{field.label}</span>
      <span className="dm-field-type-badge">{meta.label}</span>
      {field.refConfig && (
        <RefTargetBadge
          targetObjectId={field.refConfig.targetObjectId}
          targetObjectType={field.refConfig.targetObjectType}
        />
      )}
      {field.isRequired && <span className="dm-required-dot" title="Required">●</span>}
      <button
        type="button"
        className={`dm-field-visibility${field.isVisible === false ? " off" : ""}`}
        onClick={() => {
          const visible = field.isVisible !== false;
          onVisibilityToggle(field.id, !visible);
        }}
        aria-label={field.isVisible === false ? "Show field" : "Hide field"}
        title={field.isVisible === false ? "Activate" : "Deactivate"}
      >
        {field.isVisible === false ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      <FieldRowMenu
        canDelete={!field.isStandard}
        onEdit={() => onEditField(field.id)}
        onDelete={() => onDeleteField(field.id)}
      />
    </div>
  );
}
