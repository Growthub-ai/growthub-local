"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function EnvKeyRefChips({
  selectedSlugs = new Set(),
  disabled = false,
  onToggle,
  emptyHint = "Add keys under Settings → APIs & Webhooks or .env.local.",
}) {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/workspace/env-key-catalog", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        setRefs(Array.isArray(payload?.refs) ? payload.refs : []);
      })
      .catch(() => {
        if (!cancelled) setRefs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <span className="dm-cell-empty">Loading env keys…</span>;
  }

  if (!refs.length) {
    return (
      <span className="dm-cell-empty">
        {emptyHint}{" "}
        <Link href="/settings/apis-webhooks" className="dm-inline-link">Settings</Link>
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {refs.map((ref) => {
        const slug = ref.endpointRef;
        const active = selectedSlugs.has(slug);
        const resolved = ref.configured === true;
        return (
          <button
            key={slug}
            type="button"
            className={`dm-btn-ghost${active ? " dm-chip-active" : ""}`}
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 11,
              borderColor: resolved ? "var(--dm-status-ok, #16a34a)" : "var(--dm-status-warn, #d97706)",
            }}
            disabled={disabled}
            title={`${resolved ? "Resolved in process.env" : "Missing in process.env"} · source: ${ref.source}`}
            onClick={() => onToggle?.(slug)}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                marginRight: 5,
                background: resolved ? "#16a34a" : "#d97706",
              }}
            />
            {slug}
          </button>
        );
      })}
    </div>
  );
}

function EnvRefPicker({ value, disabled, onChange }) {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/env-key-catalog", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        setRefs(Array.isArray(payload?.refs) ? payload.refs : []);
      })
      .catch(() => { if (!cancelled) setRefs([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const current = String(value || "").trim();
  const match = refs.find((r) => r.endpointRef === current);

  return (
    <div className="dm-env-ref-picker">
      <input
        list="dm-env-ref-options"
        value={value ?? ""}
        disabled={disabled}
        placeholder={loading ? "Loading…" : "LEADSHARK"}
        onChange={(event) => onChange?.(event.target.value)}
      />
      <datalist id="dm-env-ref-options">
        {refs.map((ref) => (
          <option key={ref.endpointRef} value={ref.endpointRef} />
        ))}
      </datalist>
      {current ? (
        <span
          className="dm-env-ref-picker__status"
          style={{ color: match?.configured ? "#16a34a" : "#d97706", fontSize: 11 }}
        >
          {match?.configured ? "✓ resolved" : "missing in env"}
        </span>
      ) : null}
    </div>
  );
}

export { EnvKeyRefChips, EnvRefPicker };
