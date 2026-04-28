import { describeAuthAdapter } from "@/lib/adapters/auth";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { describePaymentAdapter } from "@/lib/adapters/payments";
import { describePersistenceAdapter } from "@/lib/adapters/persistence";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { buildPortalWorkspace } from "@/lib/domain/portal";
import Link from "next/link";
async function Home() {
  const config = readAdapterConfig();
  const integrations = groupIntegrationsByLane(await listAgencyPortalIntegrations());
  const workspace = buildPortalWorkspace({
    config,
    integrations,
    adapters: {
      persistence: describePersistenceAdapter(),
      auth: describeAuthAdapter(),
      payments: describePaymentAdapter(),
      integrations: describeIntegrationAdapter()
    }
  });
  return <main className="shell">
      <PortalSidebar workspace={workspace} />
      <section className="main">
        <WorkspaceHeader workspace={workspace} />
        <PrimitiveGrid id="dashboard" items={workspace.summary} variant="summary" />
        <PrimitiveGrid items={workspace.adapters} variant="adapter" />
        <CapabilityBoard capabilities={workspace.capabilities} />
        <ContractPanel api={workspace.api} />
      </section>
      <aside className="quick-actions" aria-label="Quick actions">
        {workspace.actions.map((action) => <Link href={action.href} key={action.href}>
            <span>{action.label}</span>
            <code>{action.objectType}</code>
          </Link>)}
      </aside>
    </main>;
}
function PortalSidebar({ workspace }) {
  return <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">{workspace.identity.mark}</span>
        <span>{workspace.identity.label}</span>
      </div>
      <nav className="nav">
        {workspace.navigation.map((item, index) => <Link className={index === 0 ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>
      <div className="sidebar-footer">
        <span className="status-dot" />
        {workspace.identity.mode}
      </div>
    </aside>;
}
function WorkspaceHeader({ workspace }) {
  return <header className="workspace-header">
      <div className="utility-bar">
        <div>
          <strong>{workspace.identity.mode}</strong>
          <span>{workspace.capabilities.length} capability primitives: {workspace.identity.primitiveContract}.</span>
        </div>
        <div className="utility-actions">
          {workspace.api.map((item) => <Link href={item.href} key={item.href}>{item.method} {item.href}</Link>)}
          <span className="pill">deploy: {workspace.identity.deployTarget}</span>
        </div>
      </div>
      <div className="page-heading">
        <p className="eyebrow">{workspace.identity.mode}</p>
        <h1>{workspace.identity.label}</h1>
        <p>{workspace.identity.primitiveContract}</p>
      </div>
    </header>;
}
function PrimitiveGrid({ id, items, variant }) {
  return <section className={`primitive-grid ${variant}`} id={id} aria-label={variant}>
      {items.map((item) => <PrimitiveCard item={item} key={item.id} />)}
    </section>;
}
function PrimitiveCard({ item }) {
  return <article className="primitive-card">
      <div className="primitive-card-top">
        <p className="card-label">{item.label}</p>
        <span className={`status ${item.status}`}>{item.status}</span>
      </div>
      <strong>{item.value}</strong>
      <div className="primitive-meta">
        <span>{item.source}</span>
        {item.env.map((key) => <code key={key}>{key}</code>)}
      </div>
    </article>;
}
function CapabilityBoard({ capabilities }) {
  return <section className="capability-board" aria-label="Capability primitives">
      {capabilities.map((capability) => <CapabilityPrimitive capability={capability} key={capability.id} />)}
    </section>;
}
function CapabilityPrimitive({ capability }) {
  return <article className="capability-primitive" id={capability.id}>
      <div className="capability-heading">
        <div>
          <p className="eyebrow">{capability.objectType}</p>
          <h2>{capability.label}</h2>
        </div>
        <span className={`status ${capability.status}`}>{capability.status}</span>
      </div>
      <div className="binding-list">
        {capability.bindings.map((binding) => <div className="binding-row" key={binding.id}>
            <span>{binding.label}</span>
            <strong>{binding.value}</strong>
            <code>{binding.source}</code>
          </div>)}
      </div>
      <div className="primitive-columns">
        <PrimitiveStack label="Objects" items={capability.objects.map((item) => ({
    id: item.id,
    label: item.label,
    meta: `${item.fields.length} fields`
  }))} />
        <PrimitiveStack label="Views" items={capability.views.map((view) => ({
    id: view,
    label: view,
    meta: "view"
  }))} />
        <PrimitiveStack label="Widgets" items={capability.widgets.map((widget) => ({
    id: widget.id,
    label: widget.id,
    meta: `${widget.chart} / ${widget.sourceObject}`
  }))} />
      </div>
      <div className="field-cloud">
        {capability.objects.flatMap((item) => item.fields.map((field) => <code key={`${item.id}-${field.name}`}>{field.name}:{field.type}</code>))}
      </div>
      {capability.integrations.length ? <div className="integration-bindings">
          {capability.integrations.map((item) => <span key={item.id}>
              {item.label}
              <code>{item.status}</code>
            </span>)}
        </div> : null}
    </article>;
}
function PrimitiveStack({ label, items }) {
  return <section className="primitive-stack">
      <span>{label}</span>
      {items.map((item) => <div key={item.id}>
          <strong>{item.label}</strong>
          <code>{item.meta}</code>
        </div>)}
    </section>;
}
function ContractPanel({ api }) {
  return <section className="contract-panel" id="operations">
      {api.map((item) => <Link href={item.href} key={item.href}>
          <span>{item.label}</span>
          <code>{item.method} {item.href}</code>
        </Link>)}
    </section>;
}
export {
  Home as default
};
