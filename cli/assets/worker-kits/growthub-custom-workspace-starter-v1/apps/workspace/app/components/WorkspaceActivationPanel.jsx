"use client";

/**
 * WorkspaceActivationPanel — customer activation checklist.
 *
 * Renders the derived activation state from
 * `lib/workspace-activation.js` as a goal-first checklist with deep links
 * into the existing surfaces. The panel is read-only; every step routes
 * through routes the workspace already owns.
 *
 * Props:
 *   workspaceConfig         — parsed growthub.config.json (governed)
 *   workspaceSourceRecords  — parsed growthub.source-records.json (sidecar)
 *   metadataGraph           — optional metadata graph envelope
 *   onOpenHelper            — optional helper-thread CTA handler
 *   compact                 — render the rail-friendly compact variant
 *
 * Invariants:
 *   - No fetch. No mutation. No secret reading.
 *   - Reads only safe data (booleans, status strings, deep-link routes).
 *   - Falls back to a sensible default state if config is missing.
 */

import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDot,
  HelpCircle,
  Lock,
  Sparkles,
} from "lucide-react";
import { deriveWorkspaceActivationState, deriveWorkspaceState } from "@/lib/workspace-activation";

function StatusIcon({ status }) {
  if (status === "complete") return <Check size={14} aria-hidden="true" />;
  if (status === "blocked") return <Lock size={14} aria-hidden="true" />;
  if (status === "optional") return <Sparkles size={14} aria-hidden="true" />;
  return <CircleDot size={14} aria-hidden="true" />;
}

function StatusLabel({ status }) {
  if (status === "complete") return "Done";
  if (status === "blocked") return "Blocked";
  if (status === "optional") return "Optional";
  return "Next";
}

export function WorkspaceActivationPanel({
  workspaceConfig,
  workspaceSourceRecords,
  metadataGraph,
  onOpenHelper,
  compact = false,
  showLenses = false,
}) {
  const state = deriveWorkspaceActivationState({
    workspaceConfig,
    workspaceSourceRecords,
    metadataGraph,
  });

  // Secondary readiness lenses are intentionally subordinate: they appear only
  // once the primary activation loop is complete, so first-run stays a focused
  // 5-step flow with zero added bloat. They render as neutral, icon-free status
  // readouts — not a second checklist competing for attention. Pure derivation;
  // no fetch, no mutation, no secrets.
  const composedState = (showLenses && !compact && state.complete)
    ? deriveWorkspaceState({ workspaceConfig, workspaceSourceRecords, metadataGraph })
    : null;
  const secondaryLenses = composedState ? Object.values(composedState.lenses) : [];

  const stepsToRender = compact
    ? state.steps.filter((step) => step.status !== "optional")
    : state.steps;

  return (
    <section
      className={
        "workspace-activation-panel"
        + (compact ? " is-compact" : "")
        + (state.complete ? " is-complete" : "")
      }
      aria-label="Workspace activation"
      data-template={state.template}
    >
      <header className="workspace-activation-head">
        <div className="workspace-activation-head-text">
          <p className="workspace-activation-eyebrow">{state.templateName}</p>
          <h2 className="workspace-activation-headline">{state.headline}</h2>
          {state.subheadline ? (
            <p className="workspace-activation-subheadline">{state.subheadline}</p>
          ) : null}
        </div>
        <div
          className="workspace-activation-progress"
          aria-label={`${state.completedCount} of ${state.totalCount} setup steps complete`}
        >
          <span className="workspace-activation-progress-value">
            {state.completedCount}/{state.totalCount}
          </span>
          <span className="workspace-activation-progress-bar" aria-hidden="true">
            <span
              className="workspace-activation-progress-fill"
              style={{
                width: state.totalCount > 0
                  ? `${Math.min(100, Math.round((state.completedCount / state.totalCount) * 100))}%`
                  : "0%",
              }}
            />
          </span>
        </div>
      </header>

      <ol className="workspace-activation-steps" role="list">
        {stepsToRender.map((step) => {
          const isNext = state.nextStepId === step.id;
          return (
            <li
              key={step.id}
              className={
                "workspace-activation-step"
                + ` is-${step.status}`
                + (isNext ? " is-next" : "")
              }
            >
              <span className="workspace-activation-step-status" aria-hidden="true">
                <StatusIcon status={step.status} />
              </span>
              <div className="workspace-activation-step-body">
                <div className="workspace-activation-step-titlebar">
                  <h3 className="workspace-activation-step-title">{step.label}</h3>
                  <span className={`workspace-activation-step-badge is-${step.status}`}>
                    <StatusLabel status={step.status} />
                  </span>
                </div>
                <p className="workspace-activation-step-description">{step.description}</p>
                {step.hint ? (
                  <p className="workspace-activation-step-hint">
                    <HelpCircle size={12} aria-hidden="true" />
                    <span>{step.hint}</span>
                  </p>
                ) : null}
                {step.href ? (
                  <Link
                    href={step.href}
                    className={
                      "workspace-activation-step-cta"
                      + (isNext ? " is-primary" : "")
                    }
                  >
                    <span>{step.cta || (step.status === "complete" ? "Review" : "Open")}</span>
                    <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {secondaryLenses.length > 0 ? (
        <div className="workspace-activation-lenses" aria-label="Workspace readiness">
          <p className="workspace-activation-lenses-title">Workspace readiness</p>
          <ul className="workspace-activation-lenses-list" role="list">
            {secondaryLenses.map((lens) => {
              const lensNext = (lens.steps || []).find((s) => s.id === lens.nextStepId) || null;
              return (
                <li
                  key={lens.lensId}
                  className={"workspace-activation-lens" + (lens.complete ? " is-complete" : "")}
                  data-lens={lens.lensId}
                >
                  <div className="workspace-activation-lens-head">
                    <span className="workspace-activation-lens-title">{lens.title}</span>
                    <span
                      className="workspace-activation-lens-progress"
                      aria-label={`${lens.completedCount} of ${lens.totalCount} ready`}
                    >
                      {lens.completedCount}/{lens.totalCount}
                    </span>
                  </div>
                  <p className="workspace-activation-lens-headline">{lens.headline}</p>
                  {!lens.complete && lensNext && lensNext.href ? (
                    <Link href={lensNext.href} className="workspace-activation-lens-cta">
                      {lensNext.cta || lensNext.label}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {onOpenHelper ? (
        <div className="workspace-activation-helper-cta">
          <button
            type="button"
            className="workspace-activation-helper-btn"
            onClick={() => onOpenHelper({
              template: state.template,
              nextStepId: state.nextStepId,
            })}
          >
            <Sparkles size={13} aria-hidden="true" />
            <span>
              {state.complete
                ? "Ask helper to customize this workspace"
                : `Ask helper to finish ${state.templateName}`}
            </span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
