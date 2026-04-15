/**
 * Qwen Code CLI — Runtime Module
 *
 * Self-contained adapter for integrating Qwen Code (https://github.com/QwenLM/qwen-code)
 * as an agent harness within the Growthub CLI discovery surface.
 *
 * Architecture:
 *   - No npm dependency on @qwen-code/* — fully process-spawn based
 *   - Binary detection via `qwen --version`
 *   - Headless execution via `qwen -p "<prompt>"`
 *   - Interactive session via `qwen` with inherited stdio
 *   - Health/setup guidance for onboarding
 *
 * Integration surface:
 *   - CLI commands: `growthub qwen-code [health|prompt|session]`
 *   - Server adapter: qwen_local adapter type in the agent registry
 *   - Available alongside Agent Harness flows without changing the top-level nav
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import { readHarnessCredentials, setHarnessCredentials } from "../agent-harness/auth-store.js";
import type { QwenCodeConfig } from "./contract.js";
import { DEFAULT_QWEN_CODE_CONFIG, QWEN_CODE_SUPPORTED_ENV_KEYS } from "./contract.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  QwenCodeConfig,
  QwenCodeApprovalMode,
  QwenCodeEnvironmentStatus,
  QwenCodeExecutionResult,
  QwenCodeHealthResult,
} from "./contract.js";

export {
  DEFAULT_QWEN_CODE_CONFIG,
  QWEN_CODE_APPROVAL_MODES,
  QWEN_CODE_SUPPORTED_ENV_KEYS,
} from "./contract.js";

export {
  executeHeadlessPrompt,
  launchInteractiveSession,
  detectQwenVersion,
} from "./provider.js";

export {
  detectEnvironment,
  checkHealth,
  buildSetupGuidance,
} from "./health.js";

// ---------------------------------------------------------------------------
// Configuration persistence
// ---------------------------------------------------------------------------

function resolveConfigPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "qwen-code", "config.json");
}

export function readQwenCodeConfig(): QwenCodeConfig {
  const configPath = resolveConfigPath();
  const storedCredentials = readHarnessCredentials("qwen-code");
  if (!fs.existsSync(configPath)) {
    return {
      ...DEFAULT_QWEN_CODE_CONFIG,
      env: mergeHarnessEnv(DEFAULT_QWEN_CODE_CONFIG.env, storedCredentials),
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<QwenCodeConfig>;
    return {
      binaryPath: typeof raw.binaryPath === "string" ? raw.binaryPath : DEFAULT_QWEN_CODE_CONFIG.binaryPath,
      defaultModel: typeof raw.defaultModel === "string" ? raw.defaultModel : DEFAULT_QWEN_CODE_CONFIG.defaultModel,
      cwd: typeof raw.cwd === "string" ? raw.cwd : DEFAULT_QWEN_CODE_CONFIG.cwd,
      approvalMode: raw.approvalMode === "default" || raw.approvalMode === "auto-edit" || raw.approvalMode === "yolo"
        ? raw.approvalMode
        : DEFAULT_QWEN_CODE_CONFIG.approvalMode,
      maxSessionTurns: typeof raw.maxSessionTurns === "number" ? raw.maxSessionTurns : DEFAULT_QWEN_CODE_CONFIG.maxSessionTurns,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_QWEN_CODE_CONFIG.timeoutMs,
      env: mergeHarnessEnv(
        typeof raw.env === "object" && raw.env !== null ? raw.env : DEFAULT_QWEN_CODE_CONFIG.env,
        storedCredentials,
      ),
    };
  } catch {
    return {
      ...DEFAULT_QWEN_CODE_CONFIG,
      env: mergeHarnessEnv(DEFAULT_QWEN_CODE_CONFIG.env, storedCredentials),
    };
  }
}

export function writeQwenCodeConfig(config: QwenCodeConfig): void {
  const configPath = resolveConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const rawEnv = typeof config.env === "object" && config.env !== null ? config.env : {};
  const credentialUpdates: Record<string, string | undefined> = {};
  const publicEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawEnv)) {
    if (QWEN_CODE_SUPPORTED_ENV_KEYS.includes(key as typeof QWEN_CODE_SUPPORTED_ENV_KEYS[number])) {
      credentialUpdates[key] = value;
      continue;
    }
    publicEnv[key] = value;
  }

  setHarnessCredentials("qwen-code", credentialUpdates);
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

  for (const key of QWEN_CODE_SUPPORTED_ENV_KEYS) {
    const secret = credentials[key];
    if (typeof secret === "string" && secret.trim().length > 0) {
      merged[key] = secret;
    }
  }

  return merged;
}
