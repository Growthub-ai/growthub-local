"use client";

import { Suspense } from "react";
import DataModelShell from "./components/DataModelShell.jsx";
import { ClientModeGuard } from "../components/ClientModeGuard.jsx";

export default function DataModelPage() {
  return (
    <ClientModeGuard surface="The Data Model">
      <Suspense fallback={null}>
        <DataModelShell />
      </Suspense>
    </ClientModeGuard>
  );
}
