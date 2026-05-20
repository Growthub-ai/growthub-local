import { Suspense } from "react";
import { isAuthGateEnabled, readAuthGateConfig } from "@/lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

function LoginShell() {
  const gate = readAuthGateConfig();
  return (
    <main className="workspace-login-page">
      <section className="workspace-login-card">
        <p className="workspace-login-eyebrow">Growthub Workspace</p>
        <h1>Sign in</h1>
        <p className="workspace-login-copy">
          This deployment uses an environment-variable auth gate. Credentials are checked server-side only.
        </p>
        {!gate.enabled ? (
          <p className="workspace-login-error" role="status">
            Auth gate is not enabled. Set <code>GROWTHUB_WORKSPACE_AUTH_GATE=enabled</code> and gate credentials in your environment.
          </p>
        ) : (
          <LoginForm />
        )}
      </section>
    </main>
  );
}

export default function LoginPage() {
  if (!isAuthGateEnabled()) {
    return <LoginShell />;
  }
  return (
    <Suspense fallback={<main className="workspace-login-page"><p>Loading…</p></main>}>
      <LoginShell />
    </Suspense>
  );
}
