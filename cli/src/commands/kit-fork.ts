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

import fs from "node:fs";
import * as p from "@clack/prompts";
import { Command } from "commander";
import { registerKitForkRemoteSubcommands } from "./kit-fork-remote.js";
import pc from "picocolors";
import { printPaperclipCliBanner } from "../utils/banner.js";
import { renderTable } from "../utils/table-renderer.js";
import { renderProgressBar, formatRelative } from "../utils/progress.js";
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
import {
  readKitForkPolicy,
  writeKitForkPolicy,
  isUntouchable,
  requiresConfirmation,
  makeDefaultKitForkPolicy,
  type KitForkPolicy,
} from "../kits/fork-policy.js";
import { appendKitForkTraceEvent, readKitForkTrace } from "../kits/fork-trace.js";
import {
  attachAuthorityEnvelope,
  revokeForkAuthority,
  readForkAuthorityState,
  describePolicyAttestation,
  readIssuerRegistry,
  upsertIssuer,
  removeIssuer,
  type AuthorityEnvelope,
  type AuthorityIssuerKind,
} from "../kits/fork-authority.js";
import type {
  KitForkRegistration,
  KitForkDriftReport,
  KitForkHealPlan,
  KitHealAction,
  KitForkSyncJob,
  KitDriftSeverity,
} from "../kits/fork-types.js";
import { captureEvent } from "../runtime/telemetry/index.js";
import { createHash } from "node:crypto";

function hashForkId(forkId: string): string {
  return createHash("sha256").update(forkId).digest("hex").slice(0, 12);
}

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

function statusIconForDrift(severity: KitDriftSeverity): string {
  switch (severity) {
    case "critical": return pc.red("✗ drift-major");
    case "warning":  return pc.yellow("⚠ drift-warn");
    case "info":     return pc.cyan("~ drift-minor");
    default:         return pc.green("✓ synced");
  }
}

interface ForkSummary {
  forkId: string;
  label: string | null;
  kitId: string;
  baseVersion: string;
  forkPath: string;
  severity: KitDriftSeverity | "unknown";
  upstreamVersion: string | null;
  protectedPaths: string[];
  lastHealAt: string | null;
  hasRemote: boolean;
}

function summarizeFork(
  fork: KitForkRegistration,
  opts: { skipUpstreamCheck?: boolean } = {},
): ForkSummary {
  let severity: KitDriftSeverity | "unknown" = "unknown";
  let upstreamVersion: string | null = null;
  let lastHealAt: string | null = fork.lastSyncedAt ?? null;

  if (!opts.skipUpstreamCheck) {
    try {
      const report = detectKitForkDrift(fork);
      severity = report.overallSeverity;
      upstreamVersion = report.upstreamVersion;
    } catch {
      severity = "unknown";
    }
  }

  let protectedPaths: string[] = [];
  try {
    const policy = readKitForkPolicy(fork.forkPath);
    protectedPaths = policy.untouchablePaths.slice(0, 3);
  } catch { /* tolerant */ }

  if (!lastHealAt) {
    try {
      const events = readKitForkTrace(fork.forkPath);
      const last = [...events].reverse().find((e) => e.type === "heal_applied");
      if (last) lastHealAt = last.timestamp;
    } catch { /* tolerant */ }
  }

  return {
    forkId: fork.forkId,
    label: fork.label ?? null,
    kitId: fork.kitId,
    baseVersion: fork.baseVersion,
    forkPath: fork.forkPath,
    severity,
    upstreamVersion,
    protectedPaths,
    lastHealAt,
    hasRemote: Boolean(fork.remote),
  };
}

function renderForkTable(summaries: ForkSummary[]): string {
  return renderTable<ForkSummary>({
    columns: [
      {
        key: "forkId",
        label: "Fork ID",
        maxWidth: 26,
        format: (v, row) => pc.cyan(row.label ?? String(v)),
      },
      {
        key: "kitId",
        label: "Kit",
        maxWidth: 22,
      },
      {
        key: "baseVersion",
        label: "Base",
        format: (v) => `v${v}`,
      },
      {
        key: "upstreamVersion",
        label: "Upstream",
        format: (v) => (v ? `v${v}` : pc.dim("—")),
      },
      {
        key: "severity",
        label: "Status",
        format: (v) =>
          v === "unknown" ? pc.dim("○ unknown") : statusIconForDrift(v as KitDriftSeverity),
      },
      {
        key: "protectedPaths",
        label: "Protected",
        maxWidth: 18,
        format: (v) => {
          const arr = v as string[];
          if (!arr || arr.length === 0) return pc.dim("—");
          return arr.join(",");
        },
      },
      {
        key: "lastHealAt",
        label: "Last Heal",
        format: (v) => (v ? formatRelative(v as string) : pc.dim("—")),
      },
    ],
    rows: summaries,
    emptyText:
      "No forks registered yet. Run `growthub kit fork register <path>` to get started.",
  });
}

function printForkList(forks: KitForkRegistration[]): void {
  if (forks.length === 0) {
    console.log(pc.dim("  No forks registered yet. Run `growthub kit fork register <path>` to get started."));
    return;
  }

  const summaries = forks.map((f) => summarizeFork(f, { skipUpstreamCheck: true }));

  console.log("");
  console.log(pc.bold("Registered Kit Forks") + pc.dim(`  ${forks.length} total`));
  console.log(hr());
  console.log(renderForkTable(summaries));
  console.log("");
  console.log(hr());
}

// ---------------------------------------------------------------------------
// Heal preview — rich grouped rendering
// ---------------------------------------------------------------------------

function groupHealActions(plan: KitForkHealPlan): {
  safeAdd: KitHealAction[];
  safeUpdate: KitHealAction[];
  protected: KitHealAction[];
  unresolved: KitHealAction[];
} {
  const safeAdd: KitHealAction[] = [];
  const safeUpdate: KitHealAction[] = [];
  const protectedActions: KitHealAction[] = [];
  const unresolved: KitHealAction[] = [];

  for (const a of plan.actions) {
    if (a.actionType === "skip_user_modified") {
      protectedActions.push(a);
      continue;
    }
    if (a.needsConfirmation) {
      unresolved.push(a);
      continue;
    }
    if (a.actionType === "add_file" || a.actionType === "add_custom_skill") {
      safeAdd.push(a);
      continue;
    }
    safeUpdate.push(a);
  }

  return { safeAdd, safeUpdate, protected: protectedActions, unresolved };
}

function printRichHealPreview(plan: KitForkHealPlan, policy?: KitForkPolicy): void {
  const g = groupHealActions(plan);

  console.log("");
  console.log(
    pc.bold(`Heal Plan: ${plan.forkId}`) +
    pc.dim(`  v${plan.fromVersion} → v${plan.toVersion}`),
  );
  console.log(pc.dim("Estimated risk: ") + severityBadge(plan.estimatedRisk));
  console.log(hr());

  if (g.safeAdd.length > 0) {
    console.log(pc.bold(`\n  SAFE ADDITIONS (${g.safeAdd.length}):`));
    for (const a of g.safeAdd) {
      console.log(`    ${pc.green("+")} ${a.targetPath}  ${pc.dim(a.description)}`);
    }
  }

  if (g.safeUpdate.length > 0) {
    console.log(pc.bold(`\n  SAFE UPDATES (${g.safeUpdate.length}):`));
    for (const a of g.safeUpdate) {
      console.log(`    ${pc.yellow("~")} ${a.targetPath}  ${pc.dim(a.description)}`);
    }
  }

  if (g.protected.length > 0 || plan.preservedPaths.length > 0) {
    const paths = new Set<string>([
      ...g.protected.map((a) => a.targetPath),
      ...plan.preservedPaths,
    ]);
    console.log(pc.bold(`\n  PROTECTED (${paths.size}):`));
    for (const pth of paths) {
      const reason = policy && isUntouchable(policy, pth)
        ? "policy.untouchablePaths"
        : "user-modified";
      console.log(`    ${pc.dim("○")} ${pth}  ${pc.dim(`(${reason})`)}`);
    }
  }

  if (g.unresolved.length > 0) {
    console.log(pc.bold(`\n  UNRESOLVED — needs confirmation (${g.unresolved.length}):`));
    for (const a of g.unresolved) {
      console.log(`    ${pc.red("!")} ${a.targetPath}  ${pc.dim(a.confirmationReason ?? "policy.confirmBeforeChange")}`);
    }
  }

  console.log("");
  console.log(pc.bold("  DECISION:"));
  const applyCount = g.safeAdd.length + g.safeUpdate.length;
  const skipCount = g.protected.length + plan.preservedPaths.length;
  console.log(`    ${pc.green(String(applyCount))} will apply  ·  ${pc.dim(String(skipCount) + " protected")}  ·  ${g.unresolved.length > 0 ? pc.red(String(g.unresolved.length) + " unresolved") : pc.dim("0 unresolved")}`);
  console.log(hr());
}

function printNextStepsAfterStatus(forkId: string, hasDrift: boolean): void {
  console.log("");
  console.log(pc.bold("  Next steps:"));
  if (hasDrift) {
    console.log(`    ${pc.cyan("growthub kit fork heal " + forkId + " --preview")}   ${pc.dim("rich heal preview")}`);
    console.log(`    ${pc.cyan("growthub kit fork heal " + forkId)}             ${pc.dim("apply interactively")}`);
  }
  console.log(`    ${pc.cyan("growthub kit fork policy " + forkId)}           ${pc.dim("interactive policy editor")}`);
  console.log(`    ${pc.cyan("growthub kit fork history " + forkId)}          ${pc.dim("audit timeline")}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// Jobs table + watch + tail helpers
// ---------------------------------------------------------------------------

function estimateJobProgress(job: KitForkSyncJob): { current: number; total: number } | null {
  if (!job.healPlan) return null;
  const total = job.healPlan.actions.length;
  if (total === 0) return null;
  if (job.healResult) {
    const done = job.healResult.appliedCount + job.healResult.skippedCount;
    return { current: Math.min(done, total), total };
  }
  return { current: 0, total };
}

function renderJobTable(jobs: KitForkSyncJob[]): string {
  return renderTable<KitForkSyncJob>({
    columns: [
      {
        key: "jobId",
        label: "Job ID",
        maxWidth: 28,
        format: (v) => pc.cyan(String(v)),
      },
      {
        key: "forkId",
        label: "Fork ID",
        maxWidth: 22,
        format: (v) => pc.dim(String(v)),
      },
      {
        key: "status",
        label: "Status",
        format: (v) => jobStatusBadge(v as KitForkSyncJob["status"]),
      },
      {
        key: "healPlan",
        label: "Progress",
        maxWidth: 28,
        format: (_v, row) => {
          const prog = estimateJobProgress(row);
          if (!prog) {
            if (row.status === "completed") return pc.green("✓ 100%");
            if (row.status === "failed")    return pc.red("✗");
            return pc.dim("—");
          }
          return renderProgressBar(prog.current, prog.total, { width: 14, showCounts: true });
        },
      },
      {
        key: "createdAt",
        label: "Age",
        format: (_v, row) => formatRelative(row.completedAt ?? row.createdAt),
      },
    ],
    rows: jobs,
    emptyText: "No jobs found.",
  });
}

function printJobDetail(job: KitForkSyncJob): void {
  console.log(`  ${jobStatusBadge(job.status)}  ${pc.cyan(job.jobId)}  ${pc.dim(job.forkId)}`);
  const prog = estimateJobProgress(job);
  if (prog) {
    console.log(`    ${pc.dim("Progress:")}  ${renderProgressBar(prog.current, prog.total, { width: 24 })}`);
  }
  if (job.healPlan) {
    console.log(`    ${pc.dim("Plan:")}      ${job.healPlan.actions.length} action(s), risk=${job.healPlan.estimatedRisk}`);
  }
  if (job.startedAt) console.log(`    ${pc.dim("Started:")}   ${formatRelative(job.startedAt)}  (${job.startedAt})`);
  if (job.completedAt) console.log(`    ${pc.dim("Completed:")} ${formatRelative(job.completedAt)}  (${job.completedAt})`);
  if (job.error) console.log(`    ${pc.red("Error:")}     ${job.error}`);
}

const TERMINAL_JOB_STATUSES: ReadonlyArray<KitForkSyncJob["status"]> = [
  "completed",
  "failed",
  "cancelled",
];

async function watchJob(jobId: string, jsonMode: boolean): Promise<void> {
  const initial = getKitForkSyncJob(jobId);
  if (!initial) {
    console.error(pc.red(`Job not found: ${jobId}`));
    process.exitCode = 1;
    return;
  }

  if (jsonMode) {
    const snapshot = await pollUntilTerminal(jobId);
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold(`Watching job ${pc.cyan(jobId)}`));
  console.log(hr());

  let lastStatus: KitForkSyncJob["status"] | null = null;
  let lastProgress = -1;

  // Poll inline; exit as soon as the job reaches a terminal state.
  // Poll interval is conservative (500ms) to avoid busy-waiting.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = getKitForkSyncJob(jobId);
    if (!job) {
      console.error(pc.red(`  Job disappeared: ${jobId}`));
      process.exitCode = 1;
      return;
    }
    const prog = estimateJobProgress(job);
    const progNum = prog ? Math.round((prog.current / (prog.total || 1)) * 100) : -1;
    if (job.status !== lastStatus || progNum !== lastProgress) {
      printJobDetail(job);
      lastStatus = job.status;
      lastProgress = progNum;
    }
    if (TERMINAL_JOB_STATUSES.includes(job.status)) {
      console.log("");
      if (job.status === "failed") process.exitCode = 1;
      return;
    }
    await sleep(500);
  }
}

async function pollUntilTerminal(jobId: string): Promise<KitForkSyncJob> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = getKitForkSyncJob(jobId);
    if (!job) throw new Error(`Job disappeared: ${jobId}`);
    if (TERMINAL_JOB_STATUSES.includes(job.status)) return job;
    await sleep(500);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tailJobTrace(jobId: string, limit: number, jsonMode: boolean): void {
  const job = getKitForkSyncJob(jobId);
  if (!job) {
    console.error(pc.red(`Job not found: ${jobId}`));
    process.exitCode = 1;
    return;
  }
  const reg = listKitForkRegistrations().find((f) => f.forkId === job.forkId);
  if (!reg) {
    console.error(pc.red(`Fork not registered for job ${jobId}: ${job.forkId}`));
    process.exitCode = 1;
    return;
  }
  const events = readKitForkTrace(reg.forkPath)
    .filter((e) => e.jobId === jobId)
    .slice(-Math.max(1, limit));

  if (jsonMode) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold(`Trace tail: ${pc.cyan(jobId)}`) + pc.dim(`  ${events.length} event(s)`));
  console.log(hr());
  if (events.length === 0) {
    console.log(pc.dim(`  No trace events recorded for this job yet.`));
    console.log("");
    return;
  }
  for (const e of events) {
    const ts = e.timestamp.replace("T", " ").replace(/\..+Z$/, "Z");
    console.log(`  ${pc.dim(ts)}  ${pc.cyan("[" + e.type + "]")}  ${e.summary ?? ""}`);
  }
  console.log("");
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
    void captureEvent({
      event: "fork_registered",
      properties: {
        funnel_stage: "expansion",
        fork_id_hash: hashForkId(reg.forkId),
        surface: "interactive",
      },
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
  void captureEvent({
    event: "fork_sync_preview_started",
    properties: {
      funnel_stage: "expansion",
      fork_id_hash: hashForkId(reg.forkId),
      drift_severity: driftReport.overallSeverity,
      heal_action_count: plan.actions.length,
      surface: "interactive",
    },
  });
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

  const healStartedAt = Date.now();
  const job = await runKitForkSyncJob(reg.forkId, reg.kitId, {
    dryRun: isDryRun,
    onProgress: (step) => { healSpinner.message(step); },
  });

  if (!isDryRun) {
    void captureEvent({
      event: "fork_sync_heal_applied",
      properties: {
        funnel_stage: "expansion",
        fork_id_hash: hashForkId(reg.forkId),
        drift_severity: driftReport.overallSeverity,
        heal_action_count: plan.actions.length,
        duration_ms: Date.now() - healStartedAt,
        outcome: job.status === "completed" ? "success" : "failure",
        surface: "interactive",
      },
    });
  }

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
  # Interactive hub
  $ growthub kit fork                            # start interactive fork menu

  # List all forks (with drift + policy at a glance)
  $ growthub kit fork list                       # beautiful table
  $ growthub kit fork list --json                # machine-readable
  $ growthub kit fork list --filter status=drift-major
  $ growthub kit fork list --sort-by last-heal

  # Status with policy eval + heal plan preview + next steps
  $ growthub kit fork status <fork-id>
  $ growthub kit fork status <fork-id> --policy-only
  $ growthub kit fork status <fork-id> --no-upstream-check

  # Edit policy (interactive) or set fields non-interactively
  $ growthub kit fork policy <fork-id> --edit
  $ growthub kit fork policy <fork-id> --set autoApprove=all --set untouchablePaths+=skills/

  # Heal (preview, apply, or background)
  $ growthub kit fork heal <fork-id> --preview   # rich grouped preview + decision prompt
  $ growthub kit fork heal <fork-id>             # apply (foreground)
  $ growthub kit fork heal <fork-id> --background
  $ growthub kit fork heal <fork-id> --dry-run

  # Monitor background jobs
  $ growthub kit fork jobs                       # table view with progress
  $ growthub kit fork jobs --watch <job-id>      # live progress until terminal
  $ growthub kit fork jobs --tail <job-id>       # trace events for a job
  $ growthub kit fork jobs --filter status=running

  # Audit history
  $ growthub kit fork history <fork-id>          # timeline
  $ growthub kit fork history <fork-id> --csv > audit.csv
  $ growthub kit fork history <fork-id> --since 2024-01-01

  # Manage forks
  $ growthub kit fork register ./my-fork         # register existing fork
  $ growthub kit fork deregister <fork-id>
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
  $ growthub fork-sync list                     # beautiful table of all forks
  $ growthub fork-sync status <fork-id>         # drift + policy + next steps
  $ growthub fork-sync policy <fork-id> --edit  # interactive policy editor
  $ growthub fork-sync heal <fork-id> --preview # rich heal preview
  $ growthub fork-sync heal <fork-id> --background
  $ growthub fork-sync jobs --watch <job-id>    # live job progress
  $ growthub fork-sync history <fork-id>        # audit timeline
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
        void captureEvent({
          event: "fork_registered",
          properties: {
            funnel_stage: "expansion",
            fork_id_hash: hashForkId(reg.forkId),
            surface: "cli_register",
          },
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
    .description("List all registered forks with rich drift + policy summary")
    .option("--kit <kit-id>", "Filter by kit ID")
    .option("--filter <expr>", "Filter expression, e.g. status=synced, status=drift-major, kit=<id>")
    .option("--sort-by <key>", "Sort by: id | kit | status | last-heal (default: id)")
    .option("--no-upstream-check", "Skip upstream drift detection (faster, shows cached status only)")
    .option("--json", "Output raw JSON")
    .action((opts: {
      kit?: string;
      filter?: string;
      sortBy?: string;
      upstreamCheck?: boolean;
      json?: boolean;
    }) => {
      const raw = listKitForkRegistrations(opts.kit);
      const skipUpstream = opts.upstreamCheck === false;
      let summaries = raw.map((f) => summarizeFork(f, { skipUpstreamCheck: skipUpstream }));

      if (opts.filter) {
        const [key, value] = opts.filter.split("=").map((s) => s.trim());
        if (!key || !value) {
          console.error(pc.red(`Invalid --filter expression: ${opts.filter}`));
          console.error(pc.dim("Use --filter status=<synced|drift-minor|drift-warn|drift-major|unknown> or kit=<id>"));
          process.exitCode = 1;
          return;
        }
        summaries = summaries.filter((s) => {
          if (key === "kit") return s.kitId === value;
          if (key === "status") {
            const mapping: Record<string, KitDriftSeverity | "unknown"> = {
              synced: "none",
              "drift-minor": "info",
              "drift-warn": "warning",
              "drift-major": "critical",
              unknown: "unknown",
            };
            const want = mapping[value] ?? value;
            return s.severity === want;
          }
          return true;
        });
      }

      const sortKey = opts.sortBy ?? "id";
      summaries.sort((a, b) => {
        if (sortKey === "kit") return a.kitId.localeCompare(b.kitId);
        if (sortKey === "status") {
          const order = ["none", "info", "warning", "critical", "unknown"];
          return order.indexOf(a.severity) - order.indexOf(b.severity);
        }
        if (sortKey === "last-heal") {
          return (b.lastHealAt ?? "").localeCompare(a.lastHealAt ?? "");
        }
        return a.forkId.localeCompare(b.forkId);
      });

      if (opts.json) {
        console.log(JSON.stringify(summaries, null, 2));
        return;
      }

      if (summaries.length === 0) {
        console.log(pc.dim("  No forks match the given filters."));
        return;
      }

      console.log("");
      console.log(pc.bold("Registered Kit Forks") + pc.dim(`  ${summaries.length} total`));
      console.log(hr());
      console.log(renderForkTable(summaries));
      console.log("");
      console.log(hr());
    });

  // ── status ─────────────────────────────────────────────────────────────────
  parentCmd
    .command("status")
    .description("Detect drift + show policy evaluation + heal plan preview + next steps")
    .argument("<fork-id>", "Fork ID from list")
    .option("--policy-only", "Show only the fork's policy (skip drift detection)")
    .option("--no-upstream-check", "Use cached registration fields; do not query the upstream bundled kit")
    .option("--json", "Output raw JSON drift report")
    .action(async (forkId: string, opts: {
      policyOnly?: boolean;
      upstreamCheck?: boolean;
      json?: boolean;
    }) => {
      const reg = listKitForkRegistrations().find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        console.error(pc.dim("Hint: run `growthub kit fork list` to see registered forks."));
        process.exitCode = 1;
        return;
      }

      const policy = readKitForkPolicy(reg.forkPath);

      if (opts.policyOnly) {
        if (opts.json) {
          console.log(JSON.stringify(policy, null, 2));
          return;
        }
        console.log("");
        console.log(pc.bold(`Policy: ${reg.forkId}`));
        console.log(hr());
        console.log(`  ${pc.dim("autoApprove:")}           ${policy.autoApprove}`);
        console.log(`  ${pc.dim("autoApproveDepUpdates:")} ${policy.autoApproveDepUpdates}`);
        console.log(`  ${pc.dim("remoteSyncMode:")}        ${policy.remoteSyncMode}`);
        console.log(`  ${pc.dim("interactiveConflicts:")}  ${policy.interactiveConflicts}`);
        console.log(`  ${pc.dim("untouchablePaths:")}      [${policy.untouchablePaths.join(", ")}]`);
        console.log(`  ${pc.dim("confirmBeforeChange:")}   [${policy.confirmBeforeChange.join(", ")}]`);
        console.log(`  ${pc.dim("allowedScripts:")}        [${policy.allowedScripts.join(", ")}]`);
        console.log("");
        return;
      }

      if (opts.upstreamCheck === false) {
        if (opts.json) {
          console.log(JSON.stringify({ forkId: reg.forkId, kitId: reg.kitId, forkVersion: reg.baseVersion, policy }, null, 2));
          return;
        }
        console.log("");
        console.log(pc.bold(`Fork: ${reg.forkId}`) + "  " + pc.dim("(no upstream check)"));
        console.log(pc.dim(`Kit: ${reg.kitId}  v${reg.baseVersion}`));
        console.log(hr());
        console.log(`  ${pc.dim("Path:")}  ${reg.forkPath}`);
        console.log(`  ${pc.dim("Policy:")} autoApprove=${policy.autoApprove}, remoteSyncMode=${policy.remoteSyncMode}`);
        if (policy.untouchablePaths.length > 0) {
          console.log(`  ${pc.dim("Protected paths:")} ${policy.untouchablePaths.join(", ")}`);
        }
        console.log("");
        console.log(hr());
        printNextStepsAfterStatus(reg.forkId, true);
        return;
      }

      try {
        const report = detectKitForkDrift(reg);
        appendKitForkTraceEvent(reg.forkPath, {
          forkId: reg.forkId, kitId: reg.kitId, type: "status_ran",
          summary: `status inspected — severity=${report.overallSeverity}`,
        });

        if (opts.json) {
          const plan = buildKitForkHealPlan(report, { policy });
          console.log(JSON.stringify({ drift: report, plan, policy }, null, 2));
          return;
        }

        printDriftReport(report);

        const hasDrift = report.hasUpstreamUpdate || report.overallSeverity !== "none";
        if (hasDrift) {
          const plan = buildKitForkHealPlan(report, { policy });
          printRichHealPreview(plan, policy);
        }

        printNextStepsAfterStatus(reg.forkId, hasDrift);
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
    .option("--preview", "Rich grouped preview (safe additions / updates / protected / unresolved); does not write")
    .option("--dry-run", "Preview the plan without writing any files")
    .option("--background", "Dispatch as an async background job")
    .option("--skip <paths>", "Comma-separated relative paths to skip")
    .option("--json", "Output heal plan as JSON (implies --dry-run)")
    .action(async (forkId: string, opts: {
      preview?: boolean;
      dryRun?: boolean;
      background?: boolean;
      skip?: string;
      json?: boolean;
    }) => {
      const reg = listKitForkRegistrations().find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        console.error(pc.dim("Hint: run `growthub kit fork list` to see registered forks."));
        process.exitCode = 1;
        return;
      }

      const policy = readKitForkPolicy(reg.forkPath);

      if (opts.json) {
        const report = detectKitForkDrift(reg);
        const plan = buildKitForkHealPlan(report, { policy });
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      if (opts.preview) {
        const report = detectKitForkDrift(reg);
        const plan = buildKitForkHealPlan(report, { policy });
        appendKitForkTraceEvent(reg.forkPath, {
          forkId: reg.forkId, kitId: reg.kitId, type: "heal_proposed",
          summary: `preview requested — ${plan.actions.length} action(s), risk=${plan.estimatedRisk}`,
          detail: { mode: "preview" },
        });
        void captureEvent({
          event: "fork_sync_preview_started",
          properties: {
            funnel_stage: "expansion",
            fork_id_hash: hashForkId(reg.forkId),
            drift_severity: report.overallSeverity,
            heal_action_count: plan.actions.length,
            surface: "cli_flag",
          },
        });
        printRichHealPreview(plan, policy);

        if (plan.actions.length === 0) {
          console.log(pc.dim("  No actions needed. Fork is structurally clean."));
          return;
        }

        const decision = await p.select({
          message: "Apply this plan?",
          options: [
            { value: "apply", label: "▶  Yes, apply now", hint: "Run synchronously in this terminal" },
            { value: "background", label: "⚙️  Run in background", hint: "Dispatch as an async job" },
            { value: "cancel", label: "← No, cancel" },
          ],
        });
        if (p.isCancel(decision) || decision === "cancel") {
          console.log(pc.dim("  Cancelled. Plan was not applied."));
          console.log(pc.dim(`  Next: ${pc.cyan("growthub kit fork policy " + reg.forkId)}  or  ${pc.cyan("growthub kit fork heal " + reg.forkId)}`));
          return;
        }

        if (decision === "background") {
          const jobId = dispatchKitForkSyncJobBackground(reg.forkId, reg.kitId, {
            skipFiles: opts.skip?.split(",").map((s) => s.trim()),
          });
          console.log("");
          console.log(pc.green("  ✓ Background heal dispatched"));
          console.log(`  Job ID:  ${pc.cyan(jobId)}`);
          console.log(`  Watch:   ${pc.cyan("growthub kit fork jobs --watch " + jobId)}`);
          return;
        }

        // decision === "apply" — fall through to foreground run below
        opts.dryRun = false;
      }

      if (opts.background) {
        const jobId = dispatchKitForkSyncJobBackground(reg.forkId, reg.kitId, {
          dryRun: opts.dryRun,
          skipFiles: opts.skip?.split(",").map((s) => s.trim()),
        });
        console.log(pc.green("Background job dispatched:"), jobId);
        console.log(pc.dim(`  Watch:  growthub kit fork jobs --watch ${jobId}`));
        console.log(pc.dim(`  List:   growthub kit fork jobs`));
        return;
      }

      const flagHealStartedAt = Date.now();
      const job = await runKitForkSyncJob(reg.forkId, reg.kitId, {
        dryRun: opts.dryRun,
        skipFiles: opts.skip?.split(",").map((s) => s.trim()),
        onProgress: (step) => process.stderr.write(pc.dim(step) + "\n"),
      });

      if (!opts.dryRun) {
        void captureEvent({
          event: "fork_sync_heal_applied",
          properties: {
            funnel_stage: "expansion",
            fork_id_hash: hashForkId(reg.forkId),
            duration_ms: Date.now() - flagHealStartedAt,
            outcome: job.status === "completed" ? "success" : "failure",
            surface: "cli_flag",
          },
        });
      }

      const r = job.healResult;
      if (r) {
        console.log(pc.bold("Heal result:"));
        console.log(`  ${pc.green("Applied:")} ${r.appliedCount}  ${pc.dim("Skipped:")} ${r.skippedCount}  ${r.errorCount > 0 ? pc.red("Errors: " + r.errorCount) : pc.dim("Errors: 0")}`);
      }

      if (job.status === "failed") {
        console.error(pc.red("Heal failed: " + (job.error ?? "unknown error")));
        console.error(pc.dim(`  Review: growthub kit fork history ${reg.forkId}`));
        process.exitCode = 1;
      }
    });

  // ── jobs ───────────────────────────────────────────────────────────────────
  parentCmd
    .command("jobs")
    .description("List background fork-sync jobs, watch live progress, or tail a job's trace")
    .option("--fork <fork-id>", "Filter by fork ID")
    .option("--status <status>", "Filter by status (pending | running | completed | failed | cancelled | awaiting_confirmation)")
    .option("--filter <expr>", "Filter expression, e.g. status=running")
    .option("--watch <job-id>", "Poll the given job and print live progress until terminal")
    .option("--tail <job-id>", "Print trace events from the fork of the given job (default 50)")
    .option("--limit <n>", "Limit entries when using --tail (default 50)", (v) => parseInt(v, 10))
    .option("--json", "Output raw JSON")
    .action(async (opts: {
      fork?: string;
      status?: string;
      filter?: string;
      watch?: string;
      tail?: string;
      limit?: number;
      json?: boolean;
    }) => {
      if (opts.watch) {
        await watchJob(opts.watch, Boolean(opts.json));
        return;
      }

      if (opts.tail) {
        tailJobTrace(opts.tail, opts.limit ?? 50, Boolean(opts.json));
        return;
      }

      let effectiveStatus = opts.status;
      if (!effectiveStatus && opts.filter) {
        const [key, value] = opts.filter.split("=").map((s) => s.trim());
        if (key === "status" && value) effectiveStatus = value;
      }

      const jobs = listKitForkSyncJobs({
        forkId: opts.fork,
        status: effectiveStatus as KitForkSyncJob["status"] | undefined,
      });

      if (opts.json) { console.log(JSON.stringify(jobs, null, 2)); return; }
      if (jobs.length === 0) { console.log(pc.dim("  No jobs found.")); return; }

      console.log("");
      console.log(pc.bold("Kit Fork Sync Jobs") + pc.dim(`  ${jobs.length} total`));
      console.log(hr());
      console.log(renderJobTable(jobs));
      console.log("");
      console.log(hr());
      console.log(pc.dim("  Live progress: growthub kit fork jobs --watch <job-id>"));
      console.log(pc.dim("  Trace events:  growthub kit fork jobs --tail <job-id>"));
      console.log("");
    });

  // ── history (audit timeline) ──────────────────────────────────────────────
  parentCmd
    .command("history")
    .description("Export fork operation history from trace.jsonl")
    .argument("<fork-id>", "Fork ID from list")
    .option("--since <iso>", "ISO-8601 start date (inclusive)")
    .option("--until <iso>", "ISO-8601 end date (inclusive)")
    .option("--event-type <type>", "Filter by event type (e.g. heal_applied, policy_updated)")
    .option("--limit <n>", "Return at most N events (applied after filters)", (v) => parseInt(v, 10))
    .option("--json", "Emit machine-readable JSON")
    .option("--csv", "Emit CSV for compliance tools")
    .action((forkId: string, opts: {
      since?: string;
      until?: string;
      eventType?: string;
      limit?: number;
      json?: boolean;
      csv?: boolean;
    }) => {
      const reg = listKitForkRegistrations().find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        console.error(pc.dim("Hint: run `growthub kit fork list` to see registered forks."));
        process.exitCode = 1;
        return;
      }

      const all = readKitForkTrace(reg.forkPath);
      const sinceMs = opts.since ? new Date(opts.since).getTime() : undefined;
      const untilMs = opts.until ? new Date(opts.until).getTime() : undefined;

      let events = all.filter((e) => {
        const ts = new Date(e.timestamp).getTime();
        if (sinceMs !== undefined && ts < sinceMs) return false;
        if (untilMs !== undefined && ts > untilMs) return false;
        if (opts.eventType && e.type !== opts.eventType) return false;
        return true;
      });

      if (opts.limit && opts.limit > 0) {
        events = events.slice(-opts.limit);
      }

      if (opts.json) {
        console.log(JSON.stringify(events, null, 2));
        return;
      }

      if (opts.csv) {
        console.log("timestamp,forkId,kitId,jobId,type,summary");
        for (const e of events) {
          const summary = (e.summary ?? "").replace(/"/g, '""');
          console.log(`${e.timestamp},${e.forkId},${e.kitId},${e.jobId ?? ""},${e.type},"${summary}"`);
        }
        return;
      }

      console.log("");
      console.log(pc.bold(`Fork History: ${reg.forkId}`) + pc.dim(`  ${events.length} event(s)`));
      console.log(hr());
      if (events.length === 0) {
        console.log(pc.dim("  No matching events."));
        console.log("");
        return;
      }
      for (const e of events) {
        const ts = e.timestamp.replace("T", " ").replace(/\..+Z$/, "Z");
        console.log(`  ${pc.dim(ts)}  ${pc.cyan("[" + e.type + "]")}  ${e.summary ?? ""}`);
      }
      console.log("");
      console.log(hr());
      console.log("");
    });

  // ── authority ──────────────────────────────────────────────────────────────
  registerAuthoritySubcommands(parentCmd);

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

// ---------------------------------------------------------------------------
// Authority subcommands — `growthub kit fork authority ...`
// ---------------------------------------------------------------------------

function registerAuthoritySubcommands(parentCmd: Command): void {
  const authorityCmd = parentCmd
    .command("authority")
    .description("Inspect and manage hosted-authority attestations attached to a fork");

  // ── status ────────────────────────────────────────────────────────────────
  authorityCmd
    .command("status")
    .description("Show current authority attestation state for a fork")
    .argument("<fork-id>", "Fork ID from list")
    .option("--json", "Emit machine-readable JSON")
    .action((forkId: string, opts: { json?: boolean }) => {
      const reg = listKitForkRegistrations().find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        process.exitCode = 1;
        return;
      }
      const policy = readKitForkPolicy(reg.forkPath);
      const summary = describePolicyAttestation(reg.forkPath, policy, {
        expectedForkId: reg.forkId,
        expectedKitId: reg.kitId,
      });
      const state = readForkAuthorityState(reg.forkPath);

      if (opts.json) {
        console.log(JSON.stringify({ forkId: reg.forkId, kitId: reg.kitId, state, summary }, null, 2));
        return;
      }

      console.log("");
      console.log(pc.bold(`Authority: ${reg.forkId}`));
      console.log(hr());
      console.log(`  ${pc.dim("Origin:")}           ${originLabel(summary.origin)}`);
      if (summary.envelope) {
        const env = summary.envelope;
        console.log(`  ${pc.dim("Issuer:")}           ${env.issuerId}`);
        console.log(`  ${pc.dim("Envelope ID:")}      ${env.envelopeId}`);
        console.log(`  ${pc.dim("Issued at:")}        ${env.issuedAt}`);
        if (env.expiresAt) console.log(`  ${pc.dim("Expires at:")}       ${env.expiresAt}`);
        console.log(`  ${pc.dim("Capabilities:")}     ${env.grants.capabilities.join(", ") || pc.dim("(none)")}`);
        console.log(`  ${pc.dim("Policy attested:")}  ${env.grants.policyAttested ? "yes" : "no"}`);
        if (summary.policyHashMatches === true) {
          console.log(`  ${pc.dim("Policy hash:")}       ${pc.green("matches on-disk policy")}`);
        } else if (summary.policyHashMatches === false) {
          console.log(`  ${pc.dim("Policy hash:")}       ${pc.yellow("MISMATCH — policy changed since attestation")}`);
        }
        if (summary.verification && !summary.verification.ok) {
          console.log(`  ${pc.dim("Verification:")}      ${pc.red(summary.verification.reason)}${summary.verification.detail ? pc.dim(` (${summary.verification.detail})`) : ""}`);
        }
        if (summary.origin === "authority-revoked") {
          console.log(`  ${pc.dim("Revoked reason:")}   ${summary.revokedReason ?? pc.dim("(none)")}`);
        }
      } else {
        console.log(pc.dim("  No authority envelope attached. Operator-local policy in effect."));
      }
      console.log("");
    });

  // ── attest ────────────────────────────────────────────────────────────────
  authorityCmd
    .command("attest")
    .description("Attach a signed authority envelope to a fork")
    .argument("<fork-id>", "Fork ID from list")
    .requiredOption("--file <path>", "Path to a JSON file containing the envelope")
    .action((forkId: string, opts: { file: string }) => {
      const reg = listKitForkRegistrations().find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        process.exitCode = 1;
        return;
      }

      let raw: string;
      try {
        raw = fs.readFileSync(opts.file, "utf8");
      } catch (err) {
        console.error(pc.red(`Cannot read envelope file: ${(err as Error).message}`));
        process.exitCode = 1;
        return;
      }

      let envelope: AuthorityEnvelope;
      try {
        envelope = JSON.parse(raw) as AuthorityEnvelope;
      } catch (err) {
        console.error(pc.red(`Invalid JSON in envelope file: ${(err as Error).message}`));
        process.exitCode = 1;
        return;
      }

      try {
        const result = attachAuthorityEnvelope(reg.forkPath, envelope, {
          expectedForkId: reg.forkId,
          expectedKitId: reg.kitId,
        });
        appendKitForkTraceEvent(reg.forkPath, {
          forkId: reg.forkId,
          kitId: reg.kitId,
          type: "authority_attested",
          summary: `Authority envelope ${envelope.envelopeId} attached (issuer ${envelope.issuerId})`,
          detail: {
            envelopeId: envelope.envelopeId,
            issuerId: envelope.issuerId,
            capabilities: envelope.grants.capabilities,
            expiresAt: envelope.expiresAt ?? null,
          },
        });
        console.log(pc.green("Authority envelope attached:"), result.state.state);
        if (result.verification.ok) {
          console.log(pc.dim("  Issuer:     "), result.verification.issuer.id);
          console.log(pc.dim("  Capabilities:"), envelope.grants.capabilities.join(", ") || pc.dim("(none)"));
        }
      } catch (err) {
        console.error(pc.red((err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── revoke ────────────────────────────────────────────────────────────────
  authorityCmd
    .command("revoke")
    .description("Revoke the local authority attestation for a fork")
    .argument("<fork-id>", "Fork ID from list")
    .option("--reason <text>", "Why the attestation is being revoked")
    .action((forkId: string, opts: { reason?: string }) => {
      const reg = listKitForkRegistrations().find((f) => f.forkId === forkId);
      if (!reg) {
        console.error(pc.red(`Fork not found: ${forkId}`));
        process.exitCode = 1;
        return;
      }
      try {
        const next = revokeForkAuthority(reg.forkPath, opts.reason);
        appendKitForkTraceEvent(reg.forkPath, {
          forkId: reg.forkId,
          kitId: reg.kitId,
          type: "authority_revoked",
          summary: `Authority envelope ${next.state === "revoked" ? next.envelope.envelopeId : ""} revoked`,
          detail: { reason: opts.reason ?? null },
        });
        console.log(pc.yellow("Authority attestation revoked."));
        if (opts.reason) console.log(pc.dim("  Reason:"), opts.reason);
      } catch (err) {
        console.error(pc.red((err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── issuer list/add/remove ────────────────────────────────────────────────
  const issuerCmd = authorityCmd
    .command("issuer")
    .description("Manage trusted authority issuers (local trust root)");

  issuerCmd
    .command("list")
    .description("List trusted issuers from the local registry")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: { json?: boolean }) => {
      const reg = readIssuerRegistry();
      if (opts.json) {
        console.log(JSON.stringify(reg, null, 2));
        return;
      }
      console.log("");
      console.log(pc.bold("Trusted Authority Issuers"));
      console.log(hr());
      if (reg.issuers.length === 0) {
        console.log(pc.dim("  No issuers trusted. Add one with `growthub kit fork authority issuer add`."));
      } else {
        for (const i of reg.issuers) {
          console.log(`  ${pc.cyan(i.id)}  ${pc.dim(`[${i.kind}]`)}${i.label ? `  ${i.label}` : ""}`);
          if (i.addedAt) console.log(`    ${pc.dim("added:")} ${i.addedAt}`);
        }
      }
      console.log("");
    });

  issuerCmd
    .command("add")
    .description("Add or replace a trusted issuer in the local registry")
    .requiredOption("--id <id>", "Issuer ID (must match envelope.issuerId)")
    .requiredOption("--kind <kind>", "Issuer kind: growthub-hosted | self-signed | enterprise")
    .requiredOption("--key <path>", "Path to a PEM-encoded ed25519 public key file")
    .option("--label <label>", "Human-readable label")
    .action((opts: { id: string; kind: string; key: string; label?: string }) => {
      const kinds: AuthorityIssuerKind[] = ["growthub-hosted", "self-signed", "enterprise"];
      if (!kinds.includes(opts.kind as AuthorityIssuerKind)) {
        console.error(pc.red(`Invalid --kind: ${opts.kind}. Expected one of ${kinds.join(", ")}.`));
        process.exitCode = 1;
        return;
      }
      let pem: string;
      try {
        pem = fs.readFileSync(opts.key, "utf8");
      } catch (err) {
        console.error(pc.red(`Cannot read key file: ${(err as Error).message}`));
        process.exitCode = 1;
        return;
      }
      try {
        upsertIssuer({
          id: opts.id,
          kind: opts.kind as AuthorityIssuerKind,
          publicKeyPem: pem,
          label: opts.label,
        });
        console.log(pc.green("Issuer added:"), opts.id);
      } catch (err) {
        console.error(pc.red((err as Error).message));
        process.exitCode = 1;
      }
    });

  issuerCmd
    .command("remove")
    .description("Remove a trusted issuer from the local registry")
    .requiredOption("--id <id>", "Issuer ID to remove")
    .action((opts: { id: string }) => {
      const ok = removeIssuer(opts.id);
      if (ok) console.log(pc.green("Issuer removed:"), opts.id);
      else {
        console.error(pc.red(`No issuer with id: ${opts.id}`));
        process.exitCode = 1;
      }
    });
}

function originLabel(origin: "operator-local" | "authority-attested" | "authority-revoked"): string {
  switch (origin) {
    case "authority-attested": return pc.green("authority-attested");
    case "authority-revoked":  return pc.yellow("authority-revoked");
    default:                    return pc.dim("operator-local");
  }
}
