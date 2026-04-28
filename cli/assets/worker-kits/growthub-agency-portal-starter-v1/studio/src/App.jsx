import React from "react";
import { agencyPortalIntegrationCatalog, groupIntegrationsByLane } from "../../apps/agency-portal/lib/domain/integrations.js";
import { portalCapabilities } from "../../apps/agency-portal/lib/domain/portal.js";

const grouped = groupIntegrationsByLane(agencyPortalIntegrationCatalog);
const integrations = [...grouped.dataSources, ...grouped.workspaceIntegrations];
const adapters = [
  ["Persistence", "Provider-managed", "Postgres, Qstash KV, or provider-managed adapter boundary."],
  ["Auth", "Provider-managed", "OIDC, Clerk, Auth.js, or provider-managed auth selector."],
  ["Payments", "None", "Stripe, Polar, or disabled payment adapter selector."],
  ["Integrations", `${integrations.filter((item) => item.isConnected).length}/${integrations.length} connected`, "Growthub MCP bridge, BYO API tokens, and Windsor data pipelines."],
];
const quickActions = [
  ...portalCapabilities.slice(0, 4).map((item) => ({ href: `#${item.id}`, label: item.label })),
  { href: "#integrations", label: "Integrations" },
];

export default function App() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">GH</span>
          <span>Agency Portal</span>
        </div>
        <nav className="nav">
          {portalCapabilities.map((capability) => (
            <a key={capability.id} href={`#${capability.id}`}>{capability.label}</a>
          ))}
          <a href="#integrations">Integrations</a>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Local Vite shell
        </div>
      </aside>

      <section className="main">
        <div className="utility-bar">
          <div>
            <strong>Growthub Agency Portal Starter</strong>
            <span>Local-first Vite shell with Vercel app parity and governed worker-kit primitives.</span>
          </div>
          <div className="utility-actions">
            <a href="#integrations">Open integrations</a>
            <span className="pill">deploy: local-preview</span>
          </div>
        </div>

        <header className="page-heading">
          <span className="eyebrow">Agency operating system</span>
          <h1>Client work, reporting, and integrations in one governed shell.</h1>
          <p>
            The local shell previews the same capability and integration objects that the deployable portal exposes.
          </p>
        </header>

        <section className="hero-grid">
          <article className="hero-card primary">
            <span>Runtime adapters</span>
            <strong>provider-managed</strong>
            <p>Persistence, auth, and payment selectors stay replaceable at runtime.</p>
          </article>
          <article className="hero-card">
            <span>MCP connections</span>
            <strong>{integrations.filter((item) => item.isConnected).length}/{integrations.length}</strong>
            <p>Bridge, BYO, and catalog rows normalize into one integration object model.</p>
          </article>
          <article className="hero-card">
            <span>Windsor data</span>
            <strong>{grouped.dataSources.filter((item) => item.isConnected).length}/{grouped.dataSources.length}</strong>
            <p>Data pipeline readiness comes from integration state, not seeded reporting metrics.</p>
          </article>
        </section>

        <section className="ops-strip">
          <article>
            <span>01</span>
            <strong>Local Vite</strong>
            <p>Fast local UI loop for the bundled starter.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Vercel app</strong>
            <p>Serverless app route parity for cloud deploy.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Growthub bridge</strong>
            <p>Optional hosted authority for MCP accounts.</p>
          </article>
          <article>
            <span>04</span>
            <strong>BYO keys</strong>
            <p>Explicit credential setup stays composable.</p>
          </article>
        </section>

        <section className="grid">
          {portalCapabilities.map((capability) => (
            <article className="card" id={capability.id} key={capability.id}>
              <span>{capability.metric}</span>
              <h3>{capability.label}</h3>
              <p>{capability.description}</p>
            </article>
          ))}
        </section>

        <section className="adapter">
          {adapters.map(([title, value, body]) => (
            <article className="card" key={title}>
              <h3>{title}</h3>
              <p><strong>{value}</strong></p>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <section className="setup-grid" id="integrations" aria-label="Integration setup paths">
          <article>
            <span>Growthub Bridge</span>
            <strong>MCP account authority</strong>
            <p>Use hosted Growthub auth to resolve the user account's available linked connections.</p>
          </article>
          <article>
            <span>BYO Credentials</span>
            <strong>Thin provider adapters</strong>
            <p>Accept explicit API tokens without coupling the kit to one data store or integration vendor.</p>
          </article>
          <article>
            <span>Windsor AI</span>
            <strong>Data pipeline object</strong>
            <p>Model Windsor, Google Sheets blends, GA4, Shopify, and Meta as reporting data sources.</p>
          </article>
        </section>

        <section className="results-panel">
          <div>
            <span className="eyebrow">Client results</span>
            <h2>Windsor AI is a first-class data source path.</h2>
            <p>
              The kit models Windsor alongside Growthub bridge and BYO tokens, so reporting can use
              blended Sheets pipelines without coupling the worker kit to one database or vendor.
            </p>
          </div>
          <div className="results-metrics">
            {grouped.dataSources.map((source) => (
              <div key={source.id}><strong>{source.label}</strong><span>{source.status}</span></div>
            ))}
          </div>
        </section>
      </section>

      <div className="quick-actions" aria-label="Quick actions">
        {quickActions.map((action) => <a key={action.href} href={action.href}>{action.label}</a>)}
      </div>
    </main>
  );
}
