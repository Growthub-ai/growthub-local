"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DASHBOARD_TEMPLATES,
  IFRAME_HEIGHT_MIN,
  KNOWN_IFRAME_ASPECT_RATIOS,
  KNOWN_IFRAME_REFRESH_MODES,
  KNOWN_IFRAME_SANDBOX_MODES,
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

const IFRAME_PROVIDER_SUGGESTIONS = [
  "airtable",
  "looker-studio",
  "google-sheets",
  "figma",
  "loom",
  "typeform",
  "posthog",
  "supabase",
  "vercel-preview",
  "growthub-app"
];

const IFRAME_SANDBOX_LABELS = {
  minimal: "Minimal — scripts only",
  forms: "Forms — scripts + forms + same-origin",
  interactive: "Interactive — scripts + forms + popups"
};

const IFRAME_REFRESH_LABELS = {
  manual: "Manual",
  static: "Static (no refresh)"
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

function WidgetPreview({ widget, selected, onSelect, onMoveStart, onRemove, onResizeStart }) {
  const viewColumns = widget.config?.columns?.length ? widget.config.columns : ["Name", "Domain Name"];
  const viewRows = widget.config?.rows?.length ? widget.config.rows : SAMPLE_VIEW_ROWS;
  const chartValues = widget.config?.values?.length ? widget.config.values : defaultConfigFor("chart").values;
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
      >x</button>
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
      {widget.config?.provider ? <small className="workspace-iframe-provider">{widget.config.provider}</small> : null}
      {widget.config?.url ? <span>{widget.config.url}</span> : <span>Invalid URL</span>}
      {widget.config?.aspectRatio && widget.config.aspectRatio !== "auto"
        ? <small className="workspace-iframe-aspect">{widget.config.aspectRatio}</small>
        : null}
    </div> : null}
    {widget.kind === "rich-text" ? <p className="workspace-rich-text-preview">{widget.config?.text || "Start writing..."}</p> : null}
    {widget.kind === "chart" ? <div className="workspace-chart-preview">
      {chartValues.map((height, index) => <span key={index} style={{ height: `${Math.max(5, Math.min(100, height))}%` }} />)}
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

  const builderStyle = workspaceView === "dashboards" || !panelOpen
    ? { gridTemplateColumns: COLLAPSED_GRID_COLUMNS }
    : undefined;

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
            <button type="button" onClick={() => setTemplateGalleryOpen(true)}>Templates</button>
            <button type="button" onClick={addDashboard}>New Dashboard</button>
            <button type="button" onClick={duplicateDashboard}>Duplicate Dashboard</button>
            <button type="button" onClick={() => importInputRef.current?.click()}>Import</button>
            <button type="button" onClick={exportConfig}>Export</button>
            <button type="button" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
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
            <button type="button" onClick={addTab}>New Tab</button>
            <button type="button" onClick={duplicateTab}>Duplicate Tab</button>
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
        {selectedWidget ? <div className="workspace-widget-actions" role="group" aria-label="Widget actions">
          <button type="button" onClick={duplicateSelectedWidget}>Duplicate</button>
          <button type="button" className="danger" onClick={() => removeSelectedWidget(selectedWidget.id)}>Remove</button>
        </div> : null}
        {selectedWidget ? <section className="workspace-widget-settings">
          <label>
            <span>Title</span>
            <input value={selectedWidget.title} onChange={(event) => updateSelectedWidget({ title: event.target.value })} />
          </label>
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
              </select>
            </label>
          </section> : null}
          {selectedWidget.kind === "iframe" ? <section className="workspace-field-stack">
            <label className="workspace-field-with-hint">
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
            </label>
            <label>
              <span>Provider</span>
              <input
                list="workspace-iframe-providers"
                placeholder="airtable, looker-studio, figma…"
                value={selectedWidget.config?.provider || ""}
                onChange={(event) => updateSelectedWidgetConfig({ provider: event.target.value })}
              />
              <datalist id="workspace-iframe-providers">
                {IFRAME_PROVIDER_SUGGESTIONS.map((provider) => <option key={provider} value={provider} />)}
              </datalist>
            </label>
            <label>
              <span>Aspect ratio</span>
              <select
                value={selectedWidget.config?.aspectRatio || "auto"}
                onChange={(event) => updateSelectedWidgetConfig({ aspectRatio: event.target.value })}
              >
                {KNOWN_IFRAME_ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio === "auto" ? "Auto (grid-fit)" : ratio}</option>)}
              </select>
            </label>
            <label>
              <span>Sandbox</span>
              <select
                value={selectedWidget.config?.sandboxMode || "minimal"}
                onChange={(event) => updateSelectedWidgetConfig({ sandboxMode: event.target.value })}
              >
                {KNOWN_IFRAME_SANDBOX_MODES.map((mode) => <option key={mode} value={mode}>{IFRAME_SANDBOX_LABELS[mode] || mode}</option>)}
              </select>
              <small className="workspace-field-hint">No-token, no hosted execution. Sandbox enforced on the iframe element.</small>
            </label>
            <label className="workspace-field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(selectedWidget.config?.allowFullscreen)}
                onChange={(event) => updateSelectedWidgetConfig({ allowFullscreen: event.target.checked })}
              />
              <span>Allow fullscreen</span>
            </label>
            <label>
              <span>Height override (px)</span>
              <input
                type="number"
                min={IFRAME_HEIGHT_MIN}
                placeholder="Auto"
                value={selectedWidget.config?.height ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "") {
                    updateSelectedWidgetConfig({ height: undefined });
                    return;
                  }
                  const parsed = Number.parseInt(raw, 10);
                  if (Number.isInteger(parsed) && parsed >= IFRAME_HEIGHT_MIN) {
                    updateSelectedWidgetConfig({ height: parsed });
                  }
                }}
              />
              <small className="workspace-field-hint">Optional. Falls back to grid-derived height when blank. Minimum {IFRAME_HEIGHT_MIN}px.</small>
            </label>
            <label>
              <span>Refresh</span>
              <select
                value={selectedWidget.config?.refreshMode || "manual"}
                onChange={(event) => updateSelectedWidgetConfig({ refreshMode: event.target.value })}
              >
                {KNOWN_IFRAME_REFRESH_MODES.map((mode) => <option key={mode} value={mode}>{IFRAME_REFRESH_LABELS[mode] || mode}</option>)}
              </select>
            </label>
          </section> : null}
          {selectedWidget.kind === "rich-text" ? <label className="workspace-field-with-hint">
            <span>Content</span>
            <textarea
              placeholder="Write text..."
              value={selectedWidget.config?.text || ""}
              onChange={(event) => updateSelectedWidgetConfig({ text: event.target.value })}
            />
            <small className="workspace-field-hint">
              {(selectedWidget.config?.text || "").length} characters · plain text only at V1
            </small>
          </label> : null}
          {selectedWidget.kind === "view" ? <section className="workspace-field-stack">
            <label>
              <span>Source</span>
              <input
                value={selectedWidget.config?.source || ""}
                onChange={(event) => updateSelectedWidgetConfig({ source: event.target.value })}
              />
            </label>
            <label>
              <span>Columns</span>
              <input
                value={serializeLineList(selectedWidget.config?.columns || [])}
                onChange={(event) => updateSelectedWidgetConfig({ columns: parseLineList(event.target.value) })}
              />
            </label>
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
            <label>
              <span>Static Binding</span>
              <select
                value={selectedWidget.config?.binding?.mode || "manual"}
                onChange={(event) => {
                  const binding = event.target.value === "csv" ? SAMPLE_DATA_BINDINGS.contentCsv : SAMPLE_DATA_BINDINGS.companiesManual;
                  updateSelectedWidgetConfig({ binding });
                }}
              >
                <option value="manual">Manual Rows</option>
                <option value="csv">Sample CSV</option>
              </select>
            </label>
            <div className="workspace-settings-list">
            <p className="workspace-panel-label">Settings</p>
            <div><span>Layout</span><code>{selectedWidget.config?.layout || "Table"}</code></div>
            <div><span>Source</span><code>{selectedWidget.config?.source || "Companies"}</code></div>
            <div><span>Fields</span><code>{selectedWidget.config?.columns?.length || 2} shown</code></div>
            <div><span>Filter</span><code>›</code></div>
            <div><span>Sort</span><code>›</code></div>
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
        </section> : <section>
          <div className="workspace-widget-empty">
            <strong>Pick a widget kind</strong>
            <p>
              Widgets snap to the 12-column × 16-row grid. {addSlot.w} × {addSlot.h} cells
              selected at column {addSlot.x + 1}, row {addSlot.y + 1}. Drag empty cells in the
              canvas to reshape the placement.
            </p>
          </div>
          <p className="workspace-panel-label">Widget type</p>
          <div className="workspace-widget-types">
            {widgetTypes.map((widget) => <button type="button" key={widget.kind} onClick={() => addWidget(widget.kind)}>
                <span>{widget.icon}</span>
                {widget.label}
              </button>)}
          </div>
        </section>}
        <section className="workspace-bindings" id="bindings">
          <p className="workspace-panel-label">Config bindings</p>
          {Object.entries(canvas.bindings).map(([key, value]) => <div key={key}>
              <span>{key}</span>
              <code>{String(value)}</code>
            </div>)}
          <div>
            <span>integrationAdapter</span>
            <code>{adapterConfig.integrationAdapter}</code>
          </div>
        </section>
      </aside> : null}
    </main>;
}

export {
  WorkspaceBuilder as default
};
