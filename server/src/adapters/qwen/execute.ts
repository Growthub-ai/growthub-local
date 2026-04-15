import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import {
  asString,
  asNumber,
  parseObject,
  buildPaperclipEnv,
  redactEnvForLogs,
  runChildProcess,
} from "../utils.js";

/**
 * Qwen Code adapter — execute
 *
 * Spawns the `qwen` CLI binary in headless mode (`qwen -p "<prompt>"`)
 * to execute an agent task. Follows the same process-spawn pattern as the
 * built-in process adapter but with Qwen Code-specific argument assembly.
 *
 * Expected adapterConfig fields:
 *   - prompt (string, required): the prompt to send to Qwen Code
 *   - model (string, optional): model override (default: qwen3-coder)
 *   - cwd (string, optional): working directory
 *   - approvalMode (string, optional): "default" | "auto-edit" | "yolo"
 *   - env (object, optional): extra environment variables
 *   - timeoutSec (number, optional): execution timeout
 *   - graceSec (number, optional): SIGTERM grace window
 *   - binaryPath (string, optional): path to qwen binary (default: "qwen")
 */
export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, onLog, onMeta } = ctx;
  const prompt = asString(config.prompt, "");
  if (!prompt) throw new Error("Qwen Code adapter requires a prompt");

  const binaryPath = asString(config.binaryPath, "qwen");
  const model = asString(config.model, "qwen3-coder");
  const cwd = asString(config.cwd, process.cwd());
  const approvalMode = asString(config.approvalMode, "default");

  const args: string[] = ["-p", prompt];

  if (model) {
    args.push("--model", model);
  }

  if (approvalMode === "yolo") {
    args.push("--yolo");
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === "string") env[k] = v;
  }

  const timeoutSec = asNumber(config.timeoutSec, 120);
  const graceSec = asNumber(config.graceSec, 15);

  if (onMeta) {
    await onMeta({
      adapterType: "qwen_local",
      command: binaryPath,
      cwd,
      commandArgs: args,
      env: redactEnvForLogs(env),
    });
  }

  const proc = await runChildProcess(runId, binaryPath, args, {
    cwd,
    env,
    timeoutSec,
    graceSec,
    onLog,
  });

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Qwen Code timed out after ${timeoutSec}s`,
    };
  }

  if ((proc.exitCode ?? 0) !== 0) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: false,
      errorMessage: `Qwen Code exited with code ${proc.exitCode ?? -1}`,
      resultJson: {
        stdout: proc.stdout,
        stderr: proc.stderr,
      },
    };
  }

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    resultJson: {
      stdout: proc.stdout,
      stderr: proc.stderr,
    },
  };
}
