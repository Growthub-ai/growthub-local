/**
 * Session-memory scaffolder tests.
 *
 * Exercises scaffoldSessionMemory against a temporary fork directory with
 * and without a kit-shipped templates/project.md. No network.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scaffoldSessionMemory } from "../starter/scaffold-session-memory.js";

const PROJECT_MD_TEMPLATE = [
  "---",
  "kitId: \"{{KIT_ID}}\"",
  "forkId: \"{{FORK_ID}}\"",
  "startedAt: \"{{STARTED_AT}}\"",
  "source: \"{{SOURCE}}\"",
  "sourceRef: \"{{SOURCE_REF}}\"",
  "skillManifestVersion: 1",
  "---",
  "",
  "# Project journal — fork `{{FORK_ID}}`",
  "",
  "Seeded from `{{KIT_ID}}` at `{{STARTED_AT}}` via `{{SOURCE}}` (`{{SOURCE_REF}}`).",
  "",
].join("\n");

describe("scaffoldSessionMemory", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-session-memory-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns { written: false } when the kit ships no template", () => {
    const result = scaffoldSessionMemory({
      forkPath: tmp,
      kitId: "demo-kit",
      forkId: "fork_abc",
      source: "greenfield",
    });
    expect(result.written).toBe(false);
    expect(result.templatePath).toBeNull();
    expect(fs.existsSync(path.join(tmp, ".growthub-fork/project.md"))).toBe(false);
  });

  it("substitutes tokens and writes .growthub-fork/project.md on greenfield", () => {
    fs.mkdirSync(path.join(tmp, "templates"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "templates/project.md"), PROJECT_MD_TEMPLATE);

    const startedAt = "2026-04-23T18:40:00.000Z";
    const result = scaffoldSessionMemory({
      forkPath: tmp,
      kitId: "growthub-custom-workspace-starter-v1",
      forkId: "fork_greenfield_1",
      source: "greenfield",
      sourceRef: "",
      startedAt,
    });

    expect(result.written).toBe(true);
    expect(result.projectMdPath).toBe(path.join(tmp, ".growthub-fork/project.md"));

    const written = fs.readFileSync(result.projectMdPath, "utf8");
    expect(written).toContain('kitId: "growthub-custom-workspace-starter-v1"');
    expect(written).toContain('forkId: "fork_greenfield_1"');
    expect(written).toContain(`startedAt: "${startedAt}"`);
    expect(written).toContain('source: "greenfield"');
    expect(written).toContain('sourceRef: ""');
    expect(written).toContain("# Project journal — fork `fork_greenfield_1`");
  });

  it("tags the seed with the source-import provenance (github-repo)", () => {
    fs.mkdirSync(path.join(tmp, "templates"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "templates/project.md"), PROJECT_MD_TEMPLATE);

    const result = scaffoldSessionMemory({
      forkPath: tmp,
      kitId: "growthub-custom-workspace-starter-v1",
      forkId: "fork_import_gh_1",
      source: "github-repo",
      sourceRef: "octocat/hello-world@a1b2c3d",
    });

    expect(result.written).toBe(true);
    const written = fs.readFileSync(result.projectMdPath, "utf8");
    expect(written).toContain('source: "github-repo"');
    expect(written).toContain('sourceRef: "octocat/hello-world@a1b2c3d"');
  });

  it("is idempotent at init time — does not overwrite an existing seed", () => {
    fs.mkdirSync(path.join(tmp, "templates"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "templates/project.md"), PROJECT_MD_TEMPLATE);

    const first = scaffoldSessionMemory({
      forkPath: tmp,
      kitId: "demo-kit",
      forkId: "fork_once",
      source: "greenfield",
    });
    expect(first.written).toBe(true);
    const originalBytes = fs.readFileSync(first.projectMdPath);

    // Simulate a session writing to project.md between two init calls.
    fs.appendFileSync(first.projectMdPath, "\n## operator note\n- kept\n", "utf8");

    const second = scaffoldSessionMemory({
      forkPath: tmp,
      kitId: "demo-kit",
      forkId: "fork_once",
      source: "greenfield",
    });
    expect(second.written).toBe(false);

    const afterBytes = fs.readFileSync(first.projectMdPath);
    expect(afterBytes.length).toBeGreaterThan(originalBytes.length);
    expect(fs.readFileSync(first.projectMdPath, "utf8")).toContain("## operator note");
  });
});
