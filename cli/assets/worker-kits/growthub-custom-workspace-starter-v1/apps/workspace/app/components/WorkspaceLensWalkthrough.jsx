"use client";

/**
 * WorkspaceLensWalkthrough — one-time guided reveal of Workspace Lens.
 *
 * A small, calm popover (white bg, 1px grey border, 5px radius, soft shadow)
 * with a single X (top-right) to dismiss and a step counter + primary action
 * (bottom-right). It is rendered only in the in-between state (onboarding
 * complete, lens unlocked, no activity yet) and is dismissed permanently via
 * the same workspace-ui-cache flag the onboarding dismiss uses.
 *
 * Three steps across the handoff:
 *   1. (anchored to the new Workspace Lens nav item) — the reveal.
 *   2. (on the lens surface) — what this is. Don't overwhelm.
 *   3. (on the lens surface) — take a first action; the daily ritual.
 */

import { X } from "lucide-react";

const STEPS = {
  1: {
    eyebrow: "New",
    title: "Workspace Lens is unlocked",
    body: "You finished setup — your workspace now has a live operating surface. Take a look.",
    cta: "Open Workspace Lens",
  },
  2: {
    eyebrow: "Workspace Lens",
    title: "This is your live workspace state",
    body: "A derived view of what's healthy, what's blocked, and what's ready to act on. Nothing to configure — it reflects reality.",
    cta: "Next",
  },
  3: {
    eyebrow: "Daily ritual",
    title: "Start each session here",
    body: "Check your activity graph, then act on the top blocked or agent-assignable item. That's the loop.",
    cta: "Got it",
  },
};

export function WorkspaceLensWalkthrough({ step = 1, onPrimary, onDismiss, className, style }) {
  const s = STEPS[step] || STEPS[1];
  return (
    <div
      className={"workspace-lens-walkthrough" + (className ? " " + className : "")}
      style={style}
      role="dialog"
      aria-label="Workspace Lens walkthrough"
    >
      <button
        type="button"
        className="workspace-lens-walkthrough-x"
        aria-label="Dismiss walkthrough"
        onClick={onDismiss}
      >
        <X size={13} aria-hidden="true" />
      </button>
      {s.eyebrow ? <p className="workspace-lens-walkthrough-eyebrow">{s.eyebrow}</p> : null}
      <h3 className="workspace-lens-walkthrough-title">{s.title}</h3>
      <p className="workspace-lens-walkthrough-body">{s.body}</p>
      <div className="workspace-lens-walkthrough-footer">
        <span className="workspace-lens-walkthrough-steps">{step} / 3</span>
        <button type="button" className="workspace-lens-walkthrough-next" onClick={() => onPrimary?.(step)}>
          {s.cta}
        </button>
      </div>
    </div>
  );
}
