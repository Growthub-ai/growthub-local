import React from "react";

const capabilities = [
  ["Dashboard", "Live agency snapshot", "Revenue, client health, overdue work, and next actions."],
  ["Clients", "Profiles and onboarding", "Client records, notes, KPIs, lifecycle state, and contacts."],
  ["Pipeline", "Opportunities", "Lead stages, potential value, won/lost state, and follow-up ownership."],
  ["Reports", "Performance reviews", "Ad and campaign reporting through pluggable reporting adapters."],
  ["Client Results", "Windsor reporting", "Blended Meta, Shopify, GA4, and Google Sheets-backed results."],
  ["Settings", "Workspace control", "Branding, adapter selections, deployment metadata, and user preferences."],
];

const adapters = [
  ["Persistence", "Postgres-compatible adapter boundary, not bound to one vendor."],
  ["Auth", "Local workspace auth or Growthub hosted bridge authority."],
  ["Payments", "Replaceable billing adapter for Stripe or explicit project needs."],
  ["Integrations", "Growthub MCP bridge, BYO API tokens, and Windsor data pipelines."],
];

const quickActions = ["Client onboarding", "Publish report", "Sync Windsor data", "Review open tasks"];

export default function App() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">GH</span>
          <span>Agency Portal</span>
        </div>
        <nav className="nav">
          {capabilities.map(([label]) => (
            <a key={label} href={`#${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</a>
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
            <span className="pill">worker kit v1</span>
          </div>
        </div>

        <header className="page-heading">
          <span className="eyebrow">Agency operating system</span>
          <h1>Client work, reporting, and integrations in one governed shell.</h1>
          <p>
            This starter keeps the copied prototype as product direction while the worker kit owns the
            composable adapter model, local Vite workflow, and clean Vercel deployment path.
          </p>
        </header>

        <section className="hero-grid">
          <article className="hero-card primary">
            <span>Monthly revenue</span>
            <strong>$84.2k</strong>
            <p>MRR, retainers, won pipeline, and invoice state are ready to bind to any supported database adapter.</p>
          </article>
          <article className="hero-card">
            <span>MCP connections</span>
            <strong>9 active</strong>
            <p>Growthub bridge connections can hydrate user-linked providers without hardcoded API sprawl.</p>
          </article>
          <article className="hero-card">
            <span>Windsor data</span>
            <strong>4 sources</strong>
            <p>Meta, Shopify, GA4, and Sheets-backed blended data are modeled as data pipeline objects.</p>
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
          {capabilities.map(([label, metric, description]) => (
            <article className="card" id={label.toLowerCase().replaceAll(" ", "-")} key={label}>
              <span>{metric}</span>
              <h3>{label}</h3>
              <p>{description}</p>
            </article>
          ))}
        </section>

        <section className="adapter">
          {adapters.map(([title, body]) => (
            <article className="card" key={title}>
              <h3>{title}</h3>
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
            <div><strong>Meta</strong><span>Ads and social source</span></div>
            <div><strong>Shopify</strong><span>Commerce source</span></div>
            <div><strong>GA4</strong><span>Analytics source</span></div>
          </div>
        </section>
      </section>

      <div className="quick-actions" aria-label="Quick actions">
        {quickActions.map((action) => <button key={action}>{action}</button>)}
      </div>
    </main>
  );
}
