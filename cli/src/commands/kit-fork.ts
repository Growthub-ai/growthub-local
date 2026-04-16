/**
 * Kit Fork Commands
 *
 * CLI command surface for the worker kit fork & self-healing sync subsystem.
 * Follows the exact same Clack + Commander patterns as kit.ts, template.ts, etc.
 *
 * Commands registered:
 *   growthub kit fork                              # interactive hub (also callable from discovery)
 *   growthub kit fork register <path>              # register a fork directory
 *   growthub kit fork list                         # list registered forks
 *   growthub kit fork status <fork-id>             # drift report
 *   growthub kit fork heal <fork-id>               # heal interactively
 *   growthub kit fork jobs                         # background job queue
 *   growthub kit fork deregister <fork-id>         # remove registration
 *
 * Top-level shortcut (also wired by index.ts):
 *   growthub fork-sync  →  same hub as above
 */

import * as p from "@clack/prompts";
import { Command } from "commander";
import { registerKitForkRemoteSubcommands } from "./kit-fork-remote.js";
import pc from "picocolors";
import { printPaperclipCliBanner } from "../utils/banner.js";
import {
  registerKitFork,
  loadKitForkRegistration,
  listKitForkRegistrations,
  deregisterKitFork,
} from "../kits/fork-registry.js";
import {
  detectKitForkDrift,
  buildKitForkHealPlan,
} from "../kits/fork-sync.js";
import {
  runKitForkSyncJob,
  dispatchKitForkSyncJobBackground,
  listKitForkSyncJobs,
  cancelKitForkSyncJob,
  pruneKitForkSyncJobs,
  getKitForkSyncJob,
} from "../kits/fork-sync-agent.js";
import { listBundledKits } from "../kits/service.js";
import type {
  KitForkRegistration,
  KitForkDriftReport,
  KitForkHealPlan,
  KitForkSyncJob,
  KitDriftSeverity,
} from "../kits/fork-types.js";

// ---------------------------------------------------------------------------
// Display helpers (mirrors patterns from kit.ts)
// ---------------------------------------------------------------------------

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

function severityBadge(s: KitDriftSeverity): string {
  switch (s) {
    case "critical": return pc.red("● critical");
    case "warning":  return pc.yellow("● warning");
    case "info":     return pc.cyan("● info");
    default:         return pc.green("● in-sync");
  }
}

function jobStatusBadge(status: KitForkSyncJob["status"]): string {
  switch (status) {
    case "running":   return pc.cyan("⟳ running");
    case "completed": return pc.green("✓ completed");
    case "failed":    return pc.red("✗ failed");
    case "cancelled": return pc.dim("○ cancelled");
    default:          return pc.dim("… pending");
  }
}

function formatDate(iso?: string): string {
  if (!iso) return pc.dim("—");
  return new Date(iso).toLocaleString();
}

function printDriftReport(report: KitForkDriftReport): void {
  console.log("");
  console.log(
    pc.bold(`Fork: ${report.forkId}`) + "  " + severityBadge(report.overallSeverity),
  );
  console.log(
    pc.dim(`Kit: ${report.kitId}`) +
    "  " +
    pc.dim(`fork v${report.forkVersion} → upstream v${report.upstreamVersion}`),
  );
  console.log(hr());

  if (report.fileDrifts.length === 0 && report.packageDrifts.length === 0) {
    console.log(pc.green("  No drift detected — fork is in sync."));
  }

  if (report.fileDrifts.length > 0) {
    console.log(pc.bold("\n  File Drift:"));
    for (const d of report.fileDrifts) {
      const badge =
        d.changeType === "added"    ? pc.cyan("  +") :
        d.changeType === "modified" ? pc.yellow("  ~") :
                                      pc.red("  -");
      console.log(`${badge} ${d.relativePath}  ${pc.dim(d.description)}`);
    }
  }

  if (report.packageDrifts.length > 0) {
    console.log(pc.bold("\n  Package Drift:"));
    for (const d of report.packageDrifts) {
      const badge =
        d.changeType === "added"   ? pc.cyan("  +") :
        d.changeType === "updated" ? pc.yellow("  ~") :
                                     pc.red("  -");
      const ver = d.forkVersion
        ? `${d.forkVersion} → ${d.upstreamVersion}`
        : `(new) ${d.upstreamVersion}`;
      console.log(`${badge} ${d.packageName}  ${pc.dim(ver)}`);
    }
  }

  if (report.customSkillsDetected.length > 0) {
    console.log(pc.bold("\n  Custom Skills Detected (always preserved):"));
    for (const s of report.customSkillsDetected) {
      console.log(`  ${pc.magenta("⚑")} ${s}`);
    }
  }

  console.log("");
  console.log(hr());
}

function printHealPlan(plan: KitForkHealPlan): void {
  console.log("");
  console.log(
    pc.bold(`Heal Plan: ${plan.forkId}`) +
    pc.dim(`  v${plan.fromVersion} → v${plan.toVersion}`),
  );
  console.log(pc.dim("Estimated risk: ") + severityBadge(plan.estimatedRisk));
  console.log(hr());

  if (plan.actions.length === 0) {
    console.log(pc.green("  No actions needed."));
  } else {
    console.log(pc.bold(`  ${plan.actions.length} action(s) planned:`));
    for (const a of plan.actions) {
      const icon = a.actionType === "skip_user_modified" ? pc.dim("  ○") : pc.cyan("  →");
      console.log(`${icon} ${a.description}`);
    }
  }

  if (plan.preservedPaths.length > 0) {
    console.log(pc.bold(`\n  ${plan.preservedPaths.length} path(s) preserved (user modifications kept):`));
    for (const pp of plan.preservedPaths) {
      console.log(pc.dim(`  ⚑ ${pp}`));
    }
  }

  console.log("");
  console.log(hr());
}

function printForkList(forks: KitForkRegistration[]): void {
  if (forks.length === 0) {
    console.log(pc.dim("  No forks registered yet. Run `growthub kit fork register <path>` to get started."));
    return;
  }

  console.log("");
  console.log(pc.bold("Registered Kit Forks") + pc.dim(`  ${forks.length} total`));
  console.log(hr());

  for (const fork of forks) {
    const label = fork.label ? pc.bold(fork.label) + "  " : "";
    console.log(`\n  ${label}${pc.cyan(fork.forkId)}`);
    console.log(`  ${pc.dim("Kit:")} ${fork.kitId}  ${pc.dim("v" + fork.baseVersion)}`);
    console.log(`  ${pc.dim("Path:")} ${fork.forkPath}`);
    if (fork.lastSyncedAt) {
      console.log(`  ${pc.dim("Last synced:")} ${formatDate(fork.lastSyncedAt)}`);
    }
    if (fork.customSkills && fork.customSkills.length > 0) {
      console.log(`  ${pc.dim("Custom skills:")} ${fork.customSkills.length}`);
    }
  }

  console.log("");
  console.log(hr());
}

// ---------------------------------------------------------------------------
// Interactive hub  (exported for use in index.ts Discovery Hub)
// ---------------------------------------------------------------------------

export async function runKitForkHub(opts: { allowBackToHub?: boolean } = {}): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  p.intro(pc.bold("Kit Fork Sync Agent"));

  while (true) {
    const choice = await p.select({
      message: "What do you want to do?",
      options: [
        {
          value: "register",
          label: "📂 Register a fork",
          hint: "Track a downloaded and customised worker kit directory",
        },
        {
          value: "list",
          label: "📋 List forks",
          hint: "Browse all registered forks",
        },
        {
          value: "status",
          label: "🔍 Check drift",
          hint: "Detect what has changed between your fork and the latest upstream kit",
        },
        {
          value: "heal",
          label: "🔧 Heal fork",
          hint: "Sync to latest upstream while preserving all your customisations",
        },
        {
          value: "jobs",
          label: "⚙️  Background jobs",
          hint: "View status of async sync jobs",
        },
        ...(opts.allowBackToHub
          ? [{ value: "__back_to_hub", label: "← Back to main menu" }]
          : []),
      ],
    });

    if (p.isCancel(choice)) { p.cancel("Cancelled."); process.exit(0); }
    if (choice === "__back_to_hub") return "back";

    if (choice === "register") { await runRegisterFlow(); continue; }
    if (choice === "list")     { runListFlow(); continue; }
    if (choice === "status")   { await runStatusFlow(); continue; }
    if (choice === "heal")     { await runHealFlow(); continue; }
    if (choice === "jobs")     { await runJobsFlow(); continue; }
  }
}

// ---------------------------------------------------------------------------
// Register flow
// ---------------------------------------------------------------------------

async function runRegisterFlow(): Promise<void> {
  const rawPath = await p.text({
    message: "Enter the path to your fork directory",
    placeholder: "/Users/you/kits/my-higgsfield-fork",
    validate(v) { if (!v.trim()) return "Path is required"; },
  });
  if (p.isCancel(rawPath)) { p.cancel("Cancelled."); return; }

  const kits = listBundledKits();

  const kitChoice = await p.select({
    message: "Which worker kit is this fork based on?",
    options: [
      ...kits.map((k) => ({
        value: k.id,
        label: k.id + "  " + pc.dim("v" + k.version),
        hint: k.description,
      })),
      { value: "__cancel", label: "← Cancel" },
    ],
  });
  if (p.isCancel(kitChoice) || kitChoice === "__cancel") { p.cancel("Cancelled."); return; }

  const labelInput = await p.text({
    message: "Friendly label for this fork (optional)",
    placeholder: "My Production Higgsfield Setup",
  });
  if (p.isCancel(labelInput)) { p.cancel("Cancelled."); return; }

  const kitVersion = kits.find((k) => k.id === kitChoice)?.version ?? "0.0.0";

  const spinner = p.spinner();
  spinner.start("Registering fork...");

  try {
    const reg = registerKitFork({
      forkPath: rawPath.trim(),
      kitId: kitChoice as string,
      baseVersion: kitVersion,
      label: (labelInput as string).trim() || undefined,
    });
    spinner.stop(pc.green("Fork registered."));
    p.note(
      [
        `Fork ID:  ${pc.cyan(reg.forkId)}`,
        `Kit:      ${reg.kitId}  v${reg.baseVersion}`,
        `Path:     ${reg.forkPath}`,
        "",
        `Next: ${pc.cyan("growthub kit fork status " + reg.forkId)}`,
      ].join("\n"),
      "Registration complete",
    );
  } catch (err) {
    spinner.stop(pc.red("Registration failed."));
    p.log.error((err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// List flow
// ---------------------------------------------------------------------------

function runListFlow(): void {
  printForkList(listKitForkRegistrations());
}

// ---------------------------------------------------------------------------
// Status / drift flow
// ---------------------------------------------------------------------------

async function runStatusFlow(): Promise<void> {
  const forks = listKitForkRegistrations();
  if (forks.length === 0) {
    p.note("No forks registered. Use 'Register a fork' first.", "Nothing to inspect");
    return;
  }

  const choice = await p.select({
    message: "Select a fork to check",
    options: [
      ...forks.map((f) => ({
        value: f.forkId,
        label: (f.label ?? f.forkId) + "  " + pc.dim("v" + f.baseVersion),
        hint: f.kitId,
      })),
      { value: "__back", label: "← Back" },
    ],
  });
  if (p.isCancel(choice) || choice === "__back") return;

  const reg = forks.find((f) => f.forkId === choice);
  if (!reg) { p.cancel("Fork not found."); return; }

  const spinner = p.spinner();
  spinner.start("Detecting drift...");
  try {
    const report = detectKitForkDrift(reg);
    spinner.stop(pc.green("Analysis complete."));
    printDriftReport(report);
  } catch (err) {
    spinner.stop(pc.red("Drift detection failed."));
    p.log.error((err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Heal flow
// ---------------------------------------------------------------------------

async function runHealFlow(): Promise<void> {
  const forks = listKitForkRegistrations();
  if (forks.length === 0) {
    p.note("No forks registered. Use 'Register a fork' first.", "Nothing to heal");
    return;
  }

  const choice = await p.select({
    message: "Select a fork to heal",
    options: [
      ...forks.map((f) => ({
        value: f.forkId,
        label: (f.label ?? f.forkId) + "  " + pc.dim("v" + f.baseVersion),
        hint: f.kitId,
      })),
      { value: "__back", label: "← Back" },
    ],
  });
  if (p.isCancel(choice) || choice === "__back") return;

  const reg = forks.find((f) => f.forkId === choice);
  if (!reg) { p.cancel("Fork not found."); return; }

  // Drift detection
  const driftSpinner = p.spinner();
  driftSpinner.start("Detecting drift...");
  let driftReport: KitForkDriftReport;
  try {
    driftReport = detectKitForkDrift(reg);
    driftSpinner.stop("Drift analysis complete.");
  } catch (err) {
    driftSpinner.stop(pc.red("Drift detection failed."));
    p.log.error((err as Error).message);
    return;
  }

  printDriftReport(driftReport);

  if (!driftReport.hasUpstreamUpdate && driftReport.overallSeverity === "none") {
    p.note("Your fork is already in sync with the latest upstream kit.", "Already up to date");
    return;
  }

  const plan = buildKitForkHealPlan(driftReport);
  printHealPlan(plan);

  if (plan.actions.length === 0) {
    p.note("No actions needed — fork is structurally clean.", "Nothing to apply");
    return;
  }

  const mode = await p.select({
    message: "How do you want to apply this heal plan?",
    options: [
      { value: "foreground", label: "▶  Run now (foreground)", hint: "Watch live progress in this terminal" },
      { value: "background", label: "⚙️  Background job",     hint: "Async — returns immediately, check with 'jobs'" },
      { value: "dry-run",    label: "👁  Dry run",            hint: "Preview what would happen — no files written" },
      { value: "__cancel",   label: "← Cancel" },
    ],
  });
  if (p.isCancel(mode) || mode === "__cancel") return;

  if (mode === "background") {
    const jobId = dispatchKitForkSyncJobBackground(reg.forkId, reg.kitId);
    p.note(
      [
        `Job ID: ${pc.cyan(jobId)}`,
        "",
        `Check: ${pc.cyan("growthub kit fork jobs")}`,
      ].join("\n"),
      "Background sync dispatched",
    );
    return;
  }

  const isDryRun = mode === "dry-run";
  const healSpinner = p.spinner();
  healSpinner.start(isDryRun ? "Running dry run..." : "Applying heal plan...");

  const job = await runKitForkSyncJob(reg.forkId, reg.kitId, {
    dryRun: isDryRun,
    onProgress: (step) => { healSpinner.message(step); },
  });

  healSpinner.stop(
    job.status === "completed"
      ? pc.green(isDryRun ? "Dry run complete." : "Heal complete.")
      : pc.red("Heal encountered errors."),
  );

  if (job.healResult) {
    const r = job.healResult;
    console.log("");
    console.log(pc.bold("Result:"));
    console.log(`  ${pc.green("Applied:")} ${r.appliedCount}  ${pc.dim("Skipped:")} ${r.skippedCount}  ${r.errorCount > 0 ? pc.red("Errors: " + r.errorCount) : pc.dim("Errors: 0")}`);
    for (const ar of r.actionResults) {
      if (ar.status === "error") {
        console.log(`  ${pc.red("  ✗")} ${ar.action.targetPath}: ${ar.detail}`);
      }
    }
    console.log("");
  }

  if (job.status === "failed" && job.error) {
    p.log.error(job.error);
  }
}

// ---------------------------------------------------------------------------
// Jobs flow
// ---------------------------------------------------------------------------

async function runJobsFlow(): Promise<void> {
  while (true) {
    const jobs = listKitForkSyncJobs();

    if (jobs.length === 0) {
      p.note("No fork-sync jobs recorded yet.", "Jobs");
      return;
    }

    console.log("");
    console.log(pc.bold("Kit Fork Sync Jobs") + pc.dim(`  ${jobs.length} total`));
    console.log(hr());
    for (const job of jobs.slice(-10).reverse()) {
      console.log(`  ${jobStatusBadge(job.status)}  ${pc.cyan(job.jobId)}  ${pc.dim(job.forkId)}`);
      if (job.completedAt) console.log(`    ${pc.dim("Completed:")} ${formatDate(job.completedAt)}`);
      if (job.error) console.log(`    ${pc.red("Error:")} ${job.error}`);
    }
    console.log("");
    console.log(hr());

    const action = await p.select({
      message: "Manage jobs",
      options: [
        { value: "cancel", label: "Cancel a running job" },
        { value: "prune",  label: "Prune completed/failed jobs" },
        { value: "__back", label: "← Back" },
      ],
    });
    if (p.isCancel(action) || action === "__back") return;

    if (action === "cancel") {
      const active = jobs.filter((j) => j.status === "running" || j.status === "pending");
      if (active.length === 0) { p.note("No cancellable jobs.", "Cancel"); continue; }
      const jobChoice = await p.select({
        message: "Select job to cancel",
        options: active.map((j) => ({ value: j.jobId, label: j.jobId, hint: j.forkId })),
      });
      if (!p.isCancel(jobChoice)) {
        const ok = cancelKitForkSyncJob(jobChoice as string);
        p.log.info(ok ? `Job ${jobChoice} cancelled.` : `Could not cancel ${jobChoice}.`);
      }
    }

    if (action === "prune") {
      const n = pruneKitForkSyncJobs();
      p.log.info(`Pruned ${n} job(s).`);
    }
  }
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

/**
 * Register `growthub kit fork <subcommand>` under the existing `kit` command tree.
 * Called by kit.ts (registerKitCommands already has the `kit` Command object).
 */
export function registerKitForkSubcommands(kitCommand: Command): void {
  const forkCmd = kitCommand
    .command("fork")
    .description("Fork Sync Agent — register, track, and self-heal forked worker kits")
    .addHelpText("after", `
Examples:
  $ growthub kit fork                            # interactive hub
  $ growthub kit fork register ./my-kit-fork     # register a fork
  $ growthub kit fork list                       # list all forks
  $ growthub kit fork status <fork-id>           # check drift
  $ growthub kit fork heal <fork-id>             # heal a fork
  $ growthub kit fork heal <fork-id> --dry-run   # preview only
  $ growthub kit fork heal <fork-id> --background
  $ growthub kit fork jobs                       # view job queue
  $ growthub kit fork deregister <fork-id>       # remove registration
`);

  forkCmd.action(async () => {
    await runKitForkHub();
  });

  addForkSubcommands(forkCmd);
  registerKitForkRemoteSubcommands(forkCmd);
}

/**
 * Register the top-level `growthub fork-sync` shortcut.
 *
 * `growthub fork-sync` is a convenience alias for the hub.  Its subcommands
 * (register, list, status, heal, jobs, deregister) are added directly onto
 * the fork-sync command so both these paths work equivalently:
 *
 *   growthub fork-sync register ./my-fork
 *   growthub kit fork register ./my-fork
 */
export function registerKitForkCommands(program: Command): void {
  const forkSync = program
    .command("fork-sync")
    .description("Kit Fork Sync Agent — alias for `growthub kit fork`")
    .addHelpText("after", `
Examples:
  $ growthub fork-sync                          # interactive hub
  $ growthub fork-sync register ./my-fork
  $ growthub fork-sync list
  $ growthub fork-sync status <fork-id>
  $ growthub fork-sync heal <fork-id>
  $ growthub fork-sync heal <fork-id> --dry-run
  $ growthub fork-sync heal <fork-id> --background
  $ growthub fork-sync jobs
`);

  forkSync.action(async () => {
    await runKitForkHub();
  });

  // Add subcommands directly onto fork-sync (not inside a nested "fork" wrapper)
  addForkSubcommands(forkSync);
  registerKitForkRemoteSubcommands(forkSync);
}

/**
 * Internal helper: add the six fork subcommands directly onto any Commander
 * Command object.  Used by both registerKitForkSubcommands (under kit fork)
 * and registerKitForkCommands (under the top-level fork-sync alias).
 */
function addForkSubcommands(parentCmd: Command): void {
  // ── register ──────────────────────────────────────────────────────────────
  parentCmd
    .command("register")
    .description("Register a forked worker kit directory for sync tracking")
    .argument("<path>", "Path to the fork directory")
    .option("--kit <kit-id>", "Kit ID this fork is based on (auto-detected from kit.json if omitted)")
    .option("--label <label>", "Friendly label for this fork")
    .action(async (forkPath: string, opts: { kit?: string; label?: string }) => {
      const kits = listBundledKits();
      let kitId = opts.kit;

      if (!kitId) {
        try {
          const nodePath = await import("node:path");
          const nodeFs = await import("node:fs");
          const kitJsonPath = nodePath.resolve(forkPath, "kit.json");
          if (nodeFs.existsSync(kitJsonPath)) {
            const manifest = JSON.parse(nodeFs.readFileSync(kitJsonPath, "utf8")) as {
              kit?: { id?: string };
            };
            kitId = manifest?.kit?.id ?? undefined;
          }
        } catch { /* fallthrough */ }
      }

      if (!kitId) {
        console.error(pc.yellow("Could not auto-detect kit ID from kit.json.  Use --kit <kit-id>."));
        console.error(pc.dim("Available: " + kits.map((k) => k.id).join(", ")));
        process.exitCode = 1;
        return;
      }

      const kit = kits.find((k) => k.id === kitId);
      if (!kit) {
        console.error(pc.red(`Unknown kit: ${kitId}`));
        process.exitCode = 1;
        return;
      }

      try {
        const reg = registerKitFork({
          forkPath,
          kitId,
          baseVersion: kit.version,
          label: opts.label,
        });
        console.log(pc.green("Fork registered:"), reg.forkId);
        console.log(pc.dim("Kit:  "), reg.kitId, "v" + reg.baseVersion);
        console.log(pc.dim("Path: "), reg.forkPath);
      } catch (err) {
        console.error(pc.red((err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── list ──────────────────────────────────────────────────────────────────
  parentCmd
    .command("list")
    .description("List all registered forks")
    .option("--kit <kit-id>", "Filter by kit ID")
    .option("--json", "Output raw JSON")
    .action((opts: { kit?: string; json?: boolean }) => {
      const forks = listKitForkRegistrations(opts.kit);
      if (opts.json) { console.log(JSON.stringify(forks, null, 2)); return; }
      printForkList(forks);
    });

  // ── status ─────────────────────────────────────────────────────────────────
  parentCmd
    .command("status")
    .description("Detect drift between a fork and the latest upstream kit")
    .argument("<fork-id>", "Fork ID from list")
    .option("--json", "Output raw JSON drift report")
    .action(async (forkId: string, opts: { json?: boolean }) => {
      const reg = listKitForkRegistrations().find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        process.exitCode = 1;
        return;
      }
      try {
        const report = detectKitForkDrift(reg);
        if (opts.json) { console.log(JSON.stringify(report, null, 2)); return; }
        printDriftReport(report);
      } catch (err) {
        console.error(pc.red((err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── heal ───────────────────────────────────────────────────────────────────
  parentCmd
    .command("heal")
    .description("Apply a safe non-destructive heal to bring a fork up to date")
    .argument("<fork-id>", "Fork ID from list")
    .option("--dry-run", "Preview the plan without writing any files")
    .option("--background", "Dispatch as an async background job")
    .option("--skip <paths>", "Comma-separated relative paths to skip")
    .option("--json", "Output heal plan as JSON (implies --dry-run)")
    .action(async (forkId: string, opts: {
      dryRun?: boolean;
      background?: boolean;
      skip?: string;
      json?: boolean;
    }) => {
      const reg = listKitForkRegistrations().find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        const report = detectKitForkDrift(reg);
        const plan = buildKitForkHealPlan(report);
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      if (opts.background) {
        const jobId = dispatchKitForkSyncJobBackground(reg.forkId, reg.kitId, {
          dryRun: opts.dryRun,
          skipFiles: opts.skip?.split(",").map((s) => s.trim()),
        });
        console.log(pc.green("Background job dispatched:"), jobId);
        console.log(pc.dim("Check status: growthub fork-sync jobs (or growthub kit fork jobs)"));
        return;
      }

      const job = await runKitForkSyncJob(reg.forkId, reg.kitId, {
        dryRun: opts.dryRun,
        skipFiles: opts.skip?.split(",").map((s) => s.trim()),
        onProgress: (step) => process.stderr.write(pc.dim(step) + "\n"),
      });

      const r = job.healResult;
      if (r) {
        console.log(pc.bold("Heal result:"));
        console.log(`  Applied: ${r.appliedCount}  Skipped: ${r.skippedCount}  Errors: ${r.errorCount}`);
      }

      if (job.status === "failed") {
        console.error(pc.red("Heal failed: " + (job.error ?? "unknown error")));
        process.exitCode = 1;
      }
    });

  // ── jobs ───────────────────────────────────────────────────────────────────
  parentCmd
    .command("jobs")
    .description("List background fork-sync jobs")
    .option("--fork <fork-id>", "Filter by fork ID")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output raw JSON")
    .action((opts: { fork?: string; status?: string; json?: boolean }) => {
      const jobs = listKitForkSyncJobs({
        forkId: opts.fork,
        status: opts.status as KitForkSyncJob["status"] | undefined,
      });
      if (opts.json) { console.log(JSON.stringify(jobs, null, 2)); return; }
      if (jobs.length === 0) { console.log(pc.dim("No jobs found.")); return; }
      console.log("");
      console.log(pc.bold("Kit Fork Sync Jobs") + pc.dim(`  ${jobs.length} total`));
      console.log(hr());
      for (const job of jobs) {
        console.log(`  ${jobStatusBadge(job.status)}  ${pc.cyan(job.jobId)}  ${pc.dim(job.forkId)}`);
        if (job.completedAt) console.log(`    ${pc.dim("Completed:")} ${formatDate(job.completedAt)}`);
        if (job.error) console.log(`    ${pc.red("Error:")} ${job.error}`);
      }
      console.log("");
    });

  // ── deregister ─────────────────────────────────────────────────────────────
  parentCmd
    .command("deregister")
    .description("Remove a fork registration (does not delete your fork directory)")
    .argument("<fork-id>", "Fork ID to deregister")
    .action(async (forkId: string) => {
      const allForks = listKitForkRegistrations();
      const reg = allForks.find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        process.exitCode = 1;
        return;
      }
      const confirmed = await p.confirm({
        message: `Remove registration for ${pc.cyan(forkId)}? (Your fork directory will not be touched)`,
        initialValue: false,
      });
      if (p.isCancel(confirmed) || !confirmed) { p.cancel("Cancelled."); return; }

      const ok = deregisterKitFork(reg.kitId, forkId);
      if (ok) {
        console.log(pc.green("Fork deregistered:"), forkId);
      } else {
        console.error(pc.red("Deregistration failed."));
        process.exitCode = 1;
      }
    });
}
