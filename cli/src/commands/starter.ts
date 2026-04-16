/**
 * `growthub starter` — Custom Workspace Starter Kit CLI surface.
 *
 * Thin Commander wrapper over `cli/src/starter/init.ts`. No business logic
 * here — every production behaviour lives in already-shipping primitives
 * (copyBundledKitSource, registerKitFork, writeKitForkPolicy,
 * appendKitForkTraceEvent, resolveGithubAccessToken, createFork).
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { initStarterWorkspace, DEFAULT_STARTER_KIT_ID } from "../starter/init.js";
import type { StarterInitOptions } from "../starter/types.js";

export async function runStarterInit(opts: StarterInitOptions): Promise<void> {
  try {
    const result = await initStarterWorkspace(opts);
    if (opts.json) {
      console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
      return;
    }
    p.outro(
      `Workspace scaffolded at ${pc.cyan(result.forkPath)}\n` +
      `  kitId:       ${result.kitId}\n` +
      `  forkId:      ${pc.cyan(result.forkId)}\n` +
      `  baseVersion: ${result.baseVersion}\n` +
      `  policyMode:  remoteSyncMode=${result.policyMode}` +
      (result.remote ? `\n  remote:      ${pc.cyan(result.remote.htmlUrl)}` : "") +
      `\n\nNext: ${pc.dim(`growthub kit fork status ${result.forkId}`)}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    p.log.error(msg);
    process.exitCode = 1;
  }
}

export function registerStarterCommands(program: Command): void {
  const starter = program
    .command("starter")
    .description("Custom Workspace Starter Kit — scaffold a fork with full v1 Self-Healing Fork Sync wiring.");

  starter
    .command("init")
    .description("Scaffold a new custom workspace from the starter kit and auto-register it as a fork.")
    .requiredOption("--out <path>", "Destination directory for the new workspace")
    .option("--kit <kit-id>", `Source kit id (default: ${DEFAULT_STARTER_KIT_ID})`)
    .option("--name <label>", "Human label for the fork")
    .option("--upstream <owner/repo>", "Upstream GitHub repo — when set, also creates a remote fork")
    .option("--destination-org <org>", "Create the GitHub fork under an org")
    .option("--fork-name <name>", "Override the GitHub fork name")
    .option("--remote-sync-mode <mode>", "Initial policy.remoteSyncMode — off|branch|pr (default: off)")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await runStarterInit({
        out: opts.out,
        kitId: opts.kit ?? DEFAULT_STARTER_KIT_ID,
        name: opts.name,
        upstream: opts.upstream,
        destinationOrg: opts.destinationOrg,
        forkName: opts.forkName,
        remoteSyncMode: opts.remoteSyncMode,
        json: opts.json,
      });
    });
}
