"use client";

/**
 * BucketManager — no-code, one-click Supabase Storage bucket creation and
 * management for the governed buckets object (second Supabase product).
 *
 * Everything routes through the governed storage door
 * (POST/DELETE /api/workspace/add-ons/supabase/storage): the real Supabase
 * Storage API creates/deletes the bucket, the route reads it back, and the
 * governed row lands with fields correlated 1:1 to the linked data table.
 * No client-held service credentials, no client-side config mutation — the
 * component only submits intents and swaps in the returned workspaceConfig.
 *
 * 1:1 mental model surfaced directly: bucket name (live-normalized to the
 * Supabase id), public/private access, MIME-type allowlist, and file-size
 * limit — the same knobs the provider exposes.
 */

import { useState } from "react";

const PROVIDER_ID = "supabase";
const STORAGE_ROUTE = `/api/workspace/add-ons/${PROVIDER_ID}/storage`;

// Client-side preview of the route's normalizeBucketName (kept in lockstep
// with lib/workspace-storage-buckets.js — the server is authoritative).
function previewBucketId(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 63)
    .replace(/[._-]+$/g, "");
}

export function BucketManager({ object, onWorkspaceConfig }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [access, setAccess] = useState("private");
  const [mimeTypes, setMimeTypes] = useState("");
  const [sizeLimit, setSizeLimit] = useState("50MB");

  const linkedTable = String(object?.linkedTableLabel || object?.linkedTableObjectId || "").trim();
  const buckets = Array.isArray(object?.rows) ? object.rows : [];
  const bucketId = previewBucketId(name);

  const post = async (payload) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(STORAGE_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error || `Request failed (HTTP ${response.status})`);
        return false;
      }
      if (body?.workspaceConfig && typeof onWorkspaceConfig === "function") onWorkspaceConfig(body.workspaceConfig);
      return true;
    } catch (err) {
      setError(err?.message || "network error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createBucket = async () => {
    if (!bucketId) { setError("Enter a bucket name (3–63 chars)."); return; }
    const ok = await post({
      action: "create-bucket",
      name,
      access,
      allowedMimeTypes: mimeTypes,
      fileSizeLimit: sizeLimit,
    });
    if (ok) { setName(""); setMimeTypes(""); setOpen(false); }
  };

  const deleteBucket = async (id) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(STORAGE_ROUTE, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bucketId: id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body?.error || `Delete failed (HTTP ${response.status})`); return; }
      if (body?.workspaceConfig && typeof onWorkspaceConfig === "function") onWorkspaceConfig(body.workspaceConfig);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="dm-bucket-manager" data-bucket-manager="">
      <button
        type="button"
        className="dm-db-status ok"
        data-bucket-manager-toggle=""
        onClick={() => setOpen((v) => !v)}
        title={linkedTable ? `Buckets correlated to ${linkedTable}` : "Storage buckets"}
      >
        <span />{buckets.length} bucket{buckets.length === 1 ? "" : "s"} · New
      </button>
      {open ? (
        <div className="dm-bucket-panel" role="dialog" aria-label="Create Supabase Storage bucket">
          <div className="dm-bucket-panel-head">
            <strong>New bucket</strong>
            {linkedTable ? <em>correlated 1:1 to {linkedTable}</em> : <em>link a data table first</em>}
          </div>
          <label className="dm-marketplace-field">
            <span>Bucket name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Uploads" disabled={busy} />
            {name ? <small>id: <code>{bucketId || "—"}</code></small> : null}
          </label>
          <label className="dm-marketplace-field">
            <span>Access</span>
            <select value={access} onChange={(e) => setAccess(e.target.value)} disabled={busy} data-bucket-access="">
              <option value="private">Private (signed URLs)</option>
              <option value="public">Public (global CDN)</option>
            </select>
          </label>
          <label className="dm-marketplace-field">
            <span>Allowed MIME types (optional, comma-separated)</span>
            <input value={mimeTypes} onChange={(e) => setMimeTypes(e.target.value)} placeholder="image/png, image/*" disabled={busy} />
          </label>
          <label className="dm-marketplace-field">
            <span>File size limit</span>
            <input value={sizeLimit} onChange={(e) => setSizeLimit(e.target.value)} placeholder="50MB" disabled={busy} />
          </label>
          {error ? <p className="dm-marketplace-error" role="alert">{error}</p> : null}
          <div className="dm-bucket-panel-actions">
            <button type="button" className="dm-btn-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="dm-btn-primary-sm" onClick={createBucket} disabled={busy || !bucketId} data-bucket-create="">
              {busy ? "Creating…" : "Create bucket"}
            </button>
          </div>
          {buckets.length ? (
            <ul className="dm-bucket-list">
              {buckets.map((row) => (
                <li key={row.bucketId || row.Name}>
                  <span className={`dm-db-status${String(row.access) === "public" ? " ok" : ""}`}><span />{row.access}</span>
                  <code>{row.bucketId || row.Name}</code>
                  <button type="button" className="dm-workflow-icon-btn" onClick={() => deleteBucket(row.bucketId || row.Name)} disabled={busy} aria-label={`Delete ${row.bucketId || row.Name}`}>✕</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

export default BucketManager;
