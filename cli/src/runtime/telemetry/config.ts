/**
 * Telemetry configuration — where the PostHog project key lives and how
 * the operator opts out.
 *
 * Keep this thin and safe:
 *
 *   - Telemetry is OFF by default unless a project key is resolved.
 *   - `GROWTHUB_TELEMETRY_DISABLED=1` (or `DO_NOT_TRACK=1`) turns it
 *     off regardless of key presence.
 *   - The super admin binds the project key once through the
 *     `GROWTHUB_POSTHOG_PROJECT_KEY` env var (documented in
 *     `docs/POSTHOG_OBSERVABILITY.md`). The project key is the PostHog
 *     _ingest_ key which is already safe to ship — it can only write
 *     events, not read data back out.
 *   - An optional `GROWTHUB_POSTHOG_HOST` lets the admin point at
 *     `https://us.i.posthog.com`, `https://eu.i.posthog.com`, or a
 *     self-hosted deployment.
 */

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export interface ResolvedTelemetryConfig {
  enabled: boolean;
  projectKey: string | null;
  host: string;
  /** Human-readable reason when `enabled === false`. */
  reason?: string;
}

function trimmedEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function truthyEnv(name: string): boolean {
  const value = trimmedEnv(name)?.toLowerCase();
  if (!value) return false;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveTelemetryConfig(): ResolvedTelemetryConfig {
  const host = trimSlashes(trimmedEnv("GROWTHUB_POSTHOG_HOST") ?? DEFAULT_POSTHOG_HOST);
  const projectKey = trimmedEnv("GROWTHUB_POSTHOG_PROJECT_KEY") ?? null;

  if (truthyEnv("GROWTHUB_TELEMETRY_DISABLED") || truthyEnv("DO_NOT_TRACK")) {
    return {
      enabled: false,
      projectKey,
      host,
      reason: "disabled by GROWTHUB_TELEMETRY_DISABLED / DO_NOT_TRACK",
    };
  }

  if (!projectKey) {
    return {
      enabled: false,
      projectKey: null,
      host,
      reason: "GROWTHUB_POSTHOG_PROJECT_KEY is not set",
    };
  }

  return { enabled: true, projectKey, host };
}
