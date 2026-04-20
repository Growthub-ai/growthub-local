/**
 * PostHog capture client — thin, fail-closed, fire-and-forget.
 *
 * Design contract (matches docs/POSTHOG_OBSERVABILITY.md):
 *
 *   - Never sends source code, prompt contents, secrets, repo contents,
 *     local file contents, artifact payloads, env vars, private URLs,
 *     or authority envelope contents.
 *   - Only sends: event name, coarse path metadata, success/failure,
 *     duration, anonymized machine/session id, and optional hosted
 *     user id after explicit `growthub auth login`.
 *   - Never blocks CLI flow: all capture calls return a fast-settling
 *     promise; any failure (network, 4xx, 5xx) is swallowed.
 *   - Disabled by default until the super admin sets
 *     `GROWTHUB_POSTHOG_PROJECT_KEY`. Honors `DO_NOT_TRACK=1` and
 *     `GROWTHUB_TELEMETRY_DISABLED=1`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureAnonIdentity } from "./anon-id.js";
import { resolveTelemetryConfig, type ResolvedTelemetryConfig } from "./config.js";
import {
  ALLOWED_PROPERTY_KEYS,
  type TelemetryEventName,
  type TelemetryOutcome,
} from "./events.js";

const ALLOWED_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_PROPERTY_KEYS);
const CAPTURE_TIMEOUT_MS = 1500;

export type TelemetryPropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export interface CaptureInput {
  event: TelemetryEventName;
  properties?: Record<string, TelemetryPropertyValue>;
  /**
   * Optional override for the distinct id. Callers almost never need
   * this — leave unset to use the anonymous machine/session id.
   */
  distinctId?: string;
}

let cachedCliVersion: string | null = null;

function resolveCliVersion(): string {
  if (cachedCliVersion) return cachedCliVersion;
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(moduleDir, "../../../package.json"),
      path.resolve(moduleDir, "../../../../package.json"),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (parsed?.name === "@growthub/cli" && typeof parsed.version === "string") {
        cachedCliVersion = parsed.version;
        return cachedCliVersion;
      }
    }
  } catch {
    /* fall through */
  }
  cachedCliVersion = "0.0.0-unknown";
  return cachedCliVersion;
}

function osLabel(): string {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "linux";
}

function nodeMajor(): number {
  const match = /^v?(\d+)/.exec(process.version ?? "");
  return match ? Number(match[1]) : 0;
}

/**
 * Whitelist-only sanitizer. Any key not in ALLOWED_PROPERTY_KEYS is
 * dropped silently. String values longer than 240 characters are
 * truncated to enforce the "coarse path metadata" contract.
 */
export function sanitizeProperties(
  properties: Record<string, TelemetryPropertyValue> | undefined,
): Record<string, TelemetryPropertyValue> {
  if (!properties) return {};
  const out: Record<string, TelemetryPropertyValue> = {};
  for (const [rawKey, rawValue] of Object.entries(properties)) {
    if (!ALLOWED_KEY_SET.has(rawKey)) continue;
    if (rawValue === null || rawValue === undefined) continue;
    if (typeof rawValue === "string") {
      out[rawKey] = rawValue.length > 240 ? rawValue.slice(0, 237) + "..." : rawValue;
      continue;
    }
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      out[rawKey] = rawValue;
      continue;
    }
    if (typeof rawValue === "boolean") {
      out[rawKey] = rawValue;
      continue;
    }
    // Anything else (object/array/function) is dropped on purpose.
  }
  return out;
}

function installerMode(): boolean {
  return process.env.GROWTHUB_INSTALLER_MODE === "true";
}

function buildEnvelope(
  input: CaptureInput,
  config: ResolvedTelemetryConfig,
): Record<string, unknown> {
  const { anonId } = ensureAnonIdentity();
  const distinctId = input.distinctId?.trim() || anonId;
  const sanitized = sanitizeProperties(input.properties);
  return {
    api_key: config.projectKey,
    event: input.event,
    distinct_id: distinctId,
    timestamp: new Date().toISOString(),
    properties: {
      ...sanitized,
      cli_version: sanitized.cli_version ?? resolveCliVersion(),
      installer_mode: sanitized.installer_mode ?? installerMode(),
      node_major: sanitized.node_major ?? nodeMajor(),
      os: sanitized.os ?? osLabel(),
      $lib: "@growthub/cli",
      $lib_version: resolveCliVersion(),
    },
  };
}

async function postEnvelope(host: string, envelope: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
  try {
    await fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Capture a telemetry event. Always resolves — never throws — so call
 * sites can safely `void captureEvent(...)` without try/catch.
 */
export async function captureEvent(input: CaptureInput): Promise<void> {
  const config = resolveTelemetryConfig();
  if (!config.enabled || !config.projectKey) return;

  try {
    const envelope = buildEnvelope(input, config);
    await postEnvelope(config.host, envelope);
  } catch {
    // Observability must never break CLI flow.
  }
}

/**
 * Convenience helper for outcome-style events. Returns the duration in
 * ms so callers can chain it into follow-up events if needed.
 */
export async function captureOutcome(
  event: TelemetryEventName,
  outcome: TelemetryOutcome,
  startedAtMs: number,
  extra?: Record<string, TelemetryPropertyValue>,
): Promise<number> {
  const durationMs = Math.max(0, Date.now() - startedAtMs);
  await captureEvent({
    event,
    properties: { ...extra, outcome, duration_ms: durationMs },
  });
  return durationMs;
}

export { resolveTelemetryConfig } from "./config.js";
