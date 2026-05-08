"use client";

import Link from "next/link";
import { Database } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addTableField,
  addTableRow,
  appendRowsToTable,
  createManualBusinessObject,
  deleteTableRow,
  describeBindingLane,
  describeBindingMode,
  duplicateTableRow,
  exportTableAsCsv,
  importTableFromCsv,
  listWorkspaceDataModelTables,
  replaceTableContent,
  updateTableCell
} from "@/lib/workspace-data-model";

const TABS = ["Fields", "Records", "Bindings", "Usage"];
const LANE_META = {
  manual: { label: "Manual", cls: "dm-badge-manual" },
  "data-source": { label: "Data Source", cls: "dm-badge-datasource" },
  "workspace-integration": { label: "Workspace Tool", cls: "dm-badge-integration" },
  integration: { label: "Integration", cls: "dm-badge-integration" }
};

function pluralize(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function laneMeta(binding) {
  return LANE_META[describeBindingLane(binding)] || LANE_META.manual;
}

function SaveToast({ saving, message }) {
  if (saving) return <span className="dm-toast saving">Saving...</span>;
  if (!message) return null;
  return <span className={`dm-toast ${message.startsWith("Error") ? "error" : "ok"}`}>{message}</span>;
}

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
      <div className="workspace-rail-status"><span className="status-dot" />{authority || "local-catalog"}</div>
    </aside>
  );
}

function ObjectRow({ table, selected, onSelect }) {
  const meta = laneMeta(table.binding);
  return (
    <button type="button" className={`dm-object-row${selected ? " active" : ""}`} onClick={onSelect}>
      <div className="dm-object-row-top">
        <Database className="dm-object-icon" size={13} aria-hidden="true" />
        <strong className="dm-object-name">{table.label}</strong>
        <span className={`dm-badge ${meta.cls}`}>{meta.label}</span>
      </div>
      <div className="dm-object-row-meta">
        <span>{pluralize(table.rows.length, "record")}</span>
        <span>{pluralize(table.columns.length, "field")}</span>
        <span>{pluralize(table.widgetRefs.length, "widget")}</span>
      </div>
    </button>
  );
}

function FieldsTab({ table, saving, onSave }) {
  const [fieldName, setFieldName] = useState("");
  const [error, setError] = useState("");

  function addField() {
    const name = fieldName.trim();
    if (!name) return;
    if (table.columns.includes(name)) {
      setError(`${name} already exists.`);
      return;
    }
    setError("");
    setFieldName("");
    onSave((config) => addTableField(config, table, name));
  }

  return (
    <div>
      <div className="dm-tab-toolbar">
        <p className="dm-tab-stat">{pluralize(table.columns.length, "field")}</p>
        <div className="dm-inline-add">
          <input className="dm-input" value={fieldName} disabled={!table.mutable} placeholder="New field" onChange={(event) => setFieldName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addField(); }} />
          <button type="button" className="dm-btn primary" disabled={saving || !table.mutable || !fieldName.trim()} onClick={addField}>+ Add field</button>
        </div>
      </div>
      {error ? <p className="dm-field-error">{error}</p> : null}
      {!table.mutable ? <p className="dm-hint-block">This object is an integration reference. Select and configure its source object in the existing View widget source controls.</p> : null}
      <div className="dm-field-list">
        {table.columns.map((column) => <div key={column} className="dm-field-item"><span className="dm-field-icon">::</span><strong>{column}</strong></div>)}
      </div>
    </div>
  );
}

function RecordsTab({ table, saving, onSave }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [mode, setMode] = useState("append");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [editing]);

  function commit() {
    if (!editing) return;
    onSave((config) => updateTableCell(config, table, editing.row, editing.column, draft));
    setEditing(null);
  }

  function importCsv() {
    const parsed = importTableFromCsv(csvText);
    if (!parsed.columns.length) return;
    if (mode === "replace") onSave((config) => replaceTableContent(config, table, parsed));
    else onSave((config) => appendRowsToTable(config, table, parsed.rows));
    setCsvText("");
    setCsvOpen(false);
  }

  return (
    <div>
      <div className="dm-tab-toolbar">
        <p className="dm-tab-stat">{pluralize(table.rows.length, "record")}</p>
        <div className="dm-tab-toolbar-actions">
          <button type="button" className="dm-btn" disabled={!table.rows.length} onClick={() => {
            const blob = new Blob([exportTableAsCsv(table)], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${table.source.replace(/\s+/g, "-").toLowerCase()}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}>Export CSV</button>
          <button type="button" className="dm-btn" disabled={!table.mutable} onClick={() => setCsvOpen((open) => !open)}>Import CSV</button>
          <button type="button" className="dm-btn primary" disabled={saving || !table.mutable || !table.columns.length} onClick={() => onSave((config) => addTableRow(config, table))}>+ Add row</button>
        </div>
      </div>
      {!table.mutable ? <p className="dm-hint-block">Dynamic integration records are resolved by the governed integration path. The selected source object reference is shown here but provider rows are not stored in browser config.</p> : null}
      {csvOpen ? (
        <div className="dm-csv-panel">
          <textarea className="dm-csv-textarea" rows={5} value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder="Name,Status&#10;Acme,Active" />
          <div className="dm-csv-options">
            <label><input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /> Append</label>
            <label><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace</label>
            <button type="button" className="dm-btn primary" disabled={!csvText.trim()} onClick={importCsv}>Import</button>
          </div>
        </div>
      ) : null}
      {!table.columns.length ? <div className="dm-empty-inline">No fields are defined for this object.</div> : (
        <div className="dm-records-scroll">
          <table className="dm-records-table">
            <thead><tr><th>#</th>{table.columns.map((column) => <th key={column}>{column}</th>)}<th /></tr></thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td>{rowIndex + 1}</td>
                  {table.columns.map((column) => {
                    const active = editing?.row === rowIndex && editing?.column === column;
                    const value = String(row?.[column] ?? "");
                    return <td key={column}>{active ? <input ref={inputRef} className="dm-cell-input" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") commit(); if (event.key === "Escape") setEditing(null); }} /> : <button type="button" className="dm-cell-btn" disabled={!table.mutable} onClick={() => { setEditing({ row: rowIndex, column }); setDraft(value); }}>{value || <span className="dm-cell-empty">-</span>}</button>}</td>;
                  })}
                  <td>
                    <button type="button" className="dm-icon-btn" disabled={saving || !table.mutable} onClick={() => onSave((config) => duplicateTableRow(config, table, rowIndex))}>⎘</button>
                    <button type="button" className="dm-icon-btn danger" disabled={saving || !table.mutable} onClick={() => onSave((config) => deleteTableRow(config, table, rowIndex))}>x</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BindingsTab({ table }) {
  const binding = table.binding || {};
  const mode = describeBindingMode(binding);
  const meta = laneMeta(binding);
  return (
    <div>
      <div className="dm-binding-header"><span className={`dm-badge ${meta.cls}`}>{mode.label}</span><p>{mode.description}</p></div>
      <div className="dm-binding-rows">
        <div className="dm-binding-row"><span>Source</span><code>{table.source}</code></div>
        <div className="dm-binding-row"><span>Config surface</span><code>{table.storage === "view" ? "view.config" : "widget.config.binding"}</code></div>
        <div className="dm-binding-row"><span>Mode</span><code>{binding.mode || "manual"}</code></div>
        {binding.integrationId ? <div className="dm-binding-row"><span>Integration</span><code>{binding.integrationId}</code></div> : null}
        {binding.entityId ? <div className="dm-binding-row"><span>Entity ID</span><code>{binding.entityId}</code></div> : null}
        {binding.entityLabel ? <div className="dm-binding-row"><span>Entity label</span><code>{binding.entityLabel}</code></div> : null}
      </div>
    </div>
  );
}

function UsageTab({ table }) {
  if (!table.widgetRefs.length) return <div className="dm-empty-inline">Manual data object. It is available to the Data Model and can be selected by existing View widget source controls without being auto-added to a dashboard.</div>;
  return <div className="dm-usage-list">{table.widgetRefs.map((ref) => <div key={ref.widgetId} className="dm-usage-item"><strong>{ref.widgetTitle}</strong><span>{ref.widgetKind}</span><code>{ref.dashboardName || "Canvas"}</code></div>)}</div>;
}

function Summary({ tables }) {
  return (
    <div className="dm-summary-cards">
      <div className="dm-summary-card"><span>Objects</span><strong>{tables.length}</strong></div>
      <div className="dm-summary-card"><span>Fields</span><strong>{tables.reduce((sum, table) => sum + table.columns.length, 0)}</strong></div>
      <div className="dm-summary-card"><span>Records</span><strong>{tables.reduce((sum, table) => sum + table.rows.length, 0)}</strong></div>
      <div className="dm-summary-card"><span>Integrations</span><strong>{tables.filter((table) => describeBindingLane(table.binding) !== "manual").length}</strong></div>
    </div>
  );
}

function AddObjectDialog({ open, saving, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [fields, setFields] = useState("Name");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setFields("Name");
    setError("");
  }, [open]);

  if (!open) return null;

  function submit(event) {
    event.preventDefault();
    const objectName = name.trim();
    const fieldList = fields.split(",").map((field) => field.trim()).filter(Boolean);
    if (!objectName) {
      setError("Object name is required.");
      return;
    }
    if (!fieldList.length) {
      setError("Add at least one field.");
      return;
    }
    setError("");
    onCreate({ name: objectName, fields: fieldList });
  }

  return (
    <div className="dm-dialog-shell" role="dialog" aria-modal="true" aria-labelledby="dm-add-object-title">
      <div className="dm-dialog-backdrop" onClick={onClose} />
      <form className="dm-dialog" onSubmit={submit}>
        <div className="dm-dialog-head">
          <h2 id="dm-add-object-title">Add business object</h2>
          <button type="button" className="dm-icon-btn" onClick={onClose}>x</button>
        </div>
        <div className="dm-dialog-body">
          <p className="dm-dialog-copy">Creates a manual governed data object. This does not add a widget, change a dashboard, or write to canvas.</p>
          <label className="dm-field-label">Object name<input className="dm-input" value={name} placeholder="Companies, Clients, Leads" onChange={(event) => setName(event.target.value)} /></label>
          <label className="dm-field-label">Fields <span>comma-separated</span><input className="dm-input" value={fields} placeholder="Name, Status, Owner" onChange={(event) => setFields(event.target.value)} /></label>
          {error ? <p className="dm-field-error">{error}</p> : null}
        </div>
        <div className="dm-dialog-actions">
          <button type="button" className="dm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="dm-btn primary" disabled={saving}>Create object</button>
        </div>
      </form>
    </div>
  );
}

export default function DataModelPage() {
  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [authority, setAuthority] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [activeTab, setActiveTab] = useState("Fields");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load workspace");
      setWorkspaceConfig(payload.workspaceConfig);
      setAuthority(payload.adapters?.integrations?.authority || null);
    } catch (err) {
      setError(err.message || "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tables = useMemo(() => workspaceConfig ? listWorkspaceDataModelTables(workspaceConfig) : [], [workspaceConfig]);
  const selectedTable = tables.find((table) => table.source === selectedSource) || tables[0] || null;
  useEffect(() => { if (!selectedSource && tables[0]) setSelectedSource(tables[0].source); }, [selectedSource, tables]);

  const save = useCallback(async (mutate) => {
    if (!workspaceConfig) return;
    setSaving(true);
    setMessage("");
    const next = mutate(workspaceConfig);
    try {
      const patch = {};
      for (const key of ["dashboards", "widgetTypes", "canvas", "dataModel"]) {
        if (next[key] !== workspaceConfig[key]) patch[key] = next[key];
      }
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Save failed");
      setWorkspaceConfig(payload.workspaceConfig);
      setMessage("Saved");
    } catch (err) {
      setMessage(`Error: ${err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  }, [workspaceConfig]);

  const createObject = useCallback(({ name, fields }) => {
    save((config) => createManualBusinessObject(config, { name, fields }));
    setSelectedSource(name);
    setActiveTab("Records");
    setAddOpen(false);
  }, [save]);

  return (
    <main className="workspace-builder workspace-settings-page">
      <NavRail authority={authority} />
      <section className="workspace-surface">
        <header className="workspace-toolbar">
          <div><p>Workspace</p><h1>Data Model</h1></div>
          <div className="workspace-toolbar-actions"><SaveToast saving={saving} message={message} /><button type="button" className="dm-btn primary" onClick={() => setAddOpen(true)}>+ Add object</button></div>
        </header>
        <AddObjectDialog open={addOpen} saving={saving} onClose={() => setAddOpen(false)} onCreate={createObject} />
        {loading ? <div className="dm-loading">Loading workspace...</div> : null}
        {error ? <div className="dm-error-state"><strong>Could not load workspace</strong><p>{error}</p><button type="button" className="dm-btn primary" onClick={load}>Retry</button></div> : null}
        {!loading && !error && tables.length ? (
          <>
            <Summary tables={tables} />
            <div className="dm-layout">
              <aside className="dm-object-list">
                <div className="dm-object-list-head"><p>{pluralize(tables.length, "object")}</p></div>
                <div className="dm-object-list-body">{tables.map((table) => <ObjectRow key={`${table.source}-${table.id}`} table={table} selected={selectedTable?.id === table.id} onSelect={() => { setSelectedSource(table.source); setActiveTab("Fields"); }} />)}</div>
              </aside>
              <section className="dm-detail-panel">
                <div className="dm-detail-header">
                  <div className="dm-detail-title-row"><Database size={15} /><h2>{selectedTable.label}</h2><span className={`dm-badge ${laneMeta(selectedTable.binding).cls}`}>{laneMeta(selectedTable.binding).label}</span></div>
                  <div className="dm-detail-meta-row"><code>{selectedTable.source}</code><span>{pluralize(selectedTable.columns.length, "field")} · {pluralize(selectedTable.rows.length, "record")} · {pluralize(selectedTable.widgetRefs.length, "widget")}</span></div>
                </div>
                <div className="dm-tabs">{TABS.map((tab) => <button key={tab} type="button" className={`dm-tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
                <div className="dm-tab-content">
                  {activeTab === "Fields" ? <FieldsTab table={selectedTable} saving={saving} onSave={save} /> : null}
                  {activeTab === "Records" ? <RecordsTab table={selectedTable} saving={saving} onSave={save} /> : null}
                  {activeTab === "Bindings" ? <BindingsTab table={selectedTable} /> : null}
                  {activeTab === "Usage" ? <UsageTab table={selectedTable} /> : null}
                </div>
              </section>
            </div>
          </>
        ) : null}
        {!loading && !error && !tables.length ? <div className="dm-page-empty"><Database size={28} /><strong>No business objects yet</strong><p>Create a manual governed object here, or expose existing View widget data when dashboards already define it.</p><button type="button" className="dm-btn primary" onClick={() => setAddOpen(true)}>+ Add object</button></div> : null}
      </section>
    </main>
  );
}
