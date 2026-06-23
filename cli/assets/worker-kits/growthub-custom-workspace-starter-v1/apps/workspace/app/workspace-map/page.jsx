"use client";

/**
 * Workspace Map — a read-only schema/relationship canvas of the workspace
 * data model. It reuses the workflow-canvas visual language but renders the
 * Data Model: which sources feed which objects, and which workflows and
 * dashboards consume them.
 *
 * Authority: this surface ONLY reads `GET /api/workspace/metadata-graph`
 * (the governed, secret-free metadata projection) and derives its view with
 * the pure `projectWorkspaceMap` selector. It performs no mutations and
 * holds no durable client state — every write still flows through the
 * existing governed Data Model / Workflow routes.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Network, RefreshCw } from "lucide-react";
import { projectWorkspaceMap } from "@/lib/workspace-metadata-selectors";
import { WorkspaceDataModelCanvas } from "../data-model/components/WorkspaceDataModelCanvas.jsx";

function WorkspaceMapSurface() {
  const router = useRouter();
  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/metadata-graph", { cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const payload = await response.json();
      setMap(projectWorkspaceMap(payload?.graph));
    } catch (err) {
      setError(err?.message || "Could not load the workspace map.");
      setMap(projectWorkspaceMap(null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openObject = useCallback((objectId) => {
    if (!objectId) return;
    router.push(`/data-model?object=${encodeURIComponent(objectId)}`);
  }, [router]);

  const openWorkflow = useCallback(({ objectId, rowId } = {}) => {
    if (!objectId || !rowId) { router.push("/workflows"); return; }
    const params = new URLSearchParams({ object: objectId, row: rowId, field: "orchestrationConfig" });
    router.push(`/workflows?${params.toString()}`);
  }, [router]);

  return (
    <main className="dm-map-page">
      <header className="dm-map-page__head">
        <div className="dm-map-page__crumbs">
          <button type="button" className="dm-map-page__crumb-link" onClick={() => router.push("/data-model")}>Data Model</button>
          <ArrowRight size={13} aria-hidden="true" />
          <span className="dm-map-page__crumb-current"><Network size={14} aria-hidden="true" />Workspace Map</span>
        </div>
        <div className="dm-map-page__head-actions">
          <button type="button" className="dm-btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={13} />{loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="dm-btn-primary-sm" onClick={() => router.push("/data-model")}>Open Data Model</button>
        </div>
      </header>
      <p className="dm-map-page__subtitle">A read-only view of how your sources, objects, workflows, and dashboards connect. Double-click an object or workflow to open it.</p>

      <section className="dm-map-page__body">
        {error && (
          <div className="dm-map-error">
            <AlertCircle size={26} />
            <strong>Could not load the workspace map</strong>
            <p>{error}</p>
            <button type="button" className="dm-btn-primary-sm" onClick={load}>Retry</button>
          </div>
        )}
        {!error && map && (
          <WorkspaceDataModelCanvas map={map} onOpenObject={openObject} onOpenWorkflow={openWorkflow} />
        )}
      </section>
    </main>
  );
}

export default function WorkspaceMapPage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceMapSurface />
    </Suspense>
  );
}
