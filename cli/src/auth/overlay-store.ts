import fs from "node:fs";
import path from "node:path";
import { resolveHostedOverlayPath, resolveProfilesDir } from "./paths.js";

/**
 * Hosted Growthub profile overlay.
 *
 * This sits ABOVE the local Paperclip workspace profile. It never replaces
 * local-first execution defaults — it only carries server-recognized identity,
 * entitlements, and routing preferences. If the overlay is absent or cleared,
 * the CLI must continue to operate against the local workspace profile alone.
 */
export interface ExecutionPreferences {
  preferredMode: "local" | "serverless" | "browser" | "auto";
  allowServerlessFallback: boolean;
  allowBrowserBridge: boolean;
}

export interface HostedProfileOverlay {
  version: 1;
  /** Hosted app base URL this overlay was pulled from. */
  hostedBaseUrl: string;
  /** Authenticated user id, mirrors session. */
  userId?: string;
  email?: string;
  displayName?: string;
  orgId?: string;
  orgName?: string;
  /** Server-recognized entitlement keys (opaque catalog). */
  entitlements: string[];
  /** Server-recognized gated kit slugs the user has access to. */
  gatedKitSlugs: string[];
  /** Execution routing defaults recommended by hosted app. */
  executionDefaults: ExecutionPreferences;
  /** Linked local workspace instance id (Paperclip instance). */
  linkedInstanceId?: string;
  /** Last successful pull timestamp (ISO). */
  lastPulledAt?: string;
  /** Last successful push timestamp (ISO). */
  lastPushedAt?: string;
  /** Arbitrary hosted preferences that the CLI should not interpret. */
  extra?: Record<string, unknown>;
}

function parseJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to parse hosted overlay at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const normalized = toStringOrUndefined(item);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeExecutionDefaults(value: unknown): ExecutionPreferences {
  const record = toRecord(value) ?? {};
  const modeRaw = toStringOrUndefined(record.preferredMode);
  const preferredMode: ExecutionPreferences["preferredMode"] =
    modeRaw === "local" || modeRaw === "serverless" || modeRaw === "browser" || modeRaw === "auto"
      ? modeRaw
      : "local";
  return {
    preferredMode,
    allowServerlessFallback: typeof record.allowServerlessFallback === "boolean"
      ? record.allowServerlessFallback
      : false,
    allowBrowserBridge: typeof record.allowBrowserBridge === "boolean"
      ? record.allowBrowserBridge
      : false,
  };
}

function defaultExecutionPreferences(): ExecutionPreferences {
  return {
    preferredMode: "local",
    allowServerlessFallback: false,
    allowBrowserBridge: false,
  };
}

function normalizeOverlay(raw: unknown): HostedProfileOverlay | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const hostedBaseUrl = toStringOrUndefined(record.hostedBaseUrl);
  if (!hostedBaseUrl) return null;

  return {
    version: 1,
    hostedBaseUrl,
    userId: toStringOrUndefined(record.userId),
    email: toStringOrUndefined(record.email),
    displayName: toStringOrUndefined(record.displayName),
    orgId: toStringOrUndefined(record.orgId),
    orgName: toStringOrUndefined(record.orgName),
    entitlements: toStringArray(record.entitlements),
    gatedKitSlugs: toStringArray(record.gatedKitSlugs),
    executionDefaults: normalizeExecutionDefaults(record.executionDefaults),
    linkedInstanceId: toStringOrUndefined(record.linkedInstanceId),
    lastPulledAt: toStringOrUndefined(record.lastPulledAt),
    lastPushedAt: toStringOrUndefined(record.lastPushedAt),
    extra: toRecord(record.extra),
  };
}

export function readHostedOverlay(): HostedProfileOverlay | null {
  const filePath = resolveHostedOverlayPath();
  if (!fs.existsSync(filePath)) return null;
  return normalizeOverlay(parseJson(filePath));
}

export function writeHostedOverlay(overlay: HostedProfileOverlay): void {
  const filePath = resolveHostedOverlayPath();
  fs.mkdirSync(resolveProfilesDir(), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(overlay, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // non-posix best-effort
  }
}

export function clearHostedOverlay(): boolean {
  const filePath = resolveHostedOverlayPath();
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

export function describeHostedOverlayPath(): string {
  return path.resolve(resolveHostedOverlayPath());
}

export function seedHostedOverlayFromSession(input: {
  hostedBaseUrl: string;
  userId?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  machineLabel?: string;
  linkedInstanceId?: string;
}): HostedProfileOverlay {
  return {
    version: 1,
    hostedBaseUrl: input.hostedBaseUrl,
    userId: input.userId,
    email: input.email,
    displayName: input.email,
    orgId: input.orgId,
    orgName: input.orgName,
    entitlements: [],
    gatedKitSlugs: [],
    executionDefaults: defaultExecutionPreferences(),
    linkedInstanceId: input.linkedInstanceId,
    lastPulledAt: undefined,
    lastPushedAt: undefined,
    extra: input.machineLabel ? { machineLabel: input.machineLabel } : undefined,
  };
}
