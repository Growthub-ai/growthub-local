/**
 * Session-memory scaffolder — primitive #3.
 *
 * Copies a kit's `templates/project.md` template into a newly registered
 * fork's `.growthub-fork/project.md`, substituting the init-time tokens
 * (kitId, forkId, startedAt, source, sourceRef).
 *
 * This is intentionally the smallest possible helper: pure filesystem +
 * string templating, no network, no new auth, no new storage. It sits
 * alongside the already-shipping `registerKitFork` / `writeKitForkPolicy`
 * / `appendKitForkTraceEvent` primitives and is called exactly once at
 * init/import time.
 *
 * If the kit does not ship a `templates/project.md` (older kits that
 * haven't been upgraded), this function is a no-op — the kit continues
 * to work, it just skips the session-memory seed.
 */

import fs from "node:fs";
import path from "node:path";

export interface ScaffoldSessionMemoryInput {
  /** Absolute path to the fork root (same as `<forkPath>/` passed into register). */
  forkPath: string;
  /** Kit id — written into the frontmatter. */
  kitId: string;
  /** Fork id from `registerKitFork`. */
  forkId: string;
  /**
   * Provenance tag — one of `"greenfield"`, `"github-repo"`, `"skills-skill"`,
   * or any additive string future source types introduce.
   */
  source: string;
  /**
   * Optional human-readable reference (e.g. `octocat/hello-world@main`,
   * `anthropics/skills/frontend-design@1.2.0`, or `""` for greenfield).
   */
  sourceRef?: string;
  /** Override the ISO timestamp written into the seed. Defaults to `new Date().toISOString()`. */
  startedAt?: string;
}

export interface ScaffoldSessionMemoryResult {
  /** Whether the seed file was written. `false` when the kit ships no template. */
  written: boolean;
  /** Absolute path to the (potentially written) `.growthub-fork/project.md`. */
  projectMdPath: string;
  /** Absolute path to the kit-level `templates/project.md`, when present. */
  templatePath: string | null;
}

const PROJECT_MD_RELATIVE = ".growthub-fork/project.md";
const TEMPLATE_RELATIVE = "templates/project.md";

/**
 * Render the kit's `templates/project.md` into the fork's
 * `.growthub-fork/project.md`. Never overwrites an existing seed —
 * idempotent at session-init time.
 */
export function scaffoldSessionMemory(
  input: ScaffoldSessionMemoryInput,
): ScaffoldSessionMemoryResult {
  const forkPath = path.resolve(input.forkPath);
  const templatePath = path.join(forkPath, TEMPLATE_RELATIVE);
  const projectMdPath = path.join(forkPath, PROJECT_MD_RELATIVE);

  if (!fs.existsSync(templatePath)) {
    return { written: false, projectMdPath, templatePath: null };
  }

  if (fs.existsSync(projectMdPath)) {
    return { written: false, projectMdPath, templatePath };
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const startedAt = input.startedAt ?? new Date().toISOString();
  const sourceRef = input.sourceRef ?? "";

  const seeded = template
    .replaceAll("{{KIT_ID}}", input.kitId)
    .replaceAll("{{FORK_ID}}", input.forkId)
    .replaceAll("{{STARTED_AT}}", startedAt)
    .replaceAll("{{SOURCE}}", input.source)
    .replaceAll("{{SOURCE_REF}}", sourceRef);

  fs.mkdirSync(path.dirname(projectMdPath), { recursive: true });
  fs.writeFileSync(projectMdPath, seeded, "utf8");

  return { written: true, projectMdPath, templatePath };
}
