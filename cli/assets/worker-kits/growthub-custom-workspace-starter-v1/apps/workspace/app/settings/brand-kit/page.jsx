"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SettingsShell } from "../settings-shell.jsx";
import { mergeBrandKitDefaults } from "@/lib/brand-kit-defaults";
import { injectBrandKitTokens } from "@/lib/brand-kit-injector";

function ColorTokenEditor({ label, value, onChange }) {
  return (
    <label className="workspace-settings-row-field">
      <span>{label}</span>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#3f68ff"} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="workspace-settings-row-field">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function BrandKitSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => mergeBrandKitDefaults(null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await res.json();
      const raw = payload.workspaceConfig?.branding?.brandKit;
      setDraft(mergeBrandKitDefaults(raw));
    } catch {
      setMessage("Could not load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    injectBrandKitTokens(draft);
  }, [draft]);

  const colorKeys = useMemo(
    () => Object.keys(draft.colors || {}).filter((k) => k !== "darkMode"),
    [draft.colors]
  );

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branding: { brandKit: draft } })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Save failed");
      setDraft(mergeBrandKitDefaults(payload.branding?.brandKit));
      setMessage("Saved");
    } catch (e) {
      setMessage(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsShell active="/settings/brand-kit" eyebrow="Settings" title="Brand Kit">
      {loading ? <p>Loading…</p> : (
        <div className="workspace-settings-card">
          <div className="workspace-settings-card-heading">
            <h2>Design tokens</h2>
            <p className="workspace-settings-lede">
              Tokens map to CSS variables across the governed workspace. Changes preview live; save writes <code>growthub.config.json</code> when the runtime allows filesystem writes.
            </p>
          </div>
          <section className="workspace-settings-section brand-kit-section">
            <h3>Colors</h3>
            <div className="brand-kit-grid">
              {colorKeys.map((key) => (
                <ColorTokenEditor
                  key={key}
                  label={key}
                  value={String(draft.colors[key] || "#000000")}
                  onChange={(v) => setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: v } }))}
                />
              ))}
            </div>
            <ToggleRow
              label="Dark mode flag (reserved)"
              checked={Boolean(draft.colors.darkMode)}
              onChange={(v) => setDraft((d) => ({ ...d, colors: { ...d.colors, darkMode: v } }))}
            />
          </section>
          <section className="workspace-settings-section brand-kit-section">
            <h3>Typography</h3>
            <label className="workspace-settings-row-field">
              <span>Font family</span>
              <input
                className="workspace-settings-input"
                value={String(draft.typography.fontFamily || "")}
                onChange={(e) => setDraft((d) => ({ ...d, typography: { ...d.typography, fontFamily: e.target.value } }))}
              />
            </label>
            <label className="workspace-settings-row-field">
              <span>Base font size</span>
              <input
                className="workspace-settings-input"
                value={String(draft.typography.fontSizeBase || "14px")}
                onChange={(e) => setDraft((d) => ({ ...d, typography: { ...d.typography, fontSizeBase: e.target.value } }))}
              />
            </label>
          </section>
          <section className="workspace-settings-section brand-kit-section">
            <h3>Shape</h3>
            <label className="workspace-settings-row-field">
              <span>Border radius</span>
              <input
                className="workspace-settings-input"
                value={String(draft.shape.borderRadius || "8px")}
                onChange={(e) => setDraft((d) => ({ ...d, shape: { ...d.shape, borderRadius: e.target.value } }))}
              />
            </label>
          </section>
          <div className="workspace-settings-actions">
            <button type="button" className="workspace-save-button" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save Brand Kit"}
            </button>
            <Link href="/" style={{ marginRight: "auto", fontSize: 13, color: "#64748b" }}>Back to workspace</Link>
          </div>
          {message && <p className="workspace-settings-message">{message}</p>}
        </div>
      )}
    </SettingsShell>
  );
}
