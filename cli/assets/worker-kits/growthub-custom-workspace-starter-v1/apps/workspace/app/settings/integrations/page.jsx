import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { buildPortalWorkspace } from "@/lib/domain/portal";
import { describeAuthAdapter } from "@/lib/adapters/auth";
import { describePaymentAdapter } from "@/lib/adapters/payments";
import { describePersistenceAdapter } from "@/lib/adapters/persistence";
import Link from "next/link";
async function IntegrationsSettingsPage() {
  const config = readAdapterConfig();
  const adapter = describeIntegrationAdapter();
  const grouped = groupIntegrationsByLane(await listAgencyPortalIntegrations());
  const workspace = buildPortalWorkspace({
    config,
    integrations: grouped,
    adapters: {
      persistence: describePersistenceAdapter(),
      auth: describeAuthAdapter(),
      payments: describePaymentAdapter(),
      integrations: adapter
    }
  });
  const rows = [
    ...grouped.dataSources.map((item) => ({ ...item, primitiveGroup: "data-source" })),
    ...grouped.workspaceIntegrations.map((item) => ({ ...item, primitiveGroup: "workspace-integration" }))
  ];
  return <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{workspace.identity.mark}</span>
          <span>{workspace.identity.label}</span>
        </div>
        <nav className="nav">
          {workspace.navigation.map((item) => <Link className={item.href === "/settings/integrations" ? "active" : ""} key={item.href} href={item.href.startsWith("#") ? `/${item.href}` : item.href}>
              {item.label}
            </Link>)}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          {adapter.authority}
        </div>
      </aside>
      <section className="main">
        <div className="utility-bar">
          <div>
            <strong>{adapter.label}</strong>
            <span>{workspace.identity.primitiveContract}</span>
          </div>
          <div className="utility-actions">
            <span className="pill">{adapter.id}</span>
            <span className="pill">{adapter.authority}</span>
          </div>
        </div>
        <section className="primitive-grid summary" aria-label="Integration adapter primitives">
          <article className="primitive-card">
            <div className="primitive-card-top">
              <p className="card-label">Authority</p>
              <span className="status runtime-derived">{adapter.authority}</span>
            </div>
            <strong>{adapter.id}</strong>
            <div className="primitive-meta">
              {adapter.requiredEnv.map((key) => <code key={key}>{key}</code>)}
            </div>
          </article>
          <article className="primitive-card">
            <div className="primitive-card-top">
              <p className="card-label">Data-source primitives</p>
              <span className="status runtime-derived">{grouped.dataSources.length}</span>
            </div>
            <strong>{grouped.dataSources.filter((item) => item.isConnected).length}/{grouped.dataSources.length}</strong>
            <div className="primitive-meta"><span>{config.reportingAdapter || "reporting-adapter"}</span></div>
          </article>
          <article className="primitive-card">
            <div className="primitive-card-top">
              <p className="card-label">Workspace primitives</p>
              <span className="status runtime-derived">{grouped.workspaceIntegrations.length}</span>
            </div>
            <strong>{grouped.workspaceIntegrations.filter((item) => item.isConnected).length}/{grouped.workspaceIntegrations.length}</strong>
            <div className="primitive-meta"><span>{config.integrationAdapter}</span></div>
          </article>
        </section>
        <section className="integration-board">
          {rows.map((item) => <article className="integration-card" key={item.id}>
              <div className="integration-card-top">
                <div className="provider-mark">{item.icon || item.label.slice(0, 1)}</div>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.provider} / {item.objectType} / {item.primitiveGroup}</p>
                </div>
                <span className={`status ${item.status}`}>{item.status}</span>
              </div>
              <div className="integration-card-meta">
                <span>{item.authPath}</span>
                <span>{item.setupMode}</span>
                <span>{item.authType}</span>
                {item.secretEnvName ? <span>{item.secretEnvName}</span> : null}
              </div>
            </article>)}
        </section>
      </section>
    </main>;
}
export {
  IntegrationsSettingsPage as default
};
