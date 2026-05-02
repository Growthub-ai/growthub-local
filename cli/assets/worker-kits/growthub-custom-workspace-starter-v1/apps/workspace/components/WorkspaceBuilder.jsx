"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import WorkspaceGrid from "./WorkspaceGrid";
import WidgetPalette from "./WidgetPalette";
import DeployChecklistPanel from "./DeployChecklistPanel";
import OnboardingWizard from "./OnboardingWizard";

const DEFAULT_POSITION = { x: 0, y: 0, w: 4, h: 3 };

function generateWidgetId() {
  return `widget_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function defaultTitleFor(kind) {
  switch (kind) {
    case "chart": return "Untitled chart";
    case "view": return "Untitled view";
    case "iframe": return "Embedded view";
    case "rich-text": return "Note";
    case "chat-session": return "Bound agent";
    case "workflow-runner": return "Workflow runner";
    case "artifact-viewer": return "Outputs";
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
  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      let collides = false;
      for (let dx = 0; dx < DEFAULT_POSITION.w && !collides; dx += 1) {
        for (let dy = 0; dy < DEFAULT_POSITION.h && !collides; dy += 1) {
          if (occupied.has(`${x + dx}:${y + dy}`)) collides = true;
        }
      }
      if (!collides) return { ...DEFAULT_POSITION, x, y };
    }
  }
  return DEFAULT_POSITION;
}

function WorkspaceBuilder({ initialConfig, integrationAdapter, persistence }) {
  const [config, setConfig] = useState(initialConfig);
  const [savedConfig, setSavedConfig] = useState(initialConfig);
  const [saveState, setSaveState] = useState({ status: "idle" });
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const [showDeploy, setShowDeploy] = useState(false);
  const [showWizard, setShowWizard] = useState(() => !initialConfig.onboarding?.completed);

  const widgets = config.canvas?.widgets || [];
  const dirty = useMemo(() => JSON.stringify(savedConfig) !== JSON.stringify(config), [savedConfig, config]);

  const updateCanvas = useCallback((mutator) => {
    setConfig((prev) => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        ...mutator(prev.canvas)
      }
    }));
  }, []);

  const handleAddWidget = useCallback((kind) => {
    setConfig((prev) => {
      const nextWidgets = [...(prev.canvas?.widgets || [])];
      const widget = {
        id: generateWidgetId(),
        kind,
        title: defaultTitleFor(kind),
        position: findFreePosition(nextWidgets),
        config: {}
      };
      nextWidgets.push(widget);
      setSelectedWidgetId(widget.id);
      return {
        ...prev,
        canvas: { ...prev.canvas, widgets: nextWidgets }
      };
    });
  }, []);

  const handleRemoveWidget = useCallback((widgetId) => {
    updateCanvas((canvas) => ({
      widgets: (canvas.widgets || []).filter((widget) => widget.id !== widgetId)
    }));
    setSelectedWidgetId((prev) => (prev === widgetId ? null : prev));
  }, [updateCanvas]);

  const handleMove = useCallback((widgetId, position) => {
    updateCanvas((canvas) => ({
      widgets: (canvas.widgets || []).map((widget) =>
        widget.id === widgetId
          ? { ...widget, position: { ...widget.position, ...position } }
          : widget
      )
    }));
  }, [updateCanvas]);

  const handleResize = useCallback((widgetId, size) => {
    updateCanvas((canvas) => ({
      widgets: (canvas.widgets || []).map((widget) =>
        widget.id === widgetId
          ? { ...widget, position: { ...widget.position, ...size } }
          : widget
      )
    }));
  }, [updateCanvas]);

  const handleNewDashboard = useCallback(() => {
    setConfig((prev) => {
      const id = `dashboard_${Math.random().toString(36).slice(2, 8)}`;
      return {
        ...prev,
        dashboards: [
          ...(prev.dashboards || []),
          {
            id,
            name: "Untitled",
            createdBy: "Workspace owner",
            updatedAt: "new",
            status: "draft"
          }
        ]
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaveState({ status: "saving" });
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dashboards: config.dashboards,
          widgetTypes: config.widgetTypes,
          canvas: config.canvas,
          onboarding: config.onboarding
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setSaveState({ status: "error", message: payload.error, guidance: payload.guidance });
        return;
      }
      setSavedConfig(payload.workspaceConfig);
      setConfig(payload.workspaceConfig);
      setSaveState({ status: "ok", at: new Date().toISOString() });
    } catch (error) {
      setSaveState({ status: "error", message: error.message });
    }
  }, [config]);

  const handleWizardComplete = useCallback((wizardState) => {
    setConfig((prev) => ({
      ...prev,
      onboarding: { completed: true, ...wizardState }
    }));
    setShowWizard(false);
  }, []);

  return (
    <main className="workspace-builder">
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
          <button type="button" className="workspace-nav-button" onClick={() => setShowDeploy(true)}>
            Deploy
          </button>
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
            <h1>{config.name || "Workspace Builder"}</h1>
          </div>
          <div className="workspace-toolbar-actions">
            {dirty ? <span className="workspace-dirty-flag">unsaved</span> : null}
            {saveState.status === "ok" ? <span className="workspace-save-flag">saved</span> : null}
            {saveState.status === "error" ? (
              <span className="workspace-save-flag error" title={saveState.guidance || saveState.message}>
                {saveState.message || "save failed"}
              </span>
            ) : null}
            <button type="button" onClick={handleNewDashboard}>New Dashboard</button>
            <button type="button" onClick={handleSave} disabled={saveState.status === "saving"}>
              {saveState.status === "saving" ? "Saving..." : "Save"}
            </button>
          </div>
        </header>

        <section className="workspace-table" id="dashboards" aria-label="Dashboards">
          <div className="workspace-table-heading">
            <strong>Dashboards</strong>
            <span>{(config.dashboards || []).length} template</span>
          </div>
          <div className="workspace-table-row workspace-table-head">
            <span>Title</span>
            <span>Created by</span>
            <span>Last update</span>
            <span>Status</span>
          </div>
          {(config.dashboards || []).map((dashboard) => (
            <div className="workspace-table-row" key={dashboard.id}>
              <span>{dashboard.name}</span>
              <span>{dashboard.createdBy}</span>
              <span>{dashboard.updatedAt}</span>
              <code>{dashboard.status}</code>
            </div>
          ))}
        </section>

        <section className="workspace-canvas" id="canvas" aria-label="Composable dashboard canvas">
          <div className="workspace-tabs">
            <button className="active" type="button">{config.canvas?.name || "Tab 1"}</button>
            <button type="button">New Tab</button>
          </div>
          <WorkspaceGrid
            canvas={config.canvas}
            widgets={widgets}
            selectedWidgetId={selectedWidgetId}
            onSelectWidget={setSelectedWidgetId}
            onAddWidgetClick={() => handleAddWidget("chart")}
            onMove={handleMove}
            onResize={handleResize}
            onRemoveWidget={handleRemoveWidget}
          />
          {persistence?.mode === "read-only" ? (
            <p className="workspace-persistence-warning">
              Persistence is read-only on this runtime. {persistence.reason}
            </p>
          ) : null}
        </section>
      </section>

      <WidgetPalette
        widgetTypes={config.widgetTypes || []}
        bindings={config.canvas?.bindings}
        integrationAdapter={integrationAdapter.id}
        onAddWidget={handleAddWidget}
      />

      {showDeploy ? <DeployChecklistPanel onClose={() => setShowDeploy(false)} /> : null}
      {showWizard ? (
        <OnboardingWizard
          initialState={config.onboarding}
          widgetTypes={config.widgetTypes || []}
          onSkip={() => setShowWizard(false)}
          onComplete={handleWizardComplete}
          onAddWidget={handleAddWidget}
        />
      ) : null}
    </main>
  );
}

export default WorkspaceBuilder;
