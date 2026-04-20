/**
 * Hosted activation nudge — thin, non-intrusive CTA printed at the
 * end of natural completion milestones (kit download, source import,
 * starter init). It is deliberately:
 *
 *   - never an interactive prompt
 *   - never auto-opens a browser
 *   - never collects email or any other input inside the CLI
 *   - never shown more than once per CLI invocation
 *
 * Email / lead capture is owned by the hosted app and happens after
 * `growthub auth login` completes. This nudge exists only to bridge
 * an operator who already saw local value to the documented first-
 * month $1 activation path on growthub.ai.
 */

import pc from "picocolors";
import { captureEvent } from "../runtime/telemetry/index.js";

/**
 * Canonical hosted activation URL. Matches the badges already in:
 *   - README.md
 *   - cli/README.md
 *   - packages/create-growthub-local/README.md
 *
 * Treat those READMEs as source of truth — do not diverge here.
 */
export const GROWTHUB_ACTIVATION_URL = "https://www.growthub.ai/";

export type ActivationNudgeSurface =
  | "kit_download"
  | "source_import_repo"
  | "source_import_skill"
  | "starter_init";

interface NudgeContent {
  headline: string;
  reason: string;
}

const CONTENT_BY_SURFACE: Record<ActivationNudgeSurface, NudgeContent> = {
  kit_download: {
    headline: "Worker kit exported. Keep going locally — free forever.",
    reason:
      "Connect a Growthub account to unlock hosted workflows, integration bridges, and enterprise customization depth for this kit.",
  },
  source_import_repo: {
    headline: "Repo imported and registered as a governed fork.",
    reason:
      "Connect a Growthub account to unlock hosted workflow lanes and authority-backed sync for this fork.",
  },
  source_import_skill: {
    headline: "Skill imported and registered as a governed fork.",
    reason:
      "Connect a Growthub account to unlock hosted workflow lanes and authority-backed sync for this fork.",
  },
  starter_init: {
    headline: "Workspace scaffolded from the Custom Workspace Starter.",
    reason:
      "Connect a Growthub account to unlock hosted workflows and premium activation flows when you need them.",
  },
};

let nudgeShownThisProcess = false;

function terminalHyperlink(label: string, href: string): string {
  return `\u001B]8;;${href}\u0007${label}\u001B]8;;\u0007`;
}

/**
 * Print a compact activation nudge at the end of a completion flow.
 * Safe to call from any success path — the first call wins for a
 * given CLI invocation, subsequent calls are no-ops so we never spam
 * the operator across chained milestones.
 */
export function renderActivationNudge(surface: ActivationNudgeSurface): void {
  if (nudgeShownThisProcess) return;
  nudgeShownThisProcess = true;

  const content = CONTENT_BY_SURFACE[surface];
  const activateLink = terminalHyperlink("Activate on Growthub", GROWTHUB_ACTIVATION_URL);

  // Deliberately uses plain console.log rather than the interactive
  // prompt surface. The nudge is a passive end-of-flow notice, not a
  // new prompt — we do not want to open a new @clack/prompts section
  // after an outro has already closed.
  console.log("");
  console.log(pc.dim("──"));
  console.log(pc.bold(content.headline));
  console.log(content.reason);
  console.log(`${activateLink} · first-month $1 path · ${pc.dim(GROWTHUB_ACTIVATION_URL)}`);
  console.log(pc.dim("Stay local-first if you prefer — the CLI keeps working without an account."));
  console.log("");

  // Best proxy we have for "the operator was exposed to the CTA".
  // Fire-and-forget; the telemetry client is a no-op unless the super
  // admin has wired GROWTHUB_POSTHOG_PROJECT_KEY per
  // docs/POSTHOG_OBSERVABILITY.md.
  void captureEvent({
    event: "hosted_activation_clicked",
    properties: {
      surface,
      funnel_stage: "expansion",
      cta_label: "first_month_one_dollar",
      cta_target: GROWTHUB_ACTIVATION_URL,
    },
  });
}

/** Test-only helper to reset the per-process guard. */
export function __resetActivationNudgeGuardForTests(): void {
  nudgeShownThisProcess = false;
}
