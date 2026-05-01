/**
 * `growthub workspace improve` — Self-Improving Workspace CLI surface.
 *
 * Manages the governed capability proposal → promote lifecycle:
 *
 *   growthub workspace improve propose --from-run <id> [--json]
 *   growthub workspace improve list [--json]
 *   growthub workspace improve inspect <slug> [--json]
 *   growthub workspace improve promote <slug> [--json]
 *   growthub workspace improve reject <slug> [--reason <text>] [--json]
 *
 * All writes are inside `.growthub-fork/capabilities/` — governed boundary.
 * Execution stays hosted; this command composes and governs locally only.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import path from "node:path";
import { track } from "../analytics/posthog.js";
import {
  proposeCapability,
  promoteCapability,
  rejectCapability,
  listProposals,
  inspectProposal,
} from "../runtime/self-improving/proposals.js";
import { renderTable } from "../utils/table-renderer.js";

function resolveForkPath(optFork: string | undefined): string {
  if (optFork) return path.resolve(optFork);
  return process.cwd();
}

// ---------------------------------------------------------------------------
// propose
// ---------------------------------------------------------------------------

async function runPropose(opts: {
  fromRun: string;
  fork?: string;
  slug?: string;
  summary?: string;
  agentSlug?: string;
  workflowId?: string;
  json?: boolean;
}): Promise<void> {
  const forkPath = resolveForkPath(opts.fork);

  const s = p.spinner();
  if (!opts.json) s.start(`Proposing capability from run ${pc.cyan(opts.fromRun)} …`);

  let result: ReturnType<typeof proposeCapability>;
  try {
    result = proposeCapability({
      forkPath,
      fromRunId: opts.fromRun,
      slug: opts.slug,
      summary: opts.summary,
      agentSlug: opts.agentSlug,
      workflowId: opts.workflowId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    s.stop(pc.red("Failed."));
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  track("workspace_improve_proposed", { slug: result.proposal.proposedSlug });

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
    return;
  }

  s.stop(pc.green("Capability proposed."));
  console.log("");
  console.log(`  ${pc.bold("Slug:")}     ${pc.cyan(result.proposal.proposedSlug)}`);
  console.log(`  ${pc.bold("File:")}     ${path.relative(process.cwd(), result.filePath)}`);
  console.log(`  ${pc.bold("Summary:")} ${result.proposal.summary}`);
  console.log("");
  console.log(pc.dim(`  Review:  growthub workspace improve inspect ${result.proposal.proposedSlug}`));
  console.log(pc.dim(`  Promote: growthub workspace improve promote ${result.proposal.proposedSlug}`));
  console.log("");
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

function runList(opts: {
  fork?: string;
  status?: string;
  json?: boolean;
}): void {
  const forkPath = resolveForkPath(opts.fork);
  const statusFilter = opts.status as ("proposed" | "promoted" | "rejected" | "reviewed") | undefined;

  const proposals = listProposals(forkPath, { status: statusFilter });

  if (opts.json) {
    console.log(JSON.stringify(proposals, null, 2));
    return;
  }

  if (proposals.length === 0) {
    console.log(pc.dim("No capability proposals found."));
    console.log(pc.dim("Run: growthub workspace improve propose --from-run <run-id>"));
    return;
  }

  console.log("");
  console.log(pc.bold(`Capability Proposals`) + pc.dim(`  ${proposals.length} total`));
  console.log(pc.dim("─".repeat(72)));
  console.log(renderTable({
    columns: [
      { key: "slug", label: "slug", maxWidth: 36 },
      { key: "status", label: "status", maxWidth: 12 },
      { key: "createdAt", label: "created", maxWidth: 24 },
      { key: "summary", label: "summary", maxWidth: 48 },
    ],
    rows: proposals.map((p) => ({
      slug: p.slug,
      status: p.status,
      createdAt: p.createdAt.slice(0, 16).replace("T", " "),
      summary: p.summary,
    })),
  }));
  console.log("");
  console.log(pc.dim(`  growthub workspace improve inspect <slug>  ·  growthub workspace improve promote <slug>`));
  console.log("");
}

// ---------------------------------------------------------------------------
// inspect
// ---------------------------------------------------------------------------

function runInspect(slug: string, opts: { fork?: string; json?: boolean }): void {
  const forkPath = resolveForkPath(opts.fork);
  const proposal = inspectProposal(forkPath, slug);

  if (!proposal) {
    const msg = `No proposal found for slug "${slug}". Run: growthub workspace improve list`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "not-found", slug }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }

  const kv = (label: string, value: string) =>
    console.log(`  ${pc.bold(label.padEnd(24))} ${value}`);

  console.log("");
  console.log(pc.bold(`Proposal: ${proposal.proposedSlug}`));
  console.log(pc.dim("─".repeat(72)));
  kv("Status:", proposal.status);
  kv("Summary:", proposal.summary);
  kv("From run:", proposal.fromRunId);
  if (proposal.workflowId) kv("Workflow:", proposal.workflowId);
  if (proposal.agentSlug) kv("Agent:", proposal.agentSlug);
  kv("Created:", proposal.createdAt);
  kv("Trace event at:", proposal.traceEventTimestamp);
  kv("Memory obs ID:", String(proposal.memoryObservationId));
  if (proposal.promotedAt) kv("Promoted:", proposal.promotedAt);
  if (proposal.rejectedAt) kv("Rejected:", proposal.rejectedAt);
  if (proposal.rejectionReason) kv("Rejection reason:", proposal.rejectionReason);
  if (proposal.candidatePipelineNodes.length > 0) {
    console.log(`\n  ${pc.bold("Candidate nodes:")}`);
    for (const n of proposal.candidatePipelineNodes) {
      console.log(`    ${pc.dim("·")} ${n.slug} — ${n.reason}`);
    }
  }
  console.log("");
  if (proposal.status === "proposed" || proposal.status === "reviewed") {
    console.log(pc.dim(`  Promote: growthub workspace improve promote ${proposal.proposedSlug}`));
    console.log(pc.dim(`  Reject:  growthub workspace improve reject ${proposal.proposedSlug}`));
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// promote
// ---------------------------------------------------------------------------

async function runPromote(
  slug: string,
  opts: { fork?: string; yes?: boolean; json?: boolean },
): Promise<void> {
  const forkPath = resolveForkPath(opts.fork);

  if (!opts.yes && !opts.json) {
    const confirmed = await p.confirm({
      message: `Promote capability "${pc.cyan(slug)}" to active library?`,
      initialValue: true,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Promotion cancelled.");
      process.exit(0);
    }
  }

  const s = p.spinner();
  if (!opts.json) s.start(`Promoting ${pc.cyan(slug)} …`);

  let result: ReturnType<typeof promoteCapability>;
  try {
    result = promoteCapability(forkPath, slug);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    s.stop(pc.red("Failed."));
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  track("workspace_improve_promoted", { slug });

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
    return;
  }

  s.stop(pc.green(`Capability "${slug}" promoted.`));
  console.log("");
  console.log(`  ${pc.bold("Promoted to:")} ${path.relative(process.cwd(), result.promotedPath)}`);
  console.log(`  ${pc.dim("Trace event appended to .growthub-fork/trace.jsonl")}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// reject
// ---------------------------------------------------------------------------

function runReject(
  slug: string,
  opts: { fork?: string; reason?: string; json?: boolean },
): void {
  const forkPath = resolveForkPath(opts.fork);

  let result: ReturnType<typeof rejectCapability>;
  try {
    result = rejectCapability(forkPath, slug, opts.reason);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  track("workspace_improve_rejected", { slug });

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", slug, rejectedAt: result.rejectedAt }));
    return;
  }

  console.log(pc.yellow(`Proposal "${slug}" rejected.`));
  if (opts.reason) console.log(pc.dim(`  Reason: ${opts.reason}`));
  console.log("");
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkspaceImproveCommands(program: Command): Command {
  const workspace = program
    .command("workspace")
    .description("Governed workspace operations — deploy status, self-improving loop, capability proposals");

  const improve = workspace
    .command("improve")
    .description("Manage the self-improving capability proposal lifecycle")
    .addHelpText("after", `
Examples:
  $ growthub workspace improve propose --from-run demo
  $ growthub workspace improve list
  $ growthub workspace improve inspect weekly-meta-summary
  $ growthub workspace improve promote weekly-meta-summary
  $ growthub workspace improve reject weekly-meta-summary --reason "too narrow"
`);

  improve
    .command("propose")
    .description("Propose a new reusable capability from a pipeline run")
    .requiredOption("--from-run <run-id>", "Pipeline or orchestrator run ID this proposal is derived from")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--slug <slug>", "Override the generated proposal slug")
    .option("--summary <text>", "One-line summary of the proposed capability")
    .option("--agent-slug <slug>", "Agent that produced the run")
    .option("--workflow-id <id>", "Workflow that produced the run")
    .option("--json", "Emit machine-readable JSON")
    .action(async (opts: {
      fromRun: string;
      fork?: string;
      slug?: string;
      summary?: string;
      agentSlug?: string;
      workflowId?: string;
      json?: boolean;
    }) => {
      await runPropose(opts);
    });

  improve
    .command("list")
    .description("List capability proposals and their status")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--status <status>", "Filter by status: proposed | reviewed | promoted | rejected")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: { fork?: string; status?: string; json?: boolean }) => {
      runList(opts);
    });

  improve
    .command("inspect")
    .description("Inspect a capability proposal in full")
    .argument("<slug>", "Proposal slug")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--json", "Emit machine-readable JSON")
    .action((slug: string, opts: { fork?: string; json?: boolean }) => {
      runInspect(slug, opts);
    });

  improve
    .command("promote")
    .description("Promote a proposal to the active capabilities library")
    .argument("<slug>", "Proposal slug")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--yes", "Skip confirmation prompt")
    .option("--json", "Emit machine-readable JSON")
    .action(async (slug: string, opts: { fork?: string; yes?: boolean; json?: boolean }) => {
      await runPromote(slug, opts);
    });

  improve
    .command("reject")
    .description("Reject a proposal (soft delete — kept in proposals dir with rejected status)")
    .argument("<slug>", "Proposal slug")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--reason <text>", "Rejection reason")
    .option("--json", "Emit machine-readable JSON")
    .action((slug: string, opts: { fork?: string; reason?: string; json?: boolean }) => {
      runReject(slug, opts);
    });

  return workspace;
}
