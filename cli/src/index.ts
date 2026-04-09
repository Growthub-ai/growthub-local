import { Command } from "commander";
import { onboard } from "./commands/onboard.js";
import { doctor } from "./commands/doctor.js";
import { envCommand } from "./commands/env.js";
import { configure } from "./commands/configure.js";
import { addAllowedHostname } from "./commands/allowed-hostname.js";
import { heartbeatRun } from "./commands/heartbeat-run.js";
import { runCommand } from "./commands/run.js";
import { bootstrapCeoInvite } from "./commands/auth-bootstrap-ceo.js";
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
import { registerKitCommands } from "./commands/kit.js";

const program = new Command();
const DATA_DIR_OPTION_HELP =
  "Growthub data directory root (isolates local instance state)";

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

  registerKitCommands(target);

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
const surfaceRuntime = initializeSurfaceRuntimeContract(bootstrapConfig?.surface.profile);

program
  .name("growthub")
  .description("Growthub CLI — setup, diagnose, and configure your instance")
  .version("0.2.7");

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
