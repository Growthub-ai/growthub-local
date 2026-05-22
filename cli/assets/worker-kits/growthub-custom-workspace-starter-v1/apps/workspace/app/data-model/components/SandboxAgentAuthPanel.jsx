"use client";

import { useCallback, useEffect, useState } from "react";
import { Play } from "lucide-react";
import { redactSecretsFromText } from "@/lib/orchestration-graph";

function AuthStatusPill({ status }) {
  const value = String(status || "unknown").toLowerCase();
  const className =
    value === "active"
      ? "dm-db-status ok"
      : value === "stale"
        ? "dm-db-status warn"
        : value === "missing"
          ? "dm-db-status bad"
          : "dm-db-status";
  const label = value.charAt(0).toUpperCase() + value.slice(1);
  return (
    <span className={className}>
      <span />
      {label}
    </span>
  );
}

export function SandboxAgentAuthPanel({
  objectId,
  rowName,
  authStatus: initialAuthStatus,
  authMessage: initialAuthMessage,
  disabled,
  canRun,
  sandboxRunning,
  onRunSandbox,
  onAuthMetadata,
}) {
  const [authStatus, setAuthStatus] = useState(initialAuthStatus || "unknown");
  const [authMessage, setAuthMessage] = useState(initialAuthMessage || "");
  const [busy, setBusy] = useState(null);
  const [output, setOutput] = useState("");
  const [loginUrl, setLoginUrl] = useState("");

  useEffect(() => {
    setAuthStatus(initialAuthStatus || "unknown");
    setAuthMessage(initialAuthMessage || "");
  }, [initialAuthStatus, initialAuthMessage, objectId, rowName]);

  const requestBody = useCallback(
    () => ({ objectId, name: String(rowName || "").trim() }),
    [objectId, rowName]
  );

  const applyRowPatch = useCallback(
    (patch) => {
      if (!patch || typeof patch !== "object") return;
      if (patch.agentAuthStatus) setAuthStatus(patch.agentAuthStatus);
      if (patch.agentAuthLastMessage) setAuthMessage(patch.agentAuthLastMessage);
      onAuthMetadata?.(patch);
    },
    [onAuthMetadata]
  );

  const formatOutput = useCallback((payload) => {
    const parts = [];
    if (payload.loginUrl) {
      parts.push(`Login URL:\n${payload.loginUrl}`);
    }
    if (payload.stdout) {
      parts.push(`stdout:\n${redactSecretsFromText(payload.stdout)}`);
    }
    if (payload.stderr) {
      parts.push(`stderr:\n${redactSecretsFromText(payload.stderr)}`);
    }
    if (payload.message) {
      parts.push(payload.message);
    }
    return parts.join("\n\n").trim();
  }, []);

  async function postAuth(path) {
    const name = String(rowName || "").trim();
    if (!objectId || !name) {
      setAuthMessage("Sandbox Name is required.");
      return null;
    }
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody())
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload.status) {
      throw new Error(payload.error || `Request failed (${res.status})`);
    }
    return payload;
  }

  async function handleCheckStatus() {
    setBusy("status");
    setOutput("");
    setLoginUrl("");
    setAuthStatus("checking");
    try {
      const payload = await postAuth("/api/workspace/sandbox-agent-auth/status");
      if (!payload) return;
      setAuthStatus(payload.status || "unknown");
      setAuthMessage(payload.message || "");
      setOutput(formatOutput(payload));
      applyRowPatch(payload.rowPatch);
    } catch (err) {
      setAuthStatus("unknown");
      setAuthMessage(redactSecretsFromText(err.message || "Status check failed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleLogin() {
    setBusy("login");
    setOutput("");
    setLoginUrl("");
    setAuthStatus("checking");
    try {
      const payload = await postAuth("/api/workspace/sandbox-agent-auth/claude-login");
      if (!payload) return;
      setAuthStatus(payload.status || "unknown");
      setAuthMessage(payload.message || "");
      if (payload.loginUrl) setLoginUrl(payload.loginUrl);
      setOutput(formatOutput(payload));
      applyRowPatch(payload.rowPatch);
      if (payload.status !== "active") {
        await handleCheckStatus();
      }
    } catch (err) {
      setAuthStatus("unknown");
      setAuthMessage(redactSecretsFromText(err.message || "Claude login failed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleLogout() {
    setBusy("logout");
    setOutput("");
    setLoginUrl("");
    try {
      const payload = await postAuth("/api/workspace/sandbox-agent-auth/claude-logout");
      if (!payload) return;
      setAuthStatus(payload.status || "stale");
      setAuthMessage(payload.message || "");
      setOutput(formatOutput(payload));
      applyRowPatch(payload.rowPatch);
    } catch (err) {
      setAuthStatus("unknown");
      setAuthMessage(redactSecretsFromText(err.message || "Claude logout failed"));
    } finally {
      setBusy(null);
    }
  }

  const rowReady = Boolean(String(rowName || "").trim()) && Boolean(objectId);

  return (
    <section className="dm-api-action-card" aria-label="Claude Code local auth">
      <div className="dm-api-action-card-body">
        <p className="dm-api-action-card-eyebrow">Claude Code local auth</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#4b5563" }}>Status</span>
          <AuthStatusPill status={busy === "status" || busy === "login" ? "checking" : authStatus} />
        </div>
        <p>
          This sandbox uses Claude Code through the local-agent-host adapter. Authenticate the local
          Claude CLI on this machine before running this sandbox.
        </p>
        {authMessage && <p className="dm-api-action-card-note">{authMessage}</p>}
      </div>
      <div className="dm-api-action-card-actions" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            className="dm-btn-outline dm-api-action-card-cta"
            disabled={disabled || !rowReady || Boolean(busy)}
            onClick={handleCheckStatus}
          >
            {busy === "status" ? "Checking…" : "Check status"}
          </button>
          <button
            type="button"
            className="dm-btn-primary-sm dm-api-action-card-cta"
            disabled={disabled || !rowReady || Boolean(busy)}
            onClick={handleLogin}
          >
            {busy === "login" ? "Running login…" : "Run Claude login"}
          </button>
          <button
            type="button"
            className="dm-btn-outline dm-api-action-card-cta"
            disabled={disabled || !rowReady || Boolean(busy)}
            onClick={handleLogout}
          >
            {busy === "logout" ? "Logging out…" : "Log out Claude"}
          </button>
          <button
            type="button"
            className="dm-btn-primary-sm dm-api-action-card-cta"
            disabled={sandboxRunning || disabled || !canRun || Boolean(busy)}
            onClick={onRunSandbox}
          >
            {sandboxRunning ? "Running…" : (<><Play size={13} aria-hidden /> Run sandbox</>)}
          </button>
        </div>
        {(output || loginUrl) && (
          <pre
            className="dm-sandbox-auth-output"
            style={{
              margin: 0,
              padding: 10,
              fontSize: 11,
              lineHeight: 1.45,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              maxHeight: 200,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}
          >
            {loginUrl && !output.includes(loginUrl)
              ? `${output ? `${output}\n\n` : ""}Login URL:\n${loginUrl}`
              : output}
          </pre>
        )}
      </div>
    </section>
  );
}
