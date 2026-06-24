"use client";

import { Suspense } from "react";
import WorkspaceDataModelCanvas from "../data-model/components/WorkspaceDataModelCanvas.jsx";

// Read-only workspace-level schema canvas. No mutation lane, no new runtime —
// it reads /api/workspace and renders the derived metadata graph.
export default function WorkspaceMapPage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceDataModelCanvas />
    </Suspense>
  );
}
