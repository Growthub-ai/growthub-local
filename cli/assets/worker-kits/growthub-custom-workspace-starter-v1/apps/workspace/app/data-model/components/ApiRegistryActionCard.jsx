"use client";

import { ExternalLink, Play, Terminal } from "lucide-react";
import { getApiRegistrySandboxToolState } from "@/lib/orchestration-graph";

export function ApiRegistryActionCard({
  registryRow,
  workspaceConfig,
  disabled,
  onCreateSandboxTool,
  onOpenSandboxTool,
  onRunSandboxTool,
  sandboxRunning
}) {
  const state = getApiRegistrySandboxToolState(registryRow, workspaceConfig);

  if (state.kind === "incomplete" || state.kind === "untested" || state.kind === "failed") {
    return (
      <section className="dm-api-action-card dm-api-action-card-muted" aria-label="Sandbox tool prerequisites">
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">
            {state.kind === "failed" ? "Connection not ready" : "Sandbox tool"}
          </p>
          <p>{state.message}</p>
        </div>
      </section>
    );
  }

  if (state.kind === "existing") {
    const toolName = String(state.row?.Name || "").trim();
    return (
      <section className="dm-api-action-card" aria-label="Open sandbox tool">
        <div className="dm-api-action-card-icon" aria-hidden="true">
          <Terminal size={18} />
        </div>
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">Sandbox tool exists</p>
          <h3>{toolName}</h3>
          <p>Governed sandbox row linked to this API Registry entry.</p>
        </div>
        <div className="dm-api-action-card-actions">
          <button
            type="button"
            className="dm-btn-outline dm-api-action-card-cta"
            disabled={disabled || !toolName}
            onClick={() => onOpenSandboxTool?.({ name: toolName })}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open sandbox tool
          </button>
          <button
            type="button"
            className="dm-btn-primary-sm dm-api-action-card-cta"
            disabled={disabled || sandboxRunning || !toolName}
            onClick={() => onRunSandboxTool?.({ name: toolName })}
          >
            <Play size={14} aria-hidden="true" />
            {sandboxRunning ? "Running…" : "Run sandbox"}
          </button>
        </div>
      </section>
    );
  }

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
