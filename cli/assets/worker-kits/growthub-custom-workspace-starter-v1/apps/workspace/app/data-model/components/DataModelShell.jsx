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
  Copy,
  Database,
  Download,
  EyeOff,
  FileText,
  Filter,
  Globe,
  GripVertical,
  Hash,
  Layers,
  Link2,
  Lock,
  Mail,
  Maximize2,
  MoreHorizontal,
  MoreVertical,
  Play,
  Plus,
  Pencil,
  Search,
  ShoppingCart,
  Tag,
  Terminal,
  ToggleLeft,
  Trash2,
  Type,
  Unlock,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelperSidecar } from "./HelperSidecar.jsx";
import { WorkspaceRail } from "../../workspace-rail.jsx";
import { useRouter, useSearchParams } from "next/navigation";
import {
  OBJECT_TYPE_PRESETS,
  addTableField,
  addTableRow,
  appendRowsToTable,
  createTypedBusinessObject,
  deleteTableRow,
  describeBindingLane,
  effectiveRelations,
  exportTableAsCsv,
  importTableFromCsv,
  listSavedEnvRefs,
  listWorkspaceDataModelTables,
  parseSandboxAllowList,
  parseSandboxEnvRefs,
  replaceTableContent,
  transformTableSchema,
  updateTableFieldSettings,
  updateTableCell,
} from "@/lib/workspace-data-model";
import { ReferencePicker } from "./ReferencePicker.jsx";
import { SandboxRunPanel } from "./SandboxRunPanel.jsx";
import { SandboxAgentAuthPanel } from "./SandboxAgentAuthPanel.jsx";
import { isSandboxLocalAgentHost } from "@/lib/sandbox-agent-auth-eligibility";
import { StatusPill } from "./StatusPill.jsx";
import { SegmentedToggle, ToggleField } from "./ToggleField.jsx";
import { SourceTestPanel } from "./SourceTestPanel.jsx";
import { OrchestrationRunTracePanel } from "./OrchestrationRunTracePanel.jsx";
import { ApiRegistryCreationCockpit } from "./ApiRegistryCreationCockpit.jsx";
import { deriveApiRegistryCreationState } from "@/lib/api-registry-creation-flow";
import { deriveSandboxServerlessState } from "@/lib/sandbox-serverless-flow";
import { profileApiResponse, recommendResolver } from "@/lib/api-response-profile";
import { constructResolverProposal } from "@/lib/resolver-constructor";
import { classifyCreationError } from "@/lib/creation-error-recovery";
import {
  buildDefaultOrchestrationGraphFromRegistry,
  findSandboxRowsForRegistry,
  buildDataSourceRowFromApiRegistry,
  findDataSourceRowsForRegistry,
  getOrchestrationGraphUiState,
  redactSecretsFromText,
  serializeOrchestrationGraph,
  slugifyName
} from "@/lib/orchestration-graph";
import {
  FIELD_TYPE_ICON_NAMES,
  ICON_PICKER_SET,
  LucideIcon,
  inferFieldType,
  objectTypeBadge,
  pluralize,
  textColorForAccent,
} from "./dm-shared.jsx";
import {
  CODEX_SITES_OBJECT_ID,
  codexSiteRecordToRow,
  isCodexSiteUrl,
  normalizeCodexSiteRecord,
} from "@/lib/codex-sites-workspace-adapter";

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
const EMPTY_FIELD_SETTING_LIST = Object.freeze([]);
const EMPTY_AGENT_AUTH_PATCH = {
  agentAuthStatus: "",
  agentAuthProvider: "",
  agentAuthLastChecked: "",
  agentAuthLastExitCode: "",
  agentAuthLastMessage: "",
  agentAuthLastLoginUrl: ""
};
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
  return Boolean(table?.locked);
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

function ObjectViewPicker({ tables, selectedTable, onSelectSource, onToggleLock, onDeleteObject, onExportObject, onDuplicateObject }) {
  const pickerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuSource, setMenuSource] = useState("");

  useEffect(() => {
    function handlePointer(event) {
      if (!pickerRef.current?.contains(event.target)) {
        setOpen(false);
        setMenuSource("");
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, []);

  return (
    <div
      ref={pickerRef}
      className={`dm-picker${open ? " open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setMenuSource("");
        }
      }}
    >
      <button type="button" className="dm-picker-trigger" onClick={() => setOpen((current) => !current)}>
        <LucideIcon name={selectedTable?.icon || OBJECT_TYPE_PRESETS[selectedTable?.objectType]?.icon || "Database"} size={14} />
        <span className="dm-picker-trigger-copy">
          <strong>{selectedTable?.label || "Object"}</strong>
          <em>{pluralize(selectedTable?.columns?.length || 0, "field")} · {pluralize(selectedTable?.rows?.length || 0, "record")}</em>
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dm-picker-popover">
          <div className="dm-picker-section">
            <p>Objects</p>
            <div className="dm-picker-scroll">
              {tables.map((table, objIdx) => (
                <div key={`${table.id || table.source}:${objIdx}`} className={`dm-picker-item${selectedTable?.source === table.source ? " active" : ""}`}>
                  <button type="button" className="dm-picker-row" onClick={() => {
                    onSelectSource(table.source);
                    setOpen(false);
                    setMenuSource("");
                  }}>
                    <LucideIcon name={table.icon || OBJECT_TYPE_PRESETS[table.objectType]?.icon || "Database"} size={14} />
                    <span>{table.label}</span>
                    {isLockedObject(table) && <Lock size={12} className="dm-picker-lock" />}
                  </button>
                  <div className="dm-picker-actions">
                    <button
                      type="button"
                      className="dm-picker-icon-btn"
                      aria-label={`${table.label} actions`}
                      title="Object actions"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuSource((current) => current === table.source ? "" : table.source);
                      }}
                    >
                      <MoreVertical size={14} aria-hidden="true" />
                    </button>
                    {menuSource === table.source && (
                      <div className="dm-picker-menu" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => { onToggleLock?.(table); setMenuSource(""); }}>
                          {isLockedObject(table) ? <Unlock size={13} /> : <Lock size={13} />}
                          {isLockedObject(table) ? "Unlock" : "Lock"}
                        </button>
                        <button type="button" onClick={() => { onExportObject?.(table); setMenuSource(""); }}>
                          <Download size={13} />Export
                        </button>
                        <button type="button" onClick={() => { onDuplicateObject?.(table); setMenuSource(""); }}>
                          <Copy size={13} />Duplicate
                        </button>
                        <button type="button" className="danger" onClick={() => { onDeleteObject?.(table); setMenuSource(""); }}>
                          <Trash2 size={13} />Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
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

// NavRail extracted to `app/workspace-rail.jsx` (shared across all
// governed-workspace pages). The legacy local definition has been
// removed — every surface now renders <WorkspaceRail />.

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

function DrawerSection({ title, children, defaultOpen = false, forceOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
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

function SandboxTraceFieldButton({ label, value, disabled, onOpen }) {
  const hasValue = value !== null && value !== undefined && String(value).trim() !== "";
  return (
    <label className="dm-record-field dm-field-link">
      <span>{label}</span>
      <button
        type="button"
        className="dm-field-link__btn"
        disabled={disabled || !hasValue}
        onClick={() => onOpen?.()}
      >
        {hasValue ? String(value).slice(0, 80) + (String(value).length > 80 ? "…" : "") : "—"}
      </button>
      <span className="dm-field-link__hint">Opens run trace viewer</span>
    </label>
  );
}

// Human labels for the per-host browser lanes declared in the
// local-agent-host catalog — surfaced so the operator's mental model matches
// exactly what the adapter does under the hood when browserAccess is on.
const BROWSER_LANE_LABELS = {
  "native-flag": "browser enabled through the host CLI's first-party browser integration flags.",
  "env-signal": "host receives GROWTHUB_SANDBOX_BROWSER_ACCESS=1 — its own configured browser integration honors this setting."
};

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
  onOpenGraphSidecar,
  onOpenTraceSidecar
}) {
  const router = useRouter();
  const [sandboxAdapters, setSandboxAdapters] = useState([]);
  const [serverlessSignals, setServerlessSignals] = useState({ configuredEnvRefs: [], persistenceAdapters: [] });
  useEffect(() => {
    fetch("/api/workspace/sandbox-adapters", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => setSandboxAdapters(Array.isArray(payload.adapters) ? payload.adapters : []))
      .catch(() => setSandboxAdapters([]));
  }, []);
  // Real runtime truth for the serverless/persistence cockpit (env-status).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/env-status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .then((payload) => {
        if (cancelled) return;
        setServerlessSignals({
          configuredEnvRefs: Array.isArray(payload.configuredEnvRefs) ? payload.configuredEnvRefs : [],
          persistenceAdapters: Array.isArray(payload.persistenceAdapters) ? payload.persistenceAdapters : [],
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [rowIndex, table.objectId]);

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

  function withClearedAgentAuth(fields) {
    return { ...fields, ...EMPTY_AGENT_AUTH_PATCH };
  }

  function defaultSchedulerRegistryId() {
    const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
    for (const object of objects) {
      if (object?.objectType !== "api-registry") continue;
      const row = (object.rows || []).find((r) => String(r?.integrationId || "").trim());
      if (row) return String(row.integrationId || "").trim();
    }
    return "";
  }

  function setRunLocality(next) {
    const fields = { runLocality: next };
    if (next === "serverless") {
      fields.schedulerRegistryId = String(draft.schedulerRegistryId || "").trim() || defaultSchedulerRegistryId();
    }
    if (next === "serverless" && ["local-agent-host", "local-intelligence"].includes(String(draft.adapter || "").trim())) {
      fields.adapter = "local-process";
      fields.agentHost = "";
      patchFields(withClearedAgentAuth(fields));
      return;
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
  const browserOn = ["true", "1", "on", "yes"].includes(String(draft.browserAccess || "").trim().toLowerCase());
  const browserHostMeta = (selectedAdapterMeta?.hostCatalog || []).find((h) => h.slug === String(draft.agentHost || "").trim());

  // Same cockpit interface + mental model as the API Registry lane, driven by
  // the serverless/scheduling/persistence derivation. Steps are status-only
  // here (inlineEditing) — the editable fields below are the editor.
  const serverlessState = deriveSandboxServerlessState({
    sandboxRow: draft,
    workspaceConfig,
    configuredEnvRefs: serverlessSignals.configuredEnvRefs,
    persistenceAdapters: serverlessSignals.persistenceAdapters,
    inlineEditing: true,
  });
  const showServerlessUpgrade = String(draft.adapter || "").trim() !== "local-intelligence";
  function handleServerlessAction(action) {
    if (!action) return;
    if (action.id === "toggle-locality") setRunLocality(serverlessState.isServerless ? "local" : "serverless");
    else if (action.id === "open-settings") router.push(action.href || "/settings");
  }

  return (
    <div className="dm-sandbox-config">
      {showServerlessUpgrade && (
        <ApiRegistryCreationCockpit
          state={serverlessState}
          onAction={handleServerlessAction}
          disabled={!table.mutable || saving}
          eyebrow={serverlessState.isServerless ? "Serverless workflow" : "Workflow runtime"}
        />
      )}
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
          Choose local execution or a scheduled serverless run.
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
            onChange={(nextValue) => patchFields(withClearedAgentAuth({
              adapter: nextValue,
              agentHost: nextValue === "local-agent-host" ? draft.agentHost || "" : ""
            }))}
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
              onChange={(nextValue) => patchFields(withClearedAgentAuth({ agentHost: nextValue }))}
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
              Uses <strong>Instructions</strong> + <strong>Command</strong> as the task payload. With browser access off, tool intents stay proposals. With browser access on, browser tool intents execute through the local browser bridge before the final JSON response is returned.
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
          checked={netOn || browserOn}
          disabled={!table.mutable || saving || (browserOn && !netOn)}
          label="Network allow-list mode"
          description={browserOn && !netOn
            ? "Network enabled by browser access — the run route grants it even though this row's networkAllow is off. Turn browser access off to control network independently."
            : "When enabled, local runs honor GROWTHUB_SANDBOX_NET_* and the allow list below."}
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

        <ToggleField
          checked={browserOn}
          disabled={!table.mutable || saving}
          label="Browser access"
          description="Allows this sandbox to use a real browser. Also enables network. Local intelligence uses the Playwright browser bridge; Codex/Claude use their native browser modes."
          onChange={(on) => patchFields(on
            ? { browserAccess: "true", networkAllow: "true" }
            : { browserAccess: "false" })}
        />
        {browserOn && String(draft.adapter || "").trim() === "local-agent-host" && browserHostMeta && (
          <p className="dm-cell-empty" style={{ fontSize: 11, marginTop: 4 }}>
            {browserHostMeta.label}: {BROWSER_LANE_LABELS[browserHostMeta.browserLane] || BROWSER_LANE_LABELS["env-signal"]}
          </p>
        )}
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

      <DrawerSection title="Orchestration">
        <div className="dm-record-field">
          <span>orchestrationConfig</span>
          <button
            type="button"
            className="dm-btn-outline"
            disabled={saving}
            onClick={() => onOpenGraphSidecar?.()}
          >
            {getOrchestrationGraphUiState(draft.orchestrationConfig ?? draft.orchestrationGraph) === "populated" ? "Open workflow" : "Create workflow"}
          </button>
        </div>
      </DrawerSection>

      <DrawerSection title="Response & History">
        <SandboxTraceFieldButton
          label="lastRunId"
          value={draft.lastRunId}
          disabled={saving}
          onOpen={() => onOpenTraceSidecar?.({ field: "lastRunId", runId: draft.lastRunId })}
        />

        <SandboxTraceFieldButton
          label="lastSourceId"
          value={draft.lastSourceId}
          disabled={saving}
          onOpen={() => onOpenTraceSidecar?.({ field: "lastSourceId" })}
        />

        <label className="dm-record-field dm-field-link">
          <span>lastResponse</span>
          <button
            type="button"
            className="dm-field-link__btn"
            disabled={saving || !draft.lastResponse}
            onClick={() => onOpenTraceSidecar?.({ field: "lastResponse" })}
          >
            {draft.lastResponse ? "View run trace" : "—"}
          </button>
          <span className="dm-field-link__hint">Run output — not the graph builder</span>
        </label>

        <label className="dm-record-field">
          <span>status</span>
          <div className="dm-field-link__row">
            <StatusPill value={draft.status} />
            {(draft.lastRunId || draft.lastResponse) && (
              <button
                type="button"
                className="dm-btn-ghost"
                disabled={saving}
                onClick={() => onOpenTraceSidecar?.({ field: "lastResponse", runId: draft.lastRunId })}
              >
                View latest run
              </button>
            )}
          </div>
        </label>

        {draft.lastTested && (
          <label className="dm-record-field">
            <span>lastTested</span>
            <input readOnly value={draft.lastTested} />
          </label>
        )}

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

function CodexSitesRecordFields({ draft, setDraft, table, saving, onSave, rowIndex }) {
  const [sites, setSites] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [sitesMessage, setSitesMessage] = useState("");
  const selectedUrl = String(draft?.url || "").trim();

  useEffect(() => {
    let cancelled = false;
    setLoadingSites(true);
    setSitesMessage("");
    fetch("/api/workspace/codex-sites", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        const nextSites = Array.isArray(payload.sites)
          ? payload.sites.map((site) => normalizeCodexSiteRecord(site)).filter((site) => isCodexSiteUrl(site.url))
          : [];
        setSites(nextSites);
        setSitesMessage(nextSites.length ? "" : "No Codex Sites are available from the workspace adapter.");
      })
      .catch((error) => {
        if (cancelled) return;
        setSites([]);
        setSitesMessage(error?.message || "Codex Sites adapter unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSites(false);
      });
    return () => { cancelled = true; };
  }, []);

  function patchFields(fields) {
    setDraft((current) => ({ ...current, ...fields }));
    onSave((config) => Object.entries(fields).reduce(
      (nextConfig, [column, value]) => updateTableCell(nextConfig, table, rowIndex, column, value),
      config
    ));
  }

  function selectSite(url) {
    const site = sites.find((item) => item.url === url);
    if (!site) return;
    patchFields(codexSiteRecordToRow(site));
  }

  return (
    <div className="dm-codex-sites-config">
      <DrawerSection title="Codex Site Binding" defaultOpen>
        <label className="dm-record-field">
          <span>Available site</span>
          <StaticSelect
            value={selectedUrl}
            disabled={!table.mutable || saving || loadingSites || sites.length === 0}
            placeholder={loadingSites ? "Loading Codex Sites..." : "Select Codex Site..."}
            options={sites.map((site) => ({
              value: site.url,
              label: site.Name,
              source: site.url,
            }))}
            onChange={selectSite}
          />
          {sitesMessage && <span className="dm-cell-empty">{sitesMessage}</span>}
        </label>
        {selectedUrl && (
          <a className="dm-btn-outline dm-codex-sites-open-link" href={selectedUrl} target="_blank" rel="noreferrer">
            <Link2 size={13} />Open selected site
          </a>
        )}
      </DrawerSection>
      <DrawerSection title="Bound Row" defaultOpen>
        {["Name", "app", "client", "url", "status", "accessMode", "dashboardId", "lastRecordedAt", "notes"].map((column) => (
          <RecordFieldEditor
            key={column}
            table={table}
            tables={[]}
            column={column}
            value={String(draft?.[column] ?? "")}
            saving={saving}
            editable={false}
            onDraft={() => {}}
            onCommit={() => {}}
            onExpandJson={() => {}}
          />
        ))}
      </DrawerSection>
    </div>
  );
}

function DataModelRecordDrawer({
  table,
  tables,
  workspaceConfig,
  rowIndex,
  row,
  saving,
  onClose,
  onSave,
  onFocusSandboxRow,
  initialSidecar,
  onClearInitialSidecar,
}) {
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
  const [creatingWorkflowCanvas, setCreatingWorkflowCanvas] = useState(false);
  const [creatingDataSource, setCreatingDataSource] = useState(false);
  const [createdDataSourceMeta, setCreatedDataSourceMeta] = useState(null);
  const [dataSourceMessage, setDataSourceMessage] = useState("");
  const [cockpitBusy, setCockpitBusy] = useState("");
  const [cockpitCollapsed, setCockpitCollapsed] = useState(false);
  // CMS SDK v1.5.1 — a staged, constructed resolver awaiting one-screen review.
  // null until the operator clicks "Construct resolver"; cleared on apply/cancel.
  const [resolverConstruct, setResolverConstruct] = useState(null);
  const [resolverConstructBusy, setResolverConstructBusy] = useState(false);
  const [resolverConstructMessage, setResolverConstructMessage] = useState("");
  // Real runtime truth for the creation cockpit: which auth refs resolve in the
  // server runtime, and the live source-records sidecar. Fetched (never guessed)
  // so auth/refresh readiness reflect actual state, and refreshed after actions.
  const [creationSignals, setCreationSignals] = useState({ configuredEnvRefs: [], sourceRecords: {} });
  const [creationReceipts, setCreationReceipts] = useState([]);
  const [sidecarMode, setSidecarMode] = useState(null);
  const [traceField, setTraceField] = useState(null);
  const [traceRunId, setTraceRunId] = useState("");
  const drawerScrollRef = useRef(null);
  const drawerKeyRef = useRef("");
  const router = useRouter();

  useEffect(() => {
    const drawerKey = `${table.id || table.objectId || table.source}:${rowIndex}:${row?.Name || row?.id || ""}`;
    const sameDrawerRecord = drawerKeyRef.current === drawerKey;
    drawerKeyRef.current = drawerKey;
    setDraft(row || {});
    setPendingColumns(table.columns || []);
    setPendingHidden(table.fieldSettings?.hidden || []);
    if (!sameDrawerRecord) {
      setEditMode(false);
      setTestMessage("");
      setSandboxMessage("");
      setSandboxHistory([]);
      setSandboxHistoryMessage("");
      setExpandedJson(null);
      setCreatingWorkflowCanvas(false);
      setCreatingDataSource(false);
      setCreatedDataSourceMeta(null);
      setDataSourceMessage("");
      setCreationReceipts([]);
      setCockpitCollapsed(false);
      requestAnimationFrame(() => {
        if (drawerScrollRef.current) drawerScrollRef.current.scrollTop = 0;
      });
    }
    if (initialSidecar?.mode === "trace") {
      setSidecarMode("trace");
      setTraceField(initialSidecar.field || "lastResponse");
      setTraceRunId(String(initialSidecar.runId || row?.lastRunId || "").trim());
    } else if (!sameDrawerRecord) {
      setSidecarMode(null);
      setTraceField(null);
      setTraceRunId("");
    }
  }, [row, rowIndex, initialSidecar, table.id, table.objectId, table.source, table.columns, table.fieldSettings?.hidden]);

  // Load real cockpit truth (configured auth refs + source-records sidecar) when
  // an API Registry row is open. The creation cockpit derives auth/refresh
  // readiness from these — never guessed, never faked.
  useEffect(() => {
    if (table.objectType !== "api-registry" || rowIndex === null || rowIndex === undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const [statusRes, wsRes] = await Promise.all([
          fetch("/api/workspace/env-status", { cache: "no-store" }),
          fetch("/api/workspace", { cache: "no-store" }),
        ]);
        const status = statusRes.ok ? await statusRes.json() : {};
        const ws = wsRes.ok ? await wsRes.json() : {};
        if (cancelled) return;
        setCreationSignals({
          configuredEnvRefs: Array.isArray(status.configuredEnvRefs) ? status.configuredEnvRefs : [],
          sourceRecords: ws.workspaceSourceRecords && typeof ws.workspaceSourceRecords === "object"
            ? ws.workspaceSourceRecords
            : {},
        });
      } catch {
        /* leave signals as-is — cockpit degrades to pending, never fakes */
      }
    })();
    return () => { cancelled = true; };
  }, [table.objectType, table.objectId, rowIndex]);

  if (rowIndex === null || rowIndex === undefined || !row) return null;

  const isApiRegistry = table.objectType === "api-registry";
  const isSandbox = table.objectType === "sandbox-environment";
  const isCodexSitesObject = table.objectId === CODEX_SITES_OBJECT_ID;
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
      if (isApiRegistry) {
        if (payload.ok) {
          pushReceipt({ kind: "api-test", ok: true, detail: `Tested — HTTP ${payload.status ?? 200}${payload.usedServerSecret ? " · used server secret" : ""}.` });
        } else {
          const recovery = classifyCreationError({ phase: "test", httpStatus: payload.status, detail: redactSecretsFromText(payload.error || `HTTP ${payload.status ?? ""} failed`) });
          pushReceipt({ kind: "api-test", ok: false, detail: `${recovery.safeDetail}. ${recovery.requiredAction}` });
        }
      }
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

  function ensureSandboxColumns(config, sandboxTable) {
    let next = config;
    let current = sandboxTable;
    for (const field of [
      "orchestrationDraftConfig",
      "orchestrationDraftStatus",
      "orchestrationDraftUpdatedAt",
      "orchestrationDraftBaseVersion",
      "orchestrationDraftTestPassed",
      "orchestrationDraftTestedConfig",
      "description",
      "connectorKind",
      "executionLane"
    ]) {
      if (!current.columns.includes(field)) {
        next = addTableField(next, current, field);
        const tables = listWorkspaceDataModelTables(next);
        current = tables.find((t) => t.objectId === sandboxTable.objectId) || current;
      }
    }
    return { config: next, sandboxTable: current };
  }

  function drawerId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
  }

  function addWorkflowFolderShortcut(dataModel, workflow) {
    const objects = Array.isArray(dataModel?.objects) ? dataModel.objects : [];
    const seededObjects = objects.some((object) => object?.id === "nav-folders")
      ? objects
      : [
          ...objects,
          {
            id: "nav-folders",
            label: "Custom Folders",
            source: "Custom Folders",
            objectType: "custom",
            icon: "Folder",
            columns: ["name", "order", "collapsed", "items"],
            rows: [],
            binding: { mode: "manual", source: "Custom Folders" }
          }
        ];
    const navIndex = seededObjects.findIndex((object) => object?.id === "nav-folders");
    const navObject = seededObjects[navIndex];
    const rows = Array.isArray(navObject?.rows) ? navObject.rows : [];
    const folderName = "Builder";
    const item = {
      id: drawerId("item"),
      type: "workflow",
      objectId: workflow.objectId,
      rowId: workflow.rowId,
      fieldName: "orchestrationConfig",
      label: workflow.label,
      builderManaged: true,
      icon: "GitBranch",
      color: "#111827",
      iconBg: "#f3f4f6"
    };
    const existingFolder = rows.find((row) => String(row?.name || "").trim().toLowerCase() === folderName.toLowerCase());
    const nextRows = existingFolder
      ? rows.map((row) => {
          if (row !== existingFolder) return row;
          const items = Array.isArray(row.items) ? row.items : [];
          const exists = items.some((entry) => entry?.type === "workflow" && entry?.objectId === item.objectId && entry?.rowId === item.rowId);
          return exists ? row : { ...row, collapsed: false, items: [...items, item] };
        })
      : [
          ...rows,
          {
            id: drawerId("folder"),
            name: folderName,
            order: rows.length,
            collapsed: false,
            icon: "Folder",
            color: "#f97316",
            iconBg: "#fff7ed",
            items: [item]
          }
        ];
    return {
      ...dataModel,
      objects: seededObjects.map((object, index) => index === navIndex ? { ...navObject, rows: nextRows } : object)
    };
  }

  function workflowGraphFromApiRegistry(registryRow) {
    const graph = buildDefaultOrchestrationGraphFromRegistry(registryRow, {
      rootPath: creationProfile?.arrayPath || "",
    });
    const humanInputNode = {
      id: "human-input",
      type: "human-input",
      label: "Human Input",
      subtitle: "Manual trigger",
      config: {
        action: "form",
        title: "Run API workflow",
        instructions: `Trigger ${String(registryRow?.integrationId || "this API").trim()} with optional inputs.`,
        required: false,
        requiresInput: false,
        fields: []
      }
    };
    return {
      ...graph,
      nodes: [humanInputNode, ...(Array.isArray(graph.nodes) ? graph.nodes : [])],
      edges: [
        { from: "human-input", to: "input", passes: "manual-input" },
        ...(Array.isArray(graph.edges) ? graph.edges : [])
      ]
    };
  }

  async function openWorkflowCanvasFromRegistry() {
    const integrationId = String(draft?.integrationId || "").trim();
    if (!integrationId) {
      setDataSourceMessage("This API Registry row needs an integrationId before a workflow can use it.");
      return;
    }
    setCreatingWorkflowCanvas(true);
    setDataSourceMessage("");
    try {
      const currentRes = await fetch("/api/workspace", { cache: "no-store" });
      const currentPayload = await currentRes.json();
      if (!currentRes.ok || !currentPayload.workspaceConfig) {
        throw new Error(currentPayload.error || "Failed to load workspace");
      }
      let next = currentPayload.workspaceConfig;
      const existingWorkflow = (() => {
        const objects = Array.isArray(next?.dataModel?.objects) ? next.dataModel.objects : [];
        for (const object of objects) {
          if (object?.objectType !== "sandbox-environment") continue;
          for (const row of Array.isArray(object.rows) ? object.rows : []) {
            const matches = findSandboxRowsForRegistry({ dataModel: { objects: [object] } }, integrationId).some((candidate) => candidate === row);
            if (matches) return { objectId: object.id, rowName: row.Name };
          }
        }
        return null;
      })();
      if (existingWorkflow?.objectId && existingWorkflow?.rowName) {
        router.push(`/workflows?object=${encodeURIComponent(existingWorkflow.objectId)}&row=${encodeURIComponent(existingWorkflow.rowName)}&field=orchestrationConfig`);
        return;
      }

      let sandboxTable = listWorkspaceDataModelTables(next).find((t) => t.objectType === "sandbox-environment");
      if (!sandboxTable) {
        next = createTypedBusinessObject(next, {
          name: "Sandbox Environments",
          objectType: "sandbox-environment"
        });
        sandboxTable = listWorkspaceDataModelTables(next).find((t) => t.objectType === "sandbox-environment");
      }
      if (!sandboxTable) throw new Error("No sandbox workflow object exists.");
      const ensured = ensureSandboxColumns(next, sandboxTable);
      next = ensured.config;
      sandboxTable = ensured.sandboxTable;

      const rows = Array.isArray(sandboxTable.rows) ? sandboxTable.rows : [];
      const baseRowId = slugifyName(`${integrationId}-workflow`) || "api-workflow";
      const existingNames = new Set(rows.map((row) => String(row?.Name || row?.name || row?.id || "").trim()));
      let rowId = baseRowId;
      let suffix = 2;
      while (existingNames.has(rowId)) {
        rowId = `${baseRowId}-${suffix}`;
        suffix += 1;
      }
      const nowIso = new Date().toISOString();
      const draftGraph = workflowGraphFromApiRegistry(draft);
      const workflowRow = {
        Name: rowId,
        runLocality: "local",
        schedulerRegistryId: "",
        runtime: "node",
        adapter: "local-agent-host",
        agentHost: "claude_local",
        intelligenceType: "agent-host",
        localModel: "",
        localEndpoint: "",
        intelligenceAdapterMode: "ollama",
        envRefs: "",
        networkAllow: "false",
        allowList: "",
        instructions: `Draft workflow for ${integrationId}. The canvas starts with a human input trigger and an API Registry call node.`,
        command: "",
        orchestrationDraftConfig: serializeOrchestrationGraph(draftGraph),
        orchestrationDraftStatus: "draft",
        orchestrationDraftUpdatedAt: nowIso,
        orchestrationDraftBaseVersion: "0",
        orchestrationDraftTestPassed: false,
        orchestrationDraftTestedConfig: "",
        timeoutMs: "180000",
        resolverTemplateId: String(draft?.resolverTemplateId || "").trim(),
        connectorKind: "local-agent-host",
        executionLane: "workflow",
        status: "draft",
        lastTested: "",
        lastRunId: "",
        lastSourceId: "",
        lastResponse: "",
        description: String(draft?.description || "").trim()
      };
      next = appendRowsToTable(next, sandboxTable, [workflowRow]);
      const finalDataModel = addWorkflowFolderShortcut(next.dataModel, {
        objectId: sandboxTable.objectId,
        rowId,
        label: rowId
      });
      const patchBody = { dataModel: finalDataModel };
      const preflightResponse = await fetch("/api/workspace/patch/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patchBody)
      });
      const preflightPayload = await preflightResponse.json();
      if (!preflightResponse.ok || !preflightPayload.ok) {
        throw new Error("Workflow creation is blocked by workspace policy.");
      }
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patchBody)
      });
      const payload = await response.json();
      if (!response.ok || !payload.workspaceConfig) {
        throw new Error("Workflow creation failed. Try again.");
      }
      router.push(`/workflows?object=${encodeURIComponent(sandboxTable.objectId)}&row=${encodeURIComponent(rowId)}&field=orchestrationConfig`);
    } catch (err) {
      setDataSourceMessage(redactSecretsFromText(err.message || "Failed to open workflow canvas"));
    } finally {
      setCreatingWorkflowCanvas(false);
    }
  }

  function createDataSourceFromRegistry() {
    const integrationId = String(draft?.integrationId || "").trim();
    if (!integrationId) {
      setDataSourceMessage("This API Registry row needs an integrationId before a Data Source can reference it.");
      return;
    }
    if (findDataSourceRowsForRegistry(workspaceConfig, integrationId).length > 0) {
      setDataSourceMessage("A Data Source already references this API. Open it instead of creating a duplicate.");
      return;
    }
    setCreatingDataSource(true);
    setDataSourceMessage("");
    try {
      let createdMeta = null;
      onSave((config) => {
        let next = config;
        if (findDataSourceRowsForRegistry(next, integrationId).length > 0) return next;
        // Dedicated data-source object per API (one object = one live integration,
        // matching the refresh-sources contract which binds integrationId per object).
        const dsName = `${String(draft?.Name || integrationId).trim()} Source`;
        const beforeIds = new Set((next.dataModel?.objects || []).map((o) => o.id));
        next = createTypedBusinessObject(next, { name: dsName, objectType: "data-source" });
        const newObj = (next.dataModel?.objects || []).find((o) => o.objectType === "data-source" && !beforeIds.has(o.id));
        if (!newObj) return next;
        const sourceTable = listWorkspaceDataModelTables(next).find((t) => t.objectId === newObj.id);
        const profile = profileApiResponse(draft?.lastResponse);
        const newRow = buildDataSourceRowFromApiRegistry(next, draft, {
          entityType: profile?.parsed ? profile.suggestedEntityType : undefined,
        });
        if (sourceTable) next = appendRowsToTable(next, sourceTable, [newRow]);
        // Make the object live-backed so refresh-sources hydrates the sidecar
        // (keyed by object id). Without this binding, refresh skips it as
        // "not-live-backed" and the journey would never close.
        next = {
          ...next,
          dataModel: {
            ...next.dataModel,
            objects: (next.dataModel.objects || []).map((o) =>
              o.id === newObj.id
                ? {
                    ...o,
                    sourceId: newRow.sourceId,
                    binding: {
                      mode: "integration",
                      lane: "data-source",
                      sourceStorage: "workspace-source-records",
                      integrationId,
                      sourceId: newRow.sourceId,
                      source: newRow.Name,
                    },
                  }
                : o
            ),
          },
        };
        createdMeta = { objectId: newObj.id, name: newRow.Name, sourceId: newRow.sourceId };
        return next;
      });
      if (createdMeta) {
        setCreatedDataSourceMeta(createdMeta);
        setDataSourceMessage("Data Source created and live-backed. Use Refresh to pull records into the workspace — nothing auto-fetches.");
        pushReceipt({ kind: "data-source-created", ok: true, detail: `Created "${createdMeta.name}" (sourceId ${createdMeta.sourceId}), live-backed via registryId ${integrationId}.` });
        reloadCreationSignals();
      } else {
        setDataSourceMessage("A Data Source already references this API.");
      }
    } finally {
      setCreatingDataSource(false);
    }
  }

  function openDataSourceRow(objectIdOverride) {
    const objectId = String(objectIdOverride || createdDataSourceMeta?.objectId || "").trim();
    if (!objectId) return;
    onClose();
    router.push(`/data-model?object=${encodeURIComponent(objectId)}`);
  }

  // Append a creation receipt (test / create / refresh outcomes). Secret-safe —
  // detail strings are caller-redacted; receipts hold no values.
  function pushReceipt(entry) {
    setCreationReceipts((cur) => [{ at: new Date().toISOString(), ...entry }, ...cur].slice(0, 12));
  }

  // Pull real cockpit truth: configured auth refs (server-resolved, slugs only)
  // + the live source-records sidecar. Safe to call repeatedly; never throws.
  async function reloadCreationSignals() {
    try {
      const [statusRes, wsRes] = await Promise.all([
        fetch("/api/workspace/env-status", { cache: "no-store" }),
        fetch("/api/workspace", { cache: "no-store" }),
      ]);
      const status = statusRes.ok ? await statusRes.json() : {};
      const ws = wsRes.ok ? await wsRes.json() : {};
      setCreationSignals({
        configuredEnvRefs: Array.isArray(status.configuredEnvRefs) ? status.configuredEnvRefs : [],
        sourceRecords: ws.workspaceSourceRecords && typeof ws.workspaceSourceRecords === "object"
          ? ws.workspaceSourceRecords
          : {},
      });
    } catch {
      /* signals stay at their last value — the cockpit degrades to pending, never fakes */
    }
  }

  // Refresh the linked Data Source through the sidecar dispatcher
  // (refresh-sources, plural) keyed by the data-source OBJECT id, so the records
  // land in the source-records sidecar the cockpit reads — then reload signals
  // so the refresh step flips to complete from real state.
  async function refreshLinkedSource({ objectId }) {
    const sourceObjectId = String(objectId || "").trim();
    if (!sourceObjectId) {
      setDataSourceMessage("No linked Data Source object to refresh yet.");
      return;
    }
    setDataSourceMessage("");
    try {
      const res = await fetch("/api/workspace/refresh-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceIds: [sourceObjectId] }),
      });
      const payload = await res.json();
      const result = Array.isArray(payload.refreshed) ? payload.refreshed.find((r) => r.sourceId === sourceObjectId) : null;
      if (res.ok && result) {
        const msg = `Refreshed — ${result.recordCount ?? 0} record(s) pulled into the sidecar.`;
        setDataSourceMessage("");
        pushReceipt({ kind: "source-refresh", ok: true, detail: msg });
      } else if (res.ok && Array.isArray(payload.skipped) && payload.skipped.includes(sourceObjectId)) {
        const detail = (payload.skippedDetail || []).find((d) => d.sourceId === sourceObjectId);
        const recovery = classifyCreationError({ phase: "refresh", reason: detail?.reason });
        setDataSourceMessage(`Refresh skipped: ${recovery.safeDetail}. ${recovery.requiredAction}`);
        pushReceipt({ kind: "source-refresh", ok: false, detail: `Skipped (${recovery.errorKind}). ${recovery.requiredAction}` });
      } else {
        const recovery = classifyCreationError({ phase: "refresh", httpStatus: res.status, detail: redactSecretsFromText(payload.error || "Refresh failed") });
        setDataSourceMessage(`${recovery.safeDetail} — ${recovery.requiredAction}`);
        pushReceipt({ kind: "source-refresh", ok: false, detail: `${recovery.safeDetail}. ${recovery.requiredAction}` });
      }
      await reloadCreationSignals();
    } catch (err) {
      setDataSourceMessage(redactSecretsFromText(err.message || "Refresh failed"));
    }
  }

  // CMS SDK v1.5.1 — construct the governed resolver from the tested response
  // shape and stage it for one-screen review. No blank form: rootPath / idField
  // / entityType / auth header are all derived (or surfaced as `blanks` when the
  // row is missing a target). Nothing is written until the operator confirms.
  function stageResolverConstruct() {
    const integrationId = String(draft?.integrationId || "").trim();
    if (!integrationId) {
      setResolverConstructMessage("This API Registry row needs an integrationId before a resolver can be constructed.");
      return;
    }
    const profile = profileApiResponse(draft?.lastResponse);
    const recommendation = profile ? recommendResolver(profile) : null;
    const result = constructResolverProposal({
      row: draft,
      profile,
      recommendation,
      recordRef: { objectId: table?.objectId, rowName: draft?.Name || integrationId },
    });
    setResolverConstructMessage("");
    setResolverConstruct(result);
  }

  // Apply the staged resolver through the GOVERNED lane only (helper/apply →
  // writeResolverProposalFile), mark the row wired (resolverTemplateId), then
  // re-test through the resolver so the user sees green without leaving the
  // drawer. config-driven (Nango) and unsupported kinds never reach here.
  async function applyResolverConstruct() {
    const staged = resolverConstruct;
    if (!staged || staged.mode !== "file" || !staged.proposal || !staged.ok) return;
    const integrationId = String(draft?.integrationId || "").trim();
    setResolverConstructBusy(true);
    setResolverConstructMessage("");
    try {
      const res = await fetch("/api/workspace/helper/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposals: [staged.proposal], reviewedBy: "cockpit" }),
      });
      const payload = await res.json();
      const appliedOne = Array.isArray(payload.applied)
        ? payload.applied.find((a) => a.type === "resolver.create")
        : null;
      if (!res.ok || !appliedOne) {
        const skip = Array.isArray(payload.skipped) ? payload.skipped[0]?.reason : null;
        const msg = redactSecretsFromText(skip || payload.error || payload.guidance || "Resolver apply failed");
        setResolverConstructMessage(msg);
        pushReceipt({ kind: "resolver-construct", ok: false, detail: msg });
        return;
      }
      // Mark the row wired so the creation journey closes (resolverTemplateId
      // becomes a real registered resolver id, not the "custom-http" passthrough).
      onSave((config) => {
        const t = listWorkspaceDataModelTables(config).find((x) => x.objectId === table?.objectId);
        if (!t) return config;
        const idx = (t.rows || []).findIndex((r) => String(r?.integrationId || "").trim() === integrationId);
        if (idx < 0) return config;
        return updateTableCell(config, t, idx, "resolverTemplateId", integrationId);
      });
      pushReceipt({
        kind: "resolver-construct",
        ok: true,
        detail: `Resolver "${appliedOne.resolverFilename || integrationId}" constructed and wired.`,
      });
      // Re-test through the new resolver — the secret stays server-side.
      try {
        const testRes = await fetch("/api/workspace/test-source", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ integrationId, binding: {} }),
        });
        const testPayload = await testRes.json();
        if (testPayload?.ok) {
          pushReceipt({ kind: "resolver-test", ok: true, detail: `Resolver returned ${testPayload.recordCount ?? 0} record(s).` });
        } else {
          pushReceipt({
            kind: "resolver-test",
            ok: false,
            detail: redactSecretsFromText(testPayload?.error || testPayload?.reason || "test-source did not return ok"),
          });
        }
      } catch {
        /* non-fatal — the resolver is written; refresh re-tests it later */
      }
      setResolverConstruct(null);
      await reloadCreationSignals();
    } catch (err) {
      setResolverConstructMessage(redactSecretsFromText(err.message || "Resolver apply failed"));
    } finally {
      setResolverConstructBusy(false);
    }
  }

  // The creation cockpit emits a single action descriptor per step; map it to
  // the drawer's existing governed handlers. No new mutation paths.
  async function handleCockpitAction(action) {
    if (!action || !action.id) return;
    const tag = `${action.stepId || "workflow"}:${action.id}`;
    setCockpitBusy(tag);
    try {
      switch (action.id) {
        case "edit":
          setEditMode(true);
          setCockpitCollapsed(true);
          break;
        case "open-settings":
          onClose();
          router.push(action.href || "/settings");
          break;
        case "construct-resolver":
          // CMS SDK v1.5.1 — construct the governed resolver from the tested
          // response shape (no blank form) and stage it for one-screen review.
          stageResolverConstruct();
          break;
        case "open-resolver":
          // Hand off to the governed helper widget — the resolver proposal lane.
          // Carries the integrationId so the helper can scope a resolver proposal.
          onClose();
          router.push(`/data-model?helper=open&resolverFor=${encodeURIComponent(String(draft?.integrationId || "").trim())}`);
          break;
        case "test":
          await testApiRecord();
          await reloadCreationSignals();
          break;
        case "create-data-source":
          createDataSourceFromRegistry();
          break;
        case "open-data-source":
          openDataSourceRow(action.objectId);
          break;
        case "create-workflow-canvas":
        case "open-workflow-canvas":
          await openWorkflowCanvasFromRegistry();
          break;
        case "refresh-source":
          await refreshLinkedSource({ objectId: action.objectId });
          break;
        default:
          break;
      }
    } finally {
      setCockpitBusy("");
    }
  }

  const creationState = isApiRegistry
    ? deriveApiRegistryCreationState({
        workspaceConfig,
        registryRow: draft,
        sourceRecords: creationSignals.sourceRecords,
        runtime: { configuredEnvRefs: creationSignals.configuredEnvRefs },
      })
    : null;
  // Shape analysis from the tested response — drives the resolver recommendation
  // and the field candidates the operator sees before creating a Data Source.
  const creationProfile = isApiRegistry && creationState?.tested
    ? profileApiResponse(draft?.lastResponse)
    : null;
  const creationResolverRec = creationProfile ? recommendResolver(creationProfile) : null;
  // Preview the exact Data Source that "Create Data Source" will produce, before
  // any mutation — shown once tested and while no source is linked yet.
  const creationDataSourcePreview = isApiRegistry && creationState?.tested && !creationState.sourceExists
    ? {
        row: buildDataSourceRowFromApiRegistry(workspaceConfig, draft, {
          entityType: creationProfile?.suggestedEntityType,
        }),
        fields: creationProfile?.fields || [],
      }
    : null;

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

  function closeSidecar() {
    setSidecarMode(null);
    setTraceField(null);
    setTraceRunId("");
    onClearInitialSidecar?.();
  }

  function openWorkflowView() {
    const rowId = String(draft?.Name || draft?.name || draft?.slug || draft?.id || "").trim();
    const field = draft?.orchestrationConfig !== undefined ? "orchestrationConfig" : "orchestrationGraph";
    if (!table.objectId || !rowId) return;
    onClearInitialSidecar?.();
    router.push(
      `/workflows?object=${encodeURIComponent(table.objectId)}&row=${encodeURIComponent(rowId)}&field=${encodeURIComponent(field)}`
    );
  }

  function openTraceSidecar({ field, runId } = {}) {
    setSidecarMode("trace");
    setTraceField(field || "lastResponse");
    setTraceRunId(String(runId || draft?.lastRunId || "").trim());
    onClearInitialSidecar?.();
  }

  const drawerWide = sidecarMode === "trace";
  const hideRecordFields = isSandbox && sidecarMode === "trace";

  return (
    <>
      <div className="dm-record-backdrop" onClick={onClose} />
      <aside
        className={`dm-record-drawer${drawerWide ? " dm-record-drawer-wide" : ""}`}
        aria-label="Record details"
      >
        <header className="dm-record-drawer-head">
          <div>
            <p>Record</p>
            <h2 title={draft.Name || draft.integrationId || draft.id || `Row ${rowIndex + 1}`}>
              {draft.Name || draft.integrationId || draft.id || `Row ${rowIndex + 1}`}
            </h2>
          </div>
          <div className="dm-record-drawer-actions">
            {isSandbox && sidecarMode !== "graph" && sidecarMode !== "trace" && (
              <button
                type="button"
                className="dm-btn-primary-sm dm-record-head-run"
                disabled={sandboxRunning || saving || !String(draft.Name || "").trim()}
                onClick={runSandbox}
              >
                <Play size={13} aria-hidden />
                {sandboxRunning ? "Running…" : "Execute"}
              </button>
            )}
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
        {table.objectType === "data-source" && (
          <SourceTestPanel
            status={draft.status}
            testing={testing}
            testMessage={testMessage}
            disabled={saving}
            onTest={testApiRecord}
          />
        )}
        <div className="dm-record-scroll" ref={drawerScrollRef}>
        {isApiRegistry && creationState && (
          <>
            <ApiRegistryCreationCockpit
              state={creationState}
              onAction={handleCockpitAction}
              busyAction={cockpitBusy}
              disabled={saving || creatingDataSource || testing || creatingWorkflowCanvas}
              profile={creationProfile}
              resolverRec={creationResolverRec}
              receipts={creationReceipts}
              dataSourcePreview={creationDataSourcePreview}
              defaultCollapsed={cockpitCollapsed}
              hideWhenComplete
              onCollapsedChange={setCockpitCollapsed}
            />
            {resolverConstruct ? (
              <section className="dm-api-action-card dm-cockpit" aria-label="Construct resolver review">
                <div className="dm-cockpit-shape">
                  <div className="dm-cockpit-shape-head">
                    <p className="dm-api-action-card-eyebrow">Make this API usable · {resolverConstruct.connectorKind}</p>
                    {resolverConstruct.detected?.confidence ? (
                      <span className={`dm-db-status ${resolverConstruct.detected.confidence === "high" ? "ok" : resolverConstruct.detected.confidence === "low" ? "bad" : "warn"}`}>
                        <span />
                        {resolverConstruct.detected.confidence} confidence
                      </span>
                    ) : null}
                  </div>
                  {resolverConstruct.detected?.sentence ? (
                    <p className="dm-cockpit-step-desc"><b>{resolverConstruct.detected.sentence}</b></p>
                  ) : null}
                  <p className="dm-cockpit-step-desc">{resolverConstruct.reason}</p>
                  {resolverConstruct.mode === "file" && resolverConstruct.authRef ? (
                    <p className="dm-cockpit-step-hint">Safe: the secret stays server-side via <code>{resolverConstruct.authRef}</code> — it never reaches the browser or the generated file.</p>
                  ) : null}
                  {resolverConstruct.mode === "file" && resolverConstruct.prefill ? (
                    <div className="dm-cockpit-fields">
                      <span className="dm-cockpit-field"><b>records at</b>{resolverConstruct.prefill.rootPath || "top-level"}</span>
                      <span className="dm-cockpit-field"><b>row id</b>{resolverConstruct.prefill.idField}</span>
                      <span className="dm-cockpit-field"><b>entity</b>{resolverConstruct.prefill.entityType}</span>
                      {resolverConstruct.proposal?.target?.path ? (
                        <span className="dm-cockpit-field"><b>file</b>{resolverConstruct.proposal.target.path}</span>
                      ) : null}
                      {resolverConstruct.endpoint ? (
                        <span className="dm-cockpit-field"><b>endpoint</b>{resolverConstruct.endpoint}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {resolverConstruct.mode === "config-driven" && resolverConstruct.endpoint ? (
                    <div className="dm-cockpit-fields">
                      <span className="dm-cockpit-field"><b>type</b>config-driven (no file)</span>
                      <span className="dm-cockpit-field"><b>endpoint</b>{resolverConstruct.endpoint}</span>
                    </div>
                  ) : null}
                  {resolverConstruct.blanks?.length ? (
                    <p className="dm-cockpit-step-hint">Missing on the row: {resolverConstruct.blanks.join(", ")}</p>
                  ) : null}
                  {resolverConstruct.mode === "file" && resolverConstruct.ok ? (
                    <p className="dm-cockpit-step-hint">After apply: the resolver file is written via the governed lane, the row is marked wired, and it's re-tested automatically. If the re-test fails, the resolver is still written — the receipt distinguishes &ldquo;written&rdquo; from &ldquo;runtime failed&rdquo;.</p>
                  ) : null}
                  {resolverConstructMessage ? <p className="dm-cockpit-step-hint">{resolverConstructMessage}</p> : null}
                  <div className="dm-cockpit-shape-head">
                    {resolverConstruct.mode === "file" && resolverConstruct.ok ? (
                      <button
                        type="button"
                        className="dm-btn-primary-sm"
                        disabled={resolverConstructBusy}
                        onClick={applyResolverConstruct}
                      >
                        {resolverConstructBusy ? "Applying…" : "Apply resolver"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="dm-btn-outline"
                      disabled={resolverConstructBusy}
                      onClick={() => { setResolverConstruct(null); setResolverConstructMessage(""); }}
                    >
                      {resolverConstruct.mode === "file" && resolverConstruct.ok ? "Cancel" : "Dismiss"}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            {dataSourceMessage ? <p className="dm-sandbox-tool-test-msg">{dataSourceMessage}</p> : null}
          </>
        )}
        {isSandbox && sidecarMode !== "graph" && sidecarMode !== "trace" && sandboxMessage && (
          <SandboxRunPanel
            status={draft.status}
            sandboxRunning={sandboxRunning}
            sandboxMessage={sandboxMessage}
            disabled={saving}
            canRun={Boolean(String(draft.Name || "").trim())}
            onRun={runSandbox}
            agentAuthStatus={draft.agentAuthStatus}
            agentAuthHint={
              isSandboxLocalAgentHost(draft) && ["stale", "missing"].includes(String(draft.agentAuthStatus || ""))
                ? "Agent auth may be stale — open the auth panel above."
                : null
            }
          />
        )}
        {isSandbox && sidecarMode !== "graph" && sidecarMode !== "trace" && isSandboxLocalAgentHost(draft) && (
          <SandboxAgentAuthPanel
            objectId={table.objectId}
            rowName={String(draft.Name || "").trim()}
            draft={draft}
            disabled={saving || sandboxRunning}
            onPatchDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          />
        )}
        {isSandbox && sidecarMode === "trace" && (
          <OrchestrationRunTracePanel
            row={draft}
            objectId={table.objectId}
            fieldName={traceField || "lastResponse"}
            selectedRunId={traceRunId}
            onBack={closeSidecar}
            onOpenGraph={openWorkflowView}
          />
        )}
        <div className="dm-record-fields">
          {hideRecordFields ? null : isSandbox ? (
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
              onOpenGraphSidecar={openWorkflowView}
              onOpenTraceSidecar={openTraceSidecar}
            />
          ) : isCodexSitesObject ? (
            <CodexSitesRecordFields
              draft={draft}
              setDraft={setDraft}
              table={table}
              saving={saving}
              onSave={onSave}
              rowIndex={rowIndex}
            />
          ) : groupRecordColumns(table.columns || []).map((section) => (
            <DrawerSection
              key={section.title}
              title={section.title}
              forceOpen={isApiRegistry && editMode}
            >
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
            <DrawerSection title="Fields">
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

const SANDBOX_SIDECAR_COLUMNS = new Set(["orchestrationGraph", "orchestrationConfig", "lastResponse", "lastRunId", "lastSourceId"]);

function sandboxSidecarForColumn(column, row) {
  if (column === "orchestrationGraph" || column === "orchestrationConfig") return null;
  if (column === "lastResponse") return { mode: "trace", field: "lastResponse" };
  if (column === "lastRunId") return { mode: "trace", field: "lastRunId", runId: row?.lastRunId };
  if (column === "lastSourceId") return { mode: "trace", field: "lastSourceId" };
  return null;
}

function isSandboxSidecarCell(table, column) {
  return table?.objectType === "sandbox-environment" && SANDBOX_SIDECAR_COLUMNS.has(column);
}

function DataModelTableSurface({
  table,
  tables,
  workspaceConfig,
  saving,
  onSave,
  onOpenThread,
  focusSandboxRowName,
  focusRecordValue,
  onFocusSandboxRowConsumed,
  onFocusRecordConsumed,
  onFocusSandboxRow,
  selectedRecordIndex,
  onSelectedRecordIndexChange,
}) {
  const router = useRouter();
  const [selectedRow, setSelectedRow] = useState(null);
  const [localSelectedOriginalIndex, setLocalSelectedOriginalIndex] = useState(null);
  const [initialSidecar, setInitialSidecar] = useState(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [addingField, setAddingField] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [mode, setMode] = useState("append");
  const [filterDraft, setFilterDraft] = useState({ fieldId: "", operator: "eq", value: "" });
  const [filterTarget, setFilterTarget] = useState("");
  const [menuColumn, setMenuColumn] = useState("");
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [confirmDeleteSelection, setConfirmDeleteSelection] = useState(false);
  const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState(null);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const [pageSize, setPageSize] = useState(15);
  const [pageIndex, setPageIndex] = useState(0);
  const [search, setSearch] = useState("");
  const fieldInputRef = useRef(null);
  const selectedOriginalIndex = selectedRecordIndex ?? localSelectedOriginalIndex;

  function selectOriginalIndex(index) {
    setLocalSelectedOriginalIndex(index);
    onSelectedRecordIndexChange?.(index);
  }

  useEffect(() => { if (addingField) fieldInputRef.current?.focus(); }, [addingField]);
  useEffect(() => {
    setSelectedRow(null);
    selectOriginalIndex(null);
    setSelectedRows(new Set());
    setConfirmDeleteSelection(false);
    setLastSelectedRowIndex(null);
    setSelectMenuOpen(false);
    setPageIndex(0);
    setSearch("");
  }, [table.id]);

  useEffect(() => {
    setFieldName("");
    setFieldType("text");
    setFilterDraft({ fieldId: table.columns[0] || "", operator: "eq", value: "" });
  }, [table.id, table.columns]);

  const settings = useMemo(() => {
    const fieldSettings = table.fieldSettings || {};
    return {
      hidden: Array.isArray(fieldSettings.hidden) ? fieldSettings.hidden : EMPTY_FIELD_SETTING_LIST,
      order: Array.isArray(fieldSettings.order) ? fieldSettings.order : (table.columns || EMPTY_FIELD_SETTING_LIST),
      sort: Array.isArray(fieldSettings.sort) ? fieldSettings.sort : EMPTY_FIELD_SETTING_LIST,
      filter: fieldSettings.filter || null
    };
  }, [table.fieldSettings, table.columns]);
  const orderedColumns = useMemo(() => mergeColumnOrder(settings.order, table.columns), [settings.order, table.columns]);
  const visibleColumns = useMemo(() => orderedColumns.filter((column) => !settings.hidden.includes(column)), [orderedColumns, settings.hidden]);
  const rowEntries = useMemo(() => {
    const indexed = (table.rows || []).map((row, originalIndex) => ({ row, originalIndex }));
    const needle = search.trim().toLowerCase();
    const filtered = indexed.filter((entry) => {
      if (!rowMatchesFilter(entry.row, settings.filter)) return false;
      if (!needle) return true;
      // Quick search across the visible columns only — additive to the
      // column-level filter clauses, never replaces them.
      return visibleColumns.some((column) => String(entry.row?.[column] ?? "").toLowerCase().includes(needle));
    });
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
  }, [table.rows, settings, search, visibleColumns]);
  const selectedRowCount = selectedRows.size;
  const pageCount = Math.max(1, Math.ceil(rowEntries.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * pageSize;
  const pageEntries = rowEntries.slice(pageStart, pageStart + pageSize);
  const pageEnd = Math.min(pageStart + pageSize, rowEntries.length);
  const pageSelectedCount = pageEntries.filter((entry) => selectedRows.has(entry.originalIndex)).length;
  const allPageSelected = pageEntries.length > 0 && pageSelectedCount === pageEntries.length;

  useEffect(() => {
    if (!focusSandboxRowName || table.objectType !== "sandbox-environment") return;
    const wanted = String(focusSandboxRowName).trim();
    if (!wanted) return;
    const originalIndex = (table.rows || []).findIndex((r) => String(r?.Name || "").trim() === wanted);
    if (originalIndex < 0) return;
    const visibleIndex = rowEntries.findIndex((entry) => entry.originalIndex === originalIndex);
    if (visibleIndex < 0) return;
    const pageForRow = Math.floor(visibleIndex / pageSize);
    setPageIndex(pageForRow);
    setSelectedRow(visibleIndex);
    selectOriginalIndex(originalIndex);
    onFocusSandboxRowConsumed?.();
  }, [focusSandboxRowName, table.id, table.objectType, table.rows, rowEntries, pageSize, onFocusSandboxRowConsumed]);

  useEffect(() => {
    if (!focusRecordValue) return;
    const wanted = String(focusRecordValue).trim();
    if (!wanted) return;
    const originalIndex = (table.rows || []).findIndex((r) => (
      String(r?.integrationId || "").trim() === wanted
      || String(r?.Name || r?.name || r?.slug || r?.id || "").trim() === wanted
    ));
    if (originalIndex < 0) return;
    const visibleIndex = rowEntries.findIndex((entry) => entry.originalIndex === originalIndex);
    if (visibleIndex < 0) return;
    const pageForRow = Math.floor(visibleIndex / pageSize);
    setPageIndex(pageForRow);
    setSelectedRow(visibleIndex);
    selectOriginalIndex(originalIndex);
    onFocusRecordConsumed?.();
  }, [focusRecordValue, table.id, table.rows, rowEntries, pageSize, onFocusRecordConsumed]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    setPageIndex(0);
    setSelectedRow(null);
    setLastSelectedRowIndex(null);
    setSelectMenuOpen(false);
  }, [settings.filter, settings.sort, pageSize, search]);

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

  function openSandboxGraph(column, row) {
    const rowId = String(row?.Name || row?.name || row?.slug || row?.id || "").trim();
    const field = String(column || "orchestrationConfig").trim();
    if (!table.objectId || !rowId) return;
    router.push(
      `/workflows?object=${encodeURIComponent(table.objectId)}&row=${encodeURIComponent(rowId)}&field=${encodeURIComponent(field)}`
    );
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
      filter: null
    }));
  }

  function toggleRowSelection(originalIndex, visibleIndex, event) {
    setConfirmDeleteSelection(false);
    setSelectMenuOpen(false);
    setSelectedRows((current) => {
      const next = new Set(current);
      if (event?.shiftKey && lastSelectedRowIndex !== null) {
        const start = Math.min(lastSelectedRowIndex, visibleIndex);
        const end = Math.max(lastSelectedRowIndex, visibleIndex);
        rowEntries.slice(start, end + 1).forEach((entry) => next.add(entry.originalIndex));
      } else if (next.has(originalIndex)) {
        next.delete(originalIndex);
      } else {
        next.add(originalIndex);
      }
      return next;
    });
    setLastSelectedRowIndex(visibleIndex);
  }

  function clearRowSelection() {
    setSelectedRows(new Set());
    setConfirmDeleteSelection(false);
    setLastSelectedRowIndex(null);
    setSelectMenuOpen(false);
  }

  function selectCurrentPage() {
    setConfirmDeleteSelection(false);
    setSelectedRows((current) => {
      const next = new Set(current);
      pageEntries.forEach((entry) => next.add(entry.originalIndex));
      return next;
    });
    setLastSelectedRowIndex(pageEntries.length ? pageStart : null);
    setSelectMenuOpen(false);
  }

  function toggleCurrentPageSelection() {
    setConfirmDeleteSelection(false);
    setSelectedRows((current) => {
      const next = new Set(current);
      if (allPageSelected) pageEntries.forEach((entry) => next.delete(entry.originalIndex));
      else pageEntries.forEach((entry) => next.add(entry.originalIndex));
      return next;
    });
    setLastSelectedRowIndex(pageEntries.length ? pageStart : null);
    setSelectMenuOpen(false);
  }

  function selectAllFilteredRows() {
    setConfirmDeleteSelection(false);
    setSelectedRows((current) => {
      const next = new Set(current);
      rowEntries.forEach((entry) => next.add(entry.originalIndex));
      return next;
    });
    setLastSelectedRowIndex(rowEntries.length ? 0 : null);
    setSelectMenuOpen(false);
  }

  function deleteSelectedRows() {
    if (!selectedRows.size) return;
    const rowIndexes = Array.from(selectedRows).sort((a, b) => b - a);
    onSave((config) => rowIndexes.reduce((nextConfig, rowIndex) => deleteTableRow(nextConfig, table, rowIndex), config));
    setSelectedRow(null);
    selectOriginalIndex(null);
    setConfirmDeleteSelection(false);
    clearRowSelection();
  }

  const selectedEntry = selectedOriginalIndex === null
    ? (selectedRow === null ? null : rowEntries[selectedRow])
    : rowEntries.find((entry) => entry.originalIndex === selectedOriginalIndex) || null;
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
          {selectedRowCount > 0 && (
            <span className="dm-filter-chip dm-selection-count">
              {pluralize(selectedRowCount, "record")} selected
            </span>
          )}
          {settings.filter?.clauses?.map((clause) => (
            <button key={`${clause.fieldId}:${clause.operator}`} type="button" className="dm-filter-chip" onClick={() => removeFilter(clause.fieldId)}>
              <LucideIcon name={FIELD_TYPE_ICON_NAMES[settings.types?.[clause.fieldId] || inferFieldType(clause.fieldId)] || "Type"} size={12} />
              <span>{clause.fieldId}: {clause.operator}{clause.value !== undefined ? ` ${clause.value}` : ""}</span>
              <X size={12} />
            </button>
          ))}
        </div>
        <div className="dm-records-actions">
          <label className="dm-toolbar-search">
            <Search size={13} aria-hidden="true" />
            <input
              value={search}
              placeholder="Search records"
              onChange={(event) => setSearch(event.target.value)}
              aria-label={`Search ${table.label || "records"}`}
            />
          </label>
          <span className="dm-toolbar-count">
            {(search.trim() || settings.filter?.clauses?.length)
              ? `${rowEntries.length} of ${pluralize(table.rows?.length || 0, "record")}`
              : pluralize(table.rows?.length || 0, "record")}
          </span>
          <span className="dm-toolbar-divider" aria-hidden="true" />
          <span className="dm-filter-anchor">
            <button type="button" className={`dm-btn-ghost${settings.filter?.clauses?.length ? " is-active" : ""}`} onClick={() => setFilterTarget((current) => current === "toolbar" ? "" : "toolbar")}>
              <Filter size={13} />Filter
              {settings.filter?.clauses?.length > 0 && <span className="dm-filter-chip-count">{settings.filter.clauses.length}</span>}
            </button>
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
          </span>
          {table.rows.length > 0 && (
            <button type="button" className="dm-btn-ghost" onClick={() => {
              const blob = new Blob([exportTableAsCsv(table)], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `${table.source.replace(/\s+/g, "-").toLowerCase()}.csv`;
              a.click(); URL.revokeObjectURL(url);
            }}><Download size={13} />Export CSV</button>
          )}
          {table.mutable && <button type="button" className="dm-btn-ghost" onClick={() => setCsvOpen((open) => !open)}><Upload size={13} />Import CSV</button>}
          {table.mutable && (
            <button type="button" className="dm-btn-primary-sm" disabled={saving} onClick={() => onSave((config) => addTableRow(config, table))}>
              <Plus size={13} />Add record
            </button>
          )}
          {table.mutable && selectedRowCount > 0 && (
            <>
              <button type="button" className="dm-btn-ghost" disabled={saving} onClick={clearRowSelection}>Cancel selection</button>
              <button type="button" className="dm-btn-danger-sm" disabled={saving} onClick={() => setConfirmDeleteSelection(true)}>
                <Trash2 size={13} />Delete
              </button>
            </>
          )}
        </div>
      </div>
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
        <div className="dm-db-grid-scroll">
        <table className="dm-db-grid">
          <thead>
            <tr>
              <th className="dm-db-rownum dm-db-rownum-head">
                {table.mutable ? (
                  <div className="dm-row-select-head-wrap">
                    <button type="button" className="dm-row-select dm-row-select-all" aria-label={allPageSelected ? "Clear page selection" : "Select current page"} aria-pressed={allPageSelected} onClick={(event) => { event.stopPropagation(); toggleCurrentPageSelection(); }}>
                      <span className="dm-row-select-box" />
                      <span className="dm-row-number">#</span>
                    </button>
                    <button type="button" className="dm-row-select-menu-btn" aria-label="Selection options" aria-expanded={selectMenuOpen} onClick={(event) => { event.stopPropagation(); setSelectMenuOpen((open) => !open); }}>
                      <ChevronDown size={11} />
                    </button>
                    {selectMenuOpen && (
                      <div className="dm-row-select-menu">
                        <button type="button" onClick={selectCurrentPage}>Select page</button>
                        <button type="button" onClick={selectAllFilteredRows}>Select all filtered</button>
                        <button type="button" disabled={!selectedRowCount} onClick={clearRowSelection}>Clear selection</button>
                      </div>
                    )}
                  </div>
                ) : "#"}
              </th>
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
            {rowEntries.length === 0 && (
              <tr className="dm-db-empty-row">
                <td colSpan={visibleColumns.length + 1 + (table.mutable ? 1 : 0)}>
                  <div className="dm-db-empty-state">
                    {(search.trim() || settings.filter?.clauses?.length) ? (
                      <>
                        <strong>No records match</strong>
                        <span>Try a different search or clear your filters.</span>
                        <div className="dm-db-empty-actions">
                          {search.trim() && <button type="button" className="dm-btn-outline" onClick={() => setSearch("")}>Clear search</button>}
                          {settings.filter?.clauses?.length > 0 && <button type="button" className="dm-btn-outline" onClick={resetView}>Reset view</button>}
                        </div>
                      </>
                    ) : (
                      <>
                        <strong>No records yet</strong>
                        <span>{table.mutable ? "Add your first row or import a CSV to start using this object." : "Records resolve at runtime for this live-backed object."}</span>
                        {table.mutable && (
                          <div className="dm-db-empty-actions">
                            <button type="button" className="dm-btn-primary-sm" disabled={saving} onClick={() => onSave((config) => addTableRow(config, table))}><Plus size={13} />Add record</button>
                            <button type="button" className="dm-btn-outline" onClick={() => setCsvOpen(true)}><Upload size={13} />Import CSV</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {pageEntries.map(({ row, originalIndex }, rowIndex) => {
              const visibleIndex = pageStart + rowIndex;
              const displayIndex = visibleIndex + 1;
              return (
              <tr
                key={`${originalIndex}:${visibleIndex}`}
	                className={`${selectedOriginalIndex === originalIndex ? "selected" : ""}${selectedRows.has(originalIndex) ? " multi-selected" : ""}`}
	                onClick={() => {
	                  setSelectedRow(visibleIndex);
	                  selectOriginalIndex(originalIndex);
	                }}
	              >
                <td className="dm-db-rownum">
                  {table.mutable ? (
                    <button type="button" className="dm-row-select" aria-label={selectedRows.has(originalIndex) ? `Deselect row ${displayIndex}` : `Select row ${displayIndex}`} aria-pressed={selectedRows.has(originalIndex)} onClick={(event) => { event.stopPropagation(); toggleRowSelection(originalIndex, visibleIndex, event); }}>
                      <span className="dm-row-select-box" />
                      <span className="dm-row-number">{displayIndex}</span>
                    </button>
                  ) : displayIndex}
                </td>
                {visibleColumns.map((column) => {
                  const relation = relationForColumn(table, column);
                  // The Helper Threads object is a normal custom-typed
                  // governed object. We opt the "open" column into a
                  // Reopen link based on the stable well-known object id
                  // so we don't need a dedicated object type.
                  const isHelperThreadOpenCol = table.objectId === "helper-threads" && column === "open";
                  return (
                  <td key={column}>
                    {isHelperThreadOpenCol ? (
                      <button
                        type="button"
                        className="dm-thread-open-link"
                        data-helper-thread-open=""
                        data-thread-id={row?.id || ""}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (typeof onOpenThread === "function") onOpenThread(row);
                        }}
                      >
                        <Zap size={11} />Reopen
                      </button>
                    ) : relation ? (
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
                    ) : isSandboxSidecarCell(table, column) ? (
                      <button
                        type="button"
                        className={`dm-cell-link${row?.[column] ? "" : " dm-cell-empty"}`}
                        disabled={column !== "orchestrationGraph" && column !== "orchestrationConfig" && !row?.[column]}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (column === "orchestrationGraph" || column === "orchestrationConfig") {
                            openSandboxGraph(column, row);
                            return;
	                          }
	                          const sidecar = sandboxSidecarForColumn(column, row);
	                          setSelectedRow(visibleIndex);
	                          selectOriginalIndex(originalIndex);
	                          setInitialSidecar(sidecar);
	                        }}
                      >
                        {column === "orchestrationGraph" || column === "orchestrationConfig"
                          ? (getOrchestrationGraphUiState(row?.[column]) === "populated" ? "Open workflow" : "Create workflow")
                          : (formatCellValue(row?.[column], column) || "View trace")}
                      </button>
                    ) : (
                      <span className={row?.[column] ? "" : "dm-cell-empty"}>
                        {formatCellValue(row?.[column], column) || "—"}
                      </span>
                    )}
                  </td>
                );})}
                {table.mutable && <td className="dm-db-empty-cell" />}
              </tr>
            );})}
            {table.mutable && (
              <tr className="dm-db-new-row" onClick={() => onSave((config) => addTableRow(config, table))}>
                <td className="dm-db-rownum">+</td>
                <td colSpan={Math.max(visibleColumns.length, 1) + 1}>Add record</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <div className="dm-pagination-bar">
          <span className="dm-pagination-summary">Showing {rowEntries.length ? pageStart + 1 : 0}-{pageEnd} of {rowEntries.length}</span>
          <div className="dm-pagination-controls">
            <label className="dm-page-size-control">
              <span>Rows</span>
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPageIndex(0); }}>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <button type="button" className="dm-pagination-btn" disabled={safePageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))}>Previous</button>
            <span className="dm-pagination-page">{safePageIndex + 1} / {pageCount}</span>
            <button type="button" className="dm-pagination-btn" disabled={safePageIndex >= pageCount - 1} onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}>Next</button>
          </div>
        </div>
      </div>
      <DataModelRecordDrawer
        table={table}
        tables={tables}
        workspaceConfig={workspaceConfig}
        rowIndex={selectedEntry?.originalIndex ?? null}
	        row={selectedRecord}
	        saving={saving}
	        onClose={() => { setSelectedRow(null); selectOriginalIndex(null); setInitialSidecar(null); }}
        onSave={onSave}
        onFocusSandboxRow={onFocusSandboxRow}
        initialSidecar={initialSidecar}
        onClearInitialSidecar={() => setInitialSidecar(null)}
      />
      {confirmDeleteSelection && selectedRowCount > 0 && (
        <div className="dm-orch-modal-backdrop" onClick={() => setConfirmDeleteSelection(false)}>
          <section className="dm-orch-modal" role="dialog" aria-modal="true" aria-label="Confirm row deletion" onClick={(event) => event.stopPropagation()}>
            <header className="dm-orch-modal-head">
              <div>
                <p>Confirm deletion</p>
                <h2>Delete selected records?</h2>
              </div>
              <button type="button" className="dm-icon-btn" onClick={() => setConfirmDeleteSelection(false)} aria-label="Close delete confirmation">
                <X size={15} />
              </button>
            </header>
            <div className="dm-orch-modal-body">
              <p>This will permanently remove {pluralize(selectedRowCount, "selected record")} from {table.label || table.source}.</p>
            </div>
            <footer className="dm-orch-modal-foot">
              <button type="button" className="dm-btn-outline" onClick={() => setConfirmDeleteSelection(false)}>Cancel</button>
              <button type="button" className="dm-btn-danger-sm" disabled={saving} onClick={deleteSelectedRows}>
                <Trash2 size={13} />Delete {selectedRowCount}
              </button>
            </footer>
          </section>
        </div>
      )}
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


// ─── Command Palette ──────────────────────────────────────────────────────────

function DataModelCommandPalette({ commands, onClose }) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.group || ""} ${(c.aliases || []).join(" ")}`.toLowerCase().includes(q)
    );
  }, [commands, query]);
  useEffect(() => {
    setHighlight((v) => Math.min(v, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((v) => Math.min(filtered.length - 1, v + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((v) => Math.max(0, v - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[highlight];
      if (cmd && !cmd.disabled) { cmd.run(); onClose(); }
    } else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((c) => {
      const key = c.group || "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    return Array.from(map.entries());
  }, [filtered]);
  return (
    <div className="workspace-command-palette" role="dialog" aria-modal="true" aria-label="Command palette" data-palette="">
      <div className="workspace-overlay-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="workspace-command-palette-panel" onKeyDown={handleKey}>
        <header className="workspace-command-palette-input">
          <span aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or ask helper…"
            aria-label="Command palette search"
          />
          <kbd>esc</kbd>
        </header>
        <div className="workspace-command-palette-list" role="listbox">
          {filtered.length === 0 ? <p className="workspace-panel-hint">No matching commands.</p> : null}
          {groups.map(([group, items]) => (
            <div key={group} className="workspace-command-palette-group">
              <p className="workspace-panel-label">{group}</p>
              {items.map((cmd) => {
                const gi = filtered.indexOf(cmd);
                const isHL = gi === highlight;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    role="option"
                    aria-selected={isHL}
                    className={"workspace-command-palette-item" + (isHL ? " active" : "") + (cmd.disabled ? " disabled" : "")}
                    disabled={cmd.disabled}
                    onMouseEnter={() => setHighlight(gi)}
                    onClick={() => { if (!cmd.disabled) { cmd.run(); onClose(); } }}
                  >
                    <span aria-hidden="true"><Zap size={14} /></span>
                    <span className="workspace-command-palette-label">{cmd.label}</span>
                    {cmd.shortcut ? <kbd>{cmd.shortcut}</kbd> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <footer className="workspace-command-palette-footer">
          <span>↑ ↓ navigate</span><span>↵ run</span><span>esc close</span>
        </footer>
      </section>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Auto-save tempo: hold local edits in memory + localStorage, only PATCH the
// server after this idle window. Keeps growthub.config.json from rewriting on
// every keystroke and lets the UI stay snappy on slow disks.
const SAVE_DEBOUNCE_MS = 20000;
const LOCAL_CACHE_KEY = "growthub.workspace.dataModel.localDraft.v1";

export default function DataModelShell() {
  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [authority, setAuthority] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperIntent, setHelperIntent] = useState("create_object");
  const [helperInitialPrompt, setHelperInitialPrompt] = useState("");
  const [helperInitialThread, setHelperInitialThread] = useState(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [focusSandboxRowName, setFocusSandboxRowName] = useState(null);
  const [focusRecordValue, setFocusRecordValue] = useState(null);
  const [selectedRecordByTable, setSelectedRecordByTable] = useState({});
  const pendingPatchRef = useRef({});
  const saveTimerRef = useRef(null);
  const consumedHelperRouteRef = useRef("");

  // Cross-page rail entrypoints. Settings / integrations pages render
  // <WorkspaceRail> without an in-process helper handler — clicking the
  // pill or a chat thread there navigates to `/data-model?helper=open`
  // or `/data-model?thread=<id>`. We consume those query params here
  // exactly once per change and strip them so refreshes are idempotent.
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!workspaceConfig) return;
    const helperParam = searchParams?.get("helper");
    const threadParam = searchParams?.get("thread");
    const resolverForParam = searchParams?.get("resolverFor");
    if (!helperParam && !threadParam && !resolverForParam) return;
    const routeKey = `${helperParam || ""}:${threadParam || ""}:${resolverForParam || ""}`;
    if (routeKey === consumedHelperRouteRef.current) return;
    consumedHelperRouteRef.current = routeKey;
    if (threadParam) {
      const ht = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === "helper-threads");
      const row = (ht?.rows || []).find((r) => r?.id === threadParam);
      if (row) {
        setHelperInitialThread(row);
        setHelperOpen(true);
      }
    } else if (resolverForParam) {
      setHelperIntent("register_api");
      setHelperInitialThread(null);
      setHelperInitialPrompt(`Create the response resolver for API Registry integration "${resolverForParam}". Use the tested lastResponse from that registry row, extract the records from the response into governed Data Source rows, and keep the resolver scoped to this integrationId.`);
      setHelperOpen(true);
      return;
    } else if (helperParam === "open") {
      setHelperInitialThread(null);
      setHelperOpen(true);
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("helper");
    next.delete("thread");
    next.delete("resolverFor");
    const query = next.toString();
    router.replace(query ? `/data-model?${query}` : "/data-model", { scroll: false });
  }, [workspaceConfig, searchParams, router]);

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

  // Cmd+K opens command palette. Slash opens it too, but only when no
  // editable element is focused — matches the dashboard builder.
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !commandPaletteOpen && !addOpen && !helperOpen) {
        const t = e.target;
        const editable = t instanceof HTMLElement && (
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable
        );
        if (!editable) {
          e.preventDefault();
          setCommandPaletteOpen(true);
          return;
        }
      }
      if (e.key === "Escape" && commandPaletteOpen) setCommandPaletteOpen(false);
    };
    const railOpen = () => setCommandPaletteOpen(true);
    window.addEventListener("keydown", handler);
    window.addEventListener("growthub:open-command-palette", railOpen);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("growthub:open-command-palette", railOpen);
    };
  }, [commandPaletteOpen, addOpen, helperOpen]);

  const tables = useMemo(
    () => (workspaceConfig ? listWorkspaceDataModelTables(workspaceConfig) : []),
    [workspaceConfig],
  );

  const selectedTable = tables.find((t) => t.source === selectedSource) || tables[0] || null;
  const selectedTableKey = selectedTable
    ? String(selectedTable.objectId || selectedTable.id || selectedTable.source || "")
    : "";

  const focusSandboxEnvironmentRow = useCallback(({ rowName, deferOpen = false } = {}) => {
    const wanted = String(rowName || "").trim();
    if (!wanted) return;
    const sandboxTable = tables.find((t) => t.objectType === "sandbox-environment");
    if (!sandboxTable?.source) return;
    setSelectedSource(sandboxTable.source);
    if (!deferOpen) {
      setFocusSandboxRowName(wanted);
    } else {
      requestAnimationFrame(() => setFocusSandboxRowName(wanted));
    }
  }, [tables]);

  useEffect(() => {
    if (!selectedSource && tables[0]) setSelectedSource(tables[0].source);
  }, [selectedSource, tables]);

  useEffect(() => {
    const objectParam = searchParams?.get("object");
    if (!objectParam || !tables.length) return;
    const target = tables.find((table) => (
      table.objectId === objectParam
      || table.id === objectParam
      || table.source === objectParam
      || table.label === objectParam
    ));
    if (target && target.source !== selectedSource) {
      setSelectedSource(target.source);
    }
  }, [searchParams, selectedSource, tables]);

  useEffect(() => {
    const rowParam = searchParams?.get("row");
    if (!rowParam || !tables.length) return;
    const objectParam = searchParams?.get("object");
    const target = objectParam
      ? tables.find((table) => (
          table.objectId === objectParam
          || table.id === objectParam
          || table.source === objectParam
          || table.label === objectParam
        ))
      : null;
    if (target?.objectType === "sandbox-environment" || (!target && rowParam)) {
      focusSandboxEnvironmentRow({ rowName: rowParam, deferOpen: true });
      return;
    }
    requestAnimationFrame(() => setFocusRecordValue(rowParam));
  }, [focusSandboxEnvironmentRow, searchParams, tables]);

  // Flush any accumulated patch keys to the server. Called by the debounce
  // timer and on visibilitychange/beforeunload so no local edit is lost.
  const flushPendingPatch = useCallback(async () => {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Save failed");
      setWorkspaceConfig(payload.workspaceConfig);
      setMessage("Saved");
      try { window.localStorage.removeItem(LOCAL_CACHE_KEY); } catch {}
    } catch (err) {
      setMessage(`Error: ${err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  }, []);

  // Mutate-in-memory immediately so the UI feels instant, persist a draft to
  // localStorage every change, and only PATCH the server after SAVE_DEBOUNCE_MS
  // of idleness. Sandbox-environment objects' lastRunId/lastResponse fields
  // bypass the debounce (they need durability for run telemetry).
  const save = useCallback((mutate) => {
    setWorkspaceConfig((current) => {
      if (!current) return current;
      const next = mutate(current);
      const patch = pendingPatchRef.current;
      let touchedSandboxRun = false;
      for (const key of ["dashboards", "widgetTypes", "canvas", "dataModel"]) {
        if (next[key] !== current[key]) patch[key] = next[key];
      }
      try {
        const sandboxKey = JSON.stringify((next.dataModel?.objects || []).find((o) => o.objectType === "sandbox-environment")?.rows || []);
        const prevSandboxKey = JSON.stringify((current.dataModel?.objects || []).find((o) => o.objectType === "sandbox-environment")?.rows || []);
        if (sandboxKey !== prevSandboxKey) touchedSandboxRun = true;
      } catch {}
      try {
        window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), patch }));
      } catch {}
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (touchedSandboxRun) {
        // immediate flush: durable sandbox run state must persist
        Promise.resolve().then(flushPendingPatch);
      } else {
        saveTimerRef.current = setTimeout(flushPendingPatch, SAVE_DEBOUNCE_MS);
      }
      return next;
    });
  }, [flushPendingPatch]);

  // Flush before navigation / tab close so the 20s window never silently drops a draft.
  useEffect(() => {
    function handleBeforeUnload() { flushPendingPatch(); }
    function handleVisibility() { if (document.visibilityState === "hidden") flushPendingPatch(); }
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
      flushPendingPatch();
    };
  }, [flushPendingPatch]);

  const createObject = useCallback(({ name, objectType, icon }) => {
    save((config) => createTypedBusinessObject(config, { name, objectType, icon }));
    setSelectedSource(name);
    setAddOpen(false);
  }, [save]);

  const INTENT_FOR_TYPE = {
    people: "edit_view",
    tasks: "edit_view",
    "api-registry": "register_api",
    "sandbox-environment": "create_object",
    "data-source": "explain",
    custom: "create_object",
  };

  // Starter prompt seeded into the textarea when the user asks the helper
  // about a specific Data Model object. Non-technical users see context-
  // appropriate guidance instead of an empty box.
  const STARTER_PROMPT_FOR_TYPE = {
    people: (name) => `Improve the "${name}" people list. Suggest fields and a view layout that fit a sales / outreach workflow.`,
    tasks: (name) => `Improve the "${name}" tasks board. Suggest status fields, owners, and a sensible view layout.`,
    "api-registry": (name) => `Register a new API integration for "${name}". Draft the row with integration label, base URL, endpoint, auth header, and method.`,
    "sandbox-environment": (name) => `Configure the "${name}" sandbox environment. Suggest runtime, prompt, instructions, and lifecycle status fields.`,
    "data-source": (name) => `Explain how the "${name}" data source is wired up and what changes would make it more reliable.`,
    custom: (name) => `Improve the "${name}" object. Suggest fields, relations, and starter rows that fit my use case.`,
  };

  const openHelperForTable = (table) => {
    const intent = INTENT_FOR_TYPE[table?.objectType] || "create_object";
    const fill = STARTER_PROMPT_FOR_TYPE[table?.objectType];
    setHelperIntent(intent);
    setHelperInitialPrompt(fill ? fill(table?.label || table?.source || "this object") : "");
    setHelperInitialThread(null);
    setHelperOpen(true);
  };

  const openHelperWith = (intent, prompt) => {
    setHelperIntent(intent);
    setHelperInitialPrompt(prompt || "");
    setHelperInitialThread(null);
    setHelperOpen(true);
  };

  const mutateObjectById = useCallback((table, updater) => {
    const targetId = String(table?.objectId || "").trim();
    if (!targetId) return;
    save((config) => {
      const dataModel = config.dataModel && typeof config.dataModel === "object" && !Array.isArray(config.dataModel)
        ? config.dataModel
        : {};
      const objects = Array.isArray(dataModel.objects) ? dataModel.objects : [];
      return {
        ...config,
        dataModel: {
          ...dataModel,
          objects: objects.map((object) => String(object?.id || "") === targetId ? updater(object) : object)
        }
      };
    });
  }, [save]);

  const toggleObjectLock = useCallback((table) => {
    mutateObjectById(table, (object) => ({ ...object, locked: !isLockedObject(table) }));
  }, [mutateObjectById]);

  const exportObject = useCallback((table) => {
    const blob = new Blob([exportTableAsCsv(table)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(table?.source || table?.label || "data-model-object").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const duplicateObject = useCallback((table) => {
    const targetId = String(table?.objectId || "").trim();
    if (!targetId) return;
    let nextSource = "";
    save((config) => {
      const dataModel = config.dataModel && typeof config.dataModel === "object" && !Array.isArray(config.dataModel)
        ? config.dataModel
        : {};
      const objects = Array.isArray(dataModel.objects) ? dataModel.objects : [];
      const sourceObject = objects.find((object) => String(object?.id || "") === targetId);
      if (!sourceObject) return config;
      const baseLabel = `${sourceObject.label || sourceObject.name || sourceObject.source || table.label || "Object"} Copy`;
      const existingIds = new Set(objects.map((object) => String(object?.id || "")));
      const slugBase = baseLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "object-copy";
      let id = slugBase;
      let index = 2;
      while (existingIds.has(id)) {
        id = `${slugBase}-${index}`;
        index += 1;
      }
      nextSource = baseLabel;
      const clone = {
        ...JSON.parse(JSON.stringify(sourceObject)),
        id,
        label: baseLabel,
        source: baseLabel,
        locked: false
      };
      return {
        ...config,
        dataModel: {
          ...dataModel,
          objects: [...objects, clone]
        }
      };
    });
    if (nextSource) setSelectedSource(nextSource);
  }, [save]);

  const deleteObject = useCallback((table) => {
    const targetId = String(table?.objectId || "").trim();
    if (!targetId) return;
    const confirmed = window.confirm(`Delete "${table.label || table.source}" from the Data Model?`);
    if (!confirmed) return;
    let fallbackSource = "";
    save((config) => {
      const dataModel = config.dataModel && typeof config.dataModel === "object" && !Array.isArray(config.dataModel)
        ? config.dataModel
        : {};
      const objects = Array.isArray(dataModel.objects) ? dataModel.objects : [];
      const nextObjects = objects.filter((object) => String(object?.id || "") !== targetId);
      const fallback = nextObjects[0];
      fallbackSource = String(fallback?.source || fallback?.label || fallback?.name || "");
      return {
        ...config,
        dataModel: {
          ...dataModel,
          objects: nextObjects
        }
      };
    });
    if (selectedSource === table.source) setSelectedSource(fallbackSource);
  }, [save, selectedSource]);

  // Reopen a helper thread row from the Helper Threads Data Model object.
  // The row already holds the full prior turn (intent, prompt, proposals,
  // warnings, receipts) — passing it through initialThread rehydrates the
  // sidecar state so the user reads the conversation exactly where it ended.
  const openHelperThreadFromRow = (row) => {
    if (!row || !row.id) return;
    const proposals = Array.isArray(row.proposals) ? row.proposals : [];
    const warnings = Array.isArray(row.warnings) ? row.warnings : [];
    const result = {
      summary: row.summary || "",
      proposals,
      warnings,
      receipts: row.receipts || null,
      threadId: row.id,
    };
    setHelperIntent(row.intent || "explain");
    setHelperInitialPrompt(typeof row.prompt === "string" ? row.prompt : "");
    setHelperInitialThread({
      id: row.id,
      intent: row.intent || "explain",
      prompt: typeof row.prompt === "string" ? row.prompt : "",
      result,
    });
    setHelperOpen(true);
  };

  const paletteCommands = [
    {
      id: "helper.build_dashboard", group: "Ask helper", label: "Ask helper — build a dashboard",
      run: () => openHelperWith("build_dashboard", "Draft a dashboard for a local agency with pipeline stages, weekly revenue, and a leaderboard widget.")
    },
    {
      id: "helper.create_object", group: "Ask helper", label: "Ask helper — create a custom object",
      run: () => openHelperWith("create_object", "Create a custom object for tracking client engagements: name, owner, status, value, next step.")
    },
    {
      id: "helper.register_api", group: "Ask helper", label: "Ask helper — register an API",
      run: () => openHelperWith("register_api", "Register an API integration: integration label, base URL, endpoint, auth header, and method.")
    },
    {
      id: "helper.repair", group: "Ask helper", label: "Ask helper — repair workspace",
      run: () => openHelperWith("repair", "Inspect this workspace for missing references, broken bindings, or incomplete object configuration. Propose the smallest fix for each issue.")
    },
    {
      id: "helper.explain", group: "Ask helper", label: "Ask helper — explain this workspace",
      run: () => openHelperWith("explain", "Explain what this workspace contains and how the objects, dashboards, and bindings relate to each other.")
    },
    {
      id: "object.new", group: "Data Model", label: "New object",
      run: () => setAddOpen(true)
    },
    {
      id: "nav.builder", group: "Navigation", label: "Go to Builder",
      run: () => { window.location.href = "/"; }
    },
    {
      id: "nav.settings", group: "Navigation", label: "Go to Settings",
      run: () => { window.location.href = "/settings/general"; }
    },
  ];

  return (
    <main className="workspace-builder workspace-settings-page">
      <WorkspaceRail
        authority={authority}
        workspaceConfig={workspaceConfig}
        helperOpen={helperOpen}
        onOpenHelper={() => {
          if (helperOpen) { setHelperOpen(false); return; }
          // Rail pill ALWAYS opens a fresh thread (empty state, chip
          // stack visible). Reopening a specific conversation goes
          // through onOpenThread from the Chat tab.
          setHelperInitialThread(null);
          setHelperIntent("create_object");
          setHelperInitialPrompt("");
          setHelperOpen(true);
        }}
        onOpenThread={(row) => {
          setHelperInitialThread(row);
          setHelperOpen(true);
        }}
        onConfigChange={(next) => {
          if (typeof setWorkspaceConfig === "function") setWorkspaceConfig(next);
        }}
      />

      <section className="workspace-surface">
        <header className="workspace-toolbar">
          {selectedTable ? (
            <div className="workspace-toolbar-object">
              <div className="workspace-toolbar-object-title">
                <span className="workspace-toolbar-object-icon" aria-hidden="true">
                  <LucideIcon
                    name={selectedTable.icon || OBJECT_TYPE_PRESETS[selectedTable.objectType]?.icon || "Database"}
                    size={16}
                  />
                </span>
                <h1>{selectedTable.label}</h1>
              </div>
              <p className="workspace-toolbar-object-meta">
                {(selectedTable.columns?.length || 0)} {(selectedTable.columns?.length || 0) === 1 ? "Field" : "Fields"}
                {" · "}
                {(selectedTable.rows?.length || 0)} {(selectedTable.rows?.length || 0) === 1 ? "Record" : "Records"}
              </p>
            </div>
          ) : (
            <div><p>Workspace</p><h1>Data Model</h1></div>
          )}
          <div className="workspace-toolbar-actions">
            <SaveToast saving={saving} message={message} />
            {selectedTable && (
              <ObjectViewPicker
                tables={tables}
                selectedTable={selectedTable}
                saving={saving}
                onSelectSource={setSelectedSource}
                onSave={save}
                onToggleLock={toggleObjectLock}
                onDeleteObject={deleteObject}
                onExportObject={exportObject}
                onDuplicateObject={duplicateObject}
              />
            )}
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

        <HelperSidecar
          open={helperOpen}
          onClose={() => setHelperOpen(false)}
          workspaceConfig={workspaceConfig}
          initialIntent={helperIntent}
          initialPrompt={helperInitialPrompt}
          initialThread={helperInitialThread}
          onOpenArtifact={(target) => {
            // Close the chat and route the user to the artifact they
            // just created — data-model object/row stays in-page, a
            // dashboard navigates to the workspace home with a query
            // param the builder reads to focus it.
            if (!target) return;
            if (target.surface === "data-model" && target.source) {
              setSelectedSource(target.source);
              setHelperOpen(false);
              return;
            }
            if (target.surface === "dashboard" && target.dashboardId) {
              setHelperOpen(false);
              router.push(`/?dashboard=${encodeURIComponent(target.dashboardId)}`);
            }
          }}
          onOpenSwarmWorkflow={(target) => {
            const objectId = String(target?.objectId || "").trim();
            const rowName = String(target?.name || "").trim();
            if (!objectId || !rowName) return;
            const params = new URLSearchParams({
              object: objectId,
              row: rowName,
              field: "orchestrationGraph"
            });
            router.push(`/workflows?${params.toString()}`);
          }}
          onApplied={(updatedConfig) => {
            // Anchor the user on the most recently created/updated Data Model
            // object so a helper-driven object.create lands on the surface
            // instead of needing a manual click.
            setWorkspaceConfig(updatedConfig);
            const nextObjects = updatedConfig?.dataModel?.objects || [];
            const prevIds = new Set(
              (workspaceConfig?.dataModel?.objects || []).map((o) => o?.id).filter(Boolean)
            );
            const newlyCreated = nextObjects.find((o) => o?.id && !prevIds.has(o.id));
            const nextSource = (newlyCreated?.label || newlyCreated?.id)
              ? (newlyCreated.label || newlyCreated.id)
              : selectedSource;
            if (nextSource && nextSource !== selectedSource) {
              setSelectedSource(nextSource);
            }
          }}
        />

        {commandPaletteOpen && (
          <DataModelCommandPalette
            commands={paletteCommands}
            onClose={() => setCommandPaletteOpen(false)}
          />
        )}

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
              <SourceValidationBanner table={selectedTable} />
              <DataModelTableSurface
                key={selectedTableKey}
                workspaceConfig={workspaceConfig}
                table={selectedTable}
                tables={tables}
                saving={saving}
                onSave={save}
                onOpenThread={openHelperThreadFromRow}
                focusSandboxRowName={focusSandboxRowName}
                focusRecordValue={focusRecordValue}
                onFocusSandboxRowConsumed={() => setFocusSandboxRowName(null)}
                onFocusRecordConsumed={() => setFocusRecordValue(null)}
                onFocusSandboxRow={focusSandboxEnvironmentRow}
                selectedRecordIndex={selectedTableKey ? selectedRecordByTable[selectedTableKey] ?? null : null}
                onSelectedRecordIndexChange={(index) => {
                  if (!selectedTableKey) return;
                  setSelectedRecordByTable((current) => ({
                    ...current,
                    [selectedTableKey]: index
                  }));
                }}
              />
            </section>
          )
        )}

        {!loading && !error && tables.length === 0 && (
          <div className="dm-page-empty">
            <Database size={32} />
            <strong>No objects yet</strong>
            <p>Create your first Data Source, API Registry, People list, or custom object to get started.</p>
            <div className="dm-page-empty-actions">
              <button type="button" className="dm-btn-primary" onClick={() => setAddOpen(true)}>
                <Plus size={14} />New object
              </button>
              <button
                type="button"
                className="dm-btn-outline"
                onClick={() => openHelperWith(
                  "create_object",
                  "I run a local agency. Create my first business object: a client list with name, owner, status, deal value, and next step. Then suggest a starter dashboard."
                )}
              >
                <Zap size={14} />Try the helper
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export { DataModelTableSurface, DataModelRecordDrawer, RecordFieldEditor };
