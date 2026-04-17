#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);

const SUPPORTED_PROFILES = new Set(["dx", "gtm", "workspace"]);
const SUPPORTED_REMOTE_SYNC_MODES = new Set(["off", "branch", "pr"]);

function printUsage() {
  console.log(
    [
      "Usage: create-growthub-local [options]",
      "",
      "Paperclip Local App profiles (scaffolds a full local Growthub install):",
      "  --profile <dx|gtm>          Direct onboarding for the selected profile",
      "  --run                       Start runtime immediately after onboarding",
      "  --data-dir <path>           Override install directory (default: ./growthub-local)",
      "  --config <path>             Use a custom config path",
      "",
      "Custom Workspace Starter profile (scaffolds a forked worker kit only):",
      "  --profile workspace         Scaffold a Growthub Custom Workspace Starter Kit",
      "  --out <path>                Destination for the new workspace (default: ./my-workspace)",
      "  --name <label>              Friendly label for the fork",
      "  --upstream <owner/repo>     Also create a first-party GitHub fork remote",
      "  --destination-org <org>     Create the GitHub fork under an org",
      "  --fork-name <name>          Override the GitHub fork name",
      "  --remote-sync-mode <mode>   Initial policy.remoteSyncMode — off | branch | pr",
      "  --kit <kit-id>              Source kit id (advanced; defaults to the starter kit)",
      "  --json                      Emit machine-readable JSON (passes through to growthub starter init)",
      "",
      "Default (no --profile): opens the interactive Growthub discovery hub so",
      "you can pick Worker Kits, Templates, Workflows, Agent Harness, or Settings.",
      "The Settings menu includes the Custom Workspace Starter.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  let profile = null;
  let run = false;
  let dataDir = null;
  let config = null;

  // Workspace-profile only args
  let out = null;
  let name = null;
  let upstream = null;
  let destinationOrg = null;
  let forkName = null;
  let remoteSyncMode = null;
  let kitId = null;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--profile" && argv[index + 1]) {
      profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--run") {
      run = true;
      continue;
    }
    if ((value === "-d" || value === "--data-dir") && argv[index + 1]) {
      dataDir = argv[index + 1];
      index += 1;
      continue;
    }
    if ((value === "-c" || value === "--config") && argv[index + 1]) {
      config = argv[index + 1];
      index += 1;
      continue;
    }

    // Workspace profile passthrough flags
    if ((value === "-o" || value === "--out") && argv[index + 1]) {
      out = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--name" && argv[index + 1]) {
      name = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--upstream" && argv[index + 1]) {
      upstream = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--destination-org" && argv[index + 1]) {
      destinationOrg = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--fork-name" && argv[index + 1]) {
      forkName = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--remote-sync-mode" && argv[index + 1]) {
      remoteSyncMode = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--kit" && argv[index + 1]) {
      kitId = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--json") {
      json = true;
      continue;
    }

    if (value === "-h" || value === "--help") {
      printUsage();
      process.exit(0);
    }
  }

  if (profile !== null && !SUPPORTED_PROFILES.has(profile)) {
    printUsage();
    console.error(
      `create-growthub-local: unsupported --profile "${profile}". ` +
        "Supported profiles: dx, gtm, workspace.",
    );
    process.exit(1);
  }

  if (profile === "workspace" && remoteSyncMode && !SUPPORTED_REMOTE_SYNC_MODES.has(remoteSyncMode)) {
    printUsage();
    console.error(
      `create-growthub-local: unsupported --remote-sync-mode "${remoteSyncMode}". ` +
        "Supported modes: off, branch, pr.",
    );
    process.exit(1);
  }

  // Soft warnings: flags that only make sense with --profile workspace
  if (profile !== "workspace") {
    const workspaceOnly = {
      "--out": out,
      "--name": name,
      "--upstream": upstream,
      "--destination-org": destinationOrg,
      "--fork-name": forkName,
      "--remote-sync-mode": remoteSyncMode,
      "--kit": kitId,
    };
    for (const [flag, value] of Object.entries(workspaceOnly)) {
      if (value !== null && value !== false) {
        console.warn(
          `create-growthub-local: ${flag} is only used with --profile workspace; ignoring.`,
        );
      }
    }
  }

  return {
    profile,
    run,
    dataDir,
    config,
    out,
    name,
    upstream,
    destinationOrg,
    forkName,
    remoteSyncMode,
    kitId,
    json,
  };
}

function resolveGrowthubCliEntrypoint() {
  const overrideEntrypoint = process.env.GROWTHUB_LOCAL_CLI_ENTRYPOINT?.trim();
  if (overrideEntrypoint) {
    return path.resolve(process.cwd(), overrideEntrypoint);
  }

  const localRepoCliEntrypoint = path.resolve(path.dirname(__filename), "../../../cli/dist/index.js");
  if (fs.existsSync(localRepoCliEntrypoint)) {
    return localRepoCliEntrypoint;
  }

  const cliPackageJsonPath = require.resolve("@growthub/cli/package.json");
  const cliPackageDir = path.dirname(cliPackageJsonPath);
  const cliPackage = require(cliPackageJsonPath);
  const growthubBin = cliPackage?.bin?.growthub;

  if (typeof growthubBin !== "string" || growthubBin.trim().length === 0) {
    throw new Error("Installed @growthub/cli package does not expose a growthub binary");
  }

  return path.resolve(cliPackageDir, growthubBin);
}

function buildPaperclipArgs(parsed, growthubCli, effectiveDataDir) {
  const { profile, run, config } = parsed;
  return profile
    ? [
        growthubCli,
        "onboard",
        "--yes",
        ...(run ? ["--run"] : []),
        "--data-dir",
        effectiveDataDir,
        ...(config ? ["--config", config] : []),
      ]
    : [
        growthubCli,
        "discover",
        ...(run ? ["--run"] : []),
        "--data-dir",
        effectiveDataDir,
        ...(config ? ["--config", config] : []),
      ];
}

function buildWorkspaceArgs(parsed, growthubCli) {
  const out = parsed.out
    ? path.resolve(process.cwd(), parsed.out)
    : parsed.dataDir
      ? path.resolve(process.cwd(), parsed.dataDir)
      : path.resolve(process.cwd(), "my-workspace");

  const args = [growthubCli, "starter", "init", "--out", out];
  if (parsed.name) args.push("--name", parsed.name);
  if (parsed.kitId) args.push("--kit", parsed.kitId);
  if (parsed.upstream) args.push("--upstream", parsed.upstream);
  if (parsed.destinationOrg) args.push("--destination-org", parsed.destinationOrg);
  if (parsed.forkName) args.push("--fork-name", parsed.forkName);
  if (parsed.remoteSyncMode) args.push("--remote-sync-mode", parsed.remoteSyncMode);
  if (parsed.json) args.push("--json");
  return { args, out };
}

const parsed = parseArgs(process.argv.slice(2));
const { profile, dataDir, config } = parsed;

const effectiveDataDir = dataDir
  ? path.resolve(process.cwd(), dataDir)
  : path.resolve(process.cwd(), "growthub-local");

let growthubCli;
try {
  growthubCli = resolveGrowthubCliEntrypoint();
} catch (error) {
  console.error(
    error instanceof Error
      ? `create-growthub-local could not resolve the Growthub CLI: ${error.message}`
      : "create-growthub-local could not resolve the Growthub CLI",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
//
// Three paths, every one forwards to the already-shipping @growthub/cli binary
// so the installer stays a thin wrapper:
//
//   --profile workspace  → growthub starter init --out <path> [...]
//   --profile dx|gtm     → growthub onboard --yes [...]
//   (no profile)         → growthub discover  (interactive hub, includes
//                          Settings → Custom Workspace Starter)
//
// The GROWTHUB_INSTALLER_MODE=true env is preserved across all paths so the
// CLI can render installer-aware banners and defaults. PAPERCLIP_SURFACE_PROFILE
// is set only for dx|gtm — the workspace profile does NOT touch the Paperclip
// Local App surface at all.
// ---------------------------------------------------------------------------

let dispatch;
if (profile === "workspace") {
  const { args, out } = buildWorkspaceArgs(parsed, growthubCli);
  dispatch = {
    args,
    env: {
      ...process.env,
      GROWTHUB_INSTALLER_MODE: "true",
    },
    onExit(status) {
      if (status === 0 && !parsed.json) {
        console.log("");
        console.log("Next:");
        console.log(`  cd ${path.relative(process.cwd(), out) || "."}`);
        console.log("  growthub kit fork list");
        console.log("  growthub kit fork status <fork-id>");
        console.log("  growthub fleet view");
      }
    },
  };
} else {
  dispatch = {
    args: buildPaperclipArgs(parsed, growthubCli, effectiveDataDir),
    env: {
      ...process.env,
      GROWTHUB_INSTALLER_MODE: "true",
      ...(profile ? { PAPERCLIP_SURFACE_PROFILE: profile } : {}),
    },
    onExit() {},
  };
}

const result = spawnSync(process.execPath, dispatch.args, {
  cwd: process.cwd(),
  stdio: "inherit",
  env: dispatch.env,
});

const exitCode = result.status ?? 1;
try {
  dispatch.onExit(exitCode);
} catch {
  /* swallow — post-hook must never change exit code */
}
process.exit(exitCode);
