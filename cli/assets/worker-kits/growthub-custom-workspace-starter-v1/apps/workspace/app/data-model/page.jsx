"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addTableField,
  addTableRow,
  appendRowsToTable,
  createViewBackedTable,
  deleteTableField,
  deleteTableRow,
  describeBindingLane,
  describeBindingMode,
  duplicateTableRow,
  exportTableAsCsv,
  importTableFromCsv,
  listWorkspaceDataModelTables,
  renameTableField,
  replaceTableContent,
  reorderTableField,
  toggleTableFieldHidden,
  updateTableCell
} from "@/lib/workspace-data-model";

// ─── Constants ────────────────────────────────────────────────────────────────

const DETAIL_TABS = ["Fields", "Records", "Bindings", "Usage"];

const LANE_META = {
  manual: { label: "Manual", cls: "dm-badge-manual" },
  "data-source": { label: "Data Source", cls: "dm-badge-datasource" },
  "workspace-integration": { label: "Workspace Tool", cls: "dm-badge-integration" },
  integration: { label: "Integration", cls: "dm-badge-integration" }
};

// ─── Micro-utilities ──────────────────────────────────────────────────────────

function pluralize(n, word) {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

function downloadBlob(content, filename, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getEffectiveFieldOrder(table) {
  const known = new Set(table.columns);
  const ordered = (table.fieldSettings?.order || []).filter((n) => known.has(n));
  const remaining = table.columns.filter((n) => !ordered.includes(n));
  return [...ordered, ...remaining];
}

function fieldHasData(table, fieldName) {
  return (table.rows || []).some((row) => {
    const v = row[fieldName];
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
}

function laneMeta(binding) {
  const lane = describeBindingLane(binding);
  return LANE_META[lane] || LANE_META.manual;
}

// ─── Save toast ───────────────────────────────────────────────────────────────

function SaveToast({ message, saving, onDismiss }) {
  if (saving) return <span className="dm-toast saving" aria-live="polite">Saving…</span>;
  if (!message) return null;
  const isErr = message.startsWith("Error");
  return (
    <span className={`dm-toast ${isErr ? "error" : "ok"}`} role={isErr ? "alert" : "status"} aria-live="polite">
      {message}
      <button type="button" className="dm-toast-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
    </span>
  );
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ tables }) {
  const totalFields = tables.reduce((s, t) => s + t.columns.length, 0);
  const totalRows = tables.reduce((s, t) => s + t.rows.length, 0);
  const integrationScoped = tables.filter((t) => describeBindingLane(t.binding) !== "manual").length;

  return (
    <div className="dm-summary-cards">
      <div className="dm-summary-card">
        <span className="dm-summary-label">Objects</span>
        <strong className="dm-summary-value">{tables.length}</strong>
        <p className="dm-summary-desc">view widget sources</p>
      </div>
      <div className="dm-summary-card">
        <span className="dm-summary-label">Fields</span>
        <strong className="dm-summary-value">{totalFields}</strong>
        <p className="dm-summary-desc">across all objects</p>
      </div>
      <div className="dm-summary-card">
        <span className="dm-summary-label">Records</span>
        <strong className="dm-summary-value">{totalRows}</strong>
        <p className="dm-summary-desc">local config rows</p>
      </div>
      <div className="dm-summary-card">
        <span className="dm-summary-label">Integration-scoped</span>
        <strong className="dm-summary-value">{integrationScoped}</strong>
        <p className="dm-summary-desc">pipeline or tool binding</p>
      </div>
    </div>
  );
}

// ─── Object list row ─────────────────────────────────────────────────────────

function ObjectListRow({ table, isSelected, onClick }) {
  const meta = laneMeta(table.binding);
  return (
    <button
      type="button"
      className={`dm-object-row${isSelected ? " active" : ""}`}
      onClick={onClick}
      aria-selected={isSelected}
    >
      <div className="dm-object-row-top">
        <span className="dm-object-icon">▦</span>
        <strong className="dm-object-name">{table.label}</strong>
        <span className={`dm-badge ${meta.cls}`}>{meta.label}</span>
      </div>
      <div className="dm-object-row-meta">
        <span>{pluralize(table.rows.length, "record")}</span>
        <span aria-hidden="true">·</span>
        <span>{pluralize(table.columns.length, "field")}</span>
        <span aria-hidden="true">·</span>
        <span>{pluralize(table.widgetRefs.length, "widget")}</span>
      </div>
    </button>
  );
}

// ─── Fields tab ───────────────────────────────────────────────────────────────

function FieldsTab({ table, saving, onSave }) {
  const [isAdding, setIsAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [renamingField, setRenamingField] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [fieldError, setFieldError] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [showHidden, setShowHidden] = useState(true);

  const addRef = useRef(null);
  const renameRef = useRef(null);

  useEffect(() => { if (isAdding) addRef.current?.focus(); }, [isAdding]);
  useEffect(() => { if (renamingField) renameRef.current?.focus(); }, [renamingField]);

  const effectiveOrder = getEffectiveFieldOrder(table);
  const hiddenSet = new Set(table.fieldSettings?.hidden || []);

  const filteredOrder = effectiveOrder.filter((name) => {
    if (!showHidden && hiddenSet.has(name)) return false;
    if (!fieldSearch.trim()) return true;
    return name.toLowerCase().includes(fieldSearch.trim().toLowerCase());
  });

  function doAddField() {
    const name = addName.trim();
    if (!name) { setFieldError("Field name is required."); return; }
    if (table.columns.includes(name)) { setFieldError(`"${name}" already exists.`); return; }
    setFieldError("");
    setAddName("");
    setIsAdding(false);
    onSave((cfg) => addTableField(cfg, table, name));
  }

  function doRename() {
    const name = renameValue.trim();
    if (!name) { setFieldError("Name cannot be empty."); return; }
    if (name === renamingField) { setRenamingField(null); return; }
    if (table.columns.includes(name)) { setFieldError(`"${name}" already exists.`); return; }
    setFieldError("");
    const old = renamingField;
    setRenamingField(null);
    setRenameValue("");
    onSave((cfg) => renameTableField(cfg, table, old, name));
  }

  function doDelete() {
    const name = confirmDelete;
    setConfirmDelete(null);
    onSave((cfg) => deleteTableField(cfg, table, name));
  }

  function startRename(name) {
    setRenamingField(name);
    setRenameValue(name);
    setFieldError("");
    setConfirmDelete(null);
  }

  return (
    <div className="dm-fields-tab">
      <div className="dm-tab-toolbar">
        <p className="dm-tab-stat">
          {effectiveOrder.length} field{effectiveOrder.length !== 1 ? "s" : ""}
          {hiddenSet.size ? ` · ${hiddenSet.size} hidden` : ""}
          {fieldSearch ? ` · ${filteredOrder.length} matching` : ""}
        </p>
        <button
          type="button"
          className="dm-btn primary"
          disabled={saving}
          onClick={() => { setIsAdding(true); setFieldError(""); setConfirmDelete(null); }}
        >
          + Add field
        </button>
      </div>

      {/* Field search + filter bar — mirrors Twenty SettingsObjectFieldTable search */}
      <div className="dm-field-search-bar">
        <input
          className="dm-input dm-field-search-input"
          type="search"
          placeholder="Search fields…"
          value={fieldSearch}
          onChange={(e) => setFieldSearch(e.target.value)}
          aria-label="Search fields"
        />
        <label className="dm-radio-label dm-field-filter-toggle">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden
        </label>
      </div>

      {fieldError ? <p className="dm-field-error" role="alert">{fieldError}</p> : null}

      {isAdding ? (
        <div className="dm-inline-form">
          <input
            ref={addRef}
            className="dm-input"
            placeholder="Field name — e.g. Tier, Owner, Status, Due Date"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doAddField();
              if (e.key === "Escape") { setIsAdding(false); setAddName(""); setFieldError(""); }
            }}
            aria-label="New field name"
          />
          <button type="button" className="dm-btn primary" onClick={doAddField} disabled={saving}>Add</button>
          <button type="button" className="dm-btn" onClick={() => { setIsAdding(false); setAddName(""); setFieldError(""); }}>Cancel</button>
        </div>
      ) : null}

      <div className="dm-field-list" role="list">
        {effectiveOrder.length === 0 ? (
          <div className="dm-empty-inline">No fields defined. Add the first field to define this object's schema.</div>
        ) : filteredOrder.length === 0 ? (
          <div className="dm-empty-inline">No fields match <strong>{fieldSearch}</strong>{!showHidden ? " (hidden fields filtered out)" : ""}.</div>
        ) : null}

        {filteredOrder.map((fieldName) => {
          const idx = effectiveOrder.indexOf(fieldName);
          const isHidden = hiddenSet.has(fieldName);
          const isRenaming = renamingField === fieldName;
          const isDeleting = confirmDelete === fieldName;

          if (isRenaming) {
            return (
              <div key={fieldName} className="dm-field-item renaming" role="listitem">
                <input
                  ref={renameRef}
                  className="dm-input dm-field-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doRename();
                    if (e.key === "Escape") { setRenamingField(null); setFieldError(""); }
                  }}
                  aria-label={`Rename field ${fieldName}`}
                />
                <button type="button" className="dm-btn primary" onClick={doRename} disabled={saving}>Rename</button>
                <button type="button" className="dm-btn" onClick={() => { setRenamingField(null); setFieldError(""); }}>Cancel</button>
              </div>
            );
          }

          if (isDeleting) {
            return (
              <div key={fieldName} className="dm-field-item deleting" role="listitem">
                <span className="dm-confirm-text">
                  Delete <strong>{fieldName}</strong>?
                  {fieldHasData(table, fieldName) ? " This field has data that will be lost." : ""}
                </span>
                <button type="button" className="dm-btn danger" onClick={doDelete} disabled={saving}>Delete</button>
                <button type="button" className="dm-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              </div>
            );
          }

          return (
            <div key={fieldName} className={`dm-field-item${isHidden ? " hidden" : ""}`} role="listitem">
              <span className="dm-field-drag-handle" aria-hidden="true">⠿</span>
              <span className="dm-field-icon" aria-hidden="true">▦</span>
              <span className="dm-field-name">{fieldName}</span>
              {isHidden ? <span className="dm-badge dm-badge-hidden">hidden</span> : null}
              <div className="dm-field-actions" aria-label={`Actions for ${fieldName}`}>
                <button
                  type="button" className="dm-icon-btn" title="Move up"
                  disabled={idx === 0 || saving}
                  onClick={() => onSave((cfg) => reorderTableField(cfg, table, fieldName, "up"))}
                  aria-label={`Move ${fieldName} up`}
                >↑</button>
                <button
                  type="button" className="dm-icon-btn" title="Move down"
                  disabled={idx === effectiveOrder.length - 1 || saving}
                  onClick={() => onSave((cfg) => reorderTableField(cfg, table, fieldName, "down"))}
                  aria-label={`Move ${fieldName} down`}
                >↓</button>
                <button
                  type="button" className="dm-icon-btn" title={isHidden ? "Show" : "Hide"}
                  disabled={saving}
                  onClick={() => onSave((cfg) => toggleTableFieldHidden(cfg, table, fieldName))}
                  aria-label={isHidden ? `Show ${fieldName}` : `Hide ${fieldName}`}
                >{isHidden ? "👁" : "○"}</button>
                <button
                  type="button" className="dm-icon-btn" title="Rename"
                  disabled={saving}
                  onClick={() => startRename(fieldName)}
                  aria-label={`Rename ${fieldName}`}
                >✎</button>
                <button
                  type="button" className="dm-icon-btn danger" title="Delete"
                  disabled={saving}
                  onClick={() => { setConfirmDelete(fieldName); setFieldError(""); setRenamingField(null); }}
                  aria-label={`Delete ${fieldName}`}
                >✕</button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="dm-hint-block">
        <strong>Hide</strong> keeps field data in config but removes it from the widget preview — safe for data you want to preserve without displaying.
        Rename and delete safely update all row values, sort clauses, and filter references across every widget that shares this object.
      </p>
    </div>
  );
}

// ─── Records tab ──────────────────────────────────────────────────────────────

function RecordsTab({ table, saving, onSave }) {
  const [editingCell, setEditingCell] = useState(null);
  const [cellDraft, setCellDraft] = useState("");
  const [confirmDeleteRow, setConfirmDeleteRow] = useState(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvMode, setCsvMode] = useState("append");
  const [csvError, setCsvError] = useState("");
  const cellRef = useRef(null);

  const { columns, rows } = table;

  useEffect(() => { if (editingCell) cellRef.current?.focus(); }, [editingCell]);

  function commitCell() {
    if (!editingCell) return;
    const { rowIndex, fieldName } = editingCell;
    const current = String(rows[rowIndex]?.[fieldName] ?? "");
    if (cellDraft !== current) {
      onSave((cfg) => updateTableCell(cfg, table, rowIndex, fieldName, cellDraft));
    }
    setEditingCell(null);
    setCellDraft("");
  }

  function handleExport() {
    const csv = exportTableAsCsv(table);
    downloadBlob(csv, `${table.source.replace(/\s+/g, "-").toLowerCase()}.csv`, "text/csv");
  }

  function handleImport() {
    setCsvError("");
    const { columns: importedCols, rows: importedRows } = importTableFromCsv(csvText);
    if (!importedCols.length) { setCsvError("No columns found — check that the first line is a header row."); return; }

    if (csvMode === "replace") {
      onSave((cfg) => replaceTableContent(cfg, table, { columns: importedCols, rows: importedRows }));
    } else {
      onSave((cfg) => appendRowsToTable(cfg, table, importedRows));
    }

    setShowCsvImport(false);
    setCsvText("");
  }

  return (
    <div className="dm-records-tab">
      <div className="dm-tab-toolbar">
        <p className="dm-tab-stat">{pluralize(rows.length, "record")}</p>
        <div className="dm-tab-toolbar-actions">
          <button type="button" className="dm-btn" onClick={handleExport} disabled={!rows.length}>↓ Export CSV</button>
          <button type="button" className="dm-btn" onClick={() => { setShowCsvImport((v) => !v); setCsvError(""); }}>↑ Import CSV</button>
          <button type="button" className="dm-btn primary" disabled={saving || !columns.length} onClick={() => onSave((cfg) => addTableRow(cfg, table))}>+ Add row</button>
        </div>
      </div>

      {showCsvImport ? (
        <div className="dm-csv-panel">
          <p className="dm-hint-block">Paste CSV text. First line must be column headers.</p>
          <textarea
            className="dm-csv-textarea"
            placeholder={"Name,Status,Owner\nAcme Corp,Active,Sarah\nBeta Inc,Prospect,Chris"}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            aria-label="CSV import content"
          />
          {csvError ? <p className="dm-field-error" role="alert">{csvError}</p> : null}
          <div className="dm-csv-options">
            <label className="dm-radio-label">
              <input type="radio" name="csvMode" value="append" checked={csvMode === "append"} onChange={() => setCsvMode("append")} />
              Append rows
            </label>
            <label className="dm-radio-label">
              <input type="radio" name="csvMode" value="replace" checked={csvMode === "replace"} onChange={() => setCsvMode("replace")} />
              Replace entire table
            </label>
            <div className="dm-csv-actions">
              <button type="button" className="dm-btn primary" onClick={handleImport} disabled={saving || !csvText.trim()}>Import</button>
              <button type="button" className="dm-btn" onClick={() => { setShowCsvImport(false); setCsvError(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {columns.length === 0 ? (
        <div className="dm-empty-inline">Add fields first to define this object's schema before adding records.</div>
      ) : rows.length === 0 ? (
        <div className="dm-empty-inline">
          No records yet.{" "}
          <button type="button" className="dm-btn-link" onClick={() => onSave((cfg) => addTableRow(cfg, table))} disabled={saving}>Add the first row</button>
          {" "}or import from CSV.
        </div>
      ) : (
        <div className="dm-records-scroll">
          <table className="dm-records-table" aria-label={`Records for ${table.label}`}>
            <thead>
              <tr>
                <th className="dm-records-th dm-records-th-num">#</th>
                {columns.map((col) => <th key={col} className="dm-records-th">{col}</th>)}
                <th className="dm-records-th dm-records-th-actions"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                confirmDeleteRow === rowIdx ? (
                  <tr key={rowIdx} className="dm-records-confirm-row">
                    <td colSpan={columns.length + 2}>
                      <span>Delete row {rowIdx + 1}?</span>
                      <button type="button" className="dm-btn danger" disabled={saving} onClick={() => { setConfirmDeleteRow(null); onSave((cfg) => deleteTableRow(cfg, table, rowIdx)); }}>Delete</button>
                      <button type="button" className="dm-btn" onClick={() => setConfirmDeleteRow(null)}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={rowIdx} className="dm-records-row">
                    <td className="dm-records-td dm-records-td-num">{rowIdx + 1}</td>
                    {columns.map((col) => {
                      const isEditing = editingCell?.rowIndex === rowIdx && editingCell?.fieldName === col;
                      const val = String(row?.[col] ?? "");
                      return (
                        <td key={col} className="dm-records-td">
                          {isEditing ? (
                            <input
                              ref={cellRef}
                              className="dm-cell-input"
                              value={cellDraft}
                              onChange={(e) => setCellDraft(e.target.value)}
                              onBlur={commitCell}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitCell();
                                if (e.key === "Escape") { setEditingCell(null); setCellDraft(""); }
                              }}
                              aria-label={`Row ${rowIdx + 1} ${col}`}
                            />
                          ) : (
                            <button
                              type="button"
                              className="dm-cell-btn"
                              onClick={() => { setEditingCell({ rowIndex: rowIdx, fieldName: col }); setCellDraft(val); }}
                              aria-label={`Edit row ${rowIdx + 1} ${col}`}
                            >
                              {val || <span className="dm-cell-empty" aria-label="empty">—</span>}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="dm-records-td dm-records-td-actions">
                      <button type="button" className="dm-icon-btn" title="Duplicate row" disabled={saving} onClick={() => onSave((cfg) => duplicateTableRow(cfg, table, rowIdx))} aria-label={`Duplicate row ${rowIdx + 1}`}>⎘</button>
                      <button type="button" className="dm-icon-btn danger" title="Delete row" onClick={() => setConfirmDeleteRow(rowIdx)} aria-label={`Delete row ${rowIdx + 1}`}>✕</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Bindings tab ─────────────────────────────────────────────────────────────

function BindingsTab({ table }) {
  const binding = table.binding || {};
  const lane = describeBindingLane(binding);
  const mode = describeBindingMode(binding);
  const meta = laneMeta(binding);

  return (
    <div className="dm-bindings-tab">
      <div className="dm-binding-header">
        <span className={`dm-badge ${meta.cls}`}>{mode.label}</span>
        <p className="dm-binding-desc">{mode.description}</p>
      </div>

      <div className="dm-binding-rows">
        <div className="dm-binding-row">
          <span>Object source</span>
          <code>{table.source}</code>
        </div>
        <div className="dm-binding-row">
          <span>Config path</span>
          <code>view.config.source</code>
        </div>
        <div className="dm-binding-row">
          <span>Binding mode</span>
          <code>{binding.mode || "manual"}</code>
        </div>
        {lane !== "manual" ? (
          <>
            <div className="dm-binding-row">
              <span>Integration ID</span>
              <code>{binding.integrationId || "—"}</code>
            </div>
            <div className="dm-binding-row">
              <span>Lane</span>
              <code>{binding.lane}</code>
            </div>
            <div className="dm-binding-row">
              <span>Object type</span>
              <code>{binding.objectType || (lane === "data-source" ? "data-pipeline" : "mcp-connection")}</code>
            </div>
            {binding.entityId ? <div className="dm-binding-row"><span>Entity ID</span><code>{binding.entityId}</code></div> : null}
            {binding.entityType ? <div className="dm-binding-row"><span>Entity type</span><code>{binding.entityType}</code></div> : null}
            {binding.entityLabel ? <div className="dm-binding-row"><span>Entity label</span><code>{binding.entityLabel}</code></div> : null}
          </>
        ) : null}
      </div>

      {lane === "manual" ? (
        <div className="dm-binding-note">
          <strong>Local portable records</strong>
          <p>Rows live in <code>view.config.rows</code> and travel with workspace export/import. No provider credentials are needed. This object is fully governed and portable.</p>
        </div>
      ) : lane === "data-source" ? (
        <div className="dm-binding-note info">
          <strong>Data source scope</strong>
          <p>
            This binding scopes a live pipeline entity. Local rows in this widget are starter/sample records.
            A server-side resolver may replace them at query time via the Growthub Bridge.
            The browser never queries provider APIs or holds tokens directly.
          </p>
          <Link href="/settings/integrations" className="dm-binding-link">Manage data sources →</Link>
        </div>
      ) : (
        <div className="dm-binding-note info">
          <strong>Workspace tool scope</strong>
          <p>
            This binding scopes agent or tool operations to a provider object — a location, project, folder, channel, or database.
            This is an operational context scope, not a data pipeline.
            The browser never queries provider APIs or holds tokens directly.
          </p>
          <Link href="/settings/integrations" className="dm-binding-link">Manage workspace tools →</Link>
        </div>
      )}
    </div>
  );
}

// ─── Usage tab ────────────────────────────────────────────────────────────────

function UsageTab({ table }) {
  const refs = table.widgetRefs || [];
  const lane = describeBindingLane(table.binding);
  const modeLabel = lane === "data-source" ? "data-source" : lane === "workspace-integration" ? "workspace-tool" : "manual";

  if (!refs.length) {
    return (
      <div className="dm-usage-tab">
        <div className="dm-empty-inline">No widgets reference this object yet. Create a view widget with source <code>{table.source}</code> to start using it.</div>
      </div>
    );
  }

  return (
    <div className="dm-usage-tab">
      <p className="dm-tab-stat">Used by {pluralize(refs.length, "widget")}</p>
      <div className="dm-usage-list">
        {refs.map((ref, i) => (
          <div key={`${ref.widgetId}-${i}`} className="dm-usage-item">
            <div className="dm-usage-item-main">
              <strong className="dm-usage-widget-name">{ref.widgetTitle}</strong>
              <div className="dm-usage-item-meta">
                {ref.dashboardName ? <span className="dm-usage-dash">{ref.dashboardName}</span> : <span className="dm-usage-dash">Canvas</span>}
                {ref.tabName ? <><span aria-hidden="true">›</span><span>{ref.tabName}</span></> : null}
                <span className={`dm-badge ${LANE_META.manual.cls}`}>{ref.widgetKind || "view"}</span>
                <span className={`dm-badge ${LANE_META[lane]?.cls || "dm-badge-manual"}`}>{modeLabel}</span>
              </div>
            </div>
            <code className="dm-usage-id" title={ref.widgetId}>
              {ref.widgetId ? ref.widgetId.slice(0, 20) + "…" : "—"}
            </code>
          </div>
        ))}
      </div>
      <p className="dm-hint-block">
        Edit widget layout, position, and visual config in the{" "}
        <Link href="/">dashboard builder</Link>.
        The Data Model page manages the object schema — fields, records, and bindings.
      </p>
    </div>
  );
}

// ─── Create object modal ──────────────────────────────────────────────────────

function CreateObjectModal({ workspaceConfig, saving, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [fields, setFields] = useState("Name");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");
  const nameRef = useRef(null);

  const dashboards = workspaceConfig?.dashboards || [];

  useEffect(() => {
    nameRef.current?.focus();
    if (dashboards.length) setTargetId(dashboards[0].id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const previewCols = fields.split(",").map((f) => f.trim()).filter(Boolean);

  function handleCreate() {
    const trimName = name.trim();
    if (!trimName) { setError("Object name is required."); return; }
    if (!previewCols.length) { setError("At least one field is required."); return; }
    setError("");
    onCreate({ tableName: trimName, columns: previewCols, targetDashboardId: targetId || null });
  }

  return (
    <div className="dm-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dm-modal-title">
      <div className="dm-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="dm-modal">
        <header className="dm-modal-header">
          <h2 id="dm-modal-title">Add business object</h2>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="dm-modal-body">
          <p className="dm-modal-intro">
            Creates a new <code>view</code> widget backed by a local records table. The object appears in the Data Model and in the selected dashboard.
          </p>

          <label className="dm-form-label">
            <span>Object name</span>
            <input
              ref={nameRef}
              className="dm-input"
              placeholder="e.g. Companies, Tasks, Clients, Leads"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onClose(); }}
            />
          </label>

          <label className="dm-form-label">
            <span>Fields <span className="dm-label-hint">(comma-separated)</span></span>
            <input
              className="dm-input"
              placeholder="Name, Status, Owner, Due Date, ACV"
              value={fields}
              onChange={(e) => setFields(e.target.value)}
            />
            <small className="dm-input-hint">Maps to <code>view.config.columns</code></small>
          </label>

          {dashboards.length > 1 ? (
            <label className="dm-form-label">
              <span>Add to dashboard</span>
              <select className="dm-select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {dashboards.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          ) : null}

          {error ? <p className="dm-field-error" role="alert">{error}</p> : null}

          {previewCols.length > 0 || name.trim() ? (
            <div className="dm-modal-preview">
              <p className="dm-tab-stat">Widget preview</p>
              <div className="dm-modal-preview-card">
                <div className="dm-modal-preview-title">{name.trim() || "Object name"}</div>
                <div className="dm-modal-preview-cols">
                  {previewCols.map((col) => (
                    <span key={col} className="dm-badge dm-badge-manual">{col}</span>
                  ))}
                </div>
                <code className="dm-modal-preview-meta">kind: "view" · source: "{name.trim() || "…"}" · mode: "manual"</code>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="dm-modal-footer">
          <button type="button" className="dm-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="dm-btn primary" onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create object"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Nav shell (shared across loading / error / main states) ─────────────────

function NavRail({ authority }) {
  return (
    <aside className="workspace-rail" aria-label="Workspace navigation">
      <div className="workspace-brand">
        <span className="workspace-mark">G</span>
        <span>Growthub Workspace</span>
      </div>
      <nav className="workspace-nav">
        <Link href="/">Dashboards</Link>
        <Link className="active" href="/data-model">Data Model</Link>
        <Link href="/settings/integrations">Integrations</Link>
        <span className="workspace-nav-static">Workspace Settings</span>
        <span className="workspace-nav-static">Management</span>
      </nav>
      <div className="workspace-rail-status">
        <span className="status-dot" />
        {authority || "local-catalog"}
      </div>
    </aside>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function DataModelPage() {
  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [authority, setAuthority] = useState(null);

  // Selected object state: we track by SOURCE name (stable) not by derived ID
  // (which changes when columns change).
  const [selectedSource, setSelectedSource] = useState(null);
  const [activeTab, setActiveTab] = useState("Fields");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────

  const tables = useMemo(
    () => (workspaceConfig ? listWorkspaceDataModelTables(workspaceConfig) : []),
    [workspaceConfig]
  );

  const selectedTable = useMemo(() => {
    if (!tables.length) return null;
    if (selectedSource) {
      const found = tables.find((t) => t.source === selectedSource);
      if (found) return found;
    }
    return tables[0];
  }, [tables, selectedSource]);

  // Auto-select first table on load.
  useEffect(() => {
    if (!selectedSource && tables.length) {
      setSelectedSource(tables[0].source);
    }
  }, [tables, selectedSource]);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/workspace");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWorkspaceConfig(data.workspaceConfig);
      setAuthority(data.adapters?.integrations?.authority || null);
    } catch (err) {
      setLoadError(err.message || "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  // ── Save ─────────────────────────────────────────────────────────────────

  /**
   * mutationFn receives the current workspaceConfig and returns the next one.
   * The PATCH only sends the three allowed top-level keys.
   * Both canvas AND dashboards copies of any widget are updated by the helpers.
   */
  const saveConfig = useCallback(async (mutationFn) => {
    if (!workspaceConfig) return;
    setSaving(true);
    setSaveMessage("");

    const next = mutationFn(workspaceConfig);

    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dashboards: next.dashboards,
          widgetTypes: next.widgetTypes,
          canvas: next.canvas
        })
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(data.details) ? `: ${data.details.slice(0, 2).join("; ")}` : "";
        setSaveMessage(`Error: ${data.error || "Save failed"}${detail}`);
      } else {
        setWorkspaceConfig(data.workspaceConfig);
        setSaveMessage("Saved");
        setTimeout(() => setSaveMessage((m) => (m === "Saved" ? "" : m)), 2500);
      }
    } catch (err) {
      setSaveMessage(`Error: ${err.message || "Network error"}`);
    } finally {
      setSaving(false);
    }
  }, [workspaceConfig]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCreateObject(options) {
    setShowCreateModal(false);
    setSelectedSource(options.tableName);
    saveConfig((cfg) => createViewBackedTable(cfg, options));
  }

  function selectTable(table) {
    setSelectedSource(table.source);
    setActiveTab("Fields");
  }

  // ── Render: loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="workspace-builder workspace-settings-page">
        <NavRail authority={authority} />
        <section className="workspace-surface">
          <div className="dm-loading" aria-live="polite">Loading workspace…</div>
        </section>
      </main>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <main className="workspace-builder workspace-settings-page">
        <NavRail authority={authority} />
        <section className="workspace-surface">
          <div className="dm-error-state">
            <strong>Could not load workspace</strong>
            <p>{loadError}</p>
            <button type="button" className="dm-btn primary" onClick={loadWorkspace}>Retry</button>
          </div>
        </section>
      </main>
    );
  }

  // ── Render: main ──────────────────────────────────────────────────────────

  return (
    <main className="workspace-builder workspace-settings-page">
      <NavRail authority={authority} />

      <section className="workspace-surface">
        {/* Page toolbar */}
        <header className="workspace-toolbar">
          <div>
            <p>Workspace</p>
            <h1>Data Model</h1>
          </div>
          <div className="workspace-toolbar-actions">
            <SaveToast message={saveMessage} saving={saving} onDismiss={() => setSaveMessage("")} />
            <button type="button" className="dm-btn primary" onClick={() => setShowCreateModal(true)}>
              + Add object
            </button>
          </div>
        </header>

        {/* Page description — the mental model framing */}
        <div className="dm-page-intro">
          <p>
            Here are the business objects inside this workspace. Each object is derived from a <code>view</code> widget — no new config keys are added.
            Some are local and manually managed. Some are scoped to live data pipelines. Some are scoped to operational integrations.
            All are governed through <code>growthub.config.json</code>.
          </p>
        </div>

        {tables.length > 0 ? <SummaryCards tables={tables} /> : null}

        {tables.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="dm-page-empty">
            <div className="dm-page-empty-icon" aria-hidden="true">▦</div>
            <strong>No business objects yet</strong>
            <p>
              Add a dashboard template with <code>view</code> widgets — Companies, Tasks, Content, Creative — and they
              will appear here as editable business objects. Or create your first object now.
            </p>
            <p className="dm-page-empty-hint">
              Templates like <em>Client Portal</em>, <em>Agency Delivery</em>, and <em>Content Ops</em> ship with
              baseline data models you can customize immediately.
            </p>
            <button type="button" className="dm-btn primary" onClick={() => setShowCreateModal(true)}>+ Add object</button>
            <Link href="/" className="dm-btn">Open dashboard builder</Link>
          </div>
        ) : (
          /* ── Main split layout: object list + detail panel ────────────── */
          <div className="dm-layout">
            {/* Left: object list */}
            <aside className="dm-object-list" aria-label="Workspace objects">
              <div className="dm-object-list-head">
                <p className="dm-tab-stat">{pluralize(tables.length, "object")}</p>
              </div>
              <div className="dm-object-list-body" role="list">
                {tables.map((table) => (
                  <ObjectListRow
                    key={table.id}
                    table={table}
                    isSelected={selectedTable?.source === table.source}
                    onClick={() => selectTable(table)}
                  />
                ))}
              </div>
            </aside>

            {/* Right: detail panel */}
            <section className="dm-detail-panel" aria-label={selectedTable ? `Object: ${selectedTable.label}` : "Object detail"}>
              {selectedTable ? (
                <>
                  {/* Detail header */}
                  <div className="dm-detail-header">
                    <div className="dm-detail-title-row">
                      <span className="dm-detail-icon" aria-hidden="true">▦</span>
                      <h2 className="dm-detail-title">{selectedTable.label}</h2>
                      <span className={`dm-badge ${laneMeta(selectedTable.binding).cls}`}>
                        {laneMeta(selectedTable.binding).label}
                      </span>
                    </div>
                    <div className="dm-detail-meta-row">
                      <code className="dm-detail-source">{selectedTable.source}</code>
                      <span className="dm-detail-counts">
                        {pluralize(selectedTable.columns.length, "field")} · {pluralize(selectedTable.rows.length, "record")} · {pluralize(selectedTable.widgetRefs.length, "widget")}
                      </span>
                    </div>
                  </div>

                  {/* Tab bar */}
                  <div className="dm-tabs" role="tablist" aria-label="Object detail sections">
                    {DETAIL_TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab}
                        className={`dm-tab${activeTab === tab ? " active" : ""}`}
                        onClick={() => setActiveTab(tab)}
                      >
                        {tab}
                        {tab === "Fields" ? <span className="dm-tab-badge">{selectedTable.columns.length}</span> : null}
                        {tab === "Records" ? <span className="dm-tab-badge">{selectedTable.rows.length}</span> : null}
                        {tab === "Usage" ? <span className="dm-tab-badge">{selectedTable.widgetRefs.length}</span> : null}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="dm-tab-content" role="tabpanel" aria-label={`${activeTab} — ${selectedTable.label}`}>
                    {activeTab === "Fields" && (
                      <FieldsTab table={selectedTable} saving={saving} onSave={saveConfig} />
                    )}
                    {activeTab === "Records" && (
                      <RecordsTab table={selectedTable} saving={saving} onSave={saveConfig} />
                    )}
                    {activeTab === "Bindings" && (
                      <BindingsTab table={selectedTable} />
                    )}
                    {activeTab === "Usage" && (
                      <UsageTab table={selectedTable} />
                    )}
                  </div>
                </>
              ) : (
                <div className="dm-empty-inline">Select a business object to view and edit its schema.</div>
              )}
            </section>
          </div>
        )}
      </section>

      {showCreateModal ? (
        <CreateObjectModal
          workspaceConfig={workspaceConfig}
          saving={saving}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateObject}
        />
      ) : null}
    </main>
  );
}
