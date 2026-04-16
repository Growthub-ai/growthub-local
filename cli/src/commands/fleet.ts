/**
 * `growthub fleet` — fleet-level fork operations.
 *
 * Thin command layer over cli/src/fleet/. No new state, no new transport,
 * no new auth — every verb is a view or a plan-generator over already-durable
 * in-fork state.
 *
 * Verbs:
 *   growthub fleet view            fleet health grid
 *   growthub fleet drift           aggregated drift across fleet
 *   growthub fleet drift-summary   per-fork artifact/path-level drift (human-readable)
 *   growthub fleet policy          policy visibility matrix across forks
 *   growthub fleet approvals       approval queue of awaiting_confirmation jobs
 *   growthub fleet agent-plan      agent-led heal plan document for one fork
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { listKitForkRegistrations } from "../kits/fork-registry.js";
import { buildFleetSummary, buildForkSummary } from "../fleet/summary.js";
import { buildDriftArtifactSummary, summariseArtifactSummaryAsNarrative } from "../fleet/drift-summary.js";
import { buildApprovalQueue } from "../fleet/approvals.js";
import { buildAgentHealPlanDocument } from "../fleet/agent-plan.js";
import { detectKitForkDrift, buildKitForkHealPlan } from "../kits/fork-sync.js";
import { readKitForkPolicy } from "../kits/fork-policy.js";
import type { ForkHealthLevel, ForkSummary } from "../fleet/types.js";

function healthGlyph(level: ForkHealthLevel): string {
  switch (level) {
    case "clean":
      return pc.green("●");
    case "drift-minor":
      return pc.cyan("●");
    case "drift-major":
      return pc.yellow("●");
    case "awaiting-confirmation":
      return pc.magenta("◐");
    case "error":
      return pc.red("●");
    default:
      return pc.dim("○");
  }
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ---------------------------------------------------------------------------
// fleet view
// ---------------------------------------------------------------------------

export async function fleetView(opts: { json?: boolean }): Promise<void> {
  const fleet = buildFleetSummary();
  if (opts.json) {
    console.log(JSON.stringify(fleet, null, 2));
    return;
  }

  p.log.message(
    `Fleet: ${pc.cyan(String(fleet.totalForks))} fork(s)  |  ` +
    `remote=${fleet.forksWithRemote}  ` +
    `awaiting=${fleet.forksAwaitingConfirmation}  ` +
    `pending-approvals=${fleet.pendingApprovalCount}`,
  );
  p.log.message(
    `  Health → clean=${fleet.byHealth.clean}  ` +
    `drift-minor=${fleet.byHealth["drift-minor"]}  ` +
    `drift-major=${fleet.byHealth["drift-major"]}  ` +
    `awaiting=${fleet.byHealth["awaiting-confirmation"]}  ` +
    `error=${fleet.byHealth.error}  unknown=${fleet.byHealth.unknown}`,
  );
  if (fleet.forks.length === 0) {
    p.log.info("No forks registered yet. Run `growthub kit fork register` or `growthub starter init`.");
    return;
  }
  for (const f of fleet.forks) renderForkRow(f);
}

function renderForkRow(f: ForkSummary): void {
  const label = truncate(f.label ?? f.forkId, 28).padEnd(28);
  const kit = truncate(f.kitId, 34).padEnd(34);
  const base = f.baseVersion.padEnd(8);
  const upstream = (f.upstreamVersion ?? "?").padEnd(8);
  const driftCounts = `files=${f.fileDriftCount} pkgs=${f.packageDriftCount}`;
  const pending = f.pendingConfirmationJobs > 0
    ? pc.magenta(` awaits=${f.pendingConfirmationJobs}`)
    : "";
  const remote = f.remote ? pc.dim(` ${f.remote.owner}/${f.remote.repo}`) : "";
  p.log.message(
    `  ${healthGlyph(f.health)} ${label}  ${pc.dim(kit)}  ${base} → ${upstream}  ${pc.dim(driftCounts)}${pending}${remote}`,
  );
}

// ---------------------------------------------------------------------------
// fleet drift — aggregated
// ---------------------------------------------------------------------------

export async function fleetDrift(opts: { json?: boolean }): Promise<void> {
  const fleet = buildFleetSummary();
  const withDrift = fleet.forks.filter((f) => f.hasUpstreamUpdate || f.driftSeverity !== "none");

  if (opts.json) {
    console.log(JSON.stringify({
      totalDriftingForks: withDrift.length,
      bySeverity: fleet.bySeverity,
      forks: withDrift,
    }, null, 2));
    return;
  }

  p.log.message(
    `Fleet drift: ${pc.cyan(String(withDrift.length))} of ${fleet.totalForks} fork(s) have drift.`,
  );
  p.log.message(
    `  By severity → none=${fleet.bySeverity.none}  ` +
    `info=${fleet.bySeverity.info}  warning=${fleet.bySeverity.warning}  critical=${fleet.bySeverity.critical}`,
  );
  for (const f of withDrift) renderForkRow(f);
  if (withDrift.length === 0) p.log.success("No drift detected across the fleet.");
}

// ---------------------------------------------------------------------------
// fleet drift-summary — per-fork artifact/path-level human-readable breakdown
// ---------------------------------------------------------------------------

export async function fleetDriftSummary(opts: { forkId: string; json?: boolean }): Promise<void> {
  const reg = listKitForkRegistrations().find((r) => r.forkId === opts.forkId);
  if (!reg) throw new Error(`Fork not found: ${opts.forkId}`);

  const policy = readKitForkPolicy(reg.forkPath);
  const report = detectKitForkDrift(reg);
  const plan = buildKitForkHealPlan(report, { policy });
  const summary = buildDriftArtifactSummary(report, plan, policy);
  const narrative = summariseArtifactSummaryAsNarrative(summary);

  if (opts.json) {
    console.log(JSON.stringify({ summary, narrative }, null, 2));
    return;
  }

  p.log.message(pc.cyan(`Drift summary — ${reg.forkId}  (${summary.fromVersion} → ${summary.toVersion})`));
  for (const line of narrative) p.log.message(`  ${line}`);

  const sections: Array<[string, Array<{ path: string; note: string }>]> = [
    ["safe additions", summary.buckets.safeAdditions],
    ["safe updates", summary.buckets.safeUpdates],
    ["needs confirmation", summary.buckets.needsConfirmation],
    ["preserved (user modified)", summary.buckets.skippedUserModified],
    ["untouchable (policy)", summary.buckets.skippedUntouchable],
    ["custom skills", summary.buckets.customSkills],
    ["upstream deletions (unresolved)", summary.buckets.unresolvedUpstreamDeletion],
  ];
  for (const [label, items] of sections) {
    if (items.length === 0) continue;
    p.log.message(pc.dim(`  — ${label} (${items.length}) —`));
    for (const item of items) p.log.message(`    · ${item.path}  ${pc.dim(item.note)}`);
  }
  if (summary.buckets.packageAdditions.length || summary.buckets.packageUpgrades.length) {
    p.log.message(pc.dim(`  — dependency drift —`));
    for (const d of summary.buckets.packageAdditions) {
      p.log.message(`    + ${d.packageName}@${d.toVersion}  ${pc.dim("(added upstream)")}`);
    }
    for (const d of summary.buckets.packageUpgrades) {
      p.log.message(`    ↑ ${d.packageName}  ${d.fromVersion ?? "?"} → ${d.toVersion}`);
    }
  }
}

// ---------------------------------------------------------------------------
// fleet policy — visibility matrix
// ---------------------------------------------------------------------------

export async function fleetPolicy(opts: { json?: boolean }): Promise<void> {
  const regs = listKitForkRegistrations();
  const rows = regs.map((r) => {
    const summary = buildForkSummary(r);
    return {
      forkId: r.forkId,
      label: r.label,
      kitId: r.kitId,
      autoApprove: summary.autoApprove,
      autoApproveDepUpdates: summary.autoApproveDepUpdates,
      remoteSyncMode: summary.remoteSyncMode,
      untouchableCount: summary.untouchableCount,
      hasRemote: Boolean(summary.remote),
    };
  });

  if (opts.json) {
    console.log(JSON.stringify({ count: rows.length, rows }, null, 2));
    return;
  }

  p.log.message(pc.cyan(`Fleet policy matrix (${rows.length} fork(s))`));
  for (const r of rows) {
    const label = truncate(r.label ?? r.forkId, 28).padEnd(28);
    const aa = r.autoApprove.padEnd(9);
    const ad = r.autoApproveDepUpdates.padEnd(9);
    const rs = r.remoteSyncMode.padEnd(6);
    const ut = String(r.untouchableCount).padStart(3);
    const remote = r.hasRemote ? pc.green("+") : pc.dim("·");
    p.log.message(
      `  ${label}  autoApprove=${aa}  deps=${ad}  remote=${rs}  untouchable=${ut}  ${remote}`,
    );
  }
}

// ---------------------------------------------------------------------------
// fleet approvals — queue of parked jobs
// ---------------------------------------------------------------------------

export async function fleetApprovals(opts: { json?: boolean }): Promise<void> {
  const queue = buildApprovalQueue();
  if (opts.json) {
    console.log(JSON.stringify({ count: queue.length, queue }, null, 2));
    return;
  }
  if (queue.length === 0) {
    p.log.success("Approval queue is empty.");
    return;
  }
  p.log.message(pc.cyan(`Approval queue: ${queue.length} job(s) awaiting confirmation`));
  for (const entry of queue) {
    p.log.message(
      `  · ${pc.cyan(entry.jobId)}  fork=${entry.forkLabel ?? entry.forkId}  created=${entry.createdAt.slice(0, 19)}`,
    );
    for (const path of entry.pendingPaths.slice(0, 6)) {
      p.log.message(`      ${pc.dim("awaits")} ${path}`);
    }
    if (entry.pendingPaths.length > 6) {
      p.log.message(`      ${pc.dim(`… +${entry.pendingPaths.length - 6} more`)}`);
    }
    p.log.message(
      `      ${pc.dim("resume:")} growthub kit fork confirm --job-id ${entry.jobId}`,
    );
  }
}

// ---------------------------------------------------------------------------
// fleet agent-plan — agent-led heal plan document
// ---------------------------------------------------------------------------

export async function fleetAgentPlan(opts: {
  forkId: string;
  json?: boolean;
  captureInTrace?: boolean;
}): Promise<void> {
  const reg = listKitForkRegistrations().find((r) => r.forkId === opts.forkId);
  if (!reg) throw new Error(`Fork not found: ${opts.forkId}`);

  const doc = buildAgentHealPlanDocument(reg, { captureInTrace: opts.captureInTrace !== false });

  if (opts.json) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }

  p.log.message(pc.cyan(`Agent heal plan — ${reg.forkId}`));
  p.log.message(`  ${doc.summary}`);
  for (const line of doc.narrative) p.log.message(`    ${line}`);
  if (doc.awaitsConfirmation.length > 0) {
    p.log.message(pc.magenta(`  Awaiting confirmation on:`));
    for (const p2 of doc.awaitsConfirmation) p.log.message(`    · ${p2}`);
    p.log.message(
      pc.dim(
        `  Next: growthub kit fork heal ${reg.forkId}  (will park in awaiting_confirmation until resumed)`,
      ),
    );
  } else if (doc.plan.actions.length > 0) {
    p.log.message(
      pc.dim(`  Next: growthub kit fork heal ${reg.forkId}  (${doc.plan.actions.length} safe action(s) ready)`),
    );
  }
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerFleetCommands(program: Command): void {
  const fleet = program
    .command("fleet")
    .description("Fleet-level fork operations — view, drift, policy matrix, approvals, agent-led plans.");

  fleet
    .command("view")
    .description("Fleet health grid — one row per registered fork.")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => { await fleetView(opts); });

  fleet
    .command("drift")
    .description("Aggregated drift summary across every registered fork.")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => { await fleetDrift(opts); });

  fleet
    .command("drift-summary")
    .description("Per-fork artifact/path-level drift breakdown (human-readable).")
    .requiredOption("--fork-id <id>", "Registered fork id")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => { await fleetDriftSummary({ forkId: opts.forkId, json: opts.json }); });

  fleet
    .command("policy")
    .description("Visibility matrix of per-fork policy across the fleet.")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => { await fleetPolicy(opts); });

  fleet
    .command("approvals")
    .description("Approval queue — jobs parked in awaiting_confirmation.")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => { await fleetApprovals(opts); });

  fleet
    .command("agent-plan")
    .description("Agent-led heal plan document for a fork (inspects drift, drafts plan, captures in trace).")
    .requiredOption("--fork-id <id>", "Registered fork id")
    .option("--no-capture-in-trace", "Do not append an agent_checkpoint event to trace.jsonl")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await fleetAgentPlan({
        forkId: opts.forkId,
        json: opts.json,
        captureInTrace: opts.captureInTrace !== false,
      });
    });
}
