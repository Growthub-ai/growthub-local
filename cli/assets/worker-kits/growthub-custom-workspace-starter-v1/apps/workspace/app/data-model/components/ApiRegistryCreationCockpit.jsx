"use client";

/**
 * ApiRegistryCreationCockpit — the governed creation interface for one API,
 * rendered inside the existing api-registry record drawer (DataModelShell).
 *
 * Renders the ordered journey from `deriveApiRegistryCreationState`
 * (lib/api-registry-creation-flow.js) plus, once the API is tested, the response
 * Shape analysis (`profileApiResponse` / `recommendResolver`) and a receipts log
 * of real actions. Every actionable step's button calls back into the drawer's
 * existing governed handlers via `onAction(action)` — status, the highlighted
 * "next" step, the activation score, and which buttons are live all come from
 * derivation/real responses, never guessed.
 *
 * Visual language is the workspace's own: the `.dm-db-status` chip and `dm-btn-*`
 * buttons. No invented colors, no new primitive.
 */

const STEP_STATUS = {
  complete: { mod: "ok", label: "Done" },
  active: { mod: "warn", label: "Next" },
  pending: { mod: "", label: "Pending" },
  blocked: { mod: "", label: "Blocked" },
  optional: { mod: "", label: "Optional" },
};

const RESOLVER_LEVEL = {
  optional: { mod: "", label: "Resolver optional" },
  recommended: { mod: "warn", label: "Resolver recommended" },
  required: { mod: "bad", label: "Resolver required" },
};

function StatusChip({ mod, children, className = "" }) {
  return (
    <span className={`dm-db-status${mod ? ` ${mod}` : ""}${className ? ` ${className}` : ""}`}>
      <span />
      {children}
    </span>
  );
}

export function ApiRegistryCreationCockpit({
  state,
  onAction,
  busyAction = "",
  disabled = false,
  profile = null,
  resolverRec = null,
  receipts = [],
  dataSourcePreview = null,
  eyebrow = "Governed creation",
}) {
  if (!state || !Array.isArray(state.steps)) return null;
  const candidates = profile?.candidates || {};
  const candidateEntries = Object.entries(candidates).filter(([, v]) => v);
  const previewRow = dataSourcePreview?.row || null;

  return (
    <section className="dm-api-action-card dm-cockpit" aria-label="API creation journey">
      <div className="dm-cockpit-head">
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">{eyebrow} · {state.score}% activated</p>
          <h3>{state.headline}</h3>
        </div>
        <span className="dm-cockpit-count">{state.completedCount}/{state.totalCount}</span>
      </div>

      <ol className="dm-cockpit-steps">
        {state.steps.map((step) => {
          const meta = STEP_STATUS[step.status] || STEP_STATUS.pending;
          const isNext = step.id === state.nextStepId;
          const action = step.action;
          const isBusy = action && busyAction === `${step.id}:${action.id}`;
          return (
            <li
              key={step.id}
              className={`dm-cockpit-step${isNext ? " dm-cockpit-step-next" : ""}${step.status === "blocked" ? " dm-cockpit-step-muted" : ""}`}
            >
              <StatusChip mod={meta.mod} className="dm-cockpit-step-chip">{meta.label}</StatusChip>
              <div className="dm-cockpit-step-body">
                <p className="dm-cockpit-step-label">{step.label}</p>
                <p className="dm-cockpit-step-desc">{step.description}</p>
                {step.hint ? <p className="dm-cockpit-step-hint">{step.hint}</p> : null}
              </div>
              {action ? (
                <button
                  type="button"
                  className={isNext ? "dm-btn-primary-sm" : "dm-btn-outline"}
                  disabled={disabled || Boolean(busyAction)}
                  onClick={() => onAction?.(action)}
                >
                  {isBusy ? "Working…" : action.label}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {profile && profile.parsed ? (
        <div className="dm-cockpit-shape">
          <div className="dm-cockpit-shape-head">
            <p className="dm-api-action-card-eyebrow">Response shape</p>
            {resolverRec ? (
              <StatusChip mod={(RESOLVER_LEVEL[resolverRec.level] || RESOLVER_LEVEL.optional).mod}>
                {(RESOLVER_LEVEL[resolverRec.level] || RESOLVER_LEVEL.optional).label}
              </StatusChip>
            ) : null}
          </div>
          <p className="dm-cockpit-step-desc">
            {profile.usable
              ? `${profile.recordCount} record${profile.recordCount === 1 ? "" : "s"}${profile.arrayPath ? ` at "${profile.arrayPath}"` : " (top-level)"} · entity "${profile.suggestedEntityType}".`
              : "No record array detected in the response."}
          </p>
          {resolverRec ? <p className="dm-cockpit-step-hint">{resolverRec.reason}</p> : null}
          {candidateEntries.length ? (
            <div className="dm-cockpit-fields">
              {candidateEntries.map(([role, name]) => (
                <span key={role} className="dm-cockpit-field"><b>{role}</b>{name}</span>
              ))}
            </div>
          ) : null}
          {profile.hasPagination ? (
            <p className="dm-cockpit-step-hint">Pagination keys present — a resolver is needed to fetch every page.</p>
          ) : null}
        </div>
      ) : null}

      {previewRow ? (
        <div className="dm-cockpit-shape">
          <p className="dm-api-action-card-eyebrow">Data Source preview</p>
          <p className="dm-cockpit-step-desc">
            Create will add a live-backed Data Source object that references this API by <code>registryId</code> and writes records to the source-records sidecar. Nothing fetches until you Refresh.
          </p>
          <div className="dm-cockpit-fields">
            <span className="dm-cockpit-field"><b>name</b>{previewRow.Name}</span>
            <span className="dm-cockpit-field"><b>sourceId</b>{previewRow.sourceId}</span>
            <span className="dm-cockpit-field"><b>storage</b>{previewRow.sourceStorage}</span>
            <span className="dm-cockpit-field"><b>entity</b>{previewRow.entityType}</span>
            <span className="dm-cockpit-field"><b>registryId</b>{previewRow.registryId}</span>
            {previewRow.authRef ? <span className="dm-cockpit-field"><b>authRef</b>{previewRow.authRef}</span> : null}
          </div>
          {Array.isArray(dataSourcePreview.fields) && dataSourcePreview.fields.length ? (
            <>
              <p className="dm-cockpit-step-hint">Detected fields it will carry:</p>
              <div className="dm-cockpit-fields">
                {dataSourcePreview.fields.slice(0, 10).map((f) => (
                  <span key={f.name} className="dm-cockpit-field"><b>{f.role || f.type}</b>{f.name}</span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {Array.isArray(receipts) && receipts.length ? (
        <div className="dm-cockpit-receipts">
          <p className="dm-api-action-card-eyebrow">Receipts</p>
          <ul>
            {receipts.slice(0, 6).map((r, i) => (
              <li key={`${r.at}-${i}`} className="dm-cockpit-receipt">
                <StatusChip mod={r.ok ? "ok" : "bad"} className="dm-cockpit-receipt-chip">{r.kind}</StatusChip>
                <span className="dm-cockpit-receipt-text">{r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default ApiRegistryCreationCockpit;
