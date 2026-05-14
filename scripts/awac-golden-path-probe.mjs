#!/usr/bin/env node
/**
 * AWaC golden-path probe — PLG KPI instrument for "time to first sandbox success".
 * Runs the full stack check: materialized starter → Next dev →
 * GET/PATCH /api/workspace → POST /api/workspace/reference-options →
 * POST /api/workspace/sandbox-run with receipt assertions.
 *
 * Implementation delegates to `awac-workspace-api-probe.mjs` (single source of
 * truth for HTTP assertions). This entrypoint adds wall-clock timing on stderr.
 *
 * Usage (from repo root):
 *   node scripts/awac-golden-path-probe.mjs
 *
 * Requires: bindable 127.0.0.1 port, CLI dist built (`cli/dist/index.js`).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probe = path.join(repoRoot, "scripts", "awac-workspace-api-probe.mjs");

const t0 = Date.now();
const r = spawnSync(process.execPath, [probe, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env, AWAC_GOLDEN_PATH_PROBE: "1" }
});
const ms = Date.now() - t0;
process.stderr.write(`[golden-path] wall-clock ${ms}ms (exit ${r.status ?? 0})\n`);
process.exit(r.status ?? 1);
