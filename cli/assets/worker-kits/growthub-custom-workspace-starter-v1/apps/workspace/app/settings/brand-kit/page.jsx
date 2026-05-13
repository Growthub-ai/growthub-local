"use client";

import { useEffect, useMemo, useState } from "react";
import { injectBrandKitTokens, mergeBrandKitDefaults } from "@/lib/brand-kit-injector";
import { SettingsShell } from "@/app/settings/settings-shell";

export default function BrandKitSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(() => mergeBrandKitDefaults(null));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/workspace", { cache: "no-store" });
        const payload = await res.json();
        if (!cancelled && res.ok) {
          const bk = payload.workspaceConfig?.branding?.brandKit;
          setDraft(mergeBrandKitDefaults(bk));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const colors = draft.colors || {};

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branding: { brandKit: draft } })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.guidance || payload.error || "Save failed");
      injectBrandKitTokens(payload.branding?.brandKit || draft);
      setMessage("Brand kit saved.");
    } catch (e) {
      setMessage(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const colorKeys = useMemo(() => Object.keys(colors).filter((k) => k !== "darkMode"), [colors]);

  return (
    <SettingsShell active="/settings/brand-kit" title="Brand Kit" eyebrow="Settings">
      <div className="workspace-settings-card">
        <div className="workspace-settings-card-heading">
          <div>
            <h2>Design tokens</h2>
            <p>Scoped to branding.brandKit — persisted via PATCH /api/workspace/settings (not the main workspace PATCH allowlist).</p>
          </div>
        </div>
        {loading ? <p className="dm-cell-empty">Loading…</p> : null}
        {!loading ? (
          <>
            <section className="workspace-settings-section">
              <h3>Colors</h3>
              <div className="workspace-settings-grid">
                {colorKeys.map((key) => (
                  <label key={key}>
                    <span>{key}</span>
                    <span className="workspace-color-field">
                      <input
                        aria-label={key}
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(colors[key]) ? colors[key] : "#3f68ff"}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            colors: { ...d.colors, [key]: e.target.value }
                          }))
                        }
                      />
                      <input
                        value={colors[key] || ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            colors: { ...d.colors, [key]: e.target.value }
                          }))
                        }
                      />
                    </span>
                  </label>
                ))}
                <label className="dm-check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(colors.darkMode)}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        colors: { ...d.colors, darkMode: e.target.checked }
                      }))
                    }
                  />
                  <span>Dark mode flag</span>
                </label>
              </div>
            </section>
            <section className="workspace-settings-section">
              <h3>Typography</h3>
              <div className="workspace-settings-grid">
                <label>
                  <span>Font family</span>
                  <input
                    value={draft.typography?.fontFamily || ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        typography: { ...d.typography, fontFamily: e.target.value }
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Base font size</span>
                  <input
                    value={draft.typography?.fontSizeBase || "14px"}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        typography: { ...d.typography, fontSizeBase: e.target.value }
                      }))
                    }
                  />
                </label>
              </div>
            </section>
            <section className="workspace-settings-section">
              <h3>Shape</h3>
              <div className="workspace-settings-grid">
                <label>
                  <span>Border radius</span>
                  <input
                    value={draft.shape?.borderRadius || "8px"}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        shape: { ...d.shape, borderRadius: e.target.value }
                      }))
                    }
                  />
                </label>
              </div>
            </section>
            <div className="workspace-settings-actions">
              <button type="button" className="workspace-primary-button" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save brand kit"}
              </button>
              {message ? <p className={message.startsWith("Save") || message.includes("Saved") ? "dm-toast ok" : "dm-toast error"}>{message}</p> : null}
            </div>
          </>
        ) : null}
      </div>
    </SettingsShell>
  );
}
