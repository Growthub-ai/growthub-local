"use client";

import { Suspense } from "react";
import WorkflowSurface from "./WorkflowSurface.jsx";

export default function WorkflowsPage() {
  return (
    <Suspense fallback={null}>
      <WorkflowSurface />
    </Suspense>
  );
}
