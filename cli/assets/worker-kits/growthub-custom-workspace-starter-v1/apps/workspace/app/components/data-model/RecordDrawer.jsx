"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { FieldCell } from "./FieldCell.jsx";

export function RecordDrawer({ record, objectSchema, allObjects, onFieldUpdate, onClose }) {
  const sections = objectSchema.sections?.length
    ? [...objectSchema.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [{ id: "default", label: "Fields", isCollapsed: false }];
  const [collapsed, setCollapsed] = useState(() => Object.fromEntries(sections.map((s) => [s.id, Boolean(s.isCollapsed)])));

  function toggleSection(sectionId) {
    setCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }

  if (!record) return null;

  return (
    <div className="dm-record-drawer-v2">
      {sections.map((section) => {
        const sectionFields = (objectSchema.fields || []).filter(
          (f) => (f.sectionId || "sec_main") === section.id && f.isVisible !== false
        );
        const isCollapsed = collapsed[section.id];
        return (
          <div key={section.id} className="dm-field-section">
            <button
              type="button"
              className="dm-section-toggle"
              onClick={() => toggleSection(section.id)}
              aria-expanded={!isCollapsed}
            >
              <ChevronRight size={14} className={isCollapsed ? "" : "dm-chevron-open"} aria-hidden />
              <span>{section.label}</span>
            </button>
            {!isCollapsed && (
              <div className="dm-section-fields">
                {sectionFields.map((field) => (
                  <FieldCell
                    key={field.id}
                    field={field}
                    rowData={record.data}
                    hostObject={objectSchema}
                    allObjects={allObjects}
                    onUpdate={onFieldUpdate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
