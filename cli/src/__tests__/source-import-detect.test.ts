/**
 * Source Import Agent — detect.ts tests.
 *
 * Covers: framework detection, package-manager detection, app-root walk,
 * skill payload detection, env-file listing, warnings.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectSourceShape } from "../starter/source-import/detect.js";

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

describe("detectSourceShape", () => {
  it("throws when target is not a directory", () => {
    expect(() => detectSourceShape("/nonexistent/path/xyz")).toThrow();
  });

  it("flags vite + pnpm projects", () => {
    const dir = track(makeTempDir("det-vite-"));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "app",
        scripts: { dev: "vite", build: "vite build" },
        dependencies: { vite: "^5.0.0", react: "^18.0.0" },
      }),
    );
    fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 6");
    const report = detectSourceShape(dir);
    expect(report.framework).toBe("vite");
    expect(report.packageManager).toBe("pnpm");
    expect(report.scripts.dev).toBe("vite");
    expect(report.confidence).toBeGreaterThan(0);
  });

  it("detects next framework by config file", () => {
    const dir = track(makeTempDir("det-next-"));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "nx", scripts: { dev: "next dev" } }),
    );
    fs.writeFileSync(path.join(dir, "next.config.js"), "module.exports = {};");
    const report = detectSourceShape(dir);
    expect(report.framework).toBe("next");
  });

  it("detects skill payloads by SKILL.md marker", () => {
    const dir = track(makeTempDir("det-skill-"));
    fs.writeFileSync(path.join(dir, "SKILL.md"), "# skill");
    fs.writeFileSync(path.join(dir, "prompt.md"), "system prompt");
    const report = detectSourceShape(dir);
    expect(report.framework).toBe("skill");
    expect(report.packageManager).toBe("unknown");
  });

  it("surfaces monorepo workspaces", () => {
    const dir = track(makeTempDir("det-mono-"));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
    );
    const report = detectSourceShape(dir);
    expect(report.isMonorepo).toBe(true);
  });

  it("lists .env files and warns on bare .env", () => {
    const dir = track(makeTempDir("det-env-"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "e", scripts: { start: "node ." } }));
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=abc");
    fs.writeFileSync(path.join(dir, ".env.example"), "SECRET=");
    const report = detectSourceShape(dir);
    expect(report.envFiles).toContain(".env");
    expect(report.envFiles).toContain(".env.example");
    expect(report.warnings.join(" ")).toMatch(/\.env/);
  });

  it("falls back to unknown with warnings when no package.json", () => {
    const dir = track(makeTempDir("det-unk-"));
    fs.writeFileSync(path.join(dir, "README.md"), "# readme");
    const report = detectSourceShape(dir);
    expect(report.framework).toBe("unknown");
    expect(report.packageManager).toBe("unknown");
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("walks into app-root candidate when root has no package.json", () => {
    const dir = track(makeTempDir("det-approot-"));
    fs.mkdirSync(path.join(dir, "app"));
    fs.writeFileSync(
      path.join(dir, "app", "package.json"),
      JSON.stringify({ name: "inner", scripts: { dev: "node ." } }),
    );
    const report = detectSourceShape(dir);
    expect(report.appRoot).toBe("app");
  });
});
