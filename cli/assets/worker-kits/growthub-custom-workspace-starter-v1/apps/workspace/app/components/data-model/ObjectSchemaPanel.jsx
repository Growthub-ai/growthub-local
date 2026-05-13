"use client";

import { useMemo, useState } from "react";
import { AddFieldModal } from "@/app/components/data-model/AddFieldModal";
import { FieldRow } from "@/app/components/data-model/FieldRow";
import {
  appendStructuredField,
  normalizeManualObjects,
  removeStructuredField,
  setStructuredFieldVisibility
} from "@/lib/workspace-data-model";

export function ObjectSchemaPanel({ table, workspaceConfig, saving, onSave }) {
  const [modalOpen, setModalOpen] = useState(false);
  const objects = useMemo(() => normalizeManualObjects(workspaceConfig), [workspaceConfig]);
  const object = useMemo(() => objects.find((o) => o.id === table.objectId), [objects, table.objectId]);
  const fields = object?.fields || [];
  const sections = object?.sections?.length
    ? object.sections
    : [{ id: "default", label: "Fields", isCollapsed: false, order: 0 }];

  if (!object || table.storage !== "manual-object") return null;

  return (
    <section className="dm-object-schema-panel">
      <div className="dm-object-schema-head">
        <div>
          <p className="dm-usage-label">Typed field model</p>
          <strong>Field definitions</strong>
          <p className="dm-picker-hint">Registry-driven rows mirror Settings → Data Model in Twenty CRM. Ref fields use the three-step picker.</p>
        </div>
        <button type="button" className="dm-btn-primary-sm" disabled={saving} onClick={() => setModalOpen(true)}>
          Add field
        </button>
      </div>
      {fields.length === 0 ? (
        <p className="dm-cell-empty">No typed fields yet. Add a field to enable the record drawer, ref pickers, and PATCH validation for this object.</p>
      ) : (
        <div className="dm-field-row-list">
          {fields.map((field) => {
            const target = objects.find((o) => o.id === field.refConfig?.targetObjectId);
            return (
              <FieldRow
                key={field.id}
                field={field}
                targetLabel={target?.label}
                onVisibilityToggle={(fieldId, visible) =>
                  onSave((config) => setStructuredFieldVisibility(config, { objectId: object.id, fieldId, isVisible: visible }))
                }
                onEditField={() => setModalOpen(true)}
                onDeleteField={(fieldId) => onSave((config) => removeStructuredField(config, { objectId: object.id, fieldId }))}
              />
            );
          })}
        </div>
      )}
      <AddFieldModal
        open={modalOpen}
        objectId={object.id}
        availableObjects={objects}
        objectFields={fields}
        objectSections={sections}
        onCancel={() => setModalOpen(false)}
        onSave={(fieldDef) => {
          onSave((config) => appendStructuredField(config, { objectId: object.id, field: fieldDef }));
          setModalOpen(false);
        }}
      />
    </section>
  );
}
