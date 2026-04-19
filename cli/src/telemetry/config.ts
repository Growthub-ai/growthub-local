import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../config/home.js";

/**
 * Telemetry configuration resolution.
 *
 * Precedence (first match wins):
 *   1. `GROWTHUB_TELEMETRY_DISABLED=1` / `GROWTHUB_TELEMETRY_OFF=1` / `DO_NOT_TRACK=1`
 *      → telemetry hard-off. Never writes to anon-id, never opens a network handle.
 *   2. `~/.paperclip/telemetry/settings.json` → `{ "enabled": boolean, "apiKey": string? }`
 *   3. Env overrides: `GROWTHUB_POSTHOG_API_KEY`, `GROWTHUB_POSTHOG_HOST`
 *   4. Baked-in public write key (if shipped by the packager)
 *
 * The CLI does NOT ship a default write key in this repo — shipping it is a
 * deploy-time decision. When no key resolves, telemetry becomes a no-op.
 */

export interface TelemetrySettings {
  enabled: boolean;
  apiKey: string | null;
  host: string;
  debug: boolean;
}

const DEFAULT_HOST = "https://us.i.posthog.com";

function resolveSettingsPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "telemetry", "settings.json");
}

function readSettingsFile(): { enabled?: boolean; apiKey?: string; host?: string } {
  try {
    const filePath = resolveSettingsPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    const enabled = typeof raw.enabled === "boolean" ? raw.enabled : undefined;
    const apiKey = typeof raw.apiKey === "string" && raw.apiKey.trim().length > 0 ? raw.apiKey.trim() : undefined;
    const host = typeof raw.host === "string" && raw.host.trim().length > 0 ? raw.host.trim() : undefined;
    return { enabled, apiKey, host };
  } catch {
    return {};
  }
}

function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveTelemetrySettings(): TelemetrySettings {
  const hardOff =
    envFlag("GROWTHUB_TELEMETRY_DISABLED") ||
    envFlag("GROWTHUB_TELEMETRY_OFF") ||
    envFlag("DO_NOT_TRACK");

  if (hardOff) {
    return { enabled: false, apiKey: null, host: DEFAULT_HOST, debug: false };
  }

  const fileSettings = readSettingsFile();
  const envApiKey = process.env.GROWTHUB_POSTHOG_API_KEY?.trim();
  const envHost = process.env.GROWTHUB_POSTHOG_HOST?.trim();
  const debug = envFlag("GROWTHUB_TELEMETRY_DEBUG");

  const apiKey = envApiKey && envApiKey.length > 0
    ? envApiKey
    : fileSettings.apiKey ?? null;

  const host = (envHost && envHost.length > 0)
    ? envHost.replace(/\/$/, "")
    : (fileSettings.host ?? DEFAULT_HOST).replace(/\/$/, "");

  const enabled = fileSettings.enabled === false
    ? false
    : apiKey !== null;

  return { enabled, apiKey, host, debug };
}

export function writeTelemetrySettings(patch: Partial<{ enabled: boolean; apiKey: string | null; host: string }>): void {
  const filePath = resolveSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const current = readSettingsFile();
  const next: Record<string, unknown> = { ...current };

  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.apiKey !== undefined) {
    if (patch.apiKey === null) delete next.apiKey;
    else next.apiKey = patch.apiKey;
  }
  if (patch.host !== undefined) next.host = patch.host;

  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // non-posix best-effort
  }
}

export function describeTelemetrySettingsPath(): string {
  return resolveSettingsPath();
}
