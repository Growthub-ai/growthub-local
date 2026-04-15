#!/usr/bin/env node
// verify-env.mjs — Verify Postiz fork path and optional API keys (no network)
// Usage: node setup/verify-env.mjs

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve, join } from "path";

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const lines = readFileSync(filePath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = val;
  }
  return env;
}

function pass(label, note = "") {
  console.log(`  PASS  ${label}${note ? " — " + note : ""}`);
}

function fail(label, message) {
  console.log(`  FAIL  ${label} — ${message}`);
  failures.push(label);
}

function warn(label, message) {
  console.log(`  WARN  ${label} — ${message}`);
}

const failures = [];

const envPath = resolve(process.cwd(), ".env");
const envExamplePath = resolve(process.cwd(), ".env.example");

console.log("=== Growthub Postiz Social Studio — Environment Verification ===");
console.log("");

let env = {};
if (existsSync(envPath)) {
  env = parseEnvFile(envPath);
  pass(".env file", `found at ${envPath}`);
} else if (existsSync(envExamplePath)) {
  warn(".env file", ".env not found — copy .env.example to .env in this kit for local notes only");
} else {
  warn(".env file", ".env and .env.example both missing in kit root");
}

const config = { ...env, ...process.env };

console.log("");
console.log("--- Fork Path Check ---");

const forkPathRaw = config["POSTIZ_FORK_PATH"] || join(homedir(), "postiz-app");
const forkPath = resolve(forkPathRaw);

if (existsSync(forkPath)) {
  pass("POSTIZ_FORK_PATH", `fork found at ${forkPath}`);
  const pkg = join(forkPath, "package.json");
  if (existsSync(pkg)) {
    pass("package.json", `present in fork`);
  } else {
    warn("package.json", `missing at ${pkg}`);
  }
  const apps = join(forkPath, "apps");
  if (existsSync(apps)) {
    pass("apps/", "monorepo apps directory present");
  } else {
    warn("apps/", "expected Postiz monorepo layout not found");
  }
} else {
  warn(
    "POSTIZ_FORK_PATH",
    `fork not found at ${forkPath}. Run: bash setup/clone-fork.sh\n         Agent-only mode is available without the fork.`,
  );
}

console.log("");
console.log("--- Optional keys (kit workspace) ---");

const openai = config["OPENAI_API_KEY"];
if (openai) {
  pass("OPENAI_API_KEY", "set — optional for AI caption drafts in planning outputs");
} else {
  warn("OPENAI_API_KEY", "not set — optional; Postiz may use its own env in the fork");
}

console.log("");
console.log("=== Summary ===");

if (failures.length === 0) {
  console.log("Verification complete. Fix WARN items if you need local-fork execution.");
  process.exit(0);
}

console.log(`${failures.length} check(s) failed:`);
for (const f of failures) {
  console.log(`  - ${f}`);
}
process.exit(1);
