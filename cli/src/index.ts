import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { onboard } from "./commands/onboard.js";
import { doctor } from "./commands/doctor.js";
import { envCommand } from "./commands/env.js";
import { configure } from "./commands/configure.js";
import { addAllowedHostname } from "./commands/allowed-hostname.js";
import { heartbeatRun } from "./commands/heartbeat-run.js";
import { runCommand } from "./commands/run.js";
import { bootstrapCeoInvite } from "./commands/auth-bootstrap-ceo.js";
import { authLogin, authLogout, authWhoami } from "./commands/auth-login.js";
import { registerProfileCommands } from "./commands/profile.js";
import { dbBackupCommand } from "./commands/db-backup.js";
import { registerContextCommands } from "./commands/client/context.js";
import { registerCompanyCommands } from "./commands/client/company.js";
import { registerIssueCommands } from "./commands/client/issue.js";
import { registerAgentCommands } from "./commands/client/agent.js";
import { registerApprovalCommands } from "./commands/client/approval.js";
import { registerActivityCommands } from "./commands/client/activity.js";
import { registerDashboardCommands } from "./commands/client/dashboard.js";
import { applyDataDirOverride, type DataDirOptionLike } from "./config/data-dir.js";
import { loadPaperclipEnvFile } from "./config/env.js";
import { initializeSurfaceRuntimeContract } from "./config/schema.js";
import { readConfig, resolveConfigPath } from "./config/store.js";
import { registerGtmCommands } from "./commands/gtm.js";
import { registerWorktreeCommands } from "./commands/worktree.js";
import { registerPluginCommands } from "./commands/client/plugin.js";
import { registerKitCommands, runInteractivePicker } from "./commands/kit.js";
import { registerTemplateCommands, runTemplatePicker } from "./commands/template.js";
import { registerCapabilityCommands, runCapabilityPicker } from "./commands/capability.js";
import { registerPipelineCommands, runPipelineAssembler } from "./commands/pipeline.js";
import { registerArtifactCommands } from "./commands/artifact.js";
import { registerWorkflowCommands, runWorkflowPicker } from "./commands/workflow.js";
import { getWorkflowAccess } from "./auth/workflow-access.js";
import { readSession, isSessionExpired } from "./auth/session-store.js";
import { printPaperclipCliBanner } from "./utils/banner.js";
import { resolvePaperclipHomeDir } from "./config/home.js";
import type { SurfaceProfile } from "./config/schema.js";

const program = new Command();
const DATA_DIR_OPTION_HELP =
  "Growthub data directory root (isolates local instance state)";

type LocalSurfaceEntry = {
  instanceId: string;
  profile: "dx" | "gtm";
  configPath: string;
};

function resolveSurfaceProfile(config: unknown): SurfaceProfile | null {
  if (typeof config !== "object" || config === null) return null;
  const surface = (config as { surface?: unknown }).surface;
  if (typeof surface !== "object" || surface === null) return null;
  const profile = (surface as { profile?: unknown }).profile;
  return profile === "dx" || profile === "gtm" ? profile : null;
}

function resolveBootstrapOptions(argv: string[]): DataDirOptionLike {
  const options: DataDirOptionLike = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if ((value === "-c" || value === "--config") && argv[index + 1]) {
      options.config = argv[index + 1];
      index += 1;
      continue;
    }
    if ((value === "-d" || value === "--data-dir") && argv[index + 1]) {
      options.dataDir = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function registerSharedCommands(target: Command) {
  target
    .command("onboard")
    .description("Interactive first-run setup wizard")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("-y, --yes", "Accept defaults (quickstart + start immediately)", false)
    .option("--run", "Start Growthub immediately after saving config", false)
    .action(onboard);

  target
    .command("doctor")
    .description("Run diagnostic checks on your Growthub setup")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--repair", "Attempt to repair issues automatically")
    .alias("--fix")
    .option("-y, --yes", "Skip repair confirmation prompts")
    .action(async (opts) => {
      await doctor(opts);
    });

  target
    .command("env")
    .description("Print environment variables for deployment")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .action(envCommand);

  target
    .command("configure")
    .description("Update configuration sections")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("-s, --section <section>", "Section to configure (llm, database, logging, server, storage, secrets)")
    .action(configure);

  target
    .command("db:backup")
    .description("Create a one-off database backup using current config")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--dir <path>", "Backup output directory (overrides config)")
    .option("--retention-days <days>", "Retention window used for pruning", (value) => Number(value))
    .option("--filename-prefix <prefix>", "Backup filename prefix", "growthub")
    .option("--json", "Print backup metadata as JSON")
    .action(async (opts) => {
      await dbBackupCommand(opts);
    });

  target
    .command("allowed-hostname")
    .description("Allow a hostname for authenticated/private mode access")
    .argument("<host>", "Hostname to allow (for example dotta-macbook-pro)")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .action(addAllowedHostname);

  target
    .command("run")
    .description("Bootstrap local setup (onboard + doctor) and run Growthub")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("-i, --instance <id>", "Local instance id (default: default)")
    .option("--repair", "Attempt automatic repairs during doctor", true)
    .option("--no-repair", "Disable automatic repairs during doctor")
    .action(runCommand);

  target
    .command("discover")
    .description("Shared discovery entry for local app install, worker kits, and templates")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--run", "Start Growthub immediately after saving config", false)
    .action(async (opts) => {
      await runDiscoveryHub(opts);
    });

  registerKitCommands(target);
  registerTemplateCommands(target);
  registerCapabilityCommands(target);
  registerPipelineCommands(target);
  registerArtifactCommands(target);
  registerWorkflowCommands(target);

  const auth = target.command("auth").description("Authentication and bootstrap utilities");

  auth
    .command("bootstrap-ceo")
    .description("Create a one-time bootstrap invite URL for first instance admin")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--force", "Create new invite even if admin already exists", false)
    .option("--expires-hours <hours>", "Invite expiration window in hours", (value) => Number(value))
    .option("--base-url <url>", "Public base URL used to print invite link")
    .action(bootstrapCeoInvite);

  auth
    .command("login")
    .description("Sign in to hosted Growthub and save a CLI session (browser flow)")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--base-url <url>", "Hosted Growthub base URL (defaults to auth.growthubBaseUrl or GROWTHUB_BASE_URL)")
    .option("--token <token>", "Skip the browser flow by providing a pre-issued hosted token (scripting/CI)")
    .option("--machine-label <label>", "Label identifying this machine in the hosted app")
    .option("--workspace-label <label>", "Label identifying this workspace in the hosted app")
    .option("--timeout-ms <ms>", "How long to wait for the browser callback", (value) => Number(value))
    .option("--no-browser", "Do not try to launch a browser — print the URL and wait")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      await authLogin({
        ...opts,
        noBrowser: opts.browser === false,
      });
    });

  auth
    .command("logout")
    .description("Clear the hosted CLI session (local workspace profile is preserved)")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--keep-overlay", "Keep cached hosted overlay metadata; only drop the session token")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      await authLogout(opts);
    });

  auth
    .command("whoami")
    .description("Print the authenticated hosted identity and linked local workspace")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      await authWhoami(opts);
    });

  registerProfileCommands(target);
}

async function runHostedBridgeEntry(opts?: {
  config?: string;
  dataDir?: string;
}): Promise<void> {
  await authLogin({
    config: opts?.config,
    dataDir: opts?.dataDir,
  });
}

function isDiscoveryAuthenticated(): boolean {
  const session = readSession();
  if (!session) return false;
  return !isSessionExpired(session);
}

async function runDiscoveryHub(opts?: {
  config?: string;
  dataDir?: string;
  run?: boolean;
}): Promise<void> {
  printPaperclipCliBanner();
  p.intro("Growthub Local");

  while (true) {
    const workflowAccess = getWorkflowAccess();
    const surfaceChoice = await p.select({
      message: "What do you want to do first?",
      options: [
        {
          value: "app",
          label: "📦 Full Local App",
          hint: "Work from existing app or build from scratch",
        },
        {
          value: "kits",
          label: "🧰 Worker Kits",
          hint: "Self-contained workspace environments for agents",
        },
        {
          value: "templates",
          label: "📚 Templates",
          hint: "Artifact template library",
        },
        {
          value: "workflows",
          label: workflowAccess.state === "ready"
            ? "🔗 Workflows"
            : "🔗 Workflows" + pc.dim(" (locked)"),
          hint: workflowAccess.state === "ready"
            ? "Saved workflows, CMS templates, capabilities, and dynamic pipelines"
            : workflowAccess.reason,
        },
        {
          value: "hosted-auth",
          label: "🔐 Connect Growthub Account",
          hint: "Attach this CLI to the hosted Growthub user through the canonical browser flow",
        },
        {
          value: "help",
          label: "❓ Help CLI",
          hint: "See the main commands and what each path does",
        },
      ],
    });

    if (p.isCancel(surfaceChoice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (surfaceChoice === "help") {
      p.note(
        [
          "📦 Full Local App: open an existing local surface or create a new GTM/DX profile.",
          "🧰 Worker Kits: browse specialized agents and custom workspaces.",
          "📚 Templates: browse reusable artifact templates by library type.",
          "🔗 Workflows: browse saved workflows, CMS node starter templates, capabilities, and dynamic pipelines.",
          `   Locked state: ${workflowAccess.reason}.`,
          "🔐 Connect Growthub Account: open the canonical hosted auth flow for this CLI.",
          "",
          "Direct commands:",
          "growthub auth login",
          "growthub auth whoami",
          "growthub kit",
          "growthub template",
          "growthub workflow",
          "growthub workflow templates",
          "growthub capability list",
          "growthub pipeline assemble",
          "growthub artifact list",
        ].join("\n"),
        "Growthub CLI Help",
      );
      continue;
    }

    if (surfaceChoice === "app") {
      while (true) {
        const appModeChoice = await p.select({
          message: "How do you want to open Growthub Local?",
          options: [
            {
              value: "create",
              label: "🆕 Create New Profile",
              hint: "Build a new local app surface.",
            },
            {
              value: "load",
              label: "📂 Load Existing Profile",
              hint: "Work from a profile already on this machine.",
            },
            {
              value: "__back_to_hub",
              label: "← Back to main menu",
            },
          ],
        });

        if (p.isCancel(appModeChoice)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        if (appModeChoice === "__back_to_hub") break;

        if (appModeChoice === "load") {
          const existingSurfaces = listLocalSurfaces();
          if (existingSurfaces.length === 0) {
            p.note("No existing local app profiles were found on this machine.", "Nothing found");
            continue;
          }

          const existingChoice = await p.select({
            message: "Select an existing app surface",
            options: [
              ...existingSurfaces.map((surface) => ({
                value: surface.instanceId,
                label: `${surface.profile === "gtm" ? "📈" : "🧠"} ${surface.profile.toUpperCase()} · ${surface.instanceId}`,
                hint: surface.configPath,
              })),
              { value: "__back_to_app_mode", label: "← Back to app options" },
            ],
          });

          if (p.isCancel(existingChoice)) {
            p.cancel("Cancelled.");
            process.exit(0);
          }
          if (existingChoice === "__back_to_app_mode") {
            continue;
          }

          const selectedSurface = existingSurfaces.find((surface) => surface.instanceId === existingChoice);
          if (!selectedSurface) {
            p.cancel("Selected profile not found.");
            process.exit(1);
          }

          process.env.PAPERCLIP_SURFACE_PROFILE = selectedSurface.profile;
          await runCommand({
            config: selectedSurface.configPath,
            instance: selectedSurface.instanceId,
            repair: true,
            yes: true,
          });
          return;
        }

        const profileChoice = await p.select({
          message: "Which new app surface do you want to create?",
          options: [
            {
              value: "gtm",
              label: "📈 GTM",
              hint: "Go-to-Market surface.",
            },
            {
              value: "dx",
              label: "🧠 DX",
              hint: "Developer Experience surface.",
            },
            {
              value: "__back_to_app_mode",
              label: "← Back to app options",
            },
          ],
        });

        if (p.isCancel(profileChoice)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        if (profileChoice === "__back_to_app_mode") {
          continue;
        }

        process.env.PAPERCLIP_SURFACE_PROFILE = profileChoice;
        await onboard({
          config: opts?.config,
          run: opts?.run ?? isInstallerMode(),
          yes: isInstallerMode(),
        });
        return;
      }

      continue;
    }

    if (surfaceChoice === "kits") {
      const result = await runInteractivePicker({ allowBackToHub: true });
      if (result === "back") continue;
      return;
    }

    if (surfaceChoice === "workflows") {
      const result = await runWorkflowPicker({ allowBackToHub: true });
      if (result === "back") continue;
      return;
    }

    if (surfaceChoice === "hosted-auth") {
      await runHostedBridgeEntry({ config: opts?.config, dataDir: opts?.dataDir });
      continue;
    }

    const result = await runTemplatePicker({ allowBackToHub: true });
    if (result === "back") continue;
    return;
  }
}

function isInstallerMode(): boolean {
  return process.env.GROWTHUB_INSTALLER_MODE === "true";
}

function listLocalSurfaces(): LocalSurfaceEntry[] {
  const homeDir = resolvePaperclipHomeDir();
  const instancesDir = path.resolve(homeDir, "instances");
  if (!fs.existsSync(instancesDir)) return [];

  return fs.readdirSync(instancesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const instanceId = entry.name;
      const configPath = path.resolve(instancesDir, instanceId, "config.json");
      if (!fs.existsSync(configPath)) return null;

      try {
        const config = readConfig(configPath);
        if (!config) return null;
        const profile = resolveSurfaceProfile(config);
        if (!profile) return null;
        return {
          instanceId,
          profile,
          configPath,
        } satisfies LocalSurfaceEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is LocalSurfaceEntry => entry !== null)
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
}

function registerDxCommands(target: Command) {
  const heartbeat = target.command("heartbeat").description("Heartbeat utilities");

  heartbeat
    .command("run")
    .description("Run one agent heartbeat and stream live logs")
    .requiredOption("-a, --agent-id <agentId>", "Agent ID to invoke")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--context <path>", "Path to CLI context file")
    .option("--profile <name>", "CLI context profile name")
    .option("--api-base <url>", "Base URL for the Growthub server API")
    .option("--api-key <token>", "Bearer token for agent-authenticated calls")
    .option(
      "--source <source>",
      "Invocation source (timer | assignment | on_demand | automation)",
      "on_demand",
    )
    .option("--trigger <trigger>", "Trigger detail (manual | ping | callback | system)", "manual")
    .option("--timeout-ms <ms>", "Max time to wait before giving up", "0")
    .option("--json", "Output raw JSON where applicable")
    .option("--debug", "Show raw adapter stdout/stderr JSON chunks")
    .action(heartbeatRun);

  registerContextCommands(target);
  registerCompanyCommands(target);
  registerIssueCommands(target);
  registerAgentCommands(target);
  registerApprovalCommands(target);
  registerActivityCommands(target);
  registerDashboardCommands(target);
  registerWorktreeCommands(target);
  registerPluginCommands(target);
}

const bootstrapOptions = resolveBootstrapOptions(process.argv.slice(2));
applyDataDirOverride(bootstrapOptions, {
  hasConfigOption: bootstrapOptions.config !== undefined,
  hasContextOption: false,
});
loadPaperclipEnvFile(bootstrapOptions.config);
const bootstrapConfig = readConfig(resolveConfigPath(bootstrapOptions.config));
const surfaceRuntime = initializeSurfaceRuntimeContract(resolveSurfaceProfile(bootstrapConfig) ?? undefined);

program
  .name("growthub")
  .description("Growthub CLI — setup, configure, and run your local Growthub instance")
  .version("0.3.49")
  .addHelpText("after", `
Worker Kits (agent execution environments):

  Discovery:
    $ growthub kit                              Interactive browser — pick, preview, download
    $ growthub kit list                         All kits grouped by family (studio · workflow · operator · ops)
    $ growthub kit list --family studio         Filter by family
    $ growthub kit families                     Show family taxonomy with descriptions

  Download:
    $ growthub kit download                     Interactive (no arg = picker)
    $ growthub kit download higgsfield          Fuzzy slug — resolves automatically
    $ growthub kit download higgsfield --yes    Skip confirmation (scripting / agent use)
    $ growthub kit download growthub-open-higgsfield-studio-v1 --out ~/kits

  Inspect & validate:
    $ growthub kit inspect higgsfield-studio-v1
    $ growthub kit inspect growthub-email-marketing-v1 --json
    $ growthub kit validate ./path/to/kit

  After download:
    1. Point Growthub local (or Claude Code) Working Directory at the exported folder
    2. cp .env.example .env  →  add your API key
    3. Open a new session — the operator agent loads automatically

Instance setup:
    $ growthub onboard                          First-run interactive wizard
    $ growthub run                              Onboard + doctor + start server
    $ growthub doctor                           Diagnose and optionally repair
    $ growthub configure                        Update config sections
    $ growthub                                  Interactive discovery hub

Workflows (requires auth):
    $ growthub workflow                         Interactive workflow browser
    $ growthub workflow templates               List CMS node starter templates
    $ growthub workflow templates --json        Machine-readable output
    $ growthub workflow saved                   List saved workflow pipelines

Dynamic Registry Pipelines:

  Capabilities:
    $ growthub capability                       Interactive capability browser
    $ growthub capability list                  All capabilities grouped by family
    $ growthub capability list --family video   Filter by family
    $ growthub capability inspect video-gen     Inspect a specific capability
    $ growthub capability resolve               Resolve machine-scoped bindings

  Pipelines:
    $ growthub pipeline                         Interactive pipeline assembler
    $ growthub pipeline assemble                Interactive assembly
    $ growthub pipeline validate ./pipeline.json
    $ growthub pipeline execute ./pipeline.json

  Artifacts:
    $ growthub artifact list                    All pipeline artifacts
    $ growthub artifact list --type video       Filter by type
    $ growthub artifact inspect <id>            Inspect a specific artifact

Hosted account bridge:
    $ growthub auth login                       Sign in via the hosted app (browser flow)
    $ growthub auth whoami                      Show signed-in identity + linked local workspace
    $ growthub auth logout                      Clear the hosted session (local workspace preserved)
`);

program.action(async () => {
  await runDiscoveryHub();
});

program
  .command("list")
  .description("Open the interactive Growthub discovery hub")
  .action(async () => {
    await runDiscoveryHub();
  });

program.hook("preAction", (_thisCommand, actionCommand) => {
  const options = actionCommand.optsWithGlobals() as DataDirOptionLike;
  const optionNames = new Set(actionCommand.options.map((option) => option.attributeName()));
  applyDataDirOverride(options, {
    hasConfigOption: optionNames.has("config"),
    hasContextOption: optionNames.has("context"),
  });
  loadPaperclipEnvFile(options.config);
});

registerSharedCommands(program);
if (surfaceRuntime.capabilities.dxEnabled) {
  registerDxCommands(program);
} else {
  registerGtmCommands(program);
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
