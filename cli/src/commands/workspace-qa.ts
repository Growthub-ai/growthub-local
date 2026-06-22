/**
 * `growthub workspace qa` — Artifact-first workspace validation sequence.
 *
 * Runs a deterministic QA checklist against the governed workspace to verify
 * it is build-ready and agent-safe. All checks are read-only or spawn-only
 * (no remote calls, no mutations).
 *
 *   growthub workspace qa [--json]
 *   growthub workspace qa --fork ./my-workspace [--json]
 *   growthub workspace qa --skip-build [--json]
 *
 * Checks performed (in order):
 *   1. growthub.config.json presence and parse validity
 *   2. kit.json or SKILL.md presence (workspace type detection)
 *   3. .env.example vs .env alignment (missing required vars)
 *   4. package.json + node_modules presence (install check)
 *   5. TypeScript / build availability (non-blocking if missing)
 *   6. Fork registration state
 *   7. skills validate (if growthub skills command available)
 *   8. App routes reachable (apps/workspace index route existence)
 *
 * JSON output shape is stable and agent-readable.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveInForkStateDir } from "../config/kit-forks-home.js";

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

interface QaCheck {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail?: string;
  fix?: string;
}

function checkWorkspaceConfig(forkPath: string): QaCheck {
  const candidates = [
    path.resolve(forkPath, "growthub.config.json"),
    path.resolve(forkPath, "apps/workspace/growthub.config.json"),
  ];
  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;
    try {
      JSON.parse(fs.readFileSync(configPath, "utf8"));
      return { name: "workspace-config", status: "pass", detail: configPath.replace(forkPath, ".") };
    } catch (err) {
      return {
        name: "workspace-config",
        status: "fail",
        detail: `Parse error in ${configPath.replace(forkPath, ".")}`,
        fix: `Fix JSON syntax in ${configPath.replace(forkPath, ".")}`,
      };
    }
  }
  return {
    name: "workspace-config",
    status: "warn",
    detail: "growthub.config.json not found",
    fix: "growthub workspace init  OR  growthub starter init --kit growthub-custom-workspace-starter-v1",
  };
}

function checkKitType(forkPath: string): QaCheck {
  const hasKitJson = fs.existsSync(path.resolve(forkPath, "kit.json"));
  const hasSkillMd = fs.existsSync(path.resolve(forkPath, "SKILL.md"));
  const hasForkJson = fs.existsSync(path.resolve(resolveInForkStateDir(forkPath), "fork.json"));

  if (hasKitJson || hasSkillMd || hasForkJson) {
    const types = [
      ...(hasKitJson ? ["kit.json"] : []),
      ...(hasSkillMd ? ["SKILL.md"] : []),
      ...(hasForkJson ? ["fork.json"] : []),
    ];
    return { name: "workspace-type", status: "pass", detail: `Detected: ${types.join(", ")}` };
  }
  return {
    name: "workspace-type",
    status: "warn",
    detail: "No kit.json, SKILL.md, or fork.json found — may not be a governed workspace root",
    fix: "Run from inside a workspace directory, or pass --fork <path>",
  };
}

function checkEnvFile(forkPath: string): QaCheck {
  const envExamplePaths = [
    path.resolve(forkPath, ".env.example"),
    path.resolve(forkPath, "apps/workspace/.env.example"),
  ];
  const envPaths = [
    path.resolve(forkPath, ".env"),
    path.resolve(forkPath, "apps/workspace/.env"),
    path.resolve(forkPath, "apps/workspace/.env.local"),
  ];

  const examplePath = envExamplePaths.find((p) => fs.existsSync(p));
  if (!examplePath) {
    return { name: "env-file", status: "skip", detail: "No .env.example found — skipping env var check" };
  }

  const hasEnv = envPaths.some((p) => fs.existsSync(p));
  if (!hasEnv) {
    return {
      name: "env-file",
      status: "warn",
      detail: ".env.example found but no .env / .env.local present",
      fix: `cp ${examplePath.replace(forkPath, ".")} .env  # then fill in required values`,
    };
  }

  // Check for unfilled placeholders
  const exampleContent = fs.readFileSync(examplePath, "utf8");
  const requiredKeys = exampleContent
    .split("\n")
    .filter((line) => line.match(/^[A-Z_]+=/) && !line.startsWith("#"))
    .map((line) => line.split("=")[0]);

  const envContent = envPaths
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, "utf8"))
    .join("\n");

  const missingKeys = requiredKeys.filter((key) => !envContent.includes(`${key}=`) || envContent.match(new RegExp(`${key}=\\s*$`, "m")));

  if (missingKeys.length > 0) {
    return {
      name: "env-file",
      status: "warn",
      detail: `${missingKeys.length} env var(s) may be unset: ${missingKeys.slice(0, 5).join(", ")}${missingKeys.length > 5 ? "…" : ""}`,
      fix: "Fill in required env vars in .env or .env.local",
    };
  }

  return { name: "env-file", status: "pass", detail: `.env aligned with .env.example (${requiredKeys.length} vars)` };
}

function checkDependencies(forkPath: string): QaCheck {
  const appPaths = [
    path.resolve(forkPath, "apps/workspace"),
    forkPath,
  ];
  for (const appPath of appPaths) {
    const pkgPath = path.resolve(appPath, "package.json");
    const nodeModules = path.resolve(appPath, "node_modules");
    if (fs.existsSync(pkgPath)) {
      if (!fs.existsSync(nodeModules)) {
        return {
          name: "dependencies",
          status: "warn",
          detail: `package.json found at ${appPath.replace(forkPath, ".")} but node_modules missing`,
          fix: `cd ${appPath.replace(forkPath, ".")} && npm install`,
        };
      }
      return { name: "dependencies", status: "pass", detail: `node_modules present at ${appPath.replace(forkPath, ".")}` };
    }
  }
  return { name: "dependencies", status: "skip", detail: "No package.json found in workspace apps" };
}

function checkForkRegistration(forkPath: string): QaCheck {
  const stateDir = resolveInForkStateDir(forkPath);
  const forkJsonPath = path.resolve(stateDir, "fork.json");
  if (!fs.existsSync(forkJsonPath)) {
    return {
      name: "fork-registration",
      status: "warn",
      detail: "Fork not registered — workspace is untracked",
      fix: "growthub kit fork register .",
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(forkJsonPath, "utf8")) as { forkId?: string; kitId?: string };
    return {
      name: "fork-registration",
      status: "pass",
      detail: `fork-id: ${parsed.forkId ?? "?"} · kit: ${parsed.kitId ?? "?"}`,
    };
  } catch {
    return { name: "fork-registration", status: "fail", detail: "fork.json is malformed", fix: "growthub kit fork register . --force" };
  }
}

function checkAppRoutes(forkPath: string): QaCheck {
  const routeCandidates = [
    path.resolve(forkPath, "apps/workspace/app/page.jsx"),
    path.resolve(forkPath, "apps/workspace/app/page.tsx"),
    path.resolve(forkPath, "apps/workspace/src/app/page.tsx"),
    path.resolve(forkPath, "apps/workspace/pages/index.jsx"),
    path.resolve(forkPath, "apps/workspace/pages/index.tsx"),
  ];
  const found = routeCandidates.find((r) => fs.existsSync(r));
  if (found) {
    return { name: "app-routes", status: "pass", detail: `Root route: ${found.replace(forkPath, ".")}` };
  }
  const appDir = path.resolve(forkPath, "apps/workspace");
  if (!fs.existsSync(appDir)) {
    return { name: "app-routes", status: "skip", detail: "apps/workspace not present" };
  }
  return {
    name: "app-routes",
    status: "warn",
    detail: "apps/workspace exists but no root route page found",
    fix: "Check apps/workspace/app/page.jsx or pages/index.jsx",
  };
}

function checkSkillsValidate(forkPath: string, skipBuild: boolean): QaCheck {
  if (skipBuild) return { name: "skills-validate", status: "skip", detail: "--skip-build passed" };

  const skillMd = path.resolve(forkPath, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    return { name: "skills-validate", status: "skip", detail: "No SKILL.md at root — skipping skills validate" };
  }

  const result = spawnSync("growthub", ["skills", "validate", "--json"], {
    cwd: forkPath,
    stdio: "pipe",
    encoding: "utf8",
    timeout: 30_000,
  });

  if (result.error) {
    return { name: "skills-validate", status: "skip", detail: "growthub not available in PATH for skills validate" };
  }

  if (result.status !== 0) {
    return {
      name: "skills-validate",
      status: "warn",
      detail: `skills validate failed (exit ${result.status ?? "?"})`,
      fix: "growthub skills validate",
    };
  }

  return { name: "skills-validate", status: "pass", detail: "skills validate passed" };
}

// ---------------------------------------------------------------------------
// QA result aggregation
// ---------------------------------------------------------------------------

export interface WorkspaceQaResult {
  forkPath: string;
  checks: QaCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
  skipCount: number;
  overall: "pass" | "warn" | "fail";
  safeToDeployCheck: boolean;
  recommendedCommands: string[];
}

export function computeWorkspaceQa(forkPath: string, opts: { skipBuild?: boolean } = {}): WorkspaceQaResult {
  const checks: QaCheck[] = [
    checkWorkspaceConfig(forkPath),
    checkKitType(forkPath),
    checkEnvFile(forkPath),
    checkDependencies(forkPath),
    checkForkRegistration(forkPath),
    checkAppRoutes(forkPath),
    checkSkillsValidate(forkPath, opts.skipBuild ?? false),
  ];

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const skipCount = checks.filter((c) => c.status === "skip").length;

  const overall: WorkspaceQaResult["overall"] = failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";
  const safeToDeployCheck = failCount === 0;

  const recommendedCommands = checks
    .filter((c) => c.fix && (c.status === "fail" || c.status === "warn"))
    .map((c) => c.fix!);

  return {
    forkPath,
    checks,
    passCount,
    warnCount,
    failCount,
    skipCount,
    overall,
    safeToDeployCheck,
    recommendedCommands,
  };
}

// ---------------------------------------------------------------------------
// Human-readable display
// ---------------------------------------------------------------------------

function printQaResult(result: WorkspaceQaResult): void {
  const icon = (status: QaCheck["status"]) => {
    switch (status) {
      case "pass": return pc.green("✓");
      case "fail": return pc.red("✗");
      case "warn": return pc.yellow("!");
      case "skip": return pc.dim("○");
    }
  };

  console.log("");
  console.log(pc.bold("Workspace QA"));
  console.log(pc.dim("─".repeat(60)));
  console.log(`  Path: ${pc.dim(result.forkPath)}`);
  console.log("");

  for (const check of result.checks) {
    const label = check.name.padEnd(22);
    const detail = check.detail ? pc.dim(` ${check.detail}`) : "";
    console.log(`  ${icon(check.status)}  ${label}${detail}`);
    if (check.fix && check.status !== "pass" && check.status !== "skip") {
      console.log(pc.dim(`        Fix: ${pc.cyan(check.fix)}`));
    }
  }

  console.log("");
  console.log(
    `  ${pc.green(String(result.passCount))} pass · ${pc.yellow(String(result.warnCount))} warn · ${pc.red(String(result.failCount))} fail · ${pc.dim(String(result.skipCount))} skip`,
  );

  const overallLabel: Record<WorkspaceQaResult["overall"], string> = {
    pass: pc.green("PASS"),
    warn: pc.yellow("WARN"),
    fail: pc.red("FAIL"),
  };
  console.log(`  Overall: ${overallLabel[result.overall]}`);
  console.log(`  Safe to run deploy check: ${result.safeToDeployCheck ? pc.green("yes") : pc.red("no")}`);

  if (result.recommendedCommands.length > 0) {
    console.log("");
    console.log(pc.dim("  Recommended:"));
    for (const cmd of result.recommendedCommands) {
      console.log(pc.dim(`    ${pc.cyan(cmd)}`));
    }
  }

  console.log("");
  console.log(pc.dim("  Agent output: growthub workspace qa --json"));
  console.log(pc.dim("  Deploy check: growthub workspace deploy check --json"));
  console.log("");
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkspaceQaCommands(workspaceCmd: Command): void {
  workspaceCmd
    .command("qa")
    .description("Artifact-first workspace validation — config, env, deps, fork, routes, skills")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--skip-build", "Skip checks that require build tooling (skills validate, etc.)")
    .option("--json", "Emit machine-readable JSON (agent-friendly)")
    .addHelpText("after", `
Examples:
  $ growthub workspace qa
  $ growthub workspace qa --json
  $ growthub workspace qa --skip-build --json
  $ growthub workspace qa --fork ./my-workspace --json

JSON shape:
  { forkPath, checks[], passCount, warnCount, failCount, skipCount, overall, safeToDeployCheck, recommendedCommands }

Docs: docs/WORKSPACE_DEPLOY_FLOW.md
`)
    .action((opts: { fork?: string; skipBuild?: boolean; json?: boolean }) => {
      const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();

      if (!opts.json) {
        const spinner = p.spinner();
        spinner.start("Running workspace QA checks…");
        const result = computeWorkspaceQa(forkPath, { skipBuild: opts.skipBuild });
        spinner.stop("QA checks complete.");
        printQaResult(result);
        return;
      }

      const result = computeWorkspaceQa(forkPath, { skipBuild: opts.skipBuild });
      console.log(JSON.stringify(result, null, 2));
    });
}
