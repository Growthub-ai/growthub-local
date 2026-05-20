"use client";

export function ApiRegistryActionCard({ registryLabel, existingToolCount, onCreateTool, disabled }) {
  return (
    <section className="dm-registry-action-card" aria-label="Create sandbox tool">
      <div className="dm-registry-action-card-body">
        <p className="dm-registry-action-card-eyebrow">API tested successfully</p>
        <h3 className="dm-registry-action-card-title">Create executable tool</h3>
        <p className="dm-registry-action-card-copy">
          Turn this endpoint into a sandbox tool your workspace assistant and agents can run safely.
          {existingToolCount > 0 && (
            <span className="dm-registry-action-card-meta">
              {" "}
              {existingToolCount} existing sandbox tool{existingToolCount === 1 ? "" : "s"} reference this registry.
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        className="dm-btn-primary-sm"
        disabled={disabled}
        onClick={onCreateTool}
      >
        Create sandbox tool
      </button>
    </section>
  );
}
