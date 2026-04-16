import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listRegisteredKitForks,
  planKitForkSync,
  prepareKitForkSyncJob,
  readKitForkSyncJob,
  registerKitFork,
  runPreparedKitForkSyncJob,
} from "../kits/fork-sync.js";

const ORIGINAL_ENV = { ...process.env };

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeText(filePath: string, text: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function sourceCreativeKitRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../assets/worker-kits/creative-strategist-v1",
  );
}

function seedAuxiliaryKitFiles(kitRoot: string): void {
  writeText(
    path.resolve(kitRoot, "SYNC_NOTES.md"),
    [
      "alpha",
      "bravo",
      "charlie",
      "",
    ].join("\n"),
  );
  writeText(
    path.resolve(kitRoot, "CONFLICT.md"),
    [
      "shared line",
      "",
    ].join("\n"),
  );
  writeJson(path.resolve(kitRoot, "package.json"), {
    name: "creative-fork-kit",
    version: "1.0.0",
    private: true,
    dependencies: {
      alpha: "1.0.0",
      beta: "1.0.0",
    },
  });
}

function createBundledKitFixture(): { bundledAssetsRoot: string; bundledKitRoot: string } {
  const bundledAssetsRoot = makeTempDir("growthub-bundled-kits-");
  const bundledKitRoot = path.resolve(bundledAssetsRoot, "creative-strategist-v1");
  fs.cpSync(sourceCreativeKitRoot(), bundledKitRoot, { recursive: true });
  seedAuxiliaryKitFiles(bundledKitRoot);
  return { bundledAssetsRoot, bundledKitRoot };
}

function ensureMainBranch(repoRoot: string): void {
  const current = execFileSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (current === "main") return;
  execFileSync("git", ["checkout", "-b", "main"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function initGitRepo(repoRoot: string): void {
  execFileSync("git", ["init"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  execFileSync("git", ["config", "user.email", "kit-sync@example.com"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  execFileSync("git", ["config", "user.name", "Kit Sync Test"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  ensureMainBranch(repoRoot);
}

function commitAll(repoRoot: string, message: string): void {
  execFileSync("git", ["add", "."], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  execFileSync("git", ["commit", "-m", message], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function setupForkRepo(bundledKitRoot: string): { repoRoot: string; forkPath: string } {
  const repoRoot = makeTempDir("growthub-fork-repo-");
  initGitRepo(repoRoot);
  const forkPath = path.resolve(repoRoot, "forks", "creative-strategist-v1");
  fs.cpSync(bundledKitRoot, forkPath, { recursive: true });
  commitAll(repoRoot, "chore: seed worker kit fork");
  return { repoRoot, forkPath };
}

function bumpBundledKitVersion(bundledKitRoot: string, version: string): void {
  const manifestPath = path.resolve(bundledKitRoot, "kit.json");
  const bundlePath = path.resolve(bundledKitRoot, "bundles", "creative-strategist-v1.json");
  const manifest = readJson<Record<string, unknown>>(manifestPath);
  const bundle = readJson<Record<string, unknown>>(bundlePath);
  const manifestKit = manifest.kit as Record<string, unknown>;
  const bundleMeta = bundle.bundle as Record<string, unknown>;
  manifestKit.version = version;
  bundleMeta.version = version;
  writeJson(manifestPath, manifest);
  writeJson(bundlePath, bundle);
}

describe("worker kit fork sync service", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("merges upstream updates into a fork while preserving local customization", async () => {
    const paperclipHome = makeTempDir("growthub-paperclip-home-");
    const { bundledAssetsRoot, bundledKitRoot } = createBundledKitFixture();
    const { repoRoot, forkPath } = setupForkRepo(bundledKitRoot);
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.GROWTHUB_BUNDLED_KIT_ASSETS_ROOT = bundledAssetsRoot;

    const registration = registerKitFork({
      forkId: "creative-fork",
      kitId: "creative-strategist-v1",
      forkPath,
      baseBranch: "main",
      branchPrefix: "sync",
    });

    writeText(
      path.resolve(forkPath, "SYNC_NOTES.md"),
      [
        "alpha fork",
        "bravo",
        "charlie",
        "",
      ].join("\n"),
    );
    writeText(path.resolve(forkPath, "LOCAL_ONLY.md"), "keep local customization\n");
    writeJson(path.resolve(forkPath, "package.json"), {
      name: "creative-fork-kit",
      version: "1.0.0",
      private: true,
      dependencies: {
        alpha: "1.0.0",
        beta: "2.0.0",
        gamma: "1.0.0",
      },
    });
    commitAll(repoRoot, "feat: customize forked worker kit");

    writeText(
      path.resolve(bundledKitRoot, "SYNC_NOTES.md"),
      [
        "alpha",
        "bravo",
        "charlie upstream",
        "",
      ].join("\n"),
    );
    writeJson(path.resolve(bundledKitRoot, "package.json"), {
      name: "creative-fork-kit",
      version: "1.1.0",
      private: true,
      dependencies: {
        alpha: "1.1.0",
        beta: "1.0.0",
        delta: "1.0.0",
      },
    });
    bumpBundledKitVersion(bundledKitRoot, "1.0.1");

    const plan = planKitForkSync("creative-fork");
    expect(plan.dirtyWorkingTree).toBe(false);
    expect(plan.localOnlyFiles).toContain("LOCAL_ONLY.md");
    expect(plan.packageJsonFiles).toContain("package.json");

    const preparedJob = prepareKitForkSyncJob("creative-fork");
    const completedJob = await runPreparedKitForkSyncJob(preparedJob.id);
    expect(completedJob.status).toBe("succeeded");
    expect(completedJob.summary?.commitCreated).toBe(true);
    expect(completedJob.summary?.conflictFiles).toEqual([]);
    expect(completedJob.summary?.validationErrors).toEqual([]);

    const syncedForkPath = path.resolve(completedJob.worktreePath, registration.registration.repoRelativePath);
    const mergedNotes = fs.readFileSync(path.resolve(syncedForkPath, "SYNC_NOTES.md"), "utf8");
    expect(mergedNotes).toContain("alpha fork");
    expect(mergedNotes).toContain("charlie upstream");
    expect(fs.existsSync(path.resolve(syncedForkPath, "LOCAL_ONLY.md"))).toBe(true);

    const mergedPackage = readJson<{
      version: string;
      dependencies: Record<string, string>;
    }>(path.resolve(syncedForkPath, "package.json"));
    expect(mergedPackage.version).toBe("1.1.0");
    expect(mergedPackage.dependencies.alpha).toBe("1.1.0");
    expect(mergedPackage.dependencies.beta).toBe("2.0.0");
    expect(mergedPackage.dependencies.gamma).toBe("1.0.0");
    expect(mergedPackage.dependencies.delta).toBe("1.0.0");

    const committedSubject = execFileSync("git", ["log", "-1", "--pretty=%s"], {
      cwd: completedJob.worktreePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    expect(committedSubject).toContain("sync(kit): heal creative-fork");
    expect(readKitForkSyncJob(preparedJob.id)?.status).toBe("succeeded");

    const updatedRegistration = listRegisteredKitForks().find((entry) => entry.id === "creative-fork");
    expect(updatedRegistration?.lastSyncedUpstreamVersion).toBe("1.0.1");
    expect(updatedRegistration?.baselineVersion).toBe("1.0.1");
  });

  it("marks the job for review when upstream and fork conflict on the same file", async () => {
    const paperclipHome = makeTempDir("growthub-paperclip-home-");
    const { bundledAssetsRoot, bundledKitRoot } = createBundledKitFixture();
    const { repoRoot, forkPath } = setupForkRepo(bundledKitRoot);
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.GROWTHUB_BUNDLED_KIT_ASSETS_ROOT = bundledAssetsRoot;

    registerKitFork({
      forkId: "creative-conflict",
      kitId: "creative-strategist-v1",
      forkPath,
      baseBranch: "main",
      branchPrefix: "sync",
    });

    writeText(path.resolve(forkPath, "CONFLICT.md"), "fork keeps this line\n");
    commitAll(repoRoot, "feat: local conflict change");

    writeText(path.resolve(bundledKitRoot, "CONFLICT.md"), "upstream replaces this line\n");
    bumpBundledKitVersion(bundledKitRoot, "1.0.2");

    const preparedJob = prepareKitForkSyncJob("creative-conflict");
    const completedJob = await runPreparedKitForkSyncJob(preparedJob.id);

    expect(completedJob.status).toBe("needs_review");
    expect(completedJob.summary?.commitCreated).toBe(false);
    expect(completedJob.summary?.conflictFiles).toContain("CONFLICT.md");
    expect(fs.existsSync(completedJob.reportPath)).toBe(true);
    expect(fs.existsSync(completedJob.skillPath)).toBe(true);

    const conflictedContent = fs.readFileSync(
      path.resolve(completedJob.worktreePath, "forks", "creative-strategist-v1", "CONFLICT.md"),
      "utf8",
    );
    expect(conflictedContent).toContain("<<<<<<< fork");
    expect(readKitForkSyncJob(preparedJob.id)?.status).toBe("needs_review");

    const updatedRegistration = listRegisteredKitForks().find((entry) => entry.id === "creative-conflict");
    expect(updatedRegistration?.lastSyncedUpstreamVersion).toBeNull();
  });

  it("blocks detached sync jobs when the registered fork has uncommitted changes", () => {
    const paperclipHome = makeTempDir("growthub-paperclip-home-");
    const { bundledAssetsRoot, bundledKitRoot } = createBundledKitFixture();
    const { forkPath } = setupForkRepo(bundledKitRoot);
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.GROWTHUB_BUNDLED_KIT_ASSETS_ROOT = bundledAssetsRoot;

    registerKitFork({
      forkId: "creative-dirty",
      kitId: "creative-strategist-v1",
      forkPath,
      baseBranch: "main",
      branchPrefix: "sync",
    });

    writeText(path.resolve(forkPath, "DIRTY.md"), "needs commit first\n");

    const plan = planKitForkSync("creative-dirty");
    expect(plan.dirtyWorkingTree).toBe(true);
    expect(() => prepareKitForkSyncJob("creative-dirty")).toThrow(/uncommitted changes/i);
  });
});
