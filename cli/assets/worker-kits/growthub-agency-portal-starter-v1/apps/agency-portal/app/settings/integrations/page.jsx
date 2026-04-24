import { describeIntegrationAdapter, listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { portalCapabilities } from "@/lib/domain/portal";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import Link from "next/link";
const nav = [
  ...portalCapabilities.map((item) => ({ href: `/#${item.id}`, label: item.label })),
  { href: "/settings/integrations", label: "Integrations" }
];
async function IntegrationsSettingsPage() {
  const adapter = describeIntegrationAdapter();
  const grouped = groupIntegrationsByLane(await listAgencyPortalIntegrations());
  const allIntegrations = [...grouped.dataSources, ...grouped.workspaceIntegrations];
  const connectedCount = allIntegrations.filter((item) => item.isConnected).length;
  return <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">GH</span>
          <span>Agency Portal</span>
        </div>
        <nav className="nav">
          {nav.map((item) => <Link className={item.href === "/settings/integrations" ? "active" : ""} key={item.href} href={item.href}>
              {item.label}
            </Link>)}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          {connectedCount} connected
        </div>
      </aside>

      <section className="main">
        <div className="utility-bar">
          <div>
            <strong>Integration setup</strong>
            <span>Growthub bridge, BYO API keys, and Windsor data pipelines normalize into one worker-kit object model.</span>
          </div>
          <div className="utility-actions">
            <span className="pill">{adapter.authority}</span>
            <span className="pill">{adapter.source}</span>
          </div>
        </div>

        <div className="page-heading">
          <span className="eyebrow">Settings</span>
          <h1>Integrations</h1>
          <p>
            Configure the portal through the hosted Growthub auth bridge or through explicit bring-your-own credentials.
            Data pipeline objects stay separate from workspace integrations while sharing one normalized surface.
          </p>
          <span className="badge">{adapter.label}</span>
        </div>

        <section className="setup-grid" aria-label="Integration setup paths">
          <article className="setup-card">
            <span>01</span>
            <strong>Growthub Bridge</strong>
            <p>Uses the authenticated Growthub account to resolve already-connected MCP accounts for this portal.</p>
            <code>GROWTHUB_BRIDGE_ACCESS_TOKEN</code>
          </article>
          <article className="setup-card">
            <span>02</span>
            <strong>BYO API Key</strong>
            <p>Supports direct provider keys without binding the kit to a database, vendor, or hosted account.</p>
            <code>AGENCY_PORTAL_BYO_CONNECTIONS_JSON</code>
          </article>
          <article className="setup-card">
            <span>03</span>
            <strong>Windsor Data</strong>
            <p>First-class reporting pipeline for blended Meta, Shopify, GA4, and Google Sheets data sources.</p>
            <code>WINDSOR_API_KEY</code>
          </article>
        </section>

        <section className="integration-board">
          <div className="integration-toolbar">
            <div>
              <strong>Connection authority</strong>
              <p>{adapter.description}</p>
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
    </main>;
}
function IntegrationPanel({
  title,
  intro,
  items
}) {
  const connected = items.filter((item) => item.isConnected).length;
  return <article className="integration-section">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p className="panel-copy">{intro}</p>
        </div>
        <span className="badge">{connected}/{items.length} connected</span>
      </div>
      <div className="integration-list">
        {items.map((item) => <article className="integration-card" key={item.id}>
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
              {item.secretEnvName ? <span>{item.secretEnvName}</span> : null}
            </div>
          </article>)}
      </div>
    </article>;
}
export {
  IntegrationsSettingsPage as default
};
