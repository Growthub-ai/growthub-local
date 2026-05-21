"use client";

import { X } from "lucide-react";
import { summarizeOrchestrationGraph } from "@/lib/orchestration-graph";

export function SandboxToolConfirmModal({
  open,
  toolName,
  authRef,
  orchestrationGraph,
  onConfirm,
  onCancel,
  creating
}) {
  if (!open) return null;

  const summary = summarizeOrchestrationGraph(orchestrationGraph);

  return (
    <div className="dm-orchestration-confirm dm-orchestration-confirm__backdrop" onClick={onCancel} role="presentation">
      <section
        className="dm-orchestration-confirm__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sandbox-tool-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dm-orchestration-confirm__head">
          <div>
            <p>Confirm</p>
            <h2 id="sandbox-tool-confirm-title">Create sandbox tool?</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="dm-orchestration-confirm__body">
          <p>This creates one Sandbox Environment row from the tested API Registry record.</p>
          <ul className="dm-orchestration-confirm__list">
            <li>Saves orchestrationGraph on the sandbox row</li>
            <li>Stores <code>{authRef || "authRef"}</code> only — no secrets</li>
            <li>Does not store secrets</li>
            <li>Does not create widgets</li>
            <li>Does not change dashboards</li>
            <li>Does not change canvas</li>
            <li>Does not run until you click Run sandbox</li>
          </ul>
          <p className="dm-orchestration-confirm__summary">
            <span>Run plan</span>
            {summary}
          </p>
        </div>
        <footer className="dm-orchestration-confirm__foot">
          <button type="button" className="dm-btn-outline" disabled={creating} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dm-btn-primary-sm" disabled={creating} onClick={onConfirm}>
            {creating ? "Creating…" : "Create tool"}
          </button>
        </footer>
      </section>
    </div>
  );
}
