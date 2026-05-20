"use client";

import { CheckCircle2, X } from "lucide-react";

/**
 * Read-only summary of a successfully tested API Registry row.
 * Shown at the top of the sandbox-tool draft flow (not a blocking modal).
 */
export function ApiRegistryReviewModal({ registryRow, onClose = null }) {
  if (!registryRow) return null;
  const integrationId = String(registryRow.integrationId || "").trim();
  const endpoint = String(registryRow.endpoint || "").trim();
  const method = String(registryRow.method || "GET").trim().toUpperCase();
  const baseUrl = String(registryRow.baseUrl || "").trim();

  return (
    <section className="dm-api-review-banner" aria-label="Connected API summary">
      <div className="dm-api-review-banner-icon" aria-hidden="true">
        <CheckCircle2 size={18} />
      </div>
      <div className="dm-api-review-banner-body">
        <p className="dm-api-review-banner-eyebrow">Connected API</p>
        <h3>{registryRow.Name || integrationId}</h3>
        <p>
          This endpoint returned a valid response. You can now turn it into a sandbox tool.
        </p>
        <code className="dm-api-review-banner-route">
          {method} {baseUrl && endpoint ? `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}` : endpoint || baseUrl}
        </code>
      </div>
      {onClose && (
        <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Dismiss summary">
          <X size={16} />
        </button>
      )}
    </section>
  );
}
