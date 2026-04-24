import { describeIntegrationAdapter, listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { portalCapabilities } from "@/lib/domain/portal";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import Link from "next/link";

const nav = portalCapabilities.map((item) => item.label);

export default async function IntegrationsSettingsPage() {
  const adapter = describeIntegrationAdapter();
  const grouped = groupIntegrationsByLane(await listAgencyPortalIntegrations());

  return (
    <main className="shell">
      <aside className="sidebar">
        <h1>Agency Portal</h1>
        <nav className="nav">
          <Link className="active" href="/settings/integrations">Integrations</Link>
          {nav.map((item) => (
            <Link key={item} href={`/#${item.toLowerCase().replaceAll(" ", "-")}`}>{item}</Link>
          ))}
        </nav>
      </aside>

      <section className="main">
        <div className="toolbar">
          <div>
            <h2>Integrations</h2>
            <p>
              Unified account connections modeled after the Growthub GH app integration primitive:
              catalog metadata, user connection state, provider identity, and normalized setup path.
            </p>
          </div>
          <span className="badge">{adapter.label}</span>
        </div>

        <section className="integration-board">
          <div className="integration-toolbar">
            <div>
              <strong>Connection authority</strong>
              <p>Growthub bridge, static catalog, and BYO API key setup normalize into one object shape.</p>
            </div>
            <code>GET /api/settings/integrations</code>
          </div>

          <IntegrationPanel
            title="Data pipeline objects"
            intro="Meta, Shopify, GA4, Windsor AI, and Google Sheets blended data feed reporting and analytics workflows."
            items={grouped.dataSources}
          />
          <IntegrationPanel
            title="MCP connection integrations"
            intro="Asana, Slack, GHL, Google Drive, and Notion are operational integrations resolved through MCP connection authority or explicit BYO setup."
            items={grouped.workspaceIntegrations}
          />
        </section>
      </section>
    </main>
  );
}

function IntegrationPanel({
  title,
  intro,
  items,
}: {
  title: string;
  intro: string;
  items: Awaited<ReturnType<typeof listAgencyPortalIntegrations>>;
}) {
  return (
    <article className="integration-section">
      <h2>{title}</h2>
      <p className="panel-copy">{intro}</p>
      <div className="integration-list">
        {items.map((item) => (
          <article className="integration-card" key={item.id}>
            <div className="integration-card-top">
              <div className="provider-mark">{item.label.slice(0, 1)}</div>
              <div>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </div>
              <span className={`status ${item.status}`}>{item.status}</span>
            </div>
            <div className="integration-card-meta">
              <span>{item.provider}</span>
              <span>{item.objectType}</span>
              <span>{item.authPath}</span>
              <span>{item.setupMode}</span>
            </div>
          </article>
        ))}
      </div>
    </article>
  );
}
