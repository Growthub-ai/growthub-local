"use client";

/**
 * Sandbox Local Agent Auth Onboarding V1 — record sidecar panel.
 *
 * Rendered for any sandbox row using `adapter: local-agent-host` in local
 * locality. The panel is host-agnostic: per-host capabilities (whether a
 * documented login/logout subcommand exists, the label, the install hint)
 * come from `lib/sandbox-agent-host-catalog.js` via `getAgentHostCapabilities`.
 *
 * Mental model — identical for every host:
 *
 *   1. Check status         host CLI installed and authed?
 *   2. Run login            (only when the catalog declares loginCommand)
 *   3. Log out              (only when the catalog declares logoutCommand)
 *   4. Run sandbox          existing button (unchanged)
 *
 * Hosts without a documented login flow surface only step 1 and a notes
 * line directing the operator to sign in via the host CLI itself. There is
 * no second product surface, no terminal emulator — just a uniform
 * readiness bridge.
 *
 * The pill represents selected local host readiness. Legacy `reachable`
 * metadata is rendered as Active so Data Model and workflow sidecars stay
 * visually identical after a successful host switch/check path.
 */

import { useCallback, useState } from "react";
import { Bot, Code2, LogIn, LogOut, RefreshCw } from "lucide-react";
import { isSandboxLocalAgentHost } from "@/lib/sandbox-agent-auth-eligibility";
import { getAgentHostCapabilities } from "@/lib/sandbox-agent-host-catalog";

const STATUS_LABEL = {
  active: "Active",
  reachable: "Active",
  stale: "Stale",
  missing: "Missing",
  checking: "Checking",
  unknown: "Not checked"
};

function statusKind(status) {
  if (status === "active" || status === "reachable") return "ok";
  if (status === "stale") return "warn";
  if (status === "missing") return "bad";
  return "";
}

function AuthStatusPill({ status }) {
  const value = STATUS_LABEL[status] || "Unknown";
  const kind = statusKind(status);
  return (
    <span className={`dm-db-status ${kind}`} data-agent-auth-status={status || "unknown"}>
      <span />
      {value}
    </span>
  );
}

export function SandboxAgentAuthPanel({ objectId, rowName, draft, disabled, onPatchDraft }) {
  const [busy, setBusy] = useState(null); // "status" | "login" | "logout" | null
  const [output, setOutput] = useState(null);
  const [message, setMessage] = useState("");
  const [localAuthState, setLocalAuthState] = useState(null);

  const capabilities = getAgentHostCapabilities(draft);
  const providerMatchesHost = String(draft?.agentAuthProvider || "").trim() === String(draft?.agentHost || "").trim();
  const localMatchesHost =
    localAuthState?.provider &&
    String(localAuthState.provider || "").trim() === String(capabilities?.slug || "").trim();
  const currentStatus =
    localMatchesHost && typeof localAuthState?.status === "string" && localAuthState.status.trim()
      ? localAuthState.status.trim()
      : providerMatchesHost && typeof draft?.agentAuthStatus === "string" && draft.agentAuthStatus.trim()
        ? draft.agentAuthStatus.trim()
        : "unknown";
  const lastChecked = localMatchesHost && localAuthState?.checkedAt
    ? localAuthState.checkedAt
    : providerMatchesHost
      ? draft?.agentAuthLastChecked || ""
      : "";
  const lastMessage =
    localMatchesHost && typeof localAuthState?.message === "string"
      ? localAuthState.message
      : providerMatchesHost ? draft?.agentAuthLastMessage || "" : "";
  const displayMessage = normalizeAuthMessage(message || lastMessage, capabilities?.label)
    || (currentStatus === "unknown" ? "Run Check or Login to verify this local agent host." : "");

  const canAct = Boolean(objectId && rowName) && !disabled;

  const callAction = useCallback(
    async (action, endpoint) => {
      if (!canAct) return;
      setBusy(action);
      setMessage("");
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ objectId, name: rowName, agentHost: capabilities.slug })
        });
        const payload = await res.json();
        setOutput(payload);
        setMessage(payload.message || (payload.ok ? "Done" : payload.error || "Failed"));
        if (payload.status) {
          setLocalAuthState({
            status: payload.status,
            provider: payload.provider || capabilities.slug,
            checkedAt: payload.checkedAt || new Date().toISOString(),
            message: payload.message || ""
          });
        }
        if (typeof onPatchDraft === "function" && payload.status) {
          onPatchDraft({
            agentAuthStatus: payload.status,
            agentAuthProvider: payload.provider || capabilities.slug,
            agentAuthLastChecked: payload.checkedAt || new Date().toISOString(),
            agentAuthLastExitCode:
              typeof payload.exitCode === "number" ? payload.exitCode : null,
            agentAuthLastMessage: payload.message || "",
            agentAuthLastLoginUrl: payload.loginUrl || ""
          });
        }
      } catch (err) {
        setMessage(err?.message || `${action} failed`);
      } finally {
        setBusy(null);
      }
    },
    [canAct, objectId, rowName, onPatchDraft, capabilities?.slug]
  );

  const onCheckStatus = () =>
    callAction("status", "/api/workspace/sandbox-agent-auth/status");
  const onLogin = () =>
    callAction("login", "/api/workspace/sandbox-agent-auth/login");
  const onLogout = () =>
    callAction("logout", "/api/workspace/sandbox-agent-auth/logout");

  if (!capabilities) return null;
  const HostIcon = capabilities.slug === "codex_local" ? Code2 : Bot;

  return (
    <div className="dm-record-testbar" data-panel="sandbox-agent-auth" data-agent-host={capabilities.slug}>
      <div className="dm-agent-auth-summary">
        <HostIcon size={15} aria-hidden />
        <div>
          <strong>{capabilities.label}</strong>
          <span>Local CLI session</span>
        </div>
        <AuthStatusPill status={currentStatus} />
      </div>
      <div className="dm-agent-auth-actions">
        <button
          type="button"
          className="dm-btn-ghost"
          disabled={busy !== null || !canAct}
          onClick={onCheckStatus}
          title={`Probe the local ${capabilities.label} CLI`}
        >
          <RefreshCw size={13} aria-hidden />
          {busy === "status" ? "Checking…" : "Check"}
        </button>
        {capabilities.canLogin && (
          <button
            type="button"
            className="dm-btn-primary-sm"
            disabled={busy !== null || !canAct}
            onClick={onLogin}
            title={`Run the documented login flow for ${capabilities.label}`}
          >
            <LogIn size={13} aria-hidden />
            {busy === "login" ? "Running…" : "Login"}
          </button>
        )}
        {capabilities.canLogout && (
          <button
            type="button"
            className="dm-btn-ghost"
            disabled={busy !== null || !canAct}
            onClick={onLogout}
            title={`Run the documented logout flow for ${capabilities.label}`}
          >
            <LogOut size={13} aria-hidden />
            {busy === "logout" ? "…" : "Logout"}
          </button>
        )}
      </div>
      {displayMessage && <span className="dm-agent-auth-message">{displayMessage}</span>}
      {currentStatus === "missing" && (
        <span className="dm-agent-auth-message is-warning">{capabilities.installHint}</span>
      )}
      {!capabilities.canLogin && capabilities.notes && (
        <span className="dm-agent-auth-message" data-host-notes>
          {capabilities.notes}
        </span>
      )}
      {output && (output.stdout || output.stderr || output.loginUrl) && (
        <SandboxAgentAuthOutput output={output} />
      )}
      {!output && lastChecked && (
        <span className="dm-agent-auth-message is-muted">Last checked {formatChecked(lastChecked)}</span>
      )}
    </div>
  );
}

function normalizeAuthMessage(value, label) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized.includes("authenticated")) return "Authenticated.";
  if (label && normalized.includes(String(label).toLowerCase())) {
    return text.replace(new RegExp(String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").replace(/\s+/g, " ").trim();
  }
  return text;
}

function formatChecked(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function SandboxAgentAuthOutput({ output }) {
  const lines = [];
  if (output.loginUrl) lines.push(`login URL: ${output.loginUrl}`);
  if (output.stdout) lines.push(`stdout:\n${output.stdout}`);
  if (output.stderr) lines.push(`stderr:\n${output.stderr}`);
  return (
    <details className="dm-agent-auth-output" data-output="sandbox-agent-auth">
      <summary>Auth output</summary>
      <pre>{lines.join("\n\n")}</pre>
    </details>
  );
}

// Re-export the eligibility predicate so callers can keep importing it from
// this component file. New code should import from
// `@/lib/sandbox-agent-auth-eligibility` directly.
export { isSandboxLocalAgentHost };
