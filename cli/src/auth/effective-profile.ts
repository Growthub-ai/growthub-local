import fs from "node:fs";
import path from "node:path";
import type { PaperclipConfig } from "../config/schema.js";
import { readConfig, resolveConfigPath } from "../config/store.js";
import { resolvePaperclipInstanceId } from "../config/home.js";
import {
  readHostedOverlay,
  type HostedProfileOverlay,
  type ExecutionPreferences,
} from "./overlay-store.js";
import { readSession, type CliAuthSession } from "./session-store.js";
import { resolveEffectiveProfilePath, resolveProfilesDir } from "./paths.js";

/**
 * Effective profile layer — the merged view of:
 *   1. Local Paperclip workspace profile (base)
 *   2. Hosted Growthub profile overlay (optional)
 *   3. Active hosted session (optional)
 *
 * Consumers MUST treat local layers as the source of truth for local execution.
 * The overlay only contributes identity, entitlements, and routing defaults.
 */
export interface LocalWorkspaceView {
  instanceId: string;
  configPath: string;
  surfaceProfile: "dx" | "gtm" | null;
  serverPort: number | null;
  serverHost: string | null;
  /** Whether the local instance is currently linked to a hosted token. */
  hasConfiguredToken: boolean;
  growthubBaseUrl: string | null;
  growthubPortalBaseUrl: string | null;
  machineLabel: string | null;
  workspaceLabel: string | null;
}

export interface HostedOverlayView {
  present: boolean;
  hostedBaseUrl: string | null;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  orgId: string | null;
  orgName: string | null;
  entitlements: string[];
  gatedKitSlugs: string[];
  executionDefaults: ExecutionPreferences;
  linkedInstanceId: string | null;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
}

export interface SessionView {
  present: boolean;
  expired: boolean;
  expiresAt: string | null;
  userId: string | null;
  hostedBaseUrl: string | null;
}

export interface EffectiveProfile {
  version: 1;
  generatedAt: string;
  authenticated: boolean;
  local: LocalWorkspaceView;
  hosted: HostedOverlayView;
  session: SessionView;
  executionDefaults: ExecutionPreferences;
}

function toLocalWorkspaceView(
  configPath: string,
  config: PaperclipConfig | null,
): LocalWorkspaceView {
  return {
    instanceId: resolvePaperclipInstanceId(),
    configPath,
    surfaceProfile:
      config?.surface?.profile === "dx" || config?.surface?.profile === "gtm"
        ? config.surface.profile
        : null,
    serverPort: typeof config?.server?.port === "number" ? config.server.port : null,
    serverHost: typeof config?.server?.host === "string" ? config.server.host : null,
    hasConfiguredToken: Boolean(config?.auth?.token?.trim()),
    growthubBaseUrl: config?.auth?.growthubBaseUrl?.trim() || null,
    growthubPortalBaseUrl: config?.auth?.growthubPortalBaseUrl?.trim() || null,
    machineLabel: config?.auth?.growthubMachineLabel?.trim() || null,
    workspaceLabel: config?.auth?.growthubWorkspaceLabel?.trim() || null,
  };
}

function toHostedOverlayView(overlay: HostedProfileOverlay | null): HostedOverlayView {
  if (!overlay) {
    return {
      present: false,
      hostedBaseUrl: null,
      userId: null,
      email: null,
      displayName: null,
      orgId: null,
      orgName: null,
      entitlements: [],
      gatedKitSlugs: [],
      executionDefaults: {
        preferredMode: "local",
        allowServerlessFallback: false,
        allowBrowserBridge: false,
      },
      linkedInstanceId: null,
      lastPulledAt: null,
      lastPushedAt: null,
    };
  }

  return {
    present: true,
    hostedBaseUrl: overlay.hostedBaseUrl || null,
    userId: overlay.userId ?? null,
    email: overlay.email ?? null,
    displayName: overlay.displayName ?? null,
    orgId: overlay.orgId ?? null,
    orgName: overlay.orgName ?? null,
    entitlements: overlay.entitlements,
    gatedKitSlugs: overlay.gatedKitSlugs,
    executionDefaults: overlay.executionDefaults,
    linkedInstanceId: overlay.linkedInstanceId ?? null,
    lastPulledAt: overlay.lastPulledAt ?? null,
    lastPushedAt: overlay.lastPushedAt ?? null,
  };
}

function toSessionView(session: CliAuthSession | null, now: Date): SessionView {
  if (!session) {
    return {
      present: false,
      expired: false,
      expiresAt: null,
      userId: null,
      hostedBaseUrl: null,
    };
  }

  let expired = false;
  if (session.expiresAt) {
    const expires = Date.parse(session.expiresAt);
    if (!Number.isNaN(expires)) {
      expired = expires <= now.getTime();
    }
  }

  return {
    present: true,
    expired,
    expiresAt: session.expiresAt ?? null,
    userId: session.userId ?? null,
    hostedBaseUrl: session.hostedBaseUrl,
  };
}

export interface ComputeEffectiveProfileOptions {
  configPath?: string;
  now?: Date;
}

export function computeEffectiveProfile(
  opts: ComputeEffectiveProfileOptions = {},
): EffectiveProfile {
  const configPath = resolveConfigPath(opts.configPath);
  let config: PaperclipConfig | null = null;
  try {
    config = readConfig(opts.configPath);
  } catch {
    // Invalid/missing local config should never fail status computation —
    // the entire point of the overlay design is to degrade gracefully when the
    // local base layer is absent or partially configured.
    config = null;
  }

  const overlay = readHostedOverlay();
  const session = readSession();
  const now = opts.now ?? new Date();

  const sessionView = toSessionView(session, now);
  const hostedView = toHostedOverlayView(overlay);
  const localView = toLocalWorkspaceView(configPath, config);

  return {
    version: 1,
    generatedAt: now.toISOString(),
    authenticated: sessionView.present && !sessionView.expired,
    local: localView,
    hosted: hostedView,
    session: sessionView,
    executionDefaults: hostedView.present
      ? hostedView.executionDefaults
      : {
          preferredMode: "local",
          allowServerlessFallback: false,
          allowBrowserBridge: false,
        },
  };
}

export function writeEffectiveProfileSnapshot(profile: EffectiveProfile): string {
  const filePath = resolveEffectiveProfilePath();
  fs.mkdirSync(resolveProfilesDir(), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
  return path.resolve(filePath);
}
