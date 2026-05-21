"use client";

import { Suspense } from "react";
import DataModelShell from "./components/DataModelShell.jsx";

export default function DataModelPage() {
  return (
    <Suspense fallback={null}>
      <DataModelShell />
    </Suspense>
  );
}
