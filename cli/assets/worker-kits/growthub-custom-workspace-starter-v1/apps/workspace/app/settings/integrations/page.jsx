import Link from "next/link";
import { Suspense } from "react";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { WorkspaceRail } from "../../workspace-rail.jsx";

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

function textColorForAccent(accent) {
  const hex = String(accent || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#252525" : "#ffffff";
}

async function IntegrationsSettingsPage() {
  const config = readAdapterConfig();
  const adapter = describeIntegrationAdapter();
  const workspaceConfig = await readWorkspaceConfig();
  const branding = workspaceConfig.branding || {};
  const workspaceName = branding.name || workspaceConfig.name || "Growthub Workspace";
  const grouped = groupIntegrationsByLane(await listGovernedWorkspaceIntegrations());
  const allRows = [...grouped.dataSources, ...grouped.workspaceIntegrations];

  return <main className="workspace-builder workspace-settings-page">
      <Suspense fallback={null}>
        <WorkspaceRail
          workspaceConfig={workspaceConfig}
          authority={adapter.authority}
          managementSlot={(
            <Link className="active" href="/settings/integrations">Integrations</Link>
          )}
        />
      </Suspense>

      <section className="workspace-surface">
        <header className="workspace-toolbar">
          <div>
            <p>Workspace settings</p>
            <h1>Integrations</h1>
          </div>
          <div className="workspace-toolbar-actions">
            <Link href="/api/settings/integrations">API contract</Link>
            <Link href="/settings/integrations/nango">Nango</Link>
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
