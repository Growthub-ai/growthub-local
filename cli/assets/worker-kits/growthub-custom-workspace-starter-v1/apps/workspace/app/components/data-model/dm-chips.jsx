"use client";

export function StatusChip({ color, label, size = "md" }) {
  const cls = size === "sm" ? "dm-status-chip sm" : "dm-status-chip";
  return (
    <span className={cls} style={{ background: color || "var(--color-border, #334155)", color: "#fff" }}>
      {label}
    </span>
  );
}

export function TagChip({ color, label }) {
  return (
    <span className="dm-tag-chip" style={{ background: color || "var(--color-border)", color: "#fff" }}>
      {label}
    </span>
  );
}

export function RefChip({ label, objectType }) {
  return (
    <span className="dm-ref-chip" title={objectType || ""}>
      <span className="dm-ref-dot" aria-hidden />
      {label}
    </span>
  );
}
