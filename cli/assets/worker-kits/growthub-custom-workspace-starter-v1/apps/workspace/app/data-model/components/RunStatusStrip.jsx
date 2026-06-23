"use client";

import { CheckCircle2, CircleDashed, Clock, Loader2, XCircle } from "lucide-react";
import { deriveRunStatusDeltas, runStatusLabel } from "@/lib/run-status-deltas.js";

const STATUS_ICON = {
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  canceled: XCircle,
  unknown: CircleDashed,
  idle: CircleDashed
};

function formatDuration(ms) {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

/**
 * Compact, truthful run-status strip. Derives everything from the run record
 * via the pure deriveRunStatusDeltas helper — it shows a confirmed terminal
 * status, a live "Running" state only when the client reports an in-flight
 * request, the latest log line as a preview, and per-step chips ONLY when the
 * record carries structured events. It never fabricates step progress.
 */
export function RunStatusStrip({ record, isRunning }) {
  const deltas = deriveRunStatusDeltas(record);
  // An in-flight client request is the one piece of live evidence the panel
  // owns that the record itself may not yet reflect.
  const status = isRunning && deltas.status !== "failed" ? "running" : deltas.status;
  if (status === "idle") return null;

  const Icon = STATUS_ICON[status] || CircleDashed;
  const logDerived = deltas.statusSource === "none" && status === "unknown";

  return (
    <div className={`dm-run-strip is-${status}`} role="status" aria-live="polite">
      <span className="dm-run-strip__chip">
        <Icon size={13} className={status === "running" ? "dm-run-strip__spin" : ""} aria-hidden="true" />
        {runStatusLabel(status)}
      </span>
      {deltas.durationMs != null && (
        <span className="dm-run-strip__meta"><Clock size={12} aria-hidden="true" />{formatDuration(deltas.durationMs)}</span>
      )}
      {deltas.exitCode != null && <span className="dm-run-strip__meta">exit {deltas.exitCode}</span>}
      {deltas.hasOutput && <span className="dm-run-strip__meta dm-run-strip__meta--ok">output ready</span>}
      {deltas.receiptWritten && <span className="dm-run-strip__meta dm-run-strip__meta--ok">receipt saved</span>}

      {deltas.events.length > 0 && (
        <span className="dm-run-strip__steps">
          {deltas.events.map((event, index) => (
            <span key={`${event.label}:${index}`} className={`dm-run-strip__step is-${event.status}`} title={event.detail || event.label}>
              {event.label}
            </span>
          ))}
        </span>
      )}

      {deltas.latestLog && (
        <span className="dm-run-strip__log" title={deltas.latestLog.text}>
          <span className="dm-run-strip__log-stream">{deltas.latestLog.stream}</span>
          <code>{deltas.latestLog.text}</code>
        </span>
      )}
      {logDerived && <span className="dm-run-strip__note">log-derived · awaiting final result</span>}
    </div>
  );
}
