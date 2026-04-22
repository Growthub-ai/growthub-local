#!/usr/bin/env node
// verify-env.mjs — Verify the geo-seo-claude environment is ready
// Usage: node setup/verify-env.mjs
// No network calls are made. All checks are local filesystem only.

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve, join } from "path";

// ─── Helpers ───────────────────────────────────────────────────────────────

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

// ─── State ─────────────────────────────────────────────────────────────────

const failures = [];

// ─── Load .env ─────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), ".env");
const envExamplePath = resolve(process.cwd(), ".env.example");

console.log("=== Growthub GEO SEO Studio — Environment Verification ===");
console.log("");

let env = {};
if (existsSync(envPath)) {
  env = parseEnvFile(envPath);
  pass(".env file", `found at ${envPath}`);
} else if (existsSync(envExamplePath)) {
  warn(".env file", ".env not found — using .env.example for reference only. Run: cp .env.example .env");
} else {
  warn(".env file", ".env and .env.example both missing — proceeding with process.env only");
}

// Merge with process.env (process.env takes priority over .env file)
const config = { ...env, ...process.env };

console.log("");
console.log("--- Fork Path Check ---");

// ─── Fork Path ─────────────────────────────────────────────────────────────

const forkPathRaw = config["GEO_SEO_HOME"] || config["GEO_SEO_FORK_PATH"] || join(homedir(), "geo-seo-claude");
const forkPath = resolve(forkPathRaw);

if (existsSync(forkPath)) {
  pass("GEO_SEO_FORK_PATH", `fork found at ${forkPath}`);

  // Check key scripts exist in the fork
  const requiredScripts = [
    "scripts/fetch_page.py",
    "scripts/citability_scorer.py",
    "scripts/brand_scanner.py",
    "scripts/generate_pdf_report.py",
    "scripts/llmstxt_generator.py",
  ];

  for (const scriptPath of requiredScripts) {
    const fullPath = join(forkPath, scriptPath);
    if (existsSync(fullPath)) {
      pass(scriptPath);
    } else {
      warn(scriptPath, `not found in fork at ${fullPath} — may be in a different path in this fork version`);
    }
  }
} else {
  warn(
    "GEO_SEO_FORK_PATH",
    `fork not found at ${forkPath}. Run: bash setup/clone-fork.sh\n         Agent-only mode is available without the fork.`
  );
}

console.log("");
console.log("--- API Key Check ---");

// ─── Anthropic API Key (optional) ─────────────────────────────────────────

const anthropicKey = config["ANTHROPIC_API_KEY"];
if (!anthropicKey) {
  warn("ANTHROPIC_API_KEY", "not set — agent-enhanced analysis requires this key. Core Python analysis works without it.");
} else if (!anthropicKey.startsWith("sk-ant-")) {
  fail("ANTHROPIC_API_KEY", `key does not start with 'sk-ant-' — this may be an invalid key. Check https://console.anthropic.com`);
} else if (anthropicKey.length < 40) {
  fail("ANTHROPIC_API_KEY", "key appears too short — verify you copied the full key from https://console.anthropic.com");
} else {
  pass("ANTHROPIC_API_KEY", "key format looks valid (starts with sk-ant-, adequate length)");
}

// ─── Optional Config ───────────────────────────────────────────────────────

console.log("");
console.log("--- Optional Config ---");

const flaskPort = config["FLASK_PORT"] || "5000 (default)";
pass("FLASK_PORT", `${flaskPort} — Flask CRM dashboard will use this port`);

const outputRoot = config["GEO_OUTPUT_ROOT"] || "./output (default)";
pass("GEO_OUTPUT_ROOT", outputRoot);

const playwrightBrowser = config["PLAYWRIGHT_BROWSER"] || "chromium (default)";
pass("PLAYWRIGHT_BROWSER", playwrightBrowser);

// ─── Summary ───────────────────────────────────────────────────────────────

console.log("");
console.log("=== Summary ===");

if (failures.length === 0) {
  const forkReady = existsSync(forkPath);
  if (forkReady) {
    console.log("Environment is ready. Fork found. Run your first audit with /geo audit.");
  } else {
    console.log("Environment OK. Fork not found — agent-only mode available.");
    console.log("To enable local-fork mode: bash setup/clone-fork.sh");
  }
  process.exit(0);
} else {
  console.log(`${failures.length} check(s) failed:`);
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  console.log("Resolve these before running local-fork mode workflows.");
  process.exit(1);
}
