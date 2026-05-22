"use client";

/**
 * Sandbox Claude Local Auth Onboarding V1 — record sidecar panel.
 *
 * Rendered ONLY when the selected sandbox row uses adapter
 * `local-agent-host` + agentHost `claude_local`. Acts as a preflight to the
 * existing `SandboxRunPanel` — execution still flows through
 * /api/workspace/sandbox-run; this panel only prepares the Claude CLI's
 * local auth state so the next run doesn't fail with a stale-auth error.
 *
 * The panel reads `agentAuthStatus` from the row draft (stamped by the API
 * routes after each action) and lets the operator:
 *   - Check status (`claude --version`)
 *   - Run Claude login (`claude auth login`)
 *   - Log out Claude (`claude auth logout`)
 *
 * Output captured from the CLI is rendered inside a monospace block. Raw
 * tokens are redacted server-side before transit; this component does not
 * receive or render any secret material.
 */

import { useCallback, useState } from "react";
import { LogIn, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { isSandboxClaudeLocal } from "@/lib/sandbox-agent-auth-eligibility";

const STATUS_LABEL = {
  active: "Active",
  stale: "Stale",
  missing: "Missing",
  checking: "Checking",
  unknown: "Unknown"
};

function statusKind(status) {
  if (status === "active") return "ok";
  if (status === "missing" || status === "stale") return "bad";
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
        if (typeof onPatchDraft === "function") {
          onPatchDraft({
            agentAuthStatus: payload.status || "unknown",
            agentAuthProvider: "claude_local",
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
    [canAct, objectId, rowName, onPatchDraft]
  );

  const onCheckStatus = () =>
    callAction("status", "/api/workspace/sandbox-agent-auth/status");
  const onLogin = () =>
    callAction("login", "/api/workspace/sandbox-agent-auth/claude-login");
  const onLogout = () =>
    callAction("logout", "/api/workspace/sandbox-agent-auth/claude-logout");

  return (
    <div className="dm-record-testbar" data-panel="sandbox-agent-auth">
      <ShieldCheck size={13} aria-hidden style={{ color: "#64748b", flex: "0 0 auto" }} />
      <strong style={{ fontSize: 12, color: "#334155", fontWeight: 650 }}>
        Claude Code local auth
      </strong>
      <AuthStatusPill status={currentStatus} />
      <button
        type="button"
        className="dm-btn-ghost"
        disabled={busy !== null || !canAct}
        onClick={onCheckStatus}
        title="Probe the local Claude CLI"
      >
        <RefreshCw size={13} aria-hidden />
        {busy === "status" ? "Checking…" : "Check status"}
      </button>
      <button
        type="button"
        className="dm-btn-primary-sm"
        disabled={busy !== null || !canAct}
        onClick={onLogin}
        title="Run `claude auth login` on this machine"
      >
        <LogIn size={13} aria-hidden />
        {busy === "login" ? "Running…" : "Run Claude login"}
      </button>
      <button
        type="button"
        className="dm-btn-ghost"
        disabled={busy !== null || !canAct}
        onClick={onLogout}
        title="Run `claude auth logout` on this machine"
      >
        <LogOut size={13} aria-hidden />
        {busy === "logout" ? "…" : "Log out"}
      </button>
      {(message || lastMessage) && (
        <span style={{ color: "#64748b", fontSize: 12 }}>
          {message || lastMessage}
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

// `isSandboxClaudeLocal` is exported from `lib/sandbox-agent-auth-eligibility.js`
// — this barrel keeps it accessible to call sites that import it from this
// component file (e.g. `DataModelShell.jsx`) without forcing a second import.
export { isSandboxClaudeLocal };
