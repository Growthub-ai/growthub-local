import workspaceConfig from "../growthub.config.json";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter } from "@/lib/adapters/integrations";
import Link from "next/link";

function Home() {
  const adapterConfig = readAdapterConfig();
  const integrationAdapter = describeIntegrationAdapter();
  const canvas = workspaceConfig.canvas;
  const dashboards = workspaceConfig.dashboards;
  const widgetTypes = workspaceConfig.widgetTypes;

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
            <h1>{workspaceConfig.name}</h1>
          </div>
          <div className="workspace-toolbar-actions">
            <button type="button">New Dashboard</button>
            <button type="button">Save</button>
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
            <button className="workspace-add-widget" type="button">
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
            {widgetTypes.map((widget) => <button type="button" key={widget.kind}>
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
  Home as default
};
