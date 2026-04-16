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
  "cli/src/config/github-home.ts",
  "cli/src/kits/fork-types.ts",
  "cli/src/kits/fork-registry.ts",
  "cli/src/kits/fork-sync.ts",
  "cli/src/kits/fork-sync-agent.ts",
  "cli/src/kits/fork-policy.ts",
  "cli/src/kits/fork-trace.ts",
  "cli/src/kits/fork-remote.ts",
  "cli/src/github/types.ts",
  "cli/src/github/token-store.ts",
  "cli/src/github/client.ts",
  "cli/src/auth/hosted-integrations.ts",
  "cli/src/integrations/types.ts",
  "cli/src/integrations/bridge.ts",
  "cli/src/integrations/github-resolver.ts",
  "cli/src/commands/kit-fork.ts",
  "cli/src/commands/kit-fork-remote.ts",
  "cli/src/commands/github.ts",
  "cli/src/commands/integrations.ts",
  "docs/kernel-packets/KERNEL_PACKET_FORK_SYNC_AGENT.md",
  "cli/src/__tests__/kit-fork-registry.test.ts",
  "cli/src/__tests__/kit-fork-sync.test.ts",
  "cli/src/__tests__/kit-fork-sync-agent.test.ts",
  "cli/src/__tests__/kit-fork-command.test.ts",
  "cli/src/__tests__/fork-policy.test.ts",
  "cli/src/__tests__/fork-trace.test.ts",
  "cli/src/__tests__/integrations-github-resolver.test.ts",
  "cli/src/status/types.ts",
  "cli/src/status/probes.ts",
  "cli/src/status/runner.ts",
  "cli/src/commands/status.ts",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
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
  "cli/src/config/github-home.ts",
  "cli/src/kits/fork-types.ts",
  "cli/src/kits/fork-registry.ts",
  "cli/src/kits/fork-sync.ts",
  "cli/src/kits/fork-sync-agent.ts",
  "cli/src/kits/fork-policy.ts",
  "cli/src/kits/fork-trace.ts",
  "cli/src/kits/fork-remote.ts",
  "cli/src/github/types.ts",
  "cli/src/github/token-store.ts",
  "cli/src/github/client.ts",
  "cli/src/commands/kit-fork.ts",
  "cli/src/commands/kit-fork-remote.ts",
  "cli/src/commands/github.ts",
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
// 10. Policy + trace + remote engine modules
// ---------------------------------------------------------------------------
console.log("\n── 10. Policy / trace / remote engine ──────────────────────────────────");
checkFileContains("cli/src/kits/fork-policy.ts",
  "KitForkPolicy",
  "makeDefaultKitForkPolicy",
  "readKitForkPolicy",
  "writeKitForkPolicy",
  "untouchablePaths",
  "confirmBeforeChange",
  "autoApprove",
  "autoApproveDepUpdates",
  "remoteSyncMode",
);
checkFileContains("cli/src/kits/fork-trace.ts",
  "appendKitForkTraceEvent",
  "readKitForkTrace",
  "tailKitForkTrace",
  "trace.jsonl",
);
checkFileContains("cli/src/kits/fork-remote.ts",
  "isGitRepo",
  "setOrigin",
  "pushHealCommit",
  "buildTokenCloneUrl",
  "gitAvailable",
);

// ---------------------------------------------------------------------------
// 11. Policy-aware heal plan + agent
// ---------------------------------------------------------------------------
console.log("\n── 11. Policy-aware healer + agent ──────────────────────────────────────");
checkFileContains("cli/src/kits/fork-sync.ts",
  "needsConfirmation",
  "confirmationReason",
  "Policy requires confirmation",
  "isPolicyUntouchable",
  "policyRequiresConfirm",
);
checkFileContains("cli/src/kits/fork-sync-agent.ts",
  "awaiting_confirmation",
  "confirmAndResumeJob",
  "maybePushRemote",
  "appendKitForkTraceEvent",
  "readKitForkPolicy",
);

// ---------------------------------------------------------------------------
// 12. First-party native GitHub integration
// ---------------------------------------------------------------------------
console.log("\n── 12. GitHub integration surface ───────────────────────────────────────");
checkFileContains("cli/src/config/github-home.ts",
  "resolveGithubHomeDir",
  "resolveGithubTokenPath",
  "GROWTHUB_GITHUB_HOME",
);
checkFileContains("cli/src/github/client.ts",
  "startDeviceFlow",
  "pollDeviceFlow",
  "fetchAuthenticatedUser",
  "createFork",
  "openPullRequest",
  "parseRepoRef",
);
checkFileContains("cli/src/github/token-store.ts",
  "readGithubToken",
  "writeGithubToken",
  "clearGithubToken",
  "isGithubTokenExpired",
);
checkFileContains("cli/src/commands/github.ts",
  "registerGithubCommands",
  "githubLogin",
  "githubWhoami",
  "githubLogout",
  "device flow",
);
checkFileContains("cli/src/commands/kit-fork-remote.ts",
  "registerKitForkRemoteSubcommands",
  "kitForkCreate",
  "kitForkConnect",
  "kitForkPolicyCommand",
  "kitForkTraceCommand",
  "kitForkConfirmCommand",
);

// ---------------------------------------------------------------------------
// 13. Discovery hub wires GitHub lane
// ---------------------------------------------------------------------------
console.log("\n── 13. Discovery hub GitHub lane ────────────────────────────────────────");
checkFileContains("cli/src/index.ts",
  "registerGithubCommands",
  "🐙 GitHub Integration",
  "surfaceChoice === \"github\"",
);

// ---------------------------------------------------------------------------
// 16. Statuspage subsystem (self-contained + wired)
// ---------------------------------------------------------------------------
console.log("\n── 16. Statuspage subsystem ─────────────────────────────────────────────");
checkFileContains("cli/src/status/types.ts",
  "ServiceStatusLevel",
  "StatuspageComponent",
  "ServiceProbeResult",
  "StatuspageReport",
  "StatuspageRunOptions",
);
checkFileContains("cli/src/status/probes.ts",
  "probeGithubApi",
  "probeNpmRegistry",
  "probeGrowthubHosted",
  "probeIntegrationsBridge",
  "probeGithubDirectAuth",
  "probeKitForksIndex",
  "probeBundledKits",
  "probeGit",
  "probeNode",
  "probeReleaseBundleArtifacts",
);
checkFileContains("cli/src/status/runner.ts",
  "STATUSPAGE_REGISTRY",
  "runStatuspageReport",
  "aggregateLevel",
);
checkFileContains("cli/src/commands/status.ts",
  "registerStatusCommands",
  "runStatuspage",
  "--super-admin",
  "overallBanner",
);
checkFileContains("cli/src/index.ts",
  "registerStatusCommands",
  "🟢 Service Status",
  "surfaceChoice === \"service-status\"",
);

// ---------------------------------------------------------------------------
// 17. CI / release workflows enforce kernel packets
// ---------------------------------------------------------------------------
console.log("\n── 17. CI / release workflow enforcement ────────────────────────────────");
checkFileContains(".github/workflows/ci.yml",
  "check-fork-sync.mjs",
);
checkFileContains(".github/workflows/release.yml",
  "check-fork-sync.mjs",
);

// ---------------------------------------------------------------------------
// 18. Demo CLI ↔ real CLI parity
// ---------------------------------------------------------------------------
console.log("\n── 18. Demo CLI parity ──────────────────────────────────────────────────");
checkFileContains("scripts/cli-demo.mjs",
  "fork-sync",
  "github-integration",
  "integrations-bridge",
  "service-status",
  "custom-workspace-starter",
);

// ---------------------------------------------------------------------------
// 19. Custom Workspace Starter Kit — bundled assets + CLI primitive
// ---------------------------------------------------------------------------
console.log("\n── 19. Custom Workspace Starter ─────────────────────────────────────────");
const starterKitRoot = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1";
const starterAssets = [
  "kit.json",
  "bundles/growthub-custom-workspace-starter-v1.json",
  "QUICKSTART.md",
  "skills.md",
  "output-standards.md",
  "runtime-assumptions.md",
  "validation-checklist.md",
  "workers/custom-workspace-operator/CLAUDE.md",
  "brands/_template/brand-kit.md",
  "brands/growthub/brand-kit.md",
  "brands/NEW-CLIENT.md",
  "setup/verify-env.mjs",
  "setup/check-deps.sh",
  "output/README.md",
  "templates/workspace-brief.md",
  "templates/agent-contract.md",
  "templates/deployment-plan.md",
  "examples/workspace-sample.md",
  "docs/starter-kit-overview.md",
  "docs/fork-sync-integration.md",
  "docs/vite-ui-shell-guide.md",
  "studio/index.html",
  "studio/package.json",
  "studio/vite.config.js",
  "studio/serve.mjs",
  "studio/src/main.jsx",
  "studio/src/App.jsx",
  "studio/src/app.css",
  "growthub-meta/README.md",
  "growthub-meta/kit-standard.md",
];
for (const a of starterAssets) checkFileExists(`${starterKitRoot}/${a}`);

checkFileExists("cli/src/starter/types.ts");
checkFileExists("cli/src/starter/init.ts");
checkFileExists("cli/src/commands/starter.ts");
checkFileExists("docs/kernel-packets/KERNEL_PACKET_CUSTOM_WORKSPACE_STARTER.md");

checkFileContains("cli/src/kits/catalog.ts",
  "growthub-custom-workspace-starter-v1",
);
checkFileContains("cli/src/starter/init.ts",
  "initStarterWorkspace",
  "DEFAULT_STARTER_KIT_ID",
  "copyBundledKitSource",
  "registerKitFork",
  "writeKitForkPolicy",
  "appendKitForkTraceEvent",
  "resolveGithubAccessToken",
);
checkFileContains("cli/src/commands/starter.ts",
  "registerStarterCommands",
  "runStarterInit",
  "--remote-sync-mode",
);
checkFileContains("cli/src/index.ts",
  "registerStarterCommands",
  "🧪 Custom Workspace Starter",
  "surfaceChoice === \"custom-workspace-starter\"",
);
checkFileContains(`${starterKitRoot}/kit.json`,
  "growthub-custom-workspace-starter-v1",
  "custom-workspace-operator",
  "\"family\": \"studio\"",
);

// ---------------------------------------------------------------------------
// 15. CLI --version string must not be a hardcoded literal (must resolve at runtime)
// ---------------------------------------------------------------------------
console.log("\n── 15. Version drift prevention ─────────────────────────────────────────");
{
  const indexPath = resolve(ROOT, "cli/src/index.ts");
  const indexContent = readFileSync(indexPath, "utf8");
  if (indexContent.includes(".version(resolveCliVersion())")) {
    ok("cli/src/index.ts .version() resolves from package.json at runtime");
  } else {
    fail("cli/src/index.ts .version() must call resolveCliVersion() — never a hardcoded literal");
  }
  const hardcodedMatch = indexContent.match(/\.version\("([0-9]+\.[0-9]+\.[0-9]+)"\)/);
  if (hardcodedMatch) {
    fail(`cli/src/index.ts has hardcoded .version("${hardcodedMatch[1]}") — risk of drift`);
  } else {
    ok("cli/src/index.ts has no hardcoded semver in .version()");
  }
}

// ---------------------------------------------------------------------------
// 14. Growthub-hosted integrations bridge (MCP-adjacent adapter)
// ---------------------------------------------------------------------------
console.log("\n── 14. Hosted integrations bridge ───────────────────────────────────────");
checkFileContains("cli/src/auth/hosted-integrations.ts",
  "fetchHostedIntegrations",
  "fetchHostedIntegrationCredential",
  "HostedEndpointUnavailableError",
  "/api/cli/profile?view=integrations",
  "/api/cli/profile?view=integration",
);
checkFileContains("cli/src/integrations/bridge.ts",
  "describeIntegrationBridge",
  "listConnectedIntegrations",
  "resolveIntegrationCredential",
  "clearIntegrationBridgeCache",
  "never persisted",
);
checkFileContains("cli/src/integrations/github-resolver.ts",
  "resolveGithubAccessToken",
  "\"direct\"",
  "\"growthub-bridge\"",
);
checkFileContains("cli/src/commands/integrations.ts",
  "registerIntegrationsCommands",
  "integrationsStatus",
  "integrationsList",
  "integrationsProbe",
);
checkFileContains("cli/src/kits/fork-sync-agent.ts",
  "resolveGithubAccessToken",
  "authSource",
);
checkFileContains("cli/src/commands/kit-fork-remote.ts",
  "resolveGithubAccessToken",
);
checkFileContains("cli/src/commands/github.ts",
  "describeIntegrationBridge",
  "effectiveSource",
);
checkFileContains("cli/src/index.ts",
  "registerIntegrationsCommands",
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
