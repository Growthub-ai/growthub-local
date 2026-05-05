"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DASHBOARD_TEMPLATES,
  SAMPLE_DATA_BINDINGS,
  SAMPLE_VIEW_ROWS,
  cloneTemplateToDashboard,
  cloneTemplateToTab,
  defaultConfigFor,
  normalizeWorkspaceTemplate,
  unwrapWorkspaceTemplateImport,
  validateWorkspaceConfig,
  wrapWorkspaceTemplateExport
} from "@/lib/workspace-schema";

const DEFAULT_POSITION = { x: 4, y: 0, w: 4, h: 5 };
const GRID_COLUMNS = 12;
const GRID_ROWS = 16;
const GRID_CELL_COUNT = GRID_COLUMNS * GRID_ROWS;
const DEFAULT_TAB_ID = "tab-default";
const COLLAPSED_GRID_COLUMNS = "220px minmax(0, 1fr)";

const PANEL_MODES = ["widgets", "settings", "management"];

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
  const tab = createEmptyTab(name);
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
  const clonedTab = cloneTabForDashboard(tab, name);
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

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value));
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
  onCloneAsDashboard
}) {
  const previewTemplate = templates.find((template) => template.id === previewTemplateId) || null;
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
      <div className="template-gallery-grid">
        {templates.map((template) => {
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
              <button type="button" onClick={() => onApplyToCurrentTab(template.id)}>Apply to Current Tab</button>
              <button type="button" onClick={() => onCloneAsDashboard(template.id)}>Clone as New Dashboard</button>
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

function WidgetKindIcon({ kind }) {
  if (kind === "chart") return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="6" width="2" height="7" rx="1" fill="currentColor" opacity="0.5"/><rect x="5" y="4" width="2" height="9" rx="1" fill="currentColor" opacity="0.7"/><rect x="9" y="1" width="2" height="12" rx="1" fill="currentColor"/></svg>;
  if (kind === "view") return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="1" width="12" height="2.5" rx="1" fill="currentColor" opacity="0.5"/><rect x="1" y="5" width="12" height="2" rx="0.8" fill="currentColor" opacity="0.35"/><rect x="1" y="8.5" width="12" height="2" rx="0.8" fill="currentColor" opacity="0.35"/><rect x="1" y="12" width="7" height="1.5" rx="0.8" fill="currentColor" opacity="0.25"/></svg>;
  if (kind === "iframe") return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M4.5 6l-2 2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.5 6l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (kind === "rich-text") return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 3h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M2 6h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M2 9h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M2 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
  return null;
}

function StatusDot({ status }) {
  if (status === "connected" || status === "filesystem") return <span className="ws-dot ws-dot-good" aria-hidden="true" />;
  if (status === "warn" || status === "read-only") return <span className="ws-dot ws-dot-warn" aria-hidden="true" />;
  return <span className="ws-dot ws-dot-muted" aria-hidden="true" />;
}

function WidgetPreview({ widget, selected, onSelect, onRemove, onResizeStart }) {
  const viewColumns = widget.config?.columns?.length ? widget.config.columns : ["Name", "Domain Name"];
  const viewRows = widget.config?.rows?.length ? widget.config.rows : SAMPLE_VIEW_ROWS;
  const chartValues = widget.config?.values?.length ? widget.config.values : defaultConfigFor("chart").values;
  const hasIframeUrl = Boolean(widget.config?.url);
  const hasRichText = Boolean(widget.config?.text);
  return <article
    className={`workspace-widget-preview${selected ? " selected" : ""}`}
    onClick={onSelect}
    style={{
      gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
      gridRow: `${widget.position.y + 1} / span ${widget.position.h}`
    }}
  >
    <div className="workspace-widget-preview-title">
      <span className="workspace-widget-drag-handle" aria-hidden="true">
        <WidgetKindIcon kind={widget.kind} />
      </span>
      <strong>{widget.title}</strong>
      {selected ? <button
        aria-label={`Remove ${widget.title}`}
        className="workspace-widget-remove"
        onClick={(event) => { event.stopPropagation(); onRemove(); }}
        type="button"
        title="Remove widget"
      >×</button> : null}
    </div>
    {widget.kind === "view" ? <div
      className="workspace-view-table"
      aria-label={`${widget.title} preview`}
      style={{ "--workspace-view-columns": viewColumns.length }}
    >
      <div className="workspace-view-header">{viewColumns.map((col) => <span key={col}>{col}</span>)}</div>
      {viewRows.slice(0, 5).map((row, rowIndex) => <div key={rowIndex}>
        {viewColumns.map((col) => <span key={col}>{row?.[col] || ""}</span>)}
      </div>)}
    </div> : null}
    {widget.kind === "iframe" ? <div className={`workspace-iframe-preview${hasIframeUrl ? " has-url" : ""}`}>
      {hasIframeUrl
        ? <span className="workspace-iframe-url">{widget.config.url}</span>
        : <span className="workspace-iframe-empty"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M7 9l-3 3 3 3M13 9l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>Paste a URL in settings</span>
      }
    </div> : null}
    {widget.kind === "rich-text" ? <p className="workspace-rich-text-preview">
      {hasRichText ? widget.config.text : <span className="workspace-widget-empty-hint">Start writing in settings…</span>}
    </p> : null}
    {widget.kind === "chart" ? <div className="workspace-chart-preview" aria-label="Chart preview">
      {chartValues.map((height, index) => <span
        key={index}
        style={{ height: `${Math.max(8, Math.min(100, height))}%` }}
        title={String(height)}
      />)}
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

function WorkspaceBuilder({ initialConfig, adapterConfig, integrationAdapter, persistenceMode }) {
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
  const [panelMode, setPanelMode] = useState("widgets");
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  const [editingDashboardId, setEditingDashboardId] = useState(null);
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
  const [selectedPosition, setSelectedPosition] = useState(() => findFreePosition(activeWidgets));
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const [dragStartCell, setDragStartCell] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [resizeDrag, setResizeDrag] = useState(null);
  const [configMessage, setConfigMessage] = useState("");
  const resizeDragRef = useRef(null);
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
      setActiveDashboardId(dashboard.id);
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
      setEditingDashboardId(dashboard.id);
      setActiveDashboardId(dashboard.id);
      setConfigMessage(`Editing ${dashboard.name}`);
      return {
        ...synced,
        dashboards: prevDashboards.map((item) => item.id === dashboard.id ? normalized : item),
        canvas: dashboardCanvasFrom(normalized, synced.canvas)
      };
    });
  }, [activeDashboardId]);

  const renameDashboard = useCallback((dashboardId, name) => {
    const nextName = name.trimStart();
    setConfig((prev) => {
      const prevDashboards = prev.dashboards || [];
      const index = prevDashboards.findIndex((dashboard) => dashboard.id === dashboardId);
      if (index < 0) return prev;
      const displayName = nextName || "Untitled";
      const nextDashboards = prevDashboards.map((dashboard) =>
        dashboard.id === dashboardId ? { ...dashboard, name: displayName, updatedAt: "new" } : dashboard
      );
      const nextDashboardsWithTabs = nextDashboards.map((dashboard, dashboardIndex) => {
        if (dashboardIndex !== index) return dashboard;
        const normalized = normalizeDashboard(dashboard, index === 0 ? prev.canvas : undefined);
        const renamedTabs = normalized.tabs.map((tab, tabIndex) =>
          tabIndex === 0 ? { ...tab, name: displayName } : tab
        );
        return { ...normalized, tabs: renamedTabs };
      });
      const activeDashboard = nextDashboardsWithTabs.find((dashboard) => dashboard.id === getActiveDashboardId(nextDashboardsWithTabs, activeDashboardId));
      return {
        ...prev,
        dashboards: nextDashboardsWithTabs,
        canvas: dashboardCanvasFrom(activeDashboard || nextDashboardsWithTabs[0], prev.canvas)
      };
    });
  }, [activeDashboardId]);

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
        tabs: normalizedSource.tabs.map((tab, tabIndex) =>
          cloneTabForDashboard(tab, tabIndex === 0 ? name : tab.name)
        )
      };
      dashboard.activeTabId = dashboard.tabs[0].id;
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(dashboard.tabs[0].widgets));
      setDragPreview(null);
      setEditingDashboardId(dashboard.id);
      setActiveDashboardId(dashboard.id);
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
          ? updateDashboardCanvas({ ...dashboard, name: template.name, updatedAt: "new", status: "draft" }, nextCanvas)
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

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const stamp = todayIsoDate();
      const syncedConfig = syncActiveDashboard(config, activeDashboardId);
      const updatedDashboards = (syncedConfig.dashboards || []).map((dashboard) =>
        dashboard.id === getActiveDashboardId(syncedConfig.dashboards || [], activeDashboardId)
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
        const savedActiveDashboard = savedDashboards.find((dashboard) => dashboard.id === activeDashboardId) || savedDashboards[0];
        setConfig({
          ...payload.workspaceConfig,
          dashboards: savedDashboards,
          canvas: savedActiveDashboard ? dashboardCanvasFrom(savedActiveDashboard, payload.workspaceConfig.canvas) : payload.workspaceConfig.canvas
        });
        setConfigMessage("Saved dashboard config");
      } else {
        setConfigMessage(payload.error || "Save failed");
      }
    } catch (error) {
      setConfigMessage(error.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [activeDashboardId, saving, config]);

  const reopenPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const openWidgetsPanel = useCallback(() => {
    setPanelOpen(true);
    setPanelMode("widgets");
  }, []);
  const openSettingsPanel = useCallback(() => {
    setPanelOpen(true);
    setPanelMode("settings");
  }, []);
  const openManagementPanel = useCallback(() => {
    setPanelOpen(true);
    setPanelMode("management");
  }, []);

  const duplicateSelectedWidget = useCallback(() => {
    if (!selectedWidgetId) return;
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const activeTabWidgets = prevTabs.find((tab) => tab.id === prevActiveId)?.widgets || [];
      const source = activeTabWidgets.find((widget) => widget.id === selectedWidgetId);
      if (!source) return prev;
      const newWidget = {
        ...cloneConfig(source),
        id: generateId("widget"),
        position: findFreePosition(activeTabWidgets)
      };
      const nextTabs = prevTabs.map((tab) => {
        if (tab.id !== prevActiveId) return tab;
        return { ...tab, widgets: [...(tab.widgets || []), newWidget] };
      });
      setSelectedWidgetId(newWidget.id);
      setSelectedPosition(findFreePosition([...activeTabWidgets, newWidget]));
      return commitDashboardCanvas(prev, activeDashboardId, commitTabs(prev.canvas, nextTabs, prevActiveId));
    });
  }, [activeDashboardId, selectedWidgetId]);
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
  const selectWidget = useCallback((widgetId) => {
    setSelectedWidgetId(widgetId);
    setPanelOpen(true);
  }, []);
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

  const closeTemplateGallery = useCallback(() => {
    setTemplateGalleryOpen(false);
    setPreviewTemplateId(null);
  }, []);

  useEffect(() => {
    if (!templateGalleryOpen) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") closeTemplateGallery();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [templateGalleryOpen, closeTemplateGallery]);

  const builderStyle = panelOpen ? undefined : { gridTemplateColumns: COLLAPSED_GRID_COLUMNS };
  const branding = config.canvas?.branding || {};
  const workspaceName = branding.name || config.name || "Workspace Builder";
  const accentCss = branding.accent ? branding.accent : null;

  return <main className="workspace-builder" style={builderStyle} data-accent={accentCss || undefined}>

    {/* ── Left rail ── */}
    <aside className="workspace-rail" aria-label="Workspace navigation">
      <div className="workspace-brand">
        {branding.logoUrl
          ? <img className="workspace-logo" src={branding.logoUrl} alt={workspaceName} width="28" height="28" />
          : <span className="workspace-mark" style={accentCss ? { background: accentCss, color: "#fff" } : undefined}>W</span>}
        <div className="workspace-brand-text">
          <span className="workspace-brand-name">{workspaceName}</span>
          <span className="workspace-brand-type">Governed Workspace</span>
        </div>
      </div>

      <nav className="workspace-nav" aria-label="Workspace sections">
        <a className="active" href="#dashboards">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor"/><rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.5"/><rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.5"/><rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.5"/></svg>
          Dashboards
        </a>
        <a href="#canvas">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M4 4h6M4 7h4M4 10h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6"/></svg>
          Canvas
        </a>
        <a href="#widgets" onClick={openWidgetsPanel}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="1" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/><rect x="8" y="5" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.6"/></svg>
          Widgets
        </a>
        <a href="#settings" onClick={openSettingsPanel}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M7 1v2M7 11v2M1 7h2M11 7h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/></svg>
          Settings
        </a>
        <a href="#management" onClick={openManagementPanel}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="3" width="12" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1 6h12" stroke="currentColor" strokeWidth="1" opacity="0.5"/><circle cx="4" cy="8.5" r="0.8" fill="currentColor" opacity="0.5"/><circle cx="7" cy="8.5" r="0.8" fill="currentColor" opacity="0.5"/></svg>
          Management
        </a>
        <Link href="/settings/integrations">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="3" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="11" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="11" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M4.4 6.4l5.2-2.8M4.4 7.6l5.2 2.8" stroke="currentColor" strokeWidth="1" opacity="0.5"/></svg>
          Integrations
        </Link>
      </nav>

      <div className="workspace-rail-footer">
        <div className="workspace-rail-status">
          <StatusDot status={persistenceMode?.mode} />
          <span>{persistenceMode?.mode === "filesystem" ? "Local · can save" : "Read-only"}</span>
        </div>
        <div className="workspace-rail-adapter">
          <StatusDot status={adapterConfig.integrationAdapter === "static" ? "muted" : "connected"} />
          <span>{integrationAdapter.authority || adapterConfig.integrationAdapter}</span>
        </div>
      </div>
    </aside>

    {/* ── Main surface ── */}
    <section className="workspace-surface">

      {/* Toolbar */}
      <header className="workspace-toolbar">
        <div className="workspace-toolbar-identity">
          <p className="workspace-toolbar-eyebrow">Governed Workspace</p>
          <h1 className="workspace-toolbar-title">{workspaceName}</h1>
        </div>
        <div className="workspace-toolbar-actions">
          <button type="button" className="ws-btn ws-btn-ghost" onClick={() => setTemplateGalleryOpen(true)}>Templates</button>
          <button type="button" className="ws-btn ws-btn-ghost" onClick={addDashboard}>+ Dashboard</button>
          <div className="workspace-toolbar-divider" aria-hidden="true" />
          <button type="button" className="ws-btn ws-btn-ghost" onClick={() => importInputRef.current?.click()}>Import</button>
          <button type="button" className="ws-btn ws-btn-ghost" onClick={exportConfig}>Export</button>
          <div className="workspace-toolbar-divider" aria-hidden="true" />
          <button type="button" className="ws-btn ws-btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="ws-btn-spinner" aria-hidden="true" />Saving…</> : "Save"}
          </button>
        </div>
        <input ref={importInputRef} type="file" accept="application/json,.json" className="workspace-hidden-input" onChange={importConfig} />
      </header>

      {/* Status bar */}
      {configMessage ? <div className="workspace-statusbar" role="status" aria-live="polite">
        <span>{configMessage}</span>
        <button type="button" className="ws-statusbar-dismiss" onClick={() => setConfigMessage("")} aria-label="Dismiss">×</button>
      </div> : null}

      {/* Dashboards table */}
      <section className="workspace-table" id="dashboards" aria-label="Dashboards">
        <div className="workspace-table-heading">
          <strong>Dashboards</strong>
          <span className="workspace-table-count">{dashboards.length}</span>
          <button type="button" className="ws-btn ws-btn-xs ws-btn-ghost workspace-table-heading-action" onClick={addDashboard}>+ New</button>
        </div>
        <div className="workspace-table-row workspace-table-head" role="row">
          <span role="columnheader">Title</span>
          <span role="columnheader">Created by</span>
          <span role="columnheader">Last saved</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Actions</span>
        </div>
        {dashboards.map((dashboard, index) => <div
          className={`workspace-table-row${index === resolvedActiveDashboardIndex ? " workspace-table-row-active" : ""}`}
          key={dashboard.id}
          role="row"
        >
          <span className="workspace-dashboard-title">
            {editingDashboardId === dashboard.id
              ? <input
                  aria-label={`Rename ${dashboard.name}`}
                  autoFocus
                  onBlur={() => setEditingDashboardId(null)}
                  onChange={(event) => renameDashboard(dashboard.id, event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur(); }}
                  value={dashboard.name}
                />
              : <button
                  className={`workspace-dashboard-name-btn${index === resolvedActiveDashboardIndex ? " active" : ""}`}
                  onClick={() => selectDashboard(index)}
                  type="button"
                  title="Select this dashboard"
                >{dashboard.name}</button>}
          </span>
          <span className="workspace-table-cell-muted">{dashboard.createdBy}</span>
          <span className="workspace-table-cell-muted">{dashboard.updatedAt}</span>
          <span>
            <select
              className="ws-select"
              aria-label={`Status for ${dashboard.name}`}
              onChange={(event) => updateDashboardStatus(dashboard.id, event.target.value)}
              value={dashboard.status}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </span>
          <span className="workspace-dashboard-actions">
            <button type="button" className="ws-btn ws-btn-xs" onClick={() => selectDashboard(index)} title="Edit this dashboard">Edit</button>
            <button type="button" className="ws-btn ws-btn-xs" onClick={() => setEditingDashboardId(dashboard.id)} title="Rename">Rename</button>
            <button type="button" className="ws-btn ws-btn-xs" onClick={() => cloneDashboard(index)} title="Clone">Clone</button>
            <button type="button" className="ws-btn ws-btn-xs ws-btn-danger" onClick={() => deleteDashboard(index)} title="Delete">Delete</button>
          </span>
        </div>)}
      </section>

      {/* Canvas */}
      <section className="workspace-canvas" id="canvas" aria-label="Dashboard canvas">
        <div className="workspace-tabs" role="tablist" aria-label="Canvas tabs">
          {tabs.map((tab) => <button
            key={tab.id}
            className={`workspace-tab${tab.id === activeTabId ? " active" : ""}`}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => switchTab(tab.id)}
          >
            <span>{tab.name}</span>
            <span
              aria-label={`Delete tab ${tab.name}`}
              className="workspace-tab-delete"
              onClick={(event) => { event.stopPropagation(); deleteTab(tab.id); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); deleteTab(tab.id); }
              }}
              role="button"
              tabIndex={0}
            >×</span>
          </button>)}
          <button type="button" className="workspace-tab workspace-tab-add" onClick={addTab} title="Add tab">+ Tab</button>
          <button type="button" className="workspace-tab workspace-tab-ghost" onClick={duplicateTab} title="Duplicate current tab">Duplicate</button>
        </div>

        <div
          className="workspace-grid"
          ref={gridRef}
          onPointerMove={updatePointerDrag}
          onPointerUp={(event) => { finishPointerDrag(event); finishResizeDrag(); }}
          onPointerLeave={finishResizeDrag}
          onPointerMoveCapture={updateResizeDrag}
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
              style={{ gridColumn: `${x + 1} / span 1`, gridRow: `${y + 1} / span 1` }}
              type="button"
            />;
          })}
          <button
            className={`workspace-add-widget${dragPreview ? " selecting" : ""}${activeWidgets.length > 0 ? " has-widgets" : ""}`}
            type="button"
            onClick={openWidgetsPanel}
            style={{ gridColumn: `${addSlot.x + 1} / span ${addSlot.w}`, gridRow: `${addSlot.y + 1} / span ${addSlot.h}` }}
          >
            {activeWidgets.length === 0
              ? <>
                  <span className="workspace-add-widget-icon" aria-hidden="true">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="2" y="2" width="28" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3"/><path d="M16 10v12M10 16h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </span>
                  <strong>Add your first widget</strong>
                  <small>Drag to select a region, then choose a widget type</small>
                </>
              : <span className="workspace-add-widget-label">+ Add widget</span>}
          </button>
          {activeWidgets.map((widget) => <WidgetPreview
            key={widget.id}
            onRemove={() => removeSelectedWidget(widget.id)}
            onResizeStart={(corner, event) => beginResizeDrag(widget, corner, event)}
            onSelect={() => selectWidget(widget.id)}
            selected={widget.id === selectedWidgetId}
            widget={widget}
          />)}
        </div>
      </section>
    </section>

    {/* ── Template gallery overlay ── */}
    {templateGalleryOpen ? <TemplateGallery
      templates={NORMALIZED_TEMPLATES}
      previewTemplateId={previewTemplateId}
      onPreview={setPreviewTemplateId}
      onClose={closeTemplateGallery}
      onApplyToCurrentTab={applyTemplateToCurrentTab}
      onCloneAsDashboard={cloneTemplateAsDashboard}
    /> : null}

    {/* ── Right panel ── */}
    {panelOpen ? <aside className="workspace-widget-panel" id="widgets" aria-label="Widget configuration panel">

      {/* Panel header */}
      <div className="workspace-panel-header">
        <div className="workspace-panel-header-title">
          {panelMode === "widgets" && selectedWidget
            ? <>
                <span className="workspace-panel-kind-icon"><WidgetKindIcon kind={selectedWidget.kind} /></span>
                <strong>{selectedWidget.title}</strong>
                <em className="workspace-panel-kind-label">{widgetKindLabel(selectedWidget.kind)}</em>
              </>
            : panelMode === "settings"
            ? <strong>Workspace Settings</strong>
            : panelMode === "management"
            ? <strong>Management</strong>
            : <strong>Add Widget</strong>}
        </div>
        <button type="button" className="workspace-panel-close" aria-label="Close panel" onClick={closePanel} title="Close panel">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Panel mode tabs */}
      <div className="workspace-panel-tabs" role="tablist" aria-label="Panel mode">
        <button type="button" role="tab" aria-selected={panelMode === "widgets"} className={panelMode === "widgets" ? "active" : ""} onClick={() => setPanelMode("widgets")}>Widgets</button>
        <button type="button" role="tab" aria-selected={panelMode === "settings"} className={panelMode === "settings" ? "active" : ""} onClick={() => setPanelMode("settings")}>Settings</button>
        <button type="button" role="tab" aria-selected={panelMode === "management"} className={panelMode === "management" ? "active" : ""} onClick={() => setPanelMode("management")}>Management</button>
      </div>

      {/* ── WIDGETS PANEL ── */}
      {panelMode === "widgets" ? <div className="workspace-panel-body">

        {selectedWidget ? <>
          {/* Widget settings form */}
          <section className="workspace-widget-settings">

            {/* Title field — always shown */}
            <div className="ws-field">
              <label className="ws-label" htmlFor="ws-widget-title">Widget title</label>
              <input
                id="ws-widget-title"
                className="ws-input"
                value={selectedWidget.title}
                onChange={(event) => updateSelectedWidget({ title: event.target.value })}
              />
            </div>

            {/* Chart config */}
            {selectedWidget.kind === "chart" ? <>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-chart-values">Sample values</label>
                <input
                  id="ws-chart-values"
                  className="ws-input"
                  placeholder="42, 58, 63, 71, 86"
                  value={serializeChartValues(selectedWidget.config?.values || [])}
                  onChange={(event) => updateSelectedWidgetConfig({ values: normalizeChartValues(event.target.value) })}
                />
                <p className="ws-hint">Comma-separated numbers displayed as a bar chart. These are config-backed display values — not live data.</p>
              </div>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-chart-binding">Static binding sample</label>
                <select
                  id="ws-chart-binding"
                  className="ws-select"
                  value={selectedWidget.config?.binding?.mode || "json"}
                  onChange={(event) => updateSelectedWidgetConfig({
                    binding: event.target.value === "csv" ? SAMPLE_DATA_BINDINGS.contentCsv : SAMPLE_DATA_BINDINGS.reportingJson
                  })}
                >
                  <option value="json">Sample JSON metrics</option>
                  <option value="csv">Sample CSV data</option>
                </select>
              </div>
            </> : null}

            {/* iFrame config */}
            {selectedWidget.kind === "iframe" ? <>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-iframe-url">Embed URL</label>
                <input
                  id="ws-iframe-url"
                  className="ws-input"
                  placeholder="https://example.com/embed"
                  value={selectedWidget.config?.url || ""}
                  onChange={(event) => updateSelectedWidgetConfig({ url: event.target.value })}
                />
                <p className="ws-hint">Full URL to embed. The target page must allow framing — check that it does not send <code>X-Frame-Options: DENY</code>.</p>
              </div>
            </> : null}

            {/* Rich text config */}
            {selectedWidget.kind === "rich-text" ? <>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-richtext-body">Content</label>
                <textarea
                  id="ws-richtext-body"
                  className="ws-textarea"
                  placeholder="Write notes, summaries, briefing text, or any context that helps understand this dashboard…"
                  value={selectedWidget.config?.text || ""}
                  onChange={(event) => updateSelectedWidgetConfig({ text: event.target.value })}
                />
              </div>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-richtext-binding">Binding mode</label>
                <select
                  id="ws-richtext-binding"
                  className="ws-select"
                  value={selectedWidget.config?.binding?.mode || "manual"}
                  onChange={(event) => updateSelectedWidgetConfig({
                    binding: { mode: event.target.value, source: event.target.value === "manual" ? "Manual text" : "Sample JSON", rows: [] }
                  })}
                >
                  <option value="manual">Manual text</option>
                  <option value="json">Sample JSON (future bridge)</option>
                </select>
              </div>
            </> : null}

            {/* View / Table config */}
            {selectedWidget.kind === "view" ? <>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-view-source">Source label</label>
                <input
                  id="ws-view-source"
                  className="ws-input"
                  placeholder="Companies, Tasks, Contacts…"
                  value={selectedWidget.config?.source || ""}
                  onChange={(event) => updateSelectedWidgetConfig({ source: event.target.value })}
                />
                <p className="ws-hint">A display label for this data set. Shown as the table header.</p>
              </div>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-view-columns">Columns</label>
                <input
                  id="ws-view-columns"
                  className="ws-input"
                  placeholder="Name, Domain Name, Status"
                  value={serializeLineList(selectedWidget.config?.columns || [])}
                  onChange={(event) => updateSelectedWidgetConfig({ columns: parseLineList(event.target.value) })}
                />
                <p className="ws-hint">Comma-separated column names. These become the table headers and row keys.</p>
              </div>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-view-rows">Rows</label>
                <textarea
                  id="ws-view-rows"
                  className="ws-textarea ws-textarea-compact"
                  placeholder={"CMWL Direct | centerformedica.com\nMedi-Weightloss | mediweightloss.com"}
                  value={serializeManualRows(selectedWidget.config?.rows || [], selectedWidget.config?.columns || [])}
                  onChange={(event) => {
                    const cols = selectedWidget.config?.columns?.length ? selectedWidget.config.columns : ["Name", "Domain Name"];
                    updateSelectedWidgetConfig({
                      rows: parseManualRows(event.target.value, cols),
                      binding: { mode: "manual", source: "Manual rows", rows: parseManualRows(event.target.value, cols) }
                    });
                  }}
                />
                <p className="ws-hint">One row per line. Separate column values with <code>|</code>.</p>
              </div>
              <div className="ws-field">
                <label className="ws-label" htmlFor="ws-view-binding">Static binding</label>
                <select
                  id="ws-view-binding"
                  className="ws-select"
                  value={selectedWidget.config?.binding?.mode || "manual"}
                  onChange={(event) => updateSelectedWidgetConfig({
                    binding: event.target.value === "csv" ? SAMPLE_DATA_BINDINGS.contentCsv : SAMPLE_DATA_BINDINGS.companiesManual
                  })}
                >
                  <option value="manual">Manual rows (config-backed)</option>
                  <option value="csv">Sample CSV data</option>
                </select>
              </div>
              <div className="ws-meta-row-group">
                <p className="ws-group-label">View settings</p>
                <div className="ws-meta-row"><span>Layout</span><code>{selectedWidget.config?.layout || "Table"}</code></div>
                <div className="ws-meta-row"><span>Fields</span><code>{selectedWidget.config?.columns?.length || 2} columns</code></div>
                <div className="ws-meta-row ws-meta-row-future"><span>Filter</span><code className="ws-code-muted">future</code></div>
                <div className="ws-meta-row ws-meta-row-future"><span>Sort</span><code className="ws-code-muted">future</code></div>
              </div>
            </> : null}

            {/* Placement — always shown for selected widget */}
            <div className="ws-meta-row-group">
              <p className="ws-group-label">Placement</p>
              <div className="ws-meta-row"><span>Size</span><code>{selectedWidget.position.w} × {selectedWidget.position.h} cells</code></div>
              <div className="ws-meta-row"><span>Position</span><code>col {selectedWidget.position.x + 1}, row {selectedWidget.position.y + 1}</code></div>
            </div>

            {/* Widget actions */}
            <div className="workspace-widget-actions">
              <button type="button" className="ws-btn ws-btn-sm ws-btn-ghost" onClick={duplicateSelectedWidget} title="Duplicate this widget to a free cell">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1 8V1h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/></svg>
                Duplicate
              </button>
              <button type="button" className="ws-btn ws-btn-sm ws-btn-danger-ghost" onClick={() => removeSelectedWidget(selectedWidget.id)} title="Remove this widget from the canvas">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Remove
              </button>
            </div>
          </section>
        </> : <>
          {/* Widget type picker — no widget selected */}
          <section className="workspace-widget-picker">
            <p className="ws-group-label">Choose a widget type</p>
            <div className="workspace-widget-types">
              {widgetTypes.map((wt) => <button type="button" key={wt.kind} className="ws-widget-type-btn" onClick={() => addWidget(wt.kind)}>
                <span className="ws-widget-type-icon"><WidgetKindIcon kind={wt.kind} /></span>
                <div className="ws-widget-type-info">
                  <strong>{wt.label}</strong>
                  <span>{wt.kind === "chart" ? "Bar chart with config values" : wt.kind === "view" ? "Table with columns & rows" : wt.kind === "iframe" ? "Embedded URL content" : "Freeform text & notes"}</span>
                </div>
              </button>)}
            </div>
            <div className="workspace-add-widget-hint">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" opacity="0.4"/><path d="M7 6v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="7" cy="4.5" r="0.7" fill="currentColor" opacity="0.6"/></svg>
              <p>Drag across empty cells to choose a placement, then pick a type above to add it.</p>
            </div>
          </section>
        </>}

        {/* Config bindings — always shown at bottom of widgets panel */}
        <details className="ws-bindings-disclosure">
          <summary className="ws-group-label ws-group-label-sm">Config bindings <span className="ws-badge">{Object.keys(canvas.bindings || {}).length + 1}</span></summary>
          <div className="ws-bindings-list">
            {Object.entries(canvas.bindings || {}).map(([key, value]) => <div key={key} className="ws-meta-row">
              <span>{key}</span>
              <code className={value === true ? "ws-code-good" : ""}>{String(value)}</code>
            </div>)}
            <div className="ws-meta-row">
              <span>integrationAdapter</span>
              <code>{adapterConfig.integrationAdapter}</code>
            </div>
          </div>
        </details>

      </div> : null}

      {/* ── SETTINGS PANEL ── */}
      {panelMode === "settings" ? <div className="workspace-panel-body">
        <section className="ws-settings-section">
          <p className="ws-group-label">Workspace identity</p>
          <div className="ws-field">
            <label className="ws-label" htmlFor="ws-brand-name">Display name</label>
            <input
              id="ws-brand-name"
              className="ws-input"
              placeholder="My Workspace"
              value={branding.name || ""}
              onChange={(event) => setConfig((prev) => ({
                ...prev,
                canvas: { ...prev.canvas, branding: { ...(prev.canvas?.branding || {}), name: event.target.value } }
              }))}
            />
          </div>
          <div className="ws-field">
            <label className="ws-label" htmlFor="ws-brand-logo">Logo URL</label>
            <input
              id="ws-brand-logo"
              className="ws-input"
              placeholder="https://example.com/logo.png"
              value={branding.logoUrl || ""}
              onChange={(event) => setConfig((prev) => ({
                ...prev,
                canvas: { ...prev.canvas, branding: { ...(prev.canvas?.branding || {}), logoUrl: event.target.value } }
              }))}
            />
            <p className="ws-hint">Shown in the left rail. Leave blank to use the default mark.</p>
          </div>
          <div className="ws-field">
            <label className="ws-label" htmlFor="ws-brand-accent">Accent colour</label>
            <div className="ws-input-with-swatch">
              <input
                id="ws-brand-accent"
                className="ws-input"
                placeholder="#38bdf8"
                value={branding.accent || ""}
                onChange={(event) => setConfig((prev) => ({
                  ...prev,
                  canvas: { ...prev.canvas, branding: { ...(prev.canvas?.branding || {}), accent: event.target.value } }
                }))}
              />
              {branding.accent ? <span className="ws-colour-swatch" style={{ background: branding.accent }} aria-hidden="true" /> : null}
            </div>
            <p className="ws-hint">CSS colour string (hex, rgb, hsl). Applied to the workspace mark in the rail.</p>
          </div>
          <p className="ws-hint ws-hint-save">Changes apply immediately in the UI. Click <strong>Save</strong> in the toolbar to persist to <code>growthub.config.json</code>.</p>
        </section>

        <section className="ws-settings-section">
          <p className="ws-group-label">Persistence</p>
          <div className="ws-status-card">
            <div className="ws-status-card-row">
              <StatusDot status={persistenceMode?.mode} />
              <strong>{persistenceMode?.mode === "filesystem" ? "Filesystem · writable" : "Read-only runtime"}</strong>
            </div>
            <p className="ws-status-card-reason">{persistenceMode?.reason}</p>
          </div>
          {!persistenceMode?.canSave ? <div className="ws-alert ws-alert-warn">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1L13 12H1L7 1z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M7 5.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="7" cy="10" r="0.7" fill="currentColor"/></svg>
            <div>
              <strong>Saving disabled</strong>
              <p>Set <code>WORKSPACE_CONFIG_ALLOW_FS_WRITE=true</code> on a writable runtime, or wire a hosted persistence adapter to enable saves.</p>
            </div>
          </div> : null}
        </section>

        <section className="ws-settings-section">
          <p className="ws-group-label">Integration adapter</p>
          <div className="ws-status-card">
            <div className="ws-status-card-row">
              <StatusDot status={adapterConfig.integrationAdapter === "static" ? "muted" : "connected"} />
              <strong>{adapterConfig.integrationAdapter === "static" ? "Static mode" : adapterConfig.integrationAdapter === "growthub-bridge" ? "Growthub Bridge" : "BYO API Key"}</strong>
            </div>
            <p className="ws-status-card-reason">
              {adapterConfig.integrationAdapter === "static"
                ? "No live data. All widget bindings use config-backed static values. Set AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge to enable live integration data."
                : adapterConfig.integrationAdapter === "growthub-bridge"
                ? "Growthub Bridge is connected. Live integration data and bridge-backed bindings are available."
                : "BYO API key mode. Configure provider-specific env vars in your deployment environment."}
            </p>
          </div>
          <div className="ws-meta-row-group">
            <div className="ws-meta-row"><span>Authority</span><code>{integrationAdapter.authority || "local-catalog"}</code></div>
          </div>
        </section>
      </div> : null}

      {/* ── MANAGEMENT PANEL ── */}
      {panelMode === "management" ? <div className="workspace-panel-body">

        <section className="ws-settings-section">
          <p className="ws-group-label">Workspace</p>
          <div className="ws-meta-row-group">
            <div className="ws-meta-row"><span>ID</span><code className="ws-code-truncate" title={config.id || "workspace-builder-default"}>{config.id || "workspace-builder-default"}</code></div>
            <div className="ws-meta-row"><span>Name</span><code>{workspaceName}</code></div>
            <div className="ws-meta-row"><span>Source kit</span><code>custom-workspace-starter-v1</code></div>
            <div className="ws-meta-row"><span>Dashboards</span><code>{dashboards.length}</code></div>
          </div>
        </section>

        <section className="ws-settings-section">
          <p className="ws-group-label">API</p>
          <div className="ws-meta-row-group">
            <div className="ws-meta-row"><span>Config read</span><code>GET /api/workspace</code></div>
            <div className="ws-meta-row"><span>Config write</span><code>PATCH /api/workspace</code></div>
            <div className="ws-meta-row"><span>Allowlist</span><code>dashboards, widgetTypes, canvas</code></div>
          </div>
        </section>

        <section className="ws-settings-section">
          <p className="ws-group-label">Persistence</p>
          <div className="ws-meta-row-group">
            <div className="ws-meta-row">
              <span>Mode</span>
              <code className={persistenceMode?.mode === "filesystem" ? "ws-code-good" : "ws-code-warn"}>{persistenceMode?.mode || "unknown"}</code>
            </div>
            <div className="ws-meta-row"><span>Can save</span><code className={persistenceMode?.canSave ? "ws-code-good" : "ws-code-muted"}>{persistenceMode?.canSave ? "yes" : "no"}</code></div>
            <div className="ws-meta-row"><span>Data adapter</span><code>{adapterConfig.dataAdapter || "provider-managed"}</code></div>
          </div>
          {adapterConfig.dataAdapter === "provider-managed" ? <p className="ws-hint">
            Using provider-managed persistence. In dev mode, reads/writes go to <code>growthub.config.json</code> on disk. To use a database, set <code>AGENCY_PORTAL_DATA_ADAPTER=postgres</code> and provide <code>DATABASE_URL</code>.
          </p> : null}
        </section>

        <section className="ws-settings-section">
          <p className="ws-group-label">Workflows</p>
          <div className="ws-meta-row-group">
            <div className="ws-meta-row"><span>Execution</span><code className="ws-code-muted">not connected</code></div>
            <div className="ws-meta-row">
              <span>Bridge</span>
              <code className={adapterConfig.integrationAdapter === "growthub-bridge" ? "ws-code-good" : "ws-code-muted"}>
                {adapterConfig.integrationAdapter === "growthub-bridge" ? "connected" : "not connected"}
              </code>
            </div>
          </div>
          <div className="ws-alert ws-alert-info">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" opacity="0.5"/><path d="M7 6v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="7" cy="4.5" r="0.7" fill="currentColor" opacity="0.6"/></svg>
            <div>
              <strong>Workflow execution is hosted</strong>
              <p>To connect, set <code>AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge</code> and configure <code>GROWTHUB_BRIDGE_*</code> env vars. No browser-side execution is supported in V1.</p>
            </div>
          </div>
        </section>

        <section className="ws-settings-section">
          <p className="ws-group-label">Integrations</p>
          <div className="ws-meta-row-group">
            <div className="ws-meta-row"><span>Adapter</span><code>{adapterConfig.integrationAdapter}</code></div>
            <div className="ws-meta-row">
              <span>Windsor API</span>
              <code className={adapterConfig.dataSources?.hasWindsorApiKey ? "ws-code-good" : "ws-code-muted"}>
                {adapterConfig.dataSources?.hasWindsorApiKey ? "connected" : "not configured"}
              </code>
            </div>
          </div>
        </section>

        <div className="ws-management-links">
          <Link href="/settings/integrations" className="ws-link-btn">
            View Integrations page
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
        </div>
      </div> : null}

    </aside> : null}
  </main>;
}

export {
  WorkspaceBuilder as default
};
