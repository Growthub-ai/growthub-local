"use client";

import { X } from "lucide-react";
import { summarizeOrchestrationGraph } from "@/lib/orchestration-graph";

export function SandboxToolConfirmModal({ draft, graph, onConfirm, onCancel, creating }) {
  const name = String(draft?.name || draft?.Name || "").trim();
  const runLocality = String(draft?.runLocality || "serverless").trim();
  const authRef = String(draft?.authRef || "").trim();

  return (
    <div className="dm-json-modal-backdrop" onClick={creating ? undefined : onCancel}>
      <section
        className="dm-registry-review-modal dm-sandbox-tool-confirm"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm sandbox tool creation"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>Confirm</p>
            <h2>Create sandbox tool?</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onCancel} disabled={creating} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="dm-registry-review-modal-body">
          <ul className="dm-sandbox-tool-confirm-list">
            <li>This will create one Sandbox Environment row named <strong>{name || "—"}</strong>.</li>
            <li>It will reference <code>{authRef || "authRef"}</code> only — no secrets are stored.</li>
            <li>It will not create a widget or mutate dashboards.</li>
            <li>It will not call the provider until you run an explicit sandbox test.</li>
          </ul>
          <p className="dm-orch-canvas-summary">{summarizeOrchestrationGraph(graph)}</p>
          <p className="dm-cell-empty">Run locality: {runLocality}</p>
        </div>
        <footer className="dm-registry-review-modal-foot">
          <button type="button" className="dm-btn-outline" onClick={onCancel} disabled={creating}>Cancel</button>
          <button type="button" className="dm-btn-primary-sm" onClick={onConfirm} disabled={creating}>
            {creating ? "Creating…" : "Create tool"}
          </button>
        </footer>
      </section>
    </div>
  );
}
