/**
 * Skill catalog reader — walks a repo or fork root and returns every
 * SKILL.md as a parsed `SkillManifest` (contract:
 * `@growthub/api-contract/skills::SkillManifest`).
 *
 * Walk targets, in discovery order:
 *   1. `<root>/SKILL.md`                              (project-root)
 *   2. `<root>/.claude/skills/{*}/SKILL.md`           (claude-skills)
 *   3. `<root>/cli/assets/worker-kits/{*}/SKILL.md`   (worker-kit) — repo layout
 *   4. `<root>/cli/assets/worker-kits/{*}/skills/{slug}/SKILL.md` (worker-kit-sub)
 *   5. `<root>/skills/{slug}/SKILL.md`                (worker-kit-sub) — fork layout
 *
 * The reader is deliberately permissive: a malformed frontmatter surfaces as a
 * `SkillCatalogWarning`, not a thrown error, so one bad file does not break
 * discovery. `growthub skills validate` is the strict surface.
 */

import fs from "node:fs";
import path from "node:path";
import type { SkillManifest, SkillCatalog, SkillSource } from "@growthub/api-contract/skills";
import { readFrontmatter } from "./frontmatter.js";

export interface SkillCatalogEntry {
  manifest: SkillManifest;
  skillPath: string;
  source: SkillSource;
}

export interface SkillCatalogWarning {
  skillPath: string;
  reason: string;
}

export interface SkillCatalogResult {
  catalog: SkillCatalog;
  entries: SkillCatalogEntry[];
  warnings: SkillCatalogWarning[];
}

const MAX_DEPTH = 6;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".vite",
  ".pnpm-store",
  "coverage",
  ".growthub-fork",
]);

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeRead(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Coerce the parsed frontmatter object into a `SkillManifest`. Returns a
 * reason string when the shape is invalid; the caller emits a warning.
 */
function coerceManifest(
  raw: Record<string, unknown>,
  source: SkillSource,
): { manifest: SkillManifest } | { reason: string } {
  const name = raw.name;
  const description = raw.description;
  if (typeof name !== "string" || name.trim() === "") {
    return { reason: "frontmatter missing required field 'name'" };
  }
  if (typeof description !== "string" || description.trim() === "") {
    return { reason: "frontmatter missing required field 'description'" };
  }

  const manifest: SkillManifest = {
    name: name.trim(),
    description: description.trim(),
    source,
  };

  if (Array.isArray(raw.triggers)) {
    manifest.triggers = raw.triggers.filter((v): v is string => typeof v === "string");
  }
  if (typeof raw.progressiveDisclosure === "boolean") {
    manifest.progressiveDisclosure = raw.progressiveDisclosure;
  }
  if (Array.isArray(raw.helpers)) {
    manifest.helpers = raw.helpers
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
      .map((v) => ({
        path: String(v.path ?? ""),
        description: String(v.description ?? ""),
      }))
      .filter((h) => h.path.length > 0);
  }
  if (Array.isArray(raw.subSkills)) {
    manifest.subSkills = raw.subSkills
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
      .map((v) => ({
        name: String(v.name ?? ""),
        path: String(v.path ?? ""),
      }))
      .filter((s) => s.name.length > 0 && s.path.length > 0);
  }
  if (typeof raw.selfEval === "object" && raw.selfEval !== null && !Array.isArray(raw.selfEval)) {
    const se = raw.selfEval as Record<string, unknown>;
    const criteria = Array.isArray(se.criteria)
      ? se.criteria.filter((v): v is string => typeof v === "string")
      : [];
    const maxRetries = typeof se.maxRetries === "number" ? se.maxRetries : 3;
    manifest.selfEval = {
      criteria,
      maxRetries,
      ...(typeof se.traceTo === "string" ? { traceTo: se.traceTo } : {}),
    };
  }
  if (
    typeof raw.sessionMemory === "object" &&
    raw.sessionMemory !== null &&
    !Array.isArray(raw.sessionMemory)
  ) {
    const sm = raw.sessionMemory as Record<string, unknown>;
    if (typeof sm.path === "string" && sm.path.length > 0) {
      manifest.sessionMemory = { path: sm.path };
    }
  }
  if (Array.isArray(raw.mcpTools)) {
    manifest.mcpTools = raw.mcpTools.filter((v): v is string => typeof v === "string");
  }

  return { manifest };
}

function readOne(
  skillPath: string,
  source: SkillSource,
): { entry: SkillCatalogEntry } | { warning: SkillCatalogWarning } {
  const body = safeRead(skillPath);
  if (body === null) {
    return { warning: { skillPath, reason: "unreadable SKILL.md" } };
  }
  let parsed;
  try {
    parsed = readFrontmatter(body);
  } catch (err) {
    return {
      warning: {
        skillPath,
        reason: `frontmatter parse error: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
  if (parsed.frontmatter === null) {
    return { warning: { skillPath, reason: "SKILL.md has no YAML frontmatter" } };
  }
  const coerced = coerceManifest(parsed.frontmatter, source);
  if ("reason" in coerced) {
    return { warning: { skillPath, reason: coerced.reason } };
  }
  return { entry: { manifest: coerced.manifest, skillPath, source } };
}

/**
 * Walk `<baseDir>/<child>/SKILL.md` for each immediate child directory.
 * Used for `.claude/skills/*` and `worker-kits/*`.
 */
function readSkillDirs(
  baseDir: string,
  source: SkillSource,
  out: SkillCatalogEntry[],
  warnings: SkillCatalogWarning[],
): void {
  if (!isDir(baseDir)) return;
  for (const child of fs.readdirSync(baseDir).sort()) {
    const dir = path.join(baseDir, child);
    if (!isDir(dir)) continue;
    const skill = path.join(dir, "SKILL.md");
    if (!exists(skill)) continue;
    const res = readOne(skill, source);
    if ("entry" in res) out.push(res.entry);
    else warnings.push(res.warning);
  }
}

/**
 * Walk `<kitDir>/skills/**\/SKILL.md` recursively (bounded depth).
 */
function readKitSubSkills(
  kitDir: string,
  out: SkillCatalogEntry[],
  warnings: SkillCatalogWarning[],
  depth = 0,
): void {
  const base = path.join(kitDir, "skills");
  if (!isDir(base)) return;
  const walk = (dir: string, d: number): void => {
    if (d > MAX_DEPTH) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), d + 1);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        const res = readOne(path.join(dir, entry.name), "worker-kit-sub");
        if ("entry" in res) out.push(res.entry);
        else warnings.push(res.warning);
      }
    }
  };
  walk(base, depth);
}

export interface ReadSkillCatalogOptions {
  /**
   * Absolute path to the root to scan. For a repo, this is the repo root.
   * For a fork, this is the fork root.
   */
  root: string;
  /** Include repo-layout worker kits under `cli/assets/worker-kits`. Default: true. */
  includeWorkerKits?: boolean;
  /** Include `.claude/skills/*` under the root. Default: true. */
  includeClaudeSkills?: boolean;
  /** Include fork-layout kit root (`<root>/skills/*`). Default: true. */
  includeForkRootSkills?: boolean;
  /** Include an optional `<root>/SKILL.md` entry. Default: true. */
  includeProjectRoot?: boolean;
}

/**
 * Read every SKILL.md reachable from `root`, return a typed catalog.
 */
export function readSkillCatalog(opts: ReadSkillCatalogOptions): SkillCatalogResult {
  const root = path.resolve(opts.root);
  const entries: SkillCatalogEntry[] = [];
  const warnings: SkillCatalogWarning[] = [];

  // 1. Optional project-root SKILL.md
  if (opts.includeProjectRoot !== false) {
    const rootSkill = path.join(root, "SKILL.md");
    if (exists(rootSkill)) {
      const res = readOne(rootSkill, "project-root");
      if ("entry" in res) entries.push(res.entry);
      else warnings.push(res.warning);
    }
  }

  // 2. `.claude/skills/<slug>/SKILL.md`
  if (opts.includeClaudeSkills !== false) {
    readSkillDirs(path.join(root, ".claude/skills"), "claude-skills", entries, warnings);
  }

  // 3. Worker kits under the repo layout
  if (opts.includeWorkerKits !== false) {
    const kitsDir = path.join(root, "cli/assets/worker-kits");
    readSkillDirs(kitsDir, "worker-kit", entries, warnings);
    if (isDir(kitsDir)) {
      for (const kit of fs.readdirSync(kitsDir).sort()) {
        const kitPath = path.join(kitsDir, kit);
        if (!isDir(kitPath)) continue;
        readKitSubSkills(kitPath, entries, warnings);
      }
    }
  }

  // 4. Fork-layout: `<root>/skills/<slug>/SKILL.md`
  if (opts.includeForkRootSkills !== false) {
    readKitSubSkills(root, entries, warnings);
  }

  const catalog: SkillCatalog = {
    version: 1,
    skills: entries.map((e) => e.manifest),
    readAt: Date.now(),
    root,
  };

  return { catalog, entries, warnings };
}
