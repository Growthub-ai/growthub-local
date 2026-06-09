"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart2,
  BarChart3,
  Bolt,
  Box,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Code2,
  Columns3,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Gauge,
  Globe,
  GripVertical,
  Grid2X2,
  GitBranch,
  Hash,
  Home,
  Hourglass,
  Import,
  Italic,
  Layers,
  LayoutDashboard,
  Link as LinkIcon,
  Link2,
  List,
  Mail,
  Maximize2,
  MoreVertical,
  Pencil,
  PieChart,
  Plus,
  Quote,
  RefreshCw,
  Rocket,
  Rows3,
  Save,
  Search,
  Settings,
  ShoppingCart,
  Sigma,
  SlidersHorizontal,
  Star,
  Table2,
  Tag,
  ToggleLeft,
  Trash2,
  Type,
  Users,
  Eye,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  DASHBOARD_TEMPLATES,
  KNOWN_AGGREGATIONS,
  KNOWN_CHART_TYPES,
  KNOWN_FILTER_CONJUNCTIONS,
  KNOWN_FILTER_OPERATORS,
  KNOWN_SORT_DIRECTIONS,
  SAMPLE_DATA_BINDINGS,
  cloneTemplateToDashboard,
  cloneTemplateToTab,
  defaultConfigFor,
  normalizeWorkspaceTemplate,
  unwrapWorkspaceTemplateImport,
  validateWorkspaceConfig,
  wrapWorkspaceTemplateExport
} from "@/lib/workspace-schema";
import { governedWorkspaceIntegrationCatalog } from "@/lib/domain/integrations";
import { OBJECT_TYPE_PRESETS, listWorkspaceDataModelTables } from "@/lib/workspace-data-model";
import {
  computeChartProjectionDebug,
  computeChartValuesFromRows,
  deriveWidgetDependencyContract
} from "@/lib/workspace-chart-values";
import { selectObjectFilterableFields, selectObjectSortableFields } from "@/lib/workspace-metadata-selectors";
import { deriveWorkspaceActivationState } from "@/lib/workspace-activation";
import {
  CODEX_SITES_OBJECT_ID,
  ensureCodexSitesDataModel,
  isCodexSiteUrl
} from "@/lib/codex-sites-workspace-adapter";
import { HelperSidecar } from "./data-model/components/HelperSidecar.jsx";
import { WorkspaceRail } from "./workspace-rail.jsx";
import { WorkspaceActivationPanel } from "./components/WorkspaceActivationPanel.jsx";
import { WorkspaceCreationReadinessPanel } from "./components/WorkspaceCreationReadinessPanel.jsx";

// Workspace Metadata Graph V1 — typed dependency contracts.
// Used by sidecar dependency summaries; the existing chart hydration path
// continues to compute values via `computeChartValuesFromRows`. These
// selectors only describe the widget's typed contract — they never mutate
// config or trigger network calls.
const WORKSPACE_METADATA_SELECTORS = Object.freeze({
  deriveWidgetDependencyContract,
  selectObjectFilterableFields,
  selectObjectSortableFields
});

const DEFAULT_CHART_TYPE = "bar-vertical";
const DEFAULT_FILTER_OP = "and";
const DEFAULT_FILTER_OPERATOR = "contains";
const DEFAULT_SORT_DIRECTION = "asc";
const SUB_PANEL_ROOT = "root";
const MANAGED_INTEGRATION_SOURCE_TYPE = "managed-integrations";
const CUSTOM_API_SOURCE_TYPE = "custom-api-webhooks";
const DATA_MODEL_SOURCE_TYPE = "workspace-data-model";
const LIVE_SOURCE_TYPE = "workspace-source-records";
const TESTED_SOURCE_STATUSES = new Set(["connected", "approved", "ok", "success"]);
const HIDDEN_SANDBOX_OBJECT_IDS = new Set(["workspace-helper-sandbox"]);
const WORKSPACE_UI_CACHE_OBJECT_ID = "workspace-ui-cache";

const SOURCE_TYPE_OBJECTS = [
  {
    id: MANAGED_INTEGRATION_SOURCE_TYPE,
    label: "Managed Integrations",
    authority: "Growthub Bridge",
    description: "Bridge or BYO adapters resolve metadata server-side."
  },
  {
    id: CUSTOM_API_SOURCE_TYPE,
    label: "Custom APIs/Webhooks",
    authority: "Custom endpoint",
    description: "Reference a governed endpoint object without storing credentials in widget config."
  }
];

const ENTITY_REFERENCE_FIELD_IDS = ["id", "entityId"];

function hasSavedResponseShape(row) {
  const raw = row?.lastResponse || row?.LastResponse;
  if (!raw || typeof raw !== "string") return false;
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && (Array.isArray(parsed) || typeof parsed === "object");
  } catch {
    return false;
  }
}

function hasTestedSavedRow(table) {
  return (table.rows || []).some((row) => {
    const status = String(row?.status || row?.Status || "").toLowerCase();
    return TESTED_SOURCE_STATUSES.has(status) && hasSavedResponseShape(row);
  });
}

function isSelectableDataModelSource(table) {
  if (table?.storage !== "manual-object") return false;
  if (table.objectType === "api-registry") return false;
  if (table.objectType === "sandbox-environment") return hasTestedSavedRow(table);
  if (table.objectType === "data-source") return hasTestedSavedRow(table);
  const hasStatusField = (table.columns || []).some((column) => String(column).toLowerCase() === "status");
  return hasStatusField ? hasTestedSavedRow(table) : true;
}

const CHART_TYPE_LABELS = {
  "bar-vertical": "Vertical Bar",
  "bar-horizontal": "Horizontal Bar",
  "pie": "Pie",
  "sum": "Sum",
  "gauge": "Gauge"
};

const CHART_TYPE_ICONS = {
  "bar-vertical": BarChart3,
  "bar-horizontal": Rows3,
  "pie": PieChart,
  "sum": Sigma,
  "gauge": Gauge
};

const VISIBLE_CHART_TYPES = KNOWN_CHART_TYPES.filter((type) => type !== "line");

const TABLE_VIEW_TYPES = ["gantt", "board", "calendar", "timeline"];
const TABLE_VIEW_LABELS = {
  gantt: "Gantt",
  board: "Board",
  calendar: "Calendar",
  timeline: "Timeline"
};
const TABLE_VIEW_HELP = {
  gantt: "Track dependencies and baselines",
  board: "Track work in a Kanban view",
  calendar: "Plan weekly or monthly work",
  timeline: "Schedule work over time"
};
const TABLE_VIEW_ICONS = {
  gantt: GitBranch,
  board: Columns3,
  calendar: Calendar,
  timeline: Rows3
};

// User-facing labels for the Twenty-style Y-axis operation dropdown.
// Keys must stay in sync with `lib/workspace-chart-values.js#KNOWN_AGGREGATIONS`
// and the validator in `lib/workspace-schema.js`.
const AGGREGATION_LABELS = {
  sum: "Sum",
  avg: "Average",
  count: "Count (all)",
  countAll: "Count (all)",
  countEmpty: "Count (empty)",
  countNotEmpty: "Count (not empty)",
  countUnique: "Count (unique)",
  percentEmpty: "Percent empty",
  percentNotEmpty: "Percent not empty",
  min: "Min",
  max: "Max"
};

const WIDGET_KIND_ICONS = {
  chart: BarChart3,
  view: Table2,
  iframe: Code2,
  "rich-text": FileText
};

const FILTER_OPERATOR_LABELS = {
  eq: "equals",
  ne: "does not equal",
  contains: "contains",
  gt: "is greater than",
  lt: "is less than",
  isEmpty: "is empty",
  isNotEmpty: "is not empty"
};

const COLUMN_ICON_FOR = (name) => {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("name") || lower.includes("title")) return "🏛";
  if (lower.includes("domain") || lower.includes("url") || lower.includes("link")) return "🔗";
  if (lower.includes("address") || lower.includes("location")) return "🗺";
  if (lower.includes("employee") || lower.includes("people") || lower.includes("user")) return "👥";
  if (lower.includes("linkedin")) return "in";
  if (lower.includes("twitter") || lower === "x") return "𝕏";
  if (lower.includes("date") || lower.includes("created") || lower.includes("updated")) return "📅";
  return "▦";
};

// Icon map for workspace data model object types
const OBJ_ICON_MAP = {
  Activity, BarChart2, Box, Building2, Calendar, CheckSquare, Code2,
  Database, FileText, Globe, Hash, Layers, Link2, List, Mail, Plus,
  ShoppingCart, Star, Tag, Type, Users, Zap,
};

function ObjectIcon({ name, size = 14, className }) {
  const Icon = OBJ_ICON_MAP[name] || Database;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

// Infer a lightweight type from a field name for the dropdown icon
function inferFieldType(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("date") || n.includes("_at") || n.includes("created") || n.includes("updated")) return "date";
  if (n === "status" || n === "stage" || n === "type" || n === "priority" || n === "authtype") return "select";
  if (n.includes("count") || n.includes("num") || n.includes("amount") || n.includes("arr") || n.includes("price")) return "number";
  if (n.startsWith("is_") || n.includes("active") || n.includes("enabled")) return "boolean";
  return "text";
}
const FIELD_TYPE_ICON_MAP = { date: Calendar, select: List, number: Hash, boolean: ToggleLeft };

/**
 * FieldDropdown — searchable field picker driven by a source object's column list.
 * Used by ChartConfigPanel for X/Y axis "Data on display" selection.
 */
function FieldDropdown({ fields, value, onChange, placeholder = "Select field…", disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (fields || []).filter((f) => f.toLowerCase().includes(q)) : (fields || []);
  }, [fields, query]);

  function pick(field) { onChange(field); setOpen(false); setQuery(""); }

  return (
    <div className="field-dropdown-wrap" ref={ref}>
      <button
        type="button"
        className={`field-dropdown-trigger${open ? " open" : ""}${disabled ? " disabled" : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className="field-dropdown-label">{value || placeholder}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="field-dropdown-popover" role="listbox">
          <div className="field-dropdown-search">
            <Search size={11} aria-hidden="true" />
            <input autoFocus placeholder="Search fields" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {filtered.length > 0 ? filtered.map((field) => {
            const FIcon = FIELD_TYPE_ICON_MAP[inferFieldType(field)] || Type;
            const sel = value === field;
            return (
              <button key={field} type="button" role="option" aria-selected={sel}
                className={`field-dropdown-item${sel ? " selected" : ""}`}
                onClick={() => pick(field)}>
                <FIcon size={13} aria-hidden="true" />
                <span>{field}</span>
                {sel && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
              </button>
            );
          }) : <p className="field-dropdown-empty">{fields?.length ? "No match" : "No source selected"}</p>}
        </div>
      )}
    </div>
  );
}

const DEFAULT_POSITION = { x: 4, y: 0, w: 4, h: 5 };
const GRID_COLUMNS = 12;
const GRID_ROWS = 16;
const GRID_CELL_COUNT = GRID_COLUMNS * GRID_ROWS;
const DEFAULT_TAB_ID = "tab-default";
const COLLAPSED_GRID_COLUMNS = "var(--workspace-rail-width, 264px) minmax(0, 1fr)";

function generateId(prefix) {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function textColorForAccent(accent) {
  const hex = String(accent || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#252525" : "#ffffff";
}

function defaultTitleFor(kind) {
  switch (kind) {
    case "chart": return "Chart widget";
    case "view": return "Data view";
    case "iframe": return "Embedded page";
    case "rich-text": return "Text note";
    default: return "Workspace widget";
  }
}

function getTabs(canvas) {
  if (Array.isArray(canvas?.tabs) && canvas.tabs.length > 0) {
    return canvas.tabs;
  }
  return [{
    id: DEFAULT_TAB_ID,
    name: canvas?.name || "Tab 1",
    widgets: Array.isArray(canvas?.widgets) ? canvas.widgets : []
  }];
}

function getActiveTabId(canvas) {
  const tabs = getTabs(canvas);
  if (canvas?.activeTabId && tabs.some((tab) => tab.id === canvas.activeTabId)) {
    return canvas.activeTabId;
  }
  return tabs[0].id;
}

function commitTabs(canvas, tabs, activeTabId) {
  const next = { ...canvas };
  if (tabs.length <= 1) {
    const tab = tabs[0];
    next.name = tab.name;
    next.widgets = tab.widgets;
    delete next.tabs;
    delete next.activeTabId;
  } else {
    next.tabs = tabs;
    next.activeTabId = activeTabId;
    delete next.widgets;
    delete next.name;
  }
  return next;
}

function createDashboardRecord(name = "New Dashboard") {
  const tab = createEmptyTab("Tab 1");
  return {
    id: generateId("dashboard"),
    name,
    createdBy: "Workspace owner",
    updatedAt: "new",
    status: "draft",
    tabs: [tab],
    activeTabId: tab.id
  };
}

function slugifyWorkflowName(name) {
  const slug = String(name || "workflow")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workflow";
}

function getDataModelObject(config, objectId) {
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  return objects.find((object) => object?.id === objectId) || null;
}

function getWorkflowSandboxObject(config) {
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  return objects.find((object) => {
    if (object?.objectType !== "sandbox-environment") return false;
    const id = String(object?.id || "").trim();
    return id && !HIDDEN_SANDBOX_OBJECT_IDS.has(id);
  }) || null;
}

function getWorkspaceUiCache(config) {
  const object = getDataModelObject(config, WORKSPACE_UI_CACHE_OBJECT_ID);
  const row = Array.isArray(object?.rows) ? object.rows.find((entry) => entry?.id === "activation") : null;
  return row && typeof row === "object" ? row : {};
}

function setWorkspaceUiCacheFlag(config, key, value) {
  const dataModel = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dataModel.objects) ? dataModel.objects : [];
  const cacheObject = objects.find((object) => object?.id === WORKSPACE_UI_CACHE_OBJECT_ID) || {
    id: WORKSPACE_UI_CACHE_OBJECT_ID,
    label: "Workspace UI Cache",
    source: "Workspace UI Cache",
    objectType: "custom",
    icon: "Settings",
    columns: ["id", key],
    rows: [],
    binding: { mode: "manual", source: "Workspace UI Cache" }
  };
  const columns = Array.from(new Set([...(Array.isArray(cacheObject.columns) ? cacheObject.columns : ["id"]), key]));
  const rows = Array.isArray(cacheObject.rows) ? cacheObject.rows : [];
  const hasActivationRow = rows.some((row) => row?.id === "activation");
  const nextRows = hasActivationRow
    ? rows.map((row) => row?.id === "activation" ? { ...row, [key]: value } : row)
    : [...rows, { id: "activation", [key]: value }];
  const nextCacheObject = { ...cacheObject, columns, rows: nextRows };
  const nextObjects = objects.some((object) => object?.id === WORKSPACE_UI_CACHE_OBJECT_ID)
    ? objects.map((object) => object?.id === WORKSPACE_UI_CACHE_OBJECT_ID ? nextCacheObject : object)
    : [...objects, nextCacheObject];
  return {
    ...config,
    dataModel: {
      ...dataModel,
      objects: nextObjects
    }
  };
}

function listBuilderWorkflowItems(config) {
  const navFolders = getDataModelObject(config, "nav-folders");
  const rows = Array.isArray(navFolders?.rows) ? navFolders.rows : [];
  return rows.flatMap((folder) => {
    const folderId = String(folder?.id || folder?.name || "").trim();
    const folderName = String(folder?.name || "").trim();
    const items = Array.isArray(folder?.items) ? folder.items : [];
    return items
      .filter((item) => item?.type === "workflow" && item?.objectId && item?.rowId)
      .map((item) => {
        const objectId = String(item.objectId);
        const rowId = String(item.rowId);
        const itemId = String(item.id || `${objectId}:${rowId}`);
        const sandboxObject = getDataModelObject(config, objectId);
        const sandboxRows = Array.isArray(sandboxObject?.rows) ? sandboxObject.rows : [];
        const sandboxRow = sandboxRows.find((row) => String(row?.Name || row?.name || row?.slug || row?.id || "").trim() === rowId);
        return {
          id: itemId,
          folderId,
          objectId,
          rowId,
          fieldName: String(item.fieldName || "orchestrationConfig"),
          label: String(item.label || rowId),
          folderName: folderName || "Builder",
          lifecycleStatus: String(item.lifecycleStatus || item.status || sandboxRow?.lifecycleStatus || sandboxRow?.status || "draft").trim(),
          version: String(sandboxRow?.version || "0").trim(),
          updatedAt: String(sandboxRow?.orchestrationPublishedAt || sandboxRow?.orchestrationDraftUpdatedAt || sandboxRow?.lastTested || "").trim()
        };
      });
  });
}

function listBuilderSiteItems(config) {
  const object = getDataModelObject(config, CODEX_SITES_OBJECT_ID);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows.flatMap((row, index) => {
    const url = String(row?.url || "").trim();
    if (!isCodexSiteUrl(url)) return [];
    const title = String(row?.Name || row?.name || `Codex Site ${index + 1}`).trim();
    const rawStatus = String(row?.status || "").trim().toLowerCase();
    const status = rawStatus === "active" ? "live" : rawStatus || "draft";
    return [{
      type: "site",
      id: String(row?.id || row?.Name || `codex-site-${index + 1}`),
      title,
      itemKind: "Site",
      updatedAt: formatBuilderTimestamp(row?.lastRecordedAt || ""),
      status,
      site: {
        row,
        rowIndex: index,
        title,
        url,
        app: String(row?.app || "apps/workspace").trim(),
        client: String(row?.client || "Workspace").trim()
      }
    }];
  });
}

function formatBuilderTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "new") return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function updateWorkflowFolderItemInConfig(config, workflow, updater) {
  const workflowId = String(workflow?.id || "").trim();
  if (!workflowId) return config;
  return {
    ...config,
    dataModel: {
      ...(config.dataModel || {}),
      objects: (Array.isArray(config.dataModel?.objects) ? config.dataModel.objects : []).map((object) => {
        if (object?.id !== "nav-folders") return object;
        return {
          ...object,
          rows: (Array.isArray(object.rows) ? object.rows : []).map((folder) => ({
            ...folder,
            items: (Array.isArray(folder.items) ? folder.items : []).map((item) =>
              String(item?.id || `${item?.objectId}:${item?.rowId}`) === workflowId ? updater(item) : item
            )
          }))
        };
      })
    }
  };
}

function createBlankWorkflowSandboxRow(rowId, nowIso) {
  const registryId = "growthub-workspace-smoke-api";
  const draftGraph = JSON.stringify({
    version: "1",
    provider: "growthub-native",
    nodes: [
      {
        id: "input",
        type: "input",
        label: "Input",
        subtitle: "Manual or source payload",
        config: { inputMode: "manual", samplePayload: {}, sourceType: "", sourceId: "", entityId: "", filterMode: "and", filters: [] }
      },
      {
        id: "api-request",
        type: "api-registry-call",
        label: "API Registry",
        subtitle: `${registryId} · GET /api/workspace`,
        config: {
          registryId,
          integrationId: registryId,
          baseUrl: "http://localhost:3000",
          endpoint: "/api/workspace",
          method: "GET",
          authRef: "",
          queryParams: {},
          bodyTemplate: "",
          requestHeadersMetadata: { authHeaderName: "x-api-key", authPrefix: "", contentType: "" },
          timeoutMs: 30000
        }
      },
      {
        id: "transform",
        type: "transform-filter",
        label: "Transform",
        subtitle: "Map fields and filter rows",
        config: {
          rootPath: "",
          mode: "json",
          responseMode: "json",
          fieldMap: {},
          includeFields: [],
          excludeFields: [],
          computedFields: {},
          filters: [],
          filterMode: "and",
          maxRows: 0
        }
      },
      {
        id: "result",
        type: "tool-result",
        label: "Result",
        subtitle: "Save status and response",
        config: {
          successStatusCodes: [200],
          writeLastResponse: true,
          writeSourceRecord: true,
          sourceRecordId: "",
          outputMode: "normalized-json",
          previewFields: [],
          statusField: "status",
          lastTestedField: "lastTested"
        }
      }
    ],
    edges: [
      { from: "input", to: "api-request", passes: "payload, filters, variables" },
      { from: "api-request", to: "transform", passes: "provider-response" },
      { from: "transform", to: "result", passes: "normalized-output" }
    ]
  }, null, 2);
  return {
    Name: rowId,
    lifecycleStatus: "draft",
    version: "0",
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
    instructions: "Draft workflow created from Builder. Configure nodes, save draft, test successfully, then publish to v1.",
    command: "",
    orchestrationConfig: "",
    orchestrationDraftConfig: draftGraph,
    orchestrationDraftStatus: "draft",
    orchestrationDraftUpdatedAt: nowIso,
    orchestrationDraftBaseVersion: "0",
    orchestrationDraftTestPassed: false,
    orchestrationDraftTestedConfig: "",
    orchestrationDeltas: [],
    timeoutMs: "180000",
    resolverTemplateId: "",
    connectorKind: "local-agent-host",
    executionLane: "workflow",
    status: "draft",
    lastTested: "",
    lastRunId: "",
    lastSourceId: "",
    lastResponse: ""
  };
}

function createWorkflowApiRegistryObject() {
  const preset = OBJECT_TYPE_PRESETS["api-registry"] || {};
  const columns = Array.isArray(preset.columns) ? [...preset.columns] : ["integrationId"];
  return {
    id: "workflow-api-registry",
    label: preset.label || "API Registry",
    source: preset.label || "API Registry",
    objectType: "api-registry",
    icon: preset.icon || "Code2",
    columns,
    rows: [
      {
        integrationId: "growthub-workspace-smoke-api",
        authRef: "",
        baseUrl: "http://localhost:3000",
        endpoint: "/api/workspace",
        method: "GET",
        status: "draft",
        lastTested: "",
        lastResponse: "",
        entityTypes: "workspace",
        description: "Local workspace smoke endpoint for first workflow setup.",
        connectorKind: "custom-http",
        resolverTemplateId: "",
        schemaVersion: "1",
        capabilities: "read",
        executionLane: "sandbox-local"
      }
    ],
    binding: { mode: "manual", source: "Data Model" },
    relations: Array.isArray(preset.relations) ? preset.relations.map((relation) => ({ ...relation })) : [],
    fieldSettings: { hidden: [], order: columns }
  };
}

function createWorkflowSandboxObject() {
  const preset = OBJECT_TYPE_PRESETS["sandbox-environment"] || {};
  const columns = Array.isArray(preset.columns) ? [...preset.columns] : ["Name"];
  return {
    id: "sandbox-environments",
    label: preset.label || "Sandbox Environments",
    source: preset.label || "Sandbox Environments",
    objectType: "sandbox-environment",
    icon: preset.icon || "Terminal",
    columns,
    rows: [],
    binding: { mode: "manual", source: "Data Model" },
    relations: Array.isArray(preset.relations) ? preset.relations.map((relation) => ({ ...relation })) : [],
    fieldSettings: { hidden: [], order: columns }
  };
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
  const rows = Array.isArray(navObject.rows) ? navObject.rows : [];
  const folderName = "Builder";
  const existingFolder = rows.find((row) => String(row?.name || "").trim().toLowerCase() === folderName.toLowerCase());
  const item = {
    id: generateId("item"),
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
          id: generateId("folder"),
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

function createEmptyTab(name = "Untitled") {
  return {
    id: generateId("tab"),
    name,
    widgets: []
  };
}

function cloneTabForDashboard(tab, name) {
  return {
    id: generateId("tab"),
    name,
    widgets: (tab?.widgets || []).map((widget) => ({
      ...cloneConfig(widget),
      id: generateId("widget")
    }))
  };
}

function normalizeDashboard(dashboard, fallbackCanvas) {
  const tabs = Array.isArray(dashboard?.tabs) && dashboard.tabs.length
    ? dashboard.tabs
    : getTabs(fallbackCanvas).map((tab) => ({
        ...tab,
        id: tab.id === DEFAULT_TAB_ID ? generateId("tab") : tab.id
      }));
  const activeTabId = dashboard?.activeTabId && tabs.some((tab) => tab.id === dashboard.activeTabId)
    ? dashboard.activeTabId
    : tabs[0].id;
  return {
    ...dashboard,
    tabs,
    activeTabId
  };
}

function dashboardCanvasFrom(dashboard, baseCanvas) {
  const normalized = normalizeDashboard(dashboard, baseCanvas);
  return commitTabs(baseCanvas, normalized.tabs, normalized.activeTabId);
}

function updateDashboardCanvas(dashboard, canvas) {
  const tabs = getTabs(canvas);
  const activeTabId = getActiveTabId(canvas);
  return {
    ...dashboard,
    tabs,
    activeTabId
  };
}

function createDashboardFromTab(name, tab, source = {}) {
  const clonedTab = cloneTabForDashboard(tab, tab?.name || "Tab 1");
  return {
    ...source,
    id: generateId("dashboard"),
    name,
    createdBy: source.createdBy || "Workspace owner",
    updatedAt: "new",
    status: "draft",
    tabs: [clonedTab],
    activeTabId: clonedTab.id
  };
}

function getActiveDashboardId(dashboards, fallback) {
  if (fallback && dashboards.some((dashboard) => dashboard.id === fallback)) {
    return fallback;
  }
  return dashboards[0]?.id || null;
}

function activeDashboardIndex(dashboards, activeDashboardId) {
  const index = dashboards.findIndex((dashboard) => dashboard.id === activeDashboardId);
  return index >= 0 ? index : 0;
}

function syncActiveDashboard(config, activeDashboardId) {
  const dashboards = config.dashboards || [];
  const resolvedId = getActiveDashboardId(dashboards, activeDashboardId);
  if (!resolvedId) return config;
  return {
    ...config,
    dashboards: dashboards.map((dashboard) =>
      dashboard.id === resolvedId ? updateDashboardCanvas(dashboard, config.canvas) : dashboard
    )
  };
}

function commitDashboardCanvas(config, activeDashboardId, nextCanvas) {
  const dashboards = config.dashboards || [];
  const resolvedId = getActiveDashboardId(dashboards, activeDashboardId);
  return {
    ...config,
    dashboards: dashboards.map((dashboard) =>
      dashboard.id === resolvedId ? updateDashboardCanvas(dashboard, nextCanvas) : dashboard
    ),
    canvas: nextCanvas
  };
}

function renameDashboardInConfig(config, dashboardId, name, activeDashboardId) {
  const nextName = name.trim() || "New Dashboard";
  const prevDashboards = config.dashboards || [];
  const index = prevDashboards.findIndex((dashboard) => dashboard.id === dashboardId);
  if (index < 0) return config;
  const nextDashboardsWithTabs = prevDashboards.map((dashboard, dashboardIndex) => {
    if (dashboard.id !== dashboardId) return dashboard;
    const normalized = normalizeDashboard(dashboard, dashboardIndex === 0 ? config.canvas : undefined);
    return { ...normalized, name: nextName, updatedAt: "new" };
  });
  const activeDashboard = nextDashboardsWithTabs.find((dashboard) => dashboard.id === getActiveDashboardId(nextDashboardsWithTabs, activeDashboardId));
  return {
    ...config,
    dashboards: nextDashboardsWithTabs,
    canvas: dashboardCanvasFrom(activeDashboard || nextDashboardsWithTabs[0], config.canvas)
  };
}

function findFreePosition(widgets) {
  const occupied = new Set();
  for (const widget of widgets) {
    for (let dx = 0; dx < widget.position.w; dx += 1) {
      for (let dy = 0; dy < widget.position.h; dy += 1) {
        occupied.add(`${widget.position.x + dx}:${widget.position.y + dy}`);
      }
    }
  }
  for (let y = 0; y <= GRID_ROWS - DEFAULT_POSITION.h; y += 1) {
    for (let x = 0; x <= GRID_COLUMNS - DEFAULT_POSITION.w; x += 1) {
      let collides = false;
      for (let dx = 0; dx < DEFAULT_POSITION.w && !collides; dx += 1) {
        for (let dy = 0; dy < DEFAULT_POSITION.h && !collides; dy += 1) {
          if (occupied.has(`${x + dx}:${y + dy}`)) collides = true;
        }
      }
      if (!collides) return { ...DEFAULT_POSITION, x, y };
    }
  }
  return { ...DEFAULT_POSITION };
}

function normalizePosition(start, end) {
  const x1 = start % GRID_COLUMNS;
  const y1 = Math.floor(start / GRID_COLUMNS);
  const x2 = end % GRID_COLUMNS;
  const y2 = Math.floor(end / GRID_COLUMNS);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1) + 1,
    h: Math.abs(y2 - y1) + 1
  };
}

function positionsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function clampPositionToFreeSpace(position, widgets) {
  const bounded = {
    x: Math.max(0, Math.min(position.x, GRID_COLUMNS - 1)),
    y: Math.max(0, Math.min(position.y, GRID_ROWS - 1)),
    w: Math.max(1, Math.min(position.w, GRID_COLUMNS - position.x)),
    h: Math.max(1, Math.min(position.h, GRID_ROWS - position.y))
  };
  const collides = widgets.some((widget) => positionsOverlap(bounded, widget.position));
  return collides ? findFreePosition(widgets) : bounded;
}

function clampWidgetMovePosition(position, widget, widgets) {
  const bounded = {
    ...widget.position,
    x: Math.max(0, Math.min(position.x, GRID_COLUMNS - widget.position.w)),
    y: Math.max(0, Math.min(position.y, GRID_ROWS - widget.position.h))
  };
  const otherWidgets = widgets.filter((item) => item.id !== widget.id);
  return otherWidgets.some((item) => positionsOverlap(bounded, item.position))
    ? widget.position
    : bounded;
}

function cellIndexFromGridPointer(event, gridElement) {
  if (!gridElement) return null;
  const rect = gridElement.getBoundingClientRect();
  const styles = window.getComputedStyle(gridElement);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  const gap = Number.parseFloat(styles.columnGap) || 0;
  const x = event.clientX - rect.left - paddingLeft;
  const y = event.clientY - rect.top - paddingTop;
  const usableWidth = rect.width - paddingLeft - paddingRight - gap * (GRID_COLUMNS - 1);
  const cellWidth = usableWidth / GRID_COLUMNS;
  const cellHeight = 52;
  const column = Math.max(0, Math.min(GRID_COLUMNS - 1, Math.floor(x / (cellWidth + gap))));
  const row = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(y / (cellHeight + gap))));
  if (x < 0 || y < 0) return null;
  return row * GRID_COLUMNS + column;
}

function cellPointFromIndex(index) {
  return {
    x: index % GRID_COLUMNS,
    y: Math.floor(index / GRID_COLUMNS)
  };
}

function resizePositionFromCell(position, corner, index) {
  const cellX = index % GRID_COLUMNS;
  const cellY = Math.floor(index / GRID_COLUMNS);
  const right = position.x + position.w - 1;
  const bottom = position.y + position.h - 1;
  if (corner === "nw") {
    return {
      x: Math.min(cellX, right),
      y: Math.min(cellY, bottom),
      w: Math.max(1, right - Math.min(cellX, right) + 1),
      h: Math.max(1, bottom - Math.min(cellY, bottom) + 1)
    };
  }
  if (corner === "ne") {
    const y = Math.min(cellY, bottom);
    return {
      x: position.x,
      y,
      w: Math.max(1, Math.max(cellX, position.x) - position.x + 1),
      h: Math.max(1, bottom - y + 1)
    };
  }
  if (corner === "sw") {
    const x = Math.min(cellX, right);
    return {
      x,
      y: position.y,
      w: Math.max(1, right - x + 1),
      h: Math.max(1, Math.max(cellY, position.y) - position.y + 1)
    };
  }
  return {
    x: position.x,
    y: position.y,
    w: Math.max(1, Math.max(cellX, position.x) - position.x + 1),
    h: Math.max(1, Math.max(cellY, position.y) - position.y + 1)
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function widgetKindLabel(kind) {
  if (kind === "iframe") return "iFrame";
  if (kind === "rich-text") return "Rich Text";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function IconGlyph({ icon: Icon, size = 16 }) {
  if (!Icon) return null;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.9} />;
}

function isLikelyHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function richTextToHtml(value) {
  const escaped = escapeHtml(value || "Start writing...");
  return escaped
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\[(.*?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n/g, "<br />");
}

function normalizeChartValues(value) {
  return String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function serializeChartValues(values) {
  return (Array.isArray(values) ? values : []).join(", ");
}

function parseLineList(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeLineList(values) {
  return (Array.isArray(values) ? values : []).join(", ");
}

function parseManualRows(value, columns) {
  const activeColumns = columns.length ? columns : [];
  return String(value)
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const values = row.split("|").map((item) => item.trim());
      return activeColumns.reduce((record, column, index) => {
        record[column] = values[index] || "";
        return record;
      }, {});
    });
}

function serializeManualRows(rows, columns) {
  const activeColumns = columns.length ? columns : [];
  return (Array.isArray(rows) ? rows : [])
    .map((row) => activeColumns.map((column) => row?.[column] || "").join(" | "))
    .join("\n");
}

function getColumnList(widget) {
  return Array.isArray(widget?.config?.columns) ? widget.config.columns : [];
}

function getOrderedColumns(widget) {
  const columns = getColumnList(widget);
  const order = Array.isArray(widget?.config?.fieldSettings?.order) ? widget.config.fieldSettings.order : [];
  if (!order.length) return columns;
  const known = new Set(columns);
  const ordered = order.filter((name) => known.has(name));
  const remaining = columns.filter((name) => !ordered.includes(name));
  return [...ordered, ...remaining];
}

function getHiddenColumnSet(widget) {
  const hidden = Array.isArray(widget?.config?.fieldSettings?.hidden) ? widget.config.fieldSettings.hidden : [];
  return new Set(hidden);
}

function getVisibleColumns(widget) {
  const ordered = getOrderedColumns(widget);
  const hidden = getHiddenColumnSet(widget);
  return ordered.filter((name) => !hidden.has(name));
}

function getTableViewSettings(widget) {
  const settings = widget?.config?.fieldSettings?.tableView;
  return isPlainConfigObject(settings) ? settings : {};
}

function getTableViewType(widget) {
  const type = getTableViewSettings(widget).type;
  return TABLE_VIEW_TYPES.includes(type) ? type : "";
}

function getFieldValue(row, field, fallback = "") {
  if (!row || !field) return fallback;
  const value = row[field];
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function firstMatchingField(columns, candidates) {
  const lower = columns.map((column) => [column, String(column).toLowerCase()]);
  for (const candidate of candidates) {
    const found = lower.find(([, name]) => name.includes(candidate));
    if (found) return found[0];
  }
  return columns[0] || "";
}

function resolveTableViewFields(widget) {
  const columns = getVisibleColumns(widget);
  const settings = getTableViewSettings(widget);
  return {
    titleField: settings.titleField || firstMatchingField(columns, ["title", "name", "task", "project"]),
    statusField: settings.statusField || firstMatchingField(columns, ["status", "stage", "state", "lane"]),
    startDateField: settings.startDateField || firstMatchingField(columns, ["start", "created", "date"]),
    endDateField: settings.endDateField || firstMatchingField(columns, ["end", "due", "deadline", "target"]),
  };
}

function withFieldSettings(config, patch) {
  const current = isPlainConfigObject(config?.fieldSettings) ? config.fieldSettings : { hidden: [], order: [] };
  return {
    ...config,
    fieldSettings: {
      hidden: Array.isArray(current.hidden) ? [...current.hidden] : [],
      order: Array.isArray(current.order) ? [...current.order] : [],
      ...patch
    }
  };
}

function withTableViewSettings(config, patch) {
  const current = isPlainConfigObject(config?.fieldSettings) ? config.fieldSettings : {};
  const currentTableView = isPlainConfigObject(current.tableView) ? current.tableView : {};
  return {
    ...config,
    fieldSettings: {
      ...current,
      tableView: {
        ...currentTableView,
        ...patch
      }
    }
  };
}

function isPlainConfigObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reorderColumn(widget, fieldId, direction) {
  const ordered = getOrderedColumns(widget);
  const index = ordered.indexOf(fieldId);
  if (index < 0) return widget.config?.fieldSettings;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return widget.config?.fieldSettings;
  const next = [...ordered];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return { ...(widget.config?.fieldSettings || {}), order: next };
}

function toggleColumnHidden(widget, fieldId) {
  const hidden = getHiddenColumnSet(widget);
  if (hidden.has(fieldId)) hidden.delete(fieldId);
  else hidden.add(fieldId);
  return { ...(widget.config?.fieldSettings || {}), hidden: Array.from(hidden) };
}

function getSortClauses(widget) {
  return Array.isArray(widget?.config?.sort) ? widget.config.sort : [];
}

function getFilterConfig(widget) {
  const filter = widget?.config?.filter;
  if (!isPlainConfigObject(filter)) return { op: DEFAULT_FILTER_OP, clauses: [] };
  return {
    op: KNOWN_FILTER_CONJUNCTIONS.includes(filter.op) ? filter.op : DEFAULT_FILTER_OP,
    clauses: Array.isArray(filter.clauses) ? filter.clauses : []
  };
}

function getChartType(widget) {
  const chartType = widget?.config?.chartType;
  return KNOWN_CHART_TYPES.includes(chartType) ? chartType : DEFAULT_CHART_TYPE;
}

function getChartAxis(widget, axisKey) {
  const axis = widget?.config?.[axisKey];
  return isPlainConfigObject(axis) ? axis : {};
}

function getChartStyle(widget) {
  const style = widget?.config?.style;
  return isPlainConfigObject(style) ? style : {};
}

function summarizeSource(widget) {
  const binding = widget?.config?.binding;
  if (binding?.sourceType === DATA_MODEL_SOURCE_TYPE) return binding.source || widget?.config?.source || "Data Model object";
  if (binding?.mode === "integration") {
    const source = binding.source || "Integration";
    if (binding.entityLabel) return `${source} · ${binding.entityLabel}`;
    if (binding.entityId) return `${source} · ${binding.entityId}`;
    return source;
  }
  if (widget?.config?.source) return widget.config.source;
  return "Static";
}

function summarizeSourceType(binding) {
  if (binding?.sourceType === DATA_MODEL_SOURCE_TYPE) return "Data Model";
  if (binding?.sourceType === CUSTOM_API_SOURCE_TYPE) return "Custom APIs/Webhooks";
  if (binding?.mode === "integration" || binding?.sourceType === MANAGED_INTEGRATION_SOURCE_TYPE || binding?.sourceStorage === LIVE_SOURCE_TYPE) return "Managed Integrations";
  return "Static data";
}

function resolveBindingSourceType(binding) {
  // LIVE_SOURCE_TYPE is internal infrastructure — resolve to its user-facing source category
  if (binding?.sourceStorage === LIVE_SOURCE_TYPE) return MANAGED_INTEGRATION_SOURCE_TYPE;
  if (binding?.sourceType === LIVE_SOURCE_TYPE) return MANAGED_INTEGRATION_SOURCE_TYPE;
  if (binding?.sourceType) return binding.sourceType;
  if (binding?.mode === "integration") return MANAGED_INTEGRATION_SOURCE_TYPE;
  return "static";
}

function resolveDataModelTable(dataModelTables, binding) {
  if (binding?.sourceType !== DATA_MODEL_SOURCE_TYPE) return null;
  const tables = Array.isArray(dataModelTables) ? dataModelTables : [];
  return tables.find((table) => table.objectId === binding.objectId || table.id === binding.objectId || table.source === binding.source) || null;
}

function resolveViewWidget(widget, dataModelTables) {
  if (widget?.kind !== "view") return widget;
  const table = resolveDataModelTable(dataModelTables, widget.config?.binding);
  if (!table) return widget;
  return {
    ...widget,
    config: {
      ...(widget.config || {}),
      source: table.source,
      columns: table.columns,
      rows: table.rows
    }
  };
}

/**
 * Recompute `config.values` for a chart widget config from its bound Data
 * Model rows. This is the only path that writes chart values from rows.
 * The chart renderer continues to read from `config.values` — it never
 * queries rows directly.
 *
 * Returns the next `config` object (with finite-number `values`) plus the
 * computation result (`rowCount`, `usedRowCount`, `warnings`).
 *
 * When the chart has no bound Data Model source, the input config is
 * returned unchanged and the result is `{ status: "unbound" }`.
 */
function recomputeChartConfig(chartConfig, dataModelTables) {
  const config = chartConfig && typeof chartConfig === "object" && !Array.isArray(chartConfig) ? chartConfig : {};
  const binding = config.binding;
  if (binding?.sourceType !== DATA_MODEL_SOURCE_TYPE) {
    return { config, result: { status: "unbound" } };
  }
  const table = resolveDataModelTable(dataModelTables, binding);
  if (!table) {
    return { config, result: { status: "no-source", warnings: ["Selected source is unavailable."] } };
  }
  const computation = computeChartValuesFromRows({
    rows: Array.isArray(table.rows) ? table.rows : [],
    xAxis: config.xAxis,
    yAxis: config.yAxis,
    filter: config.filter,
    chartType: config.chartType
  });
  return {
    config: { ...config, values: computation.values },
    result: { status: "computed", ...computation }
  };
}

function findWidgetByIdInConfig(workspaceConfig, widgetId) {
  if (!widgetId) return null;
  for (const dashboard of workspaceConfig?.dashboards || []) {
    for (const tab of dashboard.tabs || []) {
      for (const widget of tab.widgets || []) {
        if (widget?.id === widgetId) return widget;
      }
    }
  }
  const canvas = workspaceConfig?.canvas;
  for (const tab of canvas?.tabs || []) {
    for (const widget of tab.widgets || []) {
      if (widget?.id === widgetId) return widget;
    }
  }
  for (const widget of canvas?.widgets || []) {
    if (widget?.id === widgetId) return widget;
  }
  return null;
}

function summarizeFields(widget) {
  const total = getColumnList(widget).length;
  const hidden = getHiddenColumnSet(widget).size;
  if (!total) return "0 shown";
  return hidden ? `${total - hidden} of ${total} shown` : `${total} shown`;
}

function summarizeTableView(widget) {
  return TABLE_VIEW_LABELS[getTableViewType(widget)] || "Table";
}

function summarizeSort(widget) {
  const sort = getSortClauses(widget);
  if (!sort.length) return "›";
  if (sort.length === 1) {
    const [first] = sort;
    return `${first.fieldId} ${first.direction || DEFAULT_SORT_DIRECTION}`;
  }
  return `${sort.length} sorts`;
}

function summarizeFilter(widget) {
  const filter = getFilterConfig(widget);
  const count = filter.clauses.length;
  if (!count) return "›";
  return `${count} clause${count === 1 ? "" : "s"} (${filter.op})`;
}

function WidgetPanelHeaderIcon({ kind }) {
  const Icon = WIDGET_KIND_ICONS[kind] || Box;
  return <span className="workspace-widget-panel-kind-icon"><IconGlyph icon={Icon} size={15} /></span>;
}

function WidgetSettingsRow({ icon: Icon, label, value, disabled, active, onClick }) {
  return <button
    type="button"
    className={`workspace-twenty-settings-row${active ? " is-active" : ""}`}
    disabled={disabled}
    onClick={onClick}
  >
    <span className="workspace-twenty-settings-row__main">
      <span className="workspace-twenty-settings-row__icon">{Icon ? <Icon size={15} /> : null}</span>
      <span>{label}</span>
    </span>
    <span className="workspace-twenty-settings-row__value">{value || ""}</span>
    {!disabled ? <ChevronDown className="workspace-twenty-settings-row__chevron" size={14} /> : null}
  </button>;
}

function WidgetSelectRow({ icon: Icon, label, value, children }) {
  return <label className="workspace-twenty-select-row">
    <span className="workspace-twenty-settings-row__main">
      <span className="workspace-twenty-settings-row__icon">{Icon ? <Icon size={15} /> : null}</span>
      <span>{label}</span>
    </span>
    <span className="workspace-twenty-select-row__control">{children}</span>
  </label>;
}

function describeIntegrationLane(integration) {
  return integration?.lane === "data-source" ? "Data Sources" : "Workspace Tools";
}

function flattenIntegrationSettings(integrationSettings) {
  const grouped = integrationSettings?.integrations || integrationSettings || {};
  const runtime = [
    ...(Array.isArray(grouped.dataSources) ? grouped.dataSources : []),
    ...(Array.isArray(grouped.workspaceIntegrations) ? grouped.workspaceIntegrations : [])
  ];
  const byId = new Map();
  for (const item of [...governedWorkspaceIntegrationCatalog, ...runtime]) {
    if (item?.id) byId.set(item.id, { ...byId.get(item.id), ...item });
  }
  return Array.from(byId.values());
}

function getFilterFieldOptions(widget, entities = []) {
  const fields = new Set(getColumnList(widget));
  const binding = widget?.config?.binding || {};
  if (binding.mode === "integration") {
    ["id", "label", "secondaryLabel", "entityType", "provider", "lane", "status"].forEach((field) => fields.add(field));
    fields.add("provider");
    fields.add("lane");
    for (const entity of entities) {
      if (entity?.metadata && typeof entity.metadata === "object") {
        Object.keys(entity.metadata).forEach((field) => fields.add(field));
      }
    }
  }
  if (binding.sourceType === CUSTOM_API_SOURCE_TYPE) {
    const customFields = Array.isArray(binding.fields) ? binding.fields : ["entityId", "status", "createdAt"];
    customFields.forEach((field) => fields.add(field));
  }
  return Array.from(fields).filter(Boolean);
}

function getEntityFieldValue(entity, fieldId) {
  if (!entity || !fieldId) return "";
  if (fieldId === "id" || fieldId === "entityId") return entity.id || "";
  if (fieldId === "label" || fieldId === "name") return entity.label || "";
  if (fieldId === "secondaryLabel") return entity.secondaryLabel || "";
  if (fieldId === "entityType") return entity.entityType || "";
  if (fieldId === "provider") return entity.provider || "";
  if (fieldId === "lane") return entity.lane || "";
  if (fieldId === "status") return entity.status || "";
  if (entity.metadata && typeof entity.metadata === "object" && entity.metadata[fieldId] !== undefined) {
    return String(entity.metadata[fieldId]);
  }
  return "";
}

function getEntityFieldChoices(entities) {
  const fields = new Map();
  const add = (id, label) => {
    if (id && !fields.has(id)) fields.set(id, { id, label });
  };
  add("id", "Stable ID");
  add("label", "Primary label");
  add("secondaryLabel", "Secondary label");
  add("entityType", "Entity type");
  add("provider", "Provider");
  add("lane", "Lane");
  add("status", "Status");
  for (const entity of entities) {
    if (entity?.metadata && typeof entity.metadata === "object") {
      Object.keys(entity.metadata).forEach((field) => add(field, field));
    }
  }
  return Array.from(fields.values());
}

function getFilterFieldChoices(widget, entities = []) {
  const binding = widget?.config?.binding || {};
  if (binding.mode === "integration" && entities.length) return getEntityFieldChoices(entities);
  return getFilterFieldOptions(widget, entities).map((id) => ({ id, label: id }));
}

function getEntityValueChoices(entities, fieldId) {
  const seen = new Map();
  for (const entity of entities) {
    const value = getEntityFieldValue(entity, fieldId);
    if (!value || seen.has(value)) continue;
    const label = fieldId === "id" || fieldId === "entityId"
      ? `${entity.label || value} · ${value}`
      : value;
    seen.set(value, { value, label, entity });
  }
  return Array.from(seen.values());
}

function findEntityByFieldValue(entities, fieldId, value) {
  if (!value) return null;
  return entities.find((entity) => getEntityFieldValue(entity, fieldId) === value) || null;
}

function updateWidgetEntityBinding(widget, entity) {
  const binding = widget.config?.binding || {};
  const existingFilter = widget.config?.filter;
  const existingClauses = Array.isArray(existingFilter?.clauses) ? existingFilter.clauses : [];

  if (!entity) {
    const { entityId, entityType, entityLabel, ...restBinding } = binding;
    const cleanedClauses = existingClauses.filter(
      (clause) => !(ENTITY_REFERENCE_FIELD_IDS.includes(clause.fieldId) && clause.operator === "eq")
    );
    return {
      ...widget.config,
      binding: restBinding,
      filter: { op: existingFilter?.op || DEFAULT_FILTER_OP, clauses: cleanedClauses }
    };
  }

  const entityClause = { fieldId: "id", operator: "eq", value: entity.id };
  const otherClauses = existingClauses.filter(
    (clause) => !(ENTITY_REFERENCE_FIELD_IDS.includes(clause.fieldId) && clause.operator === "eq")
  );
  const nextBinding = {
    ...binding,
    entityId: entity.id,
    entityLabel: entity.label
  };
  if (entity.entityType) nextBinding.entityType = entity.entityType;
  else delete nextBinding.entityType;
  return {
    ...widget.config,
    source: binding.source || entity.label,
    binding: nextBinding,
    filter: { op: existingFilter?.op || DEFAULT_FILTER_OP, clauses: [entityClause, ...otherClauses] }
  };
}

function resolveChartColor(style, branding) {
  if (style?.colors === "manual" && style.manualColor) return style.manualColor;
  if (style?.colors === "brand-local") return branding?.accent || "#3f68ff";
  if (style?.colors === "brand-bridge") return branding?.bridgeAccent || branding?.accent || "#3f68ff";
  if (style?.colors === "accent") return "#38bdf8";
  return null;
}

const NORMALIZED_TEMPLATES = DASHBOARD_TEMPLATES.map((template) => ({
  ...normalizeWorkspaceTemplate(template),
  widgets: template.widgets
}));

function widgetKindFill(kind) {
  switch (kind) {
    case "chart": return "#dbeafe";
    case "view": return "#fef3c7";
    case "iframe": return "#e0f2fe";
    case "rich-text": return "#dcfce7";
    default: return "#e5e7eb";
  }
}

function TemplateMiniGrid({ template }) {
  const widgets = Array.isArray(template?.widgets) ? template.widgets : [];
  return <div
    className="template-mini-grid"
    aria-hidden="true"
    style={{
      "--template-mini-columns": GRID_COLUMNS,
      "--template-mini-rows": GRID_ROWS
    }}
  >
    {widgets.map((widget, index) => <span
      className={`template-mini-widget kind-${widget.kind}`}
      key={`${widget.kind}-${index}`}
      style={{
        gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
        gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
        background: widgetKindFill(widget.kind)
      }}
    />)}
  </div>;
}

function TemplateGallery({
  templates,
  previewTemplateId,
  onPreview,
  onClose,
  onApplyToCurrentTab,
  onCloneAsDashboard,
  filter,
  onFilterChange
}) {
  const categories = useMemo(() => {
    const set = new Set();
    templates.forEach((template) => {
      if (template.category) set.add(template.category);
    });
    return ["all", ...Array.from(set)];
  }, [templates]);
  const tags = useMemo(() => {
    const set = new Set();
    templates.forEach((template) => {
      (template.tags || []).forEach((tag) => set.add(tag));
    });
    return ["all", ...Array.from(set)];
  }, [templates]);
  const filtered = useMemo(() => {
    const query = (filter?.query || "").trim().toLowerCase();
    return templates.filter((template) => {
      if (filter?.category && filter.category !== "all" && template.category !== filter.category) return false;
      if (filter?.tag && filter.tag !== "all" && !(template.tags || []).includes(filter.tag)) return false;
      if (!query) return true;
      const haystack = `${template.name} ${template.description} ${(template.tags || []).join(" ")} ${(template.bestFor || []).join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [templates, filter]);
  const previewTemplate = templates.find((template) => template.id === previewTemplateId) || null;
  const setFilter = (patch) => onFilterChange({ ...(filter || {}), ...patch });
  return <div className="template-gallery" role="dialog" aria-modal="true" aria-label="Workspace templates">
    <div className="template-gallery-backdrop" onClick={onClose} aria-hidden="true" />
    <section className="template-gallery-panel">
      <header className="template-gallery-header">
        <div>
          <p>Workspace templates</p>
          <h2>Pick a starting layout</h2>
        </div>
        <button type="button" aria-label="Close template gallery" onClick={onClose}>x</button>
      </header>
      <div className="template-gallery-filters">
        <input
          aria-label="Search templates"
          placeholder="Search templates…"
          value={filter?.query || ""}
          onChange={(event) => setFilter({ query: event.target.value })}
        />
        <select
          aria-label="Filter by category"
          value={filter?.category || "all"}
          onChange={(event) => setFilter({ category: event.target.value })}
        >
          {categories.map((category) => <option key={category} value={category}>{category === "all" ? "All categories" : category}</option>)}
        </select>
        <select
          aria-label="Filter by tag"
          value={filter?.tag || "all"}
          onChange={(event) => setFilter({ tag: event.target.value })}
        >
          {tags.map((tag) => <option key={tag} value={tag}>{tag === "all" ? "All tags" : `#${tag}`}</option>)}
        </select>
      </div>
      <div className="template-gallery-grid">
        {filtered.length === 0 ? <p className="workspace-panel-hint">No templates match those filters.</p> : null}
        {filtered.map((template) => {
          const isPreviewing = previewTemplate?.id === template.id;
          return <article
            className={`template-card${isPreviewing ? " previewing" : ""}`}
            key={template.id}
          >
            <div className="template-card-header">
              <strong>{template.name}</strong>
              <span className="template-card-category">{template.category}</span>
            </div>
            <p className="template-card-description">{template.description}</p>
            <div className="template-card-preview">
              <TemplateMiniGrid template={template} />
            </div>
            <div className="template-card-meta">
              <span>{template.widgetCount} widget{template.widgetCount === 1 ? "" : "s"}</span>
              {template.bestFor.length ? <span>· Best for: {template.bestFor.join(", ")}</span> : null}
            </div>
            {template.tags.length ? <div className="template-card-tags">
              {template.tags.map((tag) => <span key={tag}>#{tag}</span>)}
            </div> : null}
            <div className="template-card-actions">
              <button type="button" onClick={() => onPreview(template.id)}>{isPreviewing ? "Previewing" : "Preview"}</button>
              <button type="button" className="primary" onClick={() => onApplyToCurrentTab(template.id)}>Use Here</button>
              <button type="button" onClick={() => onCloneAsDashboard(template.id)}>New Dashboard</button>
            </div>
          </article>;
        })}
      </div>
      {previewTemplate ? <footer className="template-gallery-footer" aria-live="polite">
        <strong>{previewTemplate.name}</strong>
        <span>{previewTemplate.preview?.summary || previewTemplate.description}</span>
      </footer> : null}
    </section>
  </div>;
}

function SubPanelHeader({ title, breadcrumb, onBack }) {
  return <div className="workspace-widget-subpanel-header">
    <button type="button" className="workspace-widget-subpanel-back" aria-label={`Back from ${title}`} onClick={onBack}>‹</button>
    <div>
      {breadcrumb ? <p>{breadcrumb}</p> : null}
      <strong>{title}</strong>
    </div>
  </div>;
}

/**
 * EntityBadge — chip showing the selected entity on the source panel and root inspector.
 * Displays primary label + muted secondary label (stable ID). onClear is optional.
 */
function EntityBadge({ entity, onClear }) {
  const initials = entity.entityType
    ? entity.entityType[0].toUpperCase()
    : (entity.label?.[0] || "•").toUpperCase();
  return <div className="workspace-entity-badge">
    <span className="workspace-entity-badge-icon" aria-hidden="true">{initials}</span>
    <span className="workspace-entity-badge-meta">
      <strong title={entity.label}>{entity.label}</strong>
      {entity.secondaryLabel ? <em title={entity.secondaryLabel}>{entity.secondaryLabel}</em> : null}
    </span>
    {onClear ? <button
      type="button"
      className="workspace-entity-badge-clear"
      aria-label={`Clear selected entity ${entity.label}`}
      onClick={onClear}
    >
      <X size={11} />
    </button> : null}
  </div>;
}

function UniversalSourceInfoCard() {
  return <p className="workspace-source-info-card">
    Universal source objects support managed integrations and custom APIs/webhooks through normalized metadata and stable saved references.
  </p>;
}

/**
 * EntitySelector — compact dropdown for picking a normalized source object after
 * an integration is selected from the SourceSubPanel.
 *
 * Governed invariant: only the object `id` is persisted. The `label` is
 * display-only and may be refreshed from adapter metadata at any time.
 * The browser never holds source credentials or executes source queries.
 */
function EntitySelector({ integration, entities, selectedEntityId, selectedEntityLabel, selectedEntityType, onSelect, loading }) {
  const selected = entities.find((e) => e.id === selectedEntityId)
    || (selectedEntityId ? {
      id: selectedEntityId,
      label: selectedEntityLabel || selectedEntityId,
      secondaryLabel: selectedEntityId,
      entityType: selectedEntityType
    } : null);

  const clearSelected = () => {
    if (!selectedEntityId || window.confirm("Remove the selected source object from this widget?")) {
      onSelect(null);
    }
  };

  return <div className="workspace-entity-selector">
    <p className="workspace-panel-label">Source object</p>
    {selected ? <EntityBadge entity={selected} onClear={clearSelected} /> : null}
    {loading ? <p className="workspace-entity-empty">Loading source objects…</p> : null}
    {!loading && !entities.length ? <p className="workspace-entity-empty">
      No source objects returned. Configure a server-side API/webhook object resolver for this integration.
    </p> : null}
    {!loading && entities.length ? <label className="workspace-entity-dropdown">
      <span>Select source object</span>
      <select
        aria-label="Select source object"
        value={selectedEntityId || ""}
        onChange={(event) => {
          const entity = entities.find((item) => item.id === event.target.value);
          onSelect(entity || null);
        }}
      >
        <option value="">Choose an object</option>
        {entities.map((entity) => <option key={entity.id} value={entity.id}>
          {entity.label}{entity.secondaryLabel ? ` · ${entity.secondaryLabel}` : ""}
        </option>)}
      </select>
    </label> : null}
  </div>;
}

/**
 * LiveSourcePanel — step-by-step no-code wizard for configuring a live source
 * binding backed by the source-resolver-registry.
 *
 * Steps:
 *   1 — Auth mode  (Bridge / BYO Token)
 *   2 — Integration  (pick from available or enter custom id)
 *   3 — Entity config  (entity type, entity id — optional)
 *   4 — Source ID  (stable key for growthub.source-records.json)
 *   5 — Test + Preview  (POST /api/workspace/test-source)
 *
 * Apply button is only enabled after a successful test (testState.ok === true).
 * When the user clicks Apply the binding is committed to the widget config.
 */
function LiveSourcePanel({ widget, integrations, adapterConfig, onApply, onCancel }) {
  const existing = widget.config?.binding || {};
  const [step, setStep] = useState(1);
  const [authMode, setAuthMode] = useState(existing.sourceAuthority === "byo-token" ? "byo-token" : "bridge");
  const [integrationId, setIntegrationId] = useState(existing.integrationId || "");
  const [entityType, setEntityType] = useState(existing.entityType || "");
  const [entityId, setEntityId] = useState(existing.entityId || "");
  const [sourceId, setSourceId] = useState(existing.sourceId || existing.integrationId || "");
  const [testState, setTestState] = useState(null);
  const [testing, setTesting] = useState(false);

  const isBridge = adapterConfig?.integrationAdapter === "growthub-bridge";
  const hasBridgeToken = adapterConfig?.growthubBridge?.hasAccessToken;
  const availableIntegrations = Array.isArray(integrations) ? integrations : [];

  const canProceedStep1 = authMode === "bridge" || authMode === "byo-token";
  const canProceedStep2 = typeof integrationId === "string" && integrationId.trim().length > 0;
  const canProceedStep3 = true;
  const canProceedStep4 = typeof sourceId === "string" && sourceId.trim().length > 0;
  const canApply = testState?.ok === true;

  const autoSourceId = integrationId.trim().replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  function handleIntegrationSelect(id) {
    setIntegrationId(id);
    if (!sourceId || sourceId === autoSourceId) {
      setSourceId(id.replace(/[^a-z0-9-]/gi, "-").toLowerCase());
    }
  }

  async function runTest() {
    if (!canProceedStep2) return;
    setTesting(true);
    setTestState(null);
    try {
      const res = await fetch("/api/workspace/test-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          integrationId: integrationId.trim(),
          binding: {
            integrationId: integrationId.trim(),
            entityType: entityType.trim() || undefined,
            entityId: entityId.trim() || undefined,
            sourceId: sourceId.trim() || integrationId.trim(),
            authMode
          }
        })
      });
      const data = await res.json();
      setTestState(data);
      if (data.ok) setStep(5);
    } catch {
      setTestState({ ok: false, reason: "network-error", error: "Network error — check console" });
    } finally {
      setTesting(false);
    }
  }

  function applyBinding() {
    if (!canApply) return;
    onApply({
      ...widget.config,
      source: integrationId.trim(),
      binding: {
        mode: "integration",
        source: integrationId.trim(),
        sourceStorage: LIVE_SOURCE_TYPE,
        sourceType: MANAGED_INTEGRATION_SOURCE_TYPE,
        sourceId: sourceId.trim() || integrationId.trim(),
        integrationId: integrationId.trim(),
        entityType: entityType.trim() || undefined,
        entityId: entityId.trim() || undefined,
        sourceAuthority: authMode === "bridge" ? "growthub-bridge" : "byo-token"
      }
    });
  }

  return <div className="live-source-wizard">
    {/* Step breadcrumb */}
    <div className="live-source-steps" role="list">
      {["Auth", "Integration", "Entity", "Source ID", "Test"].map((label, idx) => {
        const s = idx + 1;
        const done = step > s;
        const active = step === s;
        return <span
          key={s}
          className={`live-source-step${active ? " active" : ""}${done ? " done" : ""}`}
          role="listitem"
          aria-current={active ? "step" : undefined}
        >
          <span className="live-source-step-dot">{done ? "✓" : s}</span>
          <span className="live-source-step-label">{label}</span>
        </span>;
      })}
    </div>

    {/* Step 1: Auth mode */}
    {step === 1 && <div className="live-source-step-body">
      <p className="live-source-step-title">How does this integration authenticate?</p>
      <p className="live-source-step-hint">Your token stays server-side. The browser only sees normalized records.</p>
      <div className="live-source-auth-toggle" role="radiogroup" aria-label="Auth mode">
        <button
          type="button"
          role="radio"
          aria-checked={authMode === "bridge"}
          className={authMode === "bridge" ? "active" : ""}
          onClick={() => setAuthMode("bridge")}
        >
          <strong>Growthub Bridge</strong>
          <em>{isBridge && hasBridgeToken ? "Connected — token in env" : "Set GROWTHUB_BRIDGE_BASE_URL + GROWTHUB_BRIDGE_ACCESS_TOKEN"}</em>
          {isBridge && hasBridgeToken ? <span className="live-source-badge connected">connected</span> : <span className="live-source-badge warn">env required</span>}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={authMode === "byo-token"}
          className={authMode === "byo-token" ? "active" : ""}
          onClick={() => setAuthMode("byo-token")}
        >
          <strong>BYO Token / Custom env</strong>
          <em>Your resolver reads the env var you specify. Set it in .env or Vercel env.</em>
          <span className="live-source-badge neutral">custom</span>
        </button>
      </div>
      <button type="button" className="live-source-next" disabled={!canProceedStep1} onClick={() => setStep(2)}>
        Next → Choose integration
      </button>
    </div>}

    {/* Step 2: Integration */}
    {step === 2 && <div className="live-source-step-body">
      <p className="live-source-step-title">Which integration?</p>
      <p className="live-source-step-hint">Pick a connected integration or enter a custom resolver id that matches what your resolver file registers.</p>
      <div className="live-source-integration-list">
        {availableIntegrations.filter((i) => i.isConnected || i.status === "connected").map((integration) => <button
          key={integration.id}
          type="button"
          className={`live-source-integration-row${integrationId === integration.id ? " active" : ""}`}
          onClick={() => handleIntegrationSelect(integration.id)}
        >
          <span className="live-source-integration-icon">{integration.icon || integration.label?.[0] || "•"}</span>
          <span className="live-source-integration-meta">
            <strong>{integration.label}</strong>
            <em>{integration.provider} · {integration.status}</em>
          </span>
          {integrationId === integration.id ? <Check size={15} /> : null}
        </button>)}
        {availableIntegrations.filter((i) => i.isConnected || i.status === "connected").length === 0
          ? <p className="live-source-empty">No connected integrations — enter a custom resolver id below.</p>
          : null}
      </div>
      <label className="live-source-custom-id">
        <span>Custom resolver id</span>
        <input
          type="text"
          placeholder="my-crm, windsor-ai, custom-api…"
          value={integrationId}
          onChange={(e) => handleIntegrationSelect(e.target.value)}
        />
      </label>
      <div className="live-source-nav">
        <button type="button" className="live-source-back" onClick={() => setStep(1)}>← Back</button>
        <button type="button" className="live-source-next" disabled={!canProceedStep2} onClick={() => setStep(3)}>
          Next → Entity config
        </button>
      </div>
    </div>}

    {/* Step 3: Entity config */}
    {step === 3 && <div className="live-source-step-body">
      <p className="live-source-step-title">Entity configuration <em>(optional)</em></p>
      <p className="live-source-step-hint">Tell the resolver which object to fetch. Leave blank if your resolver fetches everything by default.</p>
      <label className="live-source-field">
        <span>Entity type</span>
        <input
          type="text"
          placeholder="project.tasks, records, contacts…"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
        />
      </label>
      <label className="live-source-field">
        <span>Entity id / object id</span>
        <input
          type="text"
          placeholder="gid_12345, project_abc, board-id…"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        />
      </label>
      <div className="live-source-nav">
        <button type="button" className="live-source-back" onClick={() => setStep(2)}>← Back</button>
        <button type="button" className="live-source-next" disabled={!canProceedStep3} onClick={() => setStep(4)}>
          Next → Source ID
        </button>
      </div>
    </div>}

    {/* Step 4: Source ID */}
    {step === 4 && <div className="live-source-step-body">
      <p className="live-source-step-title">Source ID</p>
      <p className="live-source-step-hint">A stable key used to store and retrieve live records. Defaults to the integration id.</p>
      <label className="live-source-field">
        <span>Source ID</span>
        <input
          type="text"
          placeholder={autoSourceId || "my-source"}
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        />
      </label>
      <p className="live-source-step-hint">Records will be stored under this key in <code>growthub.source-records.json</code> and available immediately after Refresh.</p>
      <div className="live-source-nav">
        <button type="button" className="live-source-back" onClick={() => setStep(3)}>← Back</button>
        <button type="button" className="live-source-next" disabled={!canProceedStep4} onClick={() => { setStep(5); }}>
          Next → Test connection
        </button>
      </div>
    </div>}

    {/* Step 5: Test + preview */}
    {step === 5 && <div className="live-source-step-body">
      <p className="live-source-step-title">Test connection</p>
      <div className="live-source-summary">
        <span><em>Integration</em> <strong>{integrationId}</strong></span>
        {entityType ? <span><em>Entity type</em> <strong>{entityType}</strong></span> : null}
        {entityId ? <span><em>Entity id</em> <strong>{entityId}</strong></span> : null}
        <span><em>Auth</em> <strong>{authMode === "bridge" ? "Growthub Bridge" : "BYO Token"}</strong></span>
      </div>

      {!testState && !testing && <button
        type="button"
        className="live-source-test-btn"
        onClick={runTest}
        disabled={testing || !canProceedStep2 || !canProceedStep4}
      >
        <RefreshCw size={15} />
        Run test fetch
      </button>}

      {testing && <div className="live-source-testing">
        <RefreshCw size={15} className="spinning" />
        <span>Contacting resolver…</span>
      </div>}

      {testState && !testState.ok && <div className="live-source-test-result error">
        <strong>{testState.reason === "no-resolver" ? "No resolver registered" : "Fetch failed"}</strong>
        {testState.reason === "no-resolver" && <p>
          No resolver is registered for <code>{integrationId}</code>.
          Registered resolvers: {testState.registeredResolvers?.length
            ? testState.registeredResolvers.join(", ")
            : "none"}.
          <br />Upload a resolver file in the Management panel or add one to <code>lib/adapters/integrations/resolvers/</code>.
        </p>}
        {testState.reason !== "no-resolver" && <p>{testState.error}</p>}
        <button type="button" className="live-source-retry" onClick={runTest} disabled={testing}>Retry</button>
      </div>}

      {testState?.ok && <div className="live-source-test-result success">
        <strong>✓ {testState.recordCount} record{testState.recordCount !== 1 ? "s" : ""} fetched</strong>
        <span>Columns: {testState.columns?.join(", ") || "—"}</span>
        {testState.preview?.length > 0 && <div className="live-source-preview">
          <table>
            <thead>
              <tr>{testState.columns?.slice(0, 6).map((col) => <th key={col}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {testState.preview.map((row, idx) => <tr key={idx}>
                {testState.columns?.slice(0, 6).map((col) => <td key={col}>
                  {row[col] === null || row[col] === undefined ? <em className="live-source-null">—</em> : String(row[col]).slice(0, 60)}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>}
        <button type="button" className="live-source-retry" onClick={runTest} disabled={testing}>Re-test</button>
      </div>}

      <div className="live-source-nav">
        <button type="button" className="live-source-back" onClick={() => setStep(4)}>← Back</button>
        <button
          type="button"
          className="live-source-apply"
          disabled={!canApply}
          onClick={applyBinding}
          title={canApply ? "Apply live source binding to widget" : "Run a successful test first"}
        >
          {canApply ? "✓ Apply binding" : "Test required to apply"}
        </button>
      </div>
    </div>}

    <button type="button" className="live-source-cancel" onClick={onCancel}>Cancel</button>
  </div>;
}

/**
 * SourceDropdown — compact inline source picker used in the chart config header.
 * Shows only workspace-config saved data model objects. No static rows, no integrations.
 */
function SourceDropdown({ widget, dataModelTables, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const binding = widget.config?.binding || {};

  useEffect(() => {
    if (!open) return;
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const savedObjects = useMemo(() => {
    const list = (Array.isArray(dataModelTables) ? dataModelTables : []).filter(isSelectableDataModelSource);
    const q = query.trim().toLowerCase();
    return q ? list.filter((t) => `${t.label} ${t.source}`.toLowerCase().includes(q)) : list;
  }, [dataModelTables, query]);

  const currentLabel = (() => {
    if (binding.sourceType === DATA_MODEL_SOURCE_TYPE && binding.objectId) {
      const found = (Array.isArray(dataModelTables) ? dataModelTables : []).find((t) => t.objectId === binding.objectId);
      return found?.label || binding.source || "Object";
    }
    return "Select source…";
  })();

  function selectObject(table) {
    const nextConfig = {
      ...widget.config,
      source: table.source,
      columns: table.columns,
      rows: [],
      binding: { mode: "manual", source: table.source, sourceType: DATA_MODEL_SOURCE_TYPE, sourceAuthority: "workspace-config", objectId: table.objectId },
      fieldSettings: { hidden: [], order: table.columns }
    };
    if (widget.kind === "chart") {
      const { config: recomputed } = recomputeChartConfig(nextConfig, dataModelTables);
      onChange(recomputed);
    } else {
      onChange(nextConfig);
    }
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="source-dropdown-wrap" ref={ref}>
      <button type="button" className={`source-dropdown-trigger${open ? " open" : ""}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="source-dropdown-label">{currentLabel}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="source-dropdown-popover" role="listbox">
          <div className="source-dropdown-search">
            <Search size={12} aria-hidden="true" />
            <input autoFocus placeholder="Search objects…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search objects" />
          </div>
          {savedObjects.length > 0 ? savedObjects.map((table) => {
            const sel = binding.sourceType === DATA_MODEL_SOURCE_TYPE && binding.objectId === table.objectId;
            return (
              <button key={table.id} type="button" role="option" aria-selected={sel} className={`source-dropdown-item${sel ? " selected" : ""}`} onClick={() => selectObject(table)}>
                <ObjectIcon name={table.icon || OBJECT_TYPE_PRESETS[table.objectType]?.icon || "Database"} size={13} />
                <span>{table.label}</span>
                {sel && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
              </button>
            );
          }) : (
            <div className="source-dropdown-empty">
              <span>No objects yet.</span>
              <a href="/data-model" className="source-dropdown-hint">Set up sources on Data Model →</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * SourceRefreshConfigurator — inline test + apply panel shown inside
 * Managed Integration and Custom API/Webhook source config.
 *
 * Refresh is a *behavior* of a source, not a source type.
 * This component surfaces test-source and preview-records capabilities
 * without exposing resolver-registry internals to the user.
 */

/**
 * ResolverControlPanel — composable, provider-agnostic resolver management.
 *
 * Reads resolver metadata from /api/workspace/resolvers (entityTypes,
 * hasListEntities) and renders generic controls. No provider names,
 * no hardcoded field names — every control is driven by what the resolver
 * file itself declares.
 *
 * Props:
 *   binding           — current widget binding (read-only, source of truth)
 *   adapterConfig     — workspace adapter config (bridge vs byo-token auth mode)
 *   onUpdateBinding   — (nextBinding) => void — saves binding params to widget config
 *   onRefreshAndSave  — (binding, objectId) => Promise<void> — fetch+persist rows
 */
function ResolverControlPanel({ binding, adapterConfig, onUpdateBinding, onRefreshAndSave }) {
  const integrationId = binding?.integrationId;
  const objectId = binding?.objectId;

  const [resolverMeta, setResolverMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [entities, setEntities] = useState(null);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError] = useState(null);

  const [entityType, setEntityType] = useState(binding?.entityType || "");
  const [entityId, setEntityId] = useState(binding?.entityId || "");
  const [lookbackDays, setLookbackDays] = useState(binding?.days || 30);

  const [testState, setTestState] = useState(null);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);

  // Load resolver metadata once on mount
  useEffect(() => {
    if (!integrationId) { setMetaLoading(false); return; }
    setMetaLoading(true);
    fetch("/api/workspace/resolvers")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const meta = Array.isArray(data.resolvers)
          ? data.resolvers.find((r) => r.integrationId === integrationId) || null
          : null;
        setResolverMeta(meta);
        if (!entityType && meta?.entityTypes?.length) {
          setEntityType(meta.entityTypes[0]);
        }
      })
      .catch(() => setResolverMeta(null))
      .finally(() => setMetaLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationId]);

  // Load entity list when resolver declares listEntities
  useEffect(() => {
    if (!integrationId || !resolverMeta?.hasListEntities) return;
    setEntitiesLoading(true);
    setEntitiesError(null);
    fetch(`/api/workspace/list-entities?integrationId=${encodeURIComponent(integrationId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data) => setEntities(Array.isArray(data.entities) ? data.entities : []))
      .catch(() => { setEntitiesError("Could not load entities"); setEntities([]); })
      .finally(() => setEntitiesLoading(false));
  }, [integrationId, resolverMeta?.hasListEntities]);

  const authMode = adapterConfig?.integrationAdapter === "growthub-bridge" ? "bridge" : "byo-token";

  function buildTestBinding() {
    return {
      ...binding,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      days: lookbackDays || undefined,
    };
  }

  function saveParams() {
    onUpdateBinding({
      ...binding,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      days: lookbackDays || undefined,
    });
  }

  async function runTest() {
    setTesting(true);
    setTestState(null);
    try {
      const res = await fetch("/api/workspace/test-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId, binding: { ...buildTestBinding(), authMode } }),
      });
      setTestState(await res.json());
    } catch {
      setTestState({ ok: false, reason: "network-error", error: "Network error — check console" });
    } finally {
      setTesting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      await onRefreshAndSave(buildTestBinding(), objectId);
      setRefreshResult({ ok: true });
    } catch (err) {
      setRefreshResult({ ok: false, error: err.message || "Refresh failed" });
    } finally {
      setRefreshing(false);
    }
  }

  if (!integrationId) return null;

  const isRegistered = !metaLoading && resolverMeta !== null;
  const isMissing = !metaLoading && resolverMeta === null;
  const entityTypes = resolverMeta?.entityTypes || [];

  return (
    <section className="resolver-control-panel">
      {/* ── Status bar ─────────────────────────────────────────────── */}
      <div className="resolver-status-bar">
        <span className={`resolver-reg-badge${isRegistered ? " ok" : isMissing ? " missing" : ""}`}>
          {metaLoading ? "…" : isRegistered ? "✓" : "!"}
        </span>
        <code className="resolver-id-code">{integrationId}</code>
        <span className="resolver-status-label">
          {metaLoading
            ? "checking…"
            : isRegistered
              ? `resolver registered · ${entityTypes.length} entity type${entityTypes.length !== 1 ? "s" : ""}`
              : "resolver not found"}
        </span>
      </div>

      {isMissing && (
        <p className="resolver-guidance warn">
          No resolver registered for <code>{integrationId}</code>.
          Add a file at <code>lib/adapters/integrations/resolvers/{integrationId}.js</code> that calls{" "}
          <code>{"registerSourceResolver({ integrationId: \"" + integrationId + "\", ... })"}</code>,
          then restart the dev server.
        </p>
      )}

      {isRegistered && (
        <>
          {/* ── Entity type ─────────────────────────────────────────── */}
          {entityTypes.length > 0 && (
            <div className="resolver-param-row">
              <label className="resolver-param-label">Entity type</label>
              <select
                className="resolver-param-select"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              >
                <option value="">— any —</option>
                {entityTypes.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── Entity picker ────────────────────────────────────────── */}
          {resolverMeta?.hasListEntities && (
            <div className="resolver-param-row">
              <label className="resolver-param-label">Entity</label>
              {entitiesLoading ? (
                <span className="resolver-loading-label">Loading entities…</span>
              ) : entitiesError ? (
                <span className="resolver-error-label">{entitiesError}</span>
              ) : entities?.length ? (
                <select
                  className="resolver-param-select"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                >
                  <option value="">— all —</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>{ent.label || ent.id}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="resolver-param-input"
                  value={entityId}
                  placeholder="Entity id"
                  onChange={(e) => setEntityId(e.target.value)}
                />
              )}
            </div>
          )}

          {/* ── Lookback ────────────────────────────────────────────── */}
          <div className="resolver-param-row">
            <label className="resolver-param-label">Lookback</label>
            <div className="resolver-lookback-row">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`resolver-lookback-pill${lookbackDays === d ? " active" : ""}`}
                  onClick={() => setLookbackDays(d)}
                >
                  {d}d
                </button>
              ))}
              <input
                type="number"
                className="resolver-lookback-custom"
                value={lookbackDays}
                min={1}
                max={365}
                aria-label="Custom lookback days"
                onChange={(e) => setLookbackDays(Number(e.target.value) || 30)}
              />
            </div>
          </div>

          {/* ── Save params ─────────────────────────────────────────── */}
          <button type="button" className="resolver-save-params-btn" onClick={saveParams}>
            Save parameters to binding
          </button>

          {/* ── Test connection ─────────────────────────────────────── */}
          <div className="resolver-actions">
            <button
              type="button"
              className="resolver-test-btn"
              onClick={runTest}
              disabled={testing}
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button
              type="button"
              className="resolver-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Fetch all records and save to Data Model"
            >
              {refreshing ? "Fetching…" : "Fetch & save data"}
            </button>
          </div>

          {/* ── Test result ─────────────────────────────────────────── */}
          {testState && !testState.ok && (
            <div className="resolver-result-block error">
              <p className="resolver-result-title">
                {testState.reason === "no-token" ? "Token required" : "Connection failed"}
              </p>
              <p className="resolver-result-detail">{testState.error || testState.reason}</p>
              {testState.reason === "no-token" && (
                <p className="resolver-guidance">
                  Add the required env var to <code>.env.local</code> and restart the dev server.
                  Check the resolver file for the exact variable name.
                </p>
              )}
              <button type="button" className="resolver-retry-btn" onClick={runTest} disabled={testing}>
                Retry
              </button>
            </div>
          )}

          {testState?.ok && (
            <div className="resolver-result-block ok">
              <div className="resolver-result-header">
                <span className="resolver-result-ok-badge">✓ Connected</span>
                <span className="resolver-result-count">
                  {testState.rowCount ?? testState.preview?.length ?? 0} records (preview)
                </span>
              </div>
              {testState.preview?.length > 0 && (
                <div className="resolver-preview-table-wrap">
                  <table className="resolver-preview-table">
                    <thead>
                      <tr>
                        {(testState.columns || []).slice(0, 5).map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {testState.preview.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {(testState.columns || []).slice(0, 5).map((col) => (
                            <td key={col}>
                              {row[col] == null ? <em>—</em> : String(row[col]).slice(0, 30)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Refresh result ─────────────────────────────────────── */}
          {refreshResult && (
            <div className={`resolver-result-block ${refreshResult.ok ? "ok" : "error"}`}>
              {refreshResult.ok
                ? <span className="resolver-result-ok-badge">✓ Data saved to Data Model</span>
                : <p className="resolver-result-detail">{refreshResult.error}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SourceRefreshConfigurator({ widget, integrationId, adapterConfig, onApply }) {
  const existing = widget.config?.binding || {};
  const isRefreshable = Boolean(existing.sourceStorage === LIVE_SOURCE_TYPE);
  const [open, setOpen] = useState(isRefreshable);
  const [entityType, setEntityType] = useState(existing.entityType || "");
  const [entityId, setEntityId] = useState(existing.entityId || "");
  const [testState, setTestState] = useState(null);
  const [testing, setTesting] = useState(false);

  const canApply = testState?.ok === true;
  const authMode = adapterConfig?.integrationAdapter === "growthub-bridge" ? "bridge" : "byo-token";

  async function runTest() {
    setTesting(true);
    setTestState(null);
    try {
      const res = await fetch("/api/workspace/test-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          integrationId,
          binding: {
            integrationId,
            entityType: entityType.trim() || undefined,
            entityId: entityId.trim() || undefined,
            sourceId: integrationId,
            authMode,
          }
        })
      });
      const data = await res.json();
      setTestState(data);
    } catch {
      setTestState({ ok: false, error: "Network error — check console" });
    } finally {
      setTesting(false);
    }
  }

  function applyRefreshable() {
    if (!canApply) return;
    onApply({
      ...widget.config,
      binding: {
        ...widget.config?.binding,
        sourceStorage: LIVE_SOURCE_TYPE,
        sourceId: integrationId,
        entityType: entityType.trim() || undefined,
        entityId: entityId.trim() || undefined,
      }
    });
  }

  if (!open) {
    return <div className="source-refresh-collapsed">
      <button type="button" className="source-refresh-toggle" onClick={() => setOpen(true)}>
        <RefreshCw size={13} aria-hidden="true" />
        {isRefreshable ? "Refresh enabled — reconfigure" : "Enable source refresh"}
      </button>
      {isRefreshable && <span className="source-refresh-active-badge">✓ refreshable</span>}
    </div>;
  }

  return <div className="source-refresh-panel">
    <div className="source-refresh-header">
      <RefreshCw size={14} aria-hidden="true" />
      <strong>Source refresh</strong>
      <button type="button" className="source-refresh-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
    </div>
    <p className="source-refresh-hint">
      Test the connection to preview live records. Apply to enable the Refresh tab for this widget.
    </p>
    <label className="source-refresh-field">
      <span>Entity type <em>(optional)</em></span>
      <input value={entityType} placeholder="contacts, companies…" onChange={(e) => setEntityType(e.target.value)} />
    </label>
    <label className="source-refresh-field">
      <span>Entity id filter <em>(optional)</em></span>
      <input value={entityId} placeholder="specific record id" onChange={(e) => setEntityId(e.target.value)} />
    </label>
    <button type="button" className="source-refresh-test-btn" onClick={runTest} disabled={testing}>
      {testing ? "Testing…" : "Test connection"}
    </button>
    {testState && !testState.ok && (
      <div className="source-refresh-error">
        <strong>Connection failed</strong>
        <span>{testState.reason || testState.error || "Unknown error"}</span>
        <button type="button" onClick={runTest} disabled={testing}>Retry</button>
      </div>
    )}
    {testState?.ok && (
      <div className="source-refresh-success">
        <span>✓ Connection verified</span>
        {testState.preview?.length > 0 && (
          <div className="source-refresh-preview">
            <p className="source-refresh-preview-label">{testState.preview.length} record(s) preview</p>
            <table>
              <thead>
                <tr>{testState.columns?.slice(0, 5).map((col) => <th key={col}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {testState.preview.slice(0, 3).map((row, idx) => (
                  <tr key={idx}>
                    {testState.columns?.slice(0, 5).map((col) => (
                      <td key={col}>{row[col] == null ? <em>—</em> : String(row[col]).slice(0, 40)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="source-refresh-apply" onClick={applyRefreshable}>
          ✓ Apply refresh binding
        </button>
      </div>
    )}
  </div>;
}

function SourceSubPanel({ widget, dataModelTables, onChange, onBack }) {
  const binding = widget.config?.binding || {};
  const [query, setQuery] = useState("");

  const savedObjects = useMemo(() => {
    const list = (Array.isArray(dataModelTables) ? dataModelTables : []).filter(isSelectableDataModelSource);
    const q = query.trim().toLowerCase();
    return q ? list.filter((t) => `${t.label} ${t.source}`.toLowerCase().includes(q)) : list;
  }, [dataModelTables, query]);

  const selectObject = useCallback((table) => {
    const alreadySelected = binding.sourceType === DATA_MODEL_SOURCE_TYPE && binding.objectId === table.objectId;
    if (alreadySelected) return;
    if (binding.sourceType === DATA_MODEL_SOURCE_TYPE && binding.objectId) {
      if (!window.confirm(`Change source to "${table.label}"?`)) return;
    }
    const nextConfig = {
      ...widget.config,
      source: table.source,
      columns: table.columns,
      rows: [],
      binding: {
        mode: "manual",
        source: table.source,
        sourceType: DATA_MODEL_SOURCE_TYPE,
        sourceAuthority: "workspace-config",
        objectId: table.objectId,
      },
      fieldSettings: { hidden: [], order: table.columns }
    };
    // Chart widgets always project rows into `config.values`. Recompute on
    // source change so the preview reflects the new binding immediately.
    if (widget.kind === "chart") {
      const { config: recomputed } = recomputeChartConfig(nextConfig, dataModelTables);
      onChange(recomputed);
      return;
    }
    onChange(nextConfig);
  }, [binding, dataModelTables, onChange, widget.config, widget.kind]);

  const activeObjectId = binding.sourceType === DATA_MODEL_SOURCE_TYPE ? binding.objectId : null;

  return (
    <section className="workspace-widget-subpanel">
      <SubPanelHeader title="Source" breadcrumb={widget.title} onBack={onBack} />
      <label className="workspace-source-search-wrap">
        <Search size={13} aria-hidden="true" />
        <input
          placeholder="Search objects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search data objects"
        />
      </label>
      <div className="workspace-source-object-list">
        {savedObjects.length > 0 ? savedObjects.map((table) => {
          const isActive = activeObjectId === table.objectId;
          const iconName = table.icon || OBJECT_TYPE_PRESETS[table.objectType]?.icon || "Database";
          // Only surface a badge when it communicates *real* runtime state
          // (live-backed = sidecar-hydrated). Manual is the default and would
          // be visual noise; api/webhook are reserved for future surfacing.
          const showLiveBadge = table.sourceBadge === "live";
          return (
            <button
              key={table.id}
              type="button"
              className={`workspace-source-object-row${isActive ? " active" : ""}`}
              onClick={() => selectObject(table)}
            >
              <span className="workspace-source-object-icon">
                <ObjectIcon name={iconName} size={15} />
              </span>
              <span className="workspace-source-object-meta">
                <strong>{table.label}</strong>
                <em>{table.columns.length} field{table.columns.length !== 1 ? "s" : ""} · {table.rows.length} record{table.rows.length !== 1 ? "s" : ""}</em>
              </span>
              {showLiveBadge ? <span className="workspace-source-badge badge-live" aria-label="Live source">Live</span> : null}
              {isActive && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
            </button>
          );
        }) : (
          <div className="workspace-source-empty">
            <Database size={22} aria-hidden="true" />
            <strong>No objects yet</strong>
            <p>Create Data Source, People, Tasks, or Custom objects on the Data Model page, then return here to bind them.</p>
            <a href="/data-model" className="workspace-source-empty-link">Go to Data Model →</a>
          </div>
        )}
      </div>
      <p className="workspace-panel-hint">
        Selecting an object writes a config reference only. Resolver functions and auth credentials stay server-side.
      </p>
    </section>
  );
}

function FieldRow({ name, hidden, onToggle, onRemove, canRemove }) {
  const FIcon = FIELD_TYPE_ICON_MAP[inferFieldType(name)] || Type;
  return (
    <div className={`wfp-field-row${hidden ? " hidden" : ""}`}>
      <GripVertical size={13} className="wfp-grip" aria-hidden="true" />
      <span className="wfp-field-icon" aria-hidden="true"><FIcon size={13} /></span>
      <span className="wfp-field-name">{name}</span>
      <div className="wfp-field-actions">
        <button
          type="button"
          className={`wfp-eye-btn${hidden ? " off" : ""}`}
          onClick={() => onToggle(name)}
          aria-label={hidden ? `Show ${name}` : `Hide ${name}`}
          title={hidden ? "Show" : "Hide"}
        >
          {hidden
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          }
        </button>
        {canRemove && (
          <button type="button" className="wfp-remove-btn" onClick={() => onRemove(name)} aria-label={`Remove ${name}`} title="Remove">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function FieldsSubPanel({ widget, dataModelTable, onChange, onBack }) {
  const viewWidget = dataModelTable ? resolveViewWidget(widget, [dataModelTable]) : widget;
  const ordered = getOrderedColumns(viewWidget);
  const hiddenSet = getHiddenColumnSet(viewWidget);
  const visible = ordered.filter((n) => !hiddenSet.has(n));
  const hiddenList = ordered.filter((n) => hiddenSet.has(n));
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [draftField, setDraftField] = useState("");
  const isBound = Boolean(dataModelTable);

  const toggle = (fieldId) => {
    onChange({ ...widget.config, fieldSettings: toggleColumnHidden(viewWidget, fieldId) });
  };
  const removeColumn = (fieldId) => {
    if (isBound) return;
    const fs = widget.config?.fieldSettings || {};
    onChange({
      ...widget.config,
      columns: ordered.filter((n) => n !== fieldId),
      fieldSettings: {
        hidden: (fs.hidden || []).filter((n) => n !== fieldId),
        order: (fs.order || []).filter((n) => n !== fieldId)
      }
    });
  };
  const addColumn = () => {
    if (isBound) return;
    const name = draftField.trim();
    if (!name || ordered.includes(name)) return;
    onChange({ ...widget.config, columns: [...ordered, name] });
    setDraftField("");
  };

  return (
    <section className="workspace-widget-subpanel">
      <SubPanelHeader title="Fields" breadcrumb={widget.title} onBack={onBack} />
      {isBound && (
        <p className="workspace-panel-hint">
          Fields come from the bound object. Manage them on the <a href="/data-model" style={{ color: "#3f68ff" }}>Data Model page</a>.
        </p>
      )}

      <div className="wfp-field-list">
        {visible.length === 0 && <p className="workspace-panel-hint">No visible fields.</p>}
        {visible.map((name) => (
          <FieldRow key={name} name={name} hidden={false} onToggle={toggle} onRemove={removeColumn} canRemove={!isBound} />
        ))}

        {hiddenList.length > 0 && (
          <button
            type="button"
            className="wfp-hidden-toggle"
            onClick={() => setHiddenOpen((v) => !v)}
            aria-expanded={hiddenOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            <span>Hidden Fields</span>
            <span className="wfp-hidden-count">{hiddenList.length}</span>
            <ChevronDown size={13} className={hiddenOpen ? "wfp-chevron open" : "wfp-chevron"} />
          </button>
        )}

        {hiddenOpen && hiddenList.map((name) => (
          <FieldRow key={name} name={name} hidden={true} onToggle={toggle} onRemove={removeColumn} canRemove={!isBound} />
        ))}
      </div>

      {!isBound && (
        <div className="wfp-add-field">
          <input
            placeholder="Add field…"
            value={draftField}
            aria-label="New field name"
            onChange={(e) => setDraftField(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColumn(); } }}
          />
          <button type="button" onClick={addColumn} disabled={!draftField.trim()}>Add</button>
        </div>
      )}
    </section>
  );
}

function SortSubPanel({ widget, dataModelTable, onChange, onBack }) {
  const viewWidget = dataModelTable ? resolveViewWidget(widget, [dataModelTable]) : widget;
  const sort = getSortClauses(widget);
  const columns = getColumnList(viewWidget);
  const updateSort = (next) => onChange({ ...widget.config, sort: next });
  const addClause = () => {
    const fieldId = columns[0] || "";
    if (!fieldId) return;
    updateSort([...sort, { fieldId, direction: DEFAULT_SORT_DIRECTION }]);
  };
  const updateClause = (index, patch) => {
    updateSort(sort.map((clause, idx) => idx === index ? { ...clause, ...patch } : clause));
  };
  const removeClause = (index) => updateSort(sort.filter((_, idx) => idx !== index));
  return <section className="workspace-widget-subpanel">
    <SubPanelHeader title="Sorts" breadcrumb={widget.title} onBack={onBack} />
    <p className="workspace-panel-label">Sorts</p>
    <div className="workspace-sort-list">
      {sort.length === 0 ? <p className="workspace-panel-hint">No sorts applied.</p> : null}
      {sort.map((clause, index) => <div key={index} className="workspace-sort-row">
        <select
          aria-label={`Sort ${index + 1} field`}
          value={clause.fieldId}
          onChange={(event) => updateClause(index, { fieldId: event.target.value })}
        >
          {!columns.includes(clause.fieldId) && clause.fieldId ? <option value={clause.fieldId}>{clause.fieldId}</option> : null}
          {columns.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select
          aria-label={`Sort ${index + 1} direction`}
          value={clause.direction || DEFAULT_SORT_DIRECTION}
          onChange={(event) => updateClause(index, { direction: event.target.value })}
        >
          {KNOWN_SORT_DIRECTIONS.map((dir) => <option key={dir} value={dir}>{dir === "asc" ? "Ascending" : "Descending"}</option>)}
        </select>
        <button type="button" aria-label={`Remove sort ${index + 1}`} onClick={() => removeClause(index)}>✕</button>
      </div>)}
    </div>
    <button type="button" className="workspace-add-clause" onClick={addClause} disabled={!columns.length}>
      + Add sort
    </button>
    <p className="workspace-panel-hint">
      Sort metadata persists with the widget. Live integrations are not queried from the browser.
    </p>
  </section>;
}

function TableViewConfig({ widget, dataModelTable, onChange, onSubPage }) {
  const viewWidget = dataModelTable ? resolveViewWidget(widget, [dataModelTable]) : widget;
  const columns = getVisibleColumns(viewWidget);
  const tableView = getTableViewSettings(widget);
  const activeType = getTableViewType(widget);
  const setTableView = (patch) => onChange(withTableViewSettings(widget.config, patch));
  const fieldOptions = columns.length ? columns : getColumnList(viewWidget);
  return (
    <div className="workspace-twenty-config workspace-table-view-config" role="group" aria-label="Table view widget settings">
      <p className="workspace-panel-label">Settings</p>
      <WidgetSettingsRow icon={Table2} label="Layout" value={summarizeTableView(widget)} disabled />
      <div className="workspace-chart-type-tabs workspace-table-view-tabs" role="tablist" aria-label="Table view type">
        {TABLE_VIEW_TYPES.map((type) => {
          const TypeIcon = TABLE_VIEW_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={activeType === type}
              className={activeType === type ? "active" : ""}
              onClick={() => setTableView({ type: activeType === type ? "" : type })}
              title={TABLE_VIEW_HELP[type]}
            >
              <IconGlyph icon={TypeIcon} size={17} />
              <em>{TABLE_VIEW_LABELS[type]}</em>
            </button>
          );
        })}
      </div>
      {activeType ? <p className="workspace-panel-hint">{TABLE_VIEW_HELP[activeType]}</p> : null}

      <WidgetSettingsRow icon={Box} label="Source" value={summarizeSource(widget)} onClick={() => onSubPage("source")} />
      <WidgetSettingsRow icon={List} label="Fields" value={summarizeFields(viewWidget)} onClick={() => onSubPage("fields")} />
      <WidgetSettingsRow icon={Filter} label="Filter" value={summarizeFilter(viewWidget)} onClick={() => onSubPage("filter")} />
      <WidgetSettingsRow icon={SlidersHorizontal} label="Sort" value={summarizeSort(viewWidget)} onClick={() => onSubPage("sort")} />

      {activeType ? (
        <>
          <p className="workspace-panel-label">View fields</p>
          <WidgetSelectRow icon={Type} label="Title">
            <FieldDropdown
              fields={fieldOptions}
              value={tableView.titleField || ""}
              onChange={(field) => setTableView({ titleField: field })}
              placeholder="Auto"
              disabled={!fieldOptions.length}
            />
          </WidgetSelectRow>
          {activeType === "board" ? (
            <WidgetSelectRow icon={Columns3} label="Status">
              <FieldDropdown
                fields={fieldOptions}
                value={tableView.statusField || ""}
                onChange={(field) => setTableView({ statusField: field })}
                placeholder="Auto"
                disabled={!fieldOptions.length}
              />
            </WidgetSelectRow>
          ) : null}
          {activeType === "gantt" || activeType === "timeline" ? (
            <>
              <WidgetSelectRow icon={Calendar} label="Start">
                <FieldDropdown
                  fields={fieldOptions}
                  value={tableView.startDateField || ""}
                  onChange={(field) => setTableView({ startDateField: field })}
                  placeholder="Auto"
                  disabled={!fieldOptions.length}
                />
              </WidgetSelectRow>
              <WidgetSelectRow icon={Calendar} label="End">
                <FieldDropdown
                  fields={fieldOptions}
                  value={tableView.endDateField || ""}
                  onChange={(field) => setTableView({ endDateField: field })}
                  placeholder="Auto"
                  disabled={!fieldOptions.length}
                />
              </WidgetSelectRow>
            </>
          ) : null}
          {activeType === "calendar" ? (
            <WidgetSelectRow icon={Calendar} label="Date">
              <FieldDropdown
                fields={fieldOptions}
                value={tableView.startDateField || ""}
                onChange={(field) => setTableView({ startDateField: field })}
                placeholder="Auto"
                disabled={!fieldOptions.length}
              />
            </WidgetSelectRow>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function FilterSubPanel({ widget, integrations, dataModelTable, adapterConfig, onRefreshAndSave, onChange, onBack }) {
  const viewWidget = dataModelTable ? resolveViewWidget(widget, [dataModelTable]) : widget;
  const binding = widget.config?.binding || {};
  const filter = getFilterConfig(widget);
  const [entities, setEntities] = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  // Resolver controls state (entity type, lookback, test, fetch)
  const [resolverMeta, setResolverMeta] = useState(null);
  const [entityType, setEntityType] = useState(binding.entityType || "");
  const [lookbackDays, setLookbackDays] = useState(binding.days || 30);
  const [testing, setTesting] = useState(false);
  const [testState, setTestState] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const fieldChoices = getFilterFieldChoices(viewWidget, entities);
  const columns = fieldChoices.map((field) => field.id);
  const setFilter = (next) => onChange({ ...widget.config, filter: next });
  const setOp = (op) => setFilter({ ...filter, op });
  const activeIntegration = useMemo(() => {
    if (binding.mode !== "integration" || !binding.integrationId) return null;
    const list = Array.isArray(integrations) ? integrations : [];
    return list.find((item) => item.id === binding.integrationId) || null;
  }, [binding.integrationId, binding.mode, integrations]);

  // Load resolver metadata when integration binding is present
  useEffect(() => {
    if (binding.mode !== "integration" || !binding.integrationId) { setResolverMeta(null); return; }
    fetch("/api/workspace/resolvers")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const meta = Array.isArray(data.resolvers)
          ? data.resolvers.find((r) => r.integrationId === binding.integrationId) || null
          : null;
        setResolverMeta(meta);
        if (!entityType && meta?.entityTypes?.length) setEntityType(meta.entityTypes[0]);
      })
      .catch(() => setResolverMeta(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding.integrationId, binding.mode]);

  async function runTest() {
    if (!binding.integrationId) return;
    setTesting(true); setTestState(null);
    try {
      const res = await fetch("/api/workspace/test-source", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId: binding.integrationId, binding: { ...binding, entityType: entityType || undefined, days: lookbackDays } })
      });
      setTestState(await res.json());
    } catch { setTestState({ ok: false, error: "Network error" }); }
    finally { setTesting(false); }
  }

  async function runFetch() {
    if (!binding.integrationId || !onRefreshAndSave) return;
    setRefreshing(true); setRefreshResult(null);
    try {
      await onRefreshAndSave({ ...binding, entityType: entityType || undefined, days: lookbackDays }, binding.objectId || binding.sourceId);
      setRefreshResult({ ok: true });
    } catch (err) { setRefreshResult({ ok: false, error: err.message || "Fetch failed" }); }
    finally { setRefreshing(false); }
  }

  const isResolverBacked = binding.mode === "integration" && resolverMeta !== null;

  useEffect(() => {
    if (!binding.integrationId || binding.mode !== "integration") {
      setEntities([]);
      return;
    }
    let cancelled = false;
    setEntitiesLoading(true);
    fetch(`/api/workspace/integration-entities?integrationId=${encodeURIComponent(binding.integrationId)}`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : { entities: [] })
      .then((data) => {
        if (!cancelled) {
          setEntities(Array.isArray(data.entities) ? data.entities : []);
          setEntitiesLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntities([]);
          setEntitiesLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [binding.integrationId, binding.mode]);

  const addClause = () => {
    const fieldId = binding.mode === "integration" && entities.length ? "id" : (columns[0] || "");
    if (!fieldId) return;
    setFilter({ ...filter, clauses: [...filter.clauses, { fieldId, operator: "eq", value: "" }] });
  };
  const updateField = (index, fieldId) => {
    setFilter({
      ...filter,
      clauses: filter.clauses.map((clause, idx) => idx === index ? { ...clause, fieldId, value: "" } : clause)
    });
  };
  const selectEntity = useCallback((entity) => {
    onChange(updateWidgetEntityBinding(widget, entity));
  }, [onChange, widget]);
  const updateClause = (index, patch) => {
    setFilter({ ...filter, clauses: filter.clauses.map((clause, idx) => idx === index ? { ...clause, ...patch } : clause) });
  };
  const removeClause = (index) => {
    setFilter({ ...filter, clauses: filter.clauses.filter((_, idx) => idx !== index) });
  };
	  return <section className="workspace-widget-subpanel">
	    <SubPanelHeader title="Filter" breadcrumb={widget.title} onBack={onBack} />
    <UniversalSourceInfoCard />
	    <div className="workspace-filter-source-state">
      <span>{summarizeSourceType(binding)}</span>
      <strong>{summarizeSource(widget)}</strong>
    </div>
    {binding.mode === "integration" && binding.integrationId ? <EntitySelector
      integration={activeIntegration}
      entities={entities}
      selectedEntityId={binding.entityId || null}
      selectedEntityLabel={binding.entityLabel || null}
      selectedEntityType={binding.entityType || null}
      onSelect={selectEntity}
      loading={entitiesLoading}
    /> : null}
    {isResolverBacked ? <div className="workspace-resolver-controls">
      {resolverMeta.entityTypes?.length > 0 ? <label className="workspace-panel-label">
        <span>Entity type</span>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
        >
          <option value="">— any —</option>
          {resolverMeta.entityTypes.map((et) => <option key={et} value={et}>{et}</option>)}
        </select>
      </label> : null}
      <label className="workspace-panel-label">
        <span>Lookback (days)</span>
        <div className="workspace-lookback-row">
          {[7, 30, 90].map((d) => <button
            key={d}
            type="button"
            className={`workspace-lookback-btn${lookbackDays === d ? " active" : ""}`}
            onClick={() => setLookbackDays(d)}
          >{d}d</button>)}
          <input
            type="number"
            min={1}
            max={365}
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value) || 30)}
          />
        </div>
      </label>
      <div className="workspace-resolver-actions">
        <button
          type="button"
          className="workspace-settings-row-btn"
          disabled={testing}
          onClick={runTest}
        >{testing ? "Testing…" : "Test connection"}</button>
        {onRefreshAndSave ? <button
          type="button"
          className="workspace-settings-row-btn"
          disabled={refreshing}
          onClick={runFetch}
        >{refreshing ? "Fetching…" : "Fetch & save data"}</button> : null}
      </div>
      {testState ? <div className={`workspace-resolver-result${testState.ok ? " ok" : " error"}`}>
        {testState.ok
          ? `Connected · ${testState.rowCount ?? testState.rows?.length ?? 0} rows`
          : `${testState.reason || "error"}: ${testState.error || "check resolver"}`}
      </div> : null}
      {refreshResult ? <div className={`workspace-resolver-result${refreshResult.ok ? " ok" : " error"}`}>
        {refreshResult.ok ? "Saved to data model" : refreshResult.error}
      </div> : null}
    </div> : null}
    {binding.sourceType === CUSTOM_API_SOURCE_TYPE ? <div className="workspace-filter-source-state">
      <span>Custom endpoint</span>
      <code>{binding.endpointRef || "No endpoint reference set"}</code>
    </div> : null}
    <div className="workspace-filter-op-toggle" role="radiogroup" aria-label="Filter conjunction">
      {KNOWN_FILTER_CONJUNCTIONS.map((op) => <button
        key={op}
        type="button"
        role="radio"
        aria-checked={filter.op === op}
        className={filter.op === op ? "active" : ""}
        onClick={() => setOp(op)}
      >{op.toUpperCase()}</button>)}
    </div>
    <div className="workspace-filter-list">
      {filter.clauses.length === 0 ? <p className="workspace-panel-hint">No filter clauses.</p> : null}
      {filter.clauses.map((clause, index) => {
        const valueless = clause.operator === "isEmpty" || clause.operator === "isNotEmpty";
        const valueChoices = binding.mode === "integration" ? getEntityValueChoices(entities, clause.fieldId) : [];
        return <div key={index} className="workspace-filter-clause">
          <select
            aria-label={`Filter ${index + 1} field`}
            value={clause.fieldId}
            onChange={(event) => updateField(index, event.target.value)}
          >
            {!columns.includes(clause.fieldId) && clause.fieldId ? <option value={clause.fieldId}>{clause.fieldId}</option> : null}
            {fieldChoices.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
          </select>
          <select
            aria-label={`Filter ${index + 1} operator`}
            value={clause.operator || DEFAULT_FILTER_OPERATOR}
            onChange={(event) => updateClause(index, { operator: event.target.value })}
          >
            {KNOWN_FILTER_OPERATORS.map((op) => <option key={op} value={op}>{FILTER_OPERATOR_LABELS[op] || op}</option>)}
          </select>
          {!valueless && binding.mode === "integration" && valueChoices.length ? <select
            aria-label={`Filter ${index + 1} value`}
            value={clause.value ?? ""}
            onChange={(event) => {
              const entity = findEntityByFieldValue(entities, clause.fieldId, event.target.value);
              updateClause(index, { value: event.target.value });
              if (entity && (clause.fieldId === "id" || clause.fieldId === "entityId")) {
                onChange(updateWidgetEntityBinding(widget, entity));
              }
            }}
          >
            <option value="">Select value</option>
            {valueChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select> : !valueless ? <input
            aria-label={`Filter ${index + 1} value`}
            value={clause.value ?? ""}
            placeholder="value"
            onChange={(event) => updateClause(index, { value: event.target.value })}
          /> : <span className="workspace-filter-clause-empty">—</span>}
          <button type="button" aria-label={`Remove filter ${index + 1}`} onClick={() => removeClause(index)}>✕</button>
        </div>;
      })}
    </div>
    <button type="button" className="workspace-add-clause" onClick={addClause} disabled={!columns.length}>
      + Add filter
    </button>
    <p className="workspace-panel-hint">
      Filter metadata persists with the widget. Live integration queries stay in the CLI / hosted layers.
    </p>
  </section>;
}

/**
 * ChartHydrationInspector — diagnostics overlay for chart value computation.
 *
 * Renders the same projection pipeline the renderer reads from (source rows
 * → filter → grouping → aggregation → values[]), so the user can audit why
 * `widget.config.values` looks the way it does. It is read-only with two
 * actions:
 *   - "Recompute values" re-runs `recomputeChartConfig` against the latest
 *     Data Model tables; useful after manual row edits.
 *   - "Save computed values" routes through the existing PATCH /api/workspace
 *     path; respects the read-only runtime adapter (Save is disabled with
 *     guidance instead of crashing).
 */
function ChartHydrationInspector({
  widget,
  dataModelTables,
  unsaved,
  saving,
  canSave,
  saveGuidance,
  onChange,
  onSave,
  onBack
}) {
  const binding = widget?.config?.binding;
  const table = useMemo(() => {
    if (binding?.sourceType !== DATA_MODEL_SOURCE_TYPE || !binding.objectId) return null;
    return (Array.isArray(dataModelTables) ? dataModelTables : [])
      .find((t) => t.objectId === binding.objectId) || null;
  }, [binding, dataModelTables]);
  const debug = useMemo(() => computeChartProjectionDebug({
    rows: Array.isArray(table?.rows) ? table.rows : [],
    xAxis: widget?.config?.xAxis,
    yAxis: widget?.config?.yAxis,
    filter: widget?.config?.filter,
    chartType: widget?.config?.chartType
  }), [table, widget?.config?.xAxis, widget?.config?.yAxis, widget?.config?.filter, widget?.config?.chartType]);

  const recompute = useCallback(() => {
    const { config: recomputed } = recomputeChartConfig(widget.config || {}, dataModelTables);
    onChange(recomputed);
  }, [widget.config, dataModelTables, onChange]);

  const dropReasonCounts = useMemo(() => {
    const counts = {};
    for (const entry of debug.droppedRows || []) {
      counts[entry.reason] = (counts[entry.reason] || 0) + 1;
    }
    return counts;
  }, [debug.droppedRows]);

  return (
    <section className="workspace-widget-subpanel workspace-chart-inspector">
      <SubPanelHeader title="Inspect computation" breadcrumb={widget?.title} onBack={onBack} />
      <div className="workspace-widget-actions workspace-chart-inspector-top-actions" role="group" aria-label="Chart inspector navigation">
        <button type="button" onClick={onBack}>Edit chart</button>
        <button type="button" onClick={recompute}><RefreshCw size={15} />Recompute values</button>
      </div>

      <p className="workspace-panel-label">Source</p>
      {table ? (
        <div className="workspace-settings-list">
          <div><span>Object</span><code>{table.label}</code></div>
          <div><span>Storage</span><code>{table.liveSource ? "Live-backed sidecar" : "Manual Data Model"}</code></div>
          <div><span>Rows available</span><code>{table.rows?.length || 0}</code></div>
          {table.liveSource?.fetchedAt ? <div><span>Last fetched</span><code>{table.liveSource.fetchedAt}</code></div> : null}
        </div>
      ) : (
        <p className="workspace-panel-hint">
          No source bound. Open <strong>Source</strong> to pick a Data Model object.
        </p>
      )}

      <p className="workspace-panel-label">Source preview</p>
      {debug.samples?.length ? (
        <details className="workspace-chart-inspector-preview">
          <summary>{debug.samples.length} sample row{debug.samples.length === 1 ? "" : "s"}</summary>
          <pre className="workspace-chart-inspector-sample">
{JSON.stringify(debug.samples, null, 2)}
          </pre>
        </details>
      ) : (
        <p className="workspace-panel-hint">No source rows.</p>
      )}

      <p className="workspace-panel-label">Filter</p>
      <div className="workspace-settings-list">
        <div><span>Before</span><code>{debug.rowCount}</code></div>
        <div><span>After</span><code>{debug.filteredCount ?? 0}</code></div>
        <div><span>Dropped by filter</span><code>{debug.droppedByFilter ?? 0}</code></div>
      </div>

      <p className="workspace-panel-label">Buckets</p>
      {debug.buckets?.length ? (
        <div className="workspace-settings-list">
          {debug.buckets.map((bucket, index) => (
            <div key={`${bucket.key || "_"}_${index}`}>
              <span>{bucket.key === "" ? "(all rows)" : String(bucket.key)}</span>
              <code>
                {bucket.rowCount} row{bucket.rowCount === 1 ? "" : "s"}
                {" · "}
                {bucket.numericCount} numeric
                {" · "}
                {bucket.value === null || bucket.value === undefined ? "—" : String(bucket.value)}
              </code>
            </div>
          ))}
        </div>
      ) : (
        <p className="workspace-panel-hint">No buckets — choose an X axis field or group by.</p>
      )}

      <p className="workspace-panel-label">Dropped rows</p>
      {Object.keys(dropReasonCounts).length ? (
        <div className="workspace-settings-list">
          {Object.entries(dropReasonCounts).map(([reason, count]) => (
            <div key={reason}><span>{reason}</span><code>{count}</code></div>
          ))}
        </div>
      ) : (
        <p className="workspace-panel-hint">No rows dropped.</p>
      )}

      <p className="workspace-panel-label">Final values</p>
      <pre className="workspace-chart-inspector-sample">
{JSON.stringify(debug.values, null, 2)}
      </pre>

      {debug.warnings?.length ? (
        <div className="workspace-settings-list" role="alert" aria-label="Computation warnings">
          {debug.warnings.map((warning, index) => (
            <div key={index}><span>Warning</span><code>{warning}</code></div>
          ))}
        </div>
      ) : null}

      <div className="workspace-widget-actions" role="group" aria-label="Inspector actions">
        <button type="button" onClick={recompute}><RefreshCw size={15} />Recompute values</button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || saving}
          title={!canSave ? saveGuidance || "Save is disabled in this runtime." : "Persist computed values to growthub.config.json"}
        >
          <Save size={15} />{saving ? "Saving…" : unsaved ? "Save computed values" : "Save"}
        </button>
      </div>
      {unsaved ? <p className="workspace-panel-hint">Unsaved computed values.</p> : null}
      {!canSave && saveGuidance ? <p className="workspace-panel-hint">{saveGuidance}</p> : null}
    </section>
  );
}

function ChartConfigPanel({ widget, branding, dataModelTables, unsaved, onChange, onSubPage }) {
  const chartType = getChartType(widget) === "line" ? DEFAULT_CHART_TYPE : getChartType(widget);
  const xAxis = getChartAxis(widget, "xAxis");
  const yAxis = getChartAxis(widget, "yAxis");
  const style = getChartStyle(widget);
  const activeColor = resolveChartColor(style, branding) || "#d9e4ff";

  // Every axis/filter/aggregation/chartType edit funnels through this writer
  // so `widget.config.values` is recomputed from the bound Data Model rows
  // before persistence. Unbound charts (no Data Model source) keep the
  // existing static `values` untouched — this is what preserves the legacy
  // chart-with-static-values path.
  const commitConfig = useCallback((nextConfig) => {
    const { config: computed } = recomputeChartConfig(nextConfig, dataModelTables);
    onChange(computed);
  }, [dataModelTables, onChange]);

  const setChartType = (type) => commitConfig({ ...widget.config, chartType: type });
  const setXAxis = (patch) => commitConfig({ ...widget.config, xAxis: { ...xAxis, ...patch } });
  const setYAxis = (patch) => commitConfig({ ...widget.config, yAxis: { ...yAxis, ...patch } });
  // Style is render-only — it doesn't change values, so skip recomputation.
  const setStyle = (patch) => onChange({ ...widget.config, style: { ...style, ...patch } });

  // Derive source fields from the bound data model object
  const boundTable = useMemo(() => {
    const binding = widget.config?.binding;
    if (binding?.sourceType !== DATA_MODEL_SOURCE_TYPE || !binding.objectId) return null;
    return (Array.isArray(dataModelTables) ? dataModelTables : [])
      .find((t) => t.objectId === binding.objectId || t.source === binding.source) || null;
  }, [widget.config?.binding, dataModelTables]);

  const sourceFields = boundTable?.columns || [];
  const hasSource = sourceFields.length > 0;

  // Compute the live preview status for the configured chart so the panel
  // can surface row counts, warnings, and last-fetched timestamps without
  // having to re-derive the projection elsewhere.
  const computeStatus = useMemo(() => {
    const { result } = recomputeChartConfig(widget.config || {}, dataModelTables);
    return result;
  }, [widget.config, dataModelTables]);

  const recomputeValues = useCallback(() => {
    commitConfig({ ...widget.config });
  }, [commitConfig, widget.config]);

  return <section className="workspace-chart-config workspace-twenty-config">
    <p className="workspace-panel-label">Settings</p>
    <WidgetSettingsRow icon={BarChart3} label="Layout" value={CHART_TYPE_LABELS[chartType]} disabled />
    <div className="workspace-chart-type-tabs" role="tablist" aria-label="Chart type">
      {VISIBLE_CHART_TYPES.map((type) => {
        const TypeIcon = CHART_TYPE_ICONS[type];
        return <button
          key={type}
          type="button"
          role="tab"
          aria-selected={chartType === type}
          className={chartType === type ? "active" : ""}
          onClick={() => setChartType(type)}
          title={CHART_TYPE_LABELS[type]}
        >
          <IconGlyph icon={TypeIcon} size={17} />
          <em>{CHART_TYPE_LABELS[type]}</em>
        </button>;
      })}
    </div>

    <WidgetSettingsRow icon={Box} label="Source" value={summarizeSource(widget) || "None"} onClick={() => onSubPage("source")} />
    <WidgetSettingsRow icon={Filter} label="Filter" value={summarizeFilter(widget)} onClick={() => onSubPage("filter")} />
    {boundTable ? (
      <WidgetSettingsRow
        icon={Activity}
        label="Values"
        value={
          <>
          {boundTable.rows?.length || 0} row{(boundTable.rows?.length || 0) === 1 ? "" : "s"}
          {" · "}
          {Array.isArray(widget.config?.values) ? widget.config.values.length : 0} value{(widget.config?.values?.length || 0) === 1 ? "" : "s"}
          {unsaved ? " · unsaved" : ""}
          {Array.isArray(computeStatus?.warnings) && computeStatus.warnings.length ? " · warning" : ""}
          </>
        }
        onClick={() => onSubPage("hydration")}
      />
    ) : null}

    <p className="workspace-panel-label">X axis</p>
    <WidgetSelectRow icon={Columns3} label="Data">
      <FieldDropdown
        fields={sourceFields}
        value={xAxis.field || ""}
        onChange={(field) => setXAxis({ field })}
        placeholder={hasSource ? "Select field…" : "Select source first"}
        disabled={!hasSource}
      />
    </WidgetSelectRow>
    <WidgetSelectRow icon={SlidersHorizontal} label="Sort">
      <select value={xAxis.sort || "position"} onChange={(event) => setXAxis({ sort: event.target.value })}>
        <option value="position">Position asc</option>
        <option value="asc">Value asc</option>
        <option value="desc">Value desc</option>
      </select>
    </WidgetSelectRow>
    <label className="workspace-twenty-toggle-row">
      <span>Omit zero values</span>
      <input type="checkbox" checked={Boolean(xAxis.omitZero)} onChange={(event) => setXAxis({ omitZero: event.target.checked })} />
    </label>

    <p className="workspace-panel-label">Y axis</p>
    <WidgetSelectRow icon={Hash} label="Data">
      <FieldDropdown
        fields={sourceFields}
        value={yAxis.field || ""}
        onChange={(field) => setYAxis({ field })}
        placeholder={hasSource ? "Select field…" : "Select source first"}
        disabled={!hasSource}
      />
    </WidgetSelectRow>
    <WidgetSelectRow icon={Layers} label="Group by">
      <FieldDropdown
        fields={sourceFields}
        value={yAxis.groupBy || ""}
        onChange={(field) => setYAxis({ groupBy: field })}
        placeholder="None"
        disabled={!hasSource}
      />
    </WidgetSelectRow>
    <WidgetSelectRow icon={Sigma} label="Operation">
      <select value={yAxis.operation || yAxis.aggregation || "sum"} onChange={(event) => setYAxis({ operation: event.target.value, aggregation: event.target.value })}>
        {KNOWN_AGGREGATIONS.map((agg) => <option key={agg} value={agg}>{AGGREGATION_LABELS[agg] || agg}</option>)}
      </select>
    </WidgetSelectRow>
    <div className="workspace-axis-range">
      <label>
        <span>Min range</span>
        <input value={yAxis.min ?? ""} placeholder="Min" onChange={(event) => setYAxis({ min: event.target.value })} />
      </label>
      <label>
        <span>Max range</span>
        <input value={yAxis.max ?? ""} placeholder="Max" onChange={(event) => setYAxis({ max: event.target.value })} />
      </label>
    </div>
    <p className="workspace-panel-label">Style</p>
    <WidgetSelectRow icon={Star} label="Colors">
      <select value={style.colors || "auto"} onChange={(event) => setStyle({ colors: event.target.value })}>
        <option value="auto">Auto</option>
        <option value="accent">Accent</option>
        <option value="brand-local">Local brand kit</option>
        <option value="brand-bridge">Bridge brand kit</option>
        <option value="manual">Manual</option>
      </select>
    </WidgetSelectRow>
    <div className="workspace-color-preview-row">
      <span>Active color</span>
      <em style={{ background: activeColor }} />
      <code>{activeColor}</code>
    </div>
    {style.colors === "manual" ? <div className="workspace-color-picker-row">
      <label>
        <span>Manual color</span>
        <input
          type="color"
          value={style.manualColor || "#38bdf8"}
          onChange={(event) => setStyle({ manualColor: event.target.value })}
        />
      </label>
      <input
        aria-label="Manual color hex"
        value={style.manualColor || "#38bdf8"}
        onChange={(event) => setStyle({ manualColor: event.target.value })}
      />
    </div> : null}
    <label>
      <span>Axis name</span>
      <input
        value={style.axisName || ""}
        placeholder="None"
        onChange={(event) => setStyle({ axisName: event.target.value })}
      />
    </label>
    <label className="workspace-twenty-toggle-row">
      <span>Data labels</span>
      <input
        type="checkbox"
        checked={Boolean(style.dataLabels)}
        onChange={(event) => setStyle({ dataLabels: event.target.checked })}
      />
    </label>
  </section>;
}

function CommandPalette({ commands, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const [highlight, setHighlight] = useState(0);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return commands;
    return commands.filter((command) => {
      const haystack = `${command.label} ${command.group || ""} ${(command.aliases || []).join(" ")}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [commands, query]);
  useEffect(() => {
    setHighlight((value) => Math.min(value, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((value) => Math.min(filtered.length - 1, value + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = filtered[highlight];
      if (command && !command.disabled) {
        command.run();
        onClose();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((command) => {
      const key = command.group || "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(command);
    });
    return Array.from(map.entries());
  }, [filtered]);
  return <div className="workspace-command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <div className="workspace-overlay-backdrop" onClick={onClose} aria-hidden="true" />
    <section className="workspace-command-palette-panel" onKeyDown={handleKeyDown}>
      <header className="workspace-command-palette-input">
        <span aria-hidden="true">⌘</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a command…"
          aria-label="Command palette search"
        />
        <kbd>esc</kbd>
      </header>
      <div className="workspace-command-palette-list" role="listbox">
        {filtered.length === 0 ? <p className="workspace-panel-hint">No matching commands.</p> : null}
        {groups.map(([group, items]) => <div key={group} className="workspace-command-palette-group">
          <p className="workspace-panel-label">{group}</p>
          {items.map((command) => {
            const globalIndex = filtered.indexOf(command);
            const isHighlighted = globalIndex === highlight;
            return <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={isHighlighted}
              className={`workspace-command-palette-item${isHighlighted ? " active" : ""}${command.disabled ? " disabled" : ""}`}
              disabled={command.disabled}
              onMouseEnter={() => setHighlight(globalIndex)}
              onClick={() => {
                if (command.disabled) return;
                command.run();
                onClose();
              }}
            >
              <span aria-hidden="true">{typeof command.icon === "string" ? command.icon : <IconGlyph icon={command.icon} size={15} />}</span>
              <span className="workspace-command-palette-label">{command.label}</span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>;
          })}
        </div>)}
      </div>
      <footer className="workspace-command-palette-footer">
        <span>↑ ↓ navigate</span>
        <span>↵ run</span>
        <span>esc close</span>
      </footer>
    </section>
  </div>;
}

function RichTextEditor({ value, onChange }) {
  const textareaRef = useRef(null);
  const insert = useCallback((prefix, suffix = "", placeholder = "text") => {
    const textarea = textareaRef.current;
    const current = value || "";
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const selected = current.slice(start, end) || placeholder;
    const next = `${current.slice(0, start)}${prefix}${selected}${suffix}${current.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + prefix.length + selected.length + suffix.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  }, [onChange, value]);
  return <div className="workspace-rich-text-editor">
    <div className="workspace-rich-text-toolbar" role="toolbar" aria-label="Rich text controls">
      <button type="button" aria-label="Heading" onClick={() => insert("## ", "", "Heading")}><Type size={14} /></button>
      <button type="button" aria-label="Bold" onClick={() => insert("**", "**")}><strong>B</strong></button>
      <button type="button" aria-label="Italic" onClick={() => insert("*", "*")}><Italic size={14} /></button>
      <button type="button" aria-label="Quote" onClick={() => insert("> ", "", "Quote")}><Quote size={14} /></button>
      <button type="button" aria-label="Bullet list" onClick={() => insert("- ", "", "List item")}><List size={14} /></button>
      <button type="button" aria-label="Link" onClick={() => insert("[", "](https://)", "Link")}><LinkIcon size={14} /></button>
    </div>
    <textarea
      ref={textareaRef}
      placeholder="Write text..."
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>;
}

function IframePreviewModal({ widget, onClose }) {
  const url = widget?.config?.url || "";
  const valid = isLikelyHttpUrl(url);
  return <div className="workspace-overlay" role="dialog" aria-modal="true" aria-label={`${widget?.title || "iFrame"} expanded preview`}>
    <div className="workspace-overlay-backdrop" onClick={onClose} aria-hidden="true" />
    <section className="workspace-iframe-modal">
      <header>
        <div>
          <p>iFrame preview</p>
          <h2>{widget?.title || "Untitled iFrame"}</h2>
        </div>
        <div>
          {valid ? <a href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open</a> : null}
          <button type="button" aria-label="Close iFrame preview" onClick={onClose}><X size={16} /></button>
        </div>
      </header>
      {valid ? <iframe title={widget?.title || "iFrame preview"} src={url} /> : <div className="workspace-iframe-invalid">Enter a valid http(s) URL to preview this iFrame.</div>}
    </section>
  </div>;
}

function TableTransformPreview({ widget, columns, rows }) {
  const type = getTableViewType(widget);
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!type) {
    return <div
      className="workspace-view-table"
      aria-label={`${widget.title} preview`}
      style={{ "--workspace-view-columns": columns.length }}
    >
      <div>{columns.map((column) => <span key={column}>{column}</span>)}</div>
      {safeRows.slice(0, 6).map((row, rowIndex) => <div key={rowIndex}>
        {columns.map((column) => <span key={column}>{row?.[column] || ""}</span>)}
      </div>)}
      {!columns.length && !safeRows.length ? <div className="workspace-view-empty">Select a source</div> : null}
      <footer>Calculate</footer>
    </div>;
  }
  const fields = resolveTableViewFields(widget);
  if (type === "board") {
    const groups = safeRows.slice(0, 8).reduce((acc, row) => {
      const status = getFieldValue(row, fields.statusField, "Open");
      if (!acc[status]) acc[status] = [];
      acc[status].push(row);
      return acc;
    }, {});
    return <div className="workspace-table-transform-preview is-board">
      {Object.entries(groups).slice(0, 3).map(([status, groupRows]) => <section key={status}>
        <strong>{status}</strong>
        {groupRows.slice(0, 3).map((row, index) => <span key={index}>{getFieldValue(row, fields.titleField, `Row ${index + 1}`)}</span>)}
      </section>)}
    </div>;
  }
  if (type === "calendar") {
    return <div className="workspace-table-transform-preview is-calendar">
      {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => <section key={day}>
        <strong>{day}</strong>
        {safeRows[index] ? <span>{getFieldValue(safeRows[index], fields.titleField, `Row ${index + 1}`)}</span> : null}
      </section>)}
    </div>;
  }
  return <div className={`workspace-table-transform-preview is-${type}`}>
    {safeRows.slice(0, 5).map((row, index) => <div key={index}>
      <span>{getFieldValue(row, fields.titleField, `Row ${index + 1}`)}</span>
      <i style={{ "--offset": `${(index % 4) * 14}%`, "--width": `${34 + (index % 3) * 12}%` }} />
      <em>{getFieldValue(row, fields.startDateField, getFieldValue(row, fields.endDateField, ""))}</em>
    </div>)}
  </div>;
}

function WidgetPreview({ widget, branding, selected, onSelect, onMoveStart, onRemove, onResizeStart, onExpandIframe }) {
  const fallbackColumns = widget.config?.columns?.length ? widget.config.columns : [];
  const visibleColumns = widget.kind === "view" ? getVisibleColumns(widget) : fallbackColumns;
  const viewColumns = visibleColumns.length ? visibleColumns : fallbackColumns;
  const viewRows = Array.isArray(widget.config?.rows) ? widget.config.rows : [];
  const chartValues = widget.config?.values?.length ? widget.config.values : defaultConfigFor("chart").values;
  const chartType = widget.kind === "chart" ? (getChartType(widget) === "line" ? DEFAULT_CHART_TYPE : getChartType(widget)) : null;
  const dataLabels = widget.kind === "chart" ? Boolean(widget.config?.style?.dataLabels) : false;
  const chartStyle = widget.kind === "chart" ? getChartStyle(widget) : {};
  const chartColor = resolveChartColor(chartStyle, branding);
  const selectedSourceObject = widget.config?.binding?.entityId ? {
    id: widget.config.binding.entityId,
    label: widget.config.binding.entityLabel || widget.config.binding.entityId
  } : null;
  return <article
    className={`workspace-widget-preview${selected ? " selected" : ""}`}
    onClick={onSelect}
    style={{
      gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
      gridRow: `${widget.position.y + 1} / span ${widget.position.h}`
    }}
  >
    <div className="workspace-widget-preview-title">
      <span
        aria-hidden="true"
        className="workspace-widget-drag-handle"
        onPointerDown={(event) => onMoveStart(event)}
      >::</span>
      <strong>{widget.title}</strong>
      {selectedSourceObject ? <span
        className="workspace-widget-source-chip"
        title={`${selectedSourceObject.label} · ${selectedSourceObject.id}`}
      >{selectedSourceObject.label}</span> : null}
      <button
        aria-label={`Remove ${widget.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        type="button"
      ><X size={13} /></button>
    </div>
    {widget.kind === "view" ? <TableTransformPreview widget={widget} columns={viewColumns} rows={viewRows} /> : null}
    {widget.kind === "iframe" ? <div className="workspace-iframe-preview">
      {isLikelyHttpUrl(widget.config?.url) ? <iframe title={`${widget.title} preview`} src={widget.config.url} /> : <span>Enter a valid http(s) URL</span>}
      <button type="button" onClick={(event) => {
        event.stopPropagation();
        onExpandIframe(widget);
      }}><Maximize2 size={14} /> Expand</button>
    </div> : null}
    {widget.kind === "rich-text" ? <div className="workspace-rich-text-preview" dangerouslySetInnerHTML={{ __html: richTextToHtml(widget.config?.text) }} /> : null}
    {widget.kind === "chart" ? <div className={`workspace-chart-preview kind-${chartType}`} data-data-labels={dataLabels ? "true" : "false"} style={chartColor ? { "--chart-accent": chartColor } : undefined}>
      {chartType === "sum" ? <strong className="workspace-chart-sum">{chartValues.reduce((acc, v) => acc + v, 0)}</strong> : null}
      {chartType === "gauge" ? <span className="workspace-chart-gauge" style={{ "--gauge-fill": `${Math.min(100, chartValues[chartValues.length - 1] || 0)}%` }} /> : null}
      {chartType === "pie" ? <span className="workspace-chart-pie" aria-hidden="true" /> : null}
      {chartType === "bar-horizontal" ? chartValues.map((height, index) => <span key={index} className="workspace-chart-bar-h" style={{ width: `${Math.max(5, Math.min(100, height))}%` }}>
        {dataLabels ? <em>{height}</em> : null}
      </span>) : null}
      {chartType === "bar-vertical" || !chartType ? chartValues.map((height, index) => <span key={index} style={{ height: `${Math.max(5, Math.min(100, height))}%` }}>
        {dataLabels ? <em>{height}</em> : null}
      </span>) : null}
    </div> : null}
    {selected ? ["nw", "ne", "sw", "se"].map((corner) => <button
      aria-label={`Resize ${widget.title} from ${corner} corner`}
      className={`workspace-resize-handle ${corner}`}
      key={corner}
      onPointerDown={(event) => onResizeStart(corner, event)}
      type="button"
    />) : null}
  </article>;
}

const DEFAULT_PERSISTENCE = {
  mode: "filesystem",
  adapter: "filesystem",
  canSave: true,
  saveLabel: "Save writes growthub.config.json on disk.",
  reason: "Local development",
  nextAction: null,
  guidance: null
};

function countCanvasWidgets(canvas) {
  if (!canvas) return 0;
  if (Array.isArray(canvas.tabs) && canvas.tabs.length) {
    return canvas.tabs.reduce((acc, tab) => acc + (Array.isArray(tab.widgets) ? tab.widgets.length : 0), 0);
  }
  return Array.isArray(canvas.widgets) ? canvas.widgets.length : 0;
}

function countCanvasTabs(canvas) {
  if (!canvas) return 0;
  if (Array.isArray(canvas.tabs) && canvas.tabs.length) return canvas.tabs.length;
  return 1;
}

function WorkspaceSettingsPanel({ config, persistence, adapterConfig, integrationAdapter, onClose }) {
  const branding = (config && config.branding) || {};
  const dashboards = Array.isArray(config?.dashboards) ? config.dashboards : [];
  const tabCount = countCanvasTabs(config?.canvas);
  const widgetCount = countCanvasWidgets(config?.canvas);
  const persist = persistence || DEFAULT_PERSISTENCE;
  return <div className="workspace-overlay" role="dialog" aria-modal="true" aria-label="Workspace settings">
    <div className="workspace-overlay-backdrop" onClick={onClose} aria-hidden="true" />
    <section className="workspace-overlay-panel">
      <header className="workspace-overlay-header">
        <div>
          <p>Workspace</p>
          <h2>Workspace Settings</h2>
        </div>
        <button type="button" aria-label="Close workspace settings" onClick={onClose} autoFocus>x</button>
      </header>
      <p className="workspace-overlay-note">
        Inspect-only. Sourced from <code>growthub.config.json</code> + <code>GET /api/workspace</code>.
        Edit branding by updating <code>growthub.config.json</code> inside your governed fork.
        The builder itself never holds tokens, never executes hosted workflows, and never bypasses the PATCH allowlist
        (<code>dashboards</code>, <code>widgetTypes</code>, <code>canvas</code>, <code>dataModel</code>).
      </p>
      <div className="workspace-readiness">
        <article className="workspace-readiness-section">
          <h3>Identity</h3>
          <div className="workspace-readiness-row"><span>Name</span><strong>{config?.name || "Workspace"}</strong></div>
          <div className="workspace-readiness-row"><span>Workspace ID</span><code>{config?.id || "Unknown"}</code></div>
          <div className="workspace-readiness-row"><span>Brand name</span><strong>{branding.name || "Unknown"}</strong></div>
          <div className="workspace-readiness-row"><span>Logo URL</span><code>{branding.logoUrl || "—"}</code></div>
          <div className="workspace-readiness-row"><span>Accent</span>
            <span className="workspace-readiness-badge" style={{ background: branding.accent || "#3f68ff" }}>{branding.accent || "—"}</span>
          </div>
        </article>
        <article className="workspace-readiness-section">
          <h3>Persistence</h3>
          <div className="workspace-readiness-row"><span>Mode</span>
            <span className={`workspace-readiness-badge mode-${persist.mode}`}>{persist.mode}</span>
          </div>
          <div className="workspace-readiness-row"><span>Adapter</span><code>{persist.adapter}</code></div>
          <div className="workspace-readiness-row"><span>Can save</span>
            <span className={`workspace-readiness-badge ${persist.canSave ? "good" : "warn"}`}>{persist.canSave ? "yes" : "no"}</span>
          </div>
          <div className="workspace-readiness-row"><span>Save behavior</span><strong>{persist.saveLabel}</strong></div>
          <div className="workspace-readiness-row"><span>Reason</span><em>{persist.reason}</em></div>
          {persist.guidance ? <div className="workspace-readiness-row"><span>Guidance</span><em>{persist.guidance}</em></div> : null}
          {persist.nextAction ? <div className="workspace-readiness-row"><span>Next action</span><em>{persist.nextAction}</em></div> : null}
        </article>
        <article className="workspace-readiness-section">
          <h3>Integrations</h3>
          <div className="workspace-readiness-row"><span>Integration adapter</span><code>{adapterConfig.integrationAdapter}</code></div>
          <div className="workspace-readiness-row"><span>Deploy target</span><code>{adapterConfig.deployTarget}</code></div>
          <div className="workspace-readiness-row"><span>Bridge</span>
            <span className={`workspace-readiness-badge ${adapterConfig.growthubBridge?.hasAccessToken ? "good" : ""}`}>
              {adapterConfig.growthubBridge?.hasAccessToken ? "token configured" : "no token"}
            </span>
          </div>
          <div className="workspace-readiness-row"><span>Bridge base URL</span><code>{adapterConfig.growthubBridge?.baseUrl || "—"}</code></div>
          <div className="workspace-readiness-row"><span>Authority</span><strong>{integrationAdapter.authority}</strong></div>
        </article>
        <article className="workspace-readiness-section">
          <h3>Counts</h3>
          <div className="workspace-readiness-row"><span>Dashboards</span><strong>{dashboards.length}</strong></div>
          <div className="workspace-readiness-row"><span>Tabs (active canvas)</span><strong>{tabCount}</strong></div>
          <div className="workspace-readiness-row"><span>Widgets (active canvas)</span><strong>{widgetCount}</strong></div>
          <div className="workspace-readiness-row"><span>Template format</span><code>growthub-workspace-template</code></div>
        </article>
      </div>
    </section>
  </div>;
}

/**
 * ResolverRow — per-resolver status row inside the Management panel.
 * Shows metadata, linked data model objects, and a quick test button.
 * Generic — renders purely from resolver-declared metadata.
 */
function ResolverRow({ resolver, linkedObjects }) {
  const [testState, setTestState] = useState(null);
  const [testing, setTesting] = useState(false);

  async function quickTest() {
    setTesting(true);
    setTestState(null);
    try {
      const res = await fetch("/api/workspace/test-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          integrationId: resolver.integrationId,
          binding: { integrationId: resolver.integrationId }
        }),
      });
      setTestState(await res.json());
    } catch {
      setTestState({ ok: false, reason: "network-error" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mgmt-resolver-row">
      <div className="mgmt-resolver-header">
        <code className="mgmt-resolver-id">{resolver.integrationId}</code>
        <div className="mgmt-resolver-badges">
          {resolver.entityTypes.map((et) => (
            <span key={et} className="mgmt-resolver-type-badge">{et}</span>
          ))}
          {resolver.hasListEntities && (
            <span className="mgmt-resolver-type-badge list">listEntities</span>
          )}
        </div>
        <button
          type="button"
          className="mgmt-resolver-test-btn"
          onClick={quickTest}
          disabled={testing}
        >
          {testing ? "…" : "Test"}
        </button>
      </div>
      {testState && (
        <div className={`mgmt-resolver-test-result ${testState.ok ? "ok" : "error"}`}>
          {testState.ok
            ? `✓ connected · ${testState.rowCount ?? testState.preview?.length ?? 0} records`
            : `✗ ${testState.reason === "no-token" ? "token required" : testState.reason || testState.error}`}
        </div>
      )}
      {linkedObjects.length > 0 && (
        <div className="mgmt-resolver-linked">
          <span className="mgmt-resolver-linked-label">Data Model objects:</span>
          {linkedObjects.map((obj) => (
            <span key={obj.id} className="mgmt-resolver-linked-obj">{obj.label || obj.id}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ResolverManagementSection({ canSave, config }) {
  const [resolverData, setResolverData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch("/api/workspace/resolvers")
      .then((r) => r.ok ? r.json() : { files: [], registeredIds: [], resolvers: [], canUpload: false })
      .then(setResolverData)
      .catch(() => setResolverData({ files: [], registeredIds: [], resolvers: [], canUpload: false }));
  }, [uploadResult]);

  const dataModelObjects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];

  const linkedObjectsByResolver = useMemo(() => {
    const map = {};
    dataModelObjects.forEach((obj) => {
      const intId = obj.binding?.integrationId;
      if (!intId) return;
      if (!map[intId]) map[intId] = [];
      map[intId].push(obj);
    });
    return map;
  }, [dataModelObjects]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/workspace/register-resolver", { method: "POST", body: form });
      const data = await res.json();
      setUploadResult(res.ok ? { ok: true, ...data } : { ok: false, ...data });
    } catch {
      setUploadResult({ ok: false, error: "Network error" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const resolvers = resolverData?.resolvers || [];

  return <article className="workspace-readiness-section">
    <h3>Source Resolvers</h3>
    <div className="workspace-readiness-row">
      <span>Files</span>
      <code>{resolverData ? resolverData.files.length : "…"}</code>
    </div>
    <div className="workspace-readiness-row">
      <span>Registered</span>
      <code>{resolverData ? resolvers.length : "…"}</code>
    </div>
    <div className="workspace-readiness-row">
      <span>Data Model objects</span>
      <code>{dataModelObjects.length}</code>
    </div>

    {/* Per-resolver rows */}
    {resolvers.length > 0 ? (
      <div className="mgmt-resolver-list">
        {resolvers.map((r) => (
          <ResolverRow
            key={r.integrationId}
            resolver={r}
            linkedObjects={linkedObjectsByResolver[r.integrationId] || []}
          />
        ))}
      </div>
    ) : resolverData && (
      <p className="workspace-panel-hint">
        No resolvers registered. Add a <code>.js</code> file to{" "}
        <code>lib/adapters/integrations/resolvers/</code> that calls{" "}
        <code>registerSourceResolver(&#123; integrationId, entityTypes, fetchRecords &#125;)</code>.
      </p>
    )}

    {/* Data model objects without a resolver */}
    {dataModelObjects.filter((o) => o.binding?.integrationId && !linkedObjectsByResolver[o.binding.integrationId]?.length).length > 0 && (
      <div className="workspace-readiness-row warn">
        <span>Unresolved objects</span>
        <em>
          {dataModelObjects
            .filter((o) => o.binding?.integrationId && !resolvers.find((r) => r.integrationId === o.binding.integrationId))
            .map((o) => o.label || o.id)
            .join(", ")}
          {" — resolver file missing"}
        </em>
      </div>
    )}

    {/* Upload */}
    {canSave ? <>
      <div className="workspace-readiness-row">
        <span>Upload resolver</span>
        <input ref={fileInputRef} type="file" accept=".js" style={{ display: "none" }} onChange={handleFileChange} />
        <button
          type="button"
          className="workspace-readiness-action"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload .js file"}
        </button>
      </div>
      {uploadResult && <div className={`workspace-readiness-row resolver-upload-result ${uploadResult.ok ? "good" : "error"}`}>
        <span>{uploadResult.ok ? "Saved" : "Error"}</span>
        <em>{uploadResult.ok ? uploadResult.path : uploadResult.error}</em>
      </div>}
      <p className="workspace-panel-hint">
        Upload a <code>.js</code> resolver file that calls <code>registerSourceResolver()</code>.
        The resolver file is the only place with provider-specific logic — the UI renders
        controls from the metadata it declares (<code>entityTypes</code>, <code>listEntities</code>).
      </p>
    </> : <div className="workspace-readiness-row">
      <span>Upload</span>
      <em>Requires <code>WORKSPACE_CONFIG_ALLOW_FS_WRITE=true</code> or add resolver files manually to <code>lib/adapters/integrations/resolvers/</code>.</em>
    </div>}
  </article>;
}

function WorkspaceManagementPanel({ config, persistence, adapterConfig, onClose }) {
  const persist = persistence || DEFAULT_PERSISTENCE;
  const pipelines = Array.isArray(config?.pipelines) ? config.pipelines : [];
  const integrations = Array.isArray(config?.integrations) ? config.integrations : [];
  const capabilities = Array.isArray(config?.capabilities) ? config.capabilities : [];
  return <div className="workspace-overlay" role="dialog" aria-modal="true" aria-label="Workspace management">
    <div className="workspace-overlay-backdrop" onClick={onClose} aria-hidden="true" />
    <section className="workspace-overlay-panel">
      <header className="workspace-overlay-header">
        <div>
          <p>Workspace</p>
          <h2>Management</h2>
        </div>
        <button type="button" aria-label="Close management panel" onClick={onClose} autoFocus>x</button>
      </header>
      <p className="workspace-overlay-note">
        Inspect-only. Workflow execution stays in <code>growthub workflow</code> / <code>growthub bridge</code>; this panel does not
        execute, does not call hosted endpoints, and does not expose tokens.
      </p>
      <div className="workspace-readiness">
        <article className="workspace-readiness-section">
          <h3>Workspace</h3>
          <div className="workspace-readiness-row"><span>ID</span><code>{config?.id || "Unknown"}</code></div>
          <div className="workspace-readiness-row"><span>Name</span><strong>{config?.name || "Workspace"}</strong></div>
          <div className="workspace-readiness-row"><span>Capabilities</span>
            <span>{capabilities.length ? capabilities.join(", ") : "none"}</span>
          </div>
        </article>
        <article className="workspace-readiness-section">
          <h3>API</h3>
          <div className="workspace-readiness-row"><span>PATCH allowlist</span><code>dashboards | widgetTypes | canvas | dataModel</code></div>
          <div className="workspace-readiness-row"><span>Unknown field</span><code>400</code></div>
          <div className="workspace-readiness-row"><span>Read-only runtime</span><code>409 + guidance</code></div>
          <div className="workspace-readiness-row"><span>Can save now</span>
            <span className={`workspace-readiness-badge ${persist.canSave ? "good" : "warn"}`}>{persist.canSave ? "yes" : "no"}</span>
          </div>
        </article>
        <article className="workspace-readiness-section">
          <h3>Workflows</h3>
          {pipelines.length === 0 ? <div className="workspace-readiness-row workspace-readiness-empty">
            <em>No workflows declared in growthub.config.json. Connect via <code>growthub workflow</code> after Bridge auth.</em>
          </div> : pipelines.map((pipeline, index) => <div className="workspace-readiness-row" key={pipeline.id || index}>
            <span>{pipeline.id || `pipeline-${index}`}</span><strong>{pipeline.name || "Untitled"}</strong>
          </div>)}
        </article>
        <article className="workspace-readiness-section">
          <h3>Integrations</h3>
          <div className="workspace-readiness-row"><span>Adapter</span><code>{adapterConfig.integrationAdapter}</code></div>
          <div className="workspace-readiness-row"><span>Deploy target</span><code>{adapterConfig.deployTarget}</code></div>
          {integrations.length === 0 ? <div className="workspace-readiness-row workspace-readiness-empty">
            <em>No static integrations declared. Use <code>growthub bridge agents bind</code> for hosted bindings.</em>
          </div> : integrations.map((integration, index) => <div className="workspace-readiness-row" key={integration.id || index}>
            <span>{integration.id || `integration-${index}`}</span><strong>{integration.name || "Untitled"}</strong>
          </div>)}
        </article>
        <article className="workspace-readiness-section">
          <h3>Persistence</h3>
          <div className="workspace-readiness-row"><span>Mode</span>
            <span className={`workspace-readiness-badge mode-${persist.mode}`}>{persist.mode}</span>
          </div>
          <div className="workspace-readiness-row"><span>Reason</span><em>{persist.reason}</em></div>
          {persist.guidance ? <div className="workspace-readiness-row"><span>Guidance</span><em>{persist.guidance}</em></div> : null}
        </article>
        <ResolverManagementSection canSave={persist.canSave} config={config} />
      </div>
    </section>
  </div>;
}

function WorkspaceBuilder({ initialConfig, initialSourceRecords, adapterConfig, integrationAdapter, integrationSettings, persistence }) {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState(() => {
    const dashboards = Array.isArray(initialConfig.dashboards) && initialConfig.dashboards.length
      ? initialConfig.dashboards.map((dashboard, index) =>
          normalizeDashboard(dashboard, index === 0 ? initialConfig.canvas : undefined)
        )
      : [createDashboardRecord("New Dashboard")];
    return {
      ...initialConfig,
      dashboards,
      canvas: dashboardCanvasFrom(dashboards[0], initialConfig.canvas)
    };
  });
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  const [editingDashboardId, setEditingDashboardId] = useState(null);
  const [editingDashboardDraft, setEditingDashboardDraft] = useState("");
  const [editingWorkflowId, setEditingWorkflowId] = useState(null);
  const [editingWorkflowDraft, setEditingWorkflowDraft] = useState("");
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingTabDraft, setEditingTabDraft] = useState("");
  const [workspaceView, setWorkspaceView] = useState("dashboards");
  const [activationPanelOpen, setActivationPanelOpen] = useState(false);
  const [builderListFilter, setBuilderListFilter] = useState({ type: "all", query: "" });
  const [builderActionMenuId, setBuilderActionMenuId] = useState(null);
  const [builderActionMenuPlacement, setBuilderActionMenuPlacement] = useState(null);
  const [dashboardDraftMode, setDashboardDraftMode] = useState(false);
  const [dashboardLiveSnapshot, setDashboardLiveSnapshot] = useState(null);
  const [activeDashboardId, setActiveDashboardId] = useState(() =>
    getActiveDashboardId(
      Array.isArray(initialConfig.dashboards) && initialConfig.dashboards.length ? initialConfig.dashboards : [],
      null
    )
  );
  const gridRef = useRef(null);
  const canvas = config.canvas;
  const dashboards = config.dashboards || [];
  const workflows = useMemo(() => listBuilderWorkflowItems(config), [config]);
  const sites = useMemo(() => listBuilderSiteItems(config), [config]);
  const builderItems = useMemo(() => {
    const dashboardItems = dashboards.map((dashboard, index) => ({
      type: "dashboard",
      id: dashboard.id,
      title: dashboard.name,
      itemKind: "Dashboard",
      updatedAt: formatBuilderTimestamp(dashboard.updatedAt || ""),
      status: dashboard.status || "draft",
      index,
      dashboard
    }));
    const workflowItems = workflows.map((workflow) => ({
      type: "workflow",
      id: workflow.id || `${workflow.objectId}:${workflow.rowId}`,
      title: workflow.label,
      itemKind: "Workflow",
      updatedAt: formatBuilderTimestamp(workflow.updatedAt) || `v${workflow.version || "0"}`,
      status: workflow.lifecycleStatus || "draft",
      workflow
    }));
    const siteItems = sites.map((site) => ({
      ...site,
      updatedAt: site.updatedAt || "new"
    }));
    const q = builderListFilter.query.trim().toLowerCase();
    return [...dashboardItems, ...siteItems, ...workflowItems].filter((item) => {
      if (builderListFilter.type !== "all" && item.type !== builderListFilter.type) return false;
      if (!q) return true;
      return [item.title, item.itemKind, item.status, item.type, item.site?.client, item.site?.app, item.site?.url].some((part) => String(part || "").toLowerCase().includes(q));
    });
  }, [builderListFilter, dashboards, sites, workflows]);
  const resolvedActiveDashboardId = getActiveDashboardId(dashboards, activeDashboardId);
  const resolvedActiveDashboardIndex = activeDashboardIndex(dashboards, resolvedActiveDashboardId);
  const widgetTypes = config.widgetTypes;
  const tabs = getTabs(canvas);
  const activeTabId = getActiveTabId(canvas);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
  const activeWidgets = activeTab.widgets || [];
  const activeDashboard = dashboards[resolvedActiveDashboardIndex] || dashboards[0] || null;
  const dashboardHasSavedDraft = Boolean(activeDashboard?.dashboardDraftStatus && Array.isArray(activeDashboard?.dashboardDraftTabs));
  const dashboardDirty = dashboardDraftMode && dashboardLiveSnapshot
    ? JSON.stringify(activeDashboard?.tabs || []) !== JSON.stringify(dashboardLiveSnapshot.tabs || [])
      || String(activeDashboard?.name || "") !== String(dashboardLiveSnapshot.name || "")
    : false;
  const dashboardModeLabel = dashboardDraftMode || dashboardHasSavedDraft ? "draft" : "live";
  const [selectedPosition, setSelectedPosition] = useState(() => findFreePosition(activeWidgets));
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const [pendingSelectedWidgetId, setPendingSelectedWidgetId] = useState(null);
  const [dragStartCell, setDragStartCell] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [resizeDrag, setResizeDrag] = useState(null);
  const [moveDrag, setMoveDrag] = useState(null);
  const [configMessage, setConfigMessage] = useState("");
  const [inspectorPath, setInspectorPath] = useState(SUB_PANEL_ROOT);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperIntent, setHelperIntent] = useState("build_dashboard");
  const [helperInitialPrompt, setHelperInitialPrompt] = useState("");
  const [helperInitialThread, setHelperInitialThread] = useState(null);
  const [templateFilter, setTemplateFilter] = useState({ category: "all", tag: "all", query: "" });
  const [expandedIframeWidget, setExpandedIframeWidget] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  // Sidecar source records (`growthub.source-records.json`) hydrate live-backed
  // Data Model objects at runtime. They are NOT persisted into growthub.config.json
  // and NEVER flow through PATCH /api/workspace. Updates land here only after a
  // successful POST /api/workspace/refresh-sources cycle re-reads GET /api/workspace.
  const [workspaceSourceRecords, setWorkspaceSourceRecords] = useState(
    () => (initialSourceRecords && typeof initialSourceRecords === "object" && !Array.isArray(initialSourceRecords)
      ? initialSourceRecords
      : {})
  );
  const activationState = useMemo(() => deriveWorkspaceActivationState({
    workspaceConfig: config,
    workspaceSourceRecords,
  }), [config, workspaceSourceRecords]);
  // Safe runtime descriptor for the secondary readiness lenses — assembled from
  // the persistence/adapter props the builder already receives (no fetch, no
  // secrets; booleans only).
  const lensMetadataGraph = useMemo(() => ({
    runtime: {
      persistenceMode: persistence?.mode || "",
      persistenceAdapter: persistence?.mode === "database" ? (adapterConfig?.dataAdapter || null) : null,
      allowFsWrite: persistence?.mode === "filesystem" && persistence?.canSave === true,
      nangoConfigured: Boolean(adapterConfig?.nango?.hasSecretKey),
      deploy: { target: adapterConfig?.deployTarget || "" },
    },
  }), [persistence, adapterConfig]);
  const activationStarted = activationState.completedCount > 0;
  const activationComplete = Boolean(activationState.complete);
  const activationUiCache = useMemo(() => getWorkspaceUiCache(config), [config]);
  const activationButtonHidden = activationUiCache.finishSetupButtonHidden === true
    || String(activationUiCache.finishSetupButtonHidden || "") === "true";
  const showFinishSetupButton = workspaceView === "dashboards" && activationStarted && !activationButtonHidden;
  const showActivationPanel = workspaceView === "dashboards" && (
    !activationStarted || activationPanelOpen
  );
  const resizeDragRef = useRef(null);
  const moveDragRef = useRef(null);
  const importInputRef = useRef(null);
  const selectedWidgetLookupId = selectedWidgetId || pendingSelectedWidgetId;
  const addSlot = dragPreview || selectedPosition;
  const showAddWidgetSlot = dashboardDraftMode && !selectedWidgetLookupId && panelOpen && addSlot;
  const selectedWidget = activeWidgets.find((widget) => widget.id === selectedWidgetLookupId) || null;
  const availableIntegrations = useMemo(() => flattenIntegrationSettings(integrationSettings), [integrationSettings]);
  const dataModelTables = useMemo(
    () => listWorkspaceDataModelTables(config, { sourceRecords: workspaceSourceRecords }),
    [config, workspaceSourceRecords]
  );

  const dismissFinishSetupButton = useCallback(async () => {
    const nextConfig = setWorkspaceUiCacheFlag(config, "finishSetupButtonHidden", true);
    setActivationPanelOpen(false);
    setConfig(nextConfig);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: nextConfig.dataModel })
      });
      const payload = await response.json();
      if (!response.ok || !payload.workspaceConfig) throw new Error(payload.error || "Failed to save workspace preference");
      setConfig((prev) => ({ ...prev, dataModel: payload.workspaceConfig.dataModel }));
    } catch (error) {
      setConfigMessage(error.message || "Failed to save workspace preference");
    }
  }, [config]);
  const selectedResolvedWidget = selectedWidget ? resolveViewWidget(selectedWidget, dataModelTables) : null;
  const branding = config.branding || {};
  const occupiedCells = useMemo(() => {
    const cells = new Set();
    for (const widget of activeWidgets) {
      for (let dx = 0; dx < widget.position.w; dx += 1) {
        for (let dy = 0; dy < widget.position.h; dy += 1) {
          cells.add(`${widget.position.x + dx}:${widget.position.y + dy}`);
        }
      }
    }
    return cells;
  }, [activeWidgets]);

  /**
   * Collect refreshable source IDs from BOTH direct live bindings (a widget
   * binding with `sourceStorage === "workspace-source-records"`) AND
   * Data Model-bound widgets whose bound table resolves to a live-backed
   * sidecar source. The second path is what makes charts that point at a
   * live-backed Data Model object refreshable from the Chart panel — the
   * live-source metadata lives on the Data Model object, not on the widget
   * binding itself.
   *
   * This is runtime discovery only — config is never mutated.
   */
  const liveSourceIds = useMemo(() => {
    const ids = new Set();
    const addCandidates = (...candidates) => {
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          ids.add(candidate.trim());
        }
      }
    };
    for (const widget of activeWidgets) {
      const binding = widget?.config?.binding;
      if (!binding) continue;
      // Direct live binding (legacy path).
      if (binding.sourceStorage === "workspace-source-records") {
        addCandidates(binding.sourceId);
      }
      // Data Model-bound widgets (chart / view) whose bound table is itself
      // backed by a sidecar source.
      if (binding.sourceType === DATA_MODEL_SOURCE_TYPE && binding.objectId) {
        const table = (Array.isArray(dataModelTables) ? dataModelTables : [])
          .find((t) => t.objectId === binding.objectId);
        if (!table) continue;
        const tableBinding = table.binding || {};
        if (table.liveSource || tableBinding.sourceStorage === "workspace-source-records") {
          addCandidates(
            table.liveSource?.sourceRecordKey,
            table.objectId,
            tableBinding.sourceId
          );
        }
      }
    }
    return Array.from(ids);
  }, [activeWidgets, dataModelTables]);

  // Track which chart widgets have recomputed values that have not yet been
  // persisted. After a refresh, recomputed values live in local React state
  // only — until the user saves, the on-disk `growthub.config.json` still
  // holds the previous projection. The Chart panel shows an `Unsaved` chip
  // and a `Save computed values` action when this set is non-empty.
  const [unsavedChartIds, setUnsavedChartIds] = useState(() => new Set());

  const refreshSources = useCallback(async () => {
    if (refreshing || liveSourceIds.length === 0) return;
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const response = await fetch("/api/workspace/refresh-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceIds: liveSourceIds })
      });
      if (!response.ok) {
        setRefreshResult({ error: true });
        return;
      }
      const data = await response.json();
      const refreshedIds = new Set((data.refreshed || [])
        .map((entry) => String(entry?.sourceId || "").trim())
        .filter(Boolean));
      let nextSourceRecords = workspaceSourceRecords;
      try {
        // Re-read GET so the sidecar (`workspaceSourceRecords`) reflects
        // the new rows the resolver just persisted. This is what makes the
        // chart preview update without a page reload.
        const getResponse = await fetch("/api/workspace", { method: "GET" });
        if (getResponse.ok) {
          const getPayload = await getResponse.json();
          if (getPayload?.workspaceSourceRecords && typeof getPayload.workspaceSourceRecords === "object") {
            nextSourceRecords = getPayload.workspaceSourceRecords;
            setWorkspaceSourceRecords(nextSourceRecords);
          }
        }
      } catch {
        // Non-fatal: refresh result still reports counts; UI will use stale records.
      }
      // Recompute chart widgets bound to refreshed objects. We rebuild the
      // Data Model tables from the latest sidecar before recomputing so the
      // computation sees the freshly-fetched rows. Recomputed widgets are
      // marked as unsaved — persistence still requires the explicit Save
      // action so the user can audit the projection before committing it.
      const dirtyWidgetIds = new Set();
      if (refreshedIds.size > 0) {
        const nextTables = listWorkspaceDataModelTables(config, { sourceRecords: nextSourceRecords });
        const objectIdsForRefreshedSources = new Set();
        for (const sourceId of refreshedIds) {
          for (const table of nextTables) {
            if (!table.objectId) continue;
            const liveKey = table.liveSource?.sourceRecordKey;
            const tableBindingSourceId = table.binding?.sourceId;
            if (liveKey === sourceId || table.objectId === sourceId || tableBindingSourceId === sourceId) {
              objectIdsForRefreshedSources.add(table.objectId);
            }
          }
        }
        if (objectIdsForRefreshedSources.size > 0) {
          const recomputeWidgets = (widgets) => (widgets || []).map((widget) => {
            if (widget?.kind !== "chart") return widget;
            const objectId = widget.config?.binding?.objectId;
            if (!objectId || !objectIdsForRefreshedSources.has(objectId)) return widget;
            const { config: recomputed } = recomputeChartConfig(widget.config || {}, nextTables);
            const prevValues = Array.isArray(widget.config?.values) ? widget.config.values : [];
            const nextValues = Array.isArray(recomputed.values) ? recomputed.values : [];
            const changed = prevValues.length !== nextValues.length
              || prevValues.some((value, index) => value !== nextValues[index]);
            if (changed) dirtyWidgetIds.add(widget.id);
            return { ...widget, config: recomputed };
          });
          setConfig((prev) => {
            const nextDashboards = (prev.dashboards || []).map((dashboard) => ({
              ...dashboard,
              tabs: (dashboard.tabs || []).map((tab) => ({ ...tab, widgets: recomputeWidgets(tab.widgets) }))
            }));
            let nextCanvas = prev.canvas ? { ...prev.canvas } : {};
            if (Array.isArray(nextCanvas.widgets)) nextCanvas = { ...nextCanvas, widgets: recomputeWidgets(nextCanvas.widgets) };
            if (Array.isArray(nextCanvas.tabs)) nextCanvas = { ...nextCanvas, tabs: nextCanvas.tabs.map((tab) => ({ ...tab, widgets: recomputeWidgets(tab.widgets) })) };
            return { ...prev, dashboards: nextDashboards, canvas: nextCanvas };
          });
        }
      }
      if (dirtyWidgetIds.size > 0) {
        setUnsavedChartIds((prev) => {
          const next = new Set(prev);
          for (const id of dirtyWidgetIds) next.add(id);
          return next;
        });
      }
      setRefreshResult({
        refreshed: data.refreshed?.length || 0,
        skipped: data.skipped?.length || 0,
        recomputed: dirtyWidgetIds.size,
        unsaved: dirtyWidgetIds.size > 0
      });
    } catch {
      setRefreshResult({ error: true });
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, liveSourceIds, workspaceSourceRecords, config]);

  const addWidget = useCallback((kind) => {
    if (!dashboardDraftMode) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const existingWidgets = prevTabs.find((tab) => tab.id === prevActiveId)?.widgets || [];
      const position = clampPositionToFreeSpace(addSlot, existingWidgets);
      const widget = {
        id: generateId("widget"),
        kind,
        title: defaultTitleFor(kind),
        position,
        config: defaultConfigFor(kind)
      };
      const stableTabs = prevTabs.length === 1 && prevTabs[0].id === DEFAULT_TAB_ID
        ? [{ ...prevTabs[0], id: DEFAULT_TAB_ID }]
        : prevTabs;
      const nextTabs = stableTabs.map((tab) =>
        tab.id === prevActiveId ? { ...tab, widgets: [...(tab.widgets || []), widget] } : tab
      );
      setSelectedWidgetId(widget.id);
      setPendingSelectedWidgetId(widget.id);
      setInspectorPath(SUB_PANEL_ROOT);
      setPanelOpen(true);
      window.setTimeout(() => {
        setSelectedWidgetId(widget.id);
        setPendingSelectedWidgetId(widget.id);
        setInspectorPath(SUB_PANEL_ROOT);
        setPanelOpen(true);
      }, 0);
      setSelectedPosition(findFreePosition([...existingWidgets, widget]));
      setDragPreview(null);
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, addSlot, dashboardDraftMode]);

  const switchTab = useCallback((tabId) => {
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      if (prevTabs.length <= 1) return prev;
      if (!prevTabs.some((tab) => tab.id === tabId)) return prev;
      const nextTab = prevTabs.find((tab) => tab.id === tabId);
      setSelectedWidgetId(null);
      setPendingSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(nextTab?.widgets || []));
      setDragPreview(null);
      setPanelOpen(false);
      setEditingTabId(null);
      setEditingTabDraft("");
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, prevTabs, tabId));
    });
  }, [activeDashboardId]);

  const beginTabRename = useCallback((tab, event) => {
    if (!dashboardDraftMode || !tab) return;
    event?.stopPropagation?.();
    setEditingTabId(tab.id);
    setEditingTabDraft(tab.name || "Tab");
  }, [dashboardDraftMode]);

  const commitTabRename = useCallback((tabId) => {
    if (!dashboardDraftMode || !tabId) return;
    const nextName = editingTabDraft.trim() || "Tab";
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const activeId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => tab.id === tabId ? { ...tab, name: nextName } : tab);
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, activeId));
    });
    setEditingTabId(null);
    setEditingTabDraft("");
  }, [activeDashboardId, dashboardDraftMode, editingTabDraft]);

  const addTab = useCallback(() => {
    if (!dashboardDraftMode) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const stableFirst = prevTabs.length === 1 && prevTabs[0].id === DEFAULT_TAB_ID
        ? { ...prevTabs[0], id: generateId("tab") }
        : prevTabs[0];
      const remaining = prevTabs.length === 1 ? [] : prevTabs.slice(1);
      const allExisting = [stableFirst, ...remaining];
      const newTab = {
        id: generateId("tab"),
        name: `Tab ${allExisting.length + 1}`,
        widgets: []
      };
      const nextTabs = [...allExisting, newTab];
      setSelectedWidgetId(null);
      setSelectedPosition({ ...DEFAULT_POSITION });
      setDragPreview(null);
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, newTab.id));
    });
  }, [activeDashboardId, dashboardDraftMode]);

  const addDashboard = useCallback(() => {
    setConfig((prev) => {
      const synced = syncActiveDashboard(prev, activeDashboardId);
      const prevDashboards = synced.dashboards || [];
      const name = `Dashboard ${prevDashboards.length + 1}`;
      const dashboard = createDashboardRecord(name);
      setSelectedWidgetId(null);
      setSelectedPosition({ ...DEFAULT_POSITION });
      setDragPreview(null);
      setEditingDashboardId(dashboard.id);
      setEditingDashboardDraft(dashboard.name);
      setActiveDashboardId(dashboard.id);
      setWorkspaceView("builder");
      setConfigMessage(`Created ${name}`);
      return {
        ...synced,
        dashboards: [...prevDashboards, dashboard],
        canvas: dashboardCanvasFrom(dashboard, synced.canvas)
      };
    });
  }, [activeDashboardId]);

  const createWorkflow = useCallback(async () => {
    if (saving) return;
    const nowIso = new Date().toISOString();
    const existing = getWorkflowSandboxObject(config) || createWorkflowSandboxObject();
    const sandboxObjectId = String(existing.id || "").trim();
    const rows = Array.isArray(existing.rows) ? existing.rows : [];
    const base = slugifyWorkflowName(`workflow-${rows.length + 1}`);
    const existingIds = new Set(rows.map((row) => String(row?.Name || row?.name || row?.id || "").trim()));
    let rowId = base;
    let suffix = 2;
    while (existingIds.has(rowId)) {
      rowId = `${base}-${suffix}`;
      suffix += 1;
    }
    const sandboxRow = createBlankWorkflowSandboxRow(rowId, nowIso);
    const nextDataModel = {
      ...(config.dataModel || {}),
      objects: (() => {
        const objects = Array.isArray(config.dataModel?.objects) ? config.dataModel.objects : [];
        const hasSandboxObject = objects.some((object) => object?.id === sandboxObjectId);
        const hasSmokeRegistry = objects.some((object) => object?.id === "workflow-api-registry")
          || objects.some((object) =>
            object?.objectType === "api-registry"
            && (Array.isArray(object.rows) ? object.rows : []).some((row) => row?.integrationId === "growthub-workspace-smoke-api")
          );
        const nextSandboxObject = { ...existing, rows: [...rows, sandboxRow] };
        const nextObjects = hasSandboxObject
          ? objects.map((object) => object?.id === sandboxObjectId ? nextSandboxObject : object)
          : [...objects, nextSandboxObject];
        return hasSmokeRegistry ? nextObjects : [...nextObjects, createWorkflowApiRegistryObject()];
      })()
    };
    const finalDataModel = addWorkflowFolderShortcut(nextDataModel, {
      objectId: sandboxObjectId,
      rowId,
      label: rowId
    });
    setSaving(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: finalDataModel })
      });
      const payload = await response.json();
      if (!response.ok || !payload.workspaceConfig) {
        throw new Error(payload.error || "Failed to create workflow");
      }
      setConfig((prev) => ({ ...prev, dataModel: payload.workspaceConfig.dataModel }));
      setConfigMessage(`Created workflow ${rowId}`);
      window.open(`/workflows?object=${sandboxObjectId}&row=${encodeURIComponent(rowId)}&field=orchestrationConfig`, "_self");
    } catch (error) {
      setConfigMessage(error.message || "Failed to create workflow");
    } finally {
      setSaving(false);
    }
  }, [config, saving]);

  const createCodexSite = useCallback(async () => {
    if (saving) return;
    const objects = Array.isArray(config.dataModel?.objects) ? config.dataModel.objects : [];
    const hasCodexSitesObject = objects.some((object) => object?.id === CODEX_SITES_OBJECT_ID);
    if (hasCodexSitesObject) {
      window.open(`/data-model?object=${encodeURIComponent(CODEX_SITES_OBJECT_ID)}`, "_self");
      return;
    }
    const nextDataModel = ensureCodexSitesDataModel(config.dataModel, []);
    setSaving(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: nextDataModel })
      });
      const payload = await response.json();
      if (!response.ok || !payload.workspaceConfig) {
        throw new Error(payload.error || "Failed to create Codex Sites object");
      }
      setConfig((prev) => ({ ...prev, dataModel: payload.workspaceConfig.dataModel }));
      setBuilderListFilter({ type: "site", query: "" });
      setConfigMessage("Created Codex Sites object");
      window.open(`/data-model?object=${encodeURIComponent(CODEX_SITES_OBJECT_ID)}`, "_self");
    } catch (error) {
      setConfigMessage(error.message || "Failed to create Codex Sites object");
    } finally {
      setSaving(false);
    }
  }, [config, saving]);

  const manageSite = useCallback((site) => {
    const rowParam = site?.rowIndex !== undefined ? `&row=${encodeURIComponent(String(site.rowIndex))}` : "";
    window.open(`/data-model?object=${encodeURIComponent(CODEX_SITES_OBJECT_ID)}${rowParam}`, "_self");
  }, []);

  const openSite = useCallback((site) => {
    if (site?.url) {
      window.open(site.url, "_blank", "noopener,noreferrer");
      return;
    }
    manageSite(site);
  }, [manageSite]);

  const selectDashboard = useCallback((index) => {
    setConfig((prev) => {
      const synced = syncActiveDashboard(prev, activeDashboardId);
      const prevDashboards = synced.dashboards || [];
      const dashboard = prevDashboards[index];
      if (!dashboard) return prev;
      const normalized = normalizeDashboard(dashboard, index === 0 ? synced.canvas : undefined);
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(getTabs(dashboardCanvasFrom(normalized, prev.canvas))[0]?.widgets || []));
      setDragPreview(null);
      setPanelOpen(false);
      setEditingDashboardId(null);
      setEditingDashboardDraft("");
      setDashboardDraftMode(false);
      setDashboardLiveSnapshot(null);
      setActiveDashboardId(dashboard.id);
      setWorkspaceView("builder");
      setConfigMessage(`Viewing ${dashboard.name}`);
      return {
        ...synced,
        dashboards: prevDashboards.map((item) => item.id === dashboard.id ? normalized : item),
        canvas: dashboardCanvasFrom(normalized, synced.canvas)
      };
    });
  }, [activeDashboardId]);

  useEffect(() => {
    const dashboardParam = searchParams?.get("dashboard");
    if (!dashboardParam || dashboards.length === 0) return;
    const targetIndex = dashboards.findIndex((dashboard) => dashboard.id === dashboardParam);
    if (targetIndex < 0) return;
    if (dashboards[targetIndex]?.id === resolvedActiveDashboardId && workspaceView === "builder") return;
    selectDashboard(targetIndex);
  }, [dashboards, resolvedActiveDashboardId, searchParams, selectDashboard, workspaceView]);

  const openAddWidgetBuilder = useCallback(() => {
    const targetDashboard = activeDashboard || dashboards[0];
    if (!targetDashboard) return false;
    setConfig((prev) => {
      const synced = syncActiveDashboard(prev, activeDashboardId);
      const prevDashboards = synced.dashboards || [];
      const dashboard = prevDashboards.find((item) => item.id === targetDashboard.id) || prevDashboards[0];
      if (!dashboard) return prev;
      const normalized = normalizeDashboard(dashboard, dashboard.id === prevDashboards[0]?.id ? synced.canvas : undefined);
      const nextCanvas = dashboardCanvasFrom(normalized, synced.canvas);
      const nextActiveWidgets = getTabs(nextCanvas)[0]?.widgets || [];
      setSelectedWidgetId(null);
      setPendingSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(nextActiveWidgets));
      setDragPreview(null);
      setActiveDashboardId(normalized.id);
      setWorkspaceView("builder");
      setDashboardLiveSnapshot(cloneConfig(normalized));
      setDashboardDraftMode(true);
      setPanelOpen(true);
      setConfigMessage(`Editing draft for ${normalized.name}`);
      return {
        ...synced,
        dashboards: prevDashboards.map((item) => item.id === normalized.id ? normalized : item),
        canvas: nextCanvas
      };
    });
    return true;
  }, [activeDashboard, activeDashboardId, dashboards]);

  const enterDashboardTitleEdit = useCallback((dashboard) => {
    if (!dashboard) return;
    setEditingDashboardId(dashboard.id);
    setEditingDashboardDraft(dashboard.name);
    setWorkspaceView("dashboards");
  }, []);

  const updateDashboardStatus = useCallback((dashboardId, status) => {
    setConfig((prev) => ({
      ...prev,
      dashboards: (prev.dashboards || []).map((dashboard) =>
        dashboard.id === dashboardId ? { ...dashboard, status, updatedAt: "new" } : dashboard
      )
    }));
  }, []);

  const cloneDashboard = useCallback((index) => {
    setConfig((prev) => {
      const synced = syncActiveDashboard(prev, activeDashboardId);
      const prevDashboards = synced.dashboards || [];
      const sourceDashboard = prevDashboards[index];
      if (!sourceDashboard) return prev;
      const normalizedSource = normalizeDashboard(sourceDashboard, index === resolvedActiveDashboardIndex ? synced.canvas : undefined);
      const name = `${sourceDashboard.name} Copy`;
      const dashboard = {
        ...normalizedSource,
        id: generateId("dashboard"),
        name,
        updatedAt: "new",
        status: "draft",
        tabs: normalizedSource.tabs.map((tab) => cloneTabForDashboard(tab, tab.name || "Tab 1"))
      };
      dashboard.activeTabId = dashboard.tabs[0].id;
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(dashboard.tabs[0].widgets));
      setDragPreview(null);
      setEditingDashboardId(dashboard.id);
      setActiveDashboardId(dashboard.id);
      setWorkspaceView("builder");
      setConfigMessage(`Cloned ${sourceDashboard.name}`);
      return {
        ...synced,
        dashboards: [...prevDashboards, dashboard],
        canvas: dashboardCanvasFrom(dashboard, synced.canvas)
      };
    });
  }, [activeDashboardId, resolvedActiveDashboardIndex]);

  const deleteDashboard = useCallback((index) => {
    setConfig((prev) => {
      const synced = syncActiveDashboard(prev, activeDashboardId);
      const prevDashboards = synced.dashboards || [];
      if (!prevDashboards[index]) return prev;
      if (prevDashboards.length <= 1) {
        const dashboard = createDashboardRecord("New Dashboard");
        setSelectedWidgetId(null);
        setSelectedPosition({ ...DEFAULT_POSITION });
        setDragPreview(null);
        setEditingDashboardId(dashboard.id);
        setActiveDashboardId(dashboard.id);
        setConfigMessage("Reset dashboard");
        return {
          ...synced,
          dashboards: [dashboard],
          canvas: dashboardCanvasFrom(dashboard, synced.canvas)
        };
      }
      const removed = prevDashboards[index];
      const nextDashboards = prevDashboards.filter((_, dashboardIndex) => dashboardIndex !== index);
      const nextActiveIndex = Math.min(index, nextDashboards.length - 1);
      const nextActiveDashboard = normalizeDashboard(nextDashboards[nextActiveIndex], synced.canvas);
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(nextActiveDashboard.tabs[0]?.widgets || []));
      setDragPreview(null);
      setEditingDashboardId(nextActiveDashboard.id);
      setActiveDashboardId(nextActiveDashboard.id);
      setConfigMessage(`Deleted ${removed.name}`);
      return {
        ...synced,
        dashboards: nextDashboards.map((dashboard) => dashboard.id === nextActiveDashboard.id ? nextActiveDashboard : dashboard),
        canvas: dashboardCanvasFrom(nextActiveDashboard, synced.canvas)
      };
    });
  }, [activeDashboardId]);

  const duplicateDashboard = useCallback(() => {
    cloneDashboard(resolvedActiveDashboardIndex);
  }, [cloneDashboard, resolvedActiveDashboardIndex]);

  const duplicateTab = useCallback(() => {
    if (!dashboardDraftMode) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const source = prevTabs.find((tab) => tab.id === prevActiveId) || prevTabs[0];
      const stableFirst = prevTabs.length === 1 && prevTabs[0].id === DEFAULT_TAB_ID
        ? { ...prevTabs[0], id: generateId("tab") }
        : prevTabs[0];
      const stableTabs = prevTabs.length === 1 ? [stableFirst] : prevTabs;
      const cloned = {
        id: generateId("tab"),
        name: `${source.name} Copy`,
        widgets: (source.widgets || []).map((widget) => ({
          ...cloneConfig(widget),
          id: generateId("widget")
        }))
      };
      const nextTabs = [...stableTabs, cloned];
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(cloned.widgets));
      setDragPreview(null);
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, cloned.id));
    });
  }, [activeDashboardId, dashboardDraftMode]);

  const deleteTab = useCallback((tabId) => {
    if (!dashboardDraftMode) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const tab = prevTabs.find((item) => item.id === tabId);
      if (!tab) return prev;
      if (prevTabs.length <= 1) {
        const fallback = createEmptyTab(tab.name || "Tab 1");
        setSelectedWidgetId(null);
        setSelectedPosition({ ...DEFAULT_POSITION });
        setDragPreview(null);
        setConfigMessage(`Cleared ${tab.name}`);
        return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, [fallback], fallback.id));
      }
      const nextTabs = prevTabs.filter((item) => item.id !== tabId);
      const activeIndex = prevTabs.findIndex((item) => item.id === tabId);
      const nextActiveTab = nextTabs[Math.min(activeIndex, nextTabs.length - 1)] || nextTabs[0];
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(nextActiveTab.widgets || []));
      setDragPreview(null);
      setConfigMessage(`Deleted ${tab.name}`);
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, nextActiveTab.id));
    });
  }, [activeDashboardId, dashboardDraftMode]);

  const applyTemplateToCurrentTab = useCallback((templateId) => {
    if (!dashboardDraftMode) return;
    const template = DASHBOARD_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const clonedTab = cloneTemplateToTab(template, { tabName: template.name, idFactory: generateId });
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const dashboardIndex = activeDashboardIndex(prev.dashboards || [], activeDashboardId);
      const stableTabs = prevTabs.length === 1 && prevTabs[0].id === DEFAULT_TAB_ID
        ? [{ ...prevTabs[0], id: DEFAULT_TAB_ID }]
        : prevTabs;
      const nextTabs = stableTabs.map((tab) =>
        tab.id === prevActiveId ? { ...tab, name: clonedTab.name, widgets: clonedTab.widgets } : tab
      );
      const nextCanvas = commitTabs(prev.canvas, nextTabs, prevActiveId);
      const nextDashboards = (prev.dashboards || []).map((dashboard, index) =>
        index === dashboardIndex
          ? updateDashboardCanvas({ ...dashboard, updatedAt: "new", status: "draft" }, nextCanvas)
          : dashboard
      );
      return {
        ...prev,
        dashboards: nextDashboards,
        canvas: nextCanvas
      };
    });
    setSelectedWidgetId(null);
    setSelectedPosition(findFreePosition(clonedTab.widgets));
    setDragPreview(null);
    setConfigMessage(`Applied ${template.name} to current tab`);
    setTemplateGalleryOpen(false);
    setPreviewTemplateId(null);
  }, [activeDashboardId, dashboardDraftMode]);

  const cloneTemplateAsDashboard = useCallback((templateId) => {
    const template = DASHBOARD_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const cloned = cloneTemplateToDashboard(template, { idFactory: generateId });
    setConfig((prev) => {
      const synced = syncActiveDashboard(prev, activeDashboardId);
      const dashboard = {
        ...cloned.dashboard,
        tabs: [cloned.tab],
        activeTabId: cloned.tab.id
      };
      setActiveDashboardId(dashboard.id);
      return {
        ...synced,
        dashboards: [...(synced.dashboards || []), dashboard],
        canvas: dashboardCanvasFrom(dashboard, synced.canvas)
      };
    });
    setSelectedWidgetId(null);
    setSelectedPosition(findFreePosition(cloned.tab.widgets));
    setDragPreview(null);
    setConfigMessage(`Cloned ${template.name} as dashboard`);
    setTemplateGalleryOpen(false);
    setPreviewTemplateId(null);
  }, [activeDashboardId]);

  const exportConfig = useCallback(() => {
    const syncedConfig = syncActiveDashboard(config, activeDashboardId);
    const primaryDashboard = syncedConfig.dashboards?.[0] || {};
    const wrapped = wrapWorkspaceTemplateExport(
      {
        dashboards: syncedConfig.dashboards,
        widgetTypes: syncedConfig.widgetTypes,
        canvas: syncedConfig.canvas
      },
      {
        name: primaryDashboard.name || syncedConfig.name || "Workspace template",
        description: syncedConfig.description || ""
      }
    );
    const blob = new Blob([`${JSON.stringify(wrapped, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "growthub-dashboard.template.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setConfigMessage("Exported workspace template");
  }, [activeDashboardId, config]);

  const importConfig = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const payload = unwrapWorkspaceTemplateImport(parsed);
      validateWorkspaceConfig(payload);
      const importedDashboards = (payload.dashboards || []).map((dashboard, index) =>
        normalizeDashboard(dashboard, index === 0 ? payload.canvas : undefined)
      );
      const importedActiveDashboard = importedDashboards[0];
      setConfig((prev) => ({
        ...prev,
        dashboards: importedDashboards,
        widgetTypes: payload.widgetTypes,
        canvas: importedActiveDashboard ? dashboardCanvasFrom(importedActiveDashboard, payload.canvas) : payload.canvas
      }));
      setActiveDashboardId(importedActiveDashboard?.id || null);
      const importedTabs = getTabs(importedActiveDashboard ? dashboardCanvasFrom(importedActiveDashboard, payload.canvas) : payload.canvas);
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(importedTabs[0]?.widgets || []));
      setDragPreview(null);
      setConfigMessage(`Imported ${file.name}`);
    } catch (error) {
      setConfigMessage(error.message || "Import failed");
    } finally {
      event.target.value = "";
    }
  }, []);

  const persistWorkspaceConfig = useCallback(async (nextConfig, nextActiveDashboardId = activeDashboardId) => {
    if (saving) return;
    setSaving(true);
    try {
      const stamp = todayIsoDate();
      const syncedConfig = syncActiveDashboard(nextConfig, nextActiveDashboardId);
      const updatedDashboards = (syncedConfig.dashboards || []).map((dashboard) =>
        dashboard.id === getActiveDashboardId(syncedConfig.dashboards || [], nextActiveDashboardId)
          ? { ...dashboard, updatedAt: stamp }
          : dashboard
      );
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dashboards: updatedDashboards,
          widgetTypes: syncedConfig.widgetTypes,
          canvas: syncedConfig.canvas
        })
      });
      const payload = await response.json();
      if (response.ok && payload.workspaceConfig) {
        const savedDashboards = (payload.workspaceConfig.dashboards || []).map((dashboard, index) =>
          normalizeDashboard(dashboard, index === 0 ? payload.workspaceConfig.canvas : undefined)
        );
        const savedActiveDashboard = savedDashboards.find((dashboard) => dashboard.id === nextActiveDashboardId) || savedDashboards[0];
        setConfig({
          ...payload.workspaceConfig,
          dashboards: savedDashboards,
          canvas: savedActiveDashboard ? dashboardCanvasFrom(savedActiveDashboard, payload.workspaceConfig.canvas) : payload.workspaceConfig.canvas
        });
        // Saved values are now on disk — clear the unsaved-chart tracking
        // so the Chart panel stops showing the `Unsaved` chip / CTA.
        setUnsavedChartIds(new Set());
      } else {
        setConfigMessage(payload.error || "Save failed");
      }
    } catch (error) {
      setConfigMessage(error.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [activeDashboardId, saving, config]);

  const save = useCallback(async () => {
    await persistWorkspaceConfig(config, activeDashboardId);
  }, [activeDashboardId, config, persistWorkspaceConfig]);

  const beginDashboardDraft = useCallback(() => {
    if (!activeDashboard) return;
    const snapshot = cloneConfig(activeDashboard);
    setDashboardLiveSnapshot(snapshot);
    setDashboardDraftMode(true);
    setPanelOpen(false);
    setConfigMessage(`Editing draft for ${activeDashboard.name}`);
    if (dashboardHasSavedDraft) {
      setConfig((prev) => {
        const nextDashboards = (prev.dashboards || []).map((dashboard) => {
          if (dashboard.id !== activeDashboard.id) return dashboard;
          return {
            ...dashboard,
            tabs: cloneConfig(dashboard.dashboardDraftTabs),
            activeTabId: dashboard.dashboardDraftActiveTabId || dashboard.activeTabId
          };
        });
        const nextActive = nextDashboards.find((dashboard) => dashboard.id === activeDashboard.id) || nextDashboards[0];
        return {
          ...prev,
          dashboards: nextDashboards,
          canvas: dashboardCanvasFrom(nextActive, prev.canvas)
        };
      });
    }
  }, [activeDashboard, dashboardHasSavedDraft]);

  const saveDashboardDraft = useCallback(async () => {
    if (!activeDashboard || saving) return;
    const now = new Date().toISOString();
    const synced = syncActiveDashboard(config, activeDashboardId);
    const nextDashboards = (synced.dashboards || []).map((dashboard) =>
      dashboard.id === activeDashboard.id
        ? {
            ...dashboard,
            dashboardDraftStatus: "draft",
            dashboardDraftUpdatedAt: now,
            dashboardDraftBaseVersion: String(dashboard.version || "1"),
            dashboardDraftTabs: cloneConfig(dashboard.tabs || []),
            dashboardDraftActiveTabId: dashboard.activeTabId || ""
          }
        : dashboard
    );
    await persistWorkspaceConfig({ ...synced, dashboards: nextDashboards }, activeDashboardId);
    setDashboardDraftMode(true);
    setDashboardLiveSnapshot(cloneConfig(nextDashboards.find((dashboard) => dashboard.id === activeDashboard.id) || activeDashboard));
    setConfigMessage("Saved dashboard draft. Publish to update the live dashboard.");
  }, [activeDashboard, activeDashboardId, config, persistWorkspaceConfig, saving]);

  const publishDashboard = useCallback(async () => {
    if (!activeDashboard || saving) return;
    const now = new Date().toISOString();
    const synced = syncActiveDashboard(config, activeDashboardId);
    const nextDashboards = (synced.dashboards || []).map((dashboard) => {
      if (dashboard.id !== activeDashboard.id) return dashboard;
      const {
        dashboardDraftTabs,
        dashboardDraftActiveTabId,
        dashboardDraftStatus,
        dashboardDraftUpdatedAt,
        dashboardDraftBaseVersion,
        ...rest
      } = dashboard;
      return {
        ...rest,
        tabs: cloneConfig(dashboard.tabs || []),
        activeTabId: dashboard.activeTabId,
        status: "active",
        version: String(Number(dashboard.version || "1") + 1),
        dashboardPublishedAt: now,
        updatedAt: now
      };
    });
    await persistWorkspaceConfig({ ...synced, dashboards: nextDashboards }, activeDashboardId);
    setDashboardDraftMode(false);
    setDashboardLiveSnapshot(null);
    setConfigMessage("Published dashboard.");
  }, [activeDashboard, activeDashboardId, config, persistWorkspaceConfig, saving]);

  const discardDashboardDraft = useCallback(() => {
    if (!activeDashboard) return;
    const snapshot = dashboardLiveSnapshot;
    setDashboardDraftMode(false);
    setDashboardLiveSnapshot(null);
    setPanelOpen(false);
    if (!snapshot) return;
    setConfig((prev) => {
      const nextDashboards = (prev.dashboards || []).map((dashboard) =>
        dashboard.id === activeDashboard.id ? snapshot : dashboard
      );
      return {
        ...prev,
        dashboards: nextDashboards,
        canvas: dashboardCanvasFrom(snapshot, prev.canvas)
      };
    });
    setConfigMessage("Discarded dashboard draft.");
  }, [activeDashboard, dashboardLiveSnapshot]);

  const confirmDashboardTitleEdit = useCallback(async (dashboardId) => {
    const nextConfig = renameDashboardInConfig(config, dashboardId, editingDashboardDraft, activeDashboardId);
    setEditingDashboardId(null);
    setEditingDashboardDraft("");
    setConfig(nextConfig);
    await persistWorkspaceConfig(nextConfig, activeDashboardId);
  }, [activeDashboardId, config, editingDashboardDraft, persistWorkspaceConfig]);

  const enterWorkflowTitleEdit = useCallback((workflow) => {
    if (!workflow) return;
    setEditingWorkflowId(workflow.id);
    setEditingWorkflowDraft(workflow.label || workflow.rowId || "Workflow");
    setWorkspaceView("dashboards");
  }, []);

  const confirmWorkflowTitleEdit = useCallback(async (workflow) => {
    if (!workflow) return;
    const nextLabel = editingWorkflowDraft.trim() || workflow.label || workflow.rowId || "Workflow";
    const nextConfig = updateWorkflowFolderItemInConfig(config, workflow, (item) => ({
      ...item,
      label: nextLabel,
      updatedAt: new Date().toISOString()
    }));
    setEditingWorkflowId(null);
    setEditingWorkflowDraft("");
    setConfig(nextConfig);
    await persistWorkspaceConfig(nextConfig, activeDashboardId);
  }, [activeDashboardId, config, editingWorkflowDraft, persistWorkspaceConfig]);

  const cancelWorkflowTitleEdit = useCallback((workflow) => {
    if (!workflow) return;
    if (editingWorkflowDraft.trim() !== String(workflow.label || workflow.rowId || "Workflow")) {
      const discard = window.confirm("Discard workflow title changes?");
      if (!discard) {
        requestAnimationFrame(() => {
          document.querySelector(`[data-workflow-title-input="${workflow.id}"]`)?.focus();
        });
        return;
      }
    }
    setEditingWorkflowId(null);
    setEditingWorkflowDraft("");
  }, [editingWorkflowDraft]);

  const closeBuilderActionMenu = useCallback(() => {
    setBuilderActionMenuId(null);
    setBuilderActionMenuPlacement(null);
  }, []);

  const openBuilderActionMenu = useCallback((item, event) => {
    const itemId = item?.id;
    if (!itemId) return;
    if (builderActionMenuId === itemId) {
      closeBuilderActionMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 148;
    const menuHeight = item?.type === "dashboard" ? 136 : item?.type === "site" ? 108 : 76;
    const margin = 8;
    const left = Math.min(
      Math.max(margin, rect.right - menuWidth),
      Math.max(margin, window.innerWidth - menuWidth - margin)
    );
    const preferredTop = rect.bottom + 6;
    const top = preferredTop + menuHeight > window.innerHeight - margin
      ? Math.max(margin, rect.top - menuHeight - 6)
      : preferredTop;
    setBuilderActionMenuId(itemId);
    setBuilderActionMenuPlacement({
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`
    });
  }, [builderActionMenuId, closeBuilderActionMenu]);

  useEffect(() => {
    if (!builderActionMenuId) return undefined;
    const close = () => closeBuilderActionMenu();
    const closeOnPointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.(".workspace-row-action-menu, .workspace-row-action-trigger")) return;
      closeBuilderActionMenu();
    };
    const closeOnKeyDown = (event) => {
      if (event.key === "Escape") closeBuilderActionMenu();
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [builderActionMenuId, closeBuilderActionMenu]);

  const cancelDashboardTitleEdit = useCallback((dashboard) => {
    if (!dashboard) return;
    if (editingDashboardDraft.trim() !== dashboard.name) {
      const discard = window.confirm("Discard dashboard title changes?");
      if (!discard) {
        requestAnimationFrame(() => {
          document.querySelector(`[data-dashboard-title-input="${dashboard.id}"]`)?.focus();
        });
        return;
      }
    }
    setEditingDashboardId(null);
    setEditingDashboardDraft("");
  }, [editingDashboardDraft]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSelectedWidgetId(null);
    setPendingSelectedWidgetId(null);
  }, []);
  const beginCellDrag = useCallback((index, event) => {
    if (!dashboardDraftMode) return;
    const x = index % GRID_COLUMNS;
    const y = Math.floor(index / GRID_COLUMNS);
    if (occupiedCells.has(`${x}:${y}`)) return;
    event.preventDefault();
    const position = normalizePosition(index, index);
    setSelectedWidgetId(null);
    setPendingSelectedWidgetId(null);
    setDragStartCell(index);
    setDragPreview(position);
    setPanelOpen(true);
  }, [dashboardDraftMode, occupiedCells]);
  const updateCellDrag = useCallback((index) => {
    if (dragStartCell === null) return;
    setDragPreview(normalizePosition(dragStartCell, index));
  }, [dragStartCell]);
  const finishCellDrag = useCallback((index) => {
    if (dragStartCell === null) return;
    const position = normalizePosition(dragStartCell, index);
    setSelectedPosition(clampPositionToFreeSpace(position, activeWidgets));
    setDragStartCell(null);
    setDragPreview(null);
    setPanelOpen(true);
  }, [activeWidgets, dragStartCell]);
  const updatePointerDrag = useCallback((event) => {
    if (dragStartCell === null) return;
    const index = cellIndexFromGridPointer(event, gridRef.current);
    if (index !== null) updateCellDrag(index);
  }, [dragStartCell, updateCellDrag]);
  const finishPointerDrag = useCallback((event) => {
    if (dragStartCell === null) return;
    const index = cellIndexFromGridPointer(event, gridRef.current);
    finishCellDrag(index ?? dragStartCell);
  }, [dragStartCell, finishCellDrag]);
  const beginResizeDrag = useCallback((widget, corner, event) => {
    if (!dashboardDraftMode) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const nextResizeDrag = { widgetId: widget.id, corner, originalPosition: widget.position };
    setSelectedWidgetId(widget.id);
    setPendingSelectedWidgetId(widget.id);
    resizeDragRef.current = nextResizeDrag;
    setResizeDrag(nextResizeDrag);
  }, [dashboardDraftMode]);
  const updateResizeDrag = useCallback((event) => {
    const activeResizeDrag = resizeDragRef.current;
    if (!activeResizeDrag) return;
    event.preventDefault();
    const index = cellIndexFromGridPointer(event, gridRef.current);
    if (index === null) return;
    const nextPosition = resizePositionFromCell(activeResizeDrag.originalPosition, activeResizeDrag.corner, index);
    const otherWidgets = activeWidgets.filter((widget) => widget.id !== activeResizeDrag.widgetId);
    if (otherWidgets.some((widget) => positionsOverlap(nextPosition, widget.position))) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return {
          ...tab,
          widgets: (tab.widgets || []).map((widget) =>
            widget.id === activeResizeDrag.widgetId ? { ...widget, position: nextPosition } : widget
          )
        };
      });
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, activeWidgets]);
  const finishResizeDrag = useCallback(() => {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    setResizeDrag(null);
  }, []);
  const beginMoveDrag = useCallback((widget, event) => {
    if (!dashboardDraftMode) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const pointerIndex = cellIndexFromGridPointer(event, gridRef.current);
    const pointerCell = pointerIndex === null ? { x: widget.position.x, y: widget.position.y } : cellPointFromIndex(pointerIndex);
    const nextMoveDrag = {
      widgetId: widget.id,
      offsetX: Math.max(0, Math.min(widget.position.w - 1, pointerCell.x - widget.position.x)),
      offsetY: Math.max(0, Math.min(widget.position.h - 1, pointerCell.y - widget.position.y))
    };
    setSelectedWidgetId(widget.id);
    setPendingSelectedWidgetId(widget.id);
    setPanelOpen(true);
    moveDragRef.current = nextMoveDrag;
    setMoveDrag(nextMoveDrag);
  }, [dashboardDraftMode]);
  const updateMoveDrag = useCallback((event) => {
    const activeMoveDrag = moveDragRef.current;
    if (!activeMoveDrag) return;
    event.preventDefault();
    const index = cellIndexFromGridPointer(event, gridRef.current);
    if (index === null) return;
    const point = cellPointFromIndex(index);
    const movingWidget = activeWidgets.find((widget) => widget.id === activeMoveDrag.widgetId);
    if (!movingWidget) return;
    const nextPosition = clampWidgetMovePosition({
      x: point.x - activeMoveDrag.offsetX,
      y: point.y - activeMoveDrag.offsetY
    }, movingWidget, activeWidgets);
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return {
          ...tab,
          widgets: (tab.widgets || []).map((widget) =>
            widget.id === activeMoveDrag.widgetId ? { ...widget, position: nextPosition } : widget
          )
        };
      });
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, activeWidgets]);
  const finishMoveDrag = useCallback(() => {
    if (!moveDragRef.current) return;
    moveDragRef.current = null;
    setMoveDrag(null);
  }, []);
  const selectWidget = useCallback((widgetId) => {
    if (!dashboardDraftMode) return;
    setSelectedWidgetId(widgetId);
    setPendingSelectedWidgetId(widgetId);
    setInspectorPath(SUB_PANEL_ROOT);
    setPanelOpen(true);
  }, [dashboardDraftMode]);
  // Fetches all records from a resolver and persists them into the data model object,
  // then syncs the updated dataModel into local React state.
  const handleRefreshDataModelObject = useCallback(async (binding, objectId) => {
    const integrationId = binding?.integrationId;
    if (!integrationId) throw new Error("No integrationId in binding");
    const res = await fetch("/api/workspace/refresh-source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId, binding, objectId: objectId || null }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || data.reason || "Refresh failed");
    // Sync updated dataModel into local state so the widget immediately reflects new rows
    if (data.dataModel) {
      setConfig((prev) => ({ ...prev, dataModel: data.dataModel }));
    }
    return data;
  }, []);

  const replaceSelectedWidgetConfig = useCallback((nextConfig) => {
    if (!dashboardDraftMode) return;
    if (!selectedWidgetLookupId) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return {
          ...tab,
          widgets: (tab.widgets || []).map((widget) =>
            widget.id === selectedWidgetLookupId ? { ...widget, config: nextConfig } : widget
          )
        };
      });
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, dashboardDraftMode, selectedWidgetLookupId]);
  const updateSelectedWidget = useCallback((updates) => {
    if (!dashboardDraftMode) return;
    if (!selectedWidgetLookupId) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return {
          ...tab,
          widgets: (tab.widgets || []).map((widget) =>
            widget.id === selectedWidgetLookupId ? { ...widget, ...updates } : widget
          )
        };
      });
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, dashboardDraftMode, selectedWidgetLookupId]);
  const updateSelectedWidgetConfig = useCallback((updates) => {
    if (!selectedWidget) return;
    updateSelectedWidget({ config: { ...(selectedWidget.config || {}), ...updates } });
  }, [selectedWidget, updateSelectedWidget]);
  const removeSelectedWidget = useCallback((widgetId) => {
    if (!dashboardDraftMode) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return { ...tab, widgets: (tab.widgets || []).filter((widget) => widget.id !== widgetId) };
      });
      const nextActiveWidgets = nextTabs.find((tab) => tab.id === prevActiveId)?.widgets || [];
      setSelectedWidgetId(null);
      setPendingSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(nextActiveWidgets));
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, dashboardDraftMode]);

  const duplicateSelectedWidget = useCallback(() => {
    if (!selectedWidget) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const tabWidgets = prevTabs.find((tab) => tab.id === prevActiveId)?.widgets || [];
      const position = clampPositionToFreeSpace(
        { ...selectedWidget.position, x: selectedWidget.position.x, y: selectedWidget.position.y },
        tabWidgets
      );
      const cloned = {
        ...cloneConfig(selectedWidget),
        id: generateId("widget"),
        title: `${selectedWidget.title} Copy`,
        position
      };
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return { ...tab, widgets: [...(tab.widgets || []), cloned] };
      });
      setSelectedWidgetId(cloned.id);
      setPendingSelectedWidgetId(cloned.id);
      setSelectedPosition(findFreePosition([...tabWidgets, cloned]));
      setConfigMessage(`Duplicated ${selectedWidget.title}`);
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, selectedWidget]);

  const closeTemplateGallery = useCallback(() => {
    setTemplateGalleryOpen(false);
    setPreviewTemplateId(null);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeManagement = useCallback(() => setManagementOpen(false), []);
  const resetWidgetSelection = useCallback(() => {
    setSelectedWidgetId(null);
    setPendingSelectedWidgetId(null);
    setPanelOpen(true);
  }, []);
  const showDashboardHome = useCallback(() => {
    setEditingDashboardId(null);
    setEditingDashboardDraft("");
    setBuilderActionMenuId(null);
    setWorkspaceView("dashboards");
  }, []);
  const resetWidgetSelectionOnOutsidePointer = useCallback((event) => {
    if (!selectedWidgetId) return;
    if (resizeDragRef.current || moveDragRef.current) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".workspace-widget-preview, .workspace-widget-panel, .workspace-overlay, .template-gallery")) return;
    resetWidgetSelection();
  }, [resetWidgetSelection, selectedWidgetId]);

  useEffect(() => {
    if (!templateGalleryOpen) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") closeTemplateGallery();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [templateGalleryOpen, closeTemplateGallery]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen, closeSettings]);

  useEffect(() => {
    if (!managementOpen) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") closeManagement();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [managementOpen, closeManagement]);

  useEffect(() => {
    const handler = (event) => {
      if (commandPaletteOpen) return;
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
      const meta = event.metaKey || event.ctrlKey;
      if (meta && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (event.key === "/" && !isEditable && !templateGalleryOpen && !settingsOpen && !managementOpen) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (!isEditable && workspaceView === "builder" && panelOpen && !commandPaletteOpen && !templateGalleryOpen && !settingsOpen && !managementOpen) {
        const quickMap = { c: "chart", v: "view", i: "iframe", t: "rich-text" };
        const kind = quickMap[event.key.toLowerCase()];
        if (kind) {
          event.preventDefault();
          addWidget(kind);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addWidget, commandPaletteOpen, managementOpen, panelOpen, settingsOpen, templateGalleryOpen, workspaceView]);

  useEffect(() => {
    const openFromRail = () => setCommandPaletteOpen(true);
    window.addEventListener("growthub:open-command-palette", openFromRail);
    return () => window.removeEventListener("growthub:open-command-palette", openFromRail);
  }, []);

  const builderStyle = workspaceView === "dashboards" || !panelOpen
    ? { gridTemplateColumns: COLLAPSED_GRID_COLUMNS }
    : undefined;

  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);

  const paletteCommands = useMemo(() => {
    const list = [];
    const openHelperWith = (i, p) => {
      setHelperIntent(i);
      setHelperInitialPrompt(p);
      setHelperInitialThread(null);
      setHelperOpen(true);
    };
    list.push({
      id: "helper.build_dashboard", group: "Ask helper", icon: Zap, label: "Ask helper — build a dashboard",
      run: () => openHelperWith("build_dashboard", "Draft a dashboard for a local agency: pipeline overview, weekly revenue, and a leaderboard widget.")
    });
    list.push({
      id: "helper.edit_view", group: "Ask helper", icon: Zap, label: "Ask helper — improve this dashboard",
      disabled: !activeDashboard,
      run: () => openHelperWith("edit_view", `Improve the "${activeDashboard?.name || "current"}" dashboard. Suggest widget placements that match the data already in the workspace.`)
    });
    list.push({
      id: "helper.create_widget", group: "Ask helper", icon: Zap, label: "Ask helper — suggest widgets",
      run: () => openHelperWith("create_widget", "Suggest widgets that fit the data already in this workspace.")
    });
    list.push({
      id: "helper.repair", group: "Ask helper", icon: Zap, label: "Ask helper — repair workspace",
      run: () => openHelperWith("repair", "Inspect this workspace for missing references, broken bindings, or incomplete views. Propose the smallest fix for each issue.")
    });
    list.push({
      id: "dashboard.new", group: "Dashboard", icon: Plus, label: "Create dashboard", shortcut: "N",
      run: () => addDashboard()
    });
    list.push({
      id: "dashboard.duplicate", group: "Dashboard", icon: Copy, label: "Duplicate dashboard",
      run: () => duplicateDashboard(),
      disabled: !activeDashboard
    });
    list.push({
      id: "dashboard.delete", group: "Dashboard", icon: Trash2, label: "Delete dashboard",
      disabled: !activeDashboard,
      run: () => {
        if (resolvedActiveDashboardIndex >= 0) deleteDashboard(resolvedActiveDashboardIndex);
      }
    });
    list.push({
      id: "dashboard.export", group: "Dashboard", icon: Download, label: "Export dashboard",
      run: () => exportConfig()
    });
    list.push({
      id: "dashboard.import", group: "Dashboard", icon: Import, label: "Import dashboards",
      run: () => importInputRef.current?.click()
    });
    list.push({
      id: "dashboard.templates", group: "Dashboard", icon: Grid2X2, label: "Open template gallery",
      run: () => setTemplateGalleryOpen(true)
    });
    list.push({
      id: "tab.new", group: "Tab", icon: Plus, label: "New tab",
      run: () => addTab()
    });
    list.push({
      id: "tab.duplicate", group: "Tab", icon: Copy, label: "Duplicate tab",
      run: () => duplicateTab()
    });
    [
      ["chart", "Add chart widget", "C"],
      ["view", "Add view widget", "V"],
      ["iframe", "Add iFrame widget", "I"],
      ["rich-text", "Add rich text widget", "T"]
    ].forEach(([kind, label, shortcut]) => {
      list.push({
        id: `widget.add.${kind}`,
        group: "Widget Add",
        icon: WIDGET_KIND_ICONS[kind],
        label,
        shortcut,
        disabled: workspaceView !== "builder",
        run: () => addWidget(kind)
      });
    });
    list.push({
      id: "widget.duplicate", group: "Widget", icon: Copy, label: "Duplicate selected widget",
      disabled: !selectedWidget,
      run: () => duplicateSelectedWidget()
    });
    list.push({
      id: "widget.remove", group: "Widget", icon: Trash2, label: "Remove selected widget",
      disabled: !selectedWidget,
      run: () => selectedWidget && removeSelectedWidget(selectedWidget.id)
    });
    list.push({
      id: "widget.source", group: "Widget", icon: Database, label: "Open widget source",
      disabled: !selectedWidget,
      run: () => {
        setPanelOpen(true);
        setInspectorPath("source");
      }
    });
    list.push({
      id: "widget.fields", group: "Widget", icon: Columns3, label: "Open widget fields",
      disabled: !(selectedWidget && selectedWidget.kind === "view"),
      run: () => {
        setPanelOpen(true);
        setInspectorPath("fields");
      }
    });
    list.push({
      id: "widget.sort", group: "Widget", icon: SlidersHorizontal, label: "Open widget sorts",
      disabled: !(selectedWidget && selectedWidget.kind === "view"),
      run: () => {
        setPanelOpen(true);
        setInspectorPath("sort");
      }
    });
    list.push({
      id: "widget.filter", group: "Widget", icon: Filter, label: "Open widget filter",
      disabled: !selectedWidget,
      run: () => {
        setPanelOpen(true);
        setInspectorPath("filter");
      }
    });
    list.push({
      id: "workspace.save", group: "Workspace", icon: Save, label: saving ? "Saving..." : "Save workspace",
      disabled: saving,
      shortcut: "S",
      run: () => save()
    });
    list.push({
      id: "workspace.settings", group: "Workspace", icon: Settings, label: "Go to Workspace Settings", shortcut: "G S",
      run: () => { window.location.href = "/settings/general"; }
    });
    list.push({
      id: "workspace.management", group: "Workspace", icon: Bolt, label: "Go to Management",
      run: () => setManagementOpen(true)
    });
    list.push({
      id: "workspace.builder", group: "Navigation", icon: Home, label: "Go to Builder",
      run: () => showDashboardHome()
    });
    list.push({
      id: "nav.data-model", group: "Navigation", icon: Database, label: "Go to Management (Data Model)",
      run: () => { window.location.href = "/data-model"; }
    });

    // Workspace Lens — fast navigation into the post-activation operating
    // surface and its filtered views. Unlocks once activation completes.
    const lensReady = Boolean(activationState?.complete);
    list.push({
      id: "lens.open", group: "Workspace Lens", icon: Eye,
      label: lensReady ? "Open Workspace Lens" : "Workspace Lens (finish setup to unlock)",
      disabled: !lensReady,
      run: () => { window.location.href = "/workspace-lens"; }
    });
    list.push({
      id: "lens.blocked", group: "Workspace Lens", icon: Eye, label: "Workspace Lens — Blocked",
      disabled: !lensReady,
      run: () => { window.location.href = "/workspace-lens?filter=blocked"; }
    });
    list.push({
      id: "lens.ready", group: "Workspace Lens", icon: Eye, label: "Workspace Lens — Ready",
      disabled: !lensReady,
      run: () => { window.location.href = "/workspace-lens?filter=ready"; }
    });
    list.push({
      id: "lens.assignable", group: "Workspace Lens", icon: Eye, label: "Workspace Lens — Agent-assignable",
      disabled: !lensReady,
      run: () => { window.location.href = "/workspace-lens?filter=assignable"; }
    });
    list.push({
      id: "lens.runs", group: "Workspace Lens", icon: Eye, label: "Workspace Lens — Runs",
      disabled: !lensReady,
      run: () => { window.location.href = "/workspace-lens?filter=runs"; }
    });

    return list;
  }, [
    activeDashboard,
    addWidget,
    addDashboard,
    addTab,
    deleteDashboard,
    duplicateDashboard,
    duplicateSelectedWidget,
    duplicateTab,
    exportConfig,
    removeSelectedWidget,
    resolvedActiveDashboardIndex,
    save,
    saving,
    selectedWidget,
    showDashboardHome,
    workspaceView,
    activationState
  ]);

  return <main className="workspace-builder" onPointerDownCapture={resetWidgetSelectionOnOutsidePointer} style={builderStyle}>
      <WorkspaceRail
        workspaceConfig={config}
        authority={integrationAdapter.authority}
        defaultCollapsed={workspaceView === "builder"}
        helperOpen={helperOpen}
        onOpenHelper={() => {
          if (helperOpen) { setHelperOpen(false); return; }
          // Rail pill ALWAYS lands on a fresh thread (chip stack +
          // empty composer). Reopen specific threads via the Chat tab.
          setHelperIntent("build_dashboard");
          setHelperInitialPrompt("");
          setHelperInitialThread(null);
          setHelperOpen(true);
        }}
        onOpenThread={(row) => {
          setHelperInitialThread(row);
          setHelperOpen(true);
        }}
        onConfigChange={(nextConfig) => {
          if (typeof setConfig === "function") setConfig(nextConfig);
        }}
        dashboardsSlot={(
          <button
            type="button"
            title="Builder"
            className={workspaceView === "dashboards" ? "active workspace-nav-button" : "workspace-nav-button"}
            onClick={showDashboardHome}
          >
            <Wrench size={15} aria-hidden="true" />
            <span className="workspace-nav-label">Builder</span>
          </button>
        )}
        managementSlot={(
          <button
            type="button"
            className="workspace-nav-button"
            onClick={() => setManagementOpen(true)}
          >
            Management
          </button>
        )}
      />

      <section className={`workspace-surface${workspaceView === "builder" ? ` dm-workflow-surface workspace-dashboard-surface${dashboardDraftMode ? " is-dashboard-editing" : ""}` : ""}`}>
        <header className={`workspace-toolbar${workspaceView === "builder" ? " dm-workflow-toolbar" : ""}`}>
          <div className={workspaceView === "builder" ? "dm-workflow-titlebar" : undefined}>
            {workspaceView === "builder" ? <>
              <button type="button" className="dm-workflow-breadcrumb-link" onClick={showDashboardHome}>Dashboards</button>
              <span className="dm-workflow-title-separator">/</span>
              <h1>{activeDashboard?.name || "Untitled"}</h1>
              <span className="dm-workflow-count">({activeWidgets.length}) · v{activeDashboard?.version || "1"} · {dashboardModeLabel}</span>
            </> : <>
              <p>Workspace home</p>
              <h1>Builder</h1>
            </>}
          </div>
          {workspaceView === "builder" ? <div className="dm-workflow-toolbar-actions">
            {dashboardDraftMode || dashboardHasSavedDraft ? <button type="button" className="dm-workflow-chip-btn" onClick={discardDashboardDraft} disabled={saving}>Discard Draft</button> : null}
            {dashboardDraftMode ? <button type="button" className="dm-workflow-chip-btn" onClick={saveDashboardDraft} disabled={saving || !dashboardDirty}><Save size={13} />{saving ? "Saving" : "Save draft"}</button> : null}
            {dashboardDraftMode || dashboardHasSavedDraft ? <button type="button" className="dm-workflow-chip-btn" onClick={publishDashboard} disabled={saving || (!dashboardDirty && !dashboardHasSavedDraft)}><Check size={13} />Publish</button> : null}
            {!dashboardDraftMode ? <button type="button" className="dm-workflow-chip-btn" onClick={beginDashboardDraft}><Pencil size={13} />Edit</button> : null}
            <button type="button" className="dm-workflow-chip-btn" onClick={() => setTemplateGalleryOpen(true)} disabled={!dashboardDraftMode}><Grid2X2 size={13} />Templates</button>
            <button type="button" className="dm-workflow-chip-btn" onClick={exportConfig}><Download size={13} />Export</button>
            <button type="button" className="dm-workflow-icon-btn" onClick={() => importInputRef.current?.click()} aria-label="Import"><Import size={14} /></button>
          </div> : <div className="workspace-toolbar-actions">
            {showFinishSetupButton ? (
              <span className={`workspace-finish-setup-control${activationComplete ? " is-complete" : ""}`}>
                <button
                  type="button"
                  className="workspace-finish-setup-trigger"
                  onClick={() => {
                    setWorkspaceView("dashboards");
                    setActivationPanelOpen((open) => !open);
                  }}
                >
                  {activationComplete ? null : <Hourglass size={15} />}
                  <span>{activationComplete ? "Setup Complete" : "Finish Workspace Setup"}</span>
                </button>
                {activationComplete ? (
                  <button
                    type="button"
                    className="workspace-finish-setup-dismiss"
                    aria-label="Hide completed workspace setup"
                    title="Hide completed workspace setup"
                    onClick={dismissFinishSetupButton}
                  >
                    <Check className="workspace-finish-setup-dismiss-check" size={15} aria-hidden="true" />
                    <X className="workspace-finish-setup-dismiss-x" size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            ) : null}
            <button type="button" onClick={addDashboard}><Plus size={15} />New Dashboard</button>
            <button type="button" onClick={createCodexSite} disabled={saving}><Rocket size={15} />New Codex Site</button>
            <button type="button" onClick={createWorkflow} disabled={saving}><GitBranch size={15} />New Workflow</button>
            <button type="button" onClick={() => importInputRef.current?.click()}><Import size={15} />Import</button>
          </div>}
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="workspace-hidden-input"
            onChange={importConfig}
          />
        </header>

        {workspaceView === "dashboards" ? <>
          {showActivationPanel ? <>
          <WorkspaceCreationReadinessPanel
            workspaceConfig={config}
            workspaceSourceRecords={workspaceSourceRecords}
            persistence={persistence}
          />
          <WorkspaceActivationPanel
            workspaceConfig={config}
            workspaceSourceRecords={workspaceSourceRecords}
            metadataGraph={lensMetadataGraph}
            showLenses={true}
            onStepAction={(step) => {
              if (step?.id === "add-widget") return openAddWidgetBuilder();
              if (step?.id === "create-workflow") {
                createWorkflow();
                return true;
              }
              return false;
            }}
            onOpenHelper={() => {
              setHelperIntent("explain");
              setHelperInitialPrompt("Help me finish setting up this workspace.");
              setHelperInitialThread(null);
              setHelperOpen(true);
            }}
          />
          </> : null}
        <section className="workspace-table" id="dashboards" aria-label="Builder">
          <div className="workspace-table-heading">
            <strong>Builder</strong>
            <span>{dashboards.length} dashboard{dashboards.length === 1 ? "" : "s"} · {sites.length} site{sites.length === 1 ? "" : "s"} · {workflows.length} workflow{workflows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="workspace-builder-filterbar">
            <div className="workspace-builder-filterbar__segments" role="group" aria-label="Builder item type">
              {[
                ["all", "All"],
                ["dashboard", "Dashboards"],
                ["site", "Sites"],
                ["workflow", "Workflows"]
              ].map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  className={builderListFilter.type === type ? "is-active" : ""}
                  onClick={() => setBuilderListFilter((prev) => ({ ...prev, type }))}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="workspace-builder-filterbar__search">
              <Search size={14} aria-hidden="true" />
              <input
                value={builderListFilter.query}
                placeholder="Filter builder items"
                onChange={(event) => setBuilderListFilter((prev) => ({ ...prev, query: event.target.value }))}
              />
            </label>
          </div>
          <div className="workspace-table-row workspace-table-head">
            <span>Title</span>
            <span>Type</span>
            <span>Last update</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {builderItems.map((item) => item.type === "dashboard" ? <div className="workspace-table-row" key={item.id}>
              <span className="workspace-dashboard-title">
                {editingDashboardId === item.dashboard.id ? <span className="workspace-dashboard-title-editor">
                  <input
                    aria-label={`Rename ${item.dashboard.name}`}
                    autoFocus
                    data-dashboard-title-input={item.dashboard.id}
                    onBlur={() => cancelDashboardTitleEdit(item.dashboard)}
                    onChange={(event) => setEditingDashboardDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirmDashboardTitleEdit(item.dashboard.id);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelDashboardTitleEdit(item.dashboard);
                      }
                    }}
                    value={editingDashboardDraft}
                  />
                  <button
                    aria-label={`Confirm ${item.dashboard.name} title`}
                    className="workspace-dashboard-title-confirm"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => confirmDashboardTitleEdit(item.dashboard.id)}
                    type="button"
                  >✓</button>
                </span> : <button
                  className={item.index === resolvedActiveDashboardIndex ? "active" : ""}
                  onClick={() => selectDashboard(item.index)}
                  type="button"
                >{item.dashboard.name}</button>}
              </span>
              <span>{item.itemKind}</span>
              <span>{item.updatedAt}</span>
              <span>
                <select
                  aria-label={`Status for ${item.dashboard.name}`}
                  onChange={(event) => updateDashboardStatus(item.dashboard.id, event.target.value)}
                  value={item.dashboard.status}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
              </span>
              <span className="workspace-dashboard-actions">
                <button
                  type="button"
                  className="workspace-row-action-trigger"
                  aria-label={`Actions for ${item.dashboard.name}`}
                  onClick={(event) => openBuilderActionMenu(item, event)}
                >
                  <MoreVertical size={16} aria-hidden="true" />
                </button>
                {builderActionMenuId === item.id && (
                  <span className="workspace-row-action-menu" style={builderActionMenuPlacement || undefined}>
                    <button type="button" onClick={() => { closeBuilderActionMenu(); selectDashboard(item.index); }}>Edit</button>
                    <button type="button" onClick={() => { closeBuilderActionMenu(); enterDashboardTitleEdit(item.dashboard); }}>Rename</button>
                    <button type="button" onClick={() => { closeBuilderActionMenu(); cloneDashboard(item.index); }}>Clone</button>
                    <button type="button" onClick={() => { closeBuilderActionMenu(); deleteDashboard(item.index); }}>Delete</button>
                  </span>
                )}
              </span>
            </div> : item.type === "site" ? <div className="workspace-table-row" key={item.id}>
              <span className="workspace-dashboard-title">
                {item.site.url ? (
                  <a href={item.site.url} target="_blank" rel="noreferrer">{item.title}</a>
                ) : (
                  <button
                    className="active"
                    onClick={() => manageSite(item.site)}
                    type="button"
                  >{item.title}</button>
                )}
              </span>
              <span>{item.itemKind}</span>
              <span>{item.updatedAt}</span>
              <span>
                <select
                  aria-label={`Status for ${item.title}`}
                  value={item.status || "draft"}
                  disabled
                >
                  <option value="draft">draft</option>
                  <option value="review">review</option>
                  <option value="live">live</option>
                  <option value="paused">paused</option>
                </select>
              </span>
              <span className="workspace-dashboard-actions">
                <button
                  type="button"
                  className="workspace-row-action-trigger"
                  aria-label={`Actions for ${item.title}`}
                  onClick={(event) => openBuilderActionMenu(item, event)}
                >
                  <MoreVertical size={16} aria-hidden="true" />
                </button>
                {builderActionMenuId === item.id && (
                  <span className="workspace-row-action-menu" style={builderActionMenuPlacement || undefined}>
                    {item.site.url ? (
                      <a href={item.site.url} target="_blank" rel="noreferrer" onClick={closeBuilderActionMenu}>Open URL</a>
                    ) : (
                      <button type="button" disabled>Open URL</button>
                    )}
                    <button type="button" onClick={() => { closeBuilderActionMenu(); manageSite(item.site); }}>Manage</button>
                    <button type="button" onClick={() => { closeBuilderActionMenu(); window.open("/settings/apps", "_self"); }}>Apps</button>
                  </span>
                )}
              </span>
            </div> : <div className="workspace-table-row" key={item.id}>
              <span className="workspace-dashboard-title">
                {editingWorkflowId === item.workflow.id ? <span className="workspace-dashboard-title-editor">
                  <input
                    aria-label={`Rename ${item.title}`}
                    autoFocus
                    data-workflow-title-input={item.workflow.id}
                    onBlur={() => cancelWorkflowTitleEdit(item.workflow)}
                    onChange={(event) => setEditingWorkflowDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirmWorkflowTitleEdit(item.workflow);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelWorkflowTitleEdit(item.workflow);
                      }
                    }}
                    value={editingWorkflowDraft}
                  />
                  <button
                    aria-label={`Confirm ${item.title} title`}
                    className="workspace-dashboard-title-confirm"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => confirmWorkflowTitleEdit(item.workflow)}
                    type="button"
                  >✓</button>
                </span> : <button
                  type="button"
                  onClick={() => enterWorkflowTitleEdit(item.workflow)}
                >{item.title}</button>}
              </span>
              <span>{item.itemKind}</span>
              <span>{item.updatedAt}</span>
              <span>
                <select
                  aria-label={`Status for ${item.title}`}
                  value={item.status}
                  disabled
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="live">live</option>
                  <option value="archived">archived</option>
                </select>
              </span>
              <span className="workspace-dashboard-actions">
                <button
                  type="button"
                  className="workspace-row-action-trigger"
                  aria-label={`Actions for ${item.title}`}
                  onClick={(event) => openBuilderActionMenu(item, event)}
                >
                  <MoreVertical size={16} aria-hidden="true" />
                </button>
                {builderActionMenuId === item.id && (
                  <span className="workspace-row-action-menu" style={builderActionMenuPlacement || undefined}>
                    <button type="button" onClick={() => { closeBuilderActionMenu(); window.open(`/workflows?object=${item.workflow.objectId}&row=${encodeURIComponent(item.workflow.rowId)}&field=${encodeURIComponent(item.workflow.fieldName || "orchestrationConfig")}`, "_self"); }}>Edit</button>
                    <button type="button" onClick={() => { closeBuilderActionMenu(); enterWorkflowTitleEdit(item.workflow); }}>Rename</button>
                  </span>
                )}
              </span>
            </div>)}
        </section>
        </> : null}

        {workspaceView === "builder" ? <section className="workspace-canvas" id="canvas" aria-label="Composable dashboard canvas">
          <div className="workspace-tabs">
            {tabs.map((tab) => <button
                key={tab.id}
                className={tab.id === activeTabId ? "active" : ""}
                type="button"
                onClick={() => switchTab(tab.id)}
                onDoubleClick={(event) => beginTabRename(tab, event)}
              >
                {editingTabId === tab.id ? <input
                  className="workspace-tab-name-input"
                  autoFocus
                  value={editingTabDraft}
                  onChange={(event) => setEditingTabDraft(event.target.value)}
                  onBlur={() => commitTabRename(tab.id)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitTabRename(tab.id);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingTabId(null);
                      setEditingTabDraft("");
                    }
                  }}
                /> : <span>{tab.name}</span>}
                <span
                  aria-label={`Delete tab ${tab.name}`}
                  className="workspace-tab-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!dashboardDraftMode) return;
                    deleteTab(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      deleteTab(tab.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >x</span>
              </button>)}
            <button type="button" onClick={addTab} disabled={!dashboardDraftMode}><Plus size={15} />New Tab</button>
            <button type="button" onClick={duplicateTab} disabled={!dashboardDraftMode}><Copy size={15} />Duplicate Tab</button>
          </div>
          <div
            className={`workspace-grid${moveDrag ? " moving-widget" : ""}${dashboardDraftMode ? " is-edit-mode" : " is-view-mode"}`}
            ref={gridRef}
            onPointerMove={updatePointerDrag}
            onPointerUp={(event) => {
              finishPointerDrag(event);
              finishResizeDrag();
              finishMoveDrag();
            }}
            onPointerLeave={() => {
              finishResizeDrag();
              finishMoveDrag();
            }}
            onPointerMoveCapture={(event) => {
              updateResizeDrag(event);
              updateMoveDrag(event);
            }}
            style={{ "--workspace-columns": canvas.layout.columns, "--workspace-rows": GRID_ROWS }}
          >
            {dashboardDraftMode ? Array.from({ length: GRID_CELL_COUNT }).map((_, index) => {
              const x = index % GRID_COLUMNS;
              const y = Math.floor(index / GRID_COLUMNS);
              const isOccupied = occupiedCells.has(`${x}:${y}`);
              return <button
                aria-label={`Select cell ${x + 1}, ${y + 1}`}
                aria-hidden={isOccupied ? "true" : undefined}
                className="workspace-grid-cell"
                data-cell-index={index}
                disabled={isOccupied}
                key={index}
                onPointerDown={(event) => beginCellDrag(index, event)}
                style={{
                  gridColumn: `${x + 1} / span 1`,
                  gridRow: `${y + 1} / span 1`
                }}
                type="button"
              />;
            }) : null}
            {showAddWidgetSlot ? <button className={`workspace-add-widget${dragPreview ? " selecting" : ""}`} type="button" onClick={() => setPanelOpen(true)} style={{
              gridColumn: `${addSlot.x + 1} / span ${addSlot.w}`,
              gridRow: `${addSlot.y + 1} / span ${addSlot.h}`
            }}>
              <span className="workspace-widget-icon" aria-hidden="true"><span /></span>
              <strong>Add widget</strong>
              <small>Click to add your first widget</small>
            </button> : null}
            {activeWidgets.map((widget) => <WidgetPreview
              key={widget.id}
              branding={branding}
              onMoveStart={(event) => beginMoveDrag(widget, event)}
              onRemove={() => removeSelectedWidget(widget.id)}
              onResizeStart={(corner, event) => beginResizeDrag(widget, corner, event)}
              onSelect={() => selectWidget(widget.id)}
              onExpandIframe={setExpandedIframeWidget}
              selected={widget.id === selectedWidgetId}
              widget={resolveViewWidget(widget, dataModelTables)}
            />)}
          </div>
        </section> : null}
      </section>

      {templateGalleryOpen ? <TemplateGallery
        templates={NORMALIZED_TEMPLATES}
        previewTemplateId={previewTemplateId}
        onPreview={setPreviewTemplateId}
        onClose={closeTemplateGallery}
        onApplyToCurrentTab={applyTemplateToCurrentTab}
        onCloneAsDashboard={cloneTemplateAsDashboard}
        filter={templateFilter}
        onFilterChange={setTemplateFilter}
      /> : null}

      {settingsOpen ? <WorkspaceSettingsPanel
        config={config}
        persistence={persistence}
        adapterConfig={adapterConfig}
        integrationAdapter={integrationAdapter}
        onClose={closeSettings}
      /> : null}

      {managementOpen ? <WorkspaceManagementPanel
        config={config}
        persistence={persistence}
        adapterConfig={adapterConfig}
        onClose={closeManagement}
      /> : null}

      <HelperSidecar
        open={helperOpen}
        onClose={() => setHelperOpen(false)}
        workspaceConfig={config}
        initialIntent={helperIntent}
        initialPrompt={helperInitialPrompt}
        initialThread={helperInitialThread}
        onOpenArtifact={(target) => {
          if (!target) return;
          // dashboards surface — focus the created dashboard inline.
          if (target.surface === "dashboard" && target.dashboardId) {
            setActiveDashboardId?.(target.dashboardId);
            setWorkspaceView?.("builder");
            setHelperOpen(false);
            return;
          }
          // a data-model artifact was applied — navigate to that surface.
          if (target.surface === "data-model" && target.source) {
            setHelperOpen(false);
            if (typeof window !== "undefined") {
              window.location.href = `/data-model?source=${encodeURIComponent(target.source)}`;
            }
          }
        }}
        onApplied={(updatedConfig) => {
          if (!updatedConfig) return;
          // Re-seat canvas from the dashboard the user is currently viewing.
          // If the helper created a new dashboard we still keep the user
          // anchored where they were unless they had no active dashboard yet.
          setConfig((current) => {
            const nextDashboards = Array.isArray(updatedConfig.dashboards) && updatedConfig.dashboards.length
              ? updatedConfig.dashboards
              : current.dashboards;
            const stillActive = nextDashboards.find((d) => d?.id === resolvedActiveDashboardId);
            const anchor = stillActive || nextDashboards[0];
            return {
              ...current,
              ...updatedConfig,
              dashboards: nextDashboards,
              canvas: dashboardCanvasFrom(anchor, updatedConfig.canvas || current.canvas)
            };
          });
        }}
      />

      {workspaceView === "builder" && panelOpen ? <aside className="workspace-widget-panel" id="widgets" aria-label="Widget configuration">
        {(inspectorPath === SUB_PANEL_ROOT || !selectedWidget) ? <div className="workspace-panel-title">
          <button type="button" aria-label="Close widget panel" onClick={closePanel}>x</button>
          {selectedWidget ? <WidgetPanelHeaderIcon kind={selectedWidget.kind} /> : <span aria-hidden="true">+</span>}
          <strong>{selectedWidget ? selectedWidget.title : "New widget"}</strong>
          {selectedWidget ? <em>{widgetKindLabel(selectedWidget.kind)}</em> : null}
        </div> : null}
        {selectedWidget && inspectorPath === SUB_PANEL_ROOT ? <div className="workspace-widget-actions" role="group" aria-label="Widget actions">
          <button type="button" onClick={duplicateSelectedWidget}><Copy size={15} />Duplicate</button>
          <button type="button" className="danger" onClick={() => removeSelectedWidget(selectedWidget.id)}><Trash2 size={15} />Remove</button>
        </div> : null}
        {selectedWidget && inspectorPath === "source" ? <SourceSubPanel
          widget={selectedWidget}
          dataModelTables={dataModelTables}
          onChange={replaceSelectedWidgetConfig}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && inspectorPath === "fields" ? <FieldsSubPanel
          widget={selectedWidget}
          dataModelTable={resolveDataModelTable(dataModelTables, selectedWidget.config?.binding)}
          onChange={replaceSelectedWidgetConfig}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && inspectorPath === "sort" ? <SortSubPanel
          widget={selectedWidget}
          dataModelTable={resolveDataModelTable(dataModelTables, selectedWidget.config?.binding)}
          onChange={replaceSelectedWidgetConfig}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && inspectorPath === "filter" ? <FilterSubPanel
          widget={selectedWidget}
          integrations={availableIntegrations}
          dataModelTable={resolveDataModelTable(dataModelTables, selectedWidget.config?.binding)}
          adapterConfig={adapterConfig}
          onRefreshAndSave={handleRefreshDataModelObject}
          onChange={replaceSelectedWidgetConfig}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && selectedWidget.kind === "chart" && inspectorPath === "hydration" ? <ChartHydrationInspector
          widget={selectedWidget}
          dataModelTables={dataModelTables}
          unsaved={unsavedChartIds.has(selectedWidget.id)}
          saving={saving}
          canSave={Boolean(persistence?.canSave)}
          saveGuidance={persistence?.guidance || persistence?.saveLabel || ""}
          onChange={replaceSelectedWidgetConfig}
          onSave={() => persistWorkspaceConfig(config, activeDashboardId)}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && inspectorPath === SUB_PANEL_ROOT ? <section className="workspace-widget-settings">
          <label>
            <span>Title</span>
            <input value={selectedWidget.title} onChange={(event) => updateSelectedWidget({ title: event.target.value })} />
          </label>
          {selectedWidget.kind === "chart" ? <ChartConfigPanel
            widget={selectedWidget}
            branding={branding}
            dataModelTables={dataModelTables}
            unsaved={unsavedChartIds.has(selectedWidget.id)}
            onChange={replaceSelectedWidgetConfig}
            onSubPage={(name) => setInspectorPath(name)}
          /> : null}
          {selectedWidget.kind === "iframe" ? <label className="workspace-field-with-hint">
            <span>URL to Embed</span>
            <input
              placeholder="https://example.com/embed"
              value={selectedWidget.config?.url || ""}
              onChange={(event) => updateSelectedWidgetConfig({ url: event.target.value })}
            />
            <small className={isLikelyHttpUrl(selectedWidget.config?.url) ? "workspace-field-hint good" : "workspace-field-hint warn"}>
              {isLikelyHttpUrl(selectedWidget.config?.url)
                ? "Looks like a valid http(s) URL"
                : selectedWidget.config?.url
                  ? "URL must start with http:// or https://"
                  : "Add an http(s) URL to embed"}
            </small>
          </label> : null}
          {selectedWidget.kind === "rich-text" ? <label className="workspace-field-with-hint">
            <span>Content</span>
            <RichTextEditor
              value={selectedWidget.config?.text || ""}
              onChange={(text) => updateSelectedWidgetConfig({ text })}
            />
            <small className="workspace-field-hint">
              {(selectedWidget.config?.text || "").length} characters · markdown controls
            </small>
          </label> : null}
          {selectedWidget.kind === "view" ? <section className="workspace-field-stack">
            <TableViewConfig
              widget={selectedWidget}
              dataModelTable={resolveDataModelTable(dataModelTables, selectedWidget.config?.binding)}
              onChange={replaceSelectedWidgetConfig}
              onSubPage={(name) => setInspectorPath(name)}
            />
          </section> : null}
        </section> : null}
        {!selectedWidget ? <section>
          <div className="workspace-widget-empty">
            <strong>Pick a widget kind</strong>
            <p>
              Widgets snap to the 12-column × 16-row grid. {addSlot.w} × {addSlot.h} cells
              selected at column {addSlot.x + 1}, row {addSlot.y + 1}. Drag empty cells in the
              canvas to reshape the placement. Press <kbd>⌘K</kbd> for the command palette.
            </p>
          </div>
          <p className="workspace-panel-label">Widget type</p>
          <div className="workspace-widget-types">
            {widgetTypes.map((widget) => {
              const KindIcon = WIDGET_KIND_ICONS[widget.kind];
              const shortcut = widget.kind === "chart" ? "C" : widget.kind === "view" ? "V" : widget.kind === "iframe" ? "I" : "T";
              return <button type="button" key={widget.kind} onClick={() => addWidget(widget.kind)}>
                <span><IconGlyph icon={KindIcon} size={15} /></span>
                {widget.label}
                <kbd>{shortcut}</kbd>
              </button>;
            })}
          </div>
        </section> : null}
        {inspectorPath === SUB_PANEL_ROOT ? <details className="workspace-bindings" id="bindings">
          <summary>Config bindings and data model sync</summary>
          {Object.entries(canvas.bindings).map(([key, value]) => <div key={key}>
              <span>{key}</span>
              <code>{String(value)}</code>
            </div>)}
          <div>
            <span>integrationAdapter</span>
            <code>{adapterConfig.integrationAdapter}</code>
          </div>
          <div>
            <span>workspaceSourceRecords</span>
            <code>{Object.keys(workspaceSourceRecords || {}).length} sources</code>
          </div>
          <div>
            <span>dataModelObjects</span>
            <code>{dataModelTables.length} synced</code>
          </div>
        </details> : null}
      </aside> : null}
      {expandedIframeWidget ? <IframePreviewModal widget={expandedIframeWidget} onClose={() => setExpandedIframeWidget(null)} /> : null}
      {commandPaletteOpen ? <CommandPalette commands={paletteCommands} onClose={closeCommandPalette} /> : null}
    </main>;
}

export {
  WorkspaceBuilder as default
};
