#!/usr/bin/env node
// setup.mjs — one-command cross-platform bootstrap for the Zernio Social Media Studio
//
// Works identically on macOS, Linux, and Windows (PowerShell, cmd, WSL, git-bash).
// Usage:
//   node setup/setup.mjs                      # full bootstrap (deps + env + verify)
//   node setup/setup.mjs --skip-deps          # skip dependency check
//   node setup/setup.mjs --skip-verify        # skip live API reachability check
//   node setup/setup.mjs --yes                # no-prompt mode (CI-safe)
//
// What it does (in order):
//   1. Prints the kit banner and detects the host OS.
//   2. Runs the cross-platform dependency check (Node 18+, curl optional, git optional).
//   3. If .env is missing, copies .env.example to .env verbatim.
//   4. Runs verify-env.mjs to confirm ZERNIO_API_KEY format + reachability.
//   5. Prints the exact next step for the user's OS.
//
// No external dependencies. Pure Node stdlib only.

import { existsSync, copyFileSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { platform, release } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KIT_ROOT = resolve(__dirname, "..");

const argv = new Set(process.argv.slice(2));
const SKIP_DEPS = argv.has("--skip-deps");
const SKIP_VERIFY = argv.has("--skip-verify");
const YES = argv.has("--yes");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function log(msg) { console.log(msg); }
function step(n, label) { log(""); log(`${BOLD}${BLUE}[${n}/4]${RESET} ${BOLD}${label}${RESET}`); }
function ok(msg) { log(`  ${GREEN}\u2713${RESET} ${msg}`); }
function warn(msg) { log(`  ${YELLOW}!${RESET} ${msg}`); }
function fail(msg) { log(`  ${RED}\u2717${RESET} ${msg}`); }

function detectOs() {
  const p = platform();
  if (p === "darwin") return { id: "mac", pretty: "macOS" };
  if (p === "win32") return { id: "windows", pretty: "Windows" };
  if (p === "linux") return { id: "linux", pretty: "Linux" };
  return { id: p, pretty: p };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
    child.on("close", (code) => resolvePromise(code ?? 1));
    child.on("error", () => resolvePromise(1));
  });
}

function printBanner(osInfo) {
  log("");
  log(`${BOLD}Growthub Zernio Social Media Studio${RESET} \u2014 one-command setup`);
  log(`${DIM}kit: growthub-zernio-social-v1  \u00b7  host: ${osInfo.pretty} (${platform()} ${release()})  \u00b7  node: ${process.version}${RESET}`);
  log("");
}

// ---------------------------------------------------------------------------
// Step 1 \u2014 Dependency check (cross-platform, node-native)
// ---------------------------------------------------------------------------

function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (!Number.isFinite(major) || major < 18) {
    fail(`Node.js ${process.version} detected \u2014 Node 18+ required. Install from https://nodejs.org`);
    return false;
  }
  ok(`Node.js ${process.version} (>= 18 required)`);
  return true;
}

function which(binary) {
  // Cross-platform "which": spawn a lookup with proper extension handling.
  return new Promise((resolvePromise) => {
    const isWin = platform() === "win32";
    const lookup = isWin ? "where" : "which";
    const child = spawn(lookup, [binary], { shell: false });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.on("close", (code) => resolvePromise(code === 0 ? out.trim().split(/\r?\n/)[0] : null));
    child.on("error", () => resolvePromise(null));
  });
}

async function runDepsCheck() {
  step(1, "Checking dependencies");
  if (SKIP_DEPS) {
    warn("--skip-deps passed \u2014 skipping dependency check");
    return true;
  }
  let allGood = true;
  if (!checkNodeVersion()) allGood = false;

  const curlPath = await which("curl");
  if (curlPath) ok(`curl at ${curlPath}`);
  else warn("curl not found \u2014 not required (Node's built-in fetch is used), but recommended for manual API testing");

  const gitPath = await which("git");
  if (gitPath) ok(`git at ${gitPath}`);
  else warn("git not found \u2014 not required for the kit, but recommended for your own project versioning");

  return allGood;
}

// ---------------------------------------------------------------------------
// Step 2 \u2014 Ensure .env exists
// ---------------------------------------------------------------------------

function ensureEnvFile() {
  step(2, "Ensuring .env is in place");
  const envPath = join(KIT_ROOT, ".env");
  const examplePath = join(KIT_ROOT, ".env.example");

  if (existsSync(envPath)) {
    const size = statSync(envPath).size;
    ok(`.env already exists (${size} bytes) \u2014 not overwriting`);
    return { created: false, envPath };
  }

  if (existsSync(examplePath)) {
    copyFileSync(examplePath, envPath);
    ok(`Copied .env.example \u2192 .env`);
    warn(`Open .env and fill in ZERNIO_API_KEY + ZERNIO_PROFILE_ID before running the operator`);
    return { created: true, envPath };
  }

  // No .env.example \u2014 guide the user to create .env directly.
  warn(".env not found \u2014 create it with your Zernio credentials:");
  log(`  ${DIM}ZERNIO_API_KEY=sk_<your-64-hex-key>${RESET}`);
  log(`  ${DIM}ZERNIO_API_URL=https://zernio.com/api/v1${RESET}`);
  log(`  ${DIM}ZERNIO_PROFILE_ID=<your-profile-id>${RESET}`);
  log(`  ${DIM}ZERNIO_TIMEZONE=America/New_York  # optional${RESET}`);
  log(`  ${DIM}ANTHROPIC_API_KEY=sk-ant-...       # optional, for hybrid caption mode${RESET}`);
  log("");
  log(`  Skip env entirely for agent-only mode: ${BOLD}node setup/setup.mjs --skip-verify${RESET}`);
  return { created: false, envPath: null };
}

// ---------------------------------------------------------------------------
// Step 3 \u2014 Run verify-env.mjs (same file we already ship)
// ---------------------------------------------------------------------------

async function runVerifyEnv() {
  step(3, "Verifying environment (format + reachability)");
  if (SKIP_VERIFY) {
    warn("--skip-verify passed \u2014 skipping environment verification");
    return true;
  }
  loadDotEnvInto(process.env);
  const verifyPath = join(__dirname, "verify-env.mjs");
  if (!existsSync(verifyPath)) {
    fail("setup/verify-env.mjs missing \u2014 kit payload is incomplete");
    return false;
  }
  const code = await run(process.execPath, [verifyPath]);
  // verify-env.mjs returns 0 even on warnings; non-zero only if it crashes
  return code === 0;
}

// Minimal inline .env loader \u2014 no dotenv dependency.
function loadDotEnvInto(target) {
  const envPath = join(KIT_ROOT, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (target[key] === undefined) target[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Step 4 \u2014 Print OS-specific next steps
// ---------------------------------------------------------------------------

function printNextSteps(osInfo, envCreated) {
  step(4, "Next steps");
  const open = osInfo.id === "mac" ? "open" : osInfo.id === "windows" ? "start" : "xdg-open";
  if (envCreated) {
    log(`  1. Fill in your Zernio key in .env:`);
    if (osInfo.id === "windows") {
      log(`       ${DIM}notepad .env${RESET}         (or any editor)`);
      log(`       ${DIM}code .env${RESET}            (VS Code)`);
    } else {
      log(`       ${DIM}${open} .env${RESET}              (system default editor)`);
      log(`       ${DIM}nano .env${RESET}              (terminal editor)`);
      log(`       ${DIM}code .env${RESET}              (VS Code)`);
    }
    log(`  2. Re-run:  ${BOLD}node setup/setup.mjs${RESET}  to re-verify.`);
    log(`  3. Then open Claude Code / Codex / Cursor at this folder as the Working Directory.`);
  } else {
    log(`  1. Open Claude Code / Codex / Cursor.`);
    log(`  2. Point the Working Directory at:`);
    log(`       ${BOLD}${KIT_ROOT}${RESET}`);
    log(`  3. The ${BOLD}zernio-social-operator${RESET} agent entrypoint is:`);
    log(`       ${DIM}workers/zernio-social-operator/CLAUDE.md${RESET}`);
    log(`  4. Try: ${BOLD}"/zernio campaign"${RESET} to run the full 10-step workflow.`);
  }
  log("");
  log(`${DIM}For full setup guidance see QUICKSTART.md. Agent-only mode is always valid \u2014 Zernio reachability does not block planning.${RESET}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const osInfo = detectOs();
  printBanner(osInfo);

  const depsOk = await runDepsCheck();
  const envResult = ensureEnvFile();
  await runVerifyEnv();
  printNextSteps(osInfo, envResult.created);

  if (!depsOk) {
    log("");
    log(`${RED}${BOLD}One or more dependency checks failed. Fix the issues above and re-run.${RESET}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
