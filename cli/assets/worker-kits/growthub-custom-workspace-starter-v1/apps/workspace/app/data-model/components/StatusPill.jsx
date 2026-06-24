"use client";

// Maps a free-form status string to one calm, consistent chip state.
// Backwards-compatible: same { value } prop, same default ("untested").
const OK = ["connected", "approved", "ok", "success", "succeeded", "complete", "completed", "passed", "live", "ready"];
const BAD = ["failed", "error", "errored", "disconnected", "rejected"];
const WARN = ["warning", "warn", "pending", "untrusted", "stale", "degraded"];
const RUNNING = ["running", "in_progress", "in-progress", "active", "executing", "started"];
const WAITING = ["waiting", "queued", "idle", "scheduled"];

function classifyStatus(status) {
  if (OK.includes(status)) return "is-ok";
  if (BAD.includes(status)) return "is-bad";
  if (RUNNING.includes(status)) return "is-running";
  if (WARN.includes(status)) return "is-warn";
  if (WAITING.includes(status)) return "is-waiting";
  return "";
}

export function StatusPill({ value }) {
  const raw = value || "untested";
  const state = classifyStatus(String(raw).toLowerCase());
  return (
    <span className={`dm-status-chip ${state}`.trim()}>
      <span className="dm-status-dot" />
      {raw}
    </span>
  );
}
