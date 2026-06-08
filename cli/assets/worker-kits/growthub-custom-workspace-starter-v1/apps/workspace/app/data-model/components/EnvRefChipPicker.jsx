"use client";

import Link from "next/link";

function EnvRefChipPicker({
  catalog = [],
  selected = new Set(),
  disabled = false,
  multiselect = true,
  onToggle,
  onSelect,
  emptyHint = "Add keys under Settings → APIs & Webhooks or .env.local."
}) {
  if (!catalog.length) {
    return (
      <span className="dm-cell-empty">
        {emptyHint}{" "}
        <Link href="/settings/apis-webhooks">Open Settings</Link>
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {catalog.map((ref) => {
        const slug = ref.endpointRef;
        const active = selected instanceof Set ? selected.has(slug) : selected === slug;
        const resolved = ref.resolved === true;
        const statusClass = resolved ? " dm-env-ref-resolved" : " dm-env-ref-missing";
        return (
          <button
            key={slug}
            type="button"
            className={`dm-btn-ghost${active ? " dm-chip-active" : ""}${statusClass}`}
            style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11 }}
            disabled={disabled}
            title={resolved ? `${slug} resolved server-side` : `${slug} missing in server env`}
            onClick={() => {
              if (multiselect) onToggle?.(slug);
              else onSelect?.(slug);
            }}
          >
            <span className="dm-env-ref-dot" aria-hidden="true" />
            {slug}
          </button>
        );
      })}
    </div>
  );
}

export { EnvRefChipPicker };
