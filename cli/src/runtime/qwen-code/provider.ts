/**
 * Qwen Code CLI — Provider / Process Adapter
 *
 * Thin adapter that spawns the `qwen` CLI binary as a child process.
 * Supports two execution modes:
 *
 *   1. Headless prompt: `qwen -p "prompt"` — fire-and-forget, captures output
 *   2. Interactive session: `qwen` — inherits stdio for full terminal UI
 *
 * No in-process SDK dependency — the adapter is fully self-contained and
 * communicates with qwen exclusively through process spawn + stdio.
 */

import { spawn, spawnSync } from "node:child_process";
import type {
  QwenCodeConfig,
  QwenCodeExecutionResult,
} from "./contract.js";
import { DEFAULT_QWEN_CODE_CONFIG } from "./contract.js";

// ---------------------------------------------------------------------------
// Headless prompt execution
// ---------------------------------------------------------------------------

export async function executeHeadlessPrompt(
  prompt: string,
  configOverride?: Partial<QwenCodeConfig>,
): Promise<QwenCodeExecutionResult> {
  const config = { ...DEFAULT_QWEN_CODE_CONFIG, ...configOverride };
  const startMs = Date.now();

  const args = ["-p", prompt];

  if (config.defaultModel) {
    args.push("--model", config.defaultModel);
  }

  if (config.approvalMode === "yolo") {
    args.push("--yolo");
  }

  if (config.maxSessionTurns > 0) {
    args.push("--max-turns", String(config.maxSessionTurns));
  }

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...config.env,
  };

  return new Promise<QwenCodeExecutionResult>((resolve) => {
    const child = spawn(config.binaryPath, args, {
      cwd: config.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = config.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          // Grace period before SIGKILL
          setTimeout(() => {
            if (!child.killed) child.kill("SIGKILL");
          }, 5_000);
        }, config.timeoutMs)
      : null;

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode, signal) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        exitCode,
        timedOut,
        stdout,
        stderr,
        durationMs: Date.now() - startMs,
        signal: signal ?? null,
      });
    });

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: stderr + (err.message ?? "spawn error"),
        durationMs: Date.now() - startMs,
        signal: null,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Interactive session (inherits terminal stdio)
// ---------------------------------------------------------------------------

export function launchInteractiveSession(
  configOverride?: Partial<QwenCodeConfig>,
): { exitCode: number | null } {
  const config = { ...DEFAULT_QWEN_CODE_CONFIG, ...configOverride };

  const args: string[] = [];

  if (config.defaultModel) {
    args.push("--model", config.defaultModel);
  }

  if (config.approvalMode === "yolo") {
    args.push("--yolo");
  }

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...config.env,
  };

  const result = spawnSync(config.binaryPath, args, {
    cwd: config.cwd,
    env,
    stdio: "inherit",
  });

  return { exitCode: result.status };
}

// ---------------------------------------------------------------------------
// Version detection (synchronous for setup/health flows)
// ---------------------------------------------------------------------------

export function detectQwenVersion(
  binaryPath: string = "qwen",
): { found: boolean; version: string | null; resolvedPath: string } {
  try {
    const result = spawnSync(binaryPath, ["--version"], {
      timeout: 10_000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status === 0 && result.stdout) {
      const versionMatch = result.stdout.trim().match(/(\d+\.\d+\.\d+)/);
      return {
        found: true,
        version: versionMatch ? versionMatch[1] : result.stdout.trim(),
        resolvedPath: binaryPath,
      };
    }

    return { found: false, version: null, resolvedPath: binaryPath };
  } catch {
    return { found: false, version: null, resolvedPath: binaryPath };
  }
}
