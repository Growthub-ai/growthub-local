"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  DASHBOARD_TEMPLATES,
  SAMPLE_DATA_BINDINGS,
  SAMPLE_VIEW_ROWS,
  defaultConfigFor,
  validateWorkspaceConfig
} from "@/lib/workspace-schema";

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

function hydrateTemplate(template) {
  return {
    name: template.name,
    widgets: template.widgets.map((widget) => ({
      ...cloneConfig(widget),
      id: generateId("widget"),
      config: cloneConfig(widget.config || defaultConfigFor(widget.kind))
    }))
  };
}

function WidgetPreview({ widget, selected, onSelect, onRemove, onResizeStart }) {
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
      <span aria-hidden="true">::</span>
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
      {widget.config?.url ? <span>{widget.config.url}</span> : <span>Invalid URL</span>}
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

function WorkspaceBuilder({ initialConfig, adapterConfig, integrationAdapter }) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const gridRef = useRef(null);
  const canvas = config.canvas;
  const dashboards = config.dashboards;
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
      return { ...prev, canvas: commitTabs(prev.canvas, nextTabs, prevActiveId) };
    });
  }, [addSlot]);

  const switchTab = useCallback((tabId) => {
    setConfig((prev) => {
      const prevTabs = getTabs(prev.canvas);
      if (prevTabs.length <= 1) return prev;
      if (!prevTabs.some((tab) => tab.id === tabId)) return prev;
      const nextTab = prevTabs.find((tab) => tab.id === tabId);
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(nextTab?.widgets || []));
      setDragPreview(null);
      return { ...prev, canvas: commitTabs(prev.canvas, prevTabs, tabId) };
    });
  }, []);

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
      return { ...prev, canvas: commitTabs(prev.canvas, nextTabs, newTab.id) };
    });
  }, []);

  const addDashboard = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      dashboards: [
        ...(prev.dashboards || []),
        {
          id: generateId("dashboard"),
          name: "Untitled",
          createdBy: "Workspace owner",
          updatedAt: "new",
          status: "draft"
        }
      ]
    }));
  }, []);

  const duplicateDashboard = useCallback(() => {
    setConfig((prev) => {
      const source = prev.dashboards?.[0] || {
        name: "Untitled",
        createdBy: "Workspace owner",
        updatedAt: "new",
        status: "draft"
      };
      return {
        ...prev,
        dashboards: [
          ...(prev.dashboards || []),
          {
            ...source,
            id: generateId("dashboard"),
            name: `${source.name} Copy`,
            updatedAt: "new",
            status: "draft"
          }
        ]
      };
    });
  }, []);

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
      return { ...prev, canvas: commitTabs(prev.canvas, nextTabs, cloned.id) };
    });
  }, []);

  const applyTemplate = useCallback((templateId) => {
    const template = DASHBOARD_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setConfig((prev) => {
      const hydrated = hydrateTemplate(template);
      const prevTabs = getTabs(prev.canvas);
      const prevActiveId = getActiveTabId(prev.canvas);
      const stableTabs = prevTabs.length === 1 && prevTabs[0].id === DEFAULT_TAB_ID
        ? [{ ...prevTabs[0], id: DEFAULT_TAB_ID }]
        : prevTabs;
      const nextTabs = stableTabs.map((tab) =>
        tab.id === prevActiveId ? { ...tab, name: hydrated.name, widgets: hydrated.widgets } : tab
      );
      setSelectedWidgetId(null);
      setSelectedPosition(findFreePosition(hydrated.widgets));
      setDragPreview(null);
      setConfigMessage(`Applied ${template.name}`);
      return {
        ...prev,
        dashboards: (prev.dashboards || []).map((dashboard, index) =>
          index === 0 ? { ...dashboard, name: template.name, updatedAt: "new", status: "draft" } : dashboard
        ),
        canvas: commitTabs(prev.canvas, nextTabs, prevActiveId)
      };
    });
  }, []);

  const exportConfig = useCallback(() => {
    const blob = new Blob([`${JSON.stringify({
      dashboards: config.dashboards,
      widgetTypes: config.widgetTypes,
      canvas: config.canvas
    }, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "growthub-dashboard.config.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setConfigMessage("Exported dashboard config");
  }, [config]);

  const importConfig = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      validateWorkspaceConfig(imported);
      setConfig((prev) => ({
        ...prev,
        dashboards: imported.dashboards,
        widgetTypes: imported.widgetTypes,
        canvas: imported.canvas
      }));
      const importedTabs = getTabs(imported.canvas);
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
      const updatedDashboards = (config.dashboards || []).map((dashboard, index) =>
        index === 0 ? { ...dashboard, updatedAt: stamp } : dashboard
      );
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dashboards: updatedDashboards,
          widgetTypes: config.widgetTypes,
          canvas: config.canvas
        })
      });
      const payload = await response.json();
      if (response.ok && payload.workspaceConfig) {
        setConfig(payload.workspaceConfig);
        setConfigMessage("Saved dashboard config");
      } else {
        setConfigMessage(payload.error || "Save failed");
      }
    } catch (error) {
      setConfigMessage(error.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [saving, config]);

  const reopenPanel = useCallback(() => setPanelOpen(true), []);
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
      return { ...prev, canvas: commitTabs(prev.canvas, nextTabs, prevActiveId) };
    });
  }, [activeWidgets]);
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
      return { ...prev, canvas: commitTabs(prev.canvas, nextTabs, prevActiveId) };
    });
  }, [selectedWidgetId]);
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
      return { ...prev, canvas: commitTabs(prev.canvas, nextTabs, prevActiveId) };
    });
  }, []);

  const builderStyle = panelOpen ? undefined : { gridTemplateColumns: COLLAPSED_GRID_COLUMNS };

  return <main className="workspace-builder" style={builderStyle}>
      <aside className="workspace-rail" aria-label="Workspace navigation">
        <div className="workspace-brand">
          <span className="workspace-mark">G</span>
          <span>Growthub Workspace</span>
        </div>
        <nav className="workspace-nav">
          <a className="active" href="#dashboards">Dashboards</a>
          <a href="#canvas">Canvas</a>
          <a href="#widgets" onClick={reopenPanel}>Widgets</a>
          <a href="#bindings" onClick={reopenPanel}>Bindings</a>
          <Link href="/settings/integrations">Integrations</Link>
        </nav>
        <div className="workspace-rail-status">
          <span className="status-dot" />
          {integrationAdapter.authority}
        </div>
      </aside>

      <section className="workspace-surface">
        <header className="workspace-toolbar">
          <div>
            <p>Official starter</p>
            <h1>{config.name}</h1>
          </div>
          <div className="workspace-toolbar-actions">
            <select aria-label="Apply dashboard template" defaultValue="" onChange={(event) => {
              if (event.target.value) applyTemplate(event.target.value);
              event.target.value = "";
            }}>
              <option value="">Templates</option>
              {DASHBOARD_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
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
        {configMessage ? <p className="workspace-config-message">{configMessage}</p> : null}

        <section className="workspace-table" id="dashboards" aria-label="Dashboards">
          <div className="workspace-table-heading">
            <strong>Dashboards</strong>
            <span>{dashboards.length} template</span>
          </div>
          <div className="workspace-table-row workspace-table-head">
            <span>Title</span>
            <span>Created by</span>
            <span>Last update</span>
            <span>Status</span>
          </div>
          {dashboards.map((dashboard) => <div className="workspace-table-row" key={dashboard.id}>
              <span>{dashboard.name}</span>
              <span>{dashboard.createdBy}</span>
              <span>{dashboard.updatedAt}</span>
              <code>{dashboard.status}</code>
            </div>)}
        </section>

        <section className="workspace-canvas" id="canvas" aria-label="Composable dashboard canvas">
          <div className="workspace-tabs">
            {tabs.map((tab) => <button
                key={tab.id}
                className={tab.id === activeTabId ? "active" : ""}
                type="button"
                onClick={() => switchTab(tab.id)}
              >{tab.name}</button>)}
            <button type="button" onClick={addTab}>New Tab</button>
            <button type="button" onClick={duplicateTab}>Duplicate Tab</button>
          </div>
          <div
            className="workspace-grid"
            ref={gridRef}
            onPointerMove={updatePointerDrag}
            onPointerUp={(event) => {
              finishPointerDrag(event);
              finishResizeDrag();
            }}
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
              onRemove={() => removeSelectedWidget(widget.id)}
              onResizeStart={(corner, event) => beginResizeDrag(widget, corner, event)}
              onSelect={() => selectWidget(widget.id)}
              selected={widget.id === selectedWidgetId}
              widget={widget}
            />)}
          </div>
        </section>
      </section>

      {panelOpen ? <aside className="workspace-widget-panel" id="widgets" aria-label="Widget configuration">
        <div className="workspace-panel-title">
          <button type="button" aria-label="Close widget panel" onClick={closePanel}>x</button>
          <span aria-hidden="true">+</span>
          <strong>{selectedWidget ? selectedWidget.title : "New widget"}</strong>
          {selectedWidget ? <em>{widgetKindLabel(selectedWidget.kind)}</em> : null}
        </div>
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
          {selectedWidget.kind === "iframe" ? <label>
            <span>URL to Embed</span>
            <input
              placeholder="https://example.com/embed"
              value={selectedWidget.config?.url || ""}
              onChange={(event) => updateSelectedWidgetConfig({ url: event.target.value })}
            />
          </label> : null}
          {selectedWidget.kind === "rich-text" ? <label>
            <span>Content</span>
            <textarea
              placeholder="Write text..."
              value={selectedWidget.config?.text || ""}
              onChange={(event) => updateSelectedWidgetConfig({ text: event.target.value })}
            />
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
