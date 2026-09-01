"use client";

import { Suspense } from "react";
import WorkspaceDataModelCanvas from "../data-model/components/WorkspaceDataModelCanvas.jsx";
import { ClientModeGuard } from "../components/ClientModeGuard.jsx";

// Read-only workspace-level schema canvas. No mutation lane, no new runtime —
// it reads /api/workspace and renders the derived metadata graph.
export default function WorkspaceMapPage() {
  return (
    <ClientModeGuard surface="The Workspace Map">
      <Suspense fallback={null}>
        <WorkspaceDataModelCanvas />
      </Suspense>
    </ClientModeGuard>
  );
}
