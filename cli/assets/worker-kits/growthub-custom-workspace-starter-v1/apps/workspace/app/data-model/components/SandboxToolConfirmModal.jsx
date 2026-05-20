"use client";

import { AlertTriangle, X } from "lucide-react";
import { summarizeOrchestrationGraph } from "@/lib/orchestration-graph";

export function SandboxToolConfirmModal({ draft, registryRow, onConfirm, onCancel, saving }) {
  const name = String(draft?.Name || "").trim();
  const locality = String(draft?.runLocality || "local").trim();
  const authRef = String(draft?.authRef || draft?.envRefs || registryRow?.authRef || "").trim();
  const graphSummary = summarizeOrchestrationGraph(draft?.orchestrationGraph);

  return (
    <div className="dm-sandbox-confirm-backdrop" onClick={onCancel} role="presentation">
      <section
        className="dm-sandbox-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm sandbox tool creation"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>Create sandbox tool?</p>
            <h2>{name || "New sandbox tool"}</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="dm-sandbox-confirm-body">
          <p>This will create one Sandbox Environment row in your governed data model.</p>
          <ul>
            <li>References authRef <strong>{authRef || "—"}</strong> only — no secrets stored.</li>
            <li>Run locality: <strong>{locality}</strong>.</li>
            <li>Does not create a widget or mutate dashboards.</li>
            <li>Does not call the provider until you run an explicit sandbox test.</li>
          </ul>
          <p className="dm-sandbox-confirm-graph">{graphSummary}</p>
          <div className="dm-sandbox-confirm-warn">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Execution uses POST /api/workspace/sandbox-run after you click Run test.</span>
          </div>
        </div>
        <footer className="dm-sandbox-confirm-foot">
          <button type="button" className="dm-btn-outline" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dm-btn-primary-sm" disabled={saving} onClick={onConfirm}>
            {saving ? "Creating…" : "Create tool"}
          </button>
        </footer>
      </section>
    </div>
  );
}
