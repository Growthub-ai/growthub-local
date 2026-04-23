/**
 * `growthub skills` — discovery + session-memory commands.
 *
 * Subcommands:
 *   - skills list [--json] [--root <path>]        — catalog every SKILL.md
 *   - skills validate [--root <path>]             — strict shape check
 *   - skills session init [--fork <path>] [--kit <id>] [--json]
 *                                                 — seed .growthub-fork/project.md
 *   - skills session show [--fork <path>] [--json]
 *                                                 — print session-memory head
 *
 * No new transport, no new storage. Reads the repo or a fork root and
 * writes only to files inside `.growthub-fork/`.
 */

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { readSkillCatalog, type SkillCatalogResult } from "../skills/catalog.js";
import {
  readSessionMemory,
  resolveProjectMdPath,
} from "../skills/session-memory.js";
import { scaffoldSessionMemory } from "../starter/scaffold-session-memory.js";
import { appendKitForkTraceEvent } from "../kits/fork-trace.js";
import { resolveInForkRegistrationPath } from "../config/kit-forks-home.js";
import { renderTable } from "../utils/table-renderer.js";

interface SkillRow {
  name: string;
  source: string;
  skillPath: string;
  triggers: number;
  helpers: number;
  subSkills: number;
  maxRetries: string;
}

interface LocalForkHead {
  forkId: string;
  kitId: string;
}

function readLocalForkHead(forkPath: string): LocalForkHead | null {
  const p = resolveInForkRegistrationPath(forkPath);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as {
      forkId?: string;
      kitId?: string;
    };
    if (typeof parsed.forkId !== "string" || typeof parsed.kitId !== "string") return null;
    return { forkId: parsed.forkId, kitId: parsed.kitId };
  } catch {
    return null;
  }
}

function resolveRoot(optRoot: string | undefined): string {
  if (optRoot) return path.resolve(optRoot);
  return process.cwd();
}

function runList(opts: { root?: string; json?: boolean }): void {
  const result = readSkillCatalog({ root: resolveRoot(opts.root) });
  if (opts.json) {
    console.log(JSON.stringify(
      {
        version: result.catalog.version,
        root: result.catalog.root,
        skills: result.entries.map((e) => ({
          ...e.manifest,
          skillPath: e.skillPath,
        })),
        warnings: result.warnings,
      },
      null,
      2,
    ));
    return;
  }
  if (result.entries.length === 0) {
    console.log(pc.dim(`No SKILL.md found under ${result.catalog.root}`));
    return;
  }
  const rows: SkillRow[] = result.entries.map((e) => ({
    name: e.manifest.name,
    source: e.source,
    skillPath: path.relative(result.catalog.root ?? "", e.skillPath),
    triggers: e.manifest.triggers?.length ?? 0,
    helpers: e.manifest.helpers?.length ?? 0,
    subSkills: e.manifest.subSkills?.length ?? 0,
    maxRetries: e.manifest.selfEval ? String(e.manifest.selfEval.maxRetries) : "—",
  }));
  console.log(renderTable<SkillRow>({
    columns: [
      { key: "name", label: "name", maxWidth: 42 },
      { key: "source", label: "source" },
      { key: "skillPath", label: "path", maxWidth: 60 },
      { key: "triggers", label: "trg", align: "right" },
      { key: "helpers", label: "hlp", align: "right" },
      { key: "subSkills", label: "sub", align: "right" },
      { key: "maxRetries", label: "maxR", align: "right" },
    ],
    rows,
  }));
  if (result.warnings.length > 0) {
    console.log("");
    console.log(pc.yellow(`${result.warnings.length} warning(s):`));
    for (const w of result.warnings) {
      console.log(pc.yellow(`  - ${path.relative(result.catalog.root ?? "", w.skillPath)}: ${w.reason}`));
    }
  }
}

interface ValidateIssue {
  skillPath: string;
  reason: string;
  severity: "error" | "warning";
}

function runValidate(opts: { root?: string; json?: boolean }): void {
  const root = resolveRoot(opts.root);
  const result: SkillCatalogResult = readSkillCatalog({ root });
  const issues: ValidateIssue[] = [];

  for (const w of result.warnings) {
    issues.push({ skillPath: w.skillPath, reason: w.reason, severity: "error" });
  }

  for (const entry of result.entries) {
    const m = entry.manifest;
    if (m.name.length > 64) {
      issues.push({
        skillPath: entry.skillPath,
        reason: `name length ${m.name.length} exceeds 64-char limit`,
        severity: "error",
      });
    }
    if (m.description.length > 1024) {
      issues.push({
        skillPath: entry.skillPath,
        reason: `description length ${m.description.length} exceeds 1024-char limit`,
        severity: "error",
      });
    }
    const skillDir = path.dirname(entry.skillPath);
    for (const helper of m.helpers ?? []) {
      const helperPath = path.resolve(skillDir, helper.path);
      if (!fs.existsSync(helperPath)) {
        issues.push({
          skillPath: entry.skillPath,
          reason: `helpers[].path missing on disk: ${helper.path}`,
          severity: "warning",
        });
      }
    }
    for (const sub of m.subSkills ?? []) {
      const subPath = path.resolve(skillDir, sub.path);
      if (!fs.existsSync(subPath)) {
        issues.push({
          skillPath: entry.skillPath,
          reason: `subSkills[].path missing on disk: ${sub.path}`,
          severity: "error",
        });
      }
    }
    if (m.selfEval && (m.selfEval.maxRetries < 1 || m.selfEval.maxRetries > 10)) {
      issues.push({
        skillPath: entry.skillPath,
        reason: `selfEval.maxRetries ${m.selfEval.maxRetries} outside recommended 1..10 range`,
        severity: "warning",
      });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(
      {
        root,
        skillsChecked: result.entries.length,
        issues,
        ok: issues.filter((i) => i.severity === "error").length === 0,
      },
      null,
      2,
    ));
    process.exitCode =
      issues.filter((i) => i.severity === "error").length === 0 ? 0 : 1;
    return;
  }

  console.log(pc.bold(`Validated ${result.entries.length} skill(s) under ${root}`));
  if (issues.length === 0) {
    console.log(pc.green("OK — no issues."));
    return;
  }
  for (const issue of issues) {
    const rel = path.relative(root, issue.skillPath);
    const tag = issue.severity === "error" ? pc.red("[error]  ") : pc.yellow("[warning]");
    console.log(`${tag} ${rel}: ${issue.reason}`);
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  if (errors > 0) process.exitCode = 1;
}

function runSessionInit(opts: {
  fork?: string;
  kit?: string;
  json?: boolean;
}): void {
  const forkPath = resolveRoot(opts.fork);
  let kitId = opts.kit?.trim() ?? "";
  let forkId = "unknown";

  const forkHead = readLocalForkHead(forkPath);
  if (forkHead) {
    forkId = forkHead.forkId;
    if (!kitId) kitId = forkHead.kitId;
  }

  if (!kitId) {
    const err = "Pass --kit <id>, or run this inside a registered fork (`.growthub-fork/fork.json`).";
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: err }));
      process.exitCode = 1;
    } else {
      console.error(pc.red(err));
      process.exitCode = 1;
    }
    return;
  }

  const result = scaffoldSessionMemory({
    forkPath,
    kitId,
    forkId,
    source: "skills-session-init",
    sourceRef: "",
  });

  if (result.written && forkHead) {
    appendKitForkTraceEvent(forkPath, {
      forkId,
      kitId,
      type: "skills_scaffolded",
      summary: "Seeded .growthub-fork/project.md via 'growthub skills session init'",
      detail: { projectMd: result.projectMdPath },
    });
  }

  if (opts.json) {
    console.log(JSON.stringify(
      { status: result.written ? "ok" : "already-initialised", ...result },
      null,
      2,
    ));
    return;
  }

  if (result.written) {
    console.log(pc.green(`Seeded ${path.relative(forkPath, result.projectMdPath)}`));
  } else if (!result.templatePath) {
    console.log(pc.yellow(
      `Kit tree does not ship templates/project.md — this kit has not been upgraded to the v1.2 primitives yet. ` +
      `No seed written; session memory can still be maintained manually.`,
    ));
  } else {
    console.log(pc.dim(`${path.relative(forkPath, result.projectMdPath)} already present; left untouched.`));
  }
}

function runSessionShow(opts: { fork?: string; json?: boolean; body?: boolean }): void {
  const forkPath = resolveRoot(opts.fork);
  const head = readSessionMemory(forkPath);
  if (!head) {
    const err = `No session memory at ${resolveProjectMdPath(forkPath)}. Run 'growthub skills session init'.`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "missing", projectMdPath: resolveProjectMdPath(forkPath) }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.yellow(err));
    process.exitCode = 1;
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(
      {
        path: head.path,
        sizeBytes: head.sizeBytes,
        frontmatter: head.frontmatter,
        body: opts.body ? head.body : undefined,
      },
      null,
      2,
    ));
    return;
  }
  console.log(pc.bold(head.path));
  console.log(pc.dim(`${head.sizeBytes} bytes`));
  if (head.frontmatter) {
    for (const [k, v] of Object.entries(head.frontmatter)) {
      if (Array.isArray(v)) {
        console.log(`  ${k}: ${v.length === 0 ? "[]" : `[${v.length} entries]`}`);
      } else if (typeof v === "object" && v !== null) {
        console.log(`  ${k}: { ${Object.keys(v).join(", ")} }`);
      } else {
        console.log(`  ${k}: ${String(v)}`);
      }
    }
  }
  if (opts.body) {
    console.log("");
    console.log(head.body);
  } else {
    console.log("");
    console.log(pc.dim("(pass --body to print the markdown body)"));
  }
}

export function registerSkillsCommands(program: Command): void {
  const skills = program
    .command("skills")
    .description("Discovery + session memory for SKILL.md + .growthub-fork/project.md");

  skills
    .command("list")
    .description("Enumerate every SKILL.md reachable from the current tree")
    .option("--root <path>", "Override the root to scan (default: cwd)")
    .option("--json", "Emit machine-readable JSON")
    .action((opts) => runList(opts));

  skills
    .command("validate")
    .description("Strict frontmatter + helper/sub-skill path check; non-zero exit on error")
    .option("--root <path>", "Override the root to scan (default: cwd)")
    .option("--json", "Emit machine-readable JSON")
    .action((opts) => runValidate(opts));

  const session = skills
    .command("session")
    .description("Read / seed the fork's session memory (.growthub-fork/project.md)");

  session
    .command("init")
    .description("Seed .growthub-fork/project.md from the kit's templates/project.md")
    .option("--fork <path>", "Fork root (default: cwd)")
    .option("--kit <id>", "Explicit kit id; read from fork.json when omitted inside a registered fork")
    .option("--json", "Emit machine-readable JSON")
    .action((opts) => runSessionInit(opts));

  session
    .command("show")
    .description("Print the session-memory head for a fork")
    .option("--fork <path>", "Fork root (default: cwd)")
    .option("--body", "Also print the markdown body")
    .option("--json", "Emit machine-readable JSON")
    .action((opts) => runSessionShow(opts));
}
