"use client";

import { useMemo, useState } from "react";
import { Upload, X } from "lucide-react";

function textColorForAccent(accent) {
  const hex = String(accent || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#252525" : "#ffffff";
}

function GeneralSettingsForm({ workspace, persistence }) {
  const initialBranding = workspace.branding || {};
  const [name, setName] = useState(workspace.name || "Growthub Workspace");
  const [logoUrl, setLogoUrl] = useState(initialBranding.logoUrl || "");
  const [accent, setAccent] = useState(initialBranding.accent || "#3f68ff");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canSave = persistence?.canSave !== false;
  const previewInitial = useMemo(() => (name || "G").trim().slice(0, 1).toUpperCase(), [name]);

  function uploadLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLogoUrl(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          branding: {
            name,
            logoUrl,
            accent
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.guidance || payload.error || "Failed to save settings");
      }
      setName(payload.workspace?.name || name);
      setLogoUrl(payload.workspace?.branding?.logoUrl || "");
      setAccent(payload.workspace?.branding?.accent || accent);
      setMessage("Saved workspace identity.");
    } catch (error) {
      setMessage(error.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="workspace-settings-card" onSubmit={saveSettings}>
    <div className="workspace-settings-card-heading">
      <div>
        <h2>General</h2>
        <p>Workspace-scoped identity for this governed workspace only.</p>
      </div>
    </div>

    <section className="workspace-settings-section">
      <h3>Workspace Identity</h3>
      <div className="workspace-logo-controls">
        <div className="workspace-logo-preview">
          <span className="workspace-logo-placeholder" aria-hidden="true" style={{
            backgroundColor: logoUrl ? undefined : accent,
            color: logoUrl ? undefined : textColorForAccent(accent)
          }}>
            {logoUrl ? <img src={logoUrl} alt="" /> : previewInitial}
          </span>
        </div>
        <div className="workspace-logo-actions">
          <div>
            <label className="workspace-file-button">
              <Upload size={14} aria-hidden="true" />
              <span>Upload</span>
              <input accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" type="file" onChange={uploadLogo} />
            </label>
            <button className="workspace-remove-button" type="button" onClick={() => setLogoUrl("")} disabled={!logoUrl}>
              <X size={14} aria-hidden="true" />
              <span>Remove</span>
            </button>
          </div>
          <p>Square PNGs, JPEGs, GIFs, WEBPs, or SVGs.</p>
        </div>
      </div>
      <div className="workspace-settings-grid">
        <label>
          <span>Workspace name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      </div>
      <div className="workspace-settings-grid logo-grid">
        <label>
          <span>Logo reference</span>
          <input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="Upload a file or paste a safe URL" />
        </label>
        <label>
          <span>Color</span>
          <span className="workspace-color-field">
            <input aria-label="Workspace color" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} />
            <input value={accent} onChange={(event) => setAccent(event.target.value)} placeholder="#3f68ff" />
          </span>
        </label>
      </div>
    </section>

    <div className="workspace-settings-actions">
      {message ? <p>{message}</p> : <p>{canSave ? "" : persistence?.guidance}</p>}
      <button className="workspace-save-button" type="submit" disabled={!canSave || saving}>{saving ? "Saving..." : "Save"}</button>
    </div>
  </form>;
}

export {
  GeneralSettingsForm
};
