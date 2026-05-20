"use client";

import { CheckCircle2, X } from "lucide-react";

export function ApiRegistryReviewModal({ registryRow, onClose }) {
  const integrationId = String(registryRow?.integrationId || registryRow?.Name || "").trim();
  const endpoint = String(registryRow?.endpoint || "").trim();
  const method = String(registryRow?.method || "GET").trim().toUpperCase();
  const testedAt = String(registryRow?.lastTested || "").trim();

  return (
    <div className="dm-registry-review-backdrop" onClick={onClose} role="presentation">
      <section
        className="dm-registry-review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Connected API summary"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>Connected API</p>
            <h2>{registryRow?.Name || integrationId || "API Registry row"}</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="dm-registry-review-body">
          <div className="dm-registry-review-status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>This endpoint returned a valid response. You can now turn it into a sandbox tool.</span>
          </div>
          <dl className="dm-registry-review-facts">
            <div>
              <dt>Integration</dt>
              <dd>{integrationId || "—"}</dd>
            </div>
            <div>
              <dt>Request</dt>
              <dd>
                {method} {endpoint || "—"}
              </dd>
            </div>
            <div>
              <dt>Auth ref</dt>
              <dd>{registryRow?.authRef || "—"}</dd>
            </div>
            <div>
              <dt>Last tested</dt>
              <dd>{testedAt ? new Date(testedAt).toLocaleString() : "—"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
