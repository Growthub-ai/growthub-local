/**
 * Session-memory primitive (primitive #3) — readers / writers for
 * `.growthub-fork/project.md`.
 *
 * The file is the fork's cross-session continuity surface. It sits alongside
 * `fork.json`, `policy.json`, `trace.jsonl`, and optional `authority.json`
 * inside `.growthub-fork/`.
 *
 * This module is pure filesystem + string templating. It does not spawn
 * processes, open ports, or hold any state beyond the file.
 *
 * Seeding is handled by `starter/scaffold-session-memory.ts` at init/import
 * time. This module adds the read and append surfaces used by
 * `growthub skills session show` and by future `growthub skills session
 * append` / `growthub skills session approve` commands.
 */

import fs from "node:fs";
import path from "node:path";
import { readFrontmatter, splitFrontmatter } from "./frontmatter.js";

export const PROJECT_MD_RELATIVE = ".growthub-fork/project.md";

export interface SessionMemoryHead {
  /** Absolute path to the project.md file. */
  path: string;
  /** Parsed frontmatter, if present. */
  frontmatter: Record<string, unknown> | null;
  /** Markdown body after the frontmatter fence. */
  body: string;
  /** File size in bytes. */
  sizeBytes: number;
}

export function resolveProjectMdPath(forkPath: string): string {
  return path.resolve(forkPath, PROJECT_MD_RELATIVE);
}

/**
 * Read `.growthub-fork/project.md`. Returns `null` when absent.
 */
export function readSessionMemory(forkPath: string): SessionMemoryHead | null {
  const projectMdPath = resolveProjectMdPath(forkPath);
  if (!fs.existsSync(projectMdPath)) return null;
  const raw = fs.readFileSync(projectMdPath, "utf8");
  const sizeBytes = Buffer.byteLength(raw, "utf8");
  try {
    const { frontmatter, body } = readFrontmatter(raw);
    return { path: projectMdPath, frontmatter, body, sizeBytes };
  } catch {
    // Malformed frontmatter — fall back to raw.
    const split = splitFrontmatter(raw);
    return { path: projectMdPath, frontmatter: null, body: split.body, sizeBytes };
  }
}

export interface SessionLogAppendInput {
  /** Path to the fork root. */
  forkPath: string;
  /** Skill slug that produced this entry. */
  skill: string;
  /**
   * ISO timestamp. Defaults to `new Date().toISOString()`. Stored as UTC in
   * the "Session log" heading.
   */
  at?: string;
  /** One-line plan for this unit of work. */
  plan: string;
  /** Optional material change summary. */
  changes?: string;
  /** Pass / fail / parked / retry-pending — free-form. */
  outcome?: string;
  /** Optional next-step note for the next session. */
  next?: string;
}

/**
 * Append a dated block under the "Session log" heading of `project.md`.
 * Append-only — never rewrites prior entries. Returns the full appended
 * block.
 *
 * If `project.md` is missing, this throws: agents must seed it first via
 * `scaffoldSessionMemory` (at init/import time) or `growthub skills session
 * init`.
 */
export function appendSessionLogEntry(input: SessionLogAppendInput): string {
  const projectMdPath = resolveProjectMdPath(input.forkPath);
  if (!fs.existsSync(projectMdPath)) {
    throw new Error(
      `Session memory not initialised at ${projectMdPath}. Run 'growthub skills session init' or scaffold via starter init.`,
    );
  }

  const at = input.at ?? new Date().toISOString();
  const humanTs = at.replace("T", " ").replace(/\..+$/, " UTC");

  const lines: string[] = [];
  lines.push("");
  lines.push(`### ${humanTs} · ${input.skill}`);
  lines.push(`- **Plan.** ${input.plan}`);
  if (input.changes) lines.push(`- **Changes.** ${input.changes}`);
  if (input.outcome) lines.push(`- **Outcome.** ${input.outcome}`);
  if (input.next) lines.push(`- **Next.** ${input.next}`);

  const block = lines.join("\n") + "\n";
  fs.appendFileSync(projectMdPath, block, "utf8");
  return block;
}
