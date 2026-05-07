/**
 * `growthub workspace surface` — Discover and inspect app surfaces in the governed workspace.
 *
 * Helps agents understand the apps and routes present under a governed workspace root.
 *
 *   growthub workspace surface list [--json]
 *   growthub workspace surface inspect <app-path> [--json]
 *
 * This is a read-only discovery command — no side effects.
 */

import { Command } from "commander";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

interface AppSurface {
  name: string;
  relPath: string;
  absPath: string;
  framework: "nextjs" | "vite" | "unknown";
  hasEnvExample: boolean;
  hasVercelJson: boolean;
  hasGrowthubConfig: boolean;
  entryRoutes: string[];
  packageName?: string;
}

function detectFramework(appPath: string): AppSurface["framework"] {
  const nextConfig = ["next.config.js", "next.config.mjs", "next.config.ts"];
  if (nextConfig.some((f) => fs.existsSync(path.resolve(appPath, f)))) return "nextjs";
  const viteConfig = ["vite.config.js", "vite.config.mjs", "vite.config.ts"];
  if (viteConfig.some((f) => fs.existsSync(path.resolve(appPath, f)))) return "vite";
  return "unknown";
}

function detectEntryRoutes(appPath: string): string[] {
  const candidates = [
    "app/page.jsx",
    "app/page.tsx",
    "app/page.js",
    "src/app/page.tsx",
    "pages/index.jsx",
    "pages/index.tsx",
    "pages/index.js",
    "index.html",
    "src/main.jsx",
    "src/main.tsx",
  ];
  return candidates.filter((c) => fs.existsSync(path.resolve(appPath, c)));
}

function detectPackageName(appPath: string): string | undefined {
  const pkgPath = path.resolve(appPath, "package.json");
  if (!fs.existsSync(pkgPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string };
    return parsed.name;
  } catch {
    return undefined;
  }
}

const KNOWN_APP_DIRS = [
  "apps/workspace",
  "apps/agency-portal",
  "apps/portal",
  "studio",
  "app",
  "src",
];

function discoverAppSurfaces(forkPath: string): AppSurface[] {
  const surfaces: AppSurface[] = [];

  for (const relPath of KNOWN_APP_DIRS) {
    const absPath = path.resolve(forkPath, relPath);
    if (!fs.existsSync(absPath)) continue;

    const hasPackageJson = fs.existsSync(path.resolve(absPath, "package.json"));
    const hasIndex = fs.existsSync(path.resolve(absPath, "index.html"))
      || fs.existsSync(path.resolve(absPath, "app"))
      || fs.existsSync(path.resolve(absPath, "pages"))
      || fs.existsSync(path.resolve(absPath, "src"));

    if (!hasPackageJson && !hasIndex) continue;

    surfaces.push({
      name: path.basename(relPath),
      relPath,
      absPath,
      framework: detectFramework(absPath),
      hasEnvExample: fs.existsSync(path.resolve(absPath, ".env.example")),
      hasVercelJson: fs.existsSync(path.resolve(absPath, "vercel.json")),
      hasGrowthubConfig: fs.existsSync(path.resolve(absPath, "growthub.config.json")),
      entryRoutes: detectEntryRoutes(absPath),
      packageName: detectPackageName(absPath),
    });
  }

  return surfaces;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function runSurfaceList(forkPath: string, json: boolean): void {
  const surfaces = discoverAppSurfaces(forkPath);

  if (json) {
    console.log(JSON.stringify({ forkPath, count: surfaces.length, surfaces }, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold("Workspace Surfaces"));
  console.log(pc.dim("─".repeat(60)));
  if (surfaces.length === 0) {
    console.log(pc.dim("  No app surfaces detected."));
    console.log(pc.dim("  Expected: apps/workspace, apps/agency-portal, or studio/"));
    console.log("");
    return;
  }

  for (const surface of surfaces) {
    console.log(`  ${pc.cyan(surface.relPath)} ${pc.dim(`(${surface.framework})`)}`);
    if (surface.packageName) console.log(`    ${pc.dim(`package: ${surface.packageName}`)}`);
    console.log(`    env-example: ${surface.hasEnvExample ? pc.green("yes") : pc.dim("no")}  vercel.json: ${surface.hasVercelJson ? pc.green("yes") : pc.dim("no")}  growthub.config: ${surface.hasGrowthubConfig ? pc.green("yes") : pc.dim("no")}`);
    if (surface.entryRoutes.length > 0) {
      console.log(`    routes: ${pc.dim(surface.entryRoutes.join(", "))}`);
    }
    console.log("");
  }

  console.log(pc.dim(`  Agent output: growthub workspace surface list --json`));
  console.log(pc.dim(`  Inspect:      growthub workspace surface inspect apps/workspace --json`));
  console.log("");
}

// ---------------------------------------------------------------------------
// Inspect
// ---------------------------------------------------------------------------

function runSurfaceInspect(relPath: string, forkPath: string, json: boolean): void {
  const absPath = path.resolve(forkPath, relPath);
  if (!fs.existsSync(absPath)) {
    if (json) {
      console.log(JSON.stringify({ error: `Path not found: ${absPath}` }));
      process.exitCode = 1;
    } else {
      console.error(pc.red(`Path not found: ${absPath}`));
      process.exitCode = 1;
    }
    return;
  }

  const surface: AppSurface = {
    name: path.basename(relPath),
    relPath,
    absPath,
    framework: detectFramework(absPath),
    hasEnvExample: fs.existsSync(path.resolve(absPath, ".env.example")),
    hasVercelJson: fs.existsSync(path.resolve(absPath, "vercel.json")),
    hasGrowthubConfig: fs.existsSync(path.resolve(absPath, "growthub.config.json")),
    entryRoutes: detectEntryRoutes(absPath),
    packageName: detectPackageName(absPath),
  };

  if (json) {
    console.log(JSON.stringify(surface, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold(`Surface: ${surface.relPath}`));
  console.log(pc.dim("─".repeat(60)));
  console.log(`  Framework:       ${surface.framework}`);
  if (surface.packageName) console.log(`  Package:         ${surface.packageName}`);
  console.log(`  .env.example:    ${surface.hasEnvExample ? pc.green("yes") : pc.dim("no")}`);
  console.log(`  vercel.json:     ${surface.hasVercelJson ? pc.green("yes") : pc.dim("no")}`);
  console.log(`  growthub.config: ${surface.hasGrowthubConfig ? pc.green("yes") : pc.dim("no")}`);
  if (surface.entryRoutes.length > 0) {
    console.log(`  Entry routes:`);
    for (const r of surface.entryRoutes) {
      console.log(`    ${pc.dim(r)}`);
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkspaceSurfaceCommands(workspaceCmd: Command): void {
  const surface = workspaceCmd
    .command("surface")
    .description("Discover and inspect app surfaces in the governed workspace");

  surface
    .command("list")
    .description("List all detected app surfaces (Next.js apps, Vite studio, etc.)")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--json", "Emit machine-readable JSON")
    .addHelpText("after", `
Examples:
  $ growthub workspace surface list
  $ growthub workspace surface list --json
  $ growthub workspace surface list --fork ./my-workspace --json
`)
    .action((opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
      runSurfaceList(forkPath, opts.json ?? false);
    });

  surface
    .command("inspect")
    .description("Inspect a specific app surface path")
    .argument("<app-path>", "Relative path to the app (e.g. apps/workspace)")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--json", "Emit machine-readable JSON")
    .addHelpText("after", `
Examples:
  $ growthub workspace surface inspect apps/workspace
  $ growthub workspace surface inspect apps/workspace --json
  $ growthub workspace surface inspect studio --json
`)
    .action((appPath: string, opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
      runSurfaceInspect(appPath, forkPath, opts.json ?? false);
    });
}
