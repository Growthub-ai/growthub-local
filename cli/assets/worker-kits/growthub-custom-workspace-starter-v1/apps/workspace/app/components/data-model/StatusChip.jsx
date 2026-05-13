"use client";

export function StatusChip({ color, label, size = "md" }) {
  const cls = size === "sm" ? "dm-status-chip sm" : "dm-status-chip";
  return (
    <span className={cls} style={{ background: color ? `${color}33` : undefined, borderColor: color || undefined, color: color || "inherit" }}>
      {label}
    </span>
  );
}

export function TagChip({ color, label }) {
  return (
    <span className="dm-tag-chip" style={{ background: color ? `${color}28` : undefined, color: color || "inherit" }}>
      {label}
    </span>
  );
}
