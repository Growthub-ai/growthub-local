"use client";

export function SandboxToolConfirmModal({ open, draftName, authRef, runLocality, onConfirm, onCancel, saving }) {
  if (!open) return null;

  return (
    <div className="dm-orch-modal-backdrop dm-orch-modal-backdrop-nested" onClick={onCancel}>
      <div className="dm-dialog dm-sandbox-tool-confirm" role="dialog" aria-labelledby="sandbox-tool-confirm-title" onClick={(e) => e.stopPropagation()}>
        <header className="dm-dialog-head">
          <h2 id="sandbox-tool-confirm-title">Create sandbox tool?</h2>
        </header>
        <div className="dm-dialog-body">
          <p>This will create one Sandbox Environment row in your Data Model.</p>
          <ul className="dm-sandbox-tool-confirm-list">
            <li>
              <strong>{draftName || "Untitled tool"}</strong>
            </li>
            <li>References <code>{authRef || "authRef"}</code> only — no secrets stored.</li>
            <li>Run locality: <code>{runLocality || "local"}</code></li>
            <li>Will not create a widget or mutate dashboards.</li>
            <li>Will not call the provider until you run an explicit sandbox test.</li>
          </ul>
        </div>
        <footer className="dm-dialog-actions">
          <button type="button" className="dm-btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="dm-btn-primary-sm" onClick={onConfirm} disabled={saving}>
            {saving ? "Creating…" : "Create tool"}
          </button>
        </footer>
      </div>
    </div>
  );
}
