/**
 * T3 Code CLI — Runtime Module
 *
 * Self-contained adapter for https://github.com/pingdotgg/t3code under the
 * Growthub Agent Harness discovery surface.
 *
 * Config lane   : ~/.paperclip/t3code/config.json        (non-secret)
 * Auth lane     : ~/.paperclip/harness-auth/t3code.json  (secure, 0600)
 * Profile lane  : ~/.paperclip/t3code/growthub-profile.json (0600, via harness-profile primitive)
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import { readHarnessCredentials, setHarnessCredentials } from "../agent-harness/auth-store.js";
import {
  readHarnessProfile,
  writeHarnessProfile,
  clearHarnessProfile,
  harnessProfileExists,
} from "../agent-harness/harness-profile.js";
import type { T3CodeConfig } from "./contract.js";
import { DEFAULT_T3_CODE_CONFIG, T3_CODE_SUPPORTED_ENV_KEYS } from "./contract.js";

// ---------------------------------------------------------------------------
// Re-exports — contract
// ---------------------------------------------------------------------------

export type {
  T3CodeConfig,
  T3CodeApprovalMode,
  T3CodeEnvironmentStatus,
  T3CodeExecutionResult,
  T3CodeHealthResult,
} from "./contract.js";

export {
  DEFAULT_T3_CODE_CONFIG,
  T3_CODE_APPROVAL_MODES,
  T3_CODE_SUPPORTED_ENV_KEYS,
} from "./contract.js";

// ---------------------------------------------------------------------------
// Re-exports — provider
// ---------------------------------------------------------------------------

export {
  executeHeadlessPrompt,
  launchInteractiveSession,
  detectT3Version,
} from "./provider.js";

// ---------------------------------------------------------------------------
// Re-exports — health
// ---------------------------------------------------------------------------

export {
  detectEnvironment,
  checkHealth,
  buildSetupGuidance,
} from "./health.js";

// ---------------------------------------------------------------------------
// Re-exports — profile primitive (thin wrapper with harnessId bound)
// ---------------------------------------------------------------------------

export { type GrowthubHarnessProfile } from "../agent-harness/harness-profile.js";

export const T3_HARNESS_ID = "t3code" as const;
export const T3_HARNESS_LABEL = "T3 Code CLI" as const;

export function readT3GrowthubProfile() {
  return readHarnessProfile(T3_HARNESS_ID);
}

export function writeT3GrowthubProfile(profile: Parameters<typeof writeHarnessProfile>[1]) {
  writeHarnessProfile(T3_HARNESS_ID, profile);
}

export function clearT3GrowthubProfile() {
  clearHarnessProfile(T3_HARNESS_ID);
}

export function t3GrowthubProfileExists() {
  return harnessProfileExists(T3_HARNESS_ID);
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

function resolveConfigPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "t3code", "config.json");
}

export function readT3CodeConfig(): T3CodeConfig {
  const configPath = resolveConfigPath();
  const storedCredentials = readHarnessCredentials(T3_HARNESS_ID);

  if (!fs.existsSync(configPath)) {
    return {
      ...DEFAULT_T3_CODE_CONFIG,
      env: mergeHarnessEnv(DEFAULT_T3_CODE_CONFIG.env, storedCredentials),
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<T3CodeConfig>;

    // If a Growthub profile exists with a fork binary, that takes precedence
    const profile = readHarnessProfile(T3_HARNESS_ID);
    const resolvedBinaryPath = profile?.forkBinaryPath
      ?? (typeof raw.binaryPath === "string" ? raw.binaryPath : DEFAULT_T3_CODE_CONFIG.binaryPath);

    return {
      binaryPath: resolvedBinaryPath,
      defaultModel: typeof raw.defaultModel === "string" ? raw.defaultModel : DEFAULT_T3_CODE_CONFIG.defaultModel,
      cwd: typeof raw.cwd === "string" ? raw.cwd : DEFAULT_T3_CODE_CONFIG.cwd,
      approvalMode: raw.approvalMode === "default" || raw.approvalMode === "auto-edit" || raw.approvalMode === "yolo"
        ? raw.approvalMode
        : DEFAULT_T3_CODE_CONFIG.approvalMode,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_T3_CODE_CONFIG.timeoutMs,
      env: mergeHarnessEnv(
        typeof raw.env === "object" && raw.env !== null ? raw.env : DEFAULT_T3_CODE_CONFIG.env,
        storedCredentials,
      ),
    };
  } catch {
    return {
      ...DEFAULT_T3_CODE_CONFIG,
      env: mergeHarnessEnv(DEFAULT_T3_CODE_CONFIG.env, storedCredentials),
    };
  }
}

export function writeT3CodeConfig(config: T3CodeConfig): void {
  const configPath = resolveConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  const rawEnv = typeof config.env === "object" && config.env !== null ? config.env : {};
  const credentialUpdates: Record<string, string | undefined> = {};
  const publicEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawEnv)) {
    if (T3_CODE_SUPPORTED_ENV_KEYS.includes(key as typeof T3_CODE_SUPPORTED_ENV_KEYS[number])) {
      credentialUpdates[key] = value;
    } else {
      publicEnv[key] = value;
    }
  }

  setHarnessCredentials(T3_HARNESS_ID, credentialUpdates);
  fs.writeFileSync(
    configPath,
    `${JSON.stringify({ ...config, env: publicEnv }, null, 2)}\n`,
    "utf-8",
  );
}

function mergeHarnessEnv(
  runtimeEnv: Record<string, unknown>,
  credentials: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (typeof value === "string") merged[key] = value;
  }

  for (const key of T3_CODE_SUPPORTED_ENV_KEYS) {
    const secret = credentials[key];
    if (typeof secret === "string" && secret.trim().length > 0) {
      merged[key] = secret;
    }
  }

  return merged;
}
