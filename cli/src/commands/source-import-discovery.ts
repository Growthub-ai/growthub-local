/**
 * Discovery-UX adapter for the Source Import Agent.
 *
 * Invoked from the Settings → Custom Workspace Starter submenu. Runs the
 * interactive double-confirmation flow:
 *
 *   1. Resolve the source (github-repo or skills-skill).
 *   2. Foreground the job until it parks (`awaiting_confirmation`) or
 *      completes.
 *   3. If parked, render the security + plan summary, prompt for TWO
 *      operator confirmations, and call `confirmAndResumeSourceImportJob`.
 *   4. Render the final summary.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  browseSkills,
  confirmAndResumeSourceImportJob,
  importSourceAsWorkspace,
  probeSkillsSource,
} from "../starter/source-import/index.js";
import type {
  SkillsBrowseScope,
  SourceImportInput,
  SourceImportJob,
  SourceImportResult,
} from "../starter/source-import/index.js";
import { renderTable } from "../utils/table-renderer.js";

export interface StartSourceImportFlowGithub {
  kind: "github-repo";
  repo: string;
  out: string;
}

export interface StartSourceImportFlowSkill {
  kind: "skills-skill";
  skillRef: string;
  out: string;
}

export type StartSourceImportFlowInput =
  | StartSourceImportFlowGithub
  | StartSourceImportFlowSkill;

function slugifyWorkspaceName(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "custom-workspace";
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

function defaultWorkspaceFolderName(input: StartSourceImportFlowInput): string {
  if (input.kind === "github-repo") {
    return slugifyWorkspaceName(input.repo.split("/").slice(-2).join("-"));
  }
  return slugifyWorkspaceName(input.skillRef.split("/").at(-1) ?? input.skillRef);
}

export async function promptForInteractiveWorkspacePath(
  input: StartSourceImportFlowInput,
): Promise<string | null> {
  const suggestedName = defaultWorkspaceFolderName(input);
  const raw = await p.text({
    message: "Where should we create the custom workspace?",
    placeholder: `~/Desktop/${suggestedName}`,
  });
  if (p.isCancel(raw) || !raw) return null;

  const trimmed = String(raw).trim();
  const expanded = trimmed.startsWith("~/")
    ? path.join(process.env.HOME ?? "~", trimmed.slice(2))
    : trimmed;
  const resolved = path.resolve(expanded);

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    const finalPath = path.join(resolved, suggestedName);
    p.note(
      [
        `You selected an existing folder: ${resolved}`,
        `Growthub will create the workspace inside it as:`,
        finalPath,
      ].join("\n"),
      "Workspace location",
    );
    return finalPath;
  }

  return resolved;
}

function scopeLabel(scope: SkillsBrowseScope): string {
  if (scope === "trending") return "Trending (24h)";
  if (scope === "hot") return "Hot";
  return "All Time";
}

async function chooseSkillsScope(current: SkillsBrowseScope): Promise<SkillsBrowseScope | null> {
  const choice = await p.select({
    message: "Leaderboard scope",
    options: [
      { value: "all", label: "All Time", hint: current === "all" ? "current" : "most trusted by install rank" },
      { value: "trending", label: "Trending (24h)", hint: current === "trending" ? "current" : "recent momentum" },
      { value: "hot", label: "Hot", hint: current === "hot" ? "current" : "currently active picks" },
    ],
  });
  if (p.isCancel(choice)) return null;
  return choice;
}

async function previewSkillSelection(skillRef: string): Promise<boolean> {
  const skill = await probeSkillsSource({
    kind: "skills-skill",
    skillRef,
  });
  const audits = skill.audits?.length
    ? skill.audits.map((audit) => `${audit.name}:${audit.status}`).join(", ")
    : "none";
  p.note(
    [
      `Skill: ${skill.skillId}`,
      `Repo: ${skill.repository ?? "unknown"}`,
      `Weekly installs: ${skill.weeklyInstalls ?? "unknown"}`,
      `GitHub stars: ${skill.githubStars ?? "unknown"}`,
      `First seen: ${skill.firstSeen ?? "unknown"}`,
      `Audits: ${audits}`,
      "",
      skill.summary ?? skill.description ?? "No summary exposed on the detail page.",
    ].join("\n"),
    skill.title,
  );
  const confirmed = await p.confirm({
    message: `Use ${skill.title} to build a starter-derived workspace?`,
    initialValue: true,
  });
  return !p.isCancel(confirmed) && confirmed === true;
}

async function selectSkillFromCatalog(): Promise<string | null> {
  let query = "";
  let scope: SkillsBrowseScope = "all";
  let page = 1;
  const pageSize = 10;

  while (true) {
    const result = await browseSkills({
      q: query || undefined,
      scope,
      page,
      pageSize,
    });

    console.log("");
    console.log(
      renderTable({
        columns: [
          { key: "rank", label: "#", width: 3, align: "right" },
          { key: "title", label: "Skill", maxWidth: 28 },
          { key: "repository", label: "Repository", maxWidth: 30 },
          { key: "weekly", label: "Weekly", width: 8, align: "right" },
          { key: "stars", label: "Stars", width: 8, align: "right" },
        ],
        rows: result.entries.map((entry) => ({
          rank: entry.rank ? String(entry.rank) : "",
          title: entry.title,
          repository: entry.repository ?? entry.author,
          weekly: entry.weeklyInstalls ?? "",
          stars: entry.githubStars ?? "",
        })),
        emptyText: "No matching skills on the live leaderboard.",
      }),
    );

    const hasNext = (result.total ?? 0) > page * pageSize;
    const hasPrev = page > 1;

    const choice = await p.select({
      message: `skills.sh · ${scopeLabel(scope)}${query ? ` · query="${query}"` : ""}`,
      options: [
        ...result.entries.map((entry, index) => ({
          value: `skill:${index}`,
          label: entry.title,
          hint: `${entry.repository ?? entry.author} · ${entry.weeklyInstalls ?? "unknown"} weekly · ${entry.githubStars ?? "unknown"} stars`,
        })),
        { value: "search", label: "Search leaderboard", hint: query || "filter by skill, repo, or slug" },
        { value: "scope", label: "Change leaderboard scope", hint: scopeLabel(scope) },
        ...(hasPrev ? [{ value: "prev", label: "Previous page", hint: `page ${page - 1}` }] : []),
        ...(hasNext ? [{ value: "next", label: "Next page", hint: `page ${page + 1}` }] : []),
        { value: "manual", label: "Paste skill URL / id", hint: "use a canonical skills.sh URL or owner/repo/skill" },
        { value: "back", label: "← Back to Starter" },
      ],
    });

    if (p.isCancel(choice) || choice === "back") return null;
    if (choice === "prev") {
      page = Math.max(1, page - 1);
      continue;
    }
    if (choice === "next") {
      page += 1;
      continue;
    }
    if (choice === "scope") {
      const nextScope = await chooseSkillsScope(scope);
      if (nextScope) {
        scope = nextScope;
        page = 1;
      }
      continue;
    }
    if (choice === "search") {
      const nextQuery = await p.text({
        message: "Search the live leaderboard",
        placeholder: "marketing, frontend design, firecrawl, seo",
        defaultValue: query,
      });
      if (!p.isCancel(nextQuery)) {
        query = String(nextQuery).trim();
        page = 1;
      }
      continue;
    }
    if (choice === "manual") {
      const manual = await p.text({
        message: "skills.sh URL or canonical skill id",
        placeholder: "https://skills.sh/anthropics/skills/frontend-design",
      });
      if (!p.isCancel(manual) && String(manual).trim()) {
        const skillRef = String(manual).trim();
        if (await previewSkillSelection(skillRef)) {
          return skillRef;
        }
      }
      continue;
    }

    const selected = result.entries[Number.parseInt(String(choice).replace("skill:", ""), 10)];
    if (selected && await previewSkillSelection(selected.skillId)) {
      return selected.skillId;
    }
  }
}

export async function startSkillsSourceImportFlow(): Promise<void> {
  try {
    const selectedSkill = await selectSkillFromCatalog();
    if (!selectedSkill) return;

    const outPath = await promptForInteractiveWorkspacePath({
      kind: "skills-skill",
      skillRef: selectedSkill,
      out: "",
    });
    if (!outPath) return;

    await startSourceImportFlow({
      kind: "skills-skill",
      skillRef: selectedSkill,
      out: outPath,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
  }
}

function renderSuccess(result: SourceImportResult, jobId: string): void {
  const sourceLine =
    result.source.kind === "github-repo"
      ? `${result.source.repo.owner}/${result.source.repo.repo}`
      : `${result.source.skillId}@${result.source.version}`;
  p.outro(
    `Imported ${sourceLine} into ${pc.cyan(result.forkPath)}\n` +
      `  jobId:       ${pc.cyan(jobId)}\n` +
      `  forkId:      ${pc.cyan(result.forkId)}\n` +
      `  risk:        ${result.security.riskClass} (${result.security.findings.length} findings)\n` +
      `  detection:   framework=${result.detection.framework} pm=${result.detection.packageManager}\n` +
      `  open:        ${folderOpenLabel(result.forkPath)}\n` +
      `  summary:     ${pc.dim(result.summaryPath)}\n` +
      `  manifest:    ${pc.dim(result.manifestPath)}`,
  );
}

async function confirmTwice(
  job: SourceImportJob,
): Promise<string[] | null> {
  const pending = job.pendingConfirmations ?? [];
  if (pending.length === 0) return [];
  const sec = job.plan?.security;
  if (sec) {
    p.log.warn(`Security report — risk: ${sec.riskClass}`);
    for (const line of sec.summaryLines.slice(0, 6)) {
      p.log.message(`  ${line}`);
    }
    if (sec.blocked) {
      p.log.error("Security inspection BLOCKED this payload — import cannot continue.");
      return null;
    }
  }
  p.log.info(`Pending confirmations: ${pending.join(", ")}`);

  const ack = await p.confirm({
    message: "Acknowledge the security report?",
    initialValue: false,
  });
  if (p.isCancel(ack) || ack !== true) return null;

  const go = await p.confirm({
    message: "Second confirmation — materialize the workspace now?",
    initialValue: false,
  });
  if (p.isCancel(go) || go !== true) return null;
  return pending;
}

export async function startSourceImportFlow(
  input: StartSourceImportFlowInput,
): Promise<void> {
  const importInput: SourceImportInput =
    input.kind === "github-repo"
      ? {
          source: { kind: "github-repo", repo: input.repo },
          out: input.out,
          importMode: "wrap",
          onProgress: (step) => p.log.step(step),
        }
      : {
          source: { kind: "skills-skill", skillRef: input.skillRef },
          out: input.out,
          importMode: "wrap",
          onProgress: (step) => p.log.step(step),
        };

  try {
    const { job, result } = await importSourceAsWorkspace(importInput);

    if (job.status === "completed" && result) {
      renderSuccess(result, job.jobId);
      return;
    }

    if (job.status === "failed") {
      p.log.error(job.error ?? "Source import failed.");
      return;
    }

    if (job.status !== "awaiting_confirmation") {
      p.log.warn(`Unexpected job status: ${job.status}`);
      return;
    }

    const acked = await confirmTwice(job);
    if (!acked) {
      p.log.warn("Import aborted — confirmations not provided.");
      return;
    }

    const resumed = await confirmAndResumeSourceImportJob({
      jobId: job.jobId,
      confirmations: acked,
      onProgress: (step) => p.log.step(step),
    });

    if (!resumed || resumed.status !== "completed" || !resumed.result) {
      p.log.error(resumed?.error ?? "Import did not complete after confirmation.");
      return;
    }

    renderSuccess(resumed.result, resumed.jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
  }
}
