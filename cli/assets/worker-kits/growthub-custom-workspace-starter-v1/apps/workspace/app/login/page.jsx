import { Suspense } from "react";
import { isGateEnabled } from "@/lib/auth.js";
import LoginForm from "./login-form.jsx";

export const metadata = {
  title: "Sign in — Growthub Workspace",
  description: "Environment-variable gated access to this workspace."
};

function LoginShell() {
  const gateOn = isGateEnabled();
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark">GH</span>
          <span>Growthub Workspace</span>
        </div>
        <h1>Sign in</h1>
        <p className="login-lead">
          {gateOn
            ? "This deployment requires credentials from server environment variables."
            : "Login gate is not configured. Set GROWTHUB_WORKSPACE_GATE_* env vars and restart the app."}
        </p>
        {gateOn ? (
          <Suspense fallback={<p className="login-lead">Loading…</p>}>
            <LoginForm />
          </Suspense>
        ) : null}
      </div>
    </main>
  );
}

export default LoginShell;
