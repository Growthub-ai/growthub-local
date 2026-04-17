/**
 * Extended kit-fork verbs: remote GitHub integration + policy + trace + confirm.
 *
 * Keeps the base `cli/src/commands/kit-fork.ts` focused on the local
 * subcommand surface; this module adds the production-grade advanced surface
 * that PR #87's Self-Healing Fork Sync Agent v1 requires.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import {
  registerKitFork,
  loadKitForkRegistration,
  updateKitForkRegistration,
  listKitForkRegistrations,
} from "../kits/fork-registry.js";
import {
  readKitForkPolicy,
  writeKitForkPolicy,
  updateKitForkPolicy,
} from "../kits/fork-policy.js";
import { readKitForkTrace, tailKitForkTrace, appendKitForkTraceEvent } from "../kits/fork-trace.js";
import {
  gitAvailable,
  isGitRepo,
  initGitRepo,
  setOrigin,
  buildTokenCloneUrl,
} from "../kits/fork-remote.js";
import { confirmAndResumeJob, getKitForkSyncJob } from "../kits/fork-sync-agent.js";
import { resolveGithubAccessToken } from "../integrations/github-resolver.js";
import { createFork, parseRepoRef } from "../github/client.js";
import { copyBundledKitSource, getBundledKitSourceInfo } from "../kits/service.js";
import type { KitForkRemoteBinding } from "../kits/fork-types.js";

async function requireGithubToken(): Promise<string> {
  const resolved = await resolveGithubAccessToken();
  if (!resolved) {
    throw new Error(
      "GitHub is not authenticated. Either run `growthub github login` or " +
      "connect GitHub inside your Growthub account (via the gh-app) and run `growthub login`.",
    );
  }
  return resolved.accessToken;
}

// ---------------------------------------------------------------------------
// create — one-click: fork on GitHub + clone bundled kit assets + register
// ---------------------------------------------------------------------------

export interface KitForkCreateOptions {
  kit: string;
  upstream: string;
  out: string;
  forkName?: string;
  destinationOrg?: string;
  json?: boolean;
}

export async function kitForkCreate(opts: KitForkCreateOptions): Promise<void> {
  const accessToken = await requireGithubToken();
  const upstream = parseRepoRef(opts.upstream);
  const absOut = path.resolve(opts.out);

  if (fs.existsSync(absOut) && fs.readdirSync(absOut).length > 0) {
    throw new Error(`Destination ${absOut} already exists and is not empty.`);
  }

  p.log.step(`Forking ${upstream.owner}/${upstream.repo} on GitHub...`);
  const forkResult = await createFork(accessToken, {
    upstream,
    forkName: opts.forkName,
    destinationOrg: opts.destinationOrg,
  });

  p.log.step(`Materializing bundled kit '${opts.kit}' at ${absOut}...`);
  const info = getBundledKitSourceInfo(opts.kit);
  copyBundledKitSource(opts.kit, absOut);

  if (!gitAvailable()) {
    throw new Error("git is not available on PATH — required for fork-sync remote operations.");
  }
  if (!isGitRepo(absOut)) {
    initGitRepo(absOut);
  }
  const cloneWithToken = buildTokenCloneUrl(forkResult.fork, accessToken);
  setOrigin(absOut, cloneWithToken);

  const reg = registerKitFork({
    forkPath: absOut,
    kitId: info.id,
    baseVersion: info.version,
    label: `${forkResult.fork.owner}/${forkResult.fork.repo}`,
  });
  const remote: KitForkRemoteBinding = {
    provider: "github",
    owner: forkResult.fork.owner,
    repo: forkResult.fork.repo,
    defaultBranch: forkResult.defaultBranch,
    cloneUrl: forkResult.cloneUrl,
    htmlUrl: forkResult.htmlUrl,
  };
  updateKitForkRegistration({ ...reg, remote });
  appendKitForkTraceEvent(absOut, {
    forkId: reg.forkId, kitId: reg.kitId, type: "registered",
    summary: `Created via one-click: ${forkResult.fork.owner}/${forkResult.fork.repo}`,
    detail: { htmlUrl: forkResult.htmlUrl, upstream: `${upstream.owner}/${upstream.repo}` },
  });
  appendKitForkTraceEvent(absOut, {
    forkId: reg.forkId, kitId: reg.kitId, type: "remote_connected",
    summary: `Remote origin set to ${forkResult.htmlUrl}`,
  });

  if (opts.json) {
    console.log(JSON.stringify({
      status: "ok",
      forkId: reg.forkId,
      kitId: reg.kitId,
      forkPath: absOut,
      remote,
    }, null, 2));
    return;
  }
  p.outro(
    `Fork ready at ${pc.cyan(absOut)} — remote: ${pc.cyan(forkResult.htmlUrl)}.\n` +
    `Next: ${pc.dim("growthub kit fork status " + reg.forkId)}.`,
  );
}

// ---------------------------------------------------------------------------
// connect — bind an existing local fork to an existing GitHub repo
// ---------------------------------------------------------------------------

export interface KitForkConnectOptions {
  forkId: string;
  remote: string;
  defaultBranch?: string;
  json?: boolean;
}

export async function kitForkConnect(opts: KitForkConnectOptions): Promise<void> {
  const token = await requireGithubToken();
  const repo = parseRepoRef(opts.remote);

  const reg = findRegistrationOrThrow(opts.forkId);
  if (!gitAvailable()) throw new Error("git is not available on PATH.");
  if (!isGitRepo(reg.forkPath)) initGitRepo(reg.forkPath);
  setOrigin(reg.forkPath, buildTokenCloneUrl(repo, token));

  const remote: KitForkRemoteBinding = {
    provider: "github",
    owner: repo.owner,
    repo: repo.repo,
    defaultBranch: opts.defaultBranch?.trim() || "main",
    cloneUrl: `https://github.com/${repo.owner}/${repo.repo}.git`,
    htmlUrl: `https://github.com/${repo.owner}/${repo.repo}`,
  };
  updateKitForkRegistration({ ...reg, remote });
  appendKitForkTraceEvent(reg.forkPath, {
    forkId: reg.forkId, kitId: reg.kitId, type: "remote_connected",
    summary: `Connected to ${repo.owner}/${repo.repo}`,
  });

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", forkId: reg.forkId, remote }, null, 2));
  } else {
    p.log.success(`Connected fork ${pc.cyan(reg.forkId)} to ${pc.cyan(`${repo.owner}/${repo.repo}`)}.`);
  }
}

// ---------------------------------------------------------------------------
// policy — view / edit per-fork policy
// ---------------------------------------------------------------------------

export interface KitForkPolicyOptions {
  forkId: string;
  set?: string[]; // e.g. ["autoApprove=none", "remoteSyncMode=pr", "untouchablePaths+=skills/mine.md"]
  edit?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export async function kitForkPolicyCommand(opts: KitForkPolicyOptions): Promise<void> {
  const reg = findRegistrationOrThrow(opts.forkId);
  let policy = readKitForkPolicy(reg.forkPath);
  const before = JSON.parse(JSON.stringify(policy)) as typeof policy;

  if (opts.set && opts.set.length > 0) {
    for (const entry of opts.set) {
      policy = applyPolicyAssignment(policy, entry);
    }
    if (!opts.dryRun) {
      writeKitForkPolicy(reg.forkPath, policy);
      appendKitForkTraceEvent(reg.forkPath, {
        forkId: reg.forkId, kitId: reg.kitId, type: "policy_updated",
        summary: `Policy updated via CLI: ${opts.set.join(", ")}`,
        detail: { changedFields: diffPolicyFields(before, policy) },
      });
    }
  }

  if (opts.edit) {
    const next = await runInteractivePolicyEditor(reg.forkId, policy);
    if (!next) {
      p.log.info("Policy edit cancelled — no changes written.");
      return;
    }
    policy = next;
    if (!opts.dryRun) {
      writeKitForkPolicy(reg.forkPath, policy);
      appendKitForkTraceEvent(reg.forkPath, {
        forkId: reg.forkId, kitId: reg.kitId, type: "policy_updated",
        summary: `Policy updated via interactive editor`,
        detail: { changedFields: diffPolicyFields(before, policy) },
      });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(policy, null, 2));
    return;
  }

  if (opts.dryRun) {
    p.log.info(`${pc.yellow("Dry run — no changes written.")} Preview below:`);
  }

  p.log.message(
    `Policy for fork ${pc.cyan(reg.forkId)}:\n` +
    `  autoApprove:            ${policy.autoApprove}\n` +
    `  autoApproveDepUpdates:  ${policy.autoApproveDepUpdates}\n` +
    `  remoteSyncMode:         ${policy.remoteSyncMode}\n` +
    `  interactiveConflicts:   ${policy.interactiveConflicts}\n` +
    `  untouchablePaths:       [${policy.untouchablePaths.join(", ")}]\n` +
    `  confirmBeforeChange:    [${policy.confirmBeforeChange.join(", ")}]\n` +
    `  allowedScripts:         [${policy.allowedScripts.join(", ")}]`,
  );
}

function diffPolicyFields(
  before: ReturnType<typeof readKitForkPolicy>,
  after: ReturnType<typeof readKitForkPolicy>,
): string[] {
  const fields: (keyof typeof before)[] = [
    "autoApprove",
    "autoApproveDepUpdates",
    "remoteSyncMode",
    "interactiveConflicts",
    "untouchablePaths",
    "confirmBeforeChange",
    "allowedScripts",
  ];
  const changed: string[] = [];
  for (const f of fields) {
    const a = JSON.stringify(before[f]);
    const b = JSON.stringify(after[f]);
    if (a !== b) changed.push(String(f));
  }
  return changed;
}

function validateProtectedPath(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return "Path cannot be empty.";
  if (v.startsWith("/")) return "Use a relative path (no leading slash).";
  if (v.includes("\0")) return "Path contains an invalid character.";
  return undefined;
}

async function runInteractivePolicyEditor(
  forkId: string,
  current: ReturnType<typeof readKitForkPolicy>,
): Promise<ReturnType<typeof readKitForkPolicy> | null> {
  p.intro(pc.bold(`Edit policy: ${forkId}`));

  const autoApprove = await p.select({
    message: "Auto-approve scaffold additions and modifications:",
    initialValue: current.autoApprove,
    options: [
      { value: "none",     label: "none",     hint: "every action requires confirmation (safest)" },
      { value: "additive", label: "additive", hint: "new files auto-approve; modifications confirm" },
      { value: "all",      label: "all",      hint: "all safe actions auto-approve (still honours protected paths)" },
    ],
  });
  if (p.isCancel(autoApprove)) { p.cancel("Cancelled."); return null; }

  const autoApproveDepUpdates = await p.select({
    message: "Auto-approve package.json dependency changes:",
    initialValue: current.autoApproveDepUpdates,
    options: [
      { value: "none",     label: "none",     hint: "never auto-approve dep changes" },
      { value: "additive", label: "additive", hint: "new deps auto-approve, upgrades need confirm" },
      { value: "all",      label: "all",      hint: "even upgrades auto-approve (additive-only, never removes)" },
    ],
  });
  if (p.isCancel(autoApproveDepUpdates)) { p.cancel("Cancelled."); return null; }

  const remoteSyncMode = await p.select({
    message: "Remote sync mode:",
    initialValue: current.remoteSyncMode,
    options: [
      { value: "off",    label: "off",    hint: "purely local — no GitHub interaction" },
      { value: "branch", label: "branch", hint: "push heal branches, no PR" },
      { value: "pr",     label: "pr",     hint: "push branch + open draft PR" },
    ],
  });
  if (p.isCancel(remoteSyncMode)) { p.cancel("Cancelled."); return null; }

  const interactiveConflicts = await p.confirm({
    message: "Pause on remote conflicts for interactive resolution?",
    initialValue: current.interactiveConflicts,
  });
  if (p.isCancel(interactiveConflicts)) { p.cancel("Cancelled."); return null; }

  // Edit untouchable paths interactively.
  let untouchablePaths = [...current.untouchablePaths];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const currentList = untouchablePaths.length > 0
      ? untouchablePaths.join(", ")
      : pc.dim("(none)");
    const action = await p.select({
      message: `Protected paths — never modified by heal  [current: ${currentList}]`,
      options: [
        { value: "__done",   label: "✓ Done"     },
        { value: "__add",    label: "+ Add path" },
        ...(untouchablePaths.length > 0
          ? [{ value: "__remove", label: "− Remove path" }]
          : []),
      ],
    });
    if (p.isCancel(action)) { p.cancel("Cancelled."); return null; }
    if (action === "__done") break;

    if (action === "__add") {
      const next = await p.text({
        message: "New protected path (glob prefix, relative):",
        placeholder: "skills/ or .env.local",
        validate: validateProtectedPath,
      });
      if (p.isCancel(next)) { p.cancel("Cancelled."); return null; }
      const clean = (next as string).trim();
      if (clean && !untouchablePaths.includes(clean)) {
        untouchablePaths = [...untouchablePaths, clean];
      }
    }

    if (action === "__remove") {
      const toRemove = await p.select({
        message: "Select path to remove:",
        options: untouchablePaths.map((v) => ({ value: v, label: v })),
      });
      if (p.isCancel(toRemove)) { p.cancel("Cancelled."); return null; }
      untouchablePaths = untouchablePaths.filter((x) => x !== toRemove);
    }
  }

  // Summary + confirmation.
  p.note(
    [
      `  autoApprove:            ${autoApprove}`,
      `  autoApproveDepUpdates:  ${autoApproveDepUpdates}`,
      `  remoteSyncMode:         ${remoteSyncMode}`,
      `  interactiveConflicts:   ${interactiveConflicts}`,
      `  untouchablePaths:       [${untouchablePaths.join(", ")}]`,
    ].join("\n"),
    "New policy",
  );

  const confirmed = await p.confirm({
    message: "Apply these settings?",
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("No changes written.");
    return null;
  }

  return {
    ...current,
    autoApprove: autoApprove as typeof current.autoApprove,
    autoApproveDepUpdates: autoApproveDepUpdates as typeof current.autoApproveDepUpdates,
    remoteSyncMode: remoteSyncMode as typeof current.remoteSyncMode,
    interactiveConflicts: Boolean(interactiveConflicts),
    untouchablePaths,
  };
}

function applyPolicyAssignment(
  policy: ReturnType<typeof readKitForkPolicy>,
  assignment: string,
): ReturnType<typeof readKitForkPolicy> {
  const plusMatch = assignment.match(/^([a-zA-Z]+)\+=(.+)$/);
  const eqMatch = assignment.match(/^([a-zA-Z]+)=(.+)$/);
  if (plusMatch) {
    const [, field, value] = plusMatch;
    const current = (policy as Record<string, unknown>)[field];
    if (Array.isArray(current)) {
      return { ...policy, [field]: Array.from(new Set([...(current as string[]), value.trim()])) } as typeof policy;
    }
    throw new Error(`Policy field '${field}' is not a list; cannot use '+='.`);
  }
  if (eqMatch) {
    const [, field, rawValue] = eqMatch;
    const value = rawValue.trim();
    if (field === "interactiveConflicts") {
      return { ...policy, interactiveConflicts: value === "true" };
    }
    if (field === "untouchablePaths" || field === "confirmBeforeChange" || field === "allowedScripts") {
      return { ...policy, [field]: value.split(",").map((s) => s.trim()).filter(Boolean) } as typeof policy;
    }
    if (field === "autoApprove" || field === "autoApproveDepUpdates") {
      if (value !== "none" && value !== "additive" && value !== "all") {
        throw new Error(`Invalid value '${value}' for ${field} (expected none|additive|all).`);
      }
      return { ...policy, [field]: value } as typeof policy;
    }
    if (field === "remoteSyncMode") {
      if (value !== "off" && value !== "branch" && value !== "pr") {
        throw new Error(`Invalid value '${value}' for remoteSyncMode (expected off|branch|pr).`);
      }
      return { ...policy, remoteSyncMode: value };
    }
    throw new Error(`Unknown policy field '${field}'.`);
  }
  throw new Error(`Invalid policy assignment '${assignment}' — use field=value or field+=value.`);
}

// ---------------------------------------------------------------------------
// trace — show recent events for a fork
// ---------------------------------------------------------------------------

export interface KitForkTraceOptions {
  forkId: string;
  tail?: number;
  json?: boolean;
}

export function kitForkTraceCommand(opts: KitForkTraceOptions): void {
  const reg = findRegistrationOrThrow(opts.forkId);
  const events = opts.tail && opts.tail > 0
    ? tailKitForkTrace(reg.forkPath, opts.tail)
    : readKitForkTrace(reg.forkPath);

  if (opts.json) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }
  if (events.length === 0) {
    p.log.message(`No trace events recorded for ${reg.forkId}.`);
    return;
  }
  for (const e of events) {
    const ts = e.timestamp.replace("T", " ").replace("Z", "");
    console.log(`${pc.dim(ts)}  ${pc.cyan(e.type)}  ${e.summary}`);
  }
}

// ---------------------------------------------------------------------------
// confirm — unblock an awaiting_confirmation job
// ---------------------------------------------------------------------------

export interface KitForkConfirmOptions {
  jobId: string;
  approve?: string[]; // array of targetPaths to approve; empty => approve all pending
  json?: boolean;
}

export async function kitForkConfirmCommand(opts: KitForkConfirmOptions): Promise<void> {
  const job = getKitForkSyncJob(opts.jobId);
  if (!job) throw new Error(`Job not found: ${opts.jobId}`);
  if (job.status !== "awaiting_confirmation") {
    throw new Error(`Job ${opts.jobId} is not awaiting confirmation (status=${job.status}).`);
  }
  const pending = job.pendingConfirmations ?? [];
  const approve = opts.approve && opts.approve.length > 0 ? opts.approve : pending;
  const completed = await confirmAndResumeJob(opts.jobId, approve);
  if (!completed) throw new Error(`Failed to resume job ${opts.jobId}.`);
  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", jobId: opts.jobId, finalStatus: completed.status }, null, 2));
  } else {
    p.log.success(`Job ${pc.cyan(opts.jobId)} resumed — status=${completed.status}.`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findRegistrationOrThrow(forkId: string) {
  for (const reg of listKitForkRegistrations()) {
    if (reg.forkId === forkId) return reg;
  }
  // Fallback to scan if someone passes just the kitId+forkId via an indirect
  // path — loadKitForkRegistration requires both. Keep the simple scan.
  throw new Error(`Fork not found: ${forkId}. Run \`growthub kit fork list\` to see registered forks.`);
}

function requireReg(forkId: string, kitId?: string) {
  if (kitId) {
    const reg = loadKitForkRegistration(kitId, forkId);
    if (reg) return reg;
  }
  return findRegistrationOrThrow(forkId);
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerKitForkRemoteSubcommands(kitFork: Command): void {
  kitFork
    .command("create")
    .description("One-click: fork an upstream GitHub repo, scaffold a bundled kit, register the fork.")
    .requiredOption("--kit <kit-id>", "Bundled kit id to scaffold the fork from")
    .requiredOption("--upstream <owner/repo>", "Upstream GitHub repository to fork")
    .requiredOption("--out <path>", "Destination directory for the new fork")
    .option("--fork-name <name>", "Rename the fork at creation time")
    .option("--destination-org <org>", "Create the fork under a GitHub organization")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await kitForkCreate(opts);
    });

  kitFork
    .command("connect")
    .description("Bind an existing registered fork to a GitHub remote repository.")
    .requiredOption("--fork-id <id>", "Registered fork id")
    .requiredOption("--remote <owner/repo>", "GitHub repository to connect as origin")
    .option("--default-branch <name>", "Remote default branch (default: main)")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await kitForkConnect({ forkId: opts.forkId, remote: opts.remote, defaultBranch: opts.defaultBranch, json: opts.json });
    });

  kitFork
    .command("policy")
    .description("View, edit interactively, or set fields on the per-fork heal policy.")
    .argument("[fork-id]", "Registered fork id (takes precedence over --fork-id)")
    .option("--fork-id <id>", "Registered fork id (alternative to positional arg)")
    .option("--set <field=value...>", "Update one or more fields (e.g. autoApprove=none untouchablePaths+=custom/)")
    .option("--edit", "Launch interactive editor (clack prompts)")
    .option("--dry-run", "Show planned changes without writing policy.json")
    .option("--json", "Emit machine-readable output")
    .addHelpText("after", `
Examples:
  $ growthub kit fork policy <fork-id>                       # view policy
  $ growthub kit fork policy <fork-id> --edit                # interactive editor
  $ growthub kit fork policy <fork-id> --set autoApprove=all
  $ growthub kit fork policy <fork-id> --set untouchablePaths+=skills/ --dry-run
`)
    .action(async (forkIdArg: string | undefined, opts: {
      forkId?: string;
      set?: string[];
      edit?: boolean;
      dryRun?: boolean;
      json?: boolean;
    }) => {
      const forkId = forkIdArg ?? opts.forkId;
      if (!forkId) {
        console.error(pc.red("Missing fork-id. Pass it as an argument or with --fork-id."));
        process.exitCode = 1;
        return;
      }
      await kitForkPolicyCommand({
        forkId,
        set: opts.set,
        edit: opts.edit,
        dryRun: opts.dryRun,
        json: opts.json,
      });
    });

  kitFork
    .command("trace")
    .description("Show the append-only event log for a fork.")
    .requiredOption("--fork-id <id>", "Registered fork id")
    .option("--tail <n>", "Only show the last N events", (v) => Number(v))
    .option("--json", "Emit machine-readable output")
    .action((opts) => {
      kitForkTraceCommand({ forkId: opts.forkId, tail: opts.tail, json: opts.json });
    });

  kitFork
    .command("confirm")
    .description("Approve pending confirmations for an `awaiting_confirmation` job.")
    .requiredOption("--job-id <id>", "Fork-sync job id (from `kit fork jobs`)")
    .option("--approve <targetPath...>", "Specific paths to approve (default: approve all pending)")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await kitForkConfirmCommand({ jobId: opts.jobId, approve: opts.approve, json: opts.json });
    });
}
