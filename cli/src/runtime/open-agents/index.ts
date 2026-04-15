/**
 * Open Agents Module — Barrel Export
 *
 * Single import surface for the Open Agents runtime harness.
 * Provides configuration persistence, backend health checks,
 * and session lifecycle management for durable agent workflows.
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import { getHarnessCredential, setHarnessCredential } from "../agent-harness/auth-store.js";
import type {
  OpenAgentsConfig,
  OpenAgentsBackendType,
  OpenAgentsAuthMode,
} from "./contract.js";
import { DEFAULT_OPEN_AGENTS_CONFIG } from "./contract.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  OpenAgentsBackendType,
  SandboxState,
  AgentSessionStatus,
  AgentRunEventType,
  AgentRunEvent,
  OpenAgentsSessionSummary,
  OpenAgentsHealthResult,
  OpenAgentsConfig,
  OpenAgentsAuthMode,
} from "./contract.js";

export { DEFAULT_OPEN_AGENTS_CONFIG } from "./contract.js";

export {
  checkOpenAgentsHealth,
  listOpenAgentsSessions,
  createOpenAgentsSession,
  resumeOpenAgentsSession,
  pollSessionEvents,
  OpenAgentsBackendError,
} from "./provider.js";

export type { CreateSessionInput } from "./provider.js";

// ---------------------------------------------------------------------------
// Configuration persistence
// ---------------------------------------------------------------------------

function resolveConfigPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "open-agents", "config.json");
}

export function readOpenAgentsConfig(): OpenAgentsConfig {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    return {
      ...DEFAULT_OPEN_AGENTS_CONFIG,
      apiKey: getHarnessCredential("open-agents", "apiKey"),
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<OpenAgentsConfig>;
    const storedApiKey = getHarnessCredential("open-agents", "apiKey");
    return {
      backendType: validateBackendType(raw.backendType),
      authMode: validateAuthMode(raw.authMode),
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : DEFAULT_OPEN_AGENTS_CONFIG.endpoint,
      apiKey: storedApiKey ?? (typeof raw.apiKey === "string" ? raw.apiKey : undefined),
      defaultRepo: typeof raw.defaultRepo === "string" ? raw.defaultRepo : undefined,
      defaultBranch: typeof raw.defaultBranch === "string" ? raw.defaultBranch : undefined,
      sandboxTimeoutMs: typeof raw.sandboxTimeoutMs === "number" ? raw.sandboxTimeoutMs : DEFAULT_OPEN_AGENTS_CONFIG.sandboxTimeoutMs,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_OPEN_AGENTS_CONFIG.timeoutMs,
    };
  } catch {
    return {
      ...DEFAULT_OPEN_AGENTS_CONFIG,
      apiKey: getHarnessCredential("open-agents", "apiKey"),
    };
  }
}

export function writeOpenAgentsConfig(config: OpenAgentsConfig): void {
  const configPath = resolveConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const persisted: OpenAgentsConfig = {
    ...config,
    authMode: validateAuthMode(config.authMode),
    apiKey: undefined,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(persisted, null, 2)}\n`, "utf-8");
  setHarnessCredential("open-agents", "apiKey", config.apiKey);
}

function validateBackendType(value: unknown): OpenAgentsBackendType {
  if (value === "local" || value === "hosted") return value;
  return "local";
}

function validateAuthMode(value: unknown): OpenAgentsAuthMode {
  if (value === "none" || value === "api-key" || value === "vercel-managed") {
    return value;
  }
  return "none";
}
