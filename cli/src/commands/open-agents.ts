/**
 * CLI Commands — open-agents
 *
 * growthub open-agents              — Interactive discovery hub for Open Agents harness
 * growthub open-agents config       — Show or update Open Agents backend configuration
 * growthub open-agents status       — Check Open Agents backend health
 * growthub open-agents list         — List agent sessions
 * growthub open-agents create       — Create a new agent session
 * growthub open-agents resume <id>  — Resume an existing agent session
 *
 * Interactive picker is available via `growthub open-agents` (no subcommand)
 * and from the main discovery hub entry.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import { maskSecret } from "../runtime/agent-harness/auth-store.js";
import {
  readOpenAgentsConfig,
  writeOpenAgentsConfig,
  checkOpenAgentsHealth,
  listOpenAgentsSessions,
  createOpenAgentsSession,
  resumeOpenAgentsSession,
  pollSessionEvents,
  type OpenAgentsConfig,
  type OpenAgentsSessionSummary,
  type AgentRunEvent,
} from "../runtime/open-agents/index.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function statusColor(status: string): string {
  if (status === "running") return pc.green(status);
  if (status === "completed") return pc.cyan(status);
  if (status === "failed" || status === "cancelled") return pc.red(status);
  if (status === "waiting" || status === "idle") return pc.yellow(status);
  return pc.dim(status);
}

function sandboxBadge(state: string): string {
  if (state === "running") return pc.green("running");
  if (state === "hibernating") return pc.yellow("hibernating");
  if (state === "stopped") return pc.dim("stopped");
  if (state === "error") return pc.red("error");
  return pc.dim(state);
}

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function box(lines: string[]): string {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi(l).length)) + 4;
  const top    = pc.dim("┌" + "─".repeat(width) + "┐");
  const bottom = pc.dim("└" + "─".repeat(width) + "┘");
  const body = padded.map((l) => {
    const pad = width - stripAnsi(l).length;
    return pc.dim("│") + l + " ".repeat(pad) + pc.dim("│");
  });
  return [top, ...body, bottom].join("\n");
}

// ---------------------------------------------------------------------------
// Session card renderer
// ---------------------------------------------------------------------------

function printSessionCard(session: OpenAgentsSessionSummary): void {
  const lines = [
    `${pc.bold("Session")}  ${pc.dim(session.sessionId)}`,
    `${pc.dim("Status:")}   ${statusColor(session.status)}`,
    `${pc.dim("Sandbox:")}  ${sandboxBadge(session.sandboxState)}`,
    `${pc.dim("Events:")}   ${session.eventCount}`,
    `${pc.dim("Created:")}  ${session.createdAt}`,
  ];
  if (session.repoUrl) lines.push(`${pc.dim("Repo:")}     ${session.repoUrl}`);
  if (session.branch) lines.push(`${pc.dim("Branch:")}   ${session.branch}`);
  if (session.prompt) {
    const truncated = session.prompt.length > 80
      ? session.prompt.slice(0, 77) + "..."
      : session.prompt;
    lines.push(`${pc.dim("Prompt:")}   ${truncated}`);
  }
  console.log("");
  console.log(box(lines));
  console.log("");
}

// ---------------------------------------------------------------------------
// Event renderer
// ---------------------------------------------------------------------------

const EVENT_EMOJI: Record<string, string> = {
  sandbox_create: "📦",
  sandbox_resume: "▶️ ",
  sandbox_hibernate: "💤",
  tool_start: "🔧",
  tool_result: "✅",
  file_edit: "📝",
  file_create: "📄",
  shell_exec: "💻",
  search: "🔍",
  git_commit: "📌",
  git_push: "🚀",
  git_pr: "🔗",
  agent_message: "💬",
  agent_thinking: "🧠",
  task_delegate: "📋",
  workflow_step: "⚙️ ",
  error: "❌",
};

function printEvent(event: AgentRunEvent): void {
  const emoji = EVENT_EMOJI[event.type] ?? "·";
  const ts = pc.dim(event.timestamp.split("T")[1]?.slice(0, 8) ?? "");
  console.log(`  ${emoji}  ${ts}  ${event.detail}`);
}

// ---------------------------------------------------------------------------
// Interactive picker (accessible from discovery hub)
// ---------------------------------------------------------------------------

export async function runOpenAgentsHub(opts?: {
  allowBackToHub?: boolean;
}): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  p.intro(pc.bold("Open Agents"));

  while (true) {
    const config = readOpenAgentsConfig();
    const action = await p.select({
      message: "Open Agents",
      options: [
        { value: "setup", label: "Setup & Configure", hint: "backend endpoint, API key, defaults" },
        { value: "health", label: "Health Check", hint: `check ${config.endpoint}` },
        { value: "list", label: "List Sessions", hint: "browse existing agent sessions" },
        { value: "create", label: "Prompt (Create Session)", hint: "submit a task prompt and start a durable run" },
        { value: "resume", label: "Chat (Resume Session)", hint: "reconnect to a session and continue the conversation" },
        ...(opts?.allowBackToHub ? [{ value: "__back_to_hub" as const, label: "← Back to harness type" }] : []),
      ],
    });

    if (p.isCancel(action) || action === "__back_to_hub") return "back";

    // -- Setup ---------------------------------------------------------------
    if (action === "setup") {
      await runSetupFlow(config);
      continue;
    }

    // -- Health check --------------------------------------------------------
    if (action === "health") {
      const spinner = p.spinner();
      spinner.start(`Checking ${config.endpoint}...`);
      const health = await checkOpenAgentsHealth(config);
      if (health.available) {
        spinner.stop(
          `Backend reachable (${health.latencyMs}ms)` +
          (health.version ? `  version: ${health.version}` : ""),
        );
      } else {
        spinner.stop(`Backend unavailable (${health.latencyMs}ms)`);
        p.note(
          [
            health.error ? `Error: ${health.error}` : "",
            "",
            "Quick setup:",
            `  1) git clone https://github.com/vercel-labs/open-agents`,
            `  2) cd open-agents && bun install`,
            `  3) bun run web`,
            `  4) growthub open-agents config --endpoint http://localhost:3000`,
            "",
            "Hosted auth guidance:",
            "  - Use auth mode 'vercel-managed' when your deployment handles auth upstream.",
            "  - Use auth mode 'api-key' to store a bearer token in local secure harness storage.",
          ].filter(Boolean).join("\n"),
          "Open Agents Setup",
        );
      }
      continue;
    }

    // -- List sessions -------------------------------------------------------
    if (action === "list") {
      const listResult = await runSessionListFlow(config);
      if (listResult === "back") continue;
      return "done";
    }

    // -- Create session ------------------------------------------------------
    if (action === "create") {
      await runCreateSessionFlow(config);
      continue;
    }

    // -- Resume session ------------------------------------------------------
    if (action === "resume") {
      await runResumeSessionFlow(config);
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Setup flow
// ---------------------------------------------------------------------------

async function runSetupFlow(currentConfig: OpenAgentsConfig): Promise<void> {
  const backendChoice = await p.select({
    message: "Backend type",
    options: [
      { value: "local", label: "Local", hint: "open-agents dev server on this machine" },
      { value: "hosted", label: "Hosted", hint: "deployed Vercel instance" },
    ],
    initialValue: currentConfig.backendType,
  });
  if (p.isCancel(backendChoice)) return;

  const authMode = backendChoice === "hosted"
    ? await p.select({
        message: "Hosted authentication strategy",
        options: [
          {
            value: "api-key",
            label: "Bearer API key",
            hint: "Recommended for CLI-safe server-to-server access",
          },
          {
            value: "vercel-managed",
            label: "Vercel-managed / gateway auth",
            hint: "No CLI key; auth is handled upstream by your deployment",
          },
        ],
        initialValue: currentConfig.authMode === "api-key" || currentConfig.authMode === "vercel-managed"
          ? currentConfig.authMode
          : "api-key",
      })
    : "none";
  if (p.isCancel(authMode)) return;

  const endpoint = await p.text({
    message: "Backend endpoint",
    placeholder: currentConfig.endpoint,
    initialValue: currentConfig.endpoint,
  });
  if (p.isCancel(endpoint)) return;

  let apiKeyValue: string | undefined;
  if (authMode === "api-key") {
    const existingKeyMasked = maskSecret(currentConfig.apiKey);
    const apiKeyMode = await p.select({
      message: `API key (${existingKeyMasked})`,
      options: [
        { value: "keep", label: "Keep existing key", hint: "No change to currently stored key" },
        { value: "replace", label: "Replace key", hint: "Enter a new key and store it securely" },
        { value: "clear", label: "Clear key", hint: "Remove any stored key for this harness" },
      ],
      initialValue: currentConfig.apiKey ? "keep" : "replace",
    });
    if (p.isCancel(apiKeyMode)) return;

    if (apiKeyMode === "replace") {
      const entered = await p.password({
        message: "Open Agents API key",
      });
      if (p.isCancel(entered)) return;
      apiKeyValue = String(entered).trim() || undefined;
    } else if (apiKeyMode === "keep") {
      apiKeyValue = currentConfig.apiKey;
    } else {
      apiKeyValue = undefined;
    }
  } else {
    apiKeyValue = undefined;
  }

  const defaultRepo = await p.text({
    message: "Default repository URL (optional)",
    placeholder: currentConfig.defaultRepo ?? "",
    initialValue: currentConfig.defaultRepo ?? "",
  });
  if (p.isCancel(defaultRepo)) return;

  const confirmed = await p.confirm({
    message: "Save Open Agents configuration?",
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) return;

  const newConfig: OpenAgentsConfig = {
    ...currentConfig,
    backendType: backendChoice as "local" | "hosted",
    authMode: authMode as "none" | "api-key" | "vercel-managed",
    endpoint: String(endpoint).trim() || currentConfig.endpoint,
    apiKey: apiKeyValue,
    defaultRepo: String(defaultRepo).trim() || undefined,
  };

  writeOpenAgentsConfig(newConfig);
  p.log.success("Configuration saved.");
}

// ---------------------------------------------------------------------------
// Session list flow
// ---------------------------------------------------------------------------

async function runSessionListFlow(config: OpenAgentsConfig): Promise<"done" | "back"> {
  const spinner = p.spinner();
  spinner.start("Loading sessions...");

  let sessions: OpenAgentsSessionSummary[];
  try {
    sessions = await listOpenAgentsSessions(config);
  } catch (err) {
    spinner.stop("Failed to load sessions.");
    p.log.error((err as Error).message);
    return "back";
  }

  spinner.stop(`${sessions.length} session${sessions.length !== 1 ? "s" : ""} found.`);

  if (sessions.length === 0) {
    p.note("No agent sessions found. Create one to get started.", "Nothing found");
    return "back";
  }

  while (true) {
    const sessionChoice = await p.select({
      message: "Select a session",
      options: [
        ...sessions.map((s) => ({
          value: s.sessionId,
          label: `${statusColor(s.status)}  ${pc.dim(s.sessionId.slice(0, 12))}`,
          hint: s.prompt ? s.prompt.slice(0, 50) : undefined,
        })),
        { value: "__back", label: "← Back" },
      ],
    });

    if (p.isCancel(sessionChoice) || sessionChoice === "__back") return "back";

    const selected = sessions.find((s) => s.sessionId === sessionChoice);
    if (!selected) continue;

    printSessionCard(selected);

    const nextStep = await p.select({
      message: "What next?",
      options: [
        { value: "events", label: "📜 View recent events" },
        { value: "back_to_list", label: "← Back to session list" },
      ],
    });

    if (p.isCancel(nextStep) || nextStep === "back_to_list") continue;

    if (nextStep === "events") {
      try {
        const events = await pollSessionEvents(config, selected.sessionId);
        if (events.length === 0) {
          p.note("No events recorded yet.", "Empty");
        } else {
          console.log("");
          console.log(pc.bold("Recent Events") + pc.dim(`  (${events.length})`));
          console.log(hr());
          for (const event of events.slice(-20)) {
            printEvent(event);
          }
          console.log(hr());
          console.log("");
        }
      } catch (err) {
        p.log.error("Failed to load events: " + (err as Error).message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Create session flow
// ---------------------------------------------------------------------------

async function runCreateSessionFlow(config: OpenAgentsConfig): Promise<void> {
  const prompt = await p.text({
    message: "What should the agent do?",
    placeholder: "Describe the task for the agent",
  });
  if (p.isCancel(prompt) || !String(prompt).trim()) return;

  const repoUrl = await p.text({
    message: "Repository URL (optional)",
    placeholder: config.defaultRepo ?? "https://github.com/org/repo",
    initialValue: config.defaultRepo ?? "",
  });
  if (p.isCancel(repoUrl)) return;

  const branch = await p.text({
    message: "Branch (optional)",
    placeholder: config.defaultBranch ?? "main",
    initialValue: config.defaultBranch ?? "",
  });
  if (p.isCancel(branch)) return;

  const confirmed = await p.confirm({
    message: "Create agent session?",
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) return;

  const spinner = p.spinner();
  spinner.start("Creating session...");

  try {
    const session = await createOpenAgentsSession(config, {
      prompt: String(prompt).trim(),
      repoUrl: String(repoUrl).trim() || undefined,
      branch: String(branch).trim() || undefined,
    });

    spinner.stop("Session created.");
    printSessionCard(session);
  } catch (err) {
    spinner.stop("Failed to create session.");
    p.log.error((err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Resume session flow
// ---------------------------------------------------------------------------

async function runResumeSessionFlow(config: OpenAgentsConfig): Promise<void> {
  const sessionId = await p.text({
    message: "Session ID",
    placeholder: "Paste the session ID to resume",
  });
  if (p.isCancel(sessionId) || !String(sessionId).trim()) return;

  const spinner = p.spinner();
  spinner.start("Resuming session...");

  try {
    const session = await resumeOpenAgentsSession(config, String(sessionId).trim());
    spinner.stop("Session resumed.");
    printSessionCard(session);

    const events = await pollSessionEvents(config, session.sessionId);
    if (events.length > 0) {
      console.log(pc.bold("Latest Events") + pc.dim(`  (${events.length})`));
      console.log(hr());
      for (const event of events.slice(-20)) {
        printEvent(event);
      }
      console.log(hr());
      console.log("");
    }
  } catch (err) {
    spinner.stop("Failed to resume session.");
    p.log.error((err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerOpenAgentsCommands(program: Command): void {
  const oa = program
    .command("open-agents")
    .description("Durable agent workflow orchestration via Open Agents harness")
    .addHelpText("after", `
Examples:
  $ growthub open-agents                     # interactive browser
  $ growthub open-agents config              # show current configuration
  $ growthub open-agents config --endpoint http://localhost:3000
  $ growthub open-agents status              # check backend health
  $ growthub open-agents list                # list agent sessions
  $ growthub open-agents list --json         # machine-readable output
  $ growthub open-agents create              # create new session (interactive)
  $ growthub open-agents prompt "fix tests"  # prompt and start a session
  $ growthub open-agents chat <session-id>   # chat/resume an existing session
  $ growthub open-agents resume <session-id> # resume existing session
`);

  oa.action(async () => {
    await runOpenAgentsHub({});
  });

  // ── config ─────────────────────────────────────────────────────────────
  oa
    .command("config")
    .description("Show or update Open Agents backend configuration")
    .option("--endpoint <url>", "Backend endpoint URL")
    .option("--api-key <key>", "API key for authenticated backends")
    .option("--auth-mode <mode>", "Auth mode: none | api-key | vercel-managed")
    .option("--clear-api-key", "Clear stored API key")
    .option("--default-repo <url>", "Default repository URL for new sessions")
    .option("--default-branch <name>", "Default branch name for new sessions")
    .option("--json", "Output raw JSON")
    .action(async (opts: {
      endpoint?: string;
      apiKey?: string;
      authMode?: string;
      clearApiKey?: boolean;
      defaultRepo?: string;
      defaultBranch?: string;
      json?: boolean;
    }) => {
      const config = readOpenAgentsConfig();
      const hasUpdate = opts.endpoint || opts.apiKey || opts.clearApiKey || opts.defaultRepo || opts.defaultBranch || opts.authMode;

      if (hasUpdate) {
        const nextAuthMode = opts.authMode === "none" || opts.authMode === "api-key" || opts.authMode === "vercel-managed"
          ? opts.authMode
          : config.authMode;
        const updated: OpenAgentsConfig = {
          ...config,
          ...(nextAuthMode ? { authMode: nextAuthMode } : {}),
          ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
          ...((opts.apiKey || opts.clearApiKey) ? { apiKey: opts.clearApiKey ? undefined : opts.apiKey } : {}),
          ...(opts.defaultRepo ? { defaultRepo: opts.defaultRepo } : {}),
          ...(opts.defaultBranch ? { defaultBranch: opts.defaultBranch } : {}),
        };
        writeOpenAgentsConfig(updated);
        if (opts.json) {
          console.log(JSON.stringify(updated, null, 2));
        } else {
          console.log(pc.green("Configuration updated."));
        }
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      console.log("");
      console.log(pc.bold("Open Agents Configuration"));
      console.log(hr());
      console.log(`  ${pc.dim("Backend:")}   ${config.backendType}`);
      console.log(`  ${pc.dim("Auth Mode:")} ${config.authMode ?? "none"}`);
      console.log(`  ${pc.dim("Endpoint:")}  ${config.endpoint}`);
      console.log(`  ${pc.dim("API Key:")}   ${config.apiKey ? maskSecret(config.apiKey) : pc.dim("(none)")}`);
      console.log(`  ${pc.dim("Repo:")}      ${config.defaultRepo ?? pc.dim("(none)")}`);
      console.log(`  ${pc.dim("Branch:")}    ${config.defaultBranch ?? pc.dim("(none)")}`);
      console.log(`  ${pc.dim("Timeout:")}   ${config.timeoutMs ?? 30_000}ms`);
      console.log(hr());
      console.log("");
    });

  // ── status ─────────────────────────────────────────────────────────────
  oa
    .command("status")
    .description("Check Open Agents backend health")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const config = readOpenAgentsConfig();
      const health = await checkOpenAgentsHealth(config);

      if (opts.json) {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      if (health.available) {
        console.log(
          pc.green("✓") +
          ` Backend reachable at ${config.endpoint} (${health.latencyMs}ms)` +
          (health.version ? `  version: ${health.version}` : ""),
        );
      } else {
        console.log(pc.red("✗") + ` Backend unavailable at ${config.endpoint} (${health.latencyMs}ms)`);
        if (health.error) {
          console.log(pc.dim(`  ${health.error}`));
        }
        process.exitCode = 1;
      }
    });

  // ── list ───────────────────────────────────────────────────────────────
  oa
    .command("list")
    .description("List agent sessions")
    .option("--json", "Output raw JSON for scripting")
    .action(async (opts: { json?: boolean }) => {
      const config = readOpenAgentsConfig();

      try {
        const sessions = await listOpenAgentsSessions(config);

        if (opts.json) {
          console.log(JSON.stringify({ sessions }, null, 2));
          return;
        }

        if (sessions.length === 0) {
          console.log(pc.yellow("No sessions found.") + pc.dim(" Run `growthub open-agents create` to start one."));
          return;
        }

        console.log("");
        console.log(pc.bold("Agent Sessions") + pc.dim(`  (${sessions.length})`));
        console.log(hr());
        for (const session of sessions) {
          const truncatedPrompt = session.prompt
            ? pc.dim(session.prompt.slice(0, 50))
            : "";
          console.log(
            `  ${statusColor(session.status)}  ${pc.dim(session.sessionId.slice(0, 12))}  ` +
            `${sandboxBadge(session.sandboxState)}  ${truncatedPrompt}`,
          );
        }
        console.log(hr());
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to list sessions: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── create ─────────────────────────────────────────────────────────────
  oa
    .command("create")
    .description("Create a new agent session")
    .option("--prompt <text>", "Task prompt for the agent")
    .option("--repo <url>", "Repository URL")
    .option("--branch <name>", "Branch name")
    .option("--json", "Output raw JSON")
    .action(async (opts: { prompt?: string; repo?: string; branch?: string; json?: boolean }) => {
      const config = readOpenAgentsConfig();

      if (!opts.prompt) {
        await runCreateSessionFlow(config);
        return;
      }

      try {
        const session = await createOpenAgentsSession(config, {
          prompt: opts.prompt,
          repoUrl: opts.repo ?? config.defaultRepo,
          branch: opts.branch ?? config.defaultBranch,
        });

        if (opts.json) {
          console.log(JSON.stringify(session, null, 2));
          return;
        }

        printSessionCard(session);
      } catch (err) {
        console.error(pc.red("Failed to create session: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── prompt (alias for create) ───────────────────────────────────────────
  oa
    .command("prompt")
    .description("Create a new session from a prompt (prompt-first alias)")
    .argument("<prompt>", "Task prompt for the agent")
    .option("--repo <url>", "Repository URL")
    .option("--branch <name>", "Branch name")
    .option("--json", "Output raw JSON")
    .action(async (prompt: string, opts: { repo?: string; branch?: string; json?: boolean }) => {
      const config = readOpenAgentsConfig();
      try {
        const session = await createOpenAgentsSession(config, {
          prompt,
          repoUrl: opts.repo ?? config.defaultRepo,
          branch: opts.branch ?? config.defaultBranch,
        });

        if (opts.json) {
          console.log(JSON.stringify(session, null, 2));
          return;
        }

        printSessionCard(session);
      } catch (err) {
        console.error(pc.red("Failed to create session: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── resume ─────────────────────────────────────────────────────────────
  oa
    .command("resume")
    .description("Resume an existing agent session")
    .argument("<sessionId>", "Session ID to resume")
    .option("--json", "Output raw JSON")
    .action(async (sessionId: string, opts: { json?: boolean }) => {
      const config = readOpenAgentsConfig();

      try {
        const session = await resumeOpenAgentsSession(config, sessionId);

        if (opts.json) {
          console.log(JSON.stringify(session, null, 2));
          return;
        }

        printSessionCard(session);

        const events = await pollSessionEvents(config, session.sessionId);
        if (events.length > 0) {
          console.log(pc.bold("Latest Events") + pc.dim(`  (${events.length})`));
          console.log(hr());
          for (const event of events.slice(-20)) {
            printEvent(event);
          }
          console.log(hr());
          console.log("");
        }
      } catch (err) {
        console.error(pc.red("Failed to resume session: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── chat (alias for resume) ─────────────────────────────────────────────
  oa
    .command("chat")
    .description("Chat by resuming an existing Open Agents session")
    .argument("<sessionId>", "Session ID to resume")
    .option("--json", "Output raw JSON")
    .action(async (sessionId: string, opts: { json?: boolean }) => {
      const config = readOpenAgentsConfig();

      try {
        const session = await resumeOpenAgentsSession(config, sessionId);

        if (opts.json) {
          console.log(JSON.stringify(session, null, 2));
          return;
        }

        printSessionCard(session);

        const events = await pollSessionEvents(config, session.sessionId);
        if (events.length > 0) {
          console.log(pc.bold("Latest Events") + pc.dim(`  (${events.length})`));
          console.log(hr());
          for (const event of events.slice(-20)) {
            printEvent(event);
          }
          console.log(hr());
          console.log("");
        }
      } catch (err) {
        console.error(pc.red("Failed to chat/resume session: " + (err as Error).message));
        process.exitCode = 1;
      }
    });
}
