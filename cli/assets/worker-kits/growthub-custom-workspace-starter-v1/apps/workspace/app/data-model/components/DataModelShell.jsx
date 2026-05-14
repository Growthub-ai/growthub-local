"use client";

import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowRight,
  BarChart2,
  Box,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Code2,
  Database,
  EyeOff,
  FileText,
  Filter,
  Globe,
  GripVertical,
  Hash,
  Layers,
  Link2,
  Lock,
  List,
  Mail,
  Maximize2,
  MoreHorizontal,
  Plus,
  Pin,
  Pencil,
  Search,
  ShoppingCart,
  Tag,
  Terminal,
  ToggleLeft,
  Type,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OBJECT_TYPE_PRESETS,
  addTableField,
  addTableRow,
  appendRowsToTable,
  createTypedBusinessObject,
  describeBindingLane,
  effectiveRelations,
  exportTableAsCsv,
  importTableFromCsv,
  listSavedEnvRefs,
  listWorkspaceDataModelTables,
  parseSandboxAllowList,
  parseSandboxEnvRefs,
  replaceTableContent,
  snapshotTableViewState,
  transformTableSchema,
  updateTableFieldSettings,
  updateTableCell,
} from "@/lib/workspace-data-model";
import { ReferencePicker } from "./ReferencePicker.jsx";
import { SandboxRunPanel } from "./SandboxRunPanel.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { SegmentedToggle, ToggleField } from "./ToggleField.jsx";
import { SourceTestPanel } from "./SourceTestPanel.jsx";
import {
  FIELD_TYPE_ICON_NAMES,
  ICON_PICKER_SET,
  LucideIcon,
  inferFieldType,
  objectTypeBadge,
  pluralize,
  textColorForAccent,
} from "./dm-shared.jsx";

// ─── Object type definitions for the type-picker step ────────────────────────

const OBJECT_TYPE_DEFS = [
  {
    type: "data-source",
    icon: Globe,
    label: "Data Source",
    description: "Custom API, webhook, or external feed. Linked to a resolver via API Registry.",
  },
  {
    type: "api-registry",
    icon: Code2,
    label: "API Registry",
    description: "Resolver adapters — integrationId + fetch functions that power Data Sources.",
  },
  {
    type: "people",
    icon: Users,
    label: "People",
    description: "Contacts, leads, or team members with standard CRM fields.",
  },
  {
    type: "tasks",
    icon: CheckSquare,
    label: "Tasks",
    description: "Action items, to-dos, and work tracking.",
  },
  {
    type: "sandbox-environment",
    icon: Terminal,
    label: "Sandbox Environment",
    description: "Localized py/node/bash terminal sandbox or local agent host (Claude / Codex / Cursor / Gemini / Hermes). Server-side execution with versioned run history. Cannot bind directly to a widget.",
  },
  {
    type: "custom",
    icon: Plus,
    label: "Custom",
    description: "Blank table — define your own fields from scratch.",
  },
];

// ─── Lane / badge meta (objectTypeBadge from dm-shared) ────────────────────────

const SANDBOX_RUNTIME_OPTIONS = ["python", "node", "bash"];
const FIELD_TYPE_CHOICES = [
  { value: "text", label: "Text", icon: "Type", sample: "Field name" },
  { value: "number", label: "Number", icon: "Hash", sample: "Amount" },
  { value: "date", label: "Date", icon: "Calendar", sample: "Created at" },
  { value: "url", label: "URL", icon: "Link2", sample: "Website" },
  { value: "select", label: "Select", icon: "List", sample: "Status" },
  { value: "boolean", label: "Boolean", icon: "ToggleLeft", sample: "Active" },
];
const FILTER_OPERATOR_OPTIONS = [
  { value: "eq", label: "Is" },
  { value: "ne", label: "Is not" },
  { value: "contains", label: "Contains" },
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
  { value: "isEmpty", label: "Is empty" },
  { value: "isNotEmpty", label: "Is not empty" },
];

function mergeColumnOrder(order, columns) {
  return Array.from(new Set([...(order || []), ...columns])).filter((column) => columns.includes(column));
}

function isLockedObject(table) {
  return Boolean(table?.objectType && table.objectType !== "custom");
}

function compareCellValues(left, right) {
  const a = left ?? "";
  const b = right ?? "";
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && `${a}`.trim() !== "" && `${b}`.trim() !== "") {
    return aNum - bNum;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function rowMatchesFilter(row, filter) {
  if (!filter?.clauses?.length) return true;
  const results = filter.clauses.map((clause) => {
    const raw = row?.[clause.fieldId];
    const value = raw ?? "";
    const text = String(value).toLowerCase();
    const needle = String(clause.value ?? "").toLowerCase();
    switch (clause.operator) {
      case "ne": return text !== needle;
      case "contains": return text.includes(needle);
      case "gt": return compareCellValues(value, clause.value) > 0;
      case "lt": return compareCellValues(value, clause.value) < 0;
      case "isEmpty": return value === null || value === undefined || value === "";
      case "isNotEmpty": return !(value === null || value === undefined || value === "");
      case "eq":
      default:
        return text === needle;
    }
  });
  return filter.op === "or" ? results.some(Boolean) : results.every(Boolean);
}

function applyRowsView(rows, settings) {
  const filtered = (rows || []).filter((row) => rowMatchesFilter(row, settings.filter));
  if (!settings.sort?.length) return filtered;
  const clauses = settings.sort;
  return [...filtered].sort((left, right) => {
    for (const clause of clauses) {
      const direction = clause.direction === "desc" ? -1 : 1;
      const diff = compareCellValues(left?.[clause.fieldId], right?.[clause.fieldId]);
      if (diff !== 0) return diff * direction;
    }
    return 0;
  });
}

function ObjectViewPicker({ tables, selectedTable, saving, onSelectSource, onSave }) {
  const pickerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("all");
  const [newViewName, setNewViewName] = useState("");
  const [viewMenuId, setViewMenuId] = useState("");
  const currentViews = selectedTable?.fieldSettings?.views || [];
  const favoriteObjects = tables.filter((table) => table.fieldSettings?.favorite);

  useEffect(() => {
    function handlePointer(event) {
      if (!pickerRef.current?.contains(event.target)) {
        setViewMenuId("");
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, []);

  function applyView(view) {
    if (!selectedTable) return;
    const nextState = view
      ? { ...snapshotTableViewState(view), activeViewId: view.id }
      : { activeViewId: "", hidden: [], order: selectedTable.columns, sort: [], filter: null };
    onSave((config) => updateTableFieldSettings(config, selectedTable, (settings) => ({
      ...settings,
      ...nextState
    })));
    setOpen(false);
  }

  function createView() {
    const name = newViewName.trim();
    if (!selectedTable || !name) return;
    const viewId = `view_${Date.now().toString(36)}`;
    onSave((config) => updateTableFieldSettings(config, selectedTable, (settings) => ({
      ...settings,
      activeViewId: viewId,
      views: [...(settings.views || []), {
        id: viewId,
        name,
        favorite: false,
        locked: false,
        ...snapshotTableViewState(settings)
      }]
    })));
    setNewViewName("");
  }

  function toggleViewFavorite(viewId) {
    if (!selectedTable) return;
    onSave((config) => updateTableFieldSettings(config, selectedTable, (settings) => ({
      ...settings,
      views: (settings.views || []).map((view) => view.id === viewId ? { ...view, favorite: !view.favorite } : view)
    })));
  }

  function deleteView(viewId) {
    if (!selectedTable) return;
    onSave((config) => updateTableFieldSettings(config, selectedTable, (settings) => ({
      ...settings,
      activeViewId: settings.activeViewId === viewId ? "" : settings.activeViewId,
      views: (settings.views || []).filter((view) => view.id !== viewId)
    })));
    setViewMenuId("");
  }

  function renameView(view) {
    if (!selectedTable) return;
    const nextName = window.prompt("Rename view", view.name);
    if (!nextName?.trim()) return;
    onSave((config) => updateTableFieldSettings(config, selectedTable, (settings) => ({
      ...settings,
      views: (settings.views || []).map((candidate) => candidate.id === view.id ? { ...candidate, name: nextName.trim() } : candidate)
    })));
    setViewMenuId("");
  }

  const activeView = currentViews.find((view) => view.id === selectedTable?.fieldSettings?.activeViewId) || null;
  const objects = mode === "views" ? [] : tables;
  const views = mode === "objects" ? [] : currentViews;

  return (
    <div
      ref={pickerRef}
      className={`dm-picker${open ? " open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setViewMenuId("");
        }
      }}
    >
      <button type="button" className="dm-picker-trigger" onClick={() => setOpen((current) => !current)}>
        <LucideIcon name={selectedTable?.icon || OBJECT_TYPE_PRESETS[selectedTable?.objectType]?.icon || "Database"} size={14} />
        <span className="dm-picker-trigger-copy">
          <strong>{activeView?.name || selectedTable?.label || "Object"}</strong>
          <em>{pluralize(selectedTable?.columns?.length || 0, "field")} · {pluralize(selectedTable?.rows?.length || 0, "record")}</em>
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dm-picker-popover">
          {favoriteObjects.length > 0 && (
            <div className="dm-picker-section">
              <p>Favorites</p>
              {favoriteObjects.map((table) => (
                <button key={`favorite-${table.source}`} type="button" className="dm-picker-row" onClick={() => onSelectSource(table.source)}>
                  <Pin size={14} />
                  <span>{table.label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="dm-picker-tabs">
            {["all", "objects", "views"].map((item) => (
              <button key={item} type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
                {item}
              </button>
            ))}
          </div>
          {objects.length > 0 && (
            <div className="dm-picker-section">
              <p>Objects</p>
              <div className="dm-picker-scroll">
                {objects.map((table) => (
                  <div key={table.source} className={`dm-picker-item${selectedTable?.source === table.source ? " active" : ""}`}>
                    <button type="button" className="dm-picker-row" onClick={() => {
                      onSelectSource(table.source);
                      setOpen(false);
                    }}>
                      <LucideIcon name={table.icon || OBJECT_TYPE_PRESETS[table.objectType]?.icon || "Database"} size={14} />
                      <span>{table.label}</span>
                      {isLockedObject(table) && <Lock size={12} className="dm-picker-lock" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedTable && (
            <div className="dm-picker-section">
              <p>Views</p>
              <button type="button" className={`dm-picker-row${!activeView ? " active" : ""}`} onClick={() => applyView(null)}>
                <List size={14} />
                <span>{selectedTable.label}</span>
                {isLockedObject(selectedTable) && <Lock size={12} className="dm-picker-lock" />}
              </button>
              <div className="dm-picker-scroll">
                {views.map((view) => (
                  <div key={view.id} className={`dm-picker-item${activeView?.id === view.id ? " active" : ""}`}>
                    <button type="button" className="dm-picker-row" onClick={() => applyView(view)}>
                      <List size={14} />
                      <span>{view.name}</span>
                    </button>
                    <div className="dm-picker-actions">
                      <button
                        type="button"
                        className="dm-picker-icon-btn"
                        aria-label="View actions"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewMenuId((current) => current === view.id ? "" : view.id);
                        }}
                      >
                        <MoreHorizontal size={12} style={{ transform: "rotate(90deg)" }} />
                      </button>
                      {viewMenuId === view.id && (
                        <div className="dm-picker-menu">
                          <button type="button" onClick={() => toggleViewFavorite(view.id)}>
                            <Pin size={13} />
                            {view.favorite ? "Unpin" : "Pin"}
                          </button>
                          <button type="button" onClick={() => renameView(view)}>
                            <Type size={13} />
                            Rename
                          </button>
                          {!view.locked && (
                            <button type="button" className="danger" onClick={() => deleteView(view.id)}>
                              <X size={13} />
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="dm-picker-create">
                <input
                  value={newViewName}
                  placeholder="New view name"
                  onChange={(event) => setNewViewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createView();
                  }}
                />
                <button type="button" className="dm-btn-outline" disabled={saving || !newViewName.trim()} onClick={createView}>
                  <Plus size={13} />Add view
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function SaveToast({ saving, message }) {
  if (saving) return <span className="dm-toast saving">Saving…</span>;
  if (!message) return null;
  return <span className={`dm-toast ${message.startsWith("Error") ? "error" : "ok"}`}>{message}</span>;
}

function NavRail({ authority, workspaceConfig }) {
  const branding = workspaceConfig?.branding || {};
  const workspaceName = branding.name || workspaceConfig?.name || "Growthub Workspace";
  return (
    <aside className="workspace-rail" aria-label="Workspace navigation">
      <div className="workspace-brand">
        <span
          className="workspace-mark"
          style={{
            background: branding.logoUrl ? undefined : branding.accent || undefined,
            color: branding.logoUrl ? undefined : textColorForAccent(branding.accent),
          }}
        >
          {branding.logoUrl ? <img src={branding.logoUrl} alt="" /> : workspaceName.slice(0, 1).toUpperCase()}
        </span>
        <span>{workspaceName}</span>
      </div>
      <nav className="workspace-nav">
        <Link href="/">Dashboards</Link>
        <Link className="active" href="/data-model">Data Model</Link>
        <span className="workspace-nav-static">Management</span>
        <Link className="workspace-nav-bottom" href="/settings/general">Workspace Settings</Link>
      </nav>
      <div className="workspace-rail-status">
        <span className="status-dot" />
        {authority || "local-catalog"}
      </div>
    </aside>
  );
}

// ─── Object list (sidebar lives in ./ObjectSidebar.jsx) ───────────────────────

function SourceValidationBanner({ table }) {
  const lane = describeBindingLane(table?.binding);
  if (!table || lane === "manual") return null;
  const hasRef = table.binding?.integrationId || table.binding?.sourceKey || table.binding?.entityId;
  if (hasRef) return null;
  return (
    <div className="dm-validation-banner">
      <AlertCircle size={13} />
      <span>Source binding incomplete — configure the source in widget source controls before data loads.</span>
    </div>
  );
}

// ─── Database surface ─────────────────────────────────────────────────────────

function formatCellValue(value, column) {
  if (value === null || value === undefined || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (column === "lastResponse" && text.length > 90) return `${text.slice(0, 90)}…`;
  return text;
}

function relationForColumn(table, column) {
  if (!table) return null;
  return effectiveRelations(table).find((relation) => relation.field === column) || null;
}

function referenceOptions(tables, relation) {
  if (!relation) return [];
  return (tables || [])
    .filter((candidate) => candidate.objectType === relation.targetObjectType)
    .flatMap((candidate) => (candidate.rows || []).map((row, index) => {
      const value = row?.integrationId || row?.id || row?.Name || `${candidate.objectId}:${index}`;
      const label = row?.Name || row?.integrationId || row?.description || `${candidate.label} row ${index + 1}`;
      return { value, label, source: candidate.label };
    }));
}

function RelationPickerOrSelect({ table, tables, column, value, disabled, onChange }) {
  const relation = relationForColumn(table, column);
  if (!relation) return null;
  if (table.objectId) {
    return (
      <ReferencePicker
        objectId={table.objectId}
        field={column}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }
  const options = referenceOptions(tables, relation);
  return (
    <ReferenceSelect value={value} options={options} disabled={disabled} onChange={onChange} />
  );
}

function ReferenceSelect({ value, options, disabled, onChange }) {
  const normalizedOptions = useMemo(() => options.map((option) => ({
    value: String(option.value ?? ""),
    label: String(option.label ?? option.value ?? ""),
    source: option.source ? String(option.source) : ""
  })), [options]);
  return (
    <SearchableSelect
      value={value || ""}
      options={normalizedOptions}
      disabled={disabled}
      placeholder="Select reference..."
      onChange={onChange}
    />
  );
}

function SearchableSelect({ value, options, disabled, placeholder = "Select...", onChange, pageSize = 8 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const selected = options.find((option) => option.value === String(value || ""));
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.value} ${option.source}`.toLowerCase().includes(needle));
  }, [options, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleOptions = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [query, options.length]);

  return (
    <div
      className={`dm-select${open ? " open" : ""}${disabled ? " disabled" : ""}`}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="dm-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "empty"}>{selected?.label || placeholder}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="dm-select-popover">
          <label className="dm-select-search">
            <Search size={14} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              placeholder="Search..."
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="dm-select-list" role="listbox">
            <button
              type="button"
              className={`dm-select-option${!value ? " selected" : ""}`}
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <span>{placeholder}</span>
            </button>
            {visibleOptions.map((option) => (
              <button
                type="button"
                key={`${option.source}:${option.value}`}
                className={`dm-select-option${option.value === String(value || "") ? " selected" : ""}`}
                role="option"
                aria-selected={option.value === String(value || "")}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>{option.label}</span>
                {option.source && <em>{option.source}</em>}
              </button>
            ))}
            {visibleOptions.length === 0 && <p className="dm-select-empty">No matches</p>}
          </div>
          {filtered.length > pageSize && (
            <div className="dm-select-pager">
              <button type="button" disabled={currentPage === 0} onClick={() => setPage((next) => Math.max(0, next - 1))}>Prev</button>
              <span>{currentPage + 1} / {pageCount}</span>
              <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage((next) => Math.min(pageCount - 1, next + 1))}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StaticSelect({ value, options, disabled, onChange, placeholder = "Select..." }) {
  const normalizedOptions = useMemo(() => options.map((option) => (
    typeof option === "string" ? { value: option, label: option } : option
  )), [options]);
  return (
    <SearchableSelect
      value={value || ""}
      options={normalizedOptions}
      disabled={disabled}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}

function DrawerSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`dm-drawer-section${open ? " open" : ""}`}>
      <button type="button" className="dm-drawer-section-toggle" onClick={() => setOpen((current) => !current)}>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{title}</span>
      </button>
      {open && <div className="dm-drawer-section-body">{children}</div>}
    </section>
  );
}

const GENERIC_FIELD_SECTIONS = [
  {
    title: "Identity",
    columns: new Set(["Name", "name", "id", "integrationId", "registryId", "authRef"])
  },
  {
    title: "Connection",
    columns: new Set(["baseUrl", "endpoint", "method", "schedulerRegistryId"])
  },
  {
    title: "Status & Response",
    columns: new Set(["status", "lastTested", "lastRunId", "lastSourceId", "lastResponse"])
  }
];

function groupRecordColumns(columns) {
  const groups = GENERIC_FIELD_SECTIONS.map((section) => ({
    title: section.title,
    columns: columns.filter((column) => section.columns.has(column))
  })).filter((section) => section.columns.length > 0);
  const grouped = new Set(groups.flatMap((section) => section.columns));
  const otherColumns = columns.filter((column) => !grouped.has(column));
  if (otherColumns.length) groups.push({ title: "Details", columns: otherColumns });
  return groups;
}

function RecordFieldEditor({ table, tables, column, value, saving, editable, onDraft, onCommit, onExpandJson }) {
  const relation = relationForColumn(table, column);
  const large = column === "lastResponse" || String(value ?? "").length > 120;
  if (relation) {
    return (
      <label className="dm-record-field">
        <span>{column}</span>
        <RelationPickerOrSelect
          table={table}
          tables={tables}
          column={column}
          value={value}
          disabled={!table.mutable || saving}
          onChange={(nextValue) => onCommit(column, nextValue)}
        />
      </label>
    );
  }
  if (column === "lastResponse") {
    return (
      <label className="dm-record-field dm-json-field">
        <span>{column}</span>
        <button
          type="button"
          className="dm-json-expand"
          aria-label="Expand lastResponse JSON"
          title="Expand JSON"
          disabled={!value}
          onClick={onExpandJson}
        >
          <Maximize2 size={14} aria-hidden="true" />
        </button>
        <textarea
          value={value}
          rows={10}
          readOnly={!editable}
          onChange={(event) => onDraft(column, event.target.value)}
        />
      </label>
    );
  }
  return (
    <label className="dm-record-field">
      <span>{column}</span>
      {large ? (
        <textarea
          value={value}
          rows={4}
          readOnly={!editable}
          onChange={(event) => onDraft(column, event.target.value)}
        />
      ) : (
        <input
          value={value}
          readOnly={!editable}
          onChange={(event) => onDraft(column, event.target.value)}
        />
      )}
    </label>
  );
}

function SandboxRecordFields({
  draft,
  setDraft,
  table,
  tables,
  workspaceConfig,
  saving,
  onSave,
  rowIndex,
  sandboxHistory,
  sandboxHistoryMessage,
  loadingSandboxHistory,
  onLoadSandboxHistory,
  onExpandLastResponse
}) {
  const [sandboxAdapters, setSandboxAdapters] = useState([]);
  useEffect(() => {
    fetch("/api/workspace/sandbox-adapters", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => setSandboxAdapters(Array.isArray(payload.adapters) ? payload.adapters : []))
      .catch(() => setSandboxAdapters([]));
  }, []);

  const locality = String(draft.runLocality || "local").trim().toLowerCase() === "serverless" ? "serverless" : "local";
  const savedEnvRefs = useMemo(() => listSavedEnvRefs(workspaceConfig || {}), [workspaceConfig]);
  const selectedEnvSlugs = useMemo(() => new Set(parseSandboxEnvRefs(draft.envRefs)), [draft.envRefs]);
  const selectedAdapterMeta = sandboxAdapters.find((a) => a.id === String(draft.adapter || "").trim());

  function patchFields(fields) {
    setDraft((c) => ({ ...c, ...fields }));
    onSave((cfg) => Object.entries(fields).reduce(
      (acc, [column, value]) => updateTableCell(acc, table, rowIndex, column, value),
      cfg
    ));
  }

  function setRunLocality(next) {
    const fields = { runLocality: next };
    if (next === "serverless" && ["local-agent-host", "local-intelligence"].includes(String(draft.adapter || "").trim())) {
      fields.adapter = "local-process";
    }
    patchFields(fields);
  }

  function toggleEnvRef(slug) {
    const next = new Set(selectedEnvSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    patchFields({ envRefs: [...next].join(",") });
  }

  const netOn = ["true", "1", "on", "yes"].includes(String(draft.networkAllow || "").trim().toLowerCase());

  return (
    <div className="dm-sandbox-config">
      <DrawerSection title="Identity & Mode">
        <label className="dm-record-field">
          <span>Name</span>
          <input
            value={draft.Name ?? ""}
            disabled={!table.mutable || saving}
            onChange={(event) => setDraft((c) => ({ ...c, Name: event.target.value }))}
            onBlur={(event) => patchFields({ Name: event.target.value })}
          />
        </label>

        <label className="dm-record-field">
          <span>Status mode</span>
          <StaticSelect
            value={String(draft.lifecycleStatus || "draft").trim().toLowerCase() === "live" ? "live" : "draft"}
            disabled={!table.mutable || saving}
            options={["draft", "live"]}
            onChange={(nextValue) => patchFields({ lifecycleStatus: nextValue })}
          />
        </label>

        <label className="dm-record-field">
          <span>Version</span>
          <input
            value={draft.version ?? ""}
            disabled={!table.mutable || saving}
            onChange={(event) => setDraft((c) => ({ ...c, version: event.target.value }))}
            onBlur={(event) => patchFields({ version: event.target.value })}
          />
        </label>
      </DrawerSection>

      <DrawerSection title="Execution Target">
        <SegmentedToggle
          name="sandbox-run-locality"
          label="Where it runs"
          value={locality}
          options={["local", "serverless"]}
          disabled={!table.mutable || saving}
          onChange={setRunLocality}
        />
        <p className="dm-cell-empty" style={{ fontSize: 11, marginTop: 6 }}>
          Local uses process sandbox or Paperclip agent host on this machine. Serverless delegates to an API Registry URL (no local agent CLI).
        </p>

        {locality === "serverless" && table.objectId && (
          <label className="dm-record-field">
            <span>Scheduler (API Registry)</span>
            <ReferencePicker
              objectId={table.objectId}
              field="schedulerRegistryId"
              value={draft.schedulerRegistryId || ""}
              disabled={!table.mutable || saving}
              onChange={(nextValue) => patchFields({ schedulerRegistryId: nextValue })}
            />
            <span className="dm-cell-empty" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
              POST sends <code>growthub-sandbox-run-v1</code> JSON; auth from registry <code>authRef</code> (server env only).
            </span>
          </label>
        )}

        {locality === "serverless" && !table.objectId && (
          <p className="dm-field-error">This sandbox table is missing a stable object id — cannot load scheduler list.</p>
        )}

        <label className="dm-record-field">
          <span>Execution adapter</span>
          <StaticSelect
            value={String(draft.adapter || "local-process").trim() || "local-process"}
            disabled={!table.mutable || saving}
            options={sandboxAdapters.length === 0 ? [{ value: "local-process", label: "local-process" }] : sandboxAdapters.map((a) => ({ value: a.id, label: a.label }))}
            onChange={(nextValue) => patchFields({ adapter: nextValue })}
          />
        </label>

        {locality === "local" && String(draft.adapter || "").trim() === "local-agent-host" && (
          <label className="dm-record-field">
            <span>Agent host (Paperclip)</span>
            <StaticSelect
              value={draft.agentHost || ""}
              disabled={!table.mutable || saving}
              placeholder="Select host..."
              options={(selectedAdapterMeta?.hostCatalog || []).map((h) => ({ value: h.slug, label: h.label }))}
              onChange={(nextValue) => patchFields({ agentHost: nextValue })}
            />
          </label>
        )}

        {locality === "local" && String(draft.adapter || "").trim() === "local-intelligence" && (
          <div className="dm-sandbox-local-intel" style={{ display: "grid", gap: 10 }}>
            <label className="dm-record-field">
              <span>Concrete model id</span>
              <input
                value={draft.localModel ?? ""}
                disabled={!table.mutable || saving}
                placeholder="gemma3:4b"
                onChange={(event) => setDraft((c) => ({ ...c, localModel: event.target.value }))}
                onBlur={(event) => patchFields({ localModel: event.target.value })}
              />
              <span className="dm-cell-empty" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
                Open-ended tag aligned with CLI Local Intelligence. Falls back to <code>NATIVE_INTELLIGENCE_LOCAL_MODEL</code> or <code>OLLAMA_MODEL</code>.
              </span>
            </label>

            <label className="dm-record-field">
              <span>Chat completions URL (optional)</span>
              <input
                value={draft.localEndpoint ?? ""}
                disabled={!table.mutable || saving}
                placeholder="http://127.0.0.1:11434/v1/chat/completions"
                onChange={(event) => setDraft((c) => ({ ...c, localEndpoint: event.target.value }))}
                onBlur={(event) => patchFields({ localEndpoint: event.target.value })}
              />
            </label>

            <label className="dm-record-field">
              <span>Resolver mode</span>
              <StaticSelect
                value={String(draft.intelligenceAdapterMode || "ollama").trim().toLowerCase()}
                disabled={!table.mutable || saving}
                options={[
                  { value: "ollama", label: "ollama (OLLAMA_BASE_URL + /v1/chat/completions)" },
                  { value: "lmstudio", label: "lmstudio (LMSTUDIO_BASE_URL)" },
                  { value: "vllm", label: "vllm (VLLM_BASE_URL required)" },
                  { value: "custom-openai-compatible", label: "custom (use Chat completions URL above)" }
                ]}
                onChange={(nextValue) => patchFields({ intelligenceAdapterMode: nextValue })}
              />
            </label>

            <p className="dm-cell-empty" style={{ fontSize: 11, marginTop: 0 }}>
              Uses <strong>Instructions</strong> + <strong>Command</strong> as the task payload. Tool intents in the JSON response are proposals only and are not executed by the workspace.
            </p>
          </div>
        )}

        <label className="dm-record-field">
          <span>Runtime</span>
          <StaticSelect
            value={draft.runtime || "node"}
            disabled={!table.mutable || saving}
            options={SANDBOX_RUNTIME_OPTIONS}
            onChange={(nextValue) => patchFields({ runtime: nextValue })}
          />
        </label>
      </DrawerSection>

      <DrawerSection title="Environment & Network">
        <div className="dm-record-field">
          <span>Env key references</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {savedEnvRefs.length === 0 ? (
              <span className="dm-cell-empty">Add keys under Settings -&gt; APIs &amp; Webhooks.</span>
            ) : savedEnvRefs.map((ref) => (
              <button
                key={ref.endpointRef}
                type="button"
                className={`dm-btn-ghost${selectedEnvSlugs.has(ref.endpointRef) ? " dm-chip-active" : ""}`}
                style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11 }}
                disabled={!table.mutable || saving}
                onClick={() => toggleEnvRef(ref.endpointRef)}
              >
                {ref.endpointRef}
              </button>
            ))}
          </div>
        </div>

        <ToggleField
          checked={netOn}
          disabled={!table.mutable || saving}
          label="Network allow-list mode"
          description="When enabled, local runs honor GROWTHUB_SANDBOX_NET_* and the allow list below."
          onChange={(on) => patchFields({ networkAllow: on ? "true" : "false" })}
        />

        <label className="dm-record-field">
          <span>Allow list (comma-separated hosts)</span>
          <input
            value={draft.allowList ?? ""}
            disabled={!table.mutable || saving}
            onChange={(event) => setDraft((c) => ({ ...c, allowList: event.target.value }))}
            onBlur={(event) => patchFields({ allowList: event.target.value })}
          />
        </label>
      </DrawerSection>

      <DrawerSection title="Prompt & Limits">
        <label className="dm-record-field">
          <span>Instructions</span>
          <textarea
            rows={5}
            value={draft.instructions ?? ""}
            disabled={!table.mutable || saving}
            onChange={(event) => setDraft((c) => ({ ...c, instructions: event.target.value }))}
            onBlur={(event) => patchFields({ instructions: event.target.value })}
          />
        </label>

        <label className="dm-record-field">
          <span>Command / prompt</span>
          <textarea
            rows={6}
            value={draft.command ?? ""}
            disabled={!table.mutable || saving}
            onChange={(event) => setDraft((c) => ({ ...c, command: event.target.value }))}
            onBlur={(event) => patchFields({ command: event.target.value })}
          />
        </label>

        <label className="dm-record-field">
          <span>timeoutMs</span>
          <input
            type="number"
            min={1000}
            max={600000}
            value={draft.timeoutMs ?? ""}
            disabled={!table.mutable || saving}
            onChange={(event) => setDraft((c) => ({ ...c, timeoutMs: event.target.value }))}
            onBlur={(event) => patchFields({ timeoutMs: event.target.value })}
          />
        </label>
      </DrawerSection>

      <DrawerSection title="Response & History">
        <label className="dm-record-field">
          <span>lastRunId</span>
          <input readOnly value={draft.lastRunId ?? ""} />
        </label>

        <label className="dm-record-field">
          <span>lastSourceId</span>
          <input readOnly value={draft.lastSourceId ?? ""} />
        </label>

        <label className="dm-record-field dm-json-field">
          <span>lastResponse</span>
          <button
            type="button"
            className="dm-json-expand"
            aria-label="Expand lastResponse JSON"
            title="Expand JSON"
            disabled={!draft.lastResponse}
            onClick={onExpandLastResponse}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
          <textarea rows={10} readOnly value={draft.lastResponse ?? ""} />
        </label>

        <div className="dm-record-field">
          <span>Run history</span>
          <button type="button" className="dm-btn-ghost" disabled={loadingSandboxHistory} onClick={onLoadSandboxHistory}>
            {loadingSandboxHistory ? "Loading..." : "Load previous runs"}
          </button>
          {sandboxHistoryMessage && <span className="dm-cell-empty">{sandboxHistoryMessage}</span>}
          {Array.isArray(sandboxHistory) && sandboxHistory.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {sandboxHistory.slice(0, 8).map((record) => (
                <pre key={record.runId || record.ranAt} className="dm-source-preview" style={{ margin: 0, maxHeight: 160, overflow: "auto" }}>
                  {JSON.stringify({
                    runId: record.runId,
                    ranAt: record.ranAt,
                    lifecycleStatus: record.lifecycleStatus,
                    version: record.version,
                    status: record.exitCode === 0 && !record.error ? "connected" : "failed",
                    stdout: record.stdout,
                    error: record.error
                  }, null, 2)}
                </pre>
              ))}
            </div>
          )}
        </div>
      </DrawerSection>
    </div>
  );
}

function DataModelRecordDrawer({ table, tables, workspaceConfig, rowIndex, row, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(row || {});
  const [editMode, setEditMode] = useState(false);
  const [pendingColumns, setPendingColumns] = useState(table.columns || []);
  const [pendingHidden, setPendingHidden] = useState(table.fieldSettings?.hidden || []);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxMessage, setSandboxMessage] = useState("");
  const [sandboxHistory, setSandboxHistory] = useState([]);
  const [sandboxHistoryMessage, setSandboxHistoryMessage] = useState("");
  const [loadingSandboxHistory, setLoadingSandboxHistory] = useState(false);
  const [expandedJson, setExpandedJson] = useState(null);

  useEffect(() => {
    setDraft(row || {});
    setEditMode(false);
    setPendingColumns(table.columns || []);
    setPendingHidden(table.fieldSettings?.hidden || []);
    setTestMessage("");
    setSandboxMessage("");
    setSandboxHistory([]);
    setSandboxHistoryMessage("");
    setExpandedJson(null);
  }, [row, rowIndex]);

  if (rowIndex === null || rowIndex === undefined || !row) return null;

  const isSandbox = table.objectType === "sandbox-environment";
  const isDirty = JSON.stringify(draft || {}) !== JSON.stringify(row || {}) || JSON.stringify(pendingColumns) !== JSON.stringify(table.columns || []) || JSON.stringify(pendingHidden) !== JSON.stringify(table.fieldSettings?.hidden || []);

  function updateField(column, value) {
    setDraft((current) => ({ ...current, [column]: value }));
  }

  function movePendingColumn(index, direction) {
    setPendingColumns((current) => {
      const next = [...current];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function renamePendingColumn(index, nextName) {
    setPendingColumns((current) => current.map((column, columnIndex) => columnIndex === index ? nextName : column));
  }

  function cancelEdits() {
    if (isDirty && !window.confirm("Discard unsaved drawer changes?")) return;
    setDraft(row || {});
    setPendingColumns(table.columns || []);
    setPendingHidden(table.fieldSettings?.hidden || []);
    setEditMode(false);
  }

  function closeDrawer() {
    if (editMode && isDirty && !window.confirm("You have unsaved drawer changes. Close without saving?")) return;
    onClose();
  }

  function saveDrawerEdits() {
    const cleanColumns = pendingColumns.map((column) => String(column || "").trim()).filter(Boolean);
    if (!cleanColumns.length) return;
    const uniqueColumns = Array.from(new Set(cleanColumns));
    const renameMap = {};
    (table.columns || []).forEach((column, index) => {
      const nextColumn = uniqueColumns[index];
      if (nextColumn && nextColumn !== column) renameMap[column] = nextColumn;
    });
    onSave((config) => {
      let next = transformTableSchema(config, table, { columns: uniqueColumns, renameMap });
      next = updateTableFieldSettings(next, { ...table, columns: uniqueColumns }, (settings) => ({
        ...settings,
        hidden: pendingHidden.filter((column) => uniqueColumns.includes(column))
      }));
      uniqueColumns.forEach((column) => {
        next = updateTableCell(next, { ...table, columns: uniqueColumns }, rowIndex, column, draft?.[column] ?? draft?.[Object.keys(renameMap).find((key) => renameMap[key] === column) || column] ?? "");
      });
      return next;
    });
    setEditMode(false);
  }

  async function testApiRecord() {
    setTesting(true);
    setTestMessage("");
    try {
      const res = await fetch("/api/workspace/test-api-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(table.objectType === "data-source" ? { dataSourceRecord: draft } : { record: draft }),
      });
      const payload = await res.json();
      const status = payload.ok ? "connected" : "failed";
      const responseText = JSON.stringify(payload.response ?? payload, null, 2);
      onSave((config) => {
        let next = updateTableCell(config, table, rowIndex, "status", status);
        next = updateTableCell(next, table, rowIndex, "lastTested", new Date().toISOString());
        next = updateTableCell(next, table, rowIndex, "lastResponse", responseText);
        return next;
      });
      setDraft((current) => ({ ...current, status, lastTested: new Date().toISOString(), lastResponse: responseText }));
      setTestMessage(payload.ok ? "Connected" : payload.error || "Connection failed");
    } catch (err) {
      const responseText = JSON.stringify({ error: err.message || "Connection failed" }, null, 2);
      onSave((config) => {
        let next = updateTableCell(config, table, rowIndex, "status", "failed");
        next = updateTableCell(next, table, rowIndex, "lastTested", new Date().toISOString());
        next = updateTableCell(next, table, rowIndex, "lastResponse", responseText);
        return next;
      });
      setTestMessage(err.message || "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function runSandbox() {
    if (!table.objectId) {
      setSandboxMessage("Missing object id for this sandbox table.");
      return;
    }
    const rowName = String(draft?.Name ?? "").trim();
    if (!rowName) {
      setSandboxMessage("Row Name is required.");
      return;
    }
    setSandboxRunning(true);
    setSandboxMessage("");
    try {
      const res = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: table.objectId, name: rowName }),
      });
      const payload = await res.json();
      const responseText = JSON.stringify(payload.response ?? payload, null, 2);
      const status = String(payload.status || "").toLowerCase() === "connected" ? "connected" : "failed";
      const testedAt = payload.response?.ranAt || new Date().toISOString();
      const lastRunId = payload.runId || payload.response?.runId || "";
      const lastSourceId = payload.sourceId || payload.response?.sourceId || "";
      onSave((config) => {
        let next = updateTableCell(config, table, rowIndex, "status", status);
        next = updateTableCell(next, table, rowIndex, "lastTested", testedAt);
        next = updateTableCell(next, table, rowIndex, "lastRunId", lastRunId);
        next = updateTableCell(next, table, rowIndex, "lastSourceId", lastSourceId);
        next = updateTableCell(next, table, rowIndex, "lastResponse", responseText);
        return next;
      });
      setDraft((current) => ({ ...current, status, lastTested: testedAt, lastRunId, lastSourceId, lastResponse: responseText }));
      setSandboxHistory((current) => payload.response ? [payload.response, ...current].slice(0, 25) : current);
      setSandboxMessage(payload.ok ? "Sandbox run recorded" : (payload.response?.error || payload.error || "Run failed"));
    } catch (err) {
      setSandboxMessage(err.message || "Sandbox run failed");
    } finally {
      setSandboxRunning(false);
    }
  }

  async function loadSandboxHistory() {
    if (!table.objectId || !String(draft?.Name || "").trim()) {
      setSandboxHistoryMessage("Sandbox Name is required.");
      return;
    }
    setLoadingSandboxHistory(true);
    setSandboxHistoryMessage("");
    try {
      const params = new URLSearchParams({ objectId: table.objectId, name: String(draft.Name || "").trim() });
      const res = await fetch(`/api/workspace/sandbox-run?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json();
      if (!payload.ok) throw new Error(payload.error || "Could not load run history");
      setSandboxHistory(Array.isArray(payload.records) ? payload.records : []);
      setSandboxHistoryMessage(`${payload.recordCount || 0} saved run${payload.recordCount === 1 ? "" : "s"} · ${payload.sourceId || ""}`);
    } catch (err) {
      setSandboxHistory([]);
      setSandboxHistoryMessage(err.message || "Could not load run history");
    } finally {
      setLoadingSandboxHistory(false);
    }
  }

  function expandLastResponse() {
    const text = String(draft.lastResponse || "");
    if (!text) return;
    try {
      setExpandedJson(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      setExpandedJson(text);
    }
  }

  return (
    <>
      <div className="dm-record-backdrop" onClick={onClose} />
      <aside className="dm-record-drawer" aria-label="Record details">
        <header className="dm-record-drawer-head">
          <div>
            <p>Record</p>
            <h2>{draft.Name || draft.integrationId || draft.id || `Row ${rowIndex + 1}`}</h2>
          </div>
          <div className="dm-record-drawer-actions">
            {!isSandbox && (
              <button type="button" className="dm-sidebar-close" onClick={() => setEditMode((current) => !current)} aria-label="Toggle edit mode">
                <Pencil size={16} />
              </button>
            )}
            <button type="button" className="dm-sidebar-close" onClick={closeDrawer} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>
        {(table.objectType === "api-registry" || table.objectType === "data-source") && (
          <SourceTestPanel
            status={draft.status}
            testing={testing}
            testMessage={testMessage}
            disabled={saving}
            onTest={testApiRecord}
          />
        )}
        {isSandbox && (
          <SandboxRunPanel
            status={draft.status}
            sandboxRunning={sandboxRunning}
            sandboxMessage={sandboxMessage}
            disabled={saving}
            canRun={Boolean(String(draft.Name || "").trim())}
            onRun={runSandbox}
          />
        )}
        <div className="dm-record-fields">
          {isSandbox ? (
            <SandboxRecordFields
              draft={draft}
              setDraft={setDraft}
              table={table}
              tables={tables}
              workspaceConfig={workspaceConfig}
              saving={saving}
              onSave={onSave}
              rowIndex={rowIndex}
              sandboxHistory={sandboxHistory}
              sandboxHistoryMessage={sandboxHistoryMessage}
              loadingSandboxHistory={loadingSandboxHistory}
              onLoadSandboxHistory={loadSandboxHistory}
              onExpandLastResponse={expandLastResponse}
            />
          ) : groupRecordColumns(table.columns || []).map((section) => (
            <DrawerSection key={section.title} title={section.title}>
              {section.columns.map((column) => (
                <RecordFieldEditor
                  key={column}
                  table={table}
                  tables={tables}
                  column={column}
                  value={String(draft?.[column] ?? "")}
                  saving={saving}
                  editable={editMode}
                  onDraft={(field, nextValue) => editMode && setDraft((current) => ({ ...current, [field]: nextValue }))}
                  onCommit={updateField}
                  onExpandJson={expandLastResponse}
                />
              ))}
            </DrawerSection>
          ))}
          {!isSandbox && editMode && (
            <DrawerSection title="Fields" defaultOpen>
              <div className="dm-drawer-field-editor">
                {pendingColumns.map((column, index) => (
                  <div key={`${column}-${index}`} className="dm-drawer-field-row">
                    <input value={column} onChange={(event) => renamePendingColumn(index, event.target.value)} />
                    <button type="button" className="dm-btn-ghost" onClick={() => setPendingHidden((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column])}>
                      {pendingHidden.includes(column) ? "Show" : "Hide"}
                    </button>
                    <button type="button" className="dm-btn-ghost" disabled={index === 0} onClick={() => movePendingColumn(index, "up")}>Up</button>
                    <button type="button" className="dm-btn-ghost" disabled={index === pendingColumns.length - 1} onClick={() => movePendingColumn(index, "down")}>Down</button>
                  </div>
                ))}
                {pendingHidden.length > 0 && (
                  <div className="dm-drawer-hidden-fields">
                    <span>Hidden fields</span>
                    <div className="dm-drawer-hidden-list">
                      {pendingHidden.map((column) => (
                        <button key={`hidden-${column}`} type="button" className="dm-filter-chip" onClick={() => setPendingHidden((current) => current.filter((item) => item !== column))}>
                          <span>{column}</span>
                          <X size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DrawerSection>
          )}
        </div>
        {!isSandbox && editMode && (
          <footer className="dm-record-drawer-foot">
            <button type="button" className="dm-btn-outline" onClick={cancelEdits}>Cancel</button>
            <button type="button" className="dm-btn-primary-sm" disabled={saving || !isDirty} onClick={saveDrawerEdits}>Save changes</button>
          </footer>
        )}
      </aside>
      {expandedJson !== null && (
        <div className="dm-json-modal-backdrop" onClick={() => setExpandedJson(null)}>
          <section className="dm-json-modal" role="dialog" aria-modal="true" aria-label="lastResponse JSON" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p>lastResponse</p>
                <h2>{draft.Name || draft.integrationId || "Record response"}</h2>
              </div>
              <button type="button" className="dm-sidebar-close" onClick={() => setExpandedJson(null)} aria-label="Close expanded JSON">
                <X size={16} />
              </button>
            </header>
            <pre>{expandedJson}</pre>
          </section>
        </div>
      )}
    </>
  );
}

function DataModelTableSurface({ table, tables, workspaceConfig, saving, onSave }) {
  const [selectedRow, setSelectedRow] = useState(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [addingField, setAddingField] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [mode, setMode] = useState("append");
  const [filterDraft, setFilterDraft] = useState({ fieldId: "", operator: "eq", value: "" });
  const [filterTarget, setFilterTarget] = useState("");
  const [menuColumn, setMenuColumn] = useState("");
  const fieldInputRef = useRef(null);

  useEffect(() => { if (addingField) fieldInputRef.current?.focus(); }, [addingField]);
  useEffect(() => { setSelectedRow(null); }, [table.id]);
  useEffect(() => {
    setFieldName("");
    setFieldType("text");
    setFilterDraft({ fieldId: table.columns[0] || "", operator: "eq", value: "" });
  }, [table.id, table.columns]);

  const settings = table.fieldSettings || { hidden: [], order: table.columns, sort: [], filter: null, views: [], activeViewId: "" };
  const orderedColumns = useMemo(() => mergeColumnOrder(settings.order, table.columns), [settings.order, table.columns]);
  const visibleColumns = useMemo(() => orderedColumns.filter((column) => !settings.hidden.includes(column)), [orderedColumns, settings.hidden]);
  const rowEntries = useMemo(() => {
    const indexed = (table.rows || []).map((row, originalIndex) => ({ row, originalIndex }));
    const filtered = indexed.filter((entry) => rowMatchesFilter(entry.row, settings.filter));
    if (!settings.sort?.length) return filtered;
    const clauses = settings.sort;
    return [...filtered].sort((left, right) => {
      for (const clause of clauses) {
        const direction = clause.direction === "desc" ? -1 : 1;
        const diff = compareCellValues(left.row?.[clause.fieldId], right.row?.[clause.fieldId]);
        if (diff !== 0) return diff * direction;
      }
      return 0;
    });
  }, [table.rows, settings]);
  const activeView = useMemo(
    () => (settings.views || []).find((view) => view.id === settings.activeViewId) || null,
    [settings.views, settings.activeViewId]
  );

  function commitField() {
    const name = fieldName.trim();
    if (!name) {
      setAddingField(false);
      setFieldName("");
      return;
    }
    if (!table.columns.includes(name)) {
      onSave((config) => addTableField(config, table, { name, type: fieldType }));
    }
    setAddingField(false);
    setFieldName("");
    setFieldType("text");
  }

  function importCsv() {
    const parsed = importTableFromCsv(csvText);
    if (!parsed.columns.length) return;
    if (mode === "replace") onSave((config) => replaceTableContent(config, table, parsed));
    else onSave((config) => appendRowsToTable(config, table, parsed.rows));
    setCsvText("");
    setCsvOpen(false);
  }

  function updateSettings(updater) {
    onSave((config) => updateTableFieldSettings(config, table, updater));
  }

  function moveColumn(column, direction) {
    updateSettings((current) => {
      const order = [...mergeColumnOrder(current.order, table.columns)];
      const index = order.indexOf(column);
      const nextIndex = direction === "left" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...current, order };
    });
  }

  function toggleColumnHidden(column) {
    updateSettings((current) => ({
      ...current,
      hidden: current.hidden.includes(column)
        ? current.hidden.filter((item) => item !== column)
        : [...current.hidden, column]
    }));
  }

  function setSort(column, direction) {
    updateSettings((current) => ({ ...current, sort: [{ fieldId: column, direction }] }));
    setMenuColumn("");
  }

  function applyFilter() {
    if (!filterDraft.fieldId) return;
    updateSettings((current) => ({
      ...current,
      filter: {
        op: "and",
        clauses: [
          ...((current.filter?.clauses || []).filter((clause) => clause.fieldId !== filterDraft.fieldId)),
          ...(filterDraft.operator === "isEmpty" || filterDraft.operator === "isNotEmpty"
            ? [{ fieldId: filterDraft.fieldId, operator: filterDraft.operator }]
            : filterDraft.value !== ""
              ? [{ fieldId: filterDraft.fieldId, operator: filterDraft.operator, value: filterDraft.value }]
              : [])
        ]
      }
    }));
    setFilterTarget("");
  }

  function removeFilter(fieldId) {
    updateSettings((current) => {
      const clauses = (current.filter?.clauses || []).filter((clause) => clause.fieldId !== fieldId);
      return { ...current, filter: clauses.length ? { op: "and", clauses } : null };
    });
  }

  function resetView() {
    updateSettings((current) => ({
      ...current,
      hidden: [],
      order: table.columns,
      sort: [],
      filter: null,
      activeViewId: ""
    }));
  }

  function saveCurrentAsNewView() {
    const name = window.prompt("View name");
    if (!name?.trim()) return;
    const viewId = `view_${Date.now().toString(36)}`;
    updateSettings((current) => ({
      ...current,
      activeViewId: viewId,
      views: [...(current.views || []), { id: viewId, name: name.trim(), favorite: false, locked: false, ...snapshotTableViewState(current) }]
    }));
  }

  function updateCurrentView() {
    if (!activeView) return;
    updateSettings((current) => ({
      ...current,
      views: (current.views || []).map((view) => view.id === activeView.id ? { ...view, ...snapshotTableViewState(current) } : view)
    }));
  }

  const selectedEntry = selectedRow === null ? null : rowEntries[selectedRow];
  const selectedRecord = selectedEntry?.row || null;

  return (
    <div className="dm-db-surface">
      {!table.mutable && (
        <div className="dm-source-notice">
          <AlertCircle size={13} />
          <span>Dynamic integration records are resolved at runtime.</span>
        </div>
      )}
      <div className="dm-db-toolbar">
        <div className="dm-filter-chip-row">
          {settings.filter?.clauses?.map((clause) => (
            <button key={`${clause.fieldId}:${clause.operator}`} type="button" className="dm-filter-chip" onClick={() => removeFilter(clause.fieldId)}>
              <LucideIcon name={FIELD_TYPE_ICON_NAMES[settings.types?.[clause.fieldId] || inferFieldType(clause.fieldId)] || "Type"} size={12} />
              <span>{clause.fieldId}: {clause.operator}{clause.value !== undefined ? ` ${clause.value}` : ""}</span>
              <X size={12} />
            </button>
          ))}
        </div>
        <div className="dm-records-actions">
          <button type="button" className="dm-btn-ghost" onClick={() => setFilterTarget((current) => current === "toolbar" ? "" : "toolbar")}>
            <Filter size={13} />Filter
          </button>
          {activeView ? (
            <button type="button" className="dm-btn-ghost" onClick={updateCurrentView}>
              Update view
            </button>
          ) : (
            <button type="button" className="dm-btn-ghost" onClick={saveCurrentAsNewView}>
              Save as new view
            </button>
          )}
          {table.rows.length > 0 && (
            <button type="button" className="dm-btn-ghost" onClick={() => {
              const blob = new Blob([exportTableAsCsv(table)], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `${table.source.replace(/\s+/g, "-").toLowerCase()}.csv`;
              a.click(); URL.revokeObjectURL(url);
            }}>Export CSV</button>
          )}
          {table.mutable && <button type="button" className="dm-btn-ghost" onClick={() => setCsvOpen((open) => !open)}>Import CSV</button>}
          {table.mutable && (
            <button type="button" className="dm-btn-primary-sm" disabled={saving} onClick={() => onSave((config) => addTableRow(config, table))}>
              <Plus size={13} />Add record
            </button>
          )}
        </div>
      </div>
      {filterTarget === "toolbar" && (
        <div className="dm-filter-popover dm-filter-popover-toolbar">
          <StaticSelect value={filterDraft.fieldId} options={visibleColumns.map((column) => ({ value: column, label: column }))} onChange={(next) => setFilterDraft((current) => ({ ...current, fieldId: next }))} />
          <StaticSelect value={filterDraft.operator} options={FILTER_OPERATOR_OPTIONS.map((item) => ({ value: item.value, label: item.label }))} onChange={(next) => setFilterDraft((current) => ({ ...current, operator: next }))} />
          {!["isEmpty", "isNotEmpty"].includes(filterDraft.operator) && (
            <input value={filterDraft.value} placeholder="Value" onChange={(event) => setFilterDraft((current) => ({ ...current, value: event.target.value }))} />
          )}
          <div className="dm-filter-popover-actions">
            <button type="button" className="dm-btn-outline" onClick={() => setFilterTarget("")}>Cancel</button>
            <button type="button" className="dm-btn-primary-sm" onClick={applyFilter}>Apply</button>
          </div>
        </div>
      )}
      {csvOpen && (
        <div className="dm-csv-panel">
          <textarea className="dm-csv-textarea" rows={4} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"Name,Status\nAcme,Active"} />
          <div className="dm-csv-opts">
            <label><input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /> Append</label>
            <label><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace</label>
            <button type="button" className="dm-btn-primary-sm" disabled={!csvText.trim()} onClick={importCsv}>Import</button>
          </div>
        </div>
      )}
      <div className="dm-db-grid-wrap">
        <table className="dm-db-grid">
          <thead>
            <tr>
              <th className="dm-db-rownum">#</th>
              {visibleColumns.map((column) => (
                <th key={column}>
                  <button type="button" className="dm-db-head-btn" onClick={() => setMenuColumn((current) => current === column ? "" : column)}>
                    <span className="dm-db-field-type"><LucideIcon name={FIELD_TYPE_ICON_NAMES[settings.types?.[column] || inferFieldType(column)] || "Type"} size={12} /></span>
                    {column}
                    {settings.sort?.[0]?.fieldId === column && (settings.sort[0].direction === "desc" ? <ArrowDownAZ size={12} /> : <ArrowUpAZ size={12} />)}
                    <MoreHorizontal size={12} />
                  </button>
                  {menuColumn === column && (
                    <div className="dm-col-menu">
                      <button type="button" onClick={() => {
                        setFilterDraft({ fieldId: column, operator: "eq", value: "" });
                        setFilterTarget(column);
                        setMenuColumn("");
                      }}><Filter size={13} />Filter</button>
                      <button type="button" onClick={() => setSort(column, "asc")}><ArrowUpAZ size={13} />Sort ascending</button>
                      <button type="button" onClick={() => setSort(column, "desc")}><ArrowDownAZ size={13} />Sort descending</button>
                      <button type="button" onClick={() => moveColumn(column, "left")}><ArrowRight size={13} style={{ transform: "rotate(180deg)" }} />Move left</button>
                      <button type="button" onClick={() => moveColumn(column, "right")}><ArrowRight size={13} />Move right</button>
                      <button type="button" onClick={() => toggleColumnHidden(column)}><EyeOff size={13} />Hide</button>
                    </div>
                  )}
                  {filterTarget === column && (
                    <div className="dm-filter-popover dm-filter-popover-column">
                      <StaticSelect value={filterDraft.fieldId} options={visibleColumns.map((item) => ({ value: item, label: item }))} onChange={(next) => setFilterDraft((current) => ({ ...current, fieldId: next }))} />
                      <StaticSelect value={filterDraft.operator} options={FILTER_OPERATOR_OPTIONS.map((item) => ({ value: item.value, label: item.label }))} onChange={(next) => setFilterDraft((current) => ({ ...current, operator: next }))} />
                      {!["isEmpty", "isNotEmpty"].includes(filterDraft.operator) && (
                        <input value={filterDraft.value} placeholder="Value" onChange={(event) => setFilterDraft((current) => ({ ...current, value: event.target.value }))} />
                      )}
                      <div className="dm-filter-popover-actions">
                        <button type="button" className="dm-btn-outline" onClick={() => setFilterTarget("")}>Cancel</button>
                        <button type="button" className="dm-btn-primary-sm" onClick={applyFilter}>Apply</button>
                      </div>
                    </div>
                  )}
                </th>
              ))}
              {table.mutable && (
                <th className="dm-db-add-field">
                  <button type="button" onClick={() => setAddingField(true)}>
                    <Plus size={13} />Field
                  </button>
                  {addingField && (
                    <div className="dm-field-creator-popover">
                      <div className="dm-field-creator">
                        <input
                          ref={fieldInputRef}
                          value={fieldName}
                          placeholder={FIELD_TYPE_CHOICES.find((choice) => choice.value === fieldType)?.sample || "Field name"}
                          onChange={(event) => setFieldName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitField();
                            if (event.key === "Escape") { setAddingField(false); setFieldName(""); }
                          }}
                        />
                        <div className="dm-field-type-grid">
                          {FIELD_TYPE_CHOICES.map((choice) => (
                            <button key={choice.value} type="button" className={fieldType === choice.value ? "active" : ""} onClick={() => setFieldType(choice.value)}>
                              <LucideIcon name={choice.icon} size={12} />
                              <span>{choice.label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="dm-field-creator-actions">
                          <button type="button" className="dm-btn-outline" onClick={() => { setAddingField(false); setFieldName(""); }}>Cancel</button>
                          <button type="button" className="dm-btn-primary-sm" onClick={commitField}>Create</button>
                        </div>
                      </div>
                    </div>
                  )}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rowEntries.map(({ row, originalIndex }, rowIndex) => (
              <tr key={rowIndex} className={selectedRow === rowIndex ? "selected" : ""} onClick={() => setSelectedRow(rowIndex)}>
                <td className="dm-db-rownum">{rowIndex + 1}</td>
                {visibleColumns.map((column) => {
                  const relation = relationForColumn(table, column);
                  return (
                  <td key={column}>
                    {relation ? (
                      <RelationPickerOrSelect
                        table={table}
                        tables={tables}
                        column={column}
                        value={String(row?.[column] || "")}
                        disabled={!table.mutable || saving}
                        onChange={(nextValue) => onSave((config) => updateTableCell(config, table, originalIndex, column, nextValue))}
                      />
                    ) : column.toLowerCase() === "status" ? (
                      <StatusPill value={row?.[column]} />
                    ) : (
                      <span className={row?.[column] ? "" : "dm-cell-empty"}>
                        {formatCellValue(row?.[column], column) || "—"}
                      </span>
                    )}
                  </td>
                );})}
                {table.mutable && <td className="dm-db-empty-cell" />}
              </tr>
            ))}
            {table.mutable && (
              <tr className="dm-db-new-row" onClick={() => onSave((config) => addTableRow(config, table))}>
                <td className="dm-db-rownum">+</td>
                <td colSpan={Math.max(visibleColumns.length, 1) + 1}>Add record</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DataModelRecordDrawer
        table={table}
        tables={tables}
        workspaceConfig={workspaceConfig}
        rowIndex={selectedEntry?.originalIndex ?? null}
        row={selectedRecord}
        saving={saving}
        onClose={() => setSelectedRow(null)}
        onSave={onSave}
      />
    </div>
  );
}

// ─── Add Object Sidebar — two-step (type picker → name + icon) ────────────────

function IconPicker({ value, onChange }) {
  return (
    <div className="dm-icon-picker">
      {ICON_PICKER_SET.map((name) => (
        <button
          key={name}
          type="button"
          className={`dm-icon-picker-btn${value === name ? " active" : ""}`}
          title={name}
          onClick={() => onChange(name)}
        >
          <LucideIcon name={name} size={16} />
        </button>
      ))}
    </div>
  );
}

function AddObjectSidebar({ open, saving, onClose, onCreate, allTables }) {
  const [step, setStep] = useState(0); // 0 = type picker, 1 = name + icon
  const [selectedType, setSelectedType] = useState(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSelectedType(null);
    setName("");
    setIcon(null);
    setError("");
  }, [open]);

  useEffect(() => {
    if (step === 1) setTimeout(() => inputRef.current?.focus(), 80);
  }, [step]);

  function pickType(typeDef) {
    setSelectedType(typeDef);
    setIcon(typeDef.icon.displayName || OBJECT_TYPE_PRESETS[typeDef.type]?.icon || "Database");
    setStep(1);
  }

  function submit(e) {
    e.preventDefault();
    const objectName = name.trim();
    if (!objectName) { setError("Object name is required."); return; }
    setError("");
    onCreate({ name: objectName, objectType: selectedType.type, icon });
  }

  return (
    <>
      {open && <div className="dm-sidebar-backdrop" onClick={onClose} />}
      <aside className={`dm-add-sidebar${open ? " open" : ""}`} role="dialog" aria-label="New object" aria-modal="true">
        <div className="dm-add-sidebar-head">
          <div className="dm-add-sidebar-head-left">
            {step === 1 && (
              <button type="button" className="dm-sidebar-back" onClick={() => setStep(0)}>
                ←
              </button>
            )}
            <h2>{step === 0 ? "New object" : `New ${selectedType?.label}`}</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {step === 0 && (
          <div className="dm-type-picker">
            <p className="dm-type-picker-hint">Choose an object type to start with the right fields and relation bindings.</p>
            <div className="dm-type-picker-list">
              {OBJECT_TYPE_DEFS.map((def) => {
                const Icon = def.icon;
                return (
                  <button key={def.type} type="button" className="dm-type-card" onClick={() => pickType(def)}>
                    <div className="dm-type-card-icon">
                      <Icon size={18} />
                    </div>
                    <div className="dm-type-card-body">
                      <strong>{def.label}</strong>
                      <span>{def.description}</span>
                    </div>
                    <ChevronRight size={14} className="dm-type-card-arrow" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 1 && selectedType && (
          <form className="dm-add-sidebar-body" onSubmit={submit}>
            <div className="dm-add-type-preview">
              <div className="dm-add-type-icon">
                <LucideIcon name={icon || OBJECT_TYPE_PRESETS[selectedType.type]?.icon || "Database"} size={20} />
              </div>
              <div>
                <p className="dm-add-type-label">{selectedType.label}</p>
                <p className="dm-add-sidebar-hint">{selectedType.description}</p>
              </div>
            </div>

            <label className="dm-field-label-v2">
              <span>Object name</span>
              <input
                ref={inputRef}
                className="dm-input-v2"
                value={name}
                placeholder={selectedType.type === "data-source" ? "My Analytics API, Salesforce Feed…" : selectedType.type === "api-registry" ? "GA4 Resolver, Stripe Adapter…" : "Name this object…"}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="dm-field-label-v2">
              <span>Icon</span>
              <IconPicker value={icon} onChange={setIcon} />
            </label>

            {OBJECT_TYPE_PRESETS[selectedType.type]?.columns?.length > 0 && (
              <div className="dm-preset-fields-preview">
                <p className="dm-usage-label">Pre-populated fields</p>
                <div className="dm-preset-fields-list">
                  {OBJECT_TYPE_PRESETS[selectedType.type].columns.map((col) => (
                    <span key={col} className="dm-preset-field-chip">{col}</span>
                  ))}
                </div>
              </div>
            )}

            {OBJECT_TYPE_PRESETS[selectedType.type]?.relations?.length > 0 && (
              <div className="dm-preset-relations-preview">
                <p className="dm-usage-label">Built-in relations</p>
                {OBJECT_TYPE_PRESETS[selectedType.type].relations.map((rel) => (
                  <div key={rel.id} className="dm-preset-relation-row">
                    <Zap size={12} />
                    <span>{rel.name}</span>
                    <ArrowRight size={11} />
                    <span className="dm-preset-rel-target">{OBJECT_TYPE_PRESETS[rel.targetObjectType]?.label || rel.targetObjectType}</span>
                  </div>
                ))}
              </div>
            )}

            {error && <p className="dm-field-error">{error}</p>}

            <div className="dm-add-sidebar-actions">
              <button type="button" className="dm-btn-outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="dm-btn-primary" disabled={saving || !name.trim()}>
                Create object
              </button>
            </div>
          </form>
        )}
      </aside>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataModelShell() {
  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [authority, setAuthority] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load workspace");
      setWorkspaceConfig(payload.workspaceConfig);
      setAuthority(payload.adapters?.integrations?.authority || null);
    } catch (err) {
      setError(err.message || "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tables = useMemo(
    () => (workspaceConfig ? listWorkspaceDataModelTables(workspaceConfig) : []),
    [workspaceConfig],
  );

  const selectedTable = tables.find((t) => t.source === selectedSource) || tables[0] || null;

  useEffect(() => {
    if (!selectedSource && tables[0]) setSelectedSource(tables[0].source);
  }, [selectedSource, tables]);

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
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Save failed");
      setWorkspaceConfig(payload.workspaceConfig);
      setMessage("Saved");
    } catch (err) {
      setMessage(`Error: ${err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  }, [workspaceConfig]);

  const createObject = useCallback(({ name, objectType, icon }) => {
    save((config) => createTypedBusinessObject(config, { name, objectType, icon }));
    setSelectedSource(name);
    setAddOpen(false);
  }, [save]);

  return (
    <main className="workspace-builder workspace-settings-page">
      <NavRail authority={authority} workspaceConfig={workspaceConfig} />

      <section className="workspace-surface">
        <header className="workspace-toolbar">
          <div><p>Workspace</p><h1>Data Model</h1></div>
          <div className="workspace-toolbar-actions">
            <SaveToast saving={saving} message={message} />
            <button type="button" className="dm-btn-primary" onClick={() => setAddOpen(true)}>
              <Plus size={14} />New object
            </button>
          </div>
        </header>

        <AddObjectSidebar
          open={addOpen}
          saving={saving}
          onClose={() => setAddOpen(false)}
          onCreate={createObject}
          allTables={tables}
        />

        {loading && <div className="dm-loading">Loading workspace…</div>}

        {error && (
          <div className="dm-error-state">
            <AlertCircle size={28} />
            <strong>Could not load workspace</strong>
            <p>{error}</p>
            <button type="button" className="dm-btn-primary" onClick={load}>Retry</button>
          </div>
        )}

        {!loading && !error && tables.length > 0 && (
          selectedTable && (
            <section className="dm-detail-v2 dm-detail-v3">
              <div className="dm-detail-v2-head dm-detail-v3-head">
                <div className="dm-detail-v2-title">
                  <ObjectViewPicker tables={tables} selectedTable={selectedTable} saving={saving} onSelectSource={setSelectedSource} onSave={save} />
                </div>
                <SourceValidationBanner table={selectedTable} />
              </div>
              <DataModelTableSurface workspaceConfig={workspaceConfig} table={selectedTable} tables={tables} saving={saving} onSave={save} />
            </section>
          )
        )}

        {!loading && !error && tables.length === 0 && (
          <div className="dm-page-empty">
            <Database size={32} />
            <strong>No objects yet</strong>
            <p>Create a Data Source, API Registry, People, Tasks, or Custom object to get started.</p>
            <button type="button" className="dm-btn-primary" onClick={() => setAddOpen(true)}>
              <Plus size={14} />New object
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export { DataModelTableSurface, DataModelRecordDrawer, RecordFieldEditor };
