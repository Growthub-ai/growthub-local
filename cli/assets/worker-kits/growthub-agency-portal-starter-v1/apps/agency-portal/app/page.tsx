import { describeAuthAdapter } from "@/lib/adapters/auth";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describePaymentAdapter } from "@/lib/adapters/payments";
import { describePersistenceAdapter } from "@/lib/adapters/persistence";
import { portalCapabilities } from "@/lib/domain/portal";
import Link from "next/link";

const nav = portalCapabilities.map((item) => item.label);

export default function Home() {
  const config = readAdapterConfig();
  const persistence = describePersistenceAdapter();
  const auth = describeAuthAdapter();
  const payments = describePaymentAdapter();

  return (
    <main className="shell">
      <aside className="sidebar">
        <h1>Agency Portal</h1>
        <nav className="nav">
          <Link href="/settings/integrations">Integrations</Link>
          {nav.map((item) => (
            <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`}>{item}</a>
          ))}
        </nav>
      </aside>
      <section className="main">
        <div className="toolbar">
          <div>
            <h2>Composable Agency Workspace</h2>
            <p>
              A Vercel-ready agency portal scaffold whose infrastructure is selected by thin
              adapter contracts, while Growthub Local keeps the governed Vite shell and fork
              primitives intact.
            </p>
          </div>
          <span className="badge">deploy: {config.deployTarget}</span>
        </div>

        <section className="grid">
          {portalCapabilities.map((capability) => (
            <article className="card" id={capability.id} key={capability.id}>
              <h3>{capability.label}</h3>
              <div className="metric">{capability.metric}</div>
              <p>{capability.description}</p>
            </article>
          ))}
        </section>

        <section className="adapter">
          <article className="card">
            <h3>Persistence</h3>
            <p><strong>{persistence.label}</strong></p>
            <p>Env: {persistence.requiredEnv.length ? persistence.requiredEnv.join(", ") : "provider-defined"}</p>
          </article>
          <article className="card">
            <h3>Auth</h3>
            <p><strong>{auth.id}</strong></p>
            <p>Env: {auth.requiredEnv.length ? auth.requiredEnv.join(", ") : "provider-defined"}</p>
          </article>
          <article className="card">
            <h3>Payments</h3>
            <p><strong>{payments.id}</strong></p>
            <p>{payments.enabled ? "enabled" : "disabled"}</p>
          </article>
          <article className="card">
            <h3>API</h3>
            <p><code>GET /api/workspace</code></p>
            <p>Returns adapter and capability metadata for agents and operators.</p>
          </article>
        </section>
      </section>
    </main>
  );
}
