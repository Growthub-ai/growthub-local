"use client";

/**
 * ComputeRealizationPanel — Sprint 10 of the Governed Compute Realization.
 *
 * The progressive-disclosure compute surface shared by the Training Runtime
 * modal and the /custom-models cockpit. Renders ONLY the output of
 * `deriveComputeCustomerState` (the same deriver the runtime evidence
 * feeds) — no client-side state machine, no fabricated progress, no
 * provider internals in the customer layer. Operator evidence (provider
 * ids, skip reasons, refused events) lives behind the existing
 * `<details class="training-advanced">` pattern.
 */

import { COMPUTE_POLICIES } from "../../../lib/compute-customer-state.js";

const TONE_CLASS = { ok: "is-ok", warn: "is-warn", bad: "is-bad", running: "is-running", muted: "" };

export default function ComputeRealizationPanel({ state, policy, onPolicyChange, showPolicyPicker = false }) {
  if (!state) return null;
  const tone = TONE_CLASS[state.tone] ?? "";
  return (
    <div className="dm-api-action-card dm-api-action-card-muted" data-compute-panel="" data-compute-state={state.stateId}>
      <div className="dm-api-action-card-body">
        <div className="dm-api-action-card-eyebrow">Compute</div>
        <div className="training-handoff-action-row">
          <span className={`dm-status-chip ${tone}`} data-compute-chip="">
            <span className="dm-status-dot" />
            {state.label}
          </span>
        </div>
        {state.detail ? <p className="dm-api-action-card-note" data-compute-detail="">{state.detail}</p> : null}

        {showPolicyPicker ? (
          <label className="training-field" data-compute-policy-field="">
            <span>Compute policy</span>
            <select value={policy} onChange={(e) => onPolicyChange?.(e.target.value)} data-compute-policy="">
              {COMPUTE_POLICIES.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <small>{COMPUTE_POLICIES.find((p) => p.id === policy)?.description || ""}</small>
          </label>
        ) : null}

        <div className="dm-cockpit-fields" data-compute-facts="">
          {state.requiredCapacity ? (
            <div className="dm-cockpit-field"><span>Required capacity</span><strong>{state.requiredCapacity}</strong></div>
          ) : null}
          {state.realization ? (
            <div className="dm-cockpit-field"><span>Selected realization</span><strong>{state.realization}</strong></div>
          ) : null}
          {state.budget?.label && state.budget.label !== "—" ? (
            <div className="dm-cockpit-field"><span>Budget</span><strong data-compute-budget-blocked={state.budget.blocked ? "true" : "false"}>{state.budget.label}</strong></div>
          ) : null}
          {state.checkpoint?.label && state.checkpoint.label !== "—" ? (
            <div className="dm-cockpit-field"><span>Checkpoint</span><strong>{state.checkpoint.label}</strong></div>
          ) : null}
          {state.release?.label && state.release.label !== "—" ? (
            <div className="dm-cockpit-field"><span>Capacity</span><strong data-compute-release-risk={state.release.risk ? "true" : "false"}>{state.release.label}</strong></div>
          ) : null}
        </div>

        {(state.advanced?.selectedProviderId || state.advanced?.skipped?.length > 0 || state.advanced?.localReasons?.length > 0) ? (
          <details className="training-advanced" data-compute-advanced="">
            <summary>Advanced · placement evidence</summary>
            {state.advanced.selectedProviderId ? (
              <p className="dm-api-action-card-note">
                Selected: <code>{state.advanced.selectedProviderId}</code>
                {state.advanced.selectedReasons.length ? ` — ${state.advanced.selectedReasons.join("; ")}` : ""}
              </p>
            ) : null}
            {state.advanced.localReasons.length > 0 ? (
              <p className="dm-api-action-card-note">This machine: {state.advanced.localReasons.join("; ")}</p>
            ) : null}
            {state.advanced.skipped.map((s) => (
              <p key={s.providerId} className="dm-api-action-card-note" data-compute-skipped={s.providerId}>
                <code>{s.providerId}</code>: {s.reasons.join("; ")}
              </p>
            ))}
            {state.advanced.refusedEvents > 0 ? (
              <p className="dm-api-action-card-note">{state.advanced.refusedEvents} provider event(s) refused by the evidence gate.</p>
            ) : null}
          </details>
        ) : null}
      </div>
    </div>
  );
}
