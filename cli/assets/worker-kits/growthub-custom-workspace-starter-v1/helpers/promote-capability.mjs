#!/usr/bin/env node
/**
 * helpers/promote-capability.mjs
 * Self-improving workspace helper (primitive #6).
 *
 * Thin wrapper: calls `growthub workspace improve promote` so agents have
 * a single-invocation helper that follows the primitive #6 convention.
 *
 * Usage:
 *   node helpers/promote-capability.mjs <slug> [--yes] [--json]
 *
 * Works identically on:
 *   - a maintainer's machine with growthub installed globally
 *   - CI / cloud agents with only the source tree (uses cli/dist/index.js)
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);

function resolveGrowthubCli() {
  const distPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../cli/dist/index.js",
  );
  if (fs.existsSync(distPath)) return [process.execPath, distPath];
  return ["growthub"];
}

const [exec, ...rest] = resolveGrowthubCli();
const result = spawnSync(exec, [...rest, "workspace", "improve", "promote", ...args], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
