/**
 * Qwen Code CLI — Contract Types
 *
 * Stable types that define the Qwen Code CLI adapter surface.
 * Qwen Code is an open-source terminal AI coding agent
 * (https://github.com/QwenLM/qwen-code) that runs as a local CLI binary.
 *
 * Integration strategy:
 *   - Binary detection: `qwen --version`
 *   - Headless execution: `qwen -p "<prompt>"` (non-interactive)
 *   - Interactive execution: `qwen` (terminal UI)
 *   - Output format: JSON via `--output-format json` flag
 *
 * Guardrails:
 *   - Qwen Code runs as a child process — no in-process SDK import
 *   - All tool execution is gated by Qwen Code's own permission model
 *   - The adapter does not bypass Qwen Code's sandbox or approval modes
 *   - Session lifecycle is managed by spawn/kill, not by protocol
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface QwenCodeConfig {
  /** Path to the qwen binary (defaults to "qwen" on PATH) */
  binaryPath: string;
  /** Default model to use (e.g. "qwen3-coder", "qwen3.6-plus") */
  defaultModel: string;
  /** Working directory for Qwen Code sessions */
  cwd: string;
  /** Approval mode: "default" | "auto-edit" | "yolo" */
  approvalMode: QwenCodeApprovalMode;
  /** Maximum session turns before auto-stop (0 = unlimited) */
  maxSessionTurns: number;
  /** Timeout in milliseconds for headless prompt execution */
  timeoutMs: number;
  /** Environment variables passed to the Qwen Code process */
  env: Record<string, string>;
}

export type QwenCodeApprovalMode = "default" | "auto-edit" | "yolo";

export const QWEN_CODE_APPROVAL_MODES: readonly QwenCodeApprovalMode[] = [
  "default",
  "auto-edit",
  "yolo",
] as const;

export const DEFAULT_QWEN_CODE_CONFIG: QwenCodeConfig = {
  binaryPath: "qwen",
  defaultModel: "qwen3-coder",
  cwd: process.cwd(),
  approvalMode: "default",
  maxSessionTurns: 0,
  timeoutMs: 120_000,
  env: {},
};

// ---------------------------------------------------------------------------
// Environment detection result
// ---------------------------------------------------------------------------

export interface QwenCodeEnvironmentStatus {
  /** Whether the qwen binary was found on PATH or at the configured path */
  binaryFound: boolean;
  /** Detected binary version string (e.g. "0.14.4") */
  binaryVersion: string | null;
  /** Resolved binary path */
  binaryPath: string;
  /** Whether Node.js >= 20 is available (required by Qwen Code) */
  nodeVersionSufficient: boolean;
  /** Detected Node.js version */
  nodeVersion: string;
  /** Whether a DASHSCOPE_API_KEY (or compatible key) is set */
  apiKeyConfigured: boolean;
  /** OS label for setup guidance */
  osLabel: string;
}

// ---------------------------------------------------------------------------
// Headless execution result
// ---------------------------------------------------------------------------

export interface QwenCodeExecutionResult {
  /** Exit code from the qwen process */
  exitCode: number | null;
  /** Whether the process timed out */
  timedOut: boolean;
  /** Captured stdout text */
  stdout: string;
  /** Captured stderr text */
  stderr: string;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Signal if process was killed */
  signal: string | null;
}

// ---------------------------------------------------------------------------
// Health check result
// ---------------------------------------------------------------------------

export interface QwenCodeHealthResult {
  /** Overall health: available, degraded, or unavailable */
  status: "available" | "degraded" | "unavailable";
  /** Environment detection details */
  environment: QwenCodeEnvironmentStatus;
  /** Human-readable summary */
  summary: string;
}
