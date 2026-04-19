/**
 * T3 Code CLI — Provider / Process Adapter
 *
 * Spawns the `t3` binary as a child process. No in-process SDK dependency.
 *
 * Modes:
 *   1. Headless : `t3 -p "<prompt>"` — captures stdout/stderr
 *   2. Session  : `t3` — inherits stdio for full terminal UI
 */

import { spawn, spawnSync } from "node:child_process";
import type { T3CodeConfig, T3CodeExecutionResult } from "./contract.js";
import { DEFAULT_T3_CODE_CONFIG } from "./contract.js";

// ---------------------------------------------------------------------------
// Headless prompt
// ---------------------------------------------------------------------------

export async function executeHeadlessPrompt(
  prompt: string,
  configOverride?: Partial<T3CodeConfig>,
): Promise<T3CodeExecutionResult> {
  const config = { ...DEFAULT_T3_CODE_CONFIG, ...configOverride };
  const startMs = Date.now();

  const args = ["-p", prompt];
  if (config.defaultModel) args.push("--model", config.defaultModel);
  if (config.approvalMode === "yolo") args.push("--yolo");

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...config.env,
  };

  return new Promise<T3CodeExecutionResult>((resolve) => {
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
          setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 5_000);
        }, config.timeoutMs)
      : null;

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (exitCode, signal) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({ exitCode, timedOut, stdout, stderr, durationMs: Date.now() - startMs, signal: signal ?? null });
    });

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({ exitCode: null, timedOut: false, stdout, stderr: stderr + (err.message ?? "spawn error"), durationMs: Date.now() - startMs, signal: null });
    });
  });
}

// ---------------------------------------------------------------------------
// Interactive session
// ---------------------------------------------------------------------------

export function launchInteractiveSession(
  configOverride?: Partial<T3CodeConfig>,
): { exitCode: number | null } {
  const config = { ...DEFAULT_T3_CODE_CONFIG, ...configOverride };

  const args: string[] = [];
  if (config.defaultModel) args.push("--model", config.defaultModel);
  if (config.approvalMode === "yolo") args.push("--yolo");

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...config.env,
  };

  const result = spawnSync(config.binaryPath, args, { cwd: config.cwd, env, stdio: "inherit" });
  return { exitCode: result.status };
}

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

export function detectT3Version(
  binaryPath = "t3",
): { found: boolean; version: string | null; resolvedPath: string } {
  try {
    const result = spawnSync(binaryPath, ["--version"], {
      timeout: 10_000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status === 0 && result.stdout) {
      const match = result.stdout.trim().match(/(\d+\.\d+\.\d+)/);
      return { found: true, version: match ? match[1] : result.stdout.trim(), resolvedPath: binaryPath };
    }
    return { found: false, version: null, resolvedPath: binaryPath };
  } catch {
    return { found: false, version: null, resolvedPath: binaryPath };
  }
}
