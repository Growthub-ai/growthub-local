"use client";

import { Terminal } from "lucide-react";
import { isApiRegistryTestSuccessful } from "@/lib/orchestration-graph";

export function ApiRegistryActionCard({ registryRow, onCreateSandboxTool, disabled }) {
  if (!isApiRegistryTestSuccessful(registryRow)) return null;

  return (
    <section className="dm-api-action-card" aria-label="Create sandbox tool">
      <div className="dm-api-action-card-icon" aria-hidden="true">
        <Terminal size={18} />
      </div>
      <div className="dm-api-action-card-body">
        <p className="dm-api-action-card-eyebrow">API tested successfully</p>
        <h3>Create executable tool</h3>
        <p>
          Turn this endpoint into a sandbox tool your workspace assistant and agents can run safely.
        </p>
      </div>
      <button
        type="button"
        className="dm-btn-primary-sm dm-api-action-card-cta"
        disabled={disabled}
        onClick={onCreateSandboxTool}
      >
        Create sandbox tool
      </button>
    </section>
  );
}
