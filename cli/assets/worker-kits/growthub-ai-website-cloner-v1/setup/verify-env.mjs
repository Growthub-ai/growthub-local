#!/usr/bin/env node
// verify-env.mjs — Verify the AI Website Cloner environment is ready
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

const FORK_PATH = process.env.AI_WEBSITE_CLONER_HOME || process.env.AI_CLONER_FORK_PATH || resolve(homedir(), "ai-website-cloner-template");

let passed = 0;
let failed = 0;

function check(label, pass, detail) {
  if (pass) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("\nAI Website Cloner — Environment Check");
console.log("─".repeat(48));

// Check 1: Fork directory
check(
  `Fork exists at ${FORK_PATH}`,
  existsSync(FORK_PATH),
  `Run: bash setup/clone-fork.sh`
);

// Check 2: Fork dependencies
check(
  "Fork dependencies installed",
  existsSync(resolve(FORK_PATH, "node_modules")),
  `Run: cd ${FORK_PATH} && npm install`
);

// Check 3: Fork structure
for (const item of ["src/app", "src/components", "src/lib", "package.json", "next.config.ts"]) {
  check(
    `Fork has ${item}`,
    existsSync(resolve(FORK_PATH, item)),
    "Unexpected fork structure — check fork README"
  );
}

// Check 4: Node.js version
try {
  const version = process.versions.node.split(".")[0];
  const isOk = parseInt(version, 10) >= 24;
  check(
    `Node.js 24+ (current: ${process.versions.node})`,
    isOk,
    "Upgrade at https://nodejs.org/ or use: nvm use 24"
  );
} catch {
  check("Node.js version check", false, "Could not determine version");
}

// Check 5: Git available
try {
  execSync("git --version", { stdio: "ignore" });
  check("git available", true);
} catch {
  check("git available", false, "Install git: https://git-scm.com/");
}

console.log("─".repeat(48));
console.log(`  ${passed} passed · ${failed} failed`);

if (failed > 0) {
  console.log("\n  Run: bash setup/clone-fork.sh  to fix setup issues.\n");
  process.exit(1);
} else {
  console.log("\n  Environment is ready. Start your AI agent and run: /clone-website <url>\n");
}
