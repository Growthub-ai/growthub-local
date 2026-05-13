"use client";

import { Plus } from "lucide-react";
import { LucideIcon, OBJECT_TYPE_PRESETS, objectTypeBadge, pluralize } from "./dm-shared.jsx";

function ObjectRow({ table, selected, onSelect }) {
  const badge = objectTypeBadge(table.objectType);
  const iconName = table.icon || OBJECT_TYPE_PRESETS[table.objectType]?.icon || "Database";
  return (
    <button type="button" className={`dm-obj-row${selected ? " active" : ""}`} onClick={onSelect}>
      <LucideIcon name={iconName} size={13} className="dm-obj-icon" />
      <span className="dm-obj-name">{table.label}</span>
      <span className={`dm-badge ${badge.cls}`}>{badge.label}</span>
    </button>
  );
}

export function ObjectSidebar({ tables, selectedTable, onSelectSource, onAddObject }) {
  return (
    <aside className="dm-obj-col">
      <div className="dm-obj-col-head">
        <span>{pluralize(tables.length, "object")}</span>
      </div>
      <div className="dm-obj-col-body">
        {tables.map((table) => (
          <ObjectRow
            key={`${table.source}-${table.id}`}
            table={table}
            selected={selectedTable?.id === table.id}
            onSelect={() => onSelectSource(table.source)}
          />
        ))}
      </div>
      <div className="dm-obj-col-foot">
        <button type="button" className="dm-obj-add-btn" onClick={onAddObject}>
          <Plus size={13} />New object
        </button>
      </div>
    </aside>
  );
}
