"use client";

import { Suspense } from "react";
import DataModelShell from "./components/DataModelShell.jsx";

export default function DataModelPage() {
  return (
    <Suspense fallback={<main className="shell"><p style={{ padding: 24 }}>Loading data model…</p></main>}>
      <DataModelShell />
    </Suspense>
  );
}
