import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import pc from "picocolors";
import {
  coerceGtmState,
  createDefaultGtmState,
  toGtmViewModel,
  type GtmState,
} from "@paperclipai/shared";
import { resolvePaperclipHomeDir } from "../config/home.js";

function resolveGtmStatePath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "gtm", "state.json");
}

function readState(): GtmState {
  const filePath = resolveGtmStatePath();
  if (!fs.existsSync(filePath)) return createDefaultGtmState();
  return coerceGtmState(JSON.parse(fs.readFileSync(filePath, "utf-8")) as GtmState);
}

function writeState(state: GtmState): void {
  const filePath = resolveGtmStatePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

function launchWorkflow(state: GtmState): GtmState {
  const runnerPath = state.workflow.runnerPath?.trim();
  if (!runnerPath) {
    throw new Error("No local SDR runner configured.");
  }
  if (!fs.existsSync(runnerPath)) {
    throw new Error(`Runner not found at ${runnerPath}`);
  }

  const args = runnerPath.endsWith(".mjs") || runnerPath.endsWith(".js")
    ? [runnerPath]
    : [];
  const command = args.length > 0 ? process.execPath : runnerPath;
  const child = spawn(command, args, {
    cwd: path.dirname(runnerPath),
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return {
    ...state,
    workflow: {
      ...state.workflow,
      lastRun: {
        command: [command, ...args].join(" "),
        error: null,
        finishedAt: null,
        pid: child.pid ?? null,
        startedAt: new Date().toISOString(),
        status: "running",
      },
    },
  };
}

function printJsonOrMessage(payload: unknown, json?: boolean, message?: string): void {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (message) console.log(pc.green(message));
  console.log(payload);
}

export function registerGtmCommands(program: Command): void {
  const gtm = program.command("gtm").description("Growthub GTM substrate on the local machine");

  gtm
    .command("init")
    .description("Initialize the local GTM substrate state")
    .option("--account-email <email>", "Growthub account email")
    .option("--workspace <name>", "Workspace label")
    .option("--gh-app-path <path>", "Path to gh-app")
    .option("--internal-socials-path <path>", "Reference UI path for internal-socials")
    .option("--local-sdr-path <path>", "Reference/local runner path for growthub-sdr")
    .option("--json", "Output raw JSON")
    .action((opts: {
      accountEmail?: string;
      workspace?: string;
      ghAppPath?: string;
      internalSocialsPath?: string;
      localSdrPath?: string;
      json?: boolean;
    }) => {
      const state = createDefaultGtmState();
      if (opts.accountEmail) state.profile.growthubAccountEmail = opts.accountEmail.trim();
      if (opts.workspace) state.profile.workspaceName = opts.workspace.trim();
      if (opts.ghAppPath) state.profile.ghAppPath = opts.ghAppPath.trim();
      if (opts.internalSocialsPath) state.workflow.referenceInterfaces.internalSocialsPath = opts.internalSocialsPath.trim();
      if (opts.localSdrPath) {
        state.workflow.referenceInterfaces.localSdrPath = opts.localSdrPath.trim();
        state.workflow.runnerPath = path.resolve(opts.localSdrPath.trim(), "sdr-bot.mjs");
      }
      writeState(state);
      const view = toGtmViewModel(state);
      printJsonOrMessage(view, opts.json, "Initialized local GTM substrate.");
    });

  gtm
    .command("profile")
    .description("Show the active GTM profile")
    .option("--json", "Output raw JSON")
    .action((opts: { json?: boolean }) => {
      const state = readState();
      const view = toGtmViewModel(state);
      printJsonOrMessage(view.profile, opts.json);
    });

  gtm
    .command("knowledge")
    .description("Show knowledge table and item metadata")
    .option("--json", "Output raw JSON")
    .action((opts: { json?: boolean }) => {
      const state = readState();
      const view = toGtmViewModel(state);
      printJsonOrMessage(view.knowledge, opts.json);
    });

  gtm
    .command("connectors")
    .description("Show GTM connector metadata")
    .option("--json", "Output raw JSON")
    .action((opts: { json?: boolean }) => {
      const state = readState();
      const view = toGtmViewModel(state);
      printJsonOrMessage(view.connectors, opts.json);
    });

  gtm
    .command("workflow")
    .description("Show the single local GTM workflow")
    .option("--run", "Launch the local SDR workflow")
    .option("--json", "Output raw JSON")
    .action((opts: { json?: boolean; run?: boolean }) => {
      let state = readState();
      if (opts.run) {
        state = launchWorkflow(state);
        writeState(state);
      }
      const view = toGtmViewModel(state);
      printJsonOrMessage(view.workflow, opts.json, opts.run ? "Launched local SDR workflow." : undefined);
    });
}
