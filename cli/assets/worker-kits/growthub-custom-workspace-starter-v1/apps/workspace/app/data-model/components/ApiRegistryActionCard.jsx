"use client";

import { Check, ExternalLink, Play, Terminal, X } from "lucide-react";
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

  if (state.kind === "incomplete") {
    const checklist = state.checklist || [];
    return (
      <section className="dm-api-action-card dm-api-action-card-muted" aria-label="Complete API setup">
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">API Registry</p>
          <h3>Complete API setup</h3>
          <p>
            This API needs a registry ID, base URL, endpoint, method, and auth reference before it can become a sandbox tool.
          </p>
          <ul className="dm-api-action-checklist">
            {checklist.map((item) => (
              <li key={item.field} className={item.ok ? "is-done" : "is-pending"}>
                {item.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                <span>{item.field}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  if (state.kind === "untested" || state.kind === "failed") {
    return (
      <section className="dm-api-action-card dm-api-action-card-muted" aria-label="Sandbox tool prerequisites">
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">
            {state.kind === "failed" ? "Connection not ready" : "Sandbox tool"}
          </p>
          <h3>{state.kind === "failed" ? "Fix connection test" : "Test connection first"}</h3>
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
            {sandboxRunning ? "Running…" : "Run test"}
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
        <h3>Create sandbox tool</h3>
        <p>
          This API is connected. Turn it into a sandbox tool that agents can run safely from this workspace.
        </p>
        <p className="dm-api-action-card-note">No secrets are stored. Nothing runs until you test the sandbox.</p>
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
