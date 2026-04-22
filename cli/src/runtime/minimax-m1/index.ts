/**
 * MiniMax-M1 — Runtime Module
 *
 * First-class local-intelligence primitive for MiniMax-M1 (456B total /
 * 45.9B active MoE, 1M-token context) served over an OpenAI-compatible
 * endpoint (vLLM reference stack).
 *
 * Architecture:
 *   - No npm dependency on minimax SDKs — fetch-based HTTP client
 *   - Health via GET /v1/models, generation via POST /v1/chat/completions
 *   - Server lifecycle is out of scope (prints a copy-pasteable `vllm serve`)
 *   - Config persisted alongside other harnesses under $PAPERCLIP_HOME
 *   - API keys stored via the shared harness auth store (maskable)
 *
 * Integration surface:
 *   - CLI commands: `growthub minimax-m1 [health|prompt|chat|serve]`
 *   - Discovery hub: selectable from the Agent Harness sub-menu
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import { readHarnessCredentials, setHarnessCredentials } from "../agent-harness/auth-store.js";
import type { MiniMaxM1Config } from "./contract.js";
import {
  DEFAULT_MINIMAX_M1_CONFIG,
  MINIMAX_M1_SUPPORTED_ENV_KEYS,
  MINIMAX_M1_VARIANTS,
} from "./contract.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  MiniMaxM1Config,
  MiniMaxM1Variant,
  MiniMaxM1EnvironmentStatus,
  MiniMaxM1ExecutionResult,
  MiniMaxM1HealthResult,
  MiniMaxM1SupportedEnvKey,
} from "./contract.js";

export {
  DEFAULT_MINIMAX_M1_CONFIG,
  MINIMAX_M1_VARIANTS,
  MINIMAX_M1_SUPPORTED_ENV_KEYS,
} from "./contract.js";

export {
  executeHeadlessPrompt,
  probeServer,
  detectVllmBinary,
  buildServeCommand,
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
  return path.resolve(resolvePaperclipHomeDir(), "minimax-m1", "config.json");
}

export function readMiniMaxM1Config(): MiniMaxM1Config {
  const configPath = resolveConfigPath();
  const storedCredentials = readHarnessCredentials("minimax-m1");
  if (!fs.existsSync(configPath)) {
    return {
      ...DEFAULT_MINIMAX_M1_CONFIG,
      env: mergeHarnessEnv(DEFAULT_MINIMAX_M1_CONFIG.env, storedCredentials),
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<MiniMaxM1Config>;
    const variant = raw.variant && MINIMAX_M1_VARIANTS.includes(raw.variant)
      ? raw.variant
      : DEFAULT_MINIMAX_M1_CONFIG.variant;
    return {
      baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : DEFAULT_MINIMAX_M1_CONFIG.baseUrl,
      model: typeof raw.model === "string" ? raw.model : DEFAULT_MINIMAX_M1_CONFIG.model,
      variant,
      cwd: typeof raw.cwd === "string" ? raw.cwd : DEFAULT_MINIMAX_M1_CONFIG.cwd,
      maxOutputTokens: typeof raw.maxOutputTokens === "number" ? raw.maxOutputTokens : DEFAULT_MINIMAX_M1_CONFIG.maxOutputTokens,
      temperature: typeof raw.temperature === "number" ? raw.temperature : DEFAULT_MINIMAX_M1_CONFIG.temperature,
      topP: typeof raw.topP === "number" ? raw.topP : DEFAULT_MINIMAX_M1_CONFIG.topP,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_MINIMAX_M1_CONFIG.timeoutMs,
      tensorParallel: typeof raw.tensorParallel === "number" ? raw.tensorParallel : DEFAULT_MINIMAX_M1_CONFIG.tensorParallel,
      maxModelLen: typeof raw.maxModelLen === "number" ? raw.maxModelLen : DEFAULT_MINIMAX_M1_CONFIG.maxModelLen,
      env: mergeHarnessEnv(
        typeof raw.env === "object" && raw.env !== null ? (raw.env as Record<string, unknown>) : DEFAULT_MINIMAX_M1_CONFIG.env,
        storedCredentials,
      ),
    };
  } catch {
    return {
      ...DEFAULT_MINIMAX_M1_CONFIG,
      env: mergeHarnessEnv(DEFAULT_MINIMAX_M1_CONFIG.env, storedCredentials),
    };
  }
}

export function writeMiniMaxM1Config(config: MiniMaxM1Config): void {
  const configPath = resolveConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const rawEnv = typeof config.env === "object" && config.env !== null ? config.env : {};
  const credentialUpdates: Record<string, string | undefined> = {};
  const publicEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawEnv)) {
    if (MINIMAX_M1_SUPPORTED_ENV_KEYS.includes(key as typeof MINIMAX_M1_SUPPORTED_ENV_KEYS[number])) {
      credentialUpdates[key] = value;
      continue;
    }
    publicEnv[key] = value;
  }

  setHarnessCredentials("minimax-m1", credentialUpdates);
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

  for (const key of MINIMAX_M1_SUPPORTED_ENV_KEYS) {
    const secret = credentials[key];
    if (typeof secret === "string" && secret.trim().length > 0) {
      merged[key] = secret;
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Variant → default model id helper
// ---------------------------------------------------------------------------

export function defaultModelIdForVariant(variant: MiniMaxM1Config["variant"]): string {
  return variant === "40k" ? "MiniMaxAI/MiniMax-M1-40k" : "MiniMaxAI/MiniMax-M1-80k";
}
