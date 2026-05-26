"use client";

/**
 * Growthub Workspace Activation Panel V1 — customer-facing setup checklist.
 *
 * Mounted inside the existing WorkspaceRail Home tab. Reads the derived
 * activation state from `workspace-activation.js` and renders a goal-first
 * checklist with deep links into the existing governed surfaces
 * (Data Model, Workflows, Dashboard).
 *
 * Invariants:
 *   - No new persistence authority. Step status is derived on every render.
 *   - No new navigation system. Links route into existing surfaces.
 *   - No secrets. Render text comes from the derivation helper which never
 *     echoes auth material.
 *   - Backwards compatible: hidden when workspace config is missing.
 */

import { useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Lock,
  Sparkles
} from "lucide-react";
import { deriveWorkspaceActivationState } from "@/lib/workspace-activation";

function buildHref(link) {
  if (!link || typeof link.pathname !== "string") return null;
  const pathname = link.pathname || "/";
  const query = link.query && typeof link.query === "object" ? link.query : {};
  const search = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return search ? `${pathname}?${search}` : pathname;
}

function StepStatusIcon({ status }) {
  if (status === "complete") return <CheckCircle2 size={16} className="ws-activation-icon ws-activation-icon-complete" aria-hidden="true" />;
  if (status === "blocked") return <Lock size={14} className="ws-activation-icon ws-activation-icon-blocked" aria-hidden="true" />;
  return <Circle size={14} className="ws-activation-icon ws-activation-icon-pending" aria-hidden="true" />;
}

function ActivationStepRow({ step, isNext, onAskHelper }) {
  const href = buildHref(step.link);
  const statusLabel = step.status === "complete"
    ? "Complete"
    : step.status === "blocked" ? "Blocked" : isNext ? "Next" : "Pending";
  return (
    <li
      className={
        "ws-activation-step"
        + (step.status === "complete" ? " is-complete" : "")
        + (step.status === "blocked" ? " is-blocked" : "")
        + (isNext ? " is-next" : "")
      }
      data-step-id={step.id}
    >
      <div className="ws-activation-step-head">
        <StepStatusIcon status={step.status} />
        <span className="ws-activation-step-label">{step.label}</span>
        <span className="ws-activation-step-status" aria-label={statusLabel}>{statusLabel}</span>
      </div>
      {step.description ? (
        <p className="ws-activation-step-desc">{step.description}</p>
      ) : null}
      {step.help ? (
        <p className="ws-activation-step-help" role="note">{step.help}</p>
      ) : null}
      {href && step.status !== "complete" ? (
        <div className="ws-activation-step-actions">
          <Link href={href} className="ws-activation-step-cta" data-activation-link={step.id}>
            {step.link?.label || "Open"} <ChevronRight size={13} aria-hidden="true" />
          </Link>
          {isNext && typeof onAskHelper === "function" ? (
            <button
              type="button"
              className="ws-activation-step-helper-btn"
              onClick={() => onAskHelper(step)}
              data-activation-helper={step.id}
            >
              <Sparkles size={12} aria-hidden="true" /> Ask helper
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * WorkspaceActivationPanel — drop-in slot for WorkspaceRail Home tab.
 *
 * Props:
 *   workspaceConfig         — governed config (required to render)
 *   workspaceSourceRecords  — sidecar sources for derivation (optional)
 *   runtimeStatus           — safe adapter booleans (optional). Example:
 *                              { nango: { hasSecretKey: true } }
 *   onAskHelper(step)       — invoked when user clicks "Ask helper" on the
 *                              next step. Optional. The panel falls back to
 *                              opening the helper sidecar via existing
 *                              WorkspaceRail handlers when omitted.
 */
export function WorkspaceActivationPanel({
  workspaceConfig,
  workspaceSourceRecords,
  runtimeStatus,
  onAskHelper
}) {
  const activation = useMemo(
    () => deriveWorkspaceActivationState({
      workspaceConfig,
      workspaceSourceRecords,
      runtimeStatus
    }),
    [workspaceConfig, workspaceSourceRecords, runtimeStatus]
  );

  if (!workspaceConfig) return null;

  const { template, summary, steps, completedSteps, totalSteps, done, nextStepId } = activation;
  const progressPct = totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100);

  return (
    <section className="ws-activation-panel" aria-label="Workspace activation checklist" data-template-id={template.id}>
      <header className="ws-activation-head">
        <div className="ws-activation-head-text">
          <span className="ws-activation-eyebrow">
            {template.isBlank ? "Get started" : "Setup checklist"}
          </span>
          <h2 className="ws-activation-title">{template.name}</h2>
          <p className="ws-activation-summary">{summary}</p>
        </div>
        <div
          className="ws-activation-progress"
          role="progressbar"
          aria-valuenow={completedSteps}
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-label={`${completedSteps} of ${totalSteps} steps complete`}
        >
          <div className="ws-activation-progress-bar">
            <div className="ws-activation-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="ws-activation-progress-label">{completedSteps}/{totalSteps}</span>
        </div>
      </header>
      {done ? (
        <p className="ws-activation-done" role="status">
          <CheckCircle2 size={14} aria-hidden="true" /> Workspace is ready. Customize objects, widgets, or workflows to extend it.
        </p>
      ) : (
        <ol className="ws-activation-steps" role="list">
          {steps.map((step) => (
            <ActivationStepRow
              key={step.id}
              step={step}
              isNext={step.id === nextStepId}
              onAskHelper={onAskHelper}
            />
          ))}
        </ol>
      )}
      {activation.warnings.length > 0 ? (
        <ul className="ws-activation-warnings" aria-label="Setup warnings">
          {activation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default WorkspaceActivationPanel;
