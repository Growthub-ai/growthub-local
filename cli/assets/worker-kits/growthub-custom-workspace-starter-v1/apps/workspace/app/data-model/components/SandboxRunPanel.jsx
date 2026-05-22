"use client";

import { Play } from "lucide-react";
import { StatusPill } from "./StatusPill.jsx";

export function SandboxRunPanel({
  status,
  sandboxRunning,
  sandboxMessage,
  onRun,
  disabled,
  canRun,
  agentAuthStatus,
  agentAuthHint
}) {
  const hint = agentAuthHint
    || (sandboxMessage && isAuthHinted(sandboxMessage) ? "Claude auth may be stale — open Claude Auth panel above." : null);
  return (
    <div className="dm-record-testbar">
      <StatusPill value={status} />
      <button
        type="button"
        className="dm-btn-primary-sm"
        disabled={sandboxRunning || disabled || !canRun}
        onClick={onRun}
      >
        {sandboxRunning ? "Running…" : (<><Play size={13} aria-hidden /> Run sandbox</>)}
      </button>
      {sandboxMessage && <span>{sandboxMessage}</span>}
      {hint && (
        <span
          data-agent-auth-hint
          data-agent-auth-status={agentAuthStatus || "unknown"}
          style={{ color: "#b45309", fontSize: 12, fontWeight: 600 }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function isAuthHinted(text) {
  if (typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("not logged in")
    || lower.includes("login required")
    || lower.includes("authenticate")
    || lower.includes("auth required")
  );
}
