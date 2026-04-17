/**
 * Source Import Agent — plan.ts tests.
 *
 * Covers: action sequence, confirmation flags by source kind + risk,
 * import-id format, destination-state handling, pendingConfirmations.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSourceImportPlan,
  pendingConfirmations,
} from "../starter/source-import/plan.js";
import type {
  GithubRepoAccessProbe,
  SkillsSkillAccessProbe,
  SourceSecurityReport,
} from "../starter/source-import/types.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) {
    const d = cleanup.pop()!;
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function track(dir: string): string {
  cleanup.push(dir);
  return dir;
}

function makeGithubProbe(): GithubRepoAccessProbe {
  return {
    kind: "github-repo",
    mode: "public",
    repo: { owner: "octocat", repo: "demo" },
    defaultBranch: "main",
    htmlUrl: "https://github.com/octocat/demo",
    cloneUrl: "https://github.com/octocat/demo.git",
    visibility: "public",
    warnings: [],
  };
}

function makeSkillProbe(): SkillsSkillAccessProbe {
  return {
    kind: "skills-skill",
    mode: "public",
    skillRef: "acme/demo",
    skillId: "acme/demo",
    version: "1.0.0",
    title: "Demo Skill",
    author: "acme",
    htmlUrl: "https://skills.sh/acme/demo",
    files: ["SKILL.md"],
    warnings: [],
  };
}

function safeReport(): SourceSecurityReport {
  return {
    inspectedAt: new Date().toISOString(),
    filesInspected: 1,
    bytesInspected: 16,
    findings: [],
    riskClass: "safe",
    blocked: false,
    summaryLines: ["Risk: safe. No findings."],
  };
}

function cautionReport(): SourceSecurityReport {
  return {
    inspectedAt: new Date().toISOString(),
    filesInspected: 3,
    bytesInspected: 1024,
    findings: [
      {
        category: "install-hook",
        severity: "caution",
        path: "package.json",
        message: "postinstall",
      },
    ],
    riskClass: "caution",
    blocked: false,
    summaryLines: ["Risk: caution. 1 finding(s)."],
  };
}

describe("buildSourceImportPlan", () => {
  it("produces a stable action sequence for github-repo + safe payload", () => {
    const dest = track(makeTempDir("plan-gh-safe-"));
    fs.rmSync(dest, { recursive: true, force: true }); // destination may not exist
    const plan = buildSourceImportPlan({
      probe: makeGithubProbe(),
      destination: dest,
      starterKitId: "growthub-custom-workspace-starter-v1",
      importMode: "wrap",
      security: safeReport(),
    });
    const types = plan.actions.map((a) => a.actionType);
    expect(types).toEqual([
      "fetch_source",
      "inspect_security",
      "materialize_starter_shell",
      "place_imported_payload",
      "write_import_manifest",
      "register_fork",
      "seed_policy",
      "seed_trace",
      "summarize",
    ]);
    expect(plan.importId).toMatch(/^si-[a-z0-9]+-[a-z0-9]+$/);
  });

  it("does NOT need confirmation for safe github-repo imports into empty destination", () => {
    const dest = track(makeTempDir("plan-gh-empty-"));
    const plan = buildSourceImportPlan({
      probe: makeGithubProbe(),
      destination: dest,
      starterKitId: "k",
      importMode: "wrap",
      security: safeReport(),
    });
    expect(pendingConfirmations(plan)).toEqual([]);
  });

  it("requires confirmation for caution-risk github imports", () => {
    const dest = track(makeTempDir("plan-gh-caution-"));
    const plan = buildSourceImportPlan({
      probe: makeGithubProbe(),
      destination: dest,
      starterKitId: "k",
      importMode: "wrap",
      security: cautionReport(),
    });
    const pending = pendingConfirmations(plan);
    expect(pending).toContain(".source-staging");
  });

  it("ALWAYS requires confirmation for skill imports — even with a safe report", () => {
    const dest = track(makeTempDir("plan-sk-safe-"));
    const plan = buildSourceImportPlan({
      probe: makeSkillProbe(),
      destination: dest,
      starterKitId: "k",
      importMode: "wrap",
      security: safeReport(),
    });
    const pending = pendingConfirmations(plan);
    expect(pending.length).toBeGreaterThan(0);
    const inspect = plan.actions.find((a) => a.actionType === "inspect_security")!;
    expect(inspect.needsConfirmation).toBe(true);
    expect(inspect.confirmationLabel).toBeTruthy();
  });

  it("adds a confirmation for non-empty destinations", () => {
    const dest = track(makeTempDir("plan-nonempty-"));
    fs.writeFileSync(path.join(dest, "keep.txt"), "hi");
    const plan = buildSourceImportPlan({
      probe: makeGithubProbe(),
      destination: dest,
      starterKitId: "k",
      importMode: "wrap",
    });
    const mat = plan.actions.find((a) => a.actionType === "materialize_starter_shell")!;
    expect(mat.needsConfirmation).toBe(true);
    expect(mat.confirmationLabel).toBe("non-empty-destination");
    expect(plan.warnings.some((w) => w.includes("not empty"))).toBe(true);
  });

  it("throws on destinations that exist but are not directories", () => {
    const parent = track(makeTempDir("plan-file-"));
    const filePath = path.join(parent, "occupied");
    fs.writeFileSync(filePath, "oops");
    expect(() =>
      buildSourceImportPlan({
        probe: makeGithubProbe(),
        destination: filePath,
        starterKitId: "k",
        importMode: "wrap",
      }),
    ).toThrow();
  });
});
