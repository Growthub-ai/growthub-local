/**
 * Thin PostHog analytics layer for Growthub Local CLI.
 *
 * Safe properties only — no source code, no secrets, no file contents,
 * no env vars, no private URLs. See the project PostHog spec for the
 * full event taxonomy.
 *
 * Opt-out: set GROWTHUB_TELEMETRY_DISABLED=true
 * API key: set GROWTHUB_POSTHOG_API_KEY=<your-project-key>
 * Host:    set GROWTHUB_POSTHOG_HOST=<custom-host> (defaults to app.posthog.com)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../config/home.js";

const POSTHOG_HOST = (process.env.GROWTHUB_POSTHOG_HOST ?? "").trim() || "https://app.posthog.com";

function apiKey(): string {
  return (process.env.GROWTHUB_POSTHOG_API_KEY ?? "").trim();
}

function isDisabled(): boolean {
  return (
    !apiKey() ||
    process.env.GROWTHUB_TELEMETRY_DISABLED === "true" ||
    process.env.DO_NOT_TRACK === "1" ||
    process.env.CI === "true"
  );
}

let _machineId: string | null = null;
let _isFirstRun = false;
let _hostedUserId: string | null = null;

function analyticsIdPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "analytics-machine-id");
}

function ensureMachineId(): string {
  if (_machineId !== null) return _machineId;

  const idPath = analyticsIdPath();
  let resolved = "anon";
  try {
    if (fs.existsSync(idPath)) {
      const stored = fs.readFileSync(idPath, "utf-8").trim();
      if (stored.length > 0) {
        _machineId = stored;
        return stored;
      }
    }
    _isFirstRun = true;
    const fresh = crypto.randomUUID();
    fs.mkdirSync(path.dirname(idPath), { recursive: true });
    fs.writeFileSync(idPath, fresh, "utf-8");
    resolved = fresh;
  } catch {
    resolved = "anon";
  }
  _machineId = resolved;
  return resolved;
}

export function setHostedUserId(userId: string): void {
  _hostedUserId = userId;
}

// ---------------------------------------------------------------------------
// Event taxonomy — mirrors the Growthub PostHog spec
// ---------------------------------------------------------------------------

export type GrowthubAnalyticsEvent =
  // Install / first-run
  | "cli_first_run"
  | "discover_opened"
  // First-value path
  | "starter_import_repo_started"
  | "starter_import_repo_completed"
  | "starter_import_skill_started"
  | "starter_import_skill_completed"
  | "workspace_starter_created"
  | "kit_download_completed"
  // Governance / depth
  | "fork_registered"
  | "fork_sync_preview_started"
  | "fork_sync_heal_applied"
  | "growthub_auth_connected"
  | "hosted_activation_clicked"
  // Friction
  | "first_run_failed"
  | "import_failed"
  | "auth_required_encountered"
  | "awaiting_confirmation_reached"
  | "setup_health_failed"
  // Email / lead capture
  | "email_capture_shown"
  | "email_capture_submitted"
  | "email_capture_dismissed";

export type SafeProperties = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// Core capture
// ---------------------------------------------------------------------------

export function track(event: GrowthubAnalyticsEvent, properties?: SafeProperties): void {
  if (isDisabled()) return;

  const distinctId = ensureMachineId();
  const key = apiKey();

  const body = JSON.stringify({
    api_key: key,
    event,
    distinct_id: distinctId,
    properties: {
      ...properties,
      $lib: "growthub-cli",
      platform: process.platform,
      ...(_hostedUserId !== null ? { hosted_user_id: _hostedUserId } : {}),
    },
    timestamp: new Date().toISOString(),
  });

  // Fire-and-forget — analytics must never block or crash the CLI.
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// CLI startup helper
// ---------------------------------------------------------------------------

export function trackCliStart(): void {
  ensureMachineId();
  if (_isFirstRun) {
    track("cli_first_run");
  }
}

// ---------------------------------------------------------------------------
// Activation nudge helpers
//
// Thin, non-interactive CTA appended to existing success output.
// Call printActivationNudge() after a high-value completion message
// (kit download, workspace creation, import). Skip when already connected.
// ---------------------------------------------------------------------------

const ACTIVATION_URL = "https://www.growthub.ai/";

function isAlreadyConnected(): boolean {
  try {
    // Dynamic require avoids circular deps — session-store has no analytics dep.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("../auth/session-store.js") as {
      readSession: () => unknown;
      isSessionExpired: (s: unknown) => boolean;
    };
    const session = store.readSession();
    return Boolean(session) && !store.isSessionExpired(session);
  } catch {
    return false;
  }
}

function terminalLink(label: string, href: string): string {
  return `\u001B]8;;${href}\u0007${label}\u001B]8;;\u0007`;
}

export function printActivationNudge(trigger: string): void {
  if (isAlreadyConnected()) return;
  track("email_capture_shown", { trigger });
  const link = terminalLink("growthub.ai — first month $1", ACTIVATION_URL);
  console.log("");
  console.log(`  \x1b[2m──────────────────────────────────────────────\x1b[0m`);
  console.log(`  \x1b[36m✦\x1b[0m  Fork anything. Stay current. Ship faster.`);
  console.log(`  \x1b[2mActivate Growthub →\x1b[0m  \x1b[36m${link}\x1b[0m`);
  console.log(`  \x1b[2m──────────────────────────────────────────────\x1b[0m`);
  console.log("");
}
