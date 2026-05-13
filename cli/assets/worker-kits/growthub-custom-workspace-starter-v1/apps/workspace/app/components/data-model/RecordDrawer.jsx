"use client";

import { useMemo, useState } from "react";
import { FieldCell } from "@/app/components/data-model/FieldCell";

export function RecordDrawer({ record, objectSchema, allObjects, disabled, onFieldUpdate }) {
  const sections = useMemo(() => {
    if (objectSchema?.sections?.length) return objectSchema.sections;
    return [{ id: "default", label: "Fields", isCollapsed: false, order: 0 }];
  }, [objectSchema]);

  const [collapsed, setCollapsed] = useState(() => {
    const map = {};
    sections.forEach((s) => {
      map[s.id] = Boolean(s.isCollapsed);
    });
    return map;
  });

  const fields = objectSchema?.fields || [];

  return (
    <div className="dm-schema-record-drawer">
      {sections.map((section) => {
        const sectionFields = fields.filter((f) => (f.sectionId || "default") === section.id && f.isVisible !== false);
        if (!sectionFields.length) return null;
        const isCollapsed = collapsed[section.id];
        return (
          <div key={section.id} className="dm-field-section">
            <button
              type="button"
              className="dm-section-toggle"
              onClick={() => setCollapsed((prev) => ({ ...prev, [section.id]: !prev[section.id] }))}
              aria-expanded={!isCollapsed}
            >
              <span>{section.label}</span>
              <span className="dm-section-chevron">{isCollapsed ? "▶" : "▼"}</span>
            </button>
            {!isCollapsed ? (
              <div className="dm-section-fields">
                {sectionFields.map((field) => (
                  <FieldCell
                    key={field.id}
                    field={field}
                    record={record}
                    allObjects={allObjects}
                    schemaFields={fields}
                    disabled={disabled}
                    onChange={(val) => onFieldUpdate(field.id, val)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
