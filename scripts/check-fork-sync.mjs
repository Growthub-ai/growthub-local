#!/usr/bin/env node
/**
 * check-fork-sync.mjs
 *
 * Validates the fork-sync subsystem structure and type exports at build time.
 * Run before any PR merge that touches cli/src/fork-sync/ or
 * cli/src/commands/fork-sync.ts.
 *
 * Exit 0 = all checks passed.
 * Exit 1 = one or more checks failed.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let errors = 0;
let checks = 0;

function ok(label) {
  checks++;
  console.log(`  ✓  ${label}`);
}

function fail(label, detail) {
  checks++;
  errors++;
  console.error(`  ✗  ${label}`);
  if (detail) console.error(`       ${detail}`);
}

function checkFileExists(relPath) {
  const fullPath = resolve(ROOT, relPath);
  if (existsSync(fullPath)) {
    ok(`File exists: ${relPath}`);
  } else {
    fail(`File missing: ${relPath}`);
  }
}

function checkFileContains(relPath, ...patterns) {
  const fullPath = resolve(ROOT, relPath);
  if (!existsSync(fullPath)) {
    fail(`File missing for content check: ${relPath}`);
    return;
  }
  const content = readFileSync(fullPath, "utf8");
  for (const pattern of patterns) {
    if (content.includes(pattern)) {
      ok(`${relPath} contains: ${pattern}`);
    } else {
      fail(`${relPath} missing: ${pattern}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Required source files
// ---------------------------------------------------------------------------
console.log("\n── 1. Source file structure ─────────────────────────────────────────────");
const requiredFiles = [
  "cli/src/config/kit-forks-home.ts",
  "cli/src/kits/fork-types.ts",
  "cli/src/kits/fork-registry.ts",
  "cli/src/kits/fork-sync.ts",
  "cli/src/kits/fork-sync-agent.ts",
  "cli/src/commands/kit-fork.ts",
  "docs/kernel-packets/KERNEL_PACKET_FORK_SYNC_AGENT.md",
  "cli/src/__tests__/kit-fork-registry.test.ts",
  "cli/src/__tests__/kit-fork-sync.test.ts",
  "cli/src/__tests__/kit-fork-sync-agent.test.ts",
  "cli/src/__tests__/kit-fork-command.test.ts",
];
for (const file of requiredFiles) checkFileExists(file);

// ---------------------------------------------------------------------------
// 2. Kits module exports
// ---------------------------------------------------------------------------
console.log("\n── 2. Kits module exports ───────────────────────────────────────────────");
checkFileContains("cli/src/kits/fork-registry.ts",
  "registerKitFork",
  "loadKitForkRegistration",
  "listKitForkRegistrations",
  "updateKitForkRegistration",
  "deregisterKitFork",
);

checkFileContains("cli/src/kits/fork-sync.ts",
  "detectKitForkDrift",
  "buildKitForkHealPlan",
  "applyKitForkHealPlan",
);

checkFileContains("cli/src/kits/fork-sync-agent.ts",
  "runKitForkSyncJob",
  "dispatchKitForkSyncJobBackground",
  "listKitForkSyncJobs",
  "cancelKitForkSyncJob",
  "pruneKitForkSyncJobs",
);

// ---------------------------------------------------------------------------
// 3. CLI command registration
// ---------------------------------------------------------------------------
console.log("\n── 3. CLI command registration ──────────────────────────────────────────");
checkFileContains("cli/src/commands/kit-fork.ts",
  "registerKitForkCommands",
  "registerKitForkSubcommands",
  "runKitForkHub",
  "allowBackToHub",
  "__back_to_hub",
);

checkFileContains("cli/src/index.ts",
  "registerKitForkCommands",
  "runKitForkHub",
  "fork-sync",
  "Fork Sync Agent",
);

// ---------------------------------------------------------------------------
// 4. Discovery Hub wiring
// ---------------------------------------------------------------------------
console.log("\n── 4. Discovery Hub wiring ──────────────────────────────────────────────");
checkFileContains("cli/src/index.ts",
  "surfaceChoice === \"fork-sync\"",
  "🔀 Fork Sync Agent",
);

// Kit command tree wiring
checkFileContains("cli/src/commands/kit.ts",
  "registerKitForkSubcommands",
  "registerKitForkSubcommands(kit)",
);

// ---------------------------------------------------------------------------
// 5. Healing invariants
// ---------------------------------------------------------------------------
console.log("\n── 5. Healer safety invariants ──────────────────────────────────────────");
checkFileContains("cli/src/kits/fork-sync.ts",
  "USER_PROTECTED_PATTERNS",
  "skip_user_modified",
  "merge_add_only",
  "dryRun",
  "preservedPaths",
);

// ---------------------------------------------------------------------------
// 6. Kernel packet doc registered
// ---------------------------------------------------------------------------
console.log("\n── 6. Kernel packet doc registry ────────────────────────────────────────");
checkFileContains("docs/kernel-packets/README.md",
  "Fork Sync Agent Kernel Packet",
  "KERNEL_PACKET_FORK_SYNC_AGENT.md",
);

// ---------------------------------------------------------------------------
// 7. Co-location invariant (old paths must NOT exist)
// ---------------------------------------------------------------------------
console.log("\n── 7. Old stale paths must NOT exist ────────────────────────────────────");
const stalePaths = [
  "cli/src/fork-sync/types.ts",
  "cli/src/fork-sync/registry.ts",
  "cli/src/fork-sync/detector.ts",
  "cli/src/fork-sync/healer.ts",
  "cli/src/fork-sync/job-manager.ts",
  "cli/src/fork-sync/index.ts",
  "cli/src/commands/fork-sync.ts",
  "cli/src/__tests__/fork-sync.test.ts",
];
for (const stale of stalePaths) {
  const fullPath = resolve(ROOT, stale);
  if (existsSync(fullPath)) {
    fail(`Stale file must be removed: ${stale}`);
  } else {
    ok(`Stale file absent: ${stale}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Zero Paperclip harness coupling in the fork-sync subsystem
// ---------------------------------------------------------------------------
console.log("\n── 8. No Paperclip harness coupling in fork-sync tree ───────────────────");
const forkSyncTree = [
  "cli/src/config/kit-forks-home.ts",
  "cli/src/kits/fork-types.ts",
  "cli/src/kits/fork-registry.ts",
  "cli/src/kits/fork-sync.ts",
  "cli/src/kits/fork-sync-agent.ts",
  "cli/src/commands/kit-fork.ts",
  "cli/src/__tests__/kit-fork-registry.test.ts",
  "cli/src/__tests__/kit-fork-sync.test.ts",
  "cli/src/__tests__/kit-fork-sync-agent.test.ts",
  "cli/src/__tests__/kit-fork-command.test.ts",
];
const forbiddenTokens = ["PAPERCLIP_HOME", "resolvePaperclipHomeDir"];
for (const file of forkSyncTree) {
  const fullPath = resolve(ROOT, file);
  if (!existsSync(fullPath)) {
    fail(`Missing file during Paperclip coupling check: ${file}`);
    continue;
  }
  const content = readFileSync(fullPath, "utf8");
  for (const token of forbiddenTokens) {
    if (content.includes(token)) {
      fail(`${file} contains forbidden token '${token}' — fork-sync must not couple to Paperclip harness`);
    } else {
      ok(`${file} free of '${token}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Kit Forks home resolver exports
// ---------------------------------------------------------------------------
console.log("\n── 9. Kit forks home resolver ───────────────────────────────────────────");
checkFileContains("cli/src/config/kit-forks-home.ts",
  "resolveKitForksHomeDir",
  "resolveKitForksIndexPath",
  "resolveKitForksJobsDir",
  "resolveKitForksOrphanJobsDir",
  "resolveInForkStateDir",
  "resolveInForkRegistrationPath",
  "GROWTHUB_KIT_FORKS_HOME",
  ".growthub-fork",
);

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
console.log("\n─────────────────────────────────────────────────────────────────────────");
if (errors > 0) {
  console.error(`\n✗  ${errors} check(s) failed of ${checks} total.\n`);
  process.exit(1);
} else {
  console.log(`\n✓  All ${checks} checks passed.\n`);
}
