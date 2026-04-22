/**
 * CLI Commands — minimax-m1
 *
 * MiniMax-M1 local intelligence primitive. Provides:
 *
 *   🧠 MiniMax-M1
 *     ├── Health       (endpoint + model + key detection, setup guidance)
 *     ├── Serve        (print copy-pasteable `vllm serve` command)
 *     ├── Prompt       (headless single-prompt generation)
 *     ├── Chat         (governed chat session against the local server)
 *     └── Configure    (endpoint, model, variant, API key)
 *
 * The adapter is fully self-contained — no npm dependency on minimax SDKs.
 * Generation happens over an OpenAI-compatible HTTP endpoint (vLLM reference).
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import {
  readMiniMaxM1Config,
  writeMiniMaxM1Config,
  checkHealth,
  detectEnvironment,
  buildSetupGuidance,
  buildServeCommand,
  executeHeadlessPrompt,
  defaultModelIdForVariant,
  MINIMAX_M1_SUPPORTED_ENV_KEYS,
  MINIMAX_M1_VARIANTS,
} from "../runtime/minimax-m1/index.js";
import type { MiniMaxM1Variant } from "../runtime/minimax-m1/index.js";
import { maskSecret } from "../runtime/agent-harness/auth-store.js";

// ---------------------------------------------------------------------------
// Interactive hub (called from discovery menu)
// ---------------------------------------------------------------------------

export async function runMiniMaxM1Hub(opts?: { allowBackToHub?: boolean }): Promise<"back"> {
  while (true) {
    const config = readMiniMaxM1Config();
    const health = await checkHealth(config);

    const statusHint = health.status === "available"
      ? pc.green("ready")
      : health.status === "degraded"
        ? pc.yellow("degraded")
        : pc.red("unavailable");

    const action = await p.select({
      message: `MiniMax-M1 (${statusHint})`,
      options: [
        { value: "health", label: "Setup & Health", hint: "endpoint probe + vLLM setup guidance" },
        { value: "serve", label: "Serve Command", hint: "copy-pasteable `vllm serve` invocation" },
        { value: "prompt", label: "Prompt", hint: "single headless prompt for quick tasks" },
        { value: "chat", label: "Chat Session", hint: "governed chat loop against the local server" },
        { value: "configure", label: "Configure", hint: `variant: ${config.variant}, model: ${config.model}` },
        ...(opts?.allowBackToHub ? [{ value: "__back_to_hub" as const, label: "← Back to harness type" }] : []),
      ],
    });

    if (p.isCancel(action) || action === "__back_to_hub") return "back";

    if (action === "health") {
      const env = await detectEnvironment(config);
      const guidance = buildSetupGuidance(env, config);
      p.note(guidance.join("\n"), "MiniMax-M1 — Setup Helper");
      continue;
    }

    if (action === "serve") {
      const command = buildServeCommand(config);
      p.note(
        [
          "Copy-paste this into a host with the required GPUs:",
          "",
          command,
          "",
          "Then run `growthub minimax-m1 health` to verify reachability.",
        ].join("\n"),
        "MiniMax-M1 — vLLM serve",
      );
      continue;
    }

    if (action === "prompt") {
      if (health.status === "unavailable") {
        p.note(health.summary, "MiniMax-M1 unavailable");
        continue;
      }

      const rawPrompt = await p.text({
        message: "Enter prompt for MiniMax-M1",
        placeholder: "Reason over this repository, or paste any long-context task...",
      });
      if (p.isCancel(rawPrompt)) continue;
      const prompt = String(rawPrompt).trim();
      if (!prompt) continue;

      const runSpinner = p.spinner();
      runSpinner.start(`Calling ${config.model} at ${config.baseUrl}...`);

      const result = await executeHeadlessPrompt(prompt, config);

      if (result.timedOut) {
        runSpinner.stop("Timed out.");
        p.note(`Request timed out after ${config.timeoutMs}ms.`, "Execution timeout");
        continue;
      }

      if (result.exitCode !== 0) {
        runSpinner.stop(`Failed (exit ${result.exitCode ?? "null"}).`);
        if (result.stderr.trim()) {
          p.note(result.stderr.trim().slice(0, 2000), "error");
        }
        continue;
      }

      const usage = result.usage.totalTokens != null
        ? ` · ${result.usage.totalTokens} tokens`
        : "";
      runSpinner.stop(`Completed (${result.durationMs}ms${usage}).`);
      if (result.stdout.trim()) {
        console.log("");
        console.log(result.stdout.trim());
        console.log("");
      }
      continue;
    }

    if (action === "chat") {
      if (health.status === "unavailable") {
        p.note(health.summary, "MiniMax-M1 unavailable");
        continue;
      }
      await runChatLoop(config);
      continue;
    }

    if (action === "configure") {
      await runConfigureFlow(config);
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// In-process chat loop (no binary to spawn, so we implement it here)
// ---------------------------------------------------------------------------

async function runChatLoop(config: ReturnType<typeof readMiniMaxM1Config>): Promise<void> {
  p.note(
    [
      `Endpoint: ${config.baseUrl}`,
      `Model: ${config.model}`,
      `Variant: ${config.variant}`,
      "",
      "Type a message and press enter. Empty input exits.",
    ].join("\n"),
    "MiniMax-M1 Chat",
  );

  while (true) {
    const raw = await p.text({ message: "you" });
    if (p.isCancel(raw)) return;
    const message = String(raw).trim();
    if (!message) return;

    const spinner = p.spinner();
    spinner.start("thinking...");
    const result = await executeHeadlessPrompt(message, config);

    if (result.timedOut) {
      spinner.stop("Timed out.");
      continue;
    }
    if (result.exitCode !== 0) {
      spinner.stop(`Error (${result.exitCode ?? "null"})`);
      if (result.stderr.trim()) p.note(result.stderr.trim().slice(0, 1500), "error");
      continue;
    }

    const usage = result.usage.totalTokens != null ? ` · ${result.usage.totalTokens} tokens` : "";
    spinner.stop(`assistant (${result.durationMs}ms${usage})`);
    if (result.stdout.trim()) {
      console.log("");
      console.log(result.stdout.trim());
      console.log("");
    }
  }
}

// ---------------------------------------------------------------------------
// Configuration flow
// ---------------------------------------------------------------------------

async function runConfigureFlow(
  currentConfig: ReturnType<typeof readMiniMaxM1Config>,
): Promise<void> {
  const baseUrlInput = await p.text({
    message: "OpenAI-compatible base URL",
    placeholder: "http://127.0.0.1:8000",
    defaultValue: currentConfig.baseUrl,
  });
  if (p.isCancel(baseUrlInput)) return;

  const variantInput = await p.select({
    message: "Thinking-budget variant",
    options: MINIMAX_M1_VARIANTS.map((variant) => ({
      value: variant,
      label: variant,
      hint: variant === "40k" ? "smaller thinking budget, faster" : "larger thinking budget, deeper reasoning",
    })),
    initialValue: currentConfig.variant,
  });
  if (p.isCancel(variantInput)) return;

  const suggestedModel = defaultModelIdForVariant(variantInput as MiniMaxM1Variant);
  const modelInput = await p.text({
    message: "Model id (as served by the backend)",
    placeholder: suggestedModel,
    defaultValue: currentConfig.model || suggestedModel,
  });
  if (p.isCancel(modelInput)) return;

  const authAction = await p.select({
    message: "Authentication setup",
    options: [
      { value: "skip", label: "Skip auth changes", hint: "Keep current key setup" },
      { value: "set-key", label: "Set API key", hint: "Store provider key in local secure harness storage" },
      { value: "clear-keys", label: "Clear stored API keys", hint: "Remove saved MiniMax-M1 keys from local storage" },
    ],
    initialValue: "skip",
  });
  if (p.isCancel(authAction)) return;

  const nextEnv: Record<string, string> = { ...currentConfig.env };
  if (authAction === "set-key") {
    const providerKey = await p.select({
      message: "Provider key variable",
      options: [
        ...MINIMAX_M1_SUPPORTED_ENV_KEYS.map((key) => ({
          value: key,
          label: key,
          hint: `current: ${maskSecret(currentConfig.env[key])}`,
        })),
        { value: "__back_to_auth_setup", label: "← Back to authentication setup" },
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
    for (const key of MINIMAX_M1_SUPPORTED_ENV_KEYS) {
      delete nextEnv[key];
    }
  }

  const confirmed = await p.confirm({
    message: `Save MiniMax-M1 config? (variant: ${variantInput}, model: ${String(modelInput)}, endpoint: ${String(baseUrlInput)})`,
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) return;

  writeMiniMaxM1Config({
    ...currentConfig,
    baseUrl: String(baseUrlInput).trim() || currentConfig.baseUrl,
    variant: variantInput as MiniMaxM1Variant,
    model: String(modelInput).trim() || suggestedModel,
    env: nextEnv,
  });

  p.log.success("MiniMax-M1 config saved (including local auth storage updates).");
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerMiniMaxM1Commands(program: Command): void {
  const minimax = program
    .command("minimax-m1")
    .description("MiniMax-M1 local intelligence primitive — health, prompt, chat, serve");

  minimax
    .command("health")
    .description("Probe the MiniMax-M1 endpoint and print setup guidance")
    .action(async () => {
      const config = readMiniMaxM1Config();
      const health = await checkHealth(config);
      const env = await detectEnvironment(config);
      const guidance = buildSetupGuidance(env, config);

      console.log(`Status: ${health.status}`);
      console.log(health.summary);
      console.log("");
      for (const line of guidance) {
        console.log(line);
      }
    });

  minimax
    .command("serve")
    .description("Print a copy-pasteable `vllm serve` command for the configured model")
    .option("--variant <variant>", "Override variant (40k | 80k)")
    .option("--tensor-parallel <n>", "Override tensor-parallel size", (v) => Number(v))
    .option("--port <n>", "Override port", (v) => Number(v))
    .action((opts: { variant?: string; tensorParallel?: number; port?: number }) => {
      const config = readMiniMaxM1Config();
      const variant = opts.variant === "40k" || opts.variant === "80k" ? opts.variant : config.variant;
      const override = {
        ...config,
        variant,
        model: opts.variant ? defaultModelIdForVariant(variant) : config.model,
        tensorParallel: opts.tensorParallel ?? config.tensorParallel,
        baseUrl: opts.port
          ? replacePort(config.baseUrl, opts.port)
          : config.baseUrl,
      };
      console.log(buildServeCommand(override));
    });

  minimax
    .command("prompt")
    .description("Run a headless MiniMax-M1 prompt and print the output")
    .argument("<prompt>", "The prompt to send to MiniMax-M1")
    .option("--model <model>", "Model override")
    .option("--base-url <url>", "Override base URL")
    .option("--timeout-ms <ms>", "Request timeout in milliseconds", (v) => Number(v))
    .option("--max-tokens <n>", "Max output tokens", (v) => Number(v))
    .action(async (prompt: string, opts: {
      model?: string;
      baseUrl?: string;
      timeoutMs?: number;
      maxTokens?: number;
    }) => {
      const config = readMiniMaxM1Config();
      const result = await executeHeadlessPrompt(prompt, {
        ...config,
        ...(opts.model ? { model: opts.model } : {}),
        ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
        ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
        ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
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

  minimax
    .command("chat")
    .description("Launch a governed chat loop against the configured MiniMax-M1 endpoint")
    .option("--model <model>", "Model override")
    .option("--base-url <url>", "Override base URL")
    .action(async (opts: { model?: string; baseUrl?: string }) => {
      const config = readMiniMaxM1Config();
      await runChatLoop({
        ...config,
        ...(opts.model ? { model: opts.model } : {}),
        ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      });
    });

  // Default action: launch interactive hub
  minimax.action(async () => {
    await runMiniMaxM1Hub({ allowBackToHub: false });
  });
}

function replacePort(baseUrl: string, port: number): string {
  try {
    const parsed = new URL(baseUrl);
    parsed.port = String(port);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return baseUrl;
  }
}
