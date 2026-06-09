"use client";

import { useEffect, useState } from "react";
import { Database, Play, RefreshCw } from "lucide-react";

export function DataSourceCreationPanel({ registryRow, onRefresh, disabled }) {
  const [draft, setDraft] = useState({
    sourceName: "",
    storageMode: "source-record-sidecar",
    resolverMode: "resolver",
  });
  const [refreshResult, setRefreshResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = registryRow?.integrationId || registryRow?.Name;
    if (!id) return;
    setDraft((d) => ({
      ...d,
      sourceName: d.sourceName || `${registryRow?.Name || id} Source`,
    }));
  }, [registryRow]);

  async function createSource() {
    if (!registryRow) return;
    setLoading(true);
    try {
      const buildRes = await fetch("/api/workspace/creation-proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft: {
            name: registryRow.Name,
            integrationId: registryRow.integrationId,
            baseUrl: registryRow.baseUrl,
            endpoint: registryRow.endpoint,
            method: registryRow.method,
            authRef: registryRow.authRef,
            outputMode: "data-source",
            sourceName: draft.sourceName,
            storageMode: draft.storageMode,
            resolverMode: draft.resolverMode,
          },
        }),
      });
      const built = await buildRes.json();
      const applyRes = await fetch("/api/workspace/creation-proposals/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundle: built.bundle, writeResolver: true }),
      });
      const applied = await applyRes.json();
      onRefresh?.(applied);
    } finally {
      setLoading(false);
    }
  }

  async function testRefresh() {
    const sourceId = draft.sourceName?.replace(/\s+/g, "-").toLowerCase();
    if (!sourceId) return;
    setLoading(true);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/workspace/refresh-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId, registryId: registryRow?.integrationId }),
      });
      setRefreshResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  if (!registryRow) {
    return (
      <section className="dm-api-action-card dm-api-action-card-muted">
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">Data Source</p>
          <h3>No API rows</h3>
          <p>Register and test an API first, then create a Data Source from its output.</p>
        </div>
      </section>
    );
  }

  const tested = ["connected", "approved", "ok", "success"].includes(String(registryRow?.status || "").toLowerCase());

  return (
    <section className="dm-api-action-card" aria-label="Create data source">
      <div className="dm-api-action-card-icon"><Database size={18} /></div>
      <div className="dm-api-action-card-body">
        <p className="dm-api-action-card-eyebrow">Data Source</p>
        <h3>Connect source from API</h3>
        <p>Map API Registry output into governed source-record storage.</p>
        <div className="dm-creation-form-grid">
          <label>Source name<input value={draft.sourceName} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, sourceName: e.target.value }))} /></label>
          <label>Storage
            <select value={draft.storageMode} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, storageMode: e.target.value }))}>
              <option value="source-record-sidecar">Source-record sidecar</option>
              <option value="data-model-rows">Data Model rows</option>
            </select>
          </label>
        </div>
        {!tested ? <p className="dm-api-action-card-note">API must pass test before refresh is reliable.</p> : null}
        {refreshResult ? (
          <pre className="dm-run-console__output">{JSON.stringify(refreshResult, null, 2)}</pre>
        ) : null}
      </div>
      <div className="dm-api-action-card-actions">
        <button type="button" className="dm-btn-primary-sm" disabled={disabled || loading || !tested} onClick={createSource}>
          <Play size={14} />
          {loading ? "Creating…" : "Create source"}
        </button>
        <button type="button" className="dm-btn-outline dm-api-action-card-cta" disabled={disabled || loading || !tested} onClick={testRefresh}>
          <RefreshCw size={14} />
          Test refresh
        </button>
      </div>
    </section>
  );
}
