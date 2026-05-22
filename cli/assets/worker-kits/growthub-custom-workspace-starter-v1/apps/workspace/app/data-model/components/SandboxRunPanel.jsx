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
  authStatus,
  authHint,
}) {
  return (
    <div className="dm-record-testbar">
      <StatusPill value={status} />
      {authStatus && (
        <span className="dm-cell-empty" style={{ fontSize: 11 }}>
          Claude auth: {String(authStatus)}
        </span>
      )}
      <button
        type="button"
        className="dm-btn-primary-sm"
        disabled={sandboxRunning || disabled || !canRun}
        onClick={onRun}
      >
        {sandboxRunning ? "Running…" : (<><Play size={13} aria-hidden /> Run sandbox</>)}
      </button>
      {(authHint || sandboxMessage) && (
        <span>{authHint || sandboxMessage}</span>
      )}
    </div>
  );
}
