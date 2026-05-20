"use client";

import { Suspense } from "react";
import DataModelShell from "./components/DataModelShell.jsx";

export default function DataModelPage() {
  return (
    <Suspense fallback={<main className="main" style={{ padding: 24 }}>Loading…</main>}>
      <DataModelShell />
    </Suspense>
  );
}
