#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);

function printUsage() {
  console.log("Usage: create-growthub-local [--profile <dx|gtm>] [--run] [--data-dir <path>] [--config <path>]");
}

function parseArgs(argv) {
  let profile = null;
  let run = false;
  let dataDir = null;
  let config = null;

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
    if (value === "-h" || value === "--help") {
      printUsage();
      process.exit(0);
    }
  }

  if (profile !== null && profile !== "dx" && profile !== "gtm") {
    printUsage();
    console.error("create-growthub-local only accepts --profile dx or --profile gtm");
    process.exit(1);
  }

  return { profile, run, dataDir, config };
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

const { profile, run, dataDir, config } = parseArgs(process.argv.slice(2));
const effectiveDataDir = dataDir ? path.resolve(process.cwd(), dataDir) : path.resolve(process.cwd(), "growthub-local");
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

const result = spawnSync(
  process.execPath,
  profile
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
    ],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      GROWTHUB_INSTALLER_MODE: "true",
      ...(profile ? { PAPERCLIP_SURFACE_PROFILE: profile } : {}),
    },
  },
);

process.exit(result.status ?? 1);
