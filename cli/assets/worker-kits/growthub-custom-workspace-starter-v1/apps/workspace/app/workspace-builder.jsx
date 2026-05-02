"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

const DEFAULT_POSITION = { x: 0, y: 0, w: 4, h: 3 };
const GRID_COLUMNS = 12;
const GRID_ROWS = 16;

function generateWidgetId() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return `widget_${globalThis.crypto.randomUUID()}`;
  }
  return `widget_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function defaultTitleFor(kind) {
  switch (kind) {
    case "chart": return "Untitled chart";
    case "view": return "Untitled view";
    case "iframe": return "Embedded view";
    case "rich-text": return "Note";
    default: return "Untitled widget";
  }
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

function WorkspaceBuilder({ initialConfig, adapterConfig, integrationAdapter }) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const canvas = config.canvas;
  const dashboards = config.dashboards;
  const widgetTypes = config.widgetTypes;

  const addWidget = useCallback((kind) => {
    setConfig((prev) => {
      const widgets = prev.canvas?.widgets || [];
      const widget = {
        id: generateWidgetId(),
        kind,
        title: defaultTitleFor(kind),
        position: findFreePosition(widgets),
        config: {}
      };
      return {
        ...prev,
        canvas: { ...prev.canvas, widgets: [...widgets, widget] }
      };
    });
  }, []);

  const addDashboard = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      dashboards: [
        ...(prev.dashboards || []),
        {
          id: `dashboard_${Math.random().toString(36).slice(2, 8)}`,
          name: "Untitled",
          createdBy: "Workspace owner",
          updatedAt: "new",
          status: "draft"
        }
      ]
    }));
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dashboards: config.dashboards,
          widgetTypes: config.widgetTypes,
          canvas: config.canvas
        })
      });
      const payload = await response.json();
      if (response.ok && payload.workspaceConfig) {
        setConfig(payload.workspaceConfig);
      }
    } finally {
      setSaving(false);
    }
  }, [saving, config]);

  return <main className="workspace-builder">
      <aside className="workspace-rail" aria-label="Workspace navigation">
        <div className="workspace-brand">
          <span className="workspace-mark">G</span>
          <span>Growthub Workspace</span>
        </div>
        <nav className="workspace-nav">
          <a className="active" href="#dashboards">Dashboards</a>
          <a href="#canvas">Canvas</a>
          <a href="#widgets">Widgets</a>
          <a href="#bindings">Bindings</a>
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
            <button type="button" onClick={addDashboard}>New Dashboard</button>
            <button type="button" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          </div>
        </header>

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
            <button className="active" type="button">{canvas.name}</button>
            <button type="button">New Tab</button>
          </div>
          <div className="workspace-grid" style={{ "--workspace-columns": canvas.layout.columns }}>
            <button className="workspace-add-widget" type="button" onClick={() => addWidget("chart")}>
              <span className="workspace-widget-icon" aria-hidden="true"><span /></span>
              <strong>Add widget</strong>
              <small>Click to add your first widget</small>
            </button>
            {Array.from({ length: 96 }).map((_, index) => <span aria-hidden="true" className="workspace-grid-cell" key={index} />)}
            {canvas.widgets.map((widget) => <article className="workspace-widget-preview" key={widget.id} style={{
              gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
              gridRow: `${widget.position.y + 1} / span ${widget.position.h}`
            }}>
                <span>{widget.kind}</span>
                <strong>{widget.title}</strong>
              </article>)}
          </div>
        </section>
      </section>

      <aside className="workspace-widget-panel" id="widgets" aria-label="Widget configuration">
        <div className="workspace-panel-title">
          <button type="button" aria-label="Close widget panel">x</button>
          <strong>New widget</strong>
        </div>
        <section>
          <p className="workspace-panel-label">Widget type</p>
          <div className="workspace-widget-types">
            {widgetTypes.map((widget) => <button type="button" key={widget.kind} onClick={() => addWidget(widget.kind)}>
                <span>{widget.icon}</span>
                {widget.label}
              </button>)}
          </div>
        </section>
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
      </aside>
    </main>;
}

export {
  WorkspaceBuilder as default
};
