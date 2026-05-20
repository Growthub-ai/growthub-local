#!/usr/bin/env node
/**
 * Materialize customer-parity kit bytes under a temp export root only.
 * Never npm install or next build in cli/assets/worker-kits/... source trees.
 *
 * Preferred: growthub kit download (CLI dist)
 * Fallback: copy bundled assets to KIT_EXPORT_ROOT (same bytes as download)
 *
 * Usage:
 *   node scripts/materialize-kit-export.mjs
 *   KIT_EXPORT_ROOT=/tmp/my-export node scripts/materialize-kit-export.mjs
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIT_ID = "growthub-custom-workspace-starter-v1";
const DEFAULT_EXPORT_ROOT = "/tmp/gh-template-gallery-test";
const cliDir = path.join(repoRoot, "cli");
const cliDist = path.join(cliDir, "dist", "index.js");
const assetRoot = path.join(repoRoot, "cli", "assets", "worker-kits", KIT_ID);

export function resolveExportPaths(exportRoot = process.env.KIT_EXPORT_ROOT?.trim() || DEFAULT_EXPORT_ROOT) {
  const root = path.resolve(exportRoot);
  const kitDir = path.join(root, KIT_ID);
  const appDir = path.join(kitDir, "apps", "workspace");
  return { exportRoot: root, kitDir, appDir, kitId: KIT_ID };
}

function shouldSkipCopySegment(src) {
  const parts = src.split(path.sep);
  return parts.includes("node_modules") || parts.includes(".next");
}

function materializeViaCli(exportRoot) {
  if (!fs.existsSync(cliDist)) return false;
  if (!fs.existsSync(path.join(cliDir, "node_modules"))) {
    const install = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts"], {
      cwd: cliDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    if (install.status !== 0) return false;
  }
  fs.mkdirSync(exportRoot, { recursive: true });
  const r = spawnSync(
    process.execPath,
    [cliDist, "kit", "download", KIT_ID, "--yes", "--out", exportRoot],
    { cwd: cliDir, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" } },
  );
  const { kitDir, appDir } = resolveExportPaths(exportRoot);
  return r.status === 0 && fs.existsSync(path.join(appDir, "package.json"));
}

function materializeViaAssetCopy(exportRoot) {
  if (!fs.existsSync(path.join(assetRoot, "kit.json"))) {
    throw new Error(`missing bundled kit at ${assetRoot}`);
  }
  const { kitDir } = resolveExportPaths(exportRoot);
  fs.mkdirSync(exportRoot, { recursive: true });
  fs.rmSync(kitDir, { recursive: true, force: true });
  fs.cpSync(assetRoot, kitDir, {
    recursive: true,
    filter: (src) => !shouldSkipCopySegment(src),
  });
  return true;
}

/**
 * @returns {{ exportRoot: string, kitDir: string, appDir: string, method: string }}
 */
export function materializeKitExport(exportRoot) {
  const paths = resolveExportPaths(exportRoot);
  let method = "cli-kit-download";
  if (!materializeViaCli(paths.exportRoot)) {
    method = "bundled-asset-copy";
    materializeViaAssetCopy(paths.exportRoot);
  }
  if (!fs.existsSync(path.join(paths.appDir, "package.json"))) {
    throw new Error(`kit export missing apps/workspace: ${paths.appDir}`);
  }
  return { ...paths, method };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const result = materializeKitExport();
  console.log(JSON.stringify(result, null, 2));
}
