#!/usr/bin/env node
// check-deps.mjs — cross-platform dependency check for the Zernio Social Media Studio
//
// Works identically on macOS, Linux, and Windows (PowerShell, cmd, WSL, git-bash).
// Functional parity with setup/check-deps.sh (bash, unix-only) so Windows users
// get a first-class experience without bash.
//
// Usage:
//   node setup/check-deps.mjs

import { spawn } from "node:child_process";
import { platform, release } from "node:os";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let pass = 0;
let warn = 0;
let fail = 0;

function ok(msg) { console.log(`  ${GREEN}\u2713${RESET}  ${msg}`); pass += 1; }
function warning(msg) { console.log(`  ${YELLOW}!${RESET}  ${msg}`); warn += 1; }
function failure(msg) { console.log(`  ${RED}\u2717${RESET}  ${msg}`); fail += 1; }

function which(binary) {
  return new Promise((resolve) => {
    const isWin = platform() === "win32";
    const lookup = isWin ? "where" : "which";
    const child = spawn(lookup, [binary], { shell: false });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.on("close", (code) => resolve(code === 0 ? out.trim().split(/\r?\n/)[0] : null));
    child.on("error", () => resolve(null));
  });
}

function version(binary, args = ["--version"]) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { shell: false });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (out += String(d)));
    child.on("close", (code) => resolve(code === 0 ? out.trim() : null));
    child.on("error", () => resolve(null));
  });
}

console.log("");
console.log(`${BOLD}Growthub Zernio Social Media Studio — Dependency Check${RESET}`);
console.log(`host: ${platform()} ${release()}  ·  node: ${process.version}`);
console.log("");

// --- Node.js (required, built-in check) ---
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
if (Number.isFinite(nodeMajor) && nodeMajor >= 18) {
  ok(`node ${process.version} (>= 18 required)`);
} else {
  failure(`node ${process.version} — version 18+ required. Install from https://nodejs.org`);
}

// --- Built-in fetch (Node 18+ has it) ---
if (typeof fetch === "function") {
  ok("Node built-in fetch() is available — no curl dependency required");
} else {
  failure("Node built-in fetch() is not available — upgrade to Node 18+");
}

// --- npm (optional but expected) ---
{
  const path = await which("npm");
  if (path) {
    const v = await version("npm");
    ok(`npm ${v ?? ""} at ${path}`);
  } else {
    warning("npm not found — usually ships with Node.js; only needed if you install additional CLIs");
  }
}

// --- curl (optional — useful for manual API smoke tests) ---
{
  const path = await which("curl");
  if (path) {
    ok(`curl at ${path} — optional, useful for ad-hoc API tests`);
  } else {
    warning("curl not found — optional. Node's fetch() handles everything the kit needs.");
  }
}

// --- git (optional) ---
{
  const path = await which("git");
  if (path) {
    ok(`git at ${path}`);
  } else {
    warning("git not found — optional for this kit. Install from https://git-scm.com/downloads if you want repo versioning.");
  }
}

// --- Summary ---
console.log("");
console.log(`${BOLD}Summary${RESET}`);
console.log(`  Passed:   ${pass}`);
if (warn > 0) console.log(`  ${YELLOW}Warnings: ${warn}${RESET}`);
if (fail > 0) console.log(`  ${RED}Failed:   ${fail}${RESET}`);
console.log("");

if (fail > 0) {
  console.log(`${RED}${BOLD}Install the missing required dependencies and re-run.${RESET}`);
  process.exit(1);
} else if (warn > 0) {
  console.log(`${YELLOW}Dependencies OK with warnings. All warnings are optional.${RESET}`);
} else {
  console.log(`${GREEN}All dependencies satisfied.${RESET}`);
}
