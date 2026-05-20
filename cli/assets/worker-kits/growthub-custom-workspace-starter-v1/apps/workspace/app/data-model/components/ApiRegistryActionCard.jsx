"use client";

import { Terminal } from "lucide-react";

export function ApiRegistryActionCard({ onCreateTool, existingToolCount = 0, disabled }) {
  return (
    <section className="dm-registry-tool-card" data-testid="api-registry-create-sandbox-tool">
      <div className="dm-registry-tool-card-head">
        <Terminal size={16} aria-hidden="true" />
        <div>
          <p className="dm-registry-tool-card-eyebrow">API tested successfully</p>
          <h3>Create executable tool</h3>
        </div>
      </div>
      <p className="dm-registry-tool-card-copy">
        Turn this endpoint into a sandbox tool your workspace assistant and agents can run safely.
        Secrets stay server-side via authRef only.
      </p>
      {existingToolCount > 0 && (
        <p className="dm-registry-tool-card-meta">
          {existingToolCount} existing sandbox tool{existingToolCount === 1 ? "" : "s"} reference this registry row.
        </p>
      )}
      <button
        type="button"
        className="dm-btn-primary-sm dm-registry-tool-card-cta"
        disabled={disabled}
        onClick={onCreateTool}
      >
        Create sandbox tool
      </button>
    </section>
  );
}
