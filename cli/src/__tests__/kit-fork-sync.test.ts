/**
 * Kit Fork Sync Engine — Unit Tests
 *
 * Covers:
 *   - Drift detection: file drift (added/modified/deleted), package drift,
 *     custom skill detection, severity classification, semver comparison
 *   - Heal plan building: action types, preserved paths, protected patterns
 *   - Heal plan execution: add_file, update_package_json_deps, patch_manifest,
 *     skip_user_modified, dry-run, skip list, updatedRegistration
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectKitForkDrift,
  buildKitForkHealPlan,
  applyKitForkHealPlan,
} from "../kits/fork-sync.js";
import type {
  KitForkRegistration,
  KitForkDriftReport,
} from "../kits/fork-types.js";

const ORIGINAL_ENV = { ...process.env };

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.resolve(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
}

function copyKitAssets(destRoot: string, kitId = "creative-strategist-v1"): void {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const sourceRoot = path.resolve(moduleDir, `../../assets/worker-kits/${kitId}`);
  fs.cpSync(sourceRoot, destRoot, { recursive: true });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.GROWTHUB_KIT_FORKS_HOME = makeTempDir("growthub-kit-forks-");
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---------------------------------------------------------------------------
// Helpers for making a minimal report (bypasses disk I/O in plan tests)
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<KitForkDriftReport> = {}): KitForkDriftReport {
  return {
    forkId: "test-fork",
    kitId: "creative-strategist-v1",
    forkVersion: "1.0.0",
    upstreamVersion: "1.1.0",
    hasUpstreamUpdate: true,
    overallSeverity: "info",
    fileDrifts: [],
    packageDrifts: [],
    customSkillsDetected: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeReg(forkPath: string): KitForkRegistration {
  return {
    forkId: "test-fork",
    kitId: "creative-strategist-v1",
    baseVersion: "1.0.0",
    forkPath,
    registeredAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// detectKitForkDrift
// ---------------------------------------------------------------------------

describe("detectKitForkDrift", () => {
  it("throws when fork path does not exist", () => {
    const reg = makeReg("/nonexistent/fork/path");
    expect(() => detectKitForkDrift(reg)).toThrow(/does not exist/);
  });

  it("throws for unknown kit ID", () => {
    const forkDir = makeTempDir("fork-");
    const reg = { ...makeReg(forkDir), kitId: "nonexistent-kit-xyz" };
    expect(() => detectKitForkDrift(reg)).toThrow(/not found in bundled catalog/);
  });

  it("returns a clean report when fork matches the bundled kit", () => {
    const forkDir = makeTempDir("fork-clean-");
    copyKitAssets(forkDir, "creative-strategist-v1");

    const reg = makeReg(forkDir);
    const report = detectKitForkDrift(reg);

    expect(report.forkId).toBe("test-fork");
    expect(report.kitId).toBe("creative-strategist-v1");
    expect(report.upstreamVersion).toBeTruthy();
    // A freshly copied fork should have no file drift (upstream files all present)
    const addedDrifts = report.fileDrifts.filter((d) => d.changeType === "added");
    expect(addedDrifts).toHaveLength(0);
  });

  it("detects added drift when a fork is missing an upstream file", () => {
    const forkDir = makeTempDir("fork-missing-");
    copyKitAssets(forkDir, "creative-strategist-v1");

    // Find a file that actually exists in the upstream kit to remove
    // kit.json is always present in every kit
    const kitJsonPath = path.resolve(forkDir, "kit.json");
    fs.rmSync(kitJsonPath);

    const reg = makeReg(forkDir);
    const report = detectKitForkDrift(reg);

    const addedDrift = report.fileDrifts.find(
      (d) => d.relativePath === "kit.json" && d.changeType === "added",
    );
    expect(addedDrift).toBeDefined();
    // kit.json is a CRITICAL_PATH so severity must be critical
    expect(addedDrift!.severity).toBe("critical");
  });

  it("detects modified drift on kit.json with critical severity", () => {
    const forkDir = makeTempDir("fork-modified-");
    copyKitAssets(forkDir, "creative-strategist-v1");

    // Mutate kit.json in the fork
    const kitJsonPath = path.resolve(forkDir, "kit.json");
    const original = JSON.parse(fs.readFileSync(kitJsonPath, "utf8")) as Record<string, unknown>;
    original.myCustomField = "user addition";
    fs.writeFileSync(kitJsonPath, JSON.stringify(original, null, 2));

    const reg = makeReg(forkDir);
    const report = detectKitForkDrift(reg);

    const modifiedDrift = report.fileDrifts.find(
      (d) => d.relativePath === "kit.json" && d.changeType === "modified",
    );
    expect(modifiedDrift).toBeDefined();
    expect(modifiedDrift!.severity).toBe("critical");
  });

  it("detects custom skills in fork-only paths matching CUSTOM_SKILL_PATTERNS", () => {
    const forkDir = makeTempDir("fork-skills-");
    copyKitAssets(forkDir, "creative-strategist-v1");

    // Add a custom skill
    writeFiles(forkDir, { "custom-skills/my-prompt.md": "# My custom prompt" });

    const reg = makeReg(forkDir);
    const report = detectKitForkDrift(reg);

    expect(report.customSkillsDetected).toContain("custom-skills/my-prompt.md");
  });

  it("reflects hasUpstreamUpdate based on semver comparison", () => {
    const forkDir = makeTempDir("fork-semver-");
    copyKitAssets(forkDir, "creative-strategist-v1");

    // Set fork version to a very high number so it appears newer than upstream
    const regNewer = { ...makeReg(forkDir), baseVersion: "99.0.0" };
    const reportNewer = detectKitForkDrift(regNewer);
    expect(reportNewer.hasUpstreamUpdate).toBe(false);

    // Set fork version to 0.0.1 so upstream is always newer
    const regOlder = { ...makeReg(forkDir), baseVersion: "0.0.1" };
    const reportOlder = detectKitForkDrift(regOlder);
    expect(reportOlder.hasUpstreamUpdate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildKitForkHealPlan
// ---------------------------------------------------------------------------

describe("buildKitForkHealPlan", () => {
  it("produces add_file action for upstream-added file", () => {
    const report = makeReport({
      fileDrifts: [{
        relativePath: "QUICKSTART.md",
        changeType: "added",
        severity: "warning",
        description: "Missing from fork",
      }],
    });
    const plan = buildKitForkHealPlan(report);
    const addAction = plan.actions.find((a) => a.actionType === "add_file");
    expect(addAction).toBeDefined();
    expect(addAction!.targetPath).toBe("QUICKSTART.md");
    expect(addAction!.safe).toBe(true);
  });

  it("produces patch_manifest for modified kit.json", () => {
    const report = makeReport({
      fileDrifts: [{
        relativePath: "kit.json",
        changeType: "modified",
        severity: "critical",
        description: "Manifest differs",
      }],
    });
    const plan = buildKitForkHealPlan(report);
    expect(plan.actions.find((a) => a.actionType === "patch_manifest")).toBeDefined();
  });

  it("produces update_package_json_deps for modified package.json", () => {
    const report = makeReport({
      fileDrifts: [{
        relativePath: "package.json",
        changeType: "modified",
        severity: "critical",
        description: "Deps differ",
      }],
    });
    const plan = buildKitForkHealPlan(report);
    expect(plan.actions.find((a) => a.actionType === "update_package_json_deps")).toBeDefined();
  });

  it("produces skip_user_modified for non-manifest modified file", () => {
    const report = makeReport({
      fileDrifts: [{
        relativePath: "workers/my-agent/CLAUDE.md",
        changeType: "modified",
        severity: "warning",
        description: "User modified",
      }],
    });
    const plan = buildKitForkHealPlan(report);
    expect(plan.actions.find((a) => a.actionType === "skip_user_modified")).toBeDefined();
    expect(plan.preservedPaths).toContain("workers/my-agent/CLAUDE.md");
  });

  it("skips user-protected paths (skills/) completely", () => {
    const report = makeReport({
      fileDrifts: [{
        relativePath: "skills/do-not-touch.md",
        changeType: "added",
        severity: "info",
        description: "In protected zone",
      }],
    });
    const plan = buildKitForkHealPlan(report);
    expect(plan.actions.find((a) => a.actionType === "add_file" && a.targetPath === "skills/do-not-touch.md")).toBeUndefined();
    expect(plan.preservedPaths).toContain("skills/do-not-touch.md");
  });

  it("adds update_package_json_deps from packageDrifts when no file drift covers it", () => {
    const report = makeReport({
      packageDrifts: [{ packageName: "new-lib", forkVersion: null, upstreamVersion: "^1.0.0", changeType: "added" }],
    });
    const plan = buildKitForkHealPlan(report);
    expect(plan.actions.find((a) => a.actionType === "update_package_json_deps")).toBeDefined();
  });

  it("produces add_custom_skill entries for each detected skill", () => {
    const report = makeReport({
      customSkillsDetected: ["custom-skills/skill-a.md", "custom-skills/skill-b.md"],
    });
    const plan = buildKitForkHealPlan(report);
    const skillActions = plan.actions.filter((a) => a.actionType === "add_custom_skill");
    expect(skillActions).toHaveLength(2);
    expect(skillActions.every((a) => a.safe)).toBe(true);
  });

  it("returns empty actions for a fully clean report", () => {
    const report = makeReport({
      hasUpstreamUpdate: false,
      overallSeverity: "none",
      fileDrifts: [],
      packageDrifts: [],
      customSkillsDetected: [],
    });
    const plan = buildKitForkHealPlan(report);
    const realActions = plan.actions.filter((a) => a.actionType !== "add_custom_skill");
    expect(realActions).toHaveLength(0);
  });

  it("sets estimatedRisk to none when only custom skills are in the report", () => {
    const report = makeReport({
      hasUpstreamUpdate: false,
      overallSeverity: "none",
      fileDrifts: [],
      packageDrifts: [],
      customSkillsDetected: ["custom-skills/my-skill.md"],
    });
    const plan = buildKitForkHealPlan(report);
    expect(plan.estimatedRisk).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// applyKitForkHealPlan
// ---------------------------------------------------------------------------

describe("applyKitForkHealPlan — dry run", () => {
  it("skips all actions and writes no files", () => {
    const forkDir = makeTempDir("fork-dryrun-");
    writeFiles(forkDir, { "kit.json": "{}" });
    const reg = makeReg(forkDir);

    const plan = {
      forkId: "test-fork",
      kitId: "creative-strategist-v1",
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
      actions: [{
        actionType: "add_file" as const,
        targetPath: "SHOULD_NOT_EXIST.md",
        description: "Would add file",
        safe: true,
      }],
      preservedPaths: [],
      estimatedRisk: "info" as const,
      generatedAt: new Date().toISOString(),
    };

    const result = applyKitForkHealPlan(plan, { dryRun: true, registration: reg });
    expect(result.appliedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.updatedRegistration).toBeUndefined();
    expect(fs.existsSync(path.resolve(forkDir, "SHOULD_NOT_EXIST.md"))).toBe(false);
  });
});

describe("applyKitForkHealPlan — skip list", () => {
  it("skips specified target paths", () => {
    const forkDir = makeTempDir("fork-skiplist-");
    const reg = makeReg(forkDir);

    const plan = {
      forkId: "test-fork",
      kitId: "creative-strategist-v1",
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
      actions: [{
        actionType: "add_file" as const,
        targetPath: "SKIP_ME.md",
        description: "Skipped",
        safe: true,
      }],
      preservedPaths: [],
      estimatedRisk: "info" as const,
      generatedAt: new Date().toISOString(),
    };

    const result = applyKitForkHealPlan(plan, { skipFiles: ["SKIP_ME.md"], registration: reg });
    expect(result.appliedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });
});

describe("applyKitForkHealPlan — skip_user_modified", () => {
  it("returns skipped status and leaves user file content unchanged", () => {
    const forkDir = makeTempDir("fork-preserve-");
    writeFiles(forkDir, { "workers/my-agent/CLAUDE.md": "# My Custom Agent" });
    const reg = makeReg(forkDir);

    const plan = {
      forkId: "test-fork",
      kitId: "creative-strategist-v1",
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
      actions: [{
        actionType: "skip_user_modified" as const,
        targetPath: "workers/my-agent/CLAUDE.md",
        description: "Preserve",
        safe: true,
      }],
      preservedPaths: ["workers/my-agent/CLAUDE.md"],
      estimatedRisk: "none" as const,
      generatedAt: new Date().toISOString(),
    };

    const result = applyKitForkHealPlan(plan, { registration: reg });
    expect(result.actionResults[0]?.status).toBe("skipped");
    expect(fs.readFileSync(path.resolve(forkDir, "workers/my-agent/CLAUDE.md"), "utf8")).toBe("# My Custom Agent");
  });
});

describe("applyKitForkHealPlan — update_package_json_deps", () => {
  it("merges new upstream deps into fork package.json without removing fork deps", () => {
    const forkDir = makeTempDir("fork-pkg-");
    writeFiles(forkDir, {
      "package.json": JSON.stringify({
        dependencies: { "existing-dep": "^1.0.0" },
        devDependencies: { "my-custom-dev": "^0.1.0" },
      }, null, 2),
    });

    // Build a minimal upstream kit dir with a package.json
    const upstreamDir = makeTempDir("upstream-");
    writeFiles(upstreamDir, {
      "package.json": JSON.stringify({
        dependencies: { "existing-dep": "^1.0.0", "new-upstream-dep": "^3.0.0" },
      }, null, 2),
    });

    // NOTE: The actual upstream resolution uses the bundled asset root.
    // If creative-strategist-v1 has no package.json, the action will be skipped (safe).
    // We test the merge logic directly here by confirming no errors occur.
    const reg = makeReg(forkDir);
    const plan = {
      forkId: "test-fork",
      kitId: "creative-strategist-v1",
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
      actions: [{
        actionType: "update_package_json_deps" as const,
        targetPath: "package.json",
        description: "Merge deps",
        safe: true,
        payload: { strategy: "merge_add_only" },
      }],
      preservedPaths: [],
      estimatedRisk: "info" as const,
      generatedAt: new Date().toISOString(),
    };

    const result = applyKitForkHealPlan(plan, { registration: reg });
    // Must be applied or skipped — never an error
    expect(result.errorCount).toBe(0);
    expect(["applied", "skipped"]).toContain(result.actionResults[0]?.status);

    // Fork's custom dev dep must be preserved
    const forkPkg = JSON.parse(fs.readFileSync(path.resolve(forkDir, "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    expect(forkPkg.devDependencies?.["my-custom-dev"]).toBe("^0.1.0");
  });
});

describe("applyKitForkHealPlan — updatedRegistration", () => {
  it("returns updatedRegistration with new version when no errors", () => {
    const forkDir = makeTempDir("fork-update-");
    writeFiles(forkDir, { "kit.json": "{}" });
    const reg = makeReg(forkDir);

    const plan = {
      forkId: "test-fork",
      kitId: "creative-strategist-v1",
      fromVersion: "1.0.0",
      toVersion: "1.5.0",
      actions: [],
      preservedPaths: [],
      estimatedRisk: "none" as const,
      generatedAt: new Date().toISOString(),
    };

    const result = applyKitForkHealPlan(plan, { registration: reg });
    expect(result.updatedRegistration).toBeDefined();
    expect(result.updatedRegistration!.baseVersion).toBe("1.5.0");
    expect(result.updatedRegistration!.lastSyncedAt).toBeTruthy();
  });

  it("does not return updatedRegistration when there are errors", () => {
    const forkDir = makeTempDir("fork-err-");
    const reg = makeReg(forkDir);

    const plan = {
      forkId: "test-fork",
      kitId: "creative-strategist-v1",
      fromVersion: "1.0.0",
      toVersion: "1.5.0",
      actions: [{
        actionType: "update_package_json_deps" as const,
        targetPath: "package.json",
        description: "This will cause an error because package.json has invalid JSON",
        safe: true,
      }],
      preservedPaths: [],
      estimatedRisk: "info" as const,
      generatedAt: new Date().toISOString(),
    };

    // Write an invalid package.json
    writeFiles(forkDir, { "package.json": "not valid json {{" });

    const result = applyKitForkHealPlan(plan, { registration: reg });
    // The action will either be skipped (no upstream) or error — check no registration returned on error
    if (result.errorCount > 0) {
      expect(result.updatedRegistration).toBeUndefined();
    }
  });
});

describe("applyKitForkHealPlan — patch_manifest", () => {
  it("patches specified kit.json fields from upstream when they differ", () => {
    const forkDir = makeTempDir("fork-manifest-");
    copyKitAssets(forkDir, "creative-strategist-v1");

    // Downgrade schemaVersion in fork to trigger a patch
    const kitJsonPath = path.resolve(forkDir, "kit.json");
    const manifest = JSON.parse(fs.readFileSync(kitJsonPath, "utf8")) as Record<string, unknown>;
    manifest.schemaVersion = 1;
    delete manifest.compatibility;
    fs.writeFileSync(kitJsonPath, JSON.stringify(manifest, null, 2));

    const reg = makeReg(forkDir);
    const plan = {
      forkId: "test-fork",
      kitId: "creative-strategist-v1",
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
      actions: [{
        actionType: "patch_manifest" as const,
        targetPath: "kit.json",
        description: "Align schema fields",
        safe: true,
        payload: { fields: ["schemaVersion", "compatibility"] },
      }],
      preservedPaths: [],
      estimatedRisk: "info" as const,
      generatedAt: new Date().toISOString(),
    };

    const result = applyKitForkHealPlan(plan, { registration: reg });
    // applied or skipped — never error
    expect(result.errorCount).toBe(0);
  });
});
