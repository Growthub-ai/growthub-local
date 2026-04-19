/**
 * T3 Code CLI — Contract Types
 *
 * Stable types for the T3 Code CLI adapter surface.
 * T3 Code is an open-source terminal AI coding agent
 * (https://github.com/pingdotgg/t3code) that runs as a local CLI binary.
 *
 * Integration strategy:
 *   - Binary detection : `t3 --version`
 *   - Headless run     : `t3 -p "<prompt>"` (non-interactive)
 *   - Interactive run  : `t3` (terminal UI, inherited stdio)
 *
 * Guardrails:
 *   - T3 Code runs as a child process — no in-process SDK import
 *   - All tool execution gated by T3 Code's own permission model
 *   - Adapter never bypasses T3 Code's sandbox or approval modes
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface T3CodeConfig {
  binaryPath: string;
  defaultModel: string;
  cwd: string;
  approvalMode: T3CodeApprovalMode;
  timeoutMs: number;
  env: Record<string, string>;
}

export type T3CodeApprovalMode = "default" | "auto-edit" | "yolo";

export const T3_CODE_APPROVAL_MODES: readonly T3CodeApprovalMode[] = [
  "default",
  "auto-edit",
  "yolo",
] as const;

export const T3_CODE_SUPPORTED_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

export type T3CodeSupportedEnvKey = typeof T3_CODE_SUPPORTED_ENV_KEYS[number];

export const DEFAULT_T3_CODE_CONFIG: T3CodeConfig = {
  binaryPath: "t3",
  defaultModel: "claude-sonnet-4-6",
  cwd: process.cwd(),
  approvalMode: "default",
  timeoutMs: 120_000,
  env: {},
};

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

export interface T3CodeEnvironmentStatus {
  binaryFound: boolean;
  binaryVersion: string | null;
  binaryPath: string;
  nodeVersionSufficient: boolean;
  nodeVersion: string;
  apiKeyConfigured: boolean;
  osLabel: string;
}

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------

export interface T3CodeExecutionResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  signal: string | null;
}

// ---------------------------------------------------------------------------
// Health result
// ---------------------------------------------------------------------------

export interface T3CodeHealthResult {
  status: "available" | "degraded" | "unavailable";
  environment: T3CodeEnvironmentStatus;
  summary: string;
}
