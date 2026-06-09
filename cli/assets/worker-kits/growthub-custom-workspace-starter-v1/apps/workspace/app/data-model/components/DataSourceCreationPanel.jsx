"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Database, X } from "lucide-react";
import { buildDataSourceRowProposal } from "@/lib/workspace-creation-proposals";

export function DataSourceCreationPanel({ open, onClose, workspaceConfig, apiRows, onApplied }) {
  const testedRows = useMemo(
    () => (apiRows || []).filter((r) => String(r?.status || "").toLowerCase() === "connected"),
    [apiRows],
  );
  const [registryId, setRegistryId] = useState("");
  const [name, setName] = useState("");
  const [storageMode, setStorageMode] = useState("source-record");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const selectedApi = testedRows.find((r) => r.integrationId === registryId);

  async function createSource() {
    if (!selectedApi) return;
    setApplying(true);
    setError("");
    try {
      const proposal = buildDataSourceRowProposal({ registryId, name, storageMode }, selectedApi);
      const bundle = {
        kind: "growthub-creation-proposal-bundle-v1",
        businessGoal: `Create data source for ${registryId}`,
        proposals: [proposal],
        warnings: [],
      };
      const res = await fetch("/api/workspace/creation-proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", bundle }),
      });
      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.error || "Failed to create data source");
        return;
      }
      onApplied?.(payload.workspaceConfig);
      onClose?.();
    } catch (err) {
      setError(err.message || "Failed to create data source");
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="dm-json-modal-backdrop" onClick={onClose}>
      <section className="dm-json-modal dm-datasource-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <p>Data Source</p>
            <h2><Database size={16} /> Connect Source</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="dm-wizard-panel">
          {testedRows.length === 0 ? (
            <p>No tested API rows. <Link href="/data-model?wizard=register-api">Register and test an API first</Link>.</p>
          ) : (
            <>
              <label>API Registry row
                <select value={registryId} onChange={(e) => setRegistryId(e.target.value)}>
                  <option value="">Select…</option>
                  {testedRows.map((r) => (
                    <option key={r.integrationId} value={r.integrationId}>{r.Name || r.integrationId}</option>
                  ))}
                </select>
              </label>
              <label>Source name<input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${registryId || "my"}-source`} /></label>
              <label>Storage
                <select value={storageMode} onChange={(e) => setStorageMode(e.target.value)}>
                  <option value="source-record">Source-record sidecar</option>
                  <option value="data-model">Data Model rows</option>
                  <option value="widget-binding">Widget binding</option>
                </select>
              </label>
              <button type="button" className="dm-btn-primary-sm" disabled={!registryId || applying} onClick={createSource}>
                {applying ? "Creating…" : "Create Data Source"}
              </button>
            </>
          )}
          {error && <p className="dm-wizard-error">{error}</p>}
        </div>
      </section>
    </div>
  );
}
