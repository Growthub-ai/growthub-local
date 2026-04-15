/**
 * CLI Commands — qwen-code
 *
 * Qwen Code CLI integration surface. Provides:
 *
 *   🤖 Qwen Code CLI
 *     ├── Health     (environment detection + setup guidance)
 *     ├── Prompt     (headless single-prompt execution)
 *     └── Session    (interactive terminal session)
 *
 * The adapter is fully self-contained — no npm dependency on @qwen-code/*.
 * Communication is through process spawn of the `qwen` binary.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import {
  readQwenCodeConfig,
  writeQwenCodeConfig,
  checkHealth,
  detectEnvironment,
  buildSetupGuidance,
  executeHeadlessPrompt,
  launchInteractiveSession,
  QWEN_CODE_APPROVAL_MODES,
  QWEN_CODE_SUPPORTED_ENV_KEYS,
} from "../runtime/qwen-code/index.js";
import type { QwenCodeApprovalMode } from "../runtime/qwen-code/index.js";
import { maskSecret } from "../runtime/agent-harness/auth-store.js";

// ---------------------------------------------------------------------------
// Interactive hub (called from discovery menu)
// ---------------------------------------------------------------------------

export async function runQwenCodeHub(opts?: { allowBackToHub?: boolean }): Promise<"back"> {
  while (true) {
    const config = readQwenCodeConfig();
    const health = checkHealth(config.binaryPath, config.env);

    const statusHint = health.status === "available"
      ? pc.green("ready")
      : health.status === "degraded"
        ? pc.yellow("degraded")
        : pc.red("unavailable");

    const action = await p.select({
      message: `Qwen Code CLI (${statusHint})`,
      options: [
        { value: "health", label: "Setup & Health", hint: "environment detection + install guidance" },
        { value: "prompt", label: "Prompt", hint: "single prompt run for quick tasks" },
        { value: "session", label: "Chat Session", hint: "full interactive terminal chat (qwen)" },
        { value: "configure", label: "Configure", hint: `model: ${config.defaultModel}, mode: ${config.approvalMode}` },
        ...(opts?.allowBackToHub ? [{ value: "__back_to_hub" as const, label: "← Back to harness type" }] : []),
      ],
    });

    if (p.isCancel(action) || action === "__back_to_hub") return "back";

    if (action === "health") {
      const env = detectEnvironment(config.binaryPath, config.env);
      const guidance = buildSetupGuidance(env);
      p.note(guidance.join("\n"), "Qwen Code CLI — Setup Helper");
      continue;
    }

    if (action === "prompt") {
      if (health.status === "unavailable") {
        p.note(health.summary, "Qwen Code CLI unavailable");
        continue;
      }

      const rawPrompt = await p.text({
        message: "Enter prompt for Qwen Code",
        placeholder: "Describe what you want to build or analyze...",
      });
      if (p.isCancel(rawPrompt)) continue;
      const prompt = String(rawPrompt).trim();
      if (!prompt) continue;

      const runSpinner = p.spinner();
      runSpinner.start(`Running qwen -p (model: ${config.defaultModel})...`);

      const result = await executeHeadlessPrompt(prompt, config);

      if (result.timedOut) {
        runSpinner.stop("Timed out.");
        p.note(`Process timed out after ${config.timeoutMs}ms.`, "Execution timeout");
        continue;
      }

      if (result.exitCode !== 0) {
        runSpinner.stop(`Exited with code ${result.exitCode ?? "null"}.`);
        if (result.stderr.trim()) {
          p.note(result.stderr.trim().slice(0, 2000), "stderr");
        }
        continue;
      }

      runSpinner.stop(`Completed (${result.durationMs}ms).`);
      if (result.stdout.trim()) {
        console.log("");
        console.log(result.stdout.trim());
        console.log("");
      }
      continue;
    }

    if (action === "session") {
      if (health.status === "unavailable") {
        p.note(health.summary, "Qwen Code CLI unavailable");
        continue;
      }

      p.note(
        [
          `Binary: ${config.binaryPath}`,
          `Model: ${config.defaultModel}`,
          `Mode: ${config.approvalMode}`,
          "",
          "Launching interactive Qwen Code session...",
          "The Growthub CLI will resume when the session ends.",
        ].join("\n"),
        "Qwen Code Interactive Session",
      );

      launchInteractiveSession(config);
      continue;
    }

    if (action === "configure") {
      await runConfigureFlow(config);
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Configuration flow
// ---------------------------------------------------------------------------

async function runConfigureFlow(
  currentConfig: ReturnType<typeof readQwenCodeConfig>,
): Promise<void> {
  const modelInput = await p.text({
    message: "Default model",
    placeholder: "qwen3-coder",
    defaultValue: currentConfig.defaultModel,
  });
  if (p.isCancel(modelInput)) return;

  const modeInput = await p.select({
    message: "Approval mode",
    options: QWEN_CODE_APPROVAL_MODES.map((mode) => ({
      value: mode,
      label: mode,
      hint: mode === "default"
        ? "write tools need approval"
        : mode === "auto-edit"
          ? "file edits auto-approved"
          : "everything auto-approved",
    })),
    initialValue: currentConfig.approvalMode,
  });
  if (p.isCancel(modeInput)) return;

  const binaryInput = await p.text({
    message: "Binary path",
    placeholder: "qwen",
    defaultValue: currentConfig.binaryPath,
  });
  if (p.isCancel(binaryInput)) return;

  const authAction = await p.select({
    message: "Authentication setup",
    options: [
      {
        value: "skip",
        label: "Skip auth changes",
        hint: "Keep current key/OAuth setup",
      },
      {
        value: "set-key",
        label: "Set API key",
        hint: "Store provider API key in local secure harness storage",
      },
      {
        value: "clear-keys",
        label: "Clear stored API keys",
        hint: "Remove saved Qwen provider keys from local storage",
      },
    ],
    initialValue: "skip",
  });
  if (p.isCancel(authAction)) return;

  const nextEnv: Record<string, string> = { ...currentConfig.env };
  if (authAction === "set-key") {
    const providerKey = await p.select({
      message: "Provider key variable",
      options: [
        ...QWEN_CODE_SUPPORTED_ENV_KEYS.map((key) => ({
          value: key,
          label: key,
          hint: `current: ${maskSecret(currentConfig.env[key])}`,
        })),
        {
          value: "__back_to_auth_setup",
          label: "← Back to authentication setup",
        },
      ],
    });
    if (p.isCancel(providerKey)) return;
    if (providerKey === "__back_to_auth_setup") return;

    const keyValue = await p.password({
      message: `${providerKey} value`,
      validate: (value) => {
        if (!value || String(value).trim().length === 0) return "Key value is required.";
      },
    });
    if (p.isCancel(keyValue)) return;
    nextEnv[providerKey] = String(keyValue).trim();
  } else if (authAction === "clear-keys") {
    for (const key of QWEN_CODE_SUPPORTED_ENV_KEYS) {
      delete nextEnv[key];
    }
  }

  const confirmed = await p.confirm({
    message: `Save Qwen Code config? (model: ${String(modelInput)}, mode: ${modeInput}, binary: ${String(binaryInput)})`,
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) return;

  writeQwenCodeConfig({
    ...currentConfig,
    defaultModel: String(modelInput).trim() || currentConfig.defaultModel,
    approvalMode: modeInput as QwenCodeApprovalMode,
    binaryPath: String(binaryInput).trim() || currentConfig.binaryPath,
    env: nextEnv,
  });

  p.log.success("Qwen Code config saved (including local auth storage updates).");
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerQwenCodeCommands(program: Command): void {
  const qwenCode = program
    .command("qwen-code")
    .description("Qwen Code CLI agent integration — health, prompt, interactive session");

  qwenCode
    .command("health")
    .description("Check Qwen Code CLI environment and readiness")
    .action(async () => {
      const config = readQwenCodeConfig();
      const health = checkHealth(config.binaryPath, config.env);
      const env = detectEnvironment(config.binaryPath, config.env);
      const guidance = buildSetupGuidance(env);

      console.log(`Status: ${health.status}`);
      console.log(health.summary);
      console.log("");
      for (const line of guidance) {
        console.log(line);
      }
    });

  qwenCode
    .command("prompt")
    .description("Run a headless Qwen Code prompt and print the output")
    .argument("<prompt>", "The prompt to send to Qwen Code")
    .option("--model <model>", "Model override")
    .option("--yolo", "Auto-approve all tool calls")
    .option("--timeout-ms <ms>", "Execution timeout in milliseconds", (v) => Number(v))
    .option("--cwd <path>", "Working directory for the Qwen Code session")
    .action(async (prompt: string, opts: {
      model?: string;
      yolo?: boolean;
      timeoutMs?: number;
      cwd?: string;
    }) => {
      const config = readQwenCodeConfig();
      const result = await executeHeadlessPrompt(prompt, {
        ...config,
        ...(opts.model ? { defaultModel: opts.model } : {}),
        ...(opts.yolo ? { approvalMode: "yolo" as const } : {}),
        ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
      });

      if (result.timedOut) {
        console.error("Timed out.");
        process.exit(124);
      }

      if (result.stdout.trim()) {
        console.log(result.stdout.trim());
      }
      if (result.stderr.trim()) {
        console.error(result.stderr.trim());
      }
      process.exit(result.exitCode ?? 1);
    });

  qwenCode
    .command("session")
    .description("Launch an interactive Qwen Code terminal session")
    .option("--model <model>", "Model override")
    .option("--yolo", "Auto-approve all tool calls")
    .option("--cwd <path>", "Working directory for the Qwen Code session")
    .action((opts: {
      model?: string;
      yolo?: boolean;
      cwd?: string;
    }) => {
      const config = readQwenCodeConfig();
      const { exitCode } = launchInteractiveSession({
        ...config,
        ...(opts.model ? { defaultModel: opts.model } : {}),
        ...(opts.yolo ? { approvalMode: "yolo" as const } : {}),
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
      });
      process.exit(exitCode ?? 0);
    });

  // Default action: launch interactive hub
  qwenCode.action(async () => {
    await runQwenCodeHub({ allowBackToHub: false });
  });
}
