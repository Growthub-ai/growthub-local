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
 * Status values stamped on the row are intentionally distinct between
 * confirmed-authenticated ("active") and merely-installed ("reachable")
 * so the pill cannot overclaim auth from a `--version` probe.
 */

import { useCallback, useState } from "react";
import { LogIn, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { isSandboxLocalAgentHost } from "@/lib/sandbox-agent-auth-eligibility";
import { getAgentHostCapabilities } from "@/lib/sandbox-agent-host-catalog";

const STATUS_LABEL = {
  active: "Active",
  reachable: "Reachable",
  stale: "Stale",
  missing: "Missing",
  checking: "Checking",
  unknown: "Unknown"
};

function statusKind(status) {
  if (status === "active") return "ok";
  if (status === "stale") return "warn";
  if (status === "missing") return "bad";
  // "reachable" stays neutral — CLI is installed, but auth is NOT confirmed.
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

  const capabilities = getAgentHostCapabilities(draft);
  const currentStatus =
    typeof draft?.agentAuthStatus === "string" && draft.agentAuthStatus.trim()
      ? draft.agentAuthStatus.trim()
      : "unknown";
  const lastChecked = draft?.agentAuthLastChecked || "";
  const lastMessage = draft?.agentAuthLastMessage || "";

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
          body: JSON.stringify({ objectId, name: rowName })
        });
        const payload = await res.json();
        setOutput(payload);
        setMessage(payload.message || (payload.ok ? "Done" : payload.error || "Failed"));
        if (typeof onPatchDraft === "function" && payload.status) {
          onPatchDraft({
            agentAuthStatus: payload.status,
            agentAuthProvider: payload.provider || draft?.agentHost || "unknown",
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
    [canAct, objectId, rowName, onPatchDraft, draft?.agentHost]
  );

  const onCheckStatus = () =>
    callAction("status", "/api/workspace/sandbox-agent-auth/status");
  const onLogin = () =>
    callAction("login", "/api/workspace/sandbox-agent-auth/login");
  const onLogout = () =>
    callAction("logout", "/api/workspace/sandbox-agent-auth/logout");

  if (!capabilities) return null;

  return (
    <div className="dm-record-testbar" data-panel="sandbox-agent-auth" data-agent-host={capabilities.slug}>
      <ShieldCheck size={13} aria-hidden style={{ color: "#64748b", flex: "0 0 auto" }} />
      <strong style={{ fontSize: 12, color: "#334155", fontWeight: 650 }}>
        {capabilities.label} auth
      </strong>
      <AuthStatusPill status={currentStatus} />
      <button
        type="button"
        className="dm-btn-ghost"
        disabled={busy !== null || !canAct}
        onClick={onCheckStatus}
        title={`Probe the local ${capabilities.label} CLI`}
      >
        <RefreshCw size={13} aria-hidden />
        {busy === "status" ? "Checking…" : "Check status"}
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
          {busy === "login" ? "Running…" : "Run login"}
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
          {busy === "logout" ? "…" : "Log out"}
        </button>
      )}
      {(message || lastMessage) && (
        <span style={{ color: "#64748b", fontSize: 12 }}>
          {message || lastMessage}
        </span>
      )}
      {currentStatus === "missing" && (
        <span style={{ color: "#b45309", fontSize: 12 }}>{capabilities.installHint}</span>
      )}
      {!capabilities.canLogin && capabilities.notes && (
        <span style={{ color: "#64748b", fontSize: 11 }} data-host-notes>
          {capabilities.notes}
        </span>
      )}
      {output && (output.stdout || output.stderr || output.loginUrl) && (
        <SandboxAgentAuthOutput output={output} />
      )}
      {!output && lastChecked && (
        <span style={{ color: "#94a3b8", fontSize: 11 }}>last checked {formatChecked(lastChecked)}</span>
      )}
    </div>
  );
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
    <div
      style={{
        width: "100%",
        marginTop: 6,
        padding: 10,
        background: "#0f172a",
        color: "#e2e8f0",
        borderRadius: 6,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 11,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 220,
        overflow: "auto"
      }}
      data-output="sandbox-agent-auth"
    >
      {lines.join("\n\n")}
    </div>
  );
}

// Re-export the eligibility predicate so callers can keep importing it from
// this component file. New code should import from
// `@/lib/sandbox-agent-auth-eligibility` directly.
export { isSandboxLocalAgentHost };
