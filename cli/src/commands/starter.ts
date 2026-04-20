/**
 * `growthub starter` — Custom Workspace Starter Kit CLI surface.
 *
 * Thin Commander wrapper over:
 *   - `cli/src/starter/init.ts`                (greenfield starter)
 *   - `cli/src/starter/source-import/index.ts` (portable source importer)
 *
 * No business logic here — every production behaviour lives in
 * already-shipping primitives (copyBundledKitSource, registerKitFork,
 * writeKitForkPolicy, appendKitForkTraceEvent, resolveGithubAccessToken,
 * createFork) or in the source-import module surface.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { pathToFileURL } from "node:url";
import { initStarterWorkspace, DEFAULT_STARTER_KIT_ID } from "../starter/init.js";
import type { StarterInitOptions } from "../starter/types.js";
import { renderTable } from "../utils/table-renderer.js";
import { captureEvent, captureOutcome } from "../runtime/telemetry/index.js";
import { renderActivationNudge } from "./activation-bridge.js";
import {
  browseSkills,
  confirmAndResumeSourceImportJob,
  importSourceAsWorkspace,
} from "../starter/source-import/index.js";
import type {
  GithubRepoSourceInput,
  SkillsBrowseScope,
  SkillsSkillSourceInput,
  SourceImportInput,
  SourceImportJob,
  SourceImportResult,
} from "../starter/source-import/index.js";

export async function runStarterInit(opts: StarterInitOptions): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await initStarterWorkspace(opts);
    void captureEvent({
      event: "workspace_starter_created",
      properties: {
        funnel_stage: "activation",
        source_kind: "starter",
        starter_kit_id: result.kitId,
        remote_sync_mode: result.policyMode,
        duration_ms: Date.now() - startedAt,
        outcome: "success",
      },
    });
    if (opts.json) {
      console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
      return;
    }
    p.outro(
      `Workspace scaffolded at ${pc.cyan(result.forkPath)}\n` +
      `  kitId:       ${result.kitId}\n` +
      `  forkId:      ${pc.cyan(result.forkId)}\n` +
      `  baseVersion: ${result.baseVersion}\n` +
      `  open:        ${folderOpenLabel(result.forkPath)}\n` +
      `  policyMode:  remoteSyncMode=${result.policyMode}` +
      (result.remote ? `\n  remote:      ${pc.cyan(result.remote.htmlUrl)}` : "") +
      `\n\nNext: ${pc.dim(`growthub kit fork status ${result.forkId}`)}`,
    );
    renderActivationNudge("starter_init");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void captureOutcome("first_run_failed", "failure", startedAt, {
      funnel_stage: "friction",
      surface: "starter_init",
    });
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    p.log.error(msg);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Source import — shared output rendering
// ---------------------------------------------------------------------------

interface RunSourceImportOptions {
  input: SourceImportInput;
  json?: boolean;
}

function terminalLink(label: string, href: string): string {
  return `\u001B]8;;${href}\u0007${label}\u001B]8;;\u0007`;
}

function folderOpenLabel(folderPath: string): string {
  const href = pathToFileURL(folderPath).href;
  const label =
    process.platform === "darwin"
      ? "Open in Finder"
      : process.platform === "win32"
        ? "Open in Explorer"
        : "Open folder";
  return terminalLink(label, href);
}

function formatSecuritySummary(result: SourceImportResult): string {
  const findings = result.security.findings.length;
  const severities = new Set(result.security.findings.map((f) => f.severity));
  const sevLine = severities.size
    ? Array.from(severities).sort().join(",")
    : "none";
  return `risk=${result.security.riskClass} findings=${findings} severities=${sevLine}`;
}

function renderJob(job: SourceImportJob): Record<string, unknown> {
  return {
    jobId: job.jobId,
    importId: job.importId,
    sourceKind: job.sourceKind,
    status: job.status,
    lastStep: job.lastStep,
    pendingConfirmations: job.pendingConfirmations ?? [],
    result: job.result,
    error: job.error,
  };
}

async function promptConfirmations(
  pending: string[],
  securitySummary: string | undefined,
): Promise<string[] | null> {
  if (securitySummary) {
    p.log.warn(`Security report: ${securitySummary}`);
  }
  p.log.info(
    `Agent parked on ${pending.length} confirmation(s): ${pending.join(", ")}`,
  );
  const first = await p.confirm({
    message: "Acknowledge the security report and proceed?",
    initialValue: false,
  });
  if (p.isCancel(first) || first !== true) return null;
  const second = await p.confirm({
    message: "Second confirmation — materialize the workspace now?",
    initialValue: false,
  });
  if (p.isCancel(second) || second !== true) return null;
  return pending;
}

async function runSourceImportCommand(
  opts: RunSourceImportOptions,
): Promise<void> {
  const { input, json } = opts;
  const sourceKind = input.source.kind;
  const started_event =
    sourceKind === "github-repo"
      ? "starter_import_repo_started"
      : "starter_import_skill_started";
  const completed_event =
    sourceKind === "github-repo"
      ? "starter_import_repo_completed"
      : "starter_import_skill_completed";
  const nudgeSurface =
    sourceKind === "github-repo" ? "source_import_repo" : "source_import_skill";
  const startedAt = Date.now();

  void captureEvent({
    event: started_event,
    properties: {
      funnel_stage: "activation",
      source_kind: sourceKind,
      import_mode: input.importMode,
      starter_kit_id: input.starterKitId,
      remote_sync_mode: input.remoteSyncMode,
    },
  });

  try {
    const onProgressFromInput = input.onProgress;
    const onProgress = (step: string): void => {
      if (!json) p.log.step(step);
      onProgressFromInput?.(step);
    };

    const { job, result } = await importSourceAsWorkspace({
      ...input,
      onProgress,
    });

    if (job.status === "awaiting_confirmation") {
      void captureEvent({
        event: "awaiting_confirmation_reached",
        properties: {
          funnel_stage: "friction",
          source_kind: sourceKind,
          import_mode: input.importMode,
          surface: nudgeSurface,
        },
      });
      if (json) {
        console.log(
          JSON.stringify(
            { status: "awaiting_confirmation", job: renderJob(job) },
            null,
            2,
          ),
        );
        return;
      }
      const pending = job.pendingConfirmations ?? [];
      const summary = job.plan?.security
        ? job.plan.security.summaryLines.join(" | ")
        : undefined;
      const acked = await promptConfirmations(pending, summary);
      if (!acked) {
        p.log.warn("Import aborted — confirmations not provided.");
        return;
      }
      const resumed = await confirmAndResumeSourceImportJob({
        jobId: job.jobId,
        confirmations: acked,
        remoteSyncMode: input.remoteSyncMode,
        label: input.name,
        subdirectory:
          input.source.kind === "github-repo" ? input.source.subdirectory : undefined,
        branch:
          input.source.kind === "github-repo" ? input.source.branch : undefined,
        onProgress,
      });
      if (!resumed || resumed.status !== "completed" || !resumed.result) {
        const msg = resumed?.error ?? "Import did not complete.";
        void captureOutcome("import_failed", "failure", startedAt, {
          funnel_stage: "friction",
          source_kind: sourceKind,
          import_mode: input.importMode,
        });
        p.log.error(msg);
        process.exitCode = 1;
        return;
      }
      void captureEvent({
        event: completed_event,
        properties: {
          funnel_stage: "activation",
          source_kind: sourceKind,
          import_mode: input.importMode,
          starter_kit_id: input.starterKitId,
          remote_sync_mode: input.remoteSyncMode,
          duration_ms: Date.now() - startedAt,
          outcome: "success",
        },
      });
      if (!json) {
        finalizeSuccess(resumed.result, resumed.jobId);
        renderActivationNudge(nudgeSurface);
      }
      return;
    }

    if (job.status === "failed" || !result) {
      const msg = job.error ?? "Import failed.";
      void captureOutcome("import_failed", "failure", startedAt, {
        funnel_stage: "friction",
        source_kind: sourceKind,
        import_mode: input.importMode,
      });
      if (json) {
        console.log(JSON.stringify({ status: "error", error: msg, job: renderJob(job) }, null, 2));
      } else {
        p.log.error(msg);
      }
      process.exitCode = 1;
      return;
    }

    void captureEvent({
      event: completed_event,
      properties: {
        funnel_stage: "activation",
        source_kind: sourceKind,
        import_mode: input.importMode,
        starter_kit_id: input.starterKitId,
        remote_sync_mode: input.remoteSyncMode,
        duration_ms: Date.now() - startedAt,
        outcome: "success",
      },
    });

    if (json) {
      console.log(
        JSON.stringify({ status: "ok", jobId: job.jobId, ...result }, null, 2),
      );
      return;
    }
    finalizeSuccess(result, job.jobId);
    renderActivationNudge(nudgeSurface);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void captureOutcome("import_failed", "failure", startedAt, {
      funnel_stage: "friction",
      source_kind: sourceKind,
      import_mode: input.importMode,
    });
    if (json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
    } else {
      p.log.error(msg);
    }
    process.exitCode = 1;
  }
}

function finalizeSuccess(result: SourceImportResult, jobId: string): void {
  const sourceLine =
    result.source.kind === "github-repo"
      ? `${result.source.repo.owner}/${result.source.repo.repo}`
      : `${result.source.skillId}@${result.source.version}`;
  p.outro(
    `Imported ${sourceLine} into ${pc.cyan(result.forkPath)}\n` +
      `  jobId:       ${pc.cyan(jobId)}\n` +
      `  importId:    ${result.importId}\n` +
      `  forkId:      ${pc.cyan(result.forkId)}\n` +
      `  kitId:       ${result.kitId}\n` +
      `  sourceKind:  ${result.sourceKind}\n` +
      `  importMode:  ${result.importMode}\n` +
      `  detection:   framework=${result.detection.framework} pm=${result.detection.packageManager} confidence=${result.detection.confidence}\n` +
      `  security:    ${formatSecuritySummary(result)}\n` +
      `  summary:     ${pc.dim(result.summaryPath)}\n` +
      `  manifest:    ${pc.dim(result.manifestPath)}\n\n` +
      `Next: ${pc.dim(`growthub kit fork status ${result.forkId}`)}`,
  );
}

// ---------------------------------------------------------------------------
// Skills browsing
// ---------------------------------------------------------------------------

interface BrowseSkillsOptions {
  query?: string;
  page?: number;
  pageSize?: number;
  scope?: SkillsBrowseScope;
  json?: boolean;
}

function scopeLabel(scope: SkillsBrowseScope): string {
  if (scope === "trending") return "Trending (24h)";
  if (scope === "hot") return "Hot";
  return "All Time";
}

export async function runBrowseSkills(opts: BrowseSkillsOptions): Promise<void> {
  try {
    const result = await browseSkills({
      q: opts.query,
      page: opts.page,
      pageSize: opts.pageSize,
      scope: opts.scope,
    });
    if (opts.json) {
      console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
      return;
    }
    if (result.entries.length === 0) {
      p.log.info(
        `No skills matched in ${scopeLabel(result.scope)} (page ${result.page}, pageSize ${result.pageSize}).`,
      );
      return;
    }
    p.log.info(
      `skills.sh — ${scopeLabel(result.scope)} · page ${result.page} · ${result.total ?? "?"} matching result(s)`,
    );
    console.log(
      renderTable({
        columns: [
          { key: "rank", label: "#", width: 3, align: "right" },
          { key: "title", label: "Skill", maxWidth: 28 },
          { key: "repository", label: "Repository", maxWidth: 30 },
          { key: "weeklyInstalls", label: "Weekly", width: 8, align: "right" },
          { key: "githubStars", label: "Stars", width: 8, align: "right" },
        ],
        rows: result.entries.map((entry) => ({
          rank: entry.rank ? String(entry.rank) : "",
          title: entry.title,
          repository: entry.repository ?? entry.author,
          weeklyInstalls: entry.weeklyInstalls ?? "",
          githubStars: entry.githubStars ?? "",
        })),
      }),
    );
    for (const entry of result.entries) {
      p.log.message(`${pc.bold(entry.skillId)}  ${pc.dim(entry.htmlUrl)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
    } else {
      p.log.error(msg);
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerStarterCommands(program: Command): void {
  const starter = program
    .command("starter")
    .description("Custom Workspace Starter Kit — scaffold or import a fork with full v1 Self-Healing Fork Sync wiring.");

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

  starter
    .command("import-repo")
    .description("Import a GitHub repository into a starter-derived portable workspace (Source Import Agent).")
    .argument("<repo>", "GitHub repo (owner/repo, https URL, or ssh-style shorthand)")
    .requiredOption("--out <path>", "Destination directory for the imported workspace")
    .option("--branch <branch>", "Branch to import (defaults to the repo's default branch)")
    .option("--subdirectory <path>", "Import only this subdirectory of the repo")
    .option("--name <label>", "Human label for the fork (defaults to owner/repo)")
    .option("--private", "Hint the repo is private — forces an auth probe")
    .option("--import-mode <mode>", "wrap|overlay (default: wrap)")
    .option("--kit <kit-id>", `Source kit id (default: ${DEFAULT_STARTER_KIT_ID})`)
    .option("--remote-sync-mode <mode>", "Initial policy.remoteSyncMode — off|branch|pr (default: off)")
    .option("--skip-probe", "Skip the GitHub API probe (assumes public + reachable)")
    .option("--confirm <targets...>", "Pre-acknowledge confirmation target paths")
    .option("--json", "Emit machine-readable output")
    .action(async (repo: string, opts) => {
      const source: GithubRepoSourceInput = {
        kind: "github-repo",
        repo,
        branch: opts.branch,
        subdirectory: opts.subdirectory,
        privateRepo: opts.private,
        skipProbe: opts.skipProbe,
      };
      const input: SourceImportInput = {
        source,
        out: opts.out,
        name: opts.name,
        importMode: opts.importMode ?? "wrap",
        starterKitId: opts.kit ?? DEFAULT_STARTER_KIT_ID,
        remoteSyncMode: opts.remoteSyncMode ?? "off",
        confirmations: opts.confirm,
        json: opts.json,
      };
      await runSourceImportCommand({ input, json: opts.json });
    });

  starter
    .command("import-skill")
    .description("Import a skills.sh skill into a starter-derived portable workspace (double-confirm flow).")
    .argument("<skill>", "Skill reference (owner/repo/skill, owner/repo/skill@version, or full skills.sh URL)")
    .requiredOption("--out <path>", "Destination directory for the imported workspace")
    .option("--version <tag>", "Skill version (defaults to 'latest')")
    .option("--name <label>", "Human label for the fork (defaults to skill title)")
    .option("--import-mode <mode>", "wrap|overlay (default: wrap)")
    .option("--kit <kit-id>", `Source kit id (default: ${DEFAULT_STARTER_KIT_ID})`)
    .option("--remote-sync-mode <mode>", "Initial policy.remoteSyncMode — off|branch|pr (default: off)")
    .option("--skip-probe", "Skip the skills.sh metadata probe")
    .option("--confirm <targets...>", "Pre-acknowledge confirmation target paths")
    .option("--json", "Emit machine-readable output")
    .action(async (skill: string, opts) => {
      const source: SkillsSkillSourceInput = {
        kind: "skills-skill",
        skillRef: skill,
        version: opts.version,
        skipProbe: opts.skipProbe,
      };
      const input: SourceImportInput = {
        source,
        out: opts.out,
        name: opts.name,
        importMode: opts.importMode ?? "wrap",
        starterKitId: opts.kit ?? DEFAULT_STARTER_KIT_ID,
        remoteSyncMode: opts.remoteSyncMode ?? "off",
        confirmations: opts.confirm,
        json: opts.json,
      };
      await runSourceImportCommand({ input, json: opts.json });
    });

  starter
    .command("browse-skills")
    .description("Browse live skills.sh leaderboard entries with popularity-ordered paging.")
    .option("--query <q>", "Free-text search")
    .option("--page <n>", "Page index (1-based)", (v) => Number.parseInt(v, 10))
    .option("--page-size <n>", "Page size (default 10, cap 50)", (v) => Number.parseInt(v, 10))
    .option("--scope <scope>", "Leaderboard scope — all|trending|hot", "all")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await runBrowseSkills({
        query: opts.query,
        page: opts.page,
        pageSize: opts.pageSize,
        scope: opts.scope,
        json: opts.json,
      });
    });
}
