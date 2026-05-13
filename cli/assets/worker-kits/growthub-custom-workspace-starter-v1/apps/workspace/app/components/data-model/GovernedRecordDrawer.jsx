"use client";

import { X } from "lucide-react";
import { RecordDrawer } from "./RecordDrawer.jsx";
import { updateTableCell } from "@/lib/workspace-data-model";

export function GovernedRecordDrawer({
  table,
  workspaceConfig,
  rowIndex,
  row,
  onSave,
  onClose
}) {
  if (rowIndex === null || rowIndex === undefined || !row) return null;
  const rawObject = (workspaceConfig?.dataModel?.objects || []).find((o) => o.id === table.objectId);
  const allObjects = workspaceConfig?.dataModel?.objects || [];

  function onFieldUpdate(fieldId, value) {
    onSave((config) => updateTableCell(config, table, rowIndex, fieldId, value));
  }

  return (
    <>
      <div className="dm-record-backdrop" onClick={onClose} />
      <aside className="dm-record-drawer dm-record-drawer-wide" aria-label="Record details">
        <header className="dm-record-drawer-head">
          <div>
            <p>Record</p>
            <h2>{(() => {
              const nameField = table.fields?.find((f) => f.label?.toLowerCase() === "name" || (f.type === "text" && f.id.includes("name")));
              const t = nameField && row.data?.[nameField.id];
              return t || row.id;
            })()}</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        {rawObject && (
          <RecordDrawer
            record={row}
            objectSchema={rawObject}
            allObjects={allObjects}
            onFieldUpdate={onFieldUpdate}
            onClose={onClose}
          />
        )}
      </aside>
    </>
  );
}
