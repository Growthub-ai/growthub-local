"use client";

import { ExternalLink, Rocket } from "lucide-react";
import {
  CODEX_SITES_OBJECT_ID,
  ensureCodexSitesDataModel,
  isCodexSiteUrl
} from "@/lib/codex-sites-workspace-adapter";
import { SettingsAccordionSection } from "./settings-accordion-section.jsx";

function CodexSitesDataModelCard({ apps, dataModel }) {
  const objects = Array.isArray(dataModel?.objects) ? dataModel.objects : [];
  const object = objects.find((item) => item?.id === CODEX_SITES_OBJECT_ID) || null;
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  const liveRows = rows.filter((row) => {
    const status = String(row?.status || "").toLowerCase();
    return isCodexSiteUrl(row?.url) && (status === "live" || status === "active");
  });
  const liveCount = liveRows.length;
  const appCount = new Set(rows.map((row) => row?.app).filter(Boolean)).size;

  async function openDataModel() {
    if (!object) {
      const nextDataModel = ensureCodexSitesDataModel(dataModel, apps);
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: nextDataModel })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error || "Failed to create Codex Sites object.");
        return;
      }
    }
    window.location.href = `/data-model?object=${encodeURIComponent(CODEX_SITES_OBJECT_ID)}`;
  }

  return <SettingsAccordionSection
    id="codex-sites"
    title="Codex Sites"
    summary={`${rows.length} site${rows.length === 1 ? "" : "s"} · ${liveCount} live · ${appCount || apps?.length || 0} app${(appCount || apps?.length || 0) === 1 ? "" : "s"}`}
    className="workspace-apps-linkage-section workspace-codex-sites-section"
  >
    <div className="workspace-app-row">
      <span className="workspace-provider-mark"><Rocket size={15} /></span>
      <div>
        <strong>Codex Sites</strong>
        <p>Manage Codex-hosted site URLs as a governed custom Data Model object attached to workspace apps and clients.</p>
        <div className="workspace-integration-meta">
          <span>{object ? "configured" : "not configured"}</span>
          <span>{rows.length} site{rows.length === 1 ? "" : "s"}</span>
          <span>{liveCount} live</span>
          <span>{appCount || apps?.length || 0} app{(appCount || apps?.length || 0) === 1 ? "" : "s"}</span>
        </div>
      </div>
      <button type="button" className="workspace-settings-action" onClick={openDataModel}>
        <ExternalLink size={14} />{object ? "Manage" : "Set up"}
      </button>
    </div>
    {rows.length ? <div className="workspace-settings-codex-sites-list">
      {rows.slice(0, 4).map((row, index) => isCodexSiteUrl(row?.url) ? (
        <a key={row.id || row.Name || index} href={row.url} target="_blank" rel="noreferrer">
          <span>{row.Name || `Site ${index + 1}`}</span>
          <em>{row.client || "Workspace"} · {row.app || "apps/workspace"}</em>
          <ExternalLink size={13} />
        </a>
      ) : (
        <button key={row.id || row.Name || index} type="button" onClick={openDataModel}>
          <span>{row.Name || `Site ${index + 1}`}</span>
          <em>{row.client || "Workspace"} · {row.status || "draft"}</em>
        </button>
      ))}
    </div> : null}
  </SettingsAccordionSection>;
}

export {
  CODEX_SITES_OBJECT_ID,
  CodexSitesDataModelCard
};
