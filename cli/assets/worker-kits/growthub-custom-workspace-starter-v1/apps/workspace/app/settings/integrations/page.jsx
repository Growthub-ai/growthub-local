import Link from "next/link";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";

function countConnected(rows) {
  return rows.filter((item) => item.isConnected || item.status === "connected").length;
}

function integrationKey(item, lane, index) {
  return [
    lane,
	    item.provider,
	    item.id,
	    item.connectionId,
    index
  ].filter(Boolean).join(":");
}

function IntegrationRow({ item }) {
  return <article className="workspace-integration-row">
      <div className="workspace-provider-mark">{item.icon || item.label.slice(0, 1)}</div>
      <div className="workspace-integration-main">
        <strong>{item.label}</strong>
        <p>{item.description}</p>
        <div className="workspace-integration-meta">
          <span>{item.provider}</span>
          <span>{item.objectType}</span>
          <span>{item.authPath}</span>
          <span>{item.setupMode}</span>
          <span>{item.authType}</span>
          {item.secretEnvName ? <span>{item.secretEnvName}</span> : null}
        </div>
      </div>
      <span className={`workspace-integration-status ${item.status}`}>{item.status}</span>
    </article>;
}

async function IntegrationsSettingsPage() {
  const config = readAdapterConfig();
  const adapter = describeIntegrationAdapter();
  const grouped = groupIntegrationsByLane(await listGovernedWorkspaceIntegrations());
  const allRows = [...grouped.dataSources, ...grouped.workspaceIntegrations];

  return <main className="workspace-builder workspace-settings-page">
      <aside className="workspace-rail" aria-label="Workspace navigation">
        <div className="workspace-brand">
          <span className="workspace-mark">G</span>
          <span>Growthub Workspace</span>
        </div>
        <nav className="workspace-nav">
          <Link href="/">Dashboards</Link>
          <Link href="/data-model">Data Model</Link>
          <Link className="active" href="/settings/integrations">Integrations</Link>
          <span className="workspace-nav-static">Workspace Settings</span>
          <span className="workspace-nav-static">Management</span>
        </nav>
        <div className="workspace-rail-status">
          <span className="status-dot" />
          {adapter.authority}
        </div>
      </aside>

      <section className="workspace-surface">
        <header className="workspace-toolbar">
          <div>
            <p>Workspace settings</p>
            <h1>Integrations</h1>
          </div>
          <div className="workspace-toolbar-actions">
            <Link href="/api/settings/integrations">API contract</Link>
            <span>{adapter.id}</span>
            <span>{adapter.authority}</span>
          </div>
        </header>

        <section className="workspace-integration-summary" aria-label="Integration adapter summary">
          <article>
            <span>Adapter</span>
            <strong>{adapter.label}</strong>
            <div>
              {adapter.requiredEnv.length
                ? adapter.requiredEnv.map((key) => <code key={key}>{key}</code>)
                : <code>local catalog</code>}
            </div>
          </article>
          <article>
            <span>Data sources</span>
            <strong>{countConnected(grouped.dataSources)}/{grouped.dataSources.length}</strong>
            <div><code>{config.reportingAdapter || "reporting-adapter"}</code></div>
          </article>
          <article>
            <span>Workspace tools</span>
            <strong>{countConnected(grouped.workspaceIntegrations)}/{grouped.workspaceIntegrations.length}</strong>
            <div><code>{config.integrationAdapter}</code></div>
          </article>
        </section>

        <section className="workspace-integration-toolbar">
          <div>
            <strong>Connection catalog</strong>
            <p>{countConnected(allRows)}/{allRows.length} connected. Setup state is resolved from the selected adapter without storing source credentials in the app.</p>
          </div>
        </section>

        <section className="workspace-integration-board">
          <section className="workspace-integration-section">
            <div className="workspace-integration-section-heading">
              <div>
                <h2>Data Sources</h2>
                <p>Reporting and blended-data providers available to dashboard widgets.</p>
              </div>
              <span>{countConnected(grouped.dataSources)}/{grouped.dataSources.length}</span>
            </div>
            <div className="workspace-integration-list">
              {grouped.dataSources.map((item, index) => <IntegrationRow item={item} key={integrationKey(item, "data-source", index)} />)}
            </div>
          </section>

          <section className="workspace-integration-section">
            <div className="workspace-integration-section-heading">
              <div>
                <h2>Workspace Tools</h2>
                <p>Account-level tool connections available to governed workspace workflows.</p>
              </div>
              <span>{countConnected(grouped.workspaceIntegrations)}/{grouped.workspaceIntegrations.length}</span>
            </div>
            <div className="workspace-integration-list">
              {grouped.workspaceIntegrations.map((item, index) => <IntegrationRow item={item} key={integrationKey(item, "workspace-integration", index)} />)}
            </div>
          </section>
        </section>
      </section>
    </main>;
}

export {
  IntegrationsSettingsPage as default
};
