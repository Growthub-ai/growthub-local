/**
 * `growthub workspace upstream` — Fork upstream sync helpers.
 *
 * Wraps existing fork-sync primitives to provide a workspace-centric view
 * of upstream drift and safe additive sync paths.
 *
 *   growthub workspace upstream check [--json]
 *   growthub workspace upstream heal [--dry-run] [--json]
 *   growthub workspace upstream pr [--json]
 *
 * All operations read the registered fork from .growthub-fork/fork.json
 * in the current directory (or --fork path). No mutations without explicit
 * confirmation or --dry-run flag.
 */

import { Command } from "commander";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { resolveInForkStateDir } from "../config/kit-forks-home.js";

// ---------------------------------------------------------------------------
// Fork resolution helpers
// ---------------------------------------------------------------------------

interface ForkInfo {
  forkId: string;
  kitId: string;
  label?: string;
  remoteSyncMode?: string;
  hasRemote: boolean;
}

function resolveForkInfo(forkPath: string): ForkInfo | null {
  const stateDir = resolveInForkStateDir(forkPath);
  const forkJsonPath = path.resolve(stateDir, "fork.json");
  if (!fs.existsSync(forkJsonPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(forkJsonPath, "utf8")) as {
      forkId?: string;
      kitId?: string;
      label?: string;
      remote?: { htmlUrl?: string };
    };
    if (!parsed.forkId || !parsed.kitId) return null;
    const policyPath = path.resolve(stateDir, "policy.json");
    let remoteSyncMode = "off";
    if (fs.existsSync(policyPath)) {
      try {
        const policy = JSON.parse(fs.readFileSync(policyPath, "utf8")) as { remoteSyncMode?: string };
        remoteSyncMode = policy.remoteSyncMode ?? "off";
      } catch { /* ignore */ }
    }
    return {
      forkId: parsed.forkId,
      kitId: parsed.kitId,
      label: parsed.label,
      remoteSyncMode,
      hasRemote: Boolean(parsed.remote),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

export interface UpstreamCheckResult {
  forkPath: string;
  forkId: string | null;
  kitId: string | null;
  registered: boolean;
  hasRemote: boolean;
  remoteSyncMode: string;
  upstreamCheckCommand: string;
  healCommand: string;
  prCommand: string;
  blockingIssues: string[];
  safeNextActions: string[];
}

function runUpstreamCheck(forkPath: string, json: boolean): void {
  const forkInfo = resolveForkInfo(forkPath);

  const blockingIssues: string[] = [];
  const safeNextActions: string[] = [];

  if (!forkInfo) {
    blockingIssues.push("Fork not registered — run: growthub kit fork register .");
    safeNextActions.push("growthub kit fork register .");
  }

  if (forkInfo && !forkInfo.hasRemote) {
    blockingIssues.push("No GitHub remote connected — drift check requires remote");
    safeNextActions.push(`growthub kit fork connect --fork-id ${forkInfo.forkId} --remote <owner/repo>`);
  }

  if (forkInfo && forkInfo.remoteSyncMode === "off") {
    safeNextActions.push(`growthub kit fork policy ${forkInfo.forkId} --set remoteSyncMode=pr`);
  }

  const upstreamCheckCommand = forkInfo
    ? `growthub kit fork status ${forkInfo.forkId} --json`
    : "growthub kit fork register . # first register";

  const healCommand = forkInfo
    ? `growthub kit fork heal ${forkInfo.forkId} --dry-run --json`
    : "growthub kit fork register . # first register";

  const prCommand = forkInfo
    ? `growthub kit fork heal ${forkInfo.forkId} --json`
    : "growthub kit fork register . # first register";

  const result: UpstreamCheckResult = {
    forkPath,
    forkId: forkInfo?.forkId ?? null,
    kitId: forkInfo?.kitId ?? null,
    registered: Boolean(forkInfo),
    hasRemote: forkInfo?.hasRemote ?? false,
    remoteSyncMode: forkInfo?.remoteSyncMode ?? "off",
    upstreamCheckCommand,
    healCommand,
    prCommand,
    blockingIssues,
    safeNextActions,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold("Workspace Upstream Check"));
  console.log(pc.dim("─".repeat(60)));

  if (forkInfo) {
    console.log(`  Fork ID:       ${pc.cyan(forkInfo.forkId)}`);
    console.log(`  Kit:           ${pc.dim(forkInfo.kitId)}`);
    console.log(`  Remote:        ${forkInfo.hasRemote ? pc.green("connected") : pc.dim("not connected")}`);
    console.log(`  Sync mode:     ${forkInfo.remoteSyncMode === "pr" ? pc.green("pr") : pc.dim(forkInfo.remoteSyncMode)}`);
    console.log("");
    console.log(`  Check drift:   ${pc.cyan(upstreamCheckCommand)}`);
    console.log(`  Dry-run heal:  ${pc.cyan(healCommand)}`);
    console.log(`  Submit PR:     ${pc.cyan(prCommand)}`);
  } else {
    console.log(pc.yellow("  Fork not registered."));
  }

  if (blockingIssues.length > 0) {
    console.log("");
    console.log(pc.yellow("  Blocking issues:"));
    for (const issue of blockingIssues) {
      console.log(pc.dim(`    · ${issue}`));
    }
  }

  if (safeNextActions.length > 0) {
    console.log("");
    console.log(pc.dim("  Safe next actions:"));
    for (const action of safeNextActions) {
      console.log(pc.dim(`    ${pc.cyan(action)}`));
    }
  }

  console.log("");
  console.log(pc.dim("  Agent output: growthub workspace upstream check --json"));
  console.log("");
}

// ---------------------------------------------------------------------------
// heal
// ---------------------------------------------------------------------------

function runUpstreamHeal(forkPath: string, dryRun: boolean, json: boolean): void {
  const forkInfo = resolveForkInfo(forkPath);
  if (!forkInfo) {
    const err = { error: "Fork not registered. Run: growthub kit fork register ." };
    if (json) { console.log(JSON.stringify(err)); process.exitCode = 1; return; }
    console.error(pc.red(err.error));
    process.exitCode = 1;
    return;
  }

  const args = ["kit", "fork", "heal", forkInfo.forkId, "--json"];
  if (dryRun) args.push("--dry-run");

  if (!json) {
    p.note(
      [
        `Fork ID: ${forkInfo.forkId}`,
        `Kit:     ${forkInfo.kitId}`,
        `Mode:    ${dryRun ? "dry-run" : "live"}`,
        "",
        `Command: growthub ${args.join(" ")}`,
      ].join("\n"),
      "Upstream Heal",
    );
  }

  const result = spawnSync("growthub", args, { stdio: json ? "pipe" : "inherit", encoding: "utf8" });

  if (json && result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

// ---------------------------------------------------------------------------
// pr (alias for heal without dry-run + remoteSyncMode check)
// ---------------------------------------------------------------------------

function runUpstreamPr(forkPath: string, json: boolean): void {
  const forkInfo = resolveForkInfo(forkPath);
  if (!forkInfo) {
    const err = { error: "Fork not registered. Run: growthub kit fork register ." };
    if (json) { console.log(JSON.stringify(err)); process.exitCode = 1; return; }
    console.error(pc.red(err.error));
    process.exitCode = 1;
    return;
  }

  if (forkInfo.remoteSyncMode !== "pr") {
    const msg = {
      status: "needs_action",
      message: `remoteSyncMode is "${forkInfo.remoteSyncMode}", not "pr". Set it first.`,
      fix: `growthub kit fork policy ${forkInfo.forkId} --set remoteSyncMode=pr`,
    };
    if (json) { console.log(JSON.stringify(msg)); return; }
    p.note(
      [`Remote sync mode is "${forkInfo.remoteSyncMode}", not "pr".`, "", `Fix: growthub kit fork policy ${forkInfo.forkId} --set remoteSyncMode=pr`].join("\n"),
      "Set Sync Mode First",
    );
    return;
  }

  runUpstreamHeal(forkPath, false, json);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkspaceUpstreamCommands(workspaceCmd: Command): void {
  const upstream = workspaceCmd
    .command("upstream")
    .description("Fork upstream sync helpers — check drift, heal, and open sync PRs");

  upstream
    .command("check")
    .description("Check upstream drift state and print recommended sync commands")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--json", "Emit machine-readable JSON")
    .addHelpText("after", `
Examples:
  $ growthub workspace upstream check
  $ growthub workspace upstream check --json
  $ growthub workspace upstream check --fork ./my-workspace --json

JSON shape:
  { forkId, kitId, registered, hasRemote, remoteSyncMode, upstreamCheckCommand, healCommand, prCommand, blockingIssues, safeNextActions }
`)
    .action((opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
      runUpstreamCheck(forkPath, opts.json ?? false);
    });

  upstream
    .command("heal")
    .description("Run upstream heal (wraps growthub kit fork heal) — preserves customizations")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--dry-run", "Show what would change without applying it")
    .option("--json", "Emit machine-readable JSON (pass-through from kit fork heal)")
    .addHelpText("after", `
Examples:
  $ growthub workspace upstream heal --dry-run
  $ growthub workspace upstream heal --dry-run --json
  $ growthub workspace upstream heal --json
`)
    .action((opts: { fork?: string; dryRun?: boolean; json?: boolean }) => {
      const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
      runUpstreamHeal(forkPath, opts.dryRun ?? false, opts.json ?? false);
    });

  upstream
    .command("pr")
    .description("Submit upstream sync as a PR (requires remoteSyncMode=pr on the fork)")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--json", "Emit machine-readable JSON (pass-through from kit fork heal)")
    .addHelpText("after", `
Examples:
  $ growthub workspace upstream pr
  $ growthub workspace upstream pr --json

Note: remoteSyncMode must be set to "pr" first:
  $ growthub kit fork policy <fork-id> --set remoteSyncMode=pr
`)
    .action((opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
      runUpstreamPr(forkPath, opts.json ?? false);
    });
}
