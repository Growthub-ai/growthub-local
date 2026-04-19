/**
 * CLI Commands — t3code
 *
 * T3 Code CLI integration surface under Agent Harness discovery.
 *
 *   growthub t3code
 *     ├── health        environment detection + setup guidance
 *     ├── prompt        headless single-prompt execution
 *     ├── session       interactive terminal session
 *     ├── configure     model, approval mode, binary path, API keys
 *     └── profile
 *           ├── status  show linked Growthub workspace
 *           ├── link    bind this harness to a Growthub workspace
 *           └── unlink  remove the Growthub profile
 *
 * Process-spawn only — no in-process SDK dependency on t3code packages.
 * Growthub profile primitive: harness-profile.ts (generic, reusable).
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import {
  readT3CodeConfig,
  writeT3CodeConfig,
  checkHealth,
  detectEnvironment,
  buildSetupGuidance,
  executeHeadlessPrompt,
  launchInteractiveSession,
  T3_CODE_APPROVAL_MODES,
  T3_CODE_SUPPORTED_ENV_KEYS,
  T3_HARNESS_ID,
  T3_HARNESS_LABEL,
  readT3GrowthubProfile,
  writeT3GrowthubProfile,
} from "../runtime/t3code/index.js";
import type { T3CodeApprovalMode } from "../runtime/t3code/index.js";
import { maskSecret } from "../runtime/agent-harness/auth-store.js";
import {
  buildProfileStatusLines,
  runProfileLinkFlow,
  clearHarnessProfile,
  registerHarnessProfileCommands,
} from "../runtime/agent-harness/harness-profile.js";

// ---------------------------------------------------------------------------
// Interactive hub (called from discovery menu)
// ---------------------------------------------------------------------------

export async function runT3CodeHub(opts?: { allowBackToHub?: boolean }): Promise<"back"> {
  while (true) {
    const config = readT3CodeConfig();
    const health = checkHealth(config.binaryPath, config.env);
    const profile = readT3GrowthubProfile();

    const statusHint = health.status === "available"
      ? pc.green("ready")
      : health.status === "degraded"
        ? pc.yellow("degraded")
        : pc.red("unavailable");

    const profileHint = profile
      ? pc.green(`linked → ${profile.workspaceId}`)
      : pc.dim("not linked");

    const action = await p.select({
      message: `T3 Code CLI (${statusHint})`,
      options: [
        {
          value: "health",
          label: "Setup & Health",
          hint: "environment detection + install guidance",
        },
        {
          value: "prompt",
          label: "Prompt",
          hint: "single prompt run for quick tasks",
        },
        {
          value: "session",
          label: "Chat Session",
          hint: `full interactive terminal session (t3)`,
        },
        {
          value: "configure",
          label: "Configure",
          hint: `model: ${config.defaultModel}, mode: ${config.approvalMode}`,
        },
        {
          value: "profile",
          label: "Growthub Profile",
          hint: profileHint,
        },
        ...(opts?.allowBackToHub
          ? [{ value: "__back_to_hub" as const, label: "← Back to harness type" }]
          : []),
      ],
    });

    if (p.isCancel(action) || action === "__back_to_hub") return "back";

    // -- Health --------------------------------------------------------------
    if (action === "health") {
      const env = detectEnvironment(config.binaryPath, config.env);
      const guidance = buildSetupGuidance(env);
      p.note(guidance.join("\n"), "T3 Code CLI — Setup Helper");
      continue;
    }

    // -- Prompt --------------------------------------------------------------
    if (action === "prompt") {
      if (health.status === "unavailable") {
        p.note(health.summary, "T3 Code CLI unavailable");
        continue;
      }

      const rawPrompt = await p.text({
        message: "Enter prompt for T3 Code",
        placeholder: "Describe what you want to build or analyze...",
      });
      if (p.isCancel(rawPrompt)) continue;
      const prompt = String(rawPrompt).trim();
      if (!prompt) continue;

      const runSpinner = p.spinner();
      runSpinner.start(`Running t3 -p (model: ${config.defaultModel})...`);

      const result = await executeHeadlessPrompt(prompt, config);

      if (result.timedOut) {
        runSpinner.stop("Timed out.");
        p.note(`Process timed out after ${config.timeoutMs}ms.`, "Execution timeout");
        continue;
      }

      if (result.exitCode !== 0) {
        runSpinner.stop(`Exited with code ${result.exitCode ?? "null"}.`);
        if (result.stderr.trim()) p.note(result.stderr.trim().slice(0, 2000), "stderr");
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

    // -- Session -------------------------------------------------------------
    if (action === "session") {
      if (health.status === "unavailable") {
        p.note(health.summary, "T3 Code CLI unavailable");
        continue;
      }

      p.note(
        [
          `Binary : ${config.binaryPath}`,
          `Model  : ${config.defaultModel}`,
          `Mode   : ${config.approvalMode}`,
          profile ? `Profile: linked → ${profile.workspaceId}` : "Profile: not linked",
          "",
          "Launching interactive T3 Code session...",
          "Growthub CLI will resume when the session ends.",
        ].join("\n"),
        "T3 Code Interactive Session",
      );

      launchInteractiveSession(config);
      continue;
    }

    // -- Configure -----------------------------------------------------------
    if (action === "configure") {
      await runConfigureFlow(config);
      continue;
    }

    // -- Profile -------------------------------------------------------------
    if (action === "profile") {
      await runProfileHubFlow();
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Profile hub (inline within the t3code hub)
// ---------------------------------------------------------------------------

async function runProfileHubFlow(): Promise<void> {
  while (true) {
    const profile = readT3GrowthubProfile();
    const statusLines = buildProfileStatusLines(T3_HARNESS_ID, T3_HARNESS_LABEL, profile);

    p.note(statusLines.join("\n"), "T3 Code — Growthub Profile");

    const action = await p.select({
      message: "Profile actions",
      options: [
        {
          value: "link",
          label: profile ? "Update / re-link" : "Link to Growthub workspace",
          hint: "bind this harness to a Growthub workspace",
        },
        {
          value: "unlink",
          label: "Unlink",
          hint: "remove the Growthub profile from this harness",
          ...(profile ? {} : { hint: "(no profile linked)" }),
        },
        { value: "__back", label: "← Back" },
      ],
    });

    if (p.isCancel(action) || action === "__back") return;

    if (action === "link") {
      const newProfile = await runProfileLinkFlow(T3_HARNESS_ID, T3_HARNESS_LABEL, profile);
      if (newProfile) {
        writeT3GrowthubProfile(newProfile);
        p.log.success(`T3 Code profile linked to workspace ${newProfile.workspaceId}.`);
      }
      continue;
    }

    if (action === "unlink") {
      if (!profile) {
        p.log.warn("No profile is currently linked.");
        continue;
      }
      const confirmed = await p.confirm({
        message: `Remove Growthub profile? (workspace: ${profile.workspaceId})`,
        initialValue: false,
      });
      if (!p.isCancel(confirmed) && confirmed) {
        clearHarnessProfile(T3_HARNESS_ID);
        p.log.success("T3 Code Growthub profile removed.");
      }
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Configure flow
// ---------------------------------------------------------------------------

async function runConfigureFlow(
  currentConfig: ReturnType<typeof readT3CodeConfig>,
): Promise<void> {
  const modelInput = await p.text({
    message: "Default model",
    placeholder: "claude-sonnet-4-6",
    defaultValue: currentConfig.defaultModel,
  });
  if (p.isCancel(modelInput)) return;

  const modeInput = await p.select({
    message: "Approval mode",
    options: T3_CODE_APPROVAL_MODES.map((mode) => ({
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
    placeholder: "t3",
    defaultValue: currentConfig.binaryPath,
  });
  if (p.isCancel(binaryInput)) return;

  const authAction = await p.select({
    message: "Authentication setup",
    options: [
      { value: "skip", label: "Skip auth changes", hint: "keep current key setup" },
      { value: "set-key", label: "Set API key", hint: "store provider key in secure harness storage" },
      { value: "clear-keys", label: "Clear stored API keys", hint: "remove saved keys from local storage" },
    ],
    initialValue: "skip",
  });
  if (p.isCancel(authAction)) return;

  const nextEnv: Record<string, string> = { ...currentConfig.env };

  if (authAction === "set-key") {
    const providerKey = await p.select({
      message: "Provider key variable",
      options: [
        ...T3_CODE_SUPPORTED_ENV_KEYS.map((key) => ({
          value: key,
          label: key,
          hint: `current: ${maskSecret(currentConfig.env[key])}`,
        })),
        { value: "__back_to_auth_setup", label: "← Back to authentication setup" },
      ],
    });
    if (p.isCancel(providerKey) || providerKey === "__back_to_auth_setup") return;

    const keyValue = await p.password({
      message: `${providerKey} value`,
      validate: (v) => (!v?.trim() ? "Key value is required." : undefined),
    });
    if (p.isCancel(keyValue)) return;
    nextEnv[providerKey] = String(keyValue).trim();
  } else if (authAction === "clear-keys") {
    for (const key of T3_CODE_SUPPORTED_ENV_KEYS) delete nextEnv[key];
  }

  const confirmed = await p.confirm({
    message: `Save T3 Code config? (model: ${String(modelInput)}, mode: ${modeInput}, binary: ${String(binaryInput)})`,
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) return;

  writeT3CodeConfig({
    ...currentConfig,
    defaultModel: String(modelInput).trim() || currentConfig.defaultModel,
    approvalMode: modeInput as T3CodeApprovalMode,
    binaryPath: String(binaryInput).trim() || currentConfig.binaryPath,
    env: nextEnv,
  });

  p.log.success("T3 Code config saved.");
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerT3CodeCommands(program: Command): void {
  const t3code = program
    .command("t3code")
    .description("T3 Code CLI agent harness — health, prompt, session, configure, profile");

  // health
  t3code
    .command("health")
    .description("Check T3 Code CLI environment and readiness")
    .action(() => {
      const config = readT3CodeConfig();
      const health = checkHealth(config.binaryPath, config.env);
      const env = detectEnvironment(config.binaryPath, config.env);
      const guidance = buildSetupGuidance(env);
      console.log(`Status: ${health.status}`);
      console.log(health.summary);
      console.log("");
      for (const line of guidance) console.log(line);
    });

  // prompt
  t3code
    .command("prompt")
    .description("Run a headless T3 Code prompt and print the output")
    .argument("<prompt>", "Prompt text")
    .option("--model <model>", "Model override")
    .option("--yolo", "Auto-approve all tool calls")
    .option("--timeout-ms <ms>", "Execution timeout in milliseconds", (v) => Number(v))
    .option("--cwd <path>", "Working directory")
    .action(async (prompt: string, opts: { model?: string; yolo?: boolean; timeoutMs?: number; cwd?: string }) => {
      const config = readT3CodeConfig();
      const result = await executeHeadlessPrompt(prompt, {
        ...config,
        ...(opts.model ? { defaultModel: opts.model } : {}),
        ...(opts.yolo ? { approvalMode: "yolo" as const } : {}),
        ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
      });
      if (result.timedOut) { console.error("Timed out."); process.exit(124); }
      if (result.stdout.trim()) console.log(result.stdout.trim());
      if (result.stderr.trim()) console.error(result.stderr.trim());
      process.exit(result.exitCode ?? 1);
    });

  // session
  t3code
    .command("session")
    .description("Launch an interactive T3 Code terminal session")
    .option("--model <model>", "Model override")
    .option("--yolo", "Auto-approve all tool calls")
    .option("--cwd <path>", "Working directory")
    .action((opts: { model?: string; yolo?: boolean; cwd?: string }) => {
      const config = readT3CodeConfig();
      const { exitCode } = launchInteractiveSession({
        ...config,
        ...(opts.model ? { defaultModel: opts.model } : {}),
        ...(opts.yolo ? { approvalMode: "yolo" as const } : {}),
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
      });
      process.exit(exitCode ?? 0);
    });

  // profile — wired via the generic primitive factory
  registerHarnessProfileCommands(t3code, T3_HARNESS_ID, T3_HARNESS_LABEL);

  // default: hub
  t3code.action(async () => {
    await runT3CodeHub({ allowBackToHub: false });
  });
}
