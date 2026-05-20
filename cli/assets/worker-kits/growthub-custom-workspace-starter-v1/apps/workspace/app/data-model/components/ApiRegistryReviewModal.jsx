"use client";

import { X } from "lucide-react";

export function ApiRegistryReviewModal({ registryRow, onContinue, onCancel }) {
  const integrationId = String(registryRow?.integrationId || "").trim();
  const endpoint = String(registryRow?.endpoint || "").trim();
  const method = String(registryRow?.method || "GET").trim().toUpperCase();
  const authRef = String(registryRow?.authRef || "").trim();

  return (
    <div className="dm-json-modal-backdrop" onClick={onCancel}>
      <section
        className="dm-registry-review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Review API before tool creation"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>Connected API</p>
            <h2>{registryRow?.Name || integrationId || "API Registry"}</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="dm-registry-review-modal-body">
          <p>
            This endpoint returned a valid response. You can now turn it into a governed sandbox tool with a visual orchestration plan.
          </p>
          <dl className="dm-registry-review-facts">
            <div>
              <dt>Integration</dt>
              <dd>{integrationId || "—"}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{method}</dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd><code>{endpoint || "—"}</code></dd>
            </div>
            <div>
              <dt>Auth reference</dt>
              <dd><code>{authRef || "—"}</code> (server-side only)</dd>
            </div>
          </dl>
        </div>
        <footer className="dm-registry-review-modal-foot">
          <button type="button" className="dm-btn-outline" onClick={onCancel}>Cancel</button>
          <button type="button" className="dm-btn-primary-sm" onClick={onContinue}>Configure tool</button>
        </footer>
      </section>
    </div>
  );
}
