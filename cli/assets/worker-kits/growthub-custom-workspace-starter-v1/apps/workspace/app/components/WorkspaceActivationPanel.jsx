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
import { deriveWorkspaceActivationState } from "@/lib/workspace-activation";

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

  // Onboarding stays pure. Once the primary loop completes we don't render
  // operating-state cards inside the checklist — we hand the user off to the
  // dedicated Workspace Lens surface (the "you levelled up" moment).
  const showLensTeaser = showLenses && !compact && state.complete;

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

      {showLensTeaser ? (
        <div className="workspace-activation-lens-teaser">
          <span className="workspace-activation-lens-teaser-text">
            Workspace Lens is now available — your live operating surface for state, blockers, and agent-assignable work.
          </span>
          <Link href="/workspace-lens" className="workspace-activation-lens-teaser-link">
            Open Workspace Lens
          </Link>
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
