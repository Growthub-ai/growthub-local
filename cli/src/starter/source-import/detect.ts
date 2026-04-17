/**
 * Source Import Agent — deterministic project-shape detector.
 *
 * v1 is fully deterministic (no model assistance). Given a materialised
 * payload root (either a cloned GitHub repo or an unpacked skills.sh
 * skill), it inspects the filesystem for well-known signals and emits a
 * `SourceDetectionReport` that downstream consumers (plan builder,
 * summarizer, Growthub bridge overlays) can read without re-scanning
 * the tree.
 *
 * The detector NEVER mutates the payload. Its output is consumed by the
 * materializer and trace writer.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  DetectedFramework,
  DetectedRuntimeScripts,
  PackageManager,
  SourceDetectionReport,
} from "./types.js";

interface PackageJsonShape {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  packageManager?: string;
  bin?: unknown;
}

function safeReadPackageJson(dir: string): PackageJsonShape | null {
  const p = path.resolve(dir, "package.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as PackageJsonShape;
  } catch {
    return null;
  }
}

function detectPackageManager(dir: string, pkg: PackageJsonShape | null): PackageManager {
  if (pkg?.packageManager?.startsWith("pnpm")) return "pnpm";
  if (pkg?.packageManager?.startsWith("yarn")) return "yarn";
  if (pkg?.packageManager?.startsWith("npm")) return "npm";
  if (pkg?.packageManager?.startsWith("bun")) return "bun";

  if (fs.existsSync(path.resolve(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.resolve(dir, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.resolve(dir, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.resolve(dir, "package-lock.json"))) return "npm";
  return "unknown";
}

function collectDeps(pkg: PackageJsonShape | null): Set<string> {
  const deps = new Set<string>();
  if (!pkg) return deps;
  for (const map of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    if (!map) continue;
    for (const k of Object.keys(map)) deps.add(k);
  }
  return deps;
}

function looksLikeSkillPayload(rootDir: string): boolean {
  // skills.sh payloads ship a top-level SKILL.md / skill.json / skill.yml
  // (or occasionally prompt.md) with no package.json.
  const markers = ["SKILL.md", "skill.md", "skill.json", "skill.yml", "skill.yaml", "prompt.md"];
  return markers.some((name) => fs.existsSync(path.resolve(rootDir, name)));
}

function detectFramework(rootDir: string, pkg: PackageJsonShape | null): DetectedFramework {
  if (!pkg) {
    if (looksLikeSkillPayload(rootDir)) return "skill";
    if (fs.existsSync(path.resolve(rootDir, "docs"))) return "docs";
    return "unknown";
  }

  const deps = collectDeps(pkg);
  const hasViteConfig = [
    "vite.config.js",
    "vite.config.ts",
    "vite.config.mjs",
    "vite.config.cjs",
  ].some((name) => fs.existsSync(path.resolve(rootDir, name)));

  if (
    deps.has("next") ||
    fs.existsSync(path.resolve(rootDir, "next.config.js")) ||
    fs.existsSync(path.resolve(rootDir, "next.config.mjs"))
  ) {
    return "next";
  }
  if (deps.has("vite") || hasViteConfig) return "vite";
  if (deps.has("react") || deps.has("react-dom")) return "react";

  if (pkg.workspaces) return "monorepo";

  const scripts = pkg.scripts ?? {};
  if (scripts.start || scripts.dev) {
    if (
      deps.has("express") ||
      deps.has("fastify") ||
      deps.has("koa") ||
      deps.has("@fastify/autoload")
    ) {
      return "node-service";
    }
    return "node-service";
  }
  if (pkg.bin) return "cli-tool";

  return "unknown";
}

function pickScripts(pkg: PackageJsonShape | null): DetectedRuntimeScripts {
  if (!pkg?.scripts) return {};
  const out: DetectedRuntimeScripts = {};
  if (pkg.scripts.build) out.build = pkg.scripts.build;
  if (pkg.scripts.dev) out.dev = pkg.scripts.dev;
  if (pkg.scripts.start) out.start = pkg.scripts.start;
  if (pkg.scripts.test) out.test = pkg.scripts.test;
  return out;
}

function listEnvFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => name === ".env" || name.startsWith(".env.") || name === ".env.example");
}

function findAppRoot(rootDir: string, pkg: PackageJsonShape | null): string {
  if (pkg) return ".";
  const candidates = ["app", "src", "apps", "packages"];
  for (const candidate of candidates) {
    const abs = path.resolve(rootDir, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      const child = safeReadPackageJson(abs);
      if (child) return candidate;
    }
  }
  return ".";
}

function computeConfidence(
  framework: DetectedFramework,
  manager: PackageManager,
  pkg: PackageJsonShape | null,
): number {
  let score = 0;
  if (pkg) score += 0.4;
  if (framework !== "unknown") score += 0.3;
  if (manager !== "unknown") score += 0.2;
  if (pkg?.scripts) score += 0.1;
  return Math.min(1, Number(score.toFixed(2)));
}

/**
 * Produce a `SourceDetectionReport` for the materialised payload rooted at
 * `rootDir`. Pure read-only. Never mutates the payload contents.
 */
export function detectSourceShape(rootDir: string): SourceDetectionReport {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`Detection target is not a directory: ${rootDir}`);
  }

  const rootPkg = safeReadPackageJson(rootDir);
  const appRootRel = findAppRoot(rootDir, rootPkg);
  const appRootAbs = path.resolve(rootDir, appRootRel);
  const appPkg = appRootRel === "." ? rootPkg : safeReadPackageJson(appRootAbs);
  const framework = detectFramework(appRootAbs, appPkg ?? rootPkg);
  const packageManager = detectPackageManager(rootDir, rootPkg ?? appPkg);
  const scripts = pickScripts(appPkg ?? rootPkg);
  const envFiles = listEnvFiles(rootDir);
  const rootWorkspaces = rootPkg?.workspaces;
  const isMonorepo =
    Array.isArray(rootWorkspaces) ||
    (typeof rootWorkspaces === "object" && Array.isArray(rootWorkspaces?.packages));

  const warnings: string[] = [];
  if (!rootPkg && !appPkg && framework !== "skill") {
    warnings.push("No package.json found — detection falls back to filesystem heuristics.");
  }
  if (framework === "unknown") {
    warnings.push("Framework could not be detected — imported as a generic payload.");
  }
  if (envFiles.includes(".env")) {
    warnings.push("Payload ships a literal .env file — review before committing inside the workspace.");
  }
  if (!Object.keys(scripts).length && framework !== "skill") {
    warnings.push("No runnable scripts (build/dev/start/test) were detected.");
  }

  const confidence = computeConfidence(framework, packageManager, appPkg ?? rootPkg);

  return {
    framework,
    packageManager,
    appRoot: appRootRel,
    envFiles,
    isMonorepo,
    scripts,
    confidence,
    warnings,
  };
}
