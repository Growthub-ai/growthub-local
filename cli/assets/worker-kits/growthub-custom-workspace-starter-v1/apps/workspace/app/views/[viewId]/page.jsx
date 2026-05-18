"use client";

/**
 * Custom Folders Navigation — user-facing View surface.
 *
 * Renders a clean, deployed-runtime table for a single folder Item of
 * type "view". The view configuration (objectId + viewConfig with
 * `columns`, `filters`, `sort`) is stored on the nav-folders governed
 * object via the existing PATCH allowlist. Resolving the Data Model
 * object's `columns` and `rows` happens entirely from the live
 * workspace config — there is no parallel store, no new schema
 * namespace, and no new sandbox primitive.
 *
 * The page deliberately uses the canonical <WorkspaceRail /> so the
 * Folders module remains the user's navigation surface; the body is a
 * thin table renderer mirroring the same column/sort/filter contract
 * used by the dashboard View widget.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { WorkspaceRail } from "../../workspace-rail.jsx";

function findViewItem(workspaceConfig, viewId) {
  const obj = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === "nav-folders");
  const rows = Array.isArray(obj?.rows) ? obj.rows : [];
  for (const row of rows) {
    const items = Array.isArray(row?.items) ? row.items : [];
    const hit = items.find((it) => it?.type === "view" && it?.id === viewId);
    if (hit) return { folder: row, item: hit };
  }
  return null;
}

function findObjectById(workspaceConfig, objectId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.find((o) => o?.id === objectId) || null;
}

function applyFilters(rows, filters) {
  if (!Array.isArray(filters) || filters.length === 0) return rows;
  return rows.filter((row) => {
    return filters.every((f) => {
      if (!f || typeof f.field !== "string") return true;
      const value = row?.[f.field];
      const cmp = f.value;
      switch (f.op) {
        case "eq": return String(value ?? "") === String(cmp ?? "");
        case "ne": return String(value ?? "") !== String(cmp ?? "");
        case "contains": return String(value ?? "").toLowerCase().includes(String(cmp ?? "").toLowerCase());
        case "isEmpty": return value == null || value === "";
        case "isNotEmpty": return !(value == null || value === "");
        case "gt": return Number(value) > Number(cmp);
        case "lt": return Number(value) < Number(cmp);
        default: return true;
      }
    });
  });
}

function applySort(rows, sort) {
  if (!sort || typeof sort.field !== "string") return rows;
  const dir = sort.dir === "desc" ? -1 : 1;
  const sorted = rows.slice().sort((a, b) => {
    const av = a?.[sort.field];
    const bv = b?.[sort.field];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
  });
  return sorted;
}

export default function ViewPage() {
  const params = useParams();
  const router = useRouter();
  const viewId = decodeURIComponent(String(params?.viewId || ""));

  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [authority, setAuthority] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load workspace");
      setWorkspaceConfig(payload.workspaceConfig);
      setAuthority(payload.adapters?.integrations?.authority || null);
    } catch (err) {
      setError(err.message || "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const located = useMemo(
    () => (workspaceConfig ? findViewItem(workspaceConfig, viewId) : null),
    [workspaceConfig, viewId]
  );

  const dmObject = useMemo(
    () => (workspaceConfig && located ? findObjectById(workspaceConfig, located.item.objectId) : null),
    [workspaceConfig, located]
  );

  const { columns, rows } = useMemo(() => {
    if (!dmObject || !located) return { columns: [], rows: [] };
    const objectColumns = Array.isArray(dmObject.columns) ? dmObject.columns : [];
    const objectRows = Array.isArray(dmObject.rows) ? dmObject.rows : [];
    const viewConfig = located.item.viewConfig || {};
    const requestedColumns = Array.isArray(viewConfig.columns) && viewConfig.columns.length
      ? viewConfig.columns.filter((c) => objectColumns.includes(c))
      : objectColumns;
    const filtered = applyFilters(objectRows, viewConfig.filters);
    const sorted = applySort(filtered, viewConfig.sort);
    return { columns: requestedColumns, rows: sorted };
  }, [dmObject, located]);

  return (
    <main className="workspace-builder">
      <WorkspaceRail
        workspaceConfig={workspaceConfig}
        authority={authority}
        helperOpen={false}
        onConfigChange={(nextConfig) => setWorkspaceConfig(nextConfig)}
        onOpenHelper={() => router.push("/data-model?helper=open")}
        onOpenThread={(row) => router.push(`/data-model?thread=${encodeURIComponent(row.id)}`)}
      />
      <section className="workspace-surface">
        <header className="workspace-toolbar">
          <div>
            <p>{located?.folder?.name || "Folder"}</p>
            <h1>{located?.item?.label || dmObject?.label || "View"}</h1>
          </div>
        </header>
        <section className="workspace-view-surface" aria-label="View table">
          {loading ? (
            <p className="workspace-view-empty">Loading view…</p>
          ) : error ? (
            <p className="workspace-view-empty workspace-view-error">{error}</p>
          ) : !located ? (
            <p className="workspace-view-empty">
              View not found. It may have been removed from its folder.
            </p>
          ) : !dmObject ? (
            <p className="workspace-view-empty">
              The Data Model object backing this view (<code>{located.item.objectId}</code>) is missing.
            </p>
          ) : columns.length === 0 ? (
            <p className="workspace-view-empty">This object has no columns yet.</p>
          ) : (
            <div className="workspace-view-table-wrap">
              <table className="workspace-view-table">
                <thead>
                  <tr>
                    {columns.map((col) => (<th key={col}>{col}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="workspace-view-table-empty">
                        No rows match this view.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, ri) => (
                      <tr key={ri}>
                        {columns.map((col) => (
                          <td key={col}>{formatCell(row?.[col])}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <p className="workspace-view-footer">
                {rows.length} row{rows.length === 1 ? "" : "s"}
                {" · "}
                <span>{dmObject.label}</span>
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function formatCell(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}
