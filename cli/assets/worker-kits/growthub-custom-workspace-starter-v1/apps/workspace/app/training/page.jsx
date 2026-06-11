"use client";

import { Suspense } from "react";
import TrainingLedger from "../data-model/components/TrainingLedger.jsx";

/**
 * /training — the continued-training ledger, full-width. Same component the
 * helper sidecar's /training view renders; one derivation, two surfaces.
 */
export default function TrainingPage() {
  return (
    <Suspense fallback={null}>
      <main className="dm-sidecar-body dm-swarm-body" data-training-page="" style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
        <h1 className="dm-sidecar-title" style={{ display: "block", marginBottom: 16 }}>Training</h1>
        <TrainingLedger />
      </main>
    </Suspense>
  );
}
