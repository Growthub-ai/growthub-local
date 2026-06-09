"use client";

/**
 * ApiRegistryCreationCockpit — the governed creation interface for one API,
 * rendered inside the existing api-registry record drawer (DataModelShell).
 *
 * It renders the ordered journey produced by `deriveApiRegistryCreationState`
 * (lib/api-registry-creation-flow.js) and turns each step's `action` descriptor
 * into a real button that calls back into the drawer's existing governed
 * handlers via `onAction(action)`. Status, the highlighted "next" step, and
 * which buttons are live all come from the derivation — interface and truth
 * stay in lockstep.
 *
 * Visual language is the workspace's own: the `.dm-db-status` chip (the same
 * dot+label the drawer already shows for a row's status) and the `dm-btn-*`
 * buttons. No invented colors, no new primitive.
 */

// Map a derived step status onto the existing .dm-db-status modifier + label.
const STEP_STATUS = {
  complete: { mod: "ok", label: "Done" },
  active: { mod: "warn", label: "Next" },
  pending: { mod: "", label: "Pending" },
  blocked: { mod: "", label: "Blocked" },
  optional: { mod: "", label: "Optional" },
};

export function ApiRegistryCreationCockpit({ state, onAction, busyAction = "", disabled = false }) {
  if (!state || !Array.isArray(state.steps)) return null;

  return (
    <section className="dm-api-action-card dm-cockpit" aria-label="API creation journey">
      <div className="dm-cockpit-head">
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">Governed creation</p>
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
              <span className={`dm-db-status${meta.mod ? ` ${meta.mod}` : ""} dm-cockpit-step-chip`}>
                <span />
                {meta.label}
              </span>
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
    </section>
  );
}

export default ApiRegistryCreationCockpit;
