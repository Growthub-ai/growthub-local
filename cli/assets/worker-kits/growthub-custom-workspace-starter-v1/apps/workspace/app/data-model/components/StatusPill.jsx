"use client";

export function StatusPill({ value }) {
  const status = String(value || "untested").toLowerCase();
  const ok = ["connected", "approved", "ok", "success"].includes(status);
  const bad = ["failed", "error", "disconnected"].includes(status);
  return (
    <span className={`dm-db-status ${ok ? "ok" : bad ? "bad" : ""}`}>
      <span />
      {value || "untested"}
    </span>
  );
}
