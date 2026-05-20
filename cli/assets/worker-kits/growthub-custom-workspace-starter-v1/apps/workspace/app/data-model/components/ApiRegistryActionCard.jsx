"use client";

export function ApiRegistryActionCard({ onCreateSandboxTool, existingToolCount = 0 }) {
  return (
    <div className="dm-api-action-card">
      <div className="dm-api-action-card-copy">
        <p className="dm-api-action-card-eyebrow">API tested successfully</p>
        <h3>Create executable tool</h3>
        <p>
          Turn this endpoint into a sandbox tool your workspace assistant and agents can run safely.
        </p>
        {existingToolCount > 0 && (
          <p className="dm-api-action-card-hint">
            {existingToolCount} sandbox tool{existingToolCount === 1 ? "" : "s"} already reference this registry row.
          </p>
        )}
      </div>
      <button type="button" className="dm-btn-primary-sm" onClick={onCreateSandboxTool}>
        Create sandbox tool
      </button>
    </div>
  );
}
