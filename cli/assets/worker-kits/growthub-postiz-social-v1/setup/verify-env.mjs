#!/usr/bin/env node
// verify-env.mjs — Verify Postiz fork and kit environment configuration
// Usage: node setup/verify-env.mjs

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let allPassed = true;
const results = [];

function check(label, passed, detail = "") {
  const icon = passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  results.push({ label, passed, detail, icon });
  if (!passed) allPassed = false;
}

function warn(label, detail = "") {
  results.push({ label, passed: null, detail, icon: `${YELLOW}⚠${RESET}` });
}

console.log("Growthub Postiz Social Media Studio — Environment Verification");
console.log("=".repeat(60));
console.log("");

// --- Check 1: Postiz fork path ---
const forkPath = process.env.POSTIZ_FORK_PATH ?? join(homedir(), "postiz-app");
const forkExists = existsSync(forkPath);
check("Postiz fork directory exists", forkExists, forkExists ? forkPath : `Not found at ${forkPath}`);

if (forkExists) {
  const dockerCompose = existsSync(join(forkPath, "docker-compose.yml"));
  check("docker-compose.yml present in fork", dockerCompose);

  const envFile = existsSync(join(forkPath, ".env"));
  check("Postiz .env file present", envFile, envFile ? "" : `Run: cp ${forkPath}/.env.example ${forkPath}/.env`);
}

// --- Check 2: Postiz API reachability ---
const postizApiUrl = process.env.POSTIZ_API_URL ?? "http://localhost:3000";
let apiHealthy = false;
try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const res = await fetch(`${postizApiUrl}/api/healthcheck`, { signal: controller.signal });
  clearTimeout(timeout);
  apiHealthy = res.ok;
} catch {
  apiHealthy = false;
}
check("Postiz API is reachable", apiHealthy, apiHealthy ? postizApiUrl : `Not reachable at ${postizApiUrl} — run: bash setup/clone-fork.sh`);

// --- Check 3: Workspace ID ---
const workspaceId = process.env.POSTIZ_WORKSPACE_ID;
if (workspaceId && workspaceId !== "your_workspace_uuid_here") {
  check("POSTIZ_WORKSPACE_ID is set", true, workspaceId.slice(0, 8) + "...");
} else {
  warn("POSTIZ_WORKSPACE_ID not set", "Required for scheduling manifest submission — find it in Postiz Settings > Workspace");
}

// --- Check 4: Anthropic API key ---
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicKey || anthropicKey === "your_anthropic_key_here") {
  warn("ANTHROPIC_API_KEY not set", "Optional — required for AI-enhanced caption generation in agent-only and hybrid modes");
} else if (anthropicKey.startsWith("sk-ant-")) {
  check("ANTHROPIC_API_KEY format is valid", true);
} else {
  check("ANTHROPIC_API_KEY format is valid", false, "Key does not start with sk-ant- — check your Anthropic console");
}

// --- Print results ---
console.log("Results:");
for (const { icon, label, detail } of results) {
  const detailStr = detail ? `  → ${detail}` : "";
  console.log(`  ${icon}  ${label}${detailStr}`);
}

console.log("");

if (allPassed) {
  console.log(`${GREEN}All checks passed. Ready for local-fork or hybrid mode.${RESET}`);
} else {
  const warnings = results.filter((r) => r.passed === null);
  const failures = results.filter((r) => r.passed === false);
  if (failures.length > 0) {
    console.log(`${RED}${failures.length} check(s) failed. See details above.${RESET}`);
    if (!apiHealthy) {
      console.log(`\n  To start Postiz: bash setup/clone-fork.sh`);
    }
  }
  if (warnings.length > 0 && failures.length === 0) {
    console.log(`${YELLOW}Checks passed with warnings. Agent-only mode is available.${RESET}`);
  }
}
