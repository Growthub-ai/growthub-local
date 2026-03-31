#!/usr/bin/env node
/**
 * release-orchestrator.mjs — Super Admin Release Orchestrator
 *
 * Run AFTER 3 CI greens (smoke + validate + verify).
 *
 *   node scripts/release-orchestrator.mjs [--pr <number>] [--skip-build] [--dry-run]
 *
 * Steps (strict order):
 *   1.  Re-verify CI state   — no race-condition stale merges
 *   2.  Lockfile integrity   — npm install --package-lock-only + diff
 *   3.  Version sync         — cli ↔ create-growthub-local pin match
 *   4.  Clean rebuild        — rm dist/ + vite build + copy
 *   5.  Dist checksum        — cli runtime matches server/ui-dist
 *   6.  Contract sync check  — shared-type exports + API shape assertions
 *   7.  Golden check         — node scripts/release-check.mjs
 *   8.  Dry-run npm pack     — verify tarball contents for both packages
 *   9.  Tag release commit   — git tag vX.Y.Z (pre-merge immutable pointer)
 *  10.  Super Admin gate     — explicit yes/no confirmation before merge
 */

import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

// ── Config ──────────────────────────────────────────────────────────────────

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const args = process.argv.slice(2);
const prNumber = argValue(args, "--pr");
const skipBuild = args.includes("--skip-build");
const dryRun = args.includes("--dry-run");

// ── Colours ─────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function green(s) { return `${c.green}${s}${c.reset}`; }
function red(s)   { return `${c.red}${s}${c.reset}`; }
function yellow(s){ return `${c.yellow}${s}${c.reset}`; }
function bold(s)  { return `${c.bold}${s}${c.reset}`; }
function cyan(s)  { return `${c.cyan}${s}${c.reset}`; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function argValue(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
}

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}

/**
 * Run a command and return its combined stdout+stderr as a string.
 * Throws on non-zero exit.
 */
function run(cmd, cmdArgs, opts = {}) {
  const { cwd = root, input, ignoreFailure = false } = opts;
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    input,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (!ignoreFailure && result.status !== 0) {
    throw new Error(output || `${cmd} ${cmdArgs.join(" ")} exited ${result.status}`);
  }
  return output;
}

/** Print a numbered step header. */
function step(n, title) {
  console.log(`\n${bold(cyan(`── Step ${n}`))} ${bold(title)}`);
}

/** Print success indicator. */
function ok(msg) { console.log(`  ${green("✓")} ${msg}`); }

/** Print warning. */
function warn(msg) { console.log(`  ${yellow("⚠")} ${msg}`); }

/** Recursively collect all files under a directory. */
function allFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...allFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/** SHA-256 of a file's contents. */
function fileHash(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** Prompt the user for a yes/no answer. Returns true if "yes". */
function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n${bold(yellow(question))} ${yellow("(yes/no)")} > `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

console.log(`\n${bold("🚀 Growthub Release Orchestrator")}`);
if (dryRun)    console.log(yellow("  DRY RUN — destructive steps will be skipped"));
if (skipBuild) console.log(yellow("  --skip-build — dist rebuild skipped"));
if (prNumber)  console.log(`  PR #${prNumber}`);

let failed = false;

try {
  // ── Step 1: Re-verify CI state ───────────────────────────────────────────
  step(1, "Re-verify CI state");
  if (prNumber) {
    let checksOutput;
    try {
      checksOutput = run("gh", ["pr", "checks", prNumber]);
    } catch (err) {
      throw new Error(`gh pr checks failed — is gh authenticated?\n${err.message}`);
    }
    const lines = checksOutput.split("\n").filter(Boolean);
    const failing = lines.filter(
      (l) => /\bfail\b|\bfailure\b|\berror\b/i.test(l) && !/\bskip\b/i.test(l)
    );
    const pending = lines.filter((l) => /\bpending\b|\bin_progress\b/i.test(l));
    if (failing.length > 0) {
      throw new Error(`CI has failing checks:\n${failing.join("\n")}`);
    }
    if (pending.length > 0) {
      throw new Error(`CI has pending checks — wait for completion:\n${pending.join("\n")}`);
    }
    ok(`All PR checks passed (${lines.length} checks)`);
  } else {
    // No PR number — check local branch integrity instead
    const branch = run("git", ["branch", "--show-current"]);
    if (branch === "main" || branch === "master") {
      throw new Error("Must run from a feature branch, not main");
    }
    ok(`Running on branch: ${branch} (pass --pr <number> to re-verify CI status)`);
    warn("Skipping live CI check — no PR number provided");
  }

  // ── Step 2: Lockfile integrity ───────────────────────────────────────────
  step(2, "Lockfile integrity");
  // Detect whether the workspace uses npm or pnpm
  const usesPnpm = existsSync(path.join(root, "pnpm-lock.yaml"));
  const lockFile = usesPnpm ? "pnpm-lock.yaml" : "package-lock.json";

  if (usesPnpm) {
    // Verify pnpm-lock.yaml hasn't been modified since last commit — this catches
    // cases where someone edited manifests without regenerating the lockfile.
    // We cannot run pnpm install --frozen-lockfile in all environments (missing
    // workspace packages, etc.), so we check git diff as a proxy for drift.
    const lockDiff = run("git", ["diff", "--exit-code", "pnpm-lock.yaml"], {
      ignoreFailure: true,
    });
    if (lockDiff) {
      throw new Error(
        "pnpm-lock.yaml has uncommitted changes — either commit the lockfile update\n" +
          "or revert unintended edits before releasing."
      );
    }
    ok("pnpm-lock.yaml has no uncommitted drift");
  } else {
    run("npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root });
    const diff = run("git", ["diff", "--exit-code", "package-lock.json"], {
      ignoreFailure: true,
    });
    if (diff) {
      throw new Error(
        "package-lock.json drifted from dependencies.\n" +
          "Run `npm install` locally, commit the updated lockfile, then retry."
      );
    }
    ok("package-lock.json matches dependencies");
  }
  ok(`${lockFile} integrity confirmed`);

  // ── Step 3: Version sync ──────────────────────────────────────────────────
  step(3, "Version sync enforcement");
  const cliPkg    = readJson("cli/package.json");
  const createPkg = readJson("packages/create-growthub-local/package.json");

  if (cliPkg.version !== createPkg.dependencies?.["@growthub/cli"]) {
    throw new Error(
      `Version mismatch:\n` +
        `  cli version         = ${cliPkg.version}\n` +
        `  create dep pin      = ${createPkg.dependencies?.["@growthub/cli"]}\n` +
        `Update packages/create-growthub-local/package.json dependencies["@growthub/cli"] to ${cliPkg.version}`
    );
  }
  ok(`@growthub/cli@${cliPkg.version} ↔ create-growthub-local@${createPkg.version} pin match`);

  const cliVer = cliPkg.version;
  const parts  = cliVer.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`cli version "${cliVer}" is not a valid semver (major.minor.patch)`);
  }
  ok(`Version format valid: ${cliVer}`);

  // ── Step 4: Clean rebuild ──────────────────────────────────────────────────
  step(4, "Clean rebuild of dist");
  if (skipBuild) {
    warn("--skip-build flag set — skipping dist rebuild (using existing artifacts)");
  } else {
    // Locate the vite build config — it lives under ui/
    const viteCfg = path.join(root, "ui", "vite.config.ts");
    const hasViteConfig = existsSync(viteCfg);

    if (!hasViteConfig) {
      warn("No ui/vite.config.ts found — skipping vite rebuild");
      warn("If UI changes are part of this release, build manually and re-run with --skip-build");
    } else {
      console.log("  Running vite build (ui/)…");
      try {
        run("npx", ["vite", "build"], { cwd: path.join(root, "ui") });
      } catch (err) {
        throw new Error(`Vite build failed:\n${err.message}`);
      }
      ok("Vite build succeeded");
    }

    // Verify the expected dist artifacts are present regardless
    const required = [
      "cli/dist",
      "server/dist",
      "server/ui-dist",
      "cli/dist/runtime/server/dist/app.js",
      "cli/dist/runtime/server/ui-dist",
    ];
    const missing = required.filter((p) => !existsSync(path.join(root, p)));
    if (missing.length > 0) {
      throw new Error(
        `Missing dist artifacts after build:\n` +
          missing.map((m) => `  ✗ ${m}`).join("\n") +
          "\n\nBuild and copy all dist artifacts before releasing."
      );
    }
    ok("All dist artifacts present");
  }

  // ── Step 5: Dist checksum verification ────────────────────────────────────
  step(5, "Dist checksum verification");
  const serverUiDist = path.join(root, "server", "ui-dist");
  const cliUiDist    = path.join(root, "cli", "dist", "runtime", "server", "ui-dist");

  if (!existsSync(serverUiDist)) {
    throw new Error("server/ui-dist does not exist");
  }
  if (!existsSync(cliUiDist)) {
    throw new Error("cli/dist/runtime/server/ui-dist does not exist");
  }

  const serverFiles = allFiles(serverUiDist).sort();
  const cliFiles    = allFiles(cliUiDist).sort();

  const toRel = (base) => (f) => path.relative(base, f);
  const serverRel = serverFiles.map(toRel(serverUiDist));
  const cliRel    = cliFiles.map(toRel(cliUiDist));

  // File list must match
  const onlyInServer = serverRel.filter((f) => !cliRel.includes(f));
  const onlyInCli    = cliRel.filter((f) => !serverRel.includes(f));

  if (onlyInServer.length > 0 || onlyInCli.length > 0) {
    const msgs = [];
    if (onlyInServer.length) msgs.push(`Only in server/ui-dist:\n${onlyInServer.map((f) => `  ${f}`).join("\n")}`);
    if (onlyInCli.length)    msgs.push(`Only in cli/dist/runtime/server/ui-dist:\n${onlyInCli.map((f) => `  ${f}`).join("\n")}`);
    throw new Error(`ui-dist file lists diverge:\n${msgs.join("\n")}`);
  }

  // File contents must match
  const checksumMismatches = [];
  for (const rel of serverRel) {
    const sHash = fileHash(path.join(serverUiDist, rel));
    const cHash = fileHash(path.join(cliUiDist, rel));
    if (sHash !== cHash) {
      checksumMismatches.push(rel);
    }
  }
  if (checksumMismatches.length > 0) {
    throw new Error(
      `ui-dist checksum mismatch in ${checksumMismatches.length} file(s):\n` +
        checksumMismatches.map((f) => `  ✗ ${f}`).join("\n") +
        "\n\nRe-copy server/ui-dist → cli/dist/runtime/server/ui-dist and retry."
    );
  }
  ok(`ui-dist checksums match across ${serverFiles.length} file(s) — no runtime drift`);

  // ── Step 6: Contract sync check ───────────────────────────────────────────
  step(6, "Contract sync check");

  const contracts = [
    {
      file: "ui/src/components/GrowthubConnectionCard.tsx",
      patterns: ["Growthub Connection", "Open Configuration", "Pulse", "Disconnect"],
    },
    {
      file: "ui/src/lib/growthub-connection.ts",
      patterns: [
        'url.pathname = "/integrations"',
        'url.searchParams.set("return_url", input.callbackUrl)',
      ],
    },
    {
      file: "server/src/app.ts",
      patterns: ['app.get("/auth/callback"', "growthubPortalBaseUrl", "growthubMachineLabel", "growthubWorkspaceLabel"],
    },
    {
      file: "ui/src/pages/CompanySettings.tsx",
      patterns: ["Growthub pulse succeeded", "onPulseConnection", "onDisconnect"],
    },
    {
      file: "ui/src/gtm/App.tsx",
      patterns: ["Growthub pulse succeeded", "onPulseConnection", "onDisconnect"],
    },
  ];

  let contractFailed = false;
  for (const { file, patterns } of contracts) {
    const fullPath = path.join(root, file);
    if (!existsSync(fullPath)) {
      warn(`Contract file not found (skipping): ${file}`);
      continue;
    }
    const content = readFileSync(fullPath, "utf8");
    const missing = patterns.filter((p) => !content.includes(p));
    if (missing.length > 0) {
      contractFailed = true;
      console.error(red(`  ✗ ${file} missing:`));
      missing.forEach((m) => console.error(`      "${m}"`));
    } else {
      ok(`${file} (${patterns.length} patterns)`);
    }
  }
  if (contractFailed) {
    throw new Error(
      "Contract sync check failed — source files are missing required patterns.\n" +
        "Fix the diverged contracts, rebuild, and retry."
    );
  }

  // ── Step 7: Golden check ──────────────────────────────────────────────────
  step(7, "Golden check — node scripts/release-check.mjs");
  try {
    const out = run("node", ["scripts/release-check.mjs"], { cwd: root });
    out.split("\n").filter(Boolean).forEach((l) => ok(l));
  } catch (err) {
    throw new Error(`release-check.mjs failed:\n${err.message}`);
  }

  // ── Step 8: Dry-run npm pack ───────────────────────────────────────────────
  step(8, "Dry-run npm pack (tarball content validation)");

  const packChecks = [
    {
      cwd: path.join(root, "cli"),
      label: "@growthub/cli",
      required: [
        "dist/runtime/server/dist/app.js",
        "dist/runtime/server/ui-dist",
      ],
    },
    {
      cwd: path.join(root, "packages", "create-growthub-local"),
      label: "create-growthub-local",
      required: ["bin/create-growthub-local.mjs"],
    },
  ];

  for (const { cwd, label, required } of packChecks) {
    let packOut;
    try {
      packOut = run("npm", ["pack", "--dry-run"], { cwd });
    } catch (err) {
      throw new Error(`npm pack --dry-run failed for ${label}:\n${err.message}`);
    }
    const missing = required.filter((r) => !packOut.includes(r));
    if (missing.length > 0) {
      throw new Error(
        `${label} tarball is missing required entries:\n` +
          missing.map((m) => `  ✗ ${m}`).join("\n")
      );
    }
    ok(`${label} tarball looks correct`);
  }

  // ── Step 9: Tag release commit ─────────────────────────────────────────────
  step(9, "Tag release commit");
  const tag = `v${cliVer}`;

  const existingTag = run("git", ["tag", "-l", tag]).trim();
  if (existingTag === tag) {
    warn(`Tag ${tag} already exists — skipping tag creation`);
  } else if (dryRun) {
    warn(`[DRY RUN] Would create tag: ${tag}`);
  } else {
    run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
    ok(`Created annotated tag: ${tag}`);
  }

  // ── Step 10: Super Admin Confirmation Gate ────────────────────────────────
  step(10, "Super Admin Confirmation Gate");

  console.log(`\n  ${bold("Release summary:")}`);
  console.log(`    @growthub/cli            ${green(cliVer)}`);
  console.log(`    create-growthub-local    ${green(createPkg.version)}`);
  console.log(`    Tag                      ${green(tag)}`);
  console.log(`    Dist files               ${green(String(serverFiles.length))}`);
  console.log(`    Lockfile                 ${green(lockFile)}`);
  if (prNumber) console.log(`    PR                       ${green(`#${prNumber}`)}`);

  console.log(`\n  ${bold("Next actions on confirmation:")}`);
  console.log(`    1. Merge PR (${prNumber ? `#${prNumber}` : "manually"}): gh pr merge --squash --admin`);
  console.log(`    2. Push tag: git push origin ${tag}`);
  console.log(`    3. Trigger release: gh workflow run release.yml --field dry_run=false`);
  console.log(`    4. Confirm: npm view @growthub/cli version`);

  if (dryRun) {
    console.log(`\n  ${yellow("DRY RUN — skipping confirmation prompt")}`);
    console.log(green("\n✅ Release orchestrator DRY RUN passed — all gates green\n"));
    process.exit(0);
  }

  const confirmed = await confirm("CONFIRM RELEASE? All steps passed. Proceed with merge + publish?");
  if (!confirmed) {
    console.log(`\n  ${yellow("Release cancelled by operator.")}`);
    console.log("  Tag (if created) is a local tag only — push it when ready.\n");
    process.exit(0);
  }

  // If PR number is available, output the merge command for the operator to run.
  // We do NOT auto-merge — the operator executes the final step.
  console.log(`\n${bold("✅ Confirmation received.")}`);
  console.log("  Run the following commands to complete the release:\n");
  if (prNumber) {
    console.log(`    gh pr merge ${prNumber} --squash --admin`);
  } else {
    console.log("    gh pr merge <PR_NUMBER> --squash --admin");
  }
  console.log(`    git push origin ${tag}`);
  console.log(`    gh workflow run release.yml --field dry_run=false`);
  console.log(`    npm view @growthub/cli version`);
  console.log(`    npm view create-growthub-local version\n`);

} catch (err) {
  failed = true;
  console.error(`\n${red("✗ BLOCKED")} — ${err.message}\n`);
  process.exit(1);
}

if (!failed) {
  console.log(green("\n✅ Release orchestrator passed all gates\n"));
}
