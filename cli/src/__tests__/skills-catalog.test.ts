/**
 * Skill catalog reader — smoke tests against the real repo tree.
 *
 * Exercises readSkillCatalog over the fixture repo to confirm that every
 * .claude/skills/* and every cli/assets/worker-kits/<kit>/SKILL.md is
 * discovered with a parseable frontmatter and zero warnings. Enforces the
 * capability-agnostic contract of @growthub/api-contract/skills.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSkillCatalog } from "../skills/catalog.js";

const REPO_ROOT = path.resolve(__dirname, "../../..");

describe("readSkillCatalog — repo catalog", () => {
  const result = readSkillCatalog({ root: REPO_ROOT });

  it("finds at least the nine .claude/skills", () => {
    const claude = result.entries.filter((e) => e.source === "claude-skills");
    expect(claude.length).toBeGreaterThanOrEqual(9);
    expect(claude.map((e) => e.manifest.name)).toEqual(
      expect.arrayContaining([
        "growthub-discover",
        "growthub-auth",
        "growthub-pipeline-execute",
        "growthub-video-generation",
        "growthub-cms-sdk-v1",
        "growthub-kit-fork-authority",
        "growthub-t3code-harness",
        "growthub-marketing-operator",
        "growthub-worker-kits",
      ]),
    );
  });

  it("finds a SKILL.md for every worker kit", () => {
    const kitEntries = result.entries.filter((e) => e.source === "worker-kit");
    expect(kitEntries.length).toBe(13);
    // Sanity: every kit includes the v1.2 primitive frontmatter fields.
    for (const entry of kitEntries) {
      expect(entry.manifest.sessionMemory?.path).toBe(".growthub-fork/project.md");
      expect(entry.manifest.selfEval?.maxRetries).toBe(3);
      expect(entry.manifest.selfEval?.traceTo).toBe(".growthub-fork/trace.jsonl");
      expect(Array.isArray(entry.manifest.helpers)).toBe(true);
      expect(Array.isArray(entry.manifest.subSkills)).toBe(true);
      expect(Array.isArray(entry.manifest.mcpTools)).toBe(true);
    }
  });

  it("reads with zero warnings for the curated tree", () => {
    expect(result.warnings).toEqual([]);
  });

  it("catalog envelope is v1 with the expected root", () => {
    expect(result.catalog.version).toBe(1);
    expect(result.catalog.root).toBe(REPO_ROOT);
    expect(typeof result.catalog.readAt).toBe("number");
    expect(result.catalog.skills.length).toBe(result.entries.length);
  });

  it("every manifest respects the SkillManifest name/description length bounds", () => {
    for (const entry of result.entries) {
      expect(entry.manifest.name.length).toBeGreaterThan(0);
      expect(entry.manifest.name.length).toBeLessThanOrEqual(64);
      expect(entry.manifest.description.length).toBeGreaterThan(0);
      expect(entry.manifest.description.length).toBeLessThanOrEqual(1024);
    }
  });
});
