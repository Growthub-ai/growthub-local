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
import type {
  OpenAgentsConfig,
  OpenAgentsBackendType,
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
    return { ...DEFAULT_OPEN_AGENTS_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<OpenAgentsConfig>;
    return {
      backendType: validateBackendType(raw.backendType),
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : DEFAULT_OPEN_AGENTS_CONFIG.endpoint,
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
      defaultRepo: typeof raw.defaultRepo === "string" ? raw.defaultRepo : undefined,
      defaultBranch: typeof raw.defaultBranch === "string" ? raw.defaultBranch : undefined,
      sandboxTimeoutMs: typeof raw.sandboxTimeoutMs === "number" ? raw.sandboxTimeoutMs : DEFAULT_OPEN_AGENTS_CONFIG.sandboxTimeoutMs,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_OPEN_AGENTS_CONFIG.timeoutMs,
    };
  } catch {
    return { ...DEFAULT_OPEN_AGENTS_CONFIG };
  }
}

export function writeOpenAgentsConfig(config: OpenAgentsConfig): void {
  const configPath = resolveConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function validateBackendType(value: unknown): OpenAgentsBackendType {
  if (value === "local" || value === "hosted") return value;
  return "local";
}
