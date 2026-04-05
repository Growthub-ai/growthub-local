import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Resolves the growthub-local repository root for model-training and other
 * repo-scoped tooling. Order: GH_LOCAL_ROOT, git rev-parse, then cwd.
 */
export function resolveGrowthubRepoRoot(): string {
  const fromEnv = process.env.GH_LOCAL_ROOT?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out.length > 0) return out;
  } catch {
    /* detached or not a git checkout */
  }
  return process.cwd();
}

export function resolveModelArtifactRoot(repoRoot: string): string {
  return path.join(repoRoot, ".growthub", "models");
}

export function ensureDirSync(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
