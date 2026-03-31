#!/usr/bin/env node
/**
 * Super-admin release orchestrator: one deterministic boundary after CI is green.
 *
 * Usage:
 *   node scripts/release-orchestrator.mjs [--pr <n|url|branch>] [--skip-gh]
 *   RELEASE_ORCHESTRATOR_ASSUME_YES=1       — non-interactive (no merge/tag/workflow)
 *   RELEASE_ORCHESTRATOR_SKIP_LOCKFILE=1    — skip pnpm lockfile gate (broken/incomplete checkout only)
 *
 * Order: verify CI → lockfile → versions → clean rebuild → dist checksum → contracts
 *        → release-check → npm pack → confirm → tag → merge → release workflow hint
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const REQUIRED_GREEN_PATTERNS = [
  { id: "smoke", re: /smoke/i },
  { id: "validate", re: /validate/i },
  { id: "verify", re: /(^|\s)(verify|ci)(\s|$|\/)/i },
];

function log(step, msg) {
  process.stderr.write(`\n[release-orchestrator] ${step}: ${msg}\n`);
}

function die(msg) {
  throw new Error(msg);
}

function run(cmd, args, opts = {}) {
  const { cwd = root, inherit = false } = opts;
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...opts.env },
  });
  const out = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    die(out.trim() || `${cmd} ${args.join(" ")} failed (exit ${result.status})`);
  }
  return out;
}

function runAllowFail(cmd, args, opts = {}) {
  const { cwd = root } = opts;
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...opts.env },
  });
}

function parseArgs(argv) {
  const out = { pr: null, skipGh: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-gh") out.skipGh = true;
    else if (a === "--pr" && argv[i + 1]) {
      out.pr = argv[++i];
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(`Usage: node scripts/release-orchestrator.mjs [--pr <n|url|branch>] [--skip-gh]\n`);
      process.exit(0);
    }
  }
  return out;
}

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}

function gitMergeBase(ref = "origin/main") {
  const r = runAllowFail("git", ["merge-base", "HEAD", ref]);
  if (r.status !== 0) return null;
  return (r.stdout || "").trim() || null;
}

function fileAtRef(ref, filePath) {
  const r = runAllowFail("git", ["show", `${ref}:${filePath}`]);
  if (r.status !== 0) return null;
  return r.stdout;
}

function assertLockfileClean() {
  if (process.env.RELEASE_ORCHESTRATOR_SKIP_LOCKFILE === "1") {
    log("lockfile", "skipped (RELEASE_ORCHESTRATOR_SKIP_LOCKFILE=1 — not for production)");
    return;
  }
  const lockPath = path.join(root, "pnpm-lock.yaml");
  if (!existsSync(lockPath)) {
    log("lockfile", "no pnpm-lock.yaml — skipping lockfile-only install");
    return;
  }
  const r = runAllowFail("pnpm", ["install", "--lockfile-only"], { inherit: true });
  if (r.status !== 0) {
    die(
      "pnpm install --lockfile-only failed — fix the workspace or set RELEASE_ORCHESTRATOR_SKIP_LOCKFILE=1 for incomplete checkouts only.",
    );
  }
  const diff = runAllowFail("git", ["diff", "--exit-code", "pnpm-lock.yaml"]);
  if (diff.status !== 0) {
    die(
      "pnpm-lock.yaml changed after pnpm install --lockfile-only — lockfile was stale; commit the updated lockfile.",
    );
  }
  log("lockfile", "pnpm-lock.yaml matches manifests");
}

function assertVersionSync() {
  const cliPkg = readJson("cli/package.json");
  const createPkg = readJson("packages/create-growthub-local/package.json");
  const pin = createPkg.dependencies?.["@growthub/cli"];
  if (pin !== cliPkg.version) {
    die(
      `Version pin mismatch: create-growthub-local pins @growthub/cli@${pin} but cli/package.json is ${cliPkg.version}`,
    );
  }
  const base = gitMergeBase();
  if (base) {
    const mainCli = fileAtRef("origin/main", "cli/package.json");
    const mainCreate = fileAtRef("origin/main", "packages/create-growthub-local/package.json");
    if (mainCli && mainCreate) {
      const mainCliV = JSON.parse(mainCli).version;
      const mainCreateV = JSON.parse(mainCreate).version;
      if (cliPkg.version === mainCliV && createPkg.version === mainCreateV) {
        log(
          "versions",
          "warning: cli and create versions match origin/main — bump both before npm release if you changed publishable code",
        );
      }
    }
  }
  log("versions", `@growthub/cli@${cliPkg.version}  create-growthub-local@${createPkg.version}  pin OK`);
  return cliPkg.version;
}

function rmrf(rel) {
  const p = path.join(root, rel);
  rmSync(p, { recursive: true, force: true });
}

function copyDir(srcRel, destRel) {
  const src = path.join(root, srcRel);
  const dest = path.join(root, destRel);
  rmSync(dest, { recursive: true, force: true });
  run("cp", ["-a", src, dest]);
}

function verifyGhChecks(prArg) {
  const args = ["pr", "checks", "--json", "name,bucket,state"];
  if (prArg) args.push(prArg);
  const raw = run("gh", args);
  let checks;
  try {
    checks = JSON.parse(raw);
  } catch {
    die(`Could not parse gh pr checks JSON: ${raw.slice(0, 200)}`);
  }
  if (!Array.isArray(checks) || checks.length === 0) {
    die("gh pr checks returned no rows — is there an open PR for this branch?");
  }
  const failed = checks.filter((c) => c.bucket === "fail" || c.state === "FAILURE");
  if (failed.length) {
    die(`PR checks failed: ${failed.map((c) => c.name).join(", ")}`);
  }
  const pending = checks.filter((c) => c.bucket === "pending" || c.state === "PENDING");
  if (pending.length) {
    die(`PR checks still pending: ${pending.map((c) => c.name).join(", ")} — wait for CI`);
  }
  const passed = checks.filter((c) => c.bucket === "pass" || c.state === "SUCCESS");
  for (const { id, re } of REQUIRED_GREEN_PATTERNS) {
    if (!passed.some((c) => re.test(c.name))) {
      die(
        `Missing expected green check (pattern /${re.source}/i). Passing: ${passed.map((c) => c.name).join(", ")}`,
      );
    }
  }
  log("gh", `PR checks OK (${passed.length} passing, including smoke / validate / verify|ci)`);
}

function collectFiles(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

function sha256File(filePath) {
  const h = createHash("sha256");
  return new Promise((resolve, reject) => {
    const s = createReadStream(filePath);
    s.on("data", (d) => h.update(d));
    s.on("error", reject);
    s.on("end", () => resolve(h.digest("hex")));
  });
}

async function treeDigest(rootDir) {
  const files = collectFiles(rootDir);
  const lines = [];
  for (const rel of files) {
    const full = path.join(rootDir, rel);
    const hash = await sha256File(full);
    lines.push(`${hash}  ${rel.replace(/\\/g, "/")}`);
  }
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

function runContractSync() {
  const checks = [
    ["ui/src/lib/growthub-connection.ts", "GrowthubConnectionSurface"],
    ["ui/src/components/GrowthubConnectionCard.tsx", "GrowthubConnectionCard"],
    ["packages/shared/src/config-schema.ts", "surfaceConfigSchema"],
    ["server/src/app.ts", "express"],
    ["cli/src/commands/worktree-lib.ts", "DEFAULT_WORKTREE_HOME"],
  ];
  for (const [rel, token] of checks) {
    const p = path.join(root, rel);
    if (!existsSync(p)) die(`contract check: missing ${rel}`);
    const content = readFileSync(p, "utf8");
    if (!content.includes(token)) die(`contract check: ${rel} missing token ${token}`);
  }
  log("contracts", "source contract tokens verified");
}

function assertTarballHas(tgzPath, substrings) {
  const list = run("tar", ["-tzf", tgzPath]);
  for (const s of substrings) {
    if (!list.split("\n").some((line) => line.includes(s))) {
      die(`npm pack tarball missing path fragment "${s}": ${tgzPath}`);
    }
  }
}

async function npmPackBoth(packOut) {
  rmSync(packOut, { recursive: true, force: true });
  mkdirSync(packOut, { recursive: true });
  run("npm", ["pack", "--pack-destination", packOut], { cwd: path.join(root, "cli"), inherit: true });
  run("npm", ["pack", "--pack-destination", packOut], {
    cwd: path.join(root, "packages/create-growthub-local"),
    inherit: true,
  });
  const tgz = readdirSync(packOut).filter((f) => f.endsWith(".tgz"));
  if (tgz.length < 2) die(`expected 2 .tgz in ${packOut}, found ${tgz.length}`);
  const cliTgz = tgz.find((f) => f.includes("growthub-cli") || f.startsWith("growthub-cli"));
  const createTgz = tgz.find((f) => f.includes("create-growthub-local"));
  if (!cliTgz || !createTgz) die(`could not identify cli vs create tarball in: ${tgz.join(", ")}`);
  assertTarballHas(path.join(packOut, cliTgz), [
    "package/dist/index.js",
    "package/dist/runtime/server/dist/app.js",
    "package/dist/runtime/server/ui-dist",
  ]);
  assertTarballHas(path.join(packOut, createTgz), ["package/bin/create-growthub-local.mjs"]);
  for (const f of tgz) rmSync(path.join(packOut, f));
  log("npm-pack", "real npm pack + tarball listing OK; removed temp .tgz");
}

async function promptYesNo(question) {
  if (process.env.RELEASE_ORCHESTRATOR_ASSUME_YES === "1" || !process.stdin.isTTY) {
    log("confirm", "non-interactive — skipping merge, tag, and workflow (set RELEASE_ORCHESTRATOR_ASSUME_YES=1)");
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const ans = (await rl.question(`${question} (yes/no): `)).trim().toLowerCase();
    return ans === "yes" || ans === "y";
  } finally {
    rl.close();
  }
}

function resolvePrArg(parsed) {
  if (parsed.pr) return parsed.pr;
  const v = run("gh", ["pr", "view", "--json", "number"]);
  const { number } = JSON.parse(v);
  return String(number);
}

function assertFullWorkspace() {
  const sentinel = path.join(root, "packages/adapters/claude-local/package.json");
  if (!existsSync(sentinel)) {
    die(
      "release-orchestrator requires a full monorepo checkout (e.g. packages/adapters/* present). This tree is incomplete — run from the full growthub-local worktree after pnpm install.",
    );
  }
}

async function main() {
  const parsed = parseArgs(process.argv);
  process.chdir(root);
  assertFullWorkspace();

  if (!parsed.skipGh) {
    verifyGhChecks(parsed.pr ?? undefined);
  } else {
    log("gh", "skipped (--skip-gh)");
  }

  assertLockfileClean();
  const version = assertVersionSync();

  log("clean", "removing server/ui-dist and cli bundled ui-dist");
  rmrf("server/ui-dist");
  rmrf("cli/dist/runtime/server/ui-dist");

  log("build", "server (pnpm run build → tsc)");
  run("pnpm", ["--filter", "@paperclipai/server", "run", "build"], { cwd: root, inherit: true });

  log("build", "UI vite → server/ui-dist");
  run("bash", [path.join(root, "scripts/prepare-server-ui-dist.sh")], { inherit: true });

  log("build", "CLI esbuild bundle");
  run(process.execPath, [path.join(root, "cli/scripts/build-cli.mjs")], { inherit: true });

  log("bundle", "prepare bundled server runtime → cli/dist/runtime/server");
  run(process.execPath, [path.join(root, "cli/scripts/prepare-bundled-runtime.mjs")], { inherit: true });

  const serverUi = path.join(root, "server/ui-dist");
  const cliUi = path.join(root, "cli/dist/runtime/server/ui-dist");
  const d1 = await treeDigest(serverUi);
  const d2 = await treeDigest(cliUi);
  if (d1 !== d2) {
    die(`ui-dist digest mismatch: server ${d1} vs cli runtime ${d2}`);
  }
  log("checksum", `server ui-dist matches CLI runtime (tree digest ${d1.slice(0, 16)}…)`);

  runContractSync();

  log("release-check", "node scripts/release-check.mjs");
  run(process.execPath, [path.join(root, "scripts/release-check.mjs")], { inherit: true });

  const packOut = path.join(root, "tmp/release-orchestrator-pack");
  await npmPackBoth(packOut);
  rmSync(packOut, { recursive: true, force: true });

  process.stdout.write(
    [
      "",
      "release-orchestrator: all automated gates passed.",
      `Target version: ${version}`,
      "Next (after human confirmation): tag, merge PR, run release workflow.",
      "",
    ].join("\n"),
  );

  const ok = await promptYesNo("CONFIRM RELEASE? (merge PR, tag main, push tag, trigger release — type yes)");
  if (!ok) {
    log("done", "stopped before tag/merge — artifacts on disk are validated");
    return;
  }

  const pr = resolvePrArg(parsed);
  const tag = `v${version}`;
  const tagCheck = runAllowFail("git", ["rev-parse", tag]);
  if (tagCheck.status === 0) {
    die(`Tag ${tag} already exists locally — remove it or bump versions before retrying`);
  }

  run("gh", ["pr", "merge", pr, "--squash", "--admin"]);
  log("merge", `merged PR ${pr}`);

  // Squash merge creates a new commit on main — tag origin/main after fetch, not pre-merge HEAD.
  run("git", ["fetch", "origin", "main"]);
  run("git", ["tag", "-a", tag, "-m", `release ${tag}`, "origin/main"]);
  log("tag", `annotated ${tag} → origin/main`);

  run("git", ["push", "origin", tag]);
  log("push", `pushed ${tag}`);

  process.stderr.write(
    [
      "",
      "Run release workflow (super admin):",
      `  gh workflow run release.yml --field dry_run=false --field source_ref=${tag}`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
