"use client";

import { Play } from "lucide-react";
import { StatusPill } from "./StatusPill.jsx";

export function SandboxRunPanel({ status, sandboxRunning, sandboxMessage, onRun, disabled, canRun }) {
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
    </div>
  );
}
