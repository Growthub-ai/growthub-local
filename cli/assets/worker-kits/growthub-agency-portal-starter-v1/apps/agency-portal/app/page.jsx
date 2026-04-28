import { describeAuthAdapter } from "@/lib/adapters/auth";
import { readAdapterConfig } from "@/lib/adapters/env";
import { listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { describePaymentAdapter } from "@/lib/adapters/payments";
import { describePersistenceAdapter } from "@/lib/adapters/persistence";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { portalCapabilities } from "@/lib/domain/portal";
import Link from "next/link";
const nav = [
  ...portalCapabilities.map((item) => ({ href: `#${item.id}`, label: item.label })),
  { href: "/settings/integrations", label: "Integrations" }
];
async function Home() {
  const config = readAdapterConfig();
  const persistence = describePersistenceAdapter();
  const auth = describeAuthAdapter();
  const payments = describePaymentAdapter();
  const grouped = groupIntegrationsByLane(await listAgencyPortalIntegrations());
  const integrations = [...grouped.dataSources, ...grouped.workspaceIntegrations];
  const connectedIntegrations = integrations.filter((item) => item.isConnected);
  const connectedDataSources = grouped.dataSources.filter((item) => item.isConnected);
  const quickActions = [
    ...portalCapabilities.slice(0, 4).map((item) => ({ href: `#${item.id}`, label: item.label })),
    { href: "/settings/integrations", label: "Integrations" }
  ];
  return <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">GH</span>
          <span>Agency Portal</span>
        </div>
        <nav className="nav">
          {nav.map((item, index) => <Link className={index === 0 ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Governed worker kit
        </div>
      </aside>

      <section className="main">
        <div className="utility-bar">
          <div>
            <strong>Production workspace</strong>
            <span>Local customization, Vercel deployment, bridge-ready integrations.</span>
          </div>
          <div className="utility-actions">
            <Link href="/settings/integrations">Integrations</Link>
            <span className="pill">deploy: {config.deployTarget}</span>
          </div>
        </div>

        <div className="page-heading">
          <div>
            <p className="eyebrow">Growthub Local + Vercel</p>
            <h1>Composable Agency Workspace</h1>
            <p>
              A production starter for agency portals with local-first Vite operation, Vercel
              deployment, thin adapter contracts, Windsor data pipelines, and Growthub MCP
              connection authority.
            </p>
          </div>
          <span className="badge">deploy: {config.deployTarget}</span>
        </div>

        <section className="hero-grid" id="dashboard">
          <article className="hero-card wide">
            <p className="card-label">Runtime adapters</p>
            <strong>{config.dataAdapter} / {config.authAdapter}</strong>
            <p className="muted">Persistence, auth, payment, reporting, and deploy state come from runtime adapter selectors.</p>
          </article>
          <article className="hero-card">
            <p className="card-label">MCP Connections</p>
            <strong>{connectedIntegrations.length}/{integrations.length}</strong>
            <p className="muted">{config.integrationAdapter} normalizes bridge, BYO, and catalog rows into one object model.</p>
          </article>
          <article className="hero-card">
            <p className="card-label">Client Results</p>
            <strong>{config.dataSources.hasWindsorApiKey ? "Windsor key set" : `${connectedDataSources.length}/${grouped.dataSources.length}`}</strong>
            <p className="muted">Reporting readiness is derived from data-source integrations and the Windsor overlay.</p>
          </article>
        </section>

        <section className="ops-strip" aria-label="Setup paths">
          <article>
            <span>01</span>
            <strong>Local Vite shell</strong>
            <p>Use the same portal frame for agent-led local customization.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Vercel app</strong>
            <p>Deploy the Next app without binding persistence to a single provider.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Growthub bridge</strong>
            <p>Resolve hosted MCP accounts when the user connects Growthub authority.</p>
          </article>
          <article>
            <span>04</span>
            <strong>BYO keys</strong>
            <p>Support Windsor and external provider keys through the same object contract.</p>
          </article>
        </section>

        <section className="grid compact-grid">
          {portalCapabilities.map((capability) => <article className="card" id={capability.id} key={capability.id}>
              <h3>{capability.label}</h3>
              <div className="metric">{capability.metric}</div>
              <p>{capability.description}</p>
            </article>)}
        </section>

        <section className="adapter" aria-label="Adapter contracts">
          <article className="card">
            <h3>Persistence</h3>
            <p><strong>{persistence.label}</strong></p>
            <p>Postgres, Qstash KV, or provider-managed.</p>
          </article>
          <article className="card">
            <h3>Auth</h3>
            <p><strong>{auth.id}</strong></p>
            <p>{auth.requiredEnv.length ? auth.requiredEnv.join(", ") : "provider-defined"}</p>
          </article>
          <article className="card">
            <h3>Payments</h3>
            <p><strong>{payments.id}</strong></p>
            <p>{payments.enabled ? "enabled" : "disabled"}</p>
          </article>
          <article className="card">
            <h3>Integrations</h3>
            <p><strong>{connectedIntegrations.length}/{integrations.length} connected</strong></p>
            <p><Link href="/settings/integrations">Open setup surface</Link></p>
          </article>
          <article className="card">
            <h3>Worker API</h3>
            <p><code>GET /api/workspace</code></p>
            <p>Adapter and capability metadata for agents.</p>
          </article>
        </section>

        <section className="results-panel" id="client-results">
          <div>
            <p className="eyebrow">Client Results</p>
            <h2>Reporting state comes from data-source integrations</h2>
            <p>
              Windsor is a data pipeline object, not a database choice. Google Sheets blended exports,
              GA4, Shopify, and Meta stay composable through the normalized integrations surface.
            </p>
          </div>
          <div className="results-metrics">
            {grouped.dataSources.map((source) => <span key={source.id}>{source.label}: {source.status}</span>)}
          </div>
        </section>
      </section>

      <aside className="quick-actions" aria-label="Quick actions">
        {quickActions.map((action) => <Link href={action.href} key={action.href}>{action.label}</Link>)}
      </aside>
    </main>;
}
export {
  Home as default
};
