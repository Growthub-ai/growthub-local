"use client";

import { useState } from "react";

const PAGE_SIZE = 10;

function AppsList({ apps }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(apps.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const visibleApps = apps.slice(activePage * PAGE_SIZE, activePage * PAGE_SIZE + PAGE_SIZE);

  if (!apps.length) {
    return <p className="workspace-settings-empty">No workspace apps are declared on the active config.</p>;
  }

  return <div className="workspace-paginated-list">
    <div className="workspace-app-list bounded">
      {visibleApps.map((item, index) => <article className="workspace-app-row" key={item.id || index}>
        <span className="workspace-provider-mark">{item.icon || item.label?.slice(0, 1) || item.name?.slice(0, 1) || "A"}</span>
        <div>
          <strong>{item.label || item.name || item.id}</strong>
          <p>{item.description || "Workspace app metadata from the active config."}</p>
          <div className="workspace-integration-meta">
            <span>{item.provider || "workspace"}</span>
            <span>{item.source || "config"}</span>
            <span>{item.authority || "read-only"}</span>
          </div>
        </div>
        <span className={`workspace-integration-status ${item.status || "available"}`}>{item.status || "available"}</span>
      </article>)}
    </div>
    {pageCount > 1 ? <div className="workspace-pagination">
      <button type="button" disabled={activePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
      <span>{activePage + 1} / {pageCount}</span>
      <button type="button" disabled={activePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button>
    </div> : null}
  </div>;
}

export {
  AppsList
};
