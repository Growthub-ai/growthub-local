#!/usr/bin/env node
/**
 * Super-admin Model QA lane.
 *
 * This runner deliberately does not clone the feature-work export/seed path.
 * It delegates the fresh workspace export to `scripts/export-seed-workspace.mjs`,
 * then layers model-training / training-traces evidence through the live
 * `PATCH /api/workspace` allowlist.
 *
 * Usage: node scripts/export-seed-workspace-model-qa.mjs [--no-dev]
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { applySuperAdminModelQaEvidence } from "./lib/super-admin-model-qa-seed.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bootDev = !process.argv.includes("--no-dev");
const officialScript = path.join(repoRoot, "scripts/export-seed-workspace.mjs");

function parseLineValue(output, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*${escaped}:\\s+(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

async function readWorkspace(baseUrl) {
  const res = await fetch(`${baseUrl}/api/workspace`, { cache: "no-store" });
  assert.equal(res.status, 200, `GET /api/workspace failed: ${res.status}`);
  return res.json();
}

async function patchWorkspaceDataModel(baseUrl, dataModel) {
  const res = await fetch(`${baseUrl}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel }),
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, `PATCH /api/workspace failed: ${res.status} ${JSON.stringify(body)}`);
  return body.workspaceConfig;
}

function writeSourceRecords(appDir, sourceRecords) {
  const recordsPath = path.join(appDir, "growthub.source-records.json");
  const existing = fs.existsSync(recordsPath)
    ? JSON.parse(fs.readFileSync(recordsPath, "utf8"))
    : {};
  fs.writeFileSync(recordsPath, `${JSON.stringify({ ...existing, ...sourceRecords }, null, 2)}\n`, "utf8");
}

console.log("[model-qa] delegating fresh export to scripts/export-seed-workspace.mjs");
const args = [officialScript, ...(bootDev ? [] : ["--no-dev"])];
const official = spawnSync(process.execPath, args, {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
process.stdout.write(official.stdout || "");
process.stderr.write(official.stderr || "");
assert.equal(official.status, 0, "official feature-work export failed");

const exportedKit = parseLineValue(official.stdout, "Export");
const appDir = parseLineValue(official.stdout, "App") || (exportedKit ? path.join(exportedKit, "apps", "workspace") : "");
assert.ok(appDir, "official exporter did not print App path");
const appConfigPath = path.join(appDir, "growthub.config.json");
assert.ok(fs.existsSync(appConfigPath), `missing exported config: ${appConfigPath}`);

let workspaceConfig;
let sourceRecords = {};
if (bootDev) {
  const baseUrl = parseLineValue(official.stdout, "App URL");
  assert.ok(baseUrl, "official exporter did not print App URL");
  const live = await readWorkspace(baseUrl);
  workspaceConfig = JSON.parse(JSON.stringify(live.workspaceConfig));
  applySuperAdminModelQaEvidence(workspaceConfig, sourceRecords);
  const patched = await patchWorkspaceDataModel(baseUrl, workspaceConfig.dataModel);
  writeSourceRecords(appDir, sourceRecords);
  workspaceConfig = patched;

  const verified = await readWorkspace(baseUrl);
  const objects = verified.workspaceConfig?.dataModel?.objects || [];
  const traces = objects.find((object) => object?.id === "training-traces");
  const helper = objects.find((object) => object?.id === "workspace-helper-sandbox")?.rows?.[0];
  assert.equal(traces?.rows?.length, 12, "training-traces must be present after API PATCH");
  assert.equal(helper?.adapter, "local-intelligence", "main-aligned helper seed keeps secondary Ollama adapter");
  assert.equal(helper?.intelligenceAdapterMode, "ollama", "helper secondary adapter is Ollama");
  console.log("[model-qa] API PATCH OK — training-traces/model-training layered on fresh runtime");
  console.log(`[model-qa] helper setup clean — adapter=${helper.adapter}, agentHost=${helper.agentHost || "<empty>"}, secondary=${helper.intelligenceAdapterMode}`);
  console.log(`[model-qa] App URL: ${baseUrl}`);
} else {
  workspaceConfig = JSON.parse(fs.readFileSync(appConfigPath, "utf8"));
  applySuperAdminModelQaEvidence(workspaceConfig, sourceRecords);
  fs.writeFileSync(appConfigPath, `${JSON.stringify(workspaceConfig, null, 2)}\n`, "utf8");
  writeSourceRecords(appDir, sourceRecords);
  const traces = workspaceConfig.dataModel.objects.find((object) => object?.id === "training-traces");
  assert.equal(traces?.rows?.length, 12, "training-traces must be present");
  console.log("[model-qa] Ready (no dev server) — model QA evidence written after official export");
}
