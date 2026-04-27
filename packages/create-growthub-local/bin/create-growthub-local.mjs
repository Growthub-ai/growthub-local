#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);

const VALID_PROFILES = new Set(["dx", "gtm", "workspace"]);
const VALID_REMOTE_SYNC_MODES = new Set(["off", "branch", "pr"]);

function printUsage() {
  console.log(
    [
      "Usage:",
      "  create-growthub-local [--profile <dx|gtm|workspace>] [--out <path>]",
      "                        [--data-dir <path>] [--config <path>]",
      "                        [--run]",
      "",
      "Paperclip Local App profiles (dx | gtm):",
      "  create-growthub-local --profile gtm",
      "  create-growthub-local --profile dx --data-dir ./my-growthub",
      "",
      "Custom Workspace Starter profile (workspace):",
      "  create-growthub-local --profile workspace --out ./my-workspace",
      "  create-growthub-local --profile workspace --out ./my-workspace --name \"My Workspace\"",
      "  create-growthub-local --profile workspace --out ./my-workspace \\",
      "    --upstream Growthub-ai/growthub-custom-workspace-starter-v1 --remote-sync-mode off",
      "",
      "Discovery mode (no profile):",
      "  create-growthub-local      # opens `growthub discover` picker",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const opts = {
    profile: null,
    run: false,
    dataDir: null,
    config: null,
    out: null,
    kit: null,
    name: null,
    upstream: null,
    destinationOrg: null,
    forkName: null,
    remoteSyncMode: null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--profile" && argv[index + 1]) {
      opts.profile = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (value === "--run") {
      opts.run = true;
      continue;
    }
    if ((value === "-d" || value === "--data-dir") && argv[index + 1]) {
      opts.dataDir = argv[index + 1];
      index += 1;
      continue;
    }
    if ((value === "-c" || value === "--config") && argv[index + 1]) {
      opts.config = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--out" && argv[index + 1]) {
      opts.out = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--kit" && argv[index + 1]) {
      opts.kit = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--name" && argv[index + 1]) {
      opts.name = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--upstream" && argv[index + 1]) {
      opts.upstream = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--destination-org" && argv[index + 1]) {
      opts.destinationOrg = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--fork-name" && argv[index + 1]) {
      opts.forkName = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--remote-sync-mode" && argv[index + 1]) {
      opts.remoteSyncMode = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (value === "--json") {
      opts.json = true;
      continue;
    }
    if (value === "-h" || value === "--help") {
      printUsage();
      process.exit(0);
    }
  }

  if (opts.profile !== null && !VALID_PROFILES.has(opts.profile)) {
    printUsage();
    console.error(
      `create-growthub-local only accepts --profile dx | gtm | workspace (got: ${opts.profile})`,
    );
    process.exit(1);
  }

  if (
    opts.remoteSyncMode !== null
    && !VALID_REMOTE_SYNC_MODES.has(opts.remoteSyncMode)
  ) {
    printUsage();
    console.error(
      `--remote-sync-mode must be one of off | branch | pr (got: ${opts.remoteSyncMode})`,
    );
    process.exit(1);
  }

  const workspaceOnlyFlags = [
    ["--out", opts.out],
    ["--kit", opts.kit],
    ["--name", opts.name],
    ["--upstream", opts.upstream],
    ["--destination-org", opts.destinationOrg],
    ["--fork-name", opts.forkName],
    ["--remote-sync-mode", opts.remoteSyncMode],
  ];
  if (opts.profile !== "workspace") {
    for (const [flag, value] of workspaceOnlyFlags) {
      if (value !== null) {
        printUsage();
        console.error(
          `${flag} is only valid with --profile workspace (the Custom Workspace Starter path).`,
        );
        process.exit(1);
      }
    }
  }

  return opts;
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

function buildCliArgs(opts, effectiveDataDir, growthubCli) {
  // --profile workspace → forward into `growthub starter init`
  // (the Custom Workspace Starter surface, which composes
  // copyBundledKitSource + registerKitFork + writeKitForkPolicy
  // + appendKitForkTraceEvent and, optionally, createFork).
  if (opts.profile === "workspace") {
    const outArg = opts.out ?? "./my-workspace";
    const absOut = path.resolve(process.cwd(), outArg);
    const args = [growthubCli, "starter", "init", "--out", absOut];
    if (opts.kit) args.push("--kit", opts.kit);
    if (opts.name) args.push("--name", opts.name);
    if (opts.upstream) args.push("--upstream", opts.upstream);
    if (opts.destinationOrg) args.push("--destination-org", opts.destinationOrg);
    if (opts.forkName) args.push("--fork-name", opts.forkName);
    if (opts.remoteSyncMode) args.push("--remote-sync-mode", opts.remoteSyncMode);
    if (opts.json) args.push("--json");
    return args;
  }

  // --profile dx | gtm → existing Paperclip Local App onboarding flow.
  if (opts.profile) {
    return [
      growthubCli,
      "onboard",
      "--yes",
      ...(opts.run ? ["--run"] : []),
      "--data-dir",
      effectiveDataDir,
      ...(opts.config ? ["--config", opts.config] : []),
    ];
  }

  // No profile → open the shared discovery hub at the core first-run path.
  return [
    growthubCli,
    "discover",
    "--start",
    "create-workspace",
    ...(opts.run ? ["--run"] : []),
    "--data-dir",
    effectiveDataDir,
    ...(opts.config ? ["--config", opts.config] : []),
  ];
}

function buildCliEnv(opts) {
  const env = {
    ...process.env,
    GROWTHUB_INSTALLER_MODE: "true",
  };
  // PAPERCLIP_SURFACE_PROFILE is only meaningful for the Paperclip
  // Local App lanes (dx | gtm). The workspace profile scaffolds a
  // Self-Healing Fork Sync workspace that has nothing to do with
  // Paperclip surface selection, so we intentionally do not set it.
  if (opts.profile === "dx" || opts.profile === "gtm") {
    env.PAPERCLIP_SURFACE_PROFILE = opts.profile;
  }
  return env;
}

const opts = parseArgs(process.argv.slice(2));
const effectiveDataDir = opts.dataDir
  ? path.resolve(process.cwd(), opts.dataDir)
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

const cliArgs = buildCliArgs(opts, effectiveDataDir, growthubCli);
const cliEnv = buildCliEnv(opts);

const result = spawnSync(process.execPath, cliArgs, {
  cwd: process.cwd(),
  stdio: "inherit",
  env: cliEnv,
});

process.exit(result.status ?? 1);
