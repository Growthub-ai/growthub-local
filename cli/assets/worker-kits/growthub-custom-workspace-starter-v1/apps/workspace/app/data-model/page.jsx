"use client";

import { Suspense } from "react";
import DataModelShell from "./components/DataModelShell.jsx";

export default function DataModelPage() {
  return (
    <Suspense
      fallback={
        <main className="workspace-builder workspace-settings-page" style={{ padding: 24 }}>
          Loading data model…
        </main>
      }
    >
      <DataModelShell />
    </Suspense>
  );
}
