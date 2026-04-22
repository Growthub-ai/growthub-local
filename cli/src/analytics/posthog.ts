/**
 * Thin PostHog analytics layer for Growthub Local CLI.
 *
 * Safe properties only — no source code, no secrets, no file contents,
 * no env vars, no private URLs. See the project PostHog spec for the
 * full event taxonomy.
 *
 * Opt-out: set GROWTHUB_TELEMETRY_DISABLED=true
 * API key: set GROWTHUB_POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
 * Host:    set GROWTHUB_POSTHOG_HOST or NEXT_PUBLIC_POSTHOG_HOST
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../config/home.js";
import { readSession, isSessionExpired } from "../auth/session-store.js";

function resolveHost(): string {
  return (
    (process.env.GROWTHUB_POSTHOG_HOST ?? "").trim()
    || (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "").trim()
    || "https://us.posthog.com"
  );
}

function apiKey(): string {
  return (
    (process.env.GROWTHUB_POSTHOG_API_KEY ?? "").trim()
    || (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? "").trim()
  );
}

function debugEnabled(): boolean {
  return process.env.GROWTHUB_POSTHOG_DEBUG === "true";
}

function resolveHostedIdentity(): { userId: string | null; email: string | null } {
  if (_hostedUserId !== null || _hostedEmail !== null) {
    return { userId: _hostedUserId, email: _hostedEmail };
  }
  const session = readSession();
  if (session && !isSessionExpired(session)) {
    if (typeof session.userId === "string" && session.userId.length > 0) {
      _hostedUserId = session.userId;
    }
    if (typeof session.email === "string" && session.email.length > 0) {
      _hostedEmail = session.email;
    }
  }
  return { userId: _hostedUserId, email: _hostedEmail };
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
let _hostedEmail: string | null = null;

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
  const host = resolveHost();
  const identity = resolveHostedIdentity();

  const body = JSON.stringify({
    api_key: key,
    event,
    distinct_id: distinctId,
    properties: {
      ...properties,
      $lib: "growthub-cli",
      platform: process.platform,
      ...(identity.userId !== null ? { hosted_user_id: identity.userId } : {}),
      ...(identity.email !== null ? { hosted_email: identity.email } : {}),
    },
    timestamp: new Date().toISOString(),
  });

  // Fire-and-forget — analytics must never block or crash the CLI.
  fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(5000),
  })
    .then(async (response) => {
      if (response.ok) {
        if (debugEnabled()) {
          console.error(
            `[posthog] captured ${event} (${response.status})`
            + ` user=${identity.userId ?? "none"}`
            + ` email=${identity.email ?? "none"}`,
          );
        }
        return;
      }
      if (debugEnabled()) {
        const text = await response.text().catch(() => "");
        console.error(`[posthog] failed ${event} (${response.status}) ${text.slice(0, 240)}`);
      }
    })
    .catch((err) => {
      if (debugEnabled()) {
        console.error(`[posthog] error ${event}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
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
  const session = readSession();
  if (!session) return false;
  return !isSessionExpired(session);
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
