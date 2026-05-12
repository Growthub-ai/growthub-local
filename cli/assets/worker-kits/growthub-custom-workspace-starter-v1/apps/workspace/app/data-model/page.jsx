"use client";

import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart2,
  Box,
  Building2,
  Calendar,
  CheckSquare,
  ChevronRight,
  Code2,
  Database,
  FileText,
  Globe,
  Hash,
  Layers,
  Link2,
  List,
  Mail,
  Plus,
  Play,
  ShoppingCart,
  Star,
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
  exportTableAsCsv,
  importTableFromCsv,
  listSavedEnvRefs,
  listWorkspaceDataModelTables,
  parseSandboxAllowList,
  parseSandboxEnvRefs,
  replaceTableContent,
  updateTableCell,
} from "@/lib/workspace-data-model";

// ─── Icon system ─────────────────────────────────────────────────────────────

const LUCIDE_MAP = {
  Activity, BarChart2, Box, Building2, Calendar, CheckSquare, Code2,
  Database, FileText, Globe, Hash, Layers, Link2, List, Mail, Plus,
  ShoppingCart, Star, Tag, Terminal, Type, Users, Zap,
};

const ICON_PICKER_SET = [
  "Database", "Globe", "Code2", "Users", "CheckSquare", "Building2",
  "Tag", "Star", "Zap", "FileText", "Mail", "BarChart2",
  "Layers", "Box", "Activity", "ShoppingCart", "Terminal",
];

function LucideIcon({ name, size = 14, className, style }) {
  const Icon = LUCIDE_MAP[name] || Database;
  return <Icon size={size} className={className} style={style} aria-hidden="true" />;
}

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

// ─── Lane / badge meta ────────────────────────────────────────────────────────

const OBJECT_TYPE_BADGE = {
  "data-source":         { label: "Data Source",         cls: "dm-badge-datasource" },
  "api-registry":        { label: "API Registry",        cls: "dm-badge-registry" },
  "sandbox-environment": { label: "Sandbox Environment", cls: "dm-badge-sandbox" },
  people:                { label: "People",              cls: "dm-badge-people" },
  tasks:                 { label: "Tasks",               cls: "dm-badge-tasks" },
  custom:                { label: "Custom",              cls: "dm-badge-manual" },
};

const SANDBOX_ROW_FIELDS = new Set([
  "Name",
  "runLocality",
  "schedulerRegistryId",
  "runtime",
  "adapter",
  "agentHost",
  "envRefs",
  "networkAllow",
  "allowList",
  "command",
  "timeoutMs",
  "status",
  "lastTested",
  "lastResponse"
]);

const SANDBOX_RUNTIME_OPTIONS = ["python", "node", "bash"];

const FIELD_TYPE_ICON_NAMES = {
  text: "Type", number: "Hash", date: "Calendar", url: "Link2", select: "List", boolean: "ToggleLeft",
};

function inferFieldType(name) {
  const n = name.toLowerCase();
  if (n.includes("date") || n.includes("_at") || n.includes("created") || n.includes("updated")) return "date";
  if (n.includes("url") || n.includes("link") || n.includes("website") || n === "endpoint" || n === "baseurl") return "url";
  if (n.includes("count") || n.includes("num") || n.includes("amount") || n.includes("arr") || n.includes("price")) return "number";
  if (n === "status" || n === "stage" || n === "type" || n === "icp" || n === "priority" || n === "authtype" || n === "method") return "select";
  if (n.startsWith("is_") || n.includes("active") || n.includes("enabled")) return "boolean";
  return "text";
}

function pluralize(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function objectTypeBadge(objectType) {
  return OBJECT_TYPE_BADGE[objectType] || OBJECT_TYPE_BADGE.custom;
}

function textColorForAccent(accent) {
  const hex = String(accent || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#252525" : "#ffffff";
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

// ─── Object list row ──────────────────────────────────────────────────────────

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

// ─── Source validation banner ─────────────────────────────────────────────────

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

function ConnectionPill({ value }) {
  const status = String(value || "untested").toLowerCase();
  const ok = ["connected", "approved", "ok", "success"].includes(status);
  const bad = ["failed", "error", "disconnected"].includes(status);
  return (
    <span className={`dm-db-status ${ok ? "ok" : bad ? "bad" : ""}`}>
      <span />
      {value || "untested"}
    </span>
  );
}

function relationForColumn(table, column) {
  return (table?.relations || []).find((relation) => relation.field === column) || null;
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

function ReferenceSelect({ value, options, disabled, onChange }) {
  return (
    <select
      className="dm-reference-select"
      value={value || ""}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select reference…</option>
      {options.map((option) => (
        <option key={`${option.source}:${option.value}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
  rowIndex
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
  const schedulerRelation = relationForColumn(table, "schedulerRegistryId");
  const schedulerOptions = referenceOptions(tables, schedulerRelation);
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
    if (next === "serverless" && String(draft.adapter || "").trim() === "local-agent-host") {
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
      <label className="dm-record-field">
        <span>Name</span>
        <input
          value={draft.Name ?? ""}
          disabled={!table.mutable || saving}
          onChange={(event) => setDraft((c) => ({ ...c, Name: event.target.value }))}
          onBlur={(event) => patchFields({ Name: event.target.value })}
        />
      </label>

      <div className="dm-record-field">
        <span>Where it runs</span>
        <div className="dm-radio-row" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            <input
              type="radio"
              name="sandbox-run-locality"
              checked={locality === "local"}
              disabled={!table.mutable || saving}
              onChange={() => setRunLocality("local")}
            />
            {" "}Local — process sandbox or Paperclip local agent host on this machine
          </label>
          <label>
            <input
              type="radio"
              name="sandbox-run-locality"
              checked={locality === "serverless"}
              disabled={!table.mutable || saving}
              onChange={() => setRunLocality("serverless")}
            />
            {" "}Serverless — delegate to scheduler URL (API Registry); no local agent CLI
          </label>
        </div>
      </div>

      {locality === "serverless" && (
        <label className="dm-record-field">
          <span>Scheduler (API Registry)</span>
          <ReferenceSelect
            value={draft.schedulerRegistryId || ""}
            options={schedulerOptions}
            disabled={!table.mutable || saving}
            onChange={(nextValue) => patchFields({ schedulerRegistryId: nextValue })}
          />
          <span className="dm-cell-empty" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
            POST sends <code>growthub-sandbox-run-v1</code> JSON; auth from registry <code>authRef</code> (server env only).
          </span>
        </label>
      )}

      <label className="dm-record-field">
        <span>Execution adapter</span>
        <select
          className="dm-reference-select"
          value={String(draft.adapter || "local-process").trim() || "local-process"}
          disabled={!table.mutable || saving}
          onChange={(event) => patchFields({ adapter: event.target.value })}
        >
          {sandboxAdapters.length === 0 ? <option value="local-process">local-process</option> : sandboxAdapters.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>

      {locality === "local" && String(draft.adapter || "").trim() === "local-agent-host" && (
        <label className="dm-record-field">
          <span>Agent host (Paperclip)</span>
          <select
            className="dm-reference-select"
            value={draft.agentHost || ""}
            disabled={!table.mutable || saving}
            onChange={(event) => patchFields({ agentHost: event.target.value })}
          >
            <option value="">Select host…</option>
            {(selectedAdapterMeta?.hostCatalog || []).map((h) => (
              <option key={h.slug} value={h.slug}>{h.label}</option>
            ))}
          </select>
        </label>
      )}

      <label className="dm-record-field">
        <span>Runtime</span>
        <select
          className="dm-reference-select"
          value={draft.runtime || "node"}
          disabled={!table.mutable || saving}
          onChange={(event) => patchFields({ runtime: event.target.value })}
        >
          {SANDBOX_RUNTIME_OPTIONS.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
        </select>
      </label>

      <div className="dm-record-field">
        <span>Env key references</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {savedEnvRefs.length === 0 ? (
            <span className="dm-cell-empty">Add keys under Settings → APIs & Webhooks.</span>
          ) : savedEnvRefs.map((ref) => (
            <button
              key={ref.endpointRef}
              type="button"
              className={`dm-btn-ghost${selectedEnvSlugs.has(ref.endpointRef) ? " dm-chip-active" : ""}`}
              style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12 }}
              disabled={!table.mutable || saving}
              onClick={() => toggleEnvRef(ref.endpointRef)}
            >
              {ref.endpointRef}
            </button>
          ))}
        </div>
      </div>

      <label className="dm-record-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={netOn}
          disabled={!table.mutable || saving}
          onChange={(event) => patchFields({ networkAllow: event.target.checked ? "true" : "false" })}
        />
        <span>Network allow-list mode (locals see <code>GROWTHUB_SANDBOX_NET_*</code>)</span>
      </label>

      <label className="dm-record-field">
        <span>Allow list (comma-separated hosts)</span>
        <input
          value={draft.allowList ?? ""}
          disabled={!table.mutable || saving}
          onChange={(event) => setDraft((c) => ({ ...c, allowList: event.target.value }))}
          onBlur={(event) => patchFields({ allowList: event.target.value })}
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

      <label className="dm-record-field">
        <span>lastResponse</span>
        <textarea rows={10} readOnly value={draft.lastResponse ?? ""} />
      </label>
    </div>
  );
}

function DataModelRecordDrawer({ table, tables, workspaceConfig, rowIndex, row, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(row || {});
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxMessage, setSandboxMessage] = useState("");

  useEffect(() => {
    setDraft(row || {});
    setTestMessage("");
    setSandboxMessage("");
  }, [row, rowIndex]);

  if (rowIndex === null || rowIndex === undefined || !row) return null;

  const isSandbox = table.objectType === "sandbox-environment";

  function updateField(column, value) {
    setDraft((current) => ({ ...current, [column]: value }));
    onSave((config) => updateTableCell(config, table, rowIndex, column, value));
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
      onSave((config) => {
        let next = updateTableCell(config, table, rowIndex, "status", status);
        next = updateTableCell(next, table, rowIndex, "lastTested", testedAt);
        next = updateTableCell(next, table, rowIndex, "lastResponse", responseText);
        return next;
      });
      setDraft((current) => ({ ...current, status, lastTested: testedAt, lastResponse: responseText }));
      setSandboxMessage(payload.ok ? "Sandbox run recorded" : (payload.response?.error || payload.error || "Run failed"));
    } catch (err) {
      setSandboxMessage(err.message || "Sandbox run failed");
    } finally {
      setSandboxRunning(false);
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
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        {(table.objectType === "api-registry" || table.objectType === "data-source") && (
          <div className="dm-record-testbar">
            <ConnectionPill value={draft.status} />
            <button type="button" className="dm-btn-primary-sm" disabled={testing || saving} onClick={testApiRecord}>
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testMessage && <span>{testMessage}</span>}
          </div>
        )}
        {isSandbox && (
          <div className="dm-record-testbar">
            <ConnectionPill value={draft.status} />
            <button type="button" className="dm-btn-primary-sm" disabled={sandboxRunning || saving || !String(draft.Name || "").trim()} onClick={runSandbox}>
              {sandboxRunning ? "Running…" : (<><Play size={13} aria-hidden /> Run sandbox</>)}
            </button>
            {sandboxMessage && <span>{sandboxMessage}</span>}
          </div>
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
            />
          ) : table.columns.map((column) => {
            const value = String(draft?.[column] ?? "");
            const large = column === "lastResponse" || value.length > 120;
            const relation = relationForColumn(table, column);
            const options = referenceOptions(tables, relation);
            return (
              <label key={column} className="dm-record-field">
                <span>{column}</span>
                {relation ? (
                  <ReferenceSelect
                    value={value}
                    options={options}
                    disabled={!table.mutable || saving}
                    onChange={(nextValue) => updateField(column, nextValue)}
                  />
                ) : large ? (
                  <textarea
                    value={value}
                    rows={column === "lastResponse" ? 10 : 4}
                    disabled={!table.mutable || saving}
                    onChange={(event) => setDraft((current) => ({ ...current, [column]: event.target.value }))}
                    onBlur={(event) => updateField(column, event.target.value)}
                  />
                ) : (
                  <input
                    value={value}
                    disabled={!table.mutable || saving}
                    onChange={(event) => setDraft((current) => ({ ...current, [column]: event.target.value }))}
                    onBlur={(event) => updateField(column, event.target.value)}
                  />
                )}
              </label>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function DataModelTableSurface({ table, tables, workspaceConfig, saving, onSave }) {
  const [selectedRow, setSelectedRow] = useState(null);
  const [addingField, setAddingField] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [mode, setMode] = useState("append");
  const fieldInputRef = useRef(null);

  useEffect(() => { if (addingField) fieldInputRef.current?.focus(); }, [addingField]);
  useEffect(() => { setSelectedRow(null); }, [table.id]);

  function commitField() {
    const name = fieldName.trim();
    if (!name) {
      setAddingField(false);
      setFieldName("");
      return;
    }
    if (!table.columns.includes(name)) {
      onSave((config) => addTableField(config, table, name));
    }
    setAddingField(false);
    setFieldName("");
  }

  function importCsv() {
    const parsed = importTableFromCsv(csvText);
    if (!parsed.columns.length) return;
    if (mode === "replace") onSave((config) => replaceTableContent(config, table, parsed));
    else onSave((config) => appendRowsToTable(config, table, parsed.rows));
    setCsvText("");
    setCsvOpen(false);
  }

  const selectedRecord = selectedRow === null ? null : table.rows[selectedRow];

  return (
    <div className="dm-db-surface">
      {!table.mutable && (
        <div className="dm-source-notice">
          <AlertCircle size={13} />
          <span>Dynamic integration records are resolved at runtime.</span>
        </div>
      )}
      <div className="dm-db-toolbar">
        <div className="dm-db-toolbar-title">
          <strong>{table.label}</strong>
          <span>{pluralize(table.columns.length, "field")} · {pluralize(table.rows.length, "record")}</span>
        </div>
        <div className="dm-records-actions">
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
              {table.columns.map((column) => (
                <th key={column}>
                  <span className="dm-db-field-type"><LucideIcon name={FIELD_TYPE_ICON_NAMES[inferFieldType(column)] || "Type"} size={12} /></span>
                  {column}
                </th>
              ))}
              {table.mutable && (
                <th className="dm-db-add-field">
                  {addingField ? (
                    <input
                      ref={fieldInputRef}
                      value={fieldName}
                      placeholder="Field name"
                      onChange={(event) => setFieldName(event.target.value)}
                      onBlur={commitField}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitField();
                        if (event.key === "Escape") { setAddingField(false); setFieldName(""); }
                      }}
                    />
                  ) : (
                    <button type="button" onClick={() => setAddingField(true)}>
                      <Plus size={13} />Field
                    </button>
                  )}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={selectedRow === rowIndex ? "selected" : ""} onClick={() => setSelectedRow(rowIndex)}>
                <td className="dm-db-rownum">{rowIndex + 1}</td>
                {table.columns.map((column) => {
                  const relation = relationForColumn(table, column);
                  const options = referenceOptions(tables, relation);
                  return (
                  <td key={column}>
                    {relation ? (
                      <ReferenceSelect
                        value={String(row?.[column] || "")}
                        options={options}
                        disabled={!table.mutable || saving}
                        onChange={(nextValue) => onSave((config) => updateTableCell(config, table, rowIndex, column, nextValue))}
                      />
                    ) : column.toLowerCase() === "status" ? (
                      <ConnectionPill value={row?.[column]} />
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
                <td colSpan={Math.max(table.columns.length, 1) + 1}>Add record</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DataModelRecordDrawer
        table={table}
        tables={tables}
        workspaceConfig={workspaceConfig}
        rowIndex={selectedRow}
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

export default function DataModelPage() {
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
          <div className="dm-layout-v2">
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
                    onSelect={() => setSelectedSource(table.source)}
                  />
                ))}
              </div>
              <div className="dm-obj-col-foot">
                <button type="button" className="dm-obj-add-btn" onClick={() => setAddOpen(true)}>
                  <Plus size={13} />New object
                </button>
              </div>
            </aside>

            {selectedTable && (
              <section className="dm-detail-v2">
                <div className="dm-detail-v2-head">
                  <div className="dm-detail-v2-title">
                    <LucideIcon
                      name={selectedTable.icon || OBJECT_TYPE_PRESETS[selectedTable.objectType]?.icon || "Database"}
                      size={14}
                      className="dm-detail-icon"
                    />
                    <h2>{selectedTable.label}</h2>
                    <span className={`dm-badge ${objectTypeBadge(selectedTable.objectType).cls}`}>
                      {objectTypeBadge(selectedTable.objectType).label}
                    </span>
                  </div>
                  <div className="dm-detail-v2-meta">
                    <code>{selectedTable.source}</code>
                    <span>{pluralize(selectedTable.columns.length, "field")} · {pluralize(selectedTable.rows.length, "record")}</span>
                  </div>
                  <SourceValidationBanner table={selectedTable} />
                </div>
                <DataModelTableSurface workspaceConfig={workspaceConfig} table={selectedTable} tables={tables} saving={saving} onSave={save} />
              </section>
            )}
          </div>
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
