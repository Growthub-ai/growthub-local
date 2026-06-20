#!/usr/bin/env node
/**
 * Scheduler Artifact Drift Guard (CLI) — finding 12.
 *
 * Reads a governed workspace's generated scheduler artifacts + config and reports
 * orphan / stale / hand-edited / missing-artifact problems. Generated artifacts
 * are a projection, never the source of truth; this is how a human or background
 * agent verifies they still match the governed rows.
 *
 * Usage:
 *   node scripts/check-scheduler-artifacts.mjs [workspaceDir]
 *   # defaults to the bundled starter app
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const wsDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");

const libDir = path.join(wsDir, "lib");
const { auditSchedulerArtifacts } = await import(pathToFileURL(path.join(libDir, "scheduler-artifact-guard.js")).href);

function readConfig() {
  const p = path.join(wsDir, "growthub.config.json");
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; }
}

function readArtifacts() {
  const dir = path.join(libDir, "adapters/integrations/schedulers");
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."))
      .map((filename) => ({ filename, source: fs.readFileSync(path.join(dir, filename), "utf8") }));
  } catch { return []; }
}

const res = auditSchedulerArtifacts({ workspaceConfig: readConfig(), artifacts: readArtifacts() });
for (const f of res.findings) {
  const mark = ["orphan", "stale", "hand-edited", "missing-artifact"].includes(f.status) ? "✗" : "✓";
  process.stdout.write(`  ${mark} [${f.status}] ${f.filename || f.integrationId}: ${f.detail}\n`);
}
if (!res.findings.length) process.stdout.write("  ✓ no generated scheduler artifacts — clean.\n");
if (!res.ok) { process.stderr.write(`\nScheduler artifact drift detected: ${res.problems.length} problem(s).\n`); process.exit(1); }
process.stdout.write("\nScheduler artifacts OK.\n");
