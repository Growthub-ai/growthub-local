import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildTreeSnapshot,
  classifyFile,
  computeDriftSummary,
  mergePackageJson,
} from "../kits/sync/index.js";
import {
  executeSyncJob,
  initForkSync,
  listJobs,
  listRegisteredForks,
  planForkSync,
  resolveRegistryPath,
  startSyncJob,
} from "../kits/sync/service.js";
import { copyBundledKitSource, getBundledKitSource } from "../kits/service.js";

const ORIGINAL_ENV = { ...process.env };

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function snapshotOf(entries: Array<[string, string]>): ReturnType<typeof buildTreeSnapshot> {
  return buildTreeSnapshot(entries.map(([p, hash]) => ({ path: p, hash })));
}

describe("fork sync — drift classification", () => {
  const baseline = snapshotOf([
    ["a.txt", "a1"],
    ["b.txt", "b1"],
    ["c.txt", "c1"],
    ["shared/frozen.md", "f1"],
  ]);
  const upstream = snapshotOf([
    ["a.txt", "a2"],
    ["b.txt", "b1"],
    ["d.txt", "d1"],
    ["shared/frozen.md", "f1"],
  ]);
  const fork = snapshotOf([
    ["a.txt", "a1"],
    ["b.txt", "bLocal"],
    ["c.txt", "c1"],
    ["local.md", "local"],
    ["shared/frozen.md", "fLocal"],
  ]);

  it("classifies each path against the three trees", () => {
    expect(classifyFile("a.txt", baseline, upstream, fork)).toBe("upstream-modified");
    expect(classifyFile("b.txt", baseline, upstream, fork)).toBe("local-modified");
    expect(classifyFile("c.txt", baseline, upstream, fork)).toBe("upstream-removed");
    expect(classifyFile("d.txt", baseline, upstream, fork)).toBe("upstream-only");
    expect(classifyFile("local.md", baseline, upstream, fork)).toBe("local-only");
    expect(classifyFile("shared/frozen.md", baseline, upstream, fork)).toBe("local-modified");
  });

  it("builds a drift summary with actionable totals", () => {
    const summary = computeDriftSummary({
      kitId: "kit",
      forkId: "fork",
      baseline,
      upstream,
      fork,
      baselineVersion: "1.0.0",
      upstreamVersion: "1.1.0",
      frozenPaths: ["shared/frozen.md"],
    });

    expect(summary.totals.applyUpstream).toBeGreaterThan(0);
    expect(summary.totals.preserveLocal).toBeGreaterThan(0);
    expect(summary.entries.find((entry) => entry.path === "a.txt")?.action).toBe("apply-upstream");
    expect(summary.entries.find((entry) => entry.path === "shared/frozen.md")?.frozen).toBe(true);
    expect(summary.entries.find((entry) => entry.path === "c.txt")?.action).toBe("preserve-local");
  });

  it("flags both-sides conflicts for review and handles package.json specially", () => {
    const baseline = snapshotOf([["package.json", "p1"], ["src/x.ts", "x1"]]);
    const upstream = snapshotOf([["package.json", "p2"], ["src/x.ts", "x2"]]);
    const fork = snapshotOf([["package.json", "p3"], ["src/x.ts", "xLocal"]]);
    const summary = computeDriftSummary({
      kitId: "kit",
      forkId: "fork",
      baseline,
      upstream,
      fork,
      baselineVersion: "1.0.0",
      upstreamVersion: "1.1.0",
      frozenPaths: [],
    });
    expect(summary.entries.find((entry) => entry.path === "package.json")?.action).toBe("merge-package-json");
    expect(summary.entries.find((entry) => entry.path === "src/x.ts")?.action).toBe("escalate-review");
  });
});

describe("fork sync — package.json merge", () => {
  it("adopts upstream dependency bumps while preserving local-only deps", () => {
    const baseline = JSON.stringify({
      name: "kit", version: "1.0.0",
      dependencies: { react: "18.0.0", zod: "3.0.0" },
    });
    const upstream = JSON.stringify({
      name: "kit", version: "1.1.0",
      dependencies: { react: "18.2.0", zod: "3.0.0", "new-dep": "1.0.0" },
    });
    const fork = JSON.stringify({
      name: "kit", version: "1.0.0",
      dependencies: { react: "18.0.0", zod: "3.0.0", "my-local-dep": "2.0.0" },
    });
    const { merged, trace } = mergePackageJson(baseline, upstream, fork);
    expect((merged.dependencies as Record<string, string>).react).toBe("18.2.0");
    expect((merged.dependencies as Record<string, string>)["my-local-dep"]).toBe("2.0.0");
    expect((merged.dependencies as Record<string, string>)["new-dep"]).toBe("1.0.0");
    expect(merged.version).toBe("1.1.0");
    expect(trace.some((entry) => entry.field === "dependencies.react" && entry.action === "apply-upstream")).toBe(true);
    expect(trace.some((entry) => entry.field === "dependencies.my-local-dep" && entry.action === "add-local")).toBe(true);
  });

  it("keeps locally customized scripts and records the trace", () => {
    const baseline = JSON.stringify({ name: "k", scripts: { test: "vitest" } });
    const upstream = JSON.stringify({ name: "k", scripts: { test: "vitest --coverage" } });
    const fork = JSON.stringify({ name: "k", scripts: { test: "vitest --reporter=dot" } });
    const { merged, trace } = mergePackageJson(baseline, upstream, fork);
    expect((merged.scripts as Record<string, string>).test).toBe("vitest --reporter=dot");
    expect(trace.some((entry) => entry.field === "scripts.test" && entry.action === "keep-local")).toBe(true);
  });
});

describe("fork sync — service lifecycle", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.PAPERCLIP_HOME = makeTempDir("paperclip-home-sync-");
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function materializeFork(kitId: string): string {
    const target = makeTempDir("fork-");
    copyBundledKitSource(kitId, target);
    return target;
  }

  it("initializes a fork registration and writes a registry entry", () => {
    const forkPath = materializeFork("creative-strategist-v1");
    const init = initForkSync({ kitId: "creative-strategist-v1", forkPath, forkId: "my-fork" });

    expect(init.record.forkId).toBe("my-fork");
    expect(init.record.kitId).toBe("creative-strategist-v1");
    expect(init.record.forkPath).toBe(forkPath);

    const registryPath = resolveRegistryPath();
    expect(fs.existsSync(registryPath)).toBe(true);
    expect(listRegisteredForks().map((record) => record.forkId)).toContain("my-fork");
    expect(fs.existsSync(init.baselineRoot)).toBe(true);
  });

  it("reports zero actionable drift when the fork matches upstream", () => {
    const forkPath = materializeFork("creative-strategist-v1");
    initForkSync({ kitId: "creative-strategist-v1", forkPath, forkId: "clean-fork" });
    const plan = planForkSync("clean-fork");
    const actionable = plan.summary.entries.filter((entry) => entry.action !== "noop");
    expect(actionable).toHaveLength(0);
    expect(plan.summary.totals.unchanged).toBeGreaterThan(0);
  });

  it("surfaces a local-only file as preserve-local drift", () => {
    const forkPath = materializeFork("creative-strategist-v1");
    initForkSync({ kitId: "creative-strategist-v1", forkPath, forkId: "custom-fork" });
    fs.writeFileSync(path.join(forkPath, "custom.md"), "user content", "utf8");
    const plan = planForkSync("custom-fork");
    const entry = plan.summary.entries.find((item) => item.path === "custom.md");
    expect(entry?.action).toBe("preserve-local");
  });

  it("runs a plan-only (no auto-apply) sync job and writes a report that flags escalations", () => {
    const forkPath = materializeFork("creative-strategist-v1");
    initForkSync({ kitId: "creative-strategist-v1", forkPath, forkId: "job-fork" });

    const source = getBundledKitSource("creative-strategist-v1");
    const contractFile = source.frozenAssetPaths.find((p) => p.endsWith("CLAUDE.md"))
      ?? source.relativeFiles.find((p) => p.endsWith(".md"))
      ?? source.relativeFiles[0];
    fs.writeFileSync(path.join(forkPath, contractFile), "# fork customized\n", "utf8");

    const { state } = startSyncJob({ forkId: "job-fork", autoApply: false, detach: false });
    expect(state.status).toBe("needs-review");
    expect(fs.existsSync(state.reportPath)).toBe(true);
    expect(fs.readFileSync(state.reportPath, "utf8")).toContain("Fork Sync Report");

    const jobs = listJobs("job-fork");
    expect(jobs).toHaveLength(1);
  });

  it("auto-applies upstream drift into the fork and advances the baseline", () => {
    const forkPath = materializeFork("creative-strategist-v1");
    const init = initForkSync({ kitId: "creative-strategist-v1", forkPath, forkId: "advance-fork" });

    const source = getBundledKitSource("creative-strategist-v1");
    const candidate = source.relativeFiles.find((p) => p.endsWith(".md") && !source.frozenAssetPaths.includes(p))
      ?? source.relativeFiles.find((p) => !source.frozenAssetPaths.includes(p));
    expect(candidate).toBeDefined();

    const baselineRoot = init.baselineRoot;
    fs.writeFileSync(path.join(baselineRoot, candidate!), "OLD BASELINE CONTENT\n", "utf8");
    fs.writeFileSync(path.join(forkPath, candidate!), "OLD BASELINE CONTENT\n", "utf8");

    const jobId = "test-job-1";
    const state = executeSyncJob({ forkId: "advance-fork", jobId, autoApply: true, mode: "inline" });
    expect(state.status === "succeeded" || state.status === "needs-review").toBe(true);
    expect(state.summary?.applied).toBeGreaterThanOrEqual(1);

    const upstreamContent = fs.readFileSync(path.join(source.assetRoot, candidate!), "utf8");
    const forkContent = fs.readFileSync(path.join(forkPath, candidate!), "utf8");
    expect(forkContent).toBe(upstreamContent);
  });
});
