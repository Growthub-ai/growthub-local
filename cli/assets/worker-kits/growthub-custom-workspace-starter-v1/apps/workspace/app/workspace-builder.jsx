"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bolt,
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
  Grid2X2,
  Home,
  Import,
  Italic,
  LayoutDashboard,
  Link as LinkIcon,
  List,
  Maximize2,
  Pencil,
  PieChart,
  Plus,
  Quote,
  Rows3,
  Save,
  Search,
  Settings,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Type,
  X
} from "lucide-react";
import {
  DASHBOARD_TEMPLATES,
  KNOWN_AGGREGATIONS,
  KNOWN_CHART_TYPES,
  KNOWN_FILTER_CONJUNCTIONS,
  KNOWN_FILTER_OPERATORS,
  KNOWN_SORT_DIRECTIONS,
  SAMPLE_DATA_BINDINGS,
  SAMPLE_VIEW_ROWS,
  buildEntityFilterClause,
  cloneTemplateToDashboard,
  cloneTemplateToTab,
  defaultConfigFor,
  normalizeWorkspaceTemplate,
  unwrapWorkspaceTemplateImport,
  validateWorkspaceConfig,
  wrapWorkspaceTemplateExport
} from "@/lib/workspace-schema";
import { governedWorkspaceIntegrationCatalog } from "@/lib/domain/integrations";

const DEFAULT_CHART_TYPE = "bar-vertical";
const DEFAULT_FILTER_OP = "and";
const DEFAULT_FILTER_OPERATOR = "contains";
const DEFAULT_SORT_DIRECTION = "asc";
const SUB_PANEL_ROOT = "root";

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

const DEFAULT_POSITION = { x: 4, y: 0, w: 4, h: 5 };
const GRID_COLUMNS = 12;
const GRID_ROWS = 16;
const GRID_CELL_COUNT = GRID_COLUMNS * GRID_ROWS;
const DEFAULT_TAB_ID = "tab-default";
const COLLAPSED_GRID_COLUMNS = "220px minmax(0, 1fr)";

function generateId(prefix) {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function defaultTitleFor(kind) {
  switch (kind) {
    case "chart": return "Untitled chart";
    case "view": return "Companies";
    case "iframe": return "Untitled iFrame";
    case "rich-text": return "Untitled Rich Text";
    default: return "Untitled widget";
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

function createDashboardRecord(name = "Untitled") {
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
  const nextName = name.trim() || "Untitled";
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
  const activeColumns = columns.length ? columns : ["Name", "Domain Name"];
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
  const activeColumns = columns.length ? columns : ["Name", "Domain Name"];
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
  if (binding?.mode === "integration") {
    const source = binding.source || "Integration";
    if (binding.entityLabel) return `${source} · ${binding.entityLabel}`;
    if (binding.entityId) return `${source} · ${binding.entityId}`;
    return source;
  }
  if (widget?.config?.source) return widget.config.source;
  return "Static";
}

function summarizeFields(widget) {
  const total = getColumnList(widget).length;
  const hidden = getHiddenColumnSet(widget).size;
  if (!total) return "0 shown";
  return hidden ? `${total - hidden} of ${total} shown` : `${total} shown`;
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

function describeIntegrationLane(integration) {
  return integration?.lane === "data-source" ? "Data Sources" : "Workspace Tools";
}

const NORMALIZED_TEMPLATES = DASHBOARD_TEMPLATES.map((template) => ({
  ...normalizeWorkspaceTemplate(template),
  widgets: template.widgets
}));

function widgetKindFill(kind) {
  switch (kind) {
    case "chart": return "#dbeafe";
    case "view": return "#fef3c7";
    case "iframe": return "#ede9fe";
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

/**
 * EntitySelector — compact list for picking a provider entity after an integration
 * is selected from the SourceSubPanel.
 *
 * Governed invariant: only the entity `id` is persisted. The `label` is
 * display-only and may be refreshed from adapter metadata at any time.
 * The browser never holds provider tokens or executes provider queries.
 */
function EntitySelector({ integration, entities, selectedEntityId, onSelect, loading }) {
  const connected = integration?.isConnected || integration?.status === "connected";
  const selected = entities.find((e) => e.id === selectedEntityId) || null;

  return <div className="workspace-entity-selector">
    <p className="workspace-panel-label">
      Entity
      {!connected ? <span className="workspace-entity-selector-hint"> · sample data</span> : null}
    </p>
    {selected ? <EntityBadge entity={selected} onClear={() => onSelect(null)} /> : null}
    {loading ? <p className="workspace-entity-empty">Loading entities…</p> : null}
    {!loading && !entities.length ? <p className="workspace-entity-empty">
      No entities available. Ensure this integration is connected via Growthub Bridge.
    </p> : null}
    {!loading && entities.length ? <div className="workspace-entity-list">
      {entities.map((entity) => {
        const isActive = entity.id === selectedEntityId;
        const initials = entity.entityType
          ? entity.entityType[0].toUpperCase()
          : (entity.label?.[0] || "•").toUpperCase();
        return <button
          key={entity.id}
          type="button"
          className={`workspace-entity-row${isActive ? " active" : ""}`}
          onClick={() => onSelect(entity)}
          title={entity.label}
        >
          <span className="workspace-entity-row-icon" aria-hidden="true">{initials}</span>
          <span className="workspace-entity-row-meta">
            <strong>{entity.label}</strong>
            {entity.secondaryLabel ? <em title={entity.secondaryLabel}>{entity.secondaryLabel}</em> : null}
          </span>
          {isActive ? <span className="workspace-source-tick" aria-hidden="true"><Sparkles size={13} /></span> : null}
        </button>;
      })}
    </div> : null}
    {!connected ? <p className="workspace-panel-hint workspace-entity-sample-hint">
      Sample entities shown. Connect via Growthub Bridge for live account data.
    </p> : null}
  </div>;
}

function SourceSubPanel({ widget, integrations, onChange, onBack }) {
  const binding = widget.config?.binding || {};
  const currentMode = binding.mode || (widget.kind === "view" ? "manual" : "json");
  const [query, setQuery] = useState("");
  const [laneFilter, setLaneFilter] = useState("all");
  const [entities, setEntities] = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);

  const activeIntegration = useMemo(() => {
    if (currentMode !== "integration" || !binding.integrationId) return null;
    const list = Array.isArray(integrations) ? integrations : [];
    return list.find((item) => item.id === binding.integrationId) || null;
  }, [currentMode, binding.integrationId, integrations]);

  useEffect(() => {
    if (!binding.integrationId || currentMode !== "integration") {
      setEntities([]);
      return;
    }
    let cancelled = false;
    setEntitiesLoading(true);
    fetch(`/api/workspace/integration-entities?integrationId=${encodeURIComponent(binding.integrationId)}`)
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
  }, [binding.integrationId, currentMode]);

  const groups = useMemo(() => {
    const list = Array.isArray(integrations) ? integrations : [];
    const filtered = list.filter((item) => {
      if (laneFilter !== "all" && item.lane !== laneFilter) return false;
      const text = `${item.label} ${item.provider} ${item.description}`.toLowerCase();
      return !query.trim() || text.includes(query.trim().toLowerCase());
    });
    return {
      "data-source": filtered.filter((item) => item.lane === "data-source"),
      "workspace-integration": filtered.filter((item) => item.lane === "workspace-integration")
    };
  }, [integrations, laneFilter, query]);

  const selectStatic = useCallback(() => {
    if (widget.kind === "chart") {
      onChange({ ...widget.config, binding: SAMPLE_DATA_BINDINGS.reportingJson });
    } else {
      onChange({
        ...widget.config,
        source: widget.config?.source || "Companies",
        binding: SAMPLE_DATA_BINDINGS.companiesManual
      });
    }
  }, [onChange, widget.config, widget.kind]);

  const selectIntegration = useCallback((integration) => {
    onChange({
      ...widget.config,
      source: integration.label,
      binding: {
        mode: "integration",
        source: integration.label,
        integrationId: integration.id,
        lane: integration.lane
      }
    });
  }, [onChange, widget.config]);

  /**
   * Entity selection — the heart of the governed reference binding.
   *
   * When an entity is selected:
   *   1. Persist `entityId`, `entityType`, `entityLabel` into `binding`.
   *      Only the stable ID is authoritative; label is display-only.
   *   2. Write a canonical filter clause `{ fieldId, operator: "eq", value }`.
   *      The filter lives at `widget.config.filter` and is what data adapters
   *      will use at query time. It stores the ID, not the label.
   *
   * When cleared (entity = null): remove entity fields from binding and
   * remove only the entity-generated clause from the filter.
   */
  const selectEntity = useCallback((entity) => {
    const existingFilter = widget.config?.filter;
    const existingClauses = Array.isArray(existingFilter?.clauses) ? existingFilter.clauses : [];

    if (!entity) {
      const { entityId, entityType, entityLabel, ...restBinding } = binding;
      const entityFieldIds = ["accountId", "propertyId", "shopId", "spreadsheetId",
        "channelId", "projectId", "locationId", "folderId", "pipelineId", "workspaceId", "entityId"];
      const cleanedClauses = existingClauses.filter(
        (clause) => !(entityFieldIds.includes(clause.fieldId) && clause.operator === "eq")
      );
      onChange({
        ...widget.config,
        binding: restBinding,
        filter: { op: existingFilter?.op || "and", clauses: cleanedClauses }
      });
      return;
    }

    const entityClause = buildEntityFilterClause(entity.entityType, entity.id);
    const entityFieldIds = ["accountId", "propertyId", "shopId", "spreadsheetId",
      "channelId", "projectId", "locationId", "folderId", "pipelineId", "workspaceId", "entityId"];
    const otherClauses = existingClauses.filter(
      (clause) => !(entityFieldIds.includes(clause.fieldId) && clause.operator === "eq")
    );
    const updatedClauses = [entityClause, ...otherClauses];

    onChange({
      ...widget.config,
      source: binding.source || entity.label,
      binding: {
        ...binding,
        entityId: entity.id,
        entityType: entity.entityType || "",
        entityLabel: entity.label
      },
      filter: { op: existingFilter?.op || "and", clauses: updatedClauses }
    });
  }, [binding, buildEntityFilterClause, onChange, widget.config]);

  return <section className="workspace-widget-subpanel">
    <SubPanelHeader title="Source" breadcrumb={widget.title} onBack={onBack} />
    <div className="workspace-source-controls">
      <label>
        <Search size={14} aria-hidden="true" />
        <input
          aria-label="Search sources"
          placeholder="Search sources"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label>
        <Database size={14} aria-hidden="true" />
        <select
          aria-label="Filter source type"
          value={laneFilter}
          onChange={(event) => setLaneFilter(event.target.value)}
        >
          <option value="all">All source types</option>
          <option value="data-source">Data sources</option>
          <option value="workspace-integration">Workspace tools</option>
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </label>
    </div>
    <p className="workspace-panel-label">Static data</p>
    <div className="workspace-source-list">
      <button
        type="button"
        className={`workspace-source-row${currentMode !== "integration" ? " active" : ""}`}
        onClick={selectStatic}
      >
        <span className="workspace-source-icon" aria-hidden="true"><Grid2X2 size={15} /></span>
        <span className="workspace-source-meta">
          <strong>Static rows</strong>
          <em>Inline data — no external authority required.</em>
        </span>
        {currentMode !== "integration" ? <span className="workspace-source-tick" aria-hidden="true"><Sparkles size={15} /></span> : null}
      </button>
    </div>
    {Object.entries(groups).map(([lane, items]) => items.length ? <div key={lane}>
      <p className="workspace-panel-label">{lane === "data-source" ? "Data Sources" : "Workspace Tools"}</p>
      <div className="workspace-source-list">
        {items.map((integration) => {
          const isActive = currentMode === "integration" && binding.integrationId === integration.id;
          const connected = integration.isConnected || integration.status === "connected";
          return <button
            key={integration.id}
            type="button"
            className={`workspace-source-row${isActive ? " active" : ""}`}
            onClick={() => selectIntegration(integration)}
          >
            <span className="workspace-source-icon" aria-hidden="true">{integration.icon || integration.label?.[0] || "•"}</span>
            <span className="workspace-source-meta">
              <strong>{integration.label}</strong>
              <em>{describeIntegrationLane(integration)} · {connected ? "connected" : "needs connection"}</em>
            </span>
            {isActive ? <span className="workspace-source-tick" aria-hidden="true"><Sparkles size={15} /></span> : null}
          </button>;
        })}
      </div>
    </div> : null)}
    {currentMode === "integration" && binding.integrationId ? <EntitySelector
      integration={activeIntegration}
      entities={entities}
      selectedEntityId={binding.entityId || null}
      onSelect={selectEntity}
      loading={entitiesLoading}
    /> : null}
    <p className="workspace-panel-hint">
      Selecting a source writes a binding reference only. The browser does not query integrations or store tokens.
    </p>
  </section>;
}

function FieldsSubPanel({ widget, onChange, onBack }) {
  const ordered = getOrderedColumns(widget);
  const hidden = getHiddenColumnSet(widget);
  const visible = ordered.filter((name) => !hidden.has(name));
  const hiddenList = ordered.filter((name) => hidden.has(name));
  const [hiddenOpen, setHiddenOpen] = useState(true);
  const [draftField, setDraftField] = useState("");
  const move = (fieldId, direction) => {
    const next = reorderColumn(widget, fieldId, direction);
    onChange({ ...widget.config, fieldSettings: next });
  };
  const toggle = (fieldId) => {
    const next = toggleColumnHidden(widget, fieldId);
    onChange({ ...widget.config, fieldSettings: next });
  };
  const removeColumn = (fieldId) => {
    const nextColumns = ordered.filter((name) => name !== fieldId);
    const fs = widget.config?.fieldSettings || {};
    onChange({
      ...widget.config,
      columns: nextColumns,
      fieldSettings: {
        hidden: (fs.hidden || []).filter((name) => name !== fieldId),
        order: (fs.order || []).filter((name) => name !== fieldId)
      }
    });
  };
  const addColumn = () => {
    const trimmed = draftField.trim();
    if (!trimmed || ordered.includes(trimmed)) return;
    onChange({ ...widget.config, columns: [...ordered, trimmed] });
    setDraftField("");
  };
  return <section className="workspace-widget-subpanel">
    <SubPanelHeader title="Fields" breadcrumb={widget.title} onBack={onBack} />
    <p className="workspace-panel-label">Visible fields</p>
    <div className="workspace-field-rows">
      {visible.length === 0 ? <p className="workspace-panel-hint">No visible fields. Add one below or unhide an existing field.</p> : null}
      {visible.map((name, index) => <div key={name} className="workspace-field-row">
        <span className="workspace-field-row-handle" aria-hidden="true">::</span>
        <span className="workspace-field-row-icon" aria-hidden="true">{COLUMN_ICON_FOR(name)}</span>
        <span className="workspace-field-row-name">{name}</span>
        <span className="workspace-field-row-actions">
          <button type="button" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(name, "up")}>↑</button>
          <button type="button" aria-label={`Move ${name} down`} disabled={index === visible.length - 1} onClick={() => move(name, "down")}>↓</button>
          <button type="button" aria-label={`Hide ${name}`} onClick={() => toggle(name)}>👁</button>
          <button type="button" aria-label={`Remove ${name}`} onClick={() => removeColumn(name)}>✕</button>
        </span>
      </div>)}
    </div>
    <button
      type="button"
      className="workspace-hidden-fields-toggle"
      onClick={() => setHiddenOpen((value) => !value)}
      aria-expanded={hiddenOpen}
    >
      <span>👁‍🗨 Hidden Fields</span>
      <span aria-hidden="true">{hiddenOpen ? "−" : "+"}</span>
    </button>
    {hiddenOpen ? <div className="workspace-field-rows workspace-hidden-fields">
      {hiddenList.length === 0 ? <p className="workspace-panel-hint">No hidden fields.</p> : null}
      {hiddenList.map((name) => <div key={name} className="workspace-field-row workspace-field-row-hidden">
        <span className="workspace-field-row-icon" aria-hidden="true">{COLUMN_ICON_FOR(name)}</span>
        <span className="workspace-field-row-name">{name}</span>
        <span className="workspace-field-row-actions">
          <button type="button" aria-label={`Show ${name}`} onClick={() => toggle(name)}>👁</button>
          <button type="button" aria-label={`Remove ${name}`} onClick={() => removeColumn(name)}>✕</button>
        </span>
      </div>)}
    </div> : null}
    <div className="workspace-field-add">
      <input
        aria-label="New field name"
        value={draftField}
        placeholder="Add field…"
        onChange={(event) => setDraftField(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addColumn();
          }
        }}
      />
      <button type="button" onClick={addColumn} disabled={!draftField.trim()}>Add</button>
    </div>
  </section>;
}

function SortSubPanel({ widget, onChange, onBack }) {
  const sort = getSortClauses(widget);
  const columns = getColumnList(widget);
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

function FilterSubPanel({ widget, onChange, onBack }) {
  const filter = getFilterConfig(widget);
  const columns = getColumnList(widget);
  const setFilter = (next) => onChange({ ...widget.config, filter: next });
  const setOp = (op) => setFilter({ ...filter, op });
  const addClause = () => {
    const fieldId = columns[0] || "";
    if (!fieldId) return;
    setFilter({ ...filter, clauses: [...filter.clauses, { fieldId, operator: DEFAULT_FILTER_OPERATOR, value: "" }] });
  };
  const updateClause = (index, patch) => {
    setFilter({ ...filter, clauses: filter.clauses.map((clause, idx) => idx === index ? { ...clause, ...patch } : clause) });
  };
  const removeClause = (index) => {
    setFilter({ ...filter, clauses: filter.clauses.filter((_, idx) => idx !== index) });
  };
  return <section className="workspace-widget-subpanel">
    <SubPanelHeader title="Filter" breadcrumb={widget.title} onBack={onBack} />
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
        return <div key={index} className="workspace-filter-clause">
          <select
            aria-label={`Filter ${index + 1} field`}
            value={clause.fieldId}
            onChange={(event) => updateClause(index, { fieldId: event.target.value })}
          >
            {!columns.includes(clause.fieldId) && clause.fieldId ? <option value={clause.fieldId}>{clause.fieldId}</option> : null}
            {columns.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select
            aria-label={`Filter ${index + 1} operator`}
            value={clause.operator || DEFAULT_FILTER_OPERATOR}
            onChange={(event) => updateClause(index, { operator: event.target.value })}
          >
            {KNOWN_FILTER_OPERATORS.map((op) => <option key={op} value={op}>{FILTER_OPERATOR_LABELS[op] || op}</option>)}
          </select>
          {!valueless ? <input
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

function ChartConfigPanel({ widget, onChange, onSubPage }) {
  const chartType = getChartType(widget) === "line" ? DEFAULT_CHART_TYPE : getChartType(widget);
  const xAxis = getChartAxis(widget, "xAxis");
  const yAxis = getChartAxis(widget, "yAxis");
  const style = getChartStyle(widget);
  const setChartType = (type) => onChange({ ...widget.config, chartType: type });
  const setXAxis = (patch) => onChange({ ...widget.config, xAxis: { ...xAxis, ...patch } });
  const setYAxis = (patch) => onChange({ ...widget.config, yAxis: { ...yAxis, ...patch } });
  const setStyle = (patch) => onChange({ ...widget.config, style: { ...style, ...patch } });
  return <section className="workspace-chart-config">
    <p className="workspace-panel-label">Chart type</p>
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
    <button type="button" className="workspace-settings-row" onClick={() => onSubPage("source")}>
      <span>Source</span><code>{summarizeSource(widget)}</code>
    </button>
    <button type="button" className="workspace-settings-row" onClick={() => onSubPage("filter")}>
      <span>Filter</span><code>{summarizeFilter(widget)}</code>
    </button>
    <p className="workspace-panel-label">X axis</p>
    <label>
      <span>Data on display</span>
      <input
        value={xAxis.field || ""}
        placeholder="Stage"
        onChange={(event) => setXAxis({ field: event.target.value })}
      />
    </label>
    <label>
      <span>Sort by</span>
      <select value={xAxis.sort || "position"} onChange={(event) => setXAxis({ sort: event.target.value })}>
        <option value="position">Stage position ascending</option>
        <option value="asc">Value ascending</option>
        <option value="desc">Value descending</option>
      </select>
    </label>
    <label className="workspace-toggle-row">
      <span>Omit zero values</span>
      <input
        type="checkbox"
        checked={Boolean(xAxis.omitZero)}
        onChange={(event) => setXAxis({ omitZero: event.target.checked })}
      />
    </label>
    <p className="workspace-panel-label">Y axis</p>
    <label>
      <span>Aggregation</span>
      <select value={yAxis.aggregation || "sum"} onChange={(event) => setYAxis({ aggregation: event.target.value })}>
        {KNOWN_AGGREGATIONS.map((agg) => <option key={agg} value={agg}>{agg}</option>)}
      </select>
    </label>
    <label>
      <span>Data on display</span>
      <input
        value={yAxis.field || ""}
        placeholder="Amount"
        onChange={(event) => setYAxis({ field: event.target.value })}
      />
    </label>
    <label>
      <span>Group by</span>
      <input
        value={yAxis.groupBy || ""}
        placeholder="—"
        onChange={(event) => setYAxis({ groupBy: event.target.value })}
      />
    </label>
    <div className="workspace-axis-range">
      <label>
        <span>Min range</span>
        <input
          value={yAxis.min ?? ""}
          placeholder="Min"
          onChange={(event) => setYAxis({ min: event.target.value })}
        />
      </label>
      <label>
        <span>Max range</span>
        <input
          value={yAxis.max ?? ""}
          placeholder="Max"
          onChange={(event) => setYAxis({ max: event.target.value })}
        />
      </label>
    </div>
    <p className="workspace-panel-label">Style</p>
    <label>
      <span>Colors</span>
      <select value={style.colors || "auto"} onChange={(event) => setStyle({ colors: event.target.value })}>
        <option value="auto">Auto</option>
        <option value="accent">Accent</option>
        <option value="manual">Manual</option>
      </select>
    </label>
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
    <label className="workspace-toggle-row">
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

function WidgetPreview({ widget, selected, onSelect, onMoveStart, onRemove, onResizeStart, onExpandIframe }) {
  const fallbackColumns = widget.config?.columns?.length ? widget.config.columns : ["Name", "Domain Name"];
  const visibleColumns = widget.kind === "view" ? getVisibleColumns(widget) : fallbackColumns;
  const viewColumns = visibleColumns.length ? visibleColumns : fallbackColumns;
  const viewRows = widget.config?.rows?.length ? widget.config.rows : SAMPLE_VIEW_ROWS;
  const chartValues = widget.config?.values?.length ? widget.config.values : defaultConfigFor("chart").values;
  const chartType = widget.kind === "chart" ? (getChartType(widget) === "line" ? DEFAULT_CHART_TYPE : getChartType(widget)) : null;
  const dataLabels = widget.kind === "chart" ? Boolean(widget.config?.style?.dataLabels) : false;
  const chartStyle = widget.kind === "chart" ? getChartStyle(widget) : {};
  const chartColor = chartStyle.colors === "manual" && chartStyle.manualColor ? chartStyle.manualColor : undefined;
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
      <button
        aria-label={`Remove ${widget.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        type="button"
      ><X size={13} /></button>
    </div>
    {widget.kind === "view" ? <div
      className="workspace-view-table"
      aria-label={`${widget.title} preview`}
      style={{ "--workspace-view-columns": viewColumns.length }}
    >
      <div>{viewColumns.map((column) => <span key={column}>{column}</span>)}</div>
      {viewRows.slice(0, 6).map((row, rowIndex) => <div key={rowIndex}>
        {viewColumns.map((column) => <span key={column}>{row?.[column] || ""}</span>)}
      </div>)}
      <footer>Calculate</footer>
    </div> : null}
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
        (<code>dashboards</code>, <code>widgetTypes</code>, <code>canvas</code>).
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
          <div className="workspace-readiness-row"><span>PATCH allowlist</span><code>dashboards | widgetTypes | canvas</code></div>
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
      </div>
    </section>
  </div>;
}

function WorkspaceBuilder({ initialConfig, adapterConfig, integrationAdapter, persistence }) {
  const [config, setConfig] = useState(() => {
    const dashboards = Array.isArray(initialConfig.dashboards) && initialConfig.dashboards.length
      ? initialConfig.dashboards.map((dashboard, index) =>
          normalizeDashboard(dashboard, index === 0 ? initialConfig.canvas : undefined)
        )
      : [createDashboardRecord("Untitled")];
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
  const [workspaceView, setWorkspaceView] = useState("dashboards");
  const [activeDashboardId, setActiveDashboardId] = useState(() =>
    getActiveDashboardId(
      Array.isArray(initialConfig.dashboards) && initialConfig.dashboards.length ? initialConfig.dashboards : [],
      null
    )
  );
  const gridRef = useRef(null);
  const canvas = config.canvas;
  const dashboards = config.dashboards || [];
  const resolvedActiveDashboardId = getActiveDashboardId(dashboards, activeDashboardId);
  const resolvedActiveDashboardIndex = activeDashboardIndex(dashboards, resolvedActiveDashboardId);
  const widgetTypes = config.widgetTypes;
  const tabs = getTabs(canvas);
  const activeTabId = getActiveTabId(canvas);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
  const activeWidgets = activeTab.widgets || [];
  const activeDashboard = dashboards[resolvedActiveDashboardIndex] || dashboards[0] || null;
  const [selectedPosition, setSelectedPosition] = useState(() => findFreePosition(activeWidgets));
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const [dragStartCell, setDragStartCell] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [resizeDrag, setResizeDrag] = useState(null);
  const [moveDrag, setMoveDrag] = useState(null);
  const [configMessage, setConfigMessage] = useState("");
  const [inspectorPath, setInspectorPath] = useState(SUB_PANEL_ROOT);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [templateFilter, setTemplateFilter] = useState({ category: "all", tag: "all", query: "" });
  const [expandedIframeWidget, setExpandedIframeWidget] = useState(null);
  const resizeDragRef = useRef(null);
  const moveDragRef = useRef(null);
  const importInputRef = useRef(null);
  const addSlot = dragPreview || selectedPosition;
  const selectedWidget = activeWidgets.find((widget) => widget.id === selectedWidgetId) || null;
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

  const addWidget = useCallback((kind) => {
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
      setSelectedPosition(findFreePosition([...existingWidgets, widget]));
      setDragPreview(null);
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, addSlot]);

  const switchTab = useCallback((tabId) => {
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      if (prevTabs.length <= 1) return prev;
      if (!prevTabs.some((tab) => tab.id === tabId)) return prev;
      const nextTab = prevTabs.find((tab) => tab.id === tabId);
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(nextTab?.widgets || []));
      setDragPreview(null);
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, prevTabs, tabId));
    });
  }, [activeDashboardId]);

  const addTab = useCallback(() => {
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
  }, [activeDashboardId]);

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
      setEditingDashboardId(null);
      setEditingDashboardDraft("");
      setActiveDashboardId(dashboard.id);
      setWorkspaceView("builder");
      setConfigMessage(`Editing ${dashboard.name}`);
      return {
        ...synced,
        dashboards: prevDashboards.map((item) => item.id === dashboard.id ? normalized : item),
        canvas: dashboardCanvasFrom(normalized, synced.canvas)
      };
    });
  }, [activeDashboardId]);

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
        const dashboard = createDashboardRecord("Untitled");
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
  }, [activeDashboardId]);

  const deleteTab = useCallback((tabId) => {
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
  }, [activeDashboardId]);

  const applyTemplateToCurrentTab = useCallback((templateId) => {
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
  }, [activeDashboardId]);

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

  const confirmDashboardTitleEdit = useCallback(async (dashboardId) => {
    const nextConfig = renameDashboardInConfig(config, dashboardId, editingDashboardDraft, activeDashboardId);
    setEditingDashboardId(null);
    setEditingDashboardDraft("");
    setConfig(nextConfig);
    await persistWorkspaceConfig(nextConfig, activeDashboardId);
  }, [activeDashboardId, config, editingDashboardDraft, persistWorkspaceConfig]);

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

  const closePanel = useCallback(() => setPanelOpen(false), []);
  const beginCellDrag = useCallback((index, event) => {
    const x = index % GRID_COLUMNS;
    const y = Math.floor(index / GRID_COLUMNS);
    if (occupiedCells.has(`${x}:${y}`)) return;
    event.preventDefault();
    const position = normalizePosition(index, index);
    setSelectedWidgetId(null);
    setDragStartCell(index);
    setDragPreview(position);
    setPanelOpen(true);
  }, [occupiedCells]);
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
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const nextResizeDrag = { widgetId: widget.id, corner, originalPosition: widget.position };
    setSelectedWidgetId(widget.id);
    resizeDragRef.current = nextResizeDrag;
    setResizeDrag(nextResizeDrag);
  }, []);
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
    setPanelOpen(true);
    moveDragRef.current = nextMoveDrag;
    setMoveDrag(nextMoveDrag);
  }, []);
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
    setSelectedWidgetId(widgetId);
    setInspectorPath(SUB_PANEL_ROOT);
    setPanelOpen(true);
  }, []);
  const replaceSelectedWidgetConfig = useCallback((nextConfig) => {
    if (!selectedWidgetId) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return {
          ...tab,
          widgets: (tab.widgets || []).map((widget) =>
            widget.id === selectedWidgetId ? { ...widget, config: nextConfig } : widget
          )
        };
      });
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, selectedWidgetId]);
  const updateSelectedWidget = useCallback((updates) => {
    if (!selectedWidgetId) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return {
          ...tab,
          widgets: (tab.widgets || []).map((widget) =>
            widget.id === selectedWidgetId ? { ...widget, ...updates } : widget
          )
        };
      });
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, selectedWidgetId]);
  const updateSelectedWidgetConfig = useCallback((updates) => {
    if (!selectedWidget) return;
    updateSelectedWidget({ config: { ...(selectedWidget.config || {}), ...updates } });
  }, [selectedWidget, updateSelectedWidget]);
  const removeSelectedWidget = useCallback((widgetId) => {
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return { ...tab, widgets: (tab.widgets || []).filter((widget) => widget.id !== widgetId) };
      });
      const nextActiveWidgets = nextTabs.find((tab) => tab.id === prevActiveId)?.widgets || [];
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(nextActiveWidgets));
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId]);

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
    setPanelOpen(true);
  }, []);
  const showDashboardHome = useCallback(() => {
    setEditingDashboardId(null);
    setEditingDashboardDraft("");
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

  const builderStyle = workspaceView === "dashboards" || !panelOpen
    ? { gridTemplateColumns: COLLAPSED_GRID_COLUMNS }
    : undefined;

  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);

  const paletteCommands = useMemo(() => {
    const list = [];
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
      run: () => setSettingsOpen(true)
    });
    list.push({
      id: "workspace.management", group: "Workspace", icon: Bolt, label: "Go to Management",
      run: () => setManagementOpen(true)
    });
    list.push({
      id: "workspace.dashboards", group: "Navigation", icon: Home, label: "Go to Dashboards",
      run: () => showDashboardHome()
    });
    list.push({
      id: "workspace.integrations", group: "Navigation", icon: LayoutDashboard, label: "Go to Integrations",
      run: () => { window.location.href = "/settings/integrations"; }
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
    workspaceView
  ]);

  return <main className="workspace-builder" onPointerDownCapture={resetWidgetSelectionOnOutsidePointer} style={builderStyle}>
      <aside className="workspace-rail" aria-label="Workspace navigation">
        <div className="workspace-brand">
          <span className="workspace-mark">G</span>
          <span>Growthub Workspace</span>
        </div>
        <nav className="workspace-nav">
          <button type="button" className={workspaceView === "dashboards" ? "active workspace-nav-button" : "workspace-nav-button"} onClick={showDashboardHome}>Dashboards</button>
          <Link href="/settings/integrations">Integrations</Link>
          <button type="button" className="workspace-nav-button" onClick={() => setSettingsOpen(true)}>Workspace Settings</button>
          <button type="button" className="workspace-nav-button" onClick={() => setManagementOpen(true)}>Management</button>
        </nav>
        <div className="workspace-rail-status">
          <span className="status-dot" />
          {integrationAdapter.authority}
        </div>
      </aside>

      <section className="workspace-surface">
        <header className="workspace-toolbar">
          <div>
            {workspaceView === "builder" ? <>
              <p>{activeTab?.name || "Tab 1"}</p>
              <h1>{activeDashboard?.name || "Untitled"}</h1>
            </> : <>
              <p>Workspace home</p>
              <h1>Dashboards</h1>
            </>}
          </div>
          <div className="workspace-toolbar-actions">
            <button type="button" onClick={() => setTemplateGalleryOpen(true)}><Grid2X2 size={15} />Templates</button>
            <button type="button" onClick={addDashboard}><Plus size={15} />New Dashboard</button>
            <button type="button" onClick={duplicateDashboard}><Copy size={15} />Duplicate Dashboard</button>
            <button type="button" onClick={() => importInputRef.current?.click()}><Import size={15} />Import</button>
            <button type="button" onClick={exportConfig}><Download size={15} />Export</button>
            <button type="button" onClick={save} disabled={saving}><Save size={15} />{saving ? "Saving..." : "Save"}</button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="workspace-hidden-input"
            onChange={importConfig}
          />
        </header>

        {workspaceView === "dashboards" ? <section className="workspace-table" id="dashboards" aria-label="Dashboards">
          <div className="workspace-table-heading">
            <strong>Dashboards</strong>
            <span>{dashboards.length} dashboard{dashboards.length === 1 ? "" : "s"}</span>
          </div>
          <div className="workspace-table-row workspace-table-head">
            <span>Title</span>
            <span>Created by</span>
            <span>Last update</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {dashboards.map((dashboard, index) => <div className="workspace-table-row" key={dashboard.id}>
              <span className="workspace-dashboard-title">
                {editingDashboardId === dashboard.id ? <span className="workspace-dashboard-title-editor">
                  <input
                    aria-label={`Rename ${dashboard.name}`}
                    autoFocus
                    data-dashboard-title-input={dashboard.id}
                    onBlur={() => cancelDashboardTitleEdit(dashboard)}
                    onChange={(event) => setEditingDashboardDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirmDashboardTitleEdit(dashboard.id);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelDashboardTitleEdit(dashboard);
                      }
                    }}
                    value={editingDashboardDraft}
                  />
                  <button
                    aria-label={`Confirm ${dashboard.name} title`}
                    className="workspace-dashboard-title-confirm"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => confirmDashboardTitleEdit(dashboard.id)}
                    type="button"
                  >✓</button>
                </span> : <button
                  className={index === resolvedActiveDashboardIndex ? "active" : ""}
                  onClick={() => enterDashboardTitleEdit(dashboard)}
                  type="button"
                >{dashboard.name}</button>}
              </span>
              <span>{dashboard.createdBy}</span>
              <span>{dashboard.updatedAt}</span>
              <span>
                <select
                  aria-label={`Status for ${dashboard.name}`}
                  onChange={(event) => updateDashboardStatus(dashboard.id, event.target.value)}
                  value={dashboard.status}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
              </span>
              <span className="workspace-dashboard-actions">
                <button type="button" onClick={() => selectDashboard(index)}>Edit</button>
                <button type="button" onClick={() => enterDashboardTitleEdit(dashboard)}>Rename</button>
                <button type="button" onClick={() => cloneDashboard(index)}>Clone</button>
                <button type="button" onClick={() => deleteDashboard(index)}>Delete</button>
              </span>
            </div>)}
        </section> : null}

        {workspaceView === "builder" ? <section className="workspace-canvas" id="canvas" aria-label="Composable dashboard canvas">
          <div className="workspace-tabs">
            {tabs.map((tab) => <button
                key={tab.id}
                className={tab.id === activeTabId ? "active" : ""}
                type="button"
                onClick={() => switchTab(tab.id)}
              >
                <span>{tab.name}</span>
                <span
                  aria-label={`Delete tab ${tab.name}`}
                  className="workspace-tab-delete"
                  onClick={(event) => {
                    event.stopPropagation();
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
            <button type="button" onClick={addTab}><Plus size={15} />New Tab</button>
            <button type="button" onClick={duplicateTab}><Copy size={15} />Duplicate Tab</button>
          </div>
          <div
            className={`workspace-grid${moveDrag ? " moving-widget" : ""}`}
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
            {Array.from({ length: GRID_CELL_COUNT }).map((_, index) => {
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
            })}
            <button className={`workspace-add-widget${dragPreview ? " selecting" : ""}`} type="button" onClick={() => setPanelOpen(true)} style={{
              gridColumn: `${addSlot.x + 1} / span ${addSlot.w}`,
              gridRow: `${addSlot.y + 1} / span ${addSlot.h}`
            }}>
              <span className="workspace-widget-icon" aria-hidden="true"><span /></span>
              <strong>Add widget</strong>
              <small>Click to add your first widget</small>
            </button>
            {activeWidgets.map((widget) => <WidgetPreview
              key={widget.id}
              onMoveStart={(event) => beginMoveDrag(widget, event)}
              onRemove={() => removeSelectedWidget(widget.id)}
              onResizeStart={(corner, event) => beginResizeDrag(widget, corner, event)}
              onSelect={() => selectWidget(widget.id)}
              onExpandIframe={setExpandedIframeWidget}
              selected={widget.id === selectedWidgetId}
              widget={widget}
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

      {workspaceView === "builder" && panelOpen ? <aside className="workspace-widget-panel" id="widgets" aria-label="Widget configuration">
        <div className="workspace-panel-title">
          <button type="button" aria-label="Close widget panel" onClick={closePanel}>x</button>
          <span aria-hidden="true">+</span>
          <strong>{selectedWidget ? selectedWidget.title : "New widget"}</strong>
          {selectedWidget ? <em>{widgetKindLabel(selectedWidget.kind)}</em> : null}
        </div>
        {selectedWidget && inspectorPath === SUB_PANEL_ROOT ? <div className="workspace-widget-actions" role="group" aria-label="Widget actions">
          <button type="button" onClick={duplicateSelectedWidget}><Copy size={15} />Duplicate</button>
          <button type="button" className="danger" onClick={() => removeSelectedWidget(selectedWidget.id)}><Trash2 size={15} />Remove</button>
        </div> : null}
        {selectedWidget && inspectorPath === "source" ? <SourceSubPanel
          widget={selectedWidget}
          integrations={governedWorkspaceIntegrationCatalog}
          onChange={replaceSelectedWidgetConfig}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && inspectorPath === "fields" ? <FieldsSubPanel
          widget={selectedWidget}
          onChange={replaceSelectedWidgetConfig}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && inspectorPath === "sort" ? <SortSubPanel
          widget={selectedWidget}
          onChange={replaceSelectedWidgetConfig}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && inspectorPath === "filter" ? <FilterSubPanel
          widget={selectedWidget}
          onChange={replaceSelectedWidgetConfig}
          onBack={() => setInspectorPath(SUB_PANEL_ROOT)}
        /> : null}
        {selectedWidget && inspectorPath === SUB_PANEL_ROOT ? <section className="workspace-widget-settings">
          <label>
            <span>Title</span>
            <input value={selectedWidget.title} onChange={(event) => updateSelectedWidget({ title: event.target.value })} />
          </label>
          {selectedWidget.kind === "chart" ? <ChartConfigPanel
            widget={selectedWidget}
            onChange={replaceSelectedWidgetConfig}
            onSubPage={(name) => setInspectorPath(name)}
          /> : null}
          {selectedWidget.kind === "chart" ? <section className="workspace-field-stack">
            <label>
              <span>Sample Values</span>
              <input
                value={serializeChartValues(selectedWidget.config?.values || [])}
                onChange={(event) => updateSelectedWidgetConfig({ values: normalizeChartValues(event.target.value) })}
              />
            </label>
            <label>
              <span>Static Binding</span>
              <select
                value={selectedWidget.config?.binding?.mode || "json"}
                onChange={(event) => updateSelectedWidgetConfig({
                  binding: event.target.value === "csv" ? SAMPLE_DATA_BINDINGS.contentCsv : SAMPLE_DATA_BINDINGS.reportingJson
                })}
              >
                <option value="json">Sample JSON</option>
                <option value="csv">Sample CSV</option>
                {selectedWidget.config?.binding?.mode === "integration" ? <option value="integration">Integration reference</option> : null}
              </select>
            </label>
          </section> : null}
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
            <label>
              <span>Manual Rows</span>
              <textarea
                value={serializeManualRows(selectedWidget.config?.rows || [], selectedWidget.config?.columns || [])}
                onChange={(event) => {
                  const columns = selectedWidget.config?.columns?.length ? selectedWidget.config.columns : ["Name", "Domain Name"];
                  updateSelectedWidgetConfig({
                    rows: parseManualRows(event.target.value, columns),
                    binding: { mode: "manual", source: "Manual rows", rows: parseManualRows(event.target.value, columns) }
                  });
                }}
              />
            </label>
            <div className="workspace-settings-list" role="group" aria-label="View widget settings">
              <p className="workspace-panel-label">Settings</p>
              <button type="button" className="workspace-settings-row" disabled>
                <span>Layout</span><code>{selectedWidget.config?.layout || "Table"}</code>
              </button>
              <button type="button" className="workspace-settings-row" onClick={() => setInspectorPath("source")}>
                <span>Source</span><code>{summarizeSource(selectedWidget)}</code>
              </button>
              <button type="button" className="workspace-settings-row" onClick={() => setInspectorPath("fields")}>
                <span>Fields</span><code>{summarizeFields(selectedWidget)}</code>
              </button>
              <button type="button" className="workspace-settings-row" onClick={() => setInspectorPath("filter")}>
                <span>Filter</span><code>{summarizeFilter(selectedWidget)}</code>
              </button>
              <button type="button" className="workspace-settings-row" onClick={() => setInspectorPath("sort")}>
                <span>Sort</span><code>{summarizeSort(selectedWidget)}</code>
              </button>
            </div>
          </section> : null}
          {selectedWidget.kind === "rich-text" ? <label>
            <span>Static Binding</span>
            <select
              value={selectedWidget.config?.binding?.mode || "manual"}
              onChange={(event) => updateSelectedWidgetConfig({
                binding: { mode: event.target.value, source: event.target.value === "manual" ? "Manual text" : "Sample JSON", rows: [] }
              })}
            >
              <option value="manual">Manual Text</option>
              <option value="json">Sample JSON</option>
            </select>
          </label> : null}
          <div className="workspace-settings-list">
            <p className="workspace-panel-label">Placement</p>
            <div><span>Size</span><code>{selectedWidget.position.w} x {selectedWidget.position.h}</code></div>
            <div><span>Origin</span><code>{selectedWidget.position.x + 1}, {selectedWidget.position.y + 1}</code></div>
          </div>
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
        {inspectorPath === SUB_PANEL_ROOT ? <section className="workspace-bindings" id="bindings">
          <p className="workspace-panel-label">Config bindings</p>
          {Object.entries(canvas.bindings).map(([key, value]) => <div key={key}>
              <span>{key}</span>
              <code>{String(value)}</code>
            </div>)}
          <div>
            <span>integrationAdapter</span>
            <code>{adapterConfig.integrationAdapter}</code>
          </div>
        </section> : null}
      </aside> : null}
      {expandedIframeWidget ? <IframePreviewModal widget={expandedIframeWidget} onClose={() => setExpandedIframeWidget(null)} /> : null}
      {commandPaletteOpen ? <CommandPalette commands={paletteCommands} onClose={closeCommandPalette} /> : null}
    </main>;
}

export {
  WorkspaceBuilder as default
};
