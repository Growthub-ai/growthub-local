#!/usr/bin/env node
/**
 * worktree-bootstrap.mjs — PR → browser in one shot.
 *
 * AGENTS: Do not run this file directly. It is maintainer / automation plumbing only.
 * Canonical agent + human source dev control is scripts/runtime-control.sh (see AGENTS.md).
 *
 * Given a worktree with a branch's source changes, this script:
 *   1. Syncs changed ui/src + server/src files into growthub-core
 *   2. Rebuilds the UI via vite in growthub-core
 *   3. Swaps the built UI into cli/dist/runtime/server/ui-dist
 *   4. Clears stale session state
 *   5. Starts an isolated server instance
 *   6. Opens the browser to the GTM surface
 *
 * Two-repo reality:
 *   growthub-local  = source of truth, PRs, CI/CD, npm (pre-built cli/dist)
 *   growthub-core   = build toolchain, vite, esbuild (used for UI builds)
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const cwd = process.cwd();
const GROWTHUB_CORE = process.env.GROWTHUB_CORE_PATH
  ? path.resolve(process.env.GROWTHUB_CORE_PATH)
  : null;
const UI_DIST_TARGET = path.join(cwd, "cli", "dist", "runtime", "server", "ui-dist");

// ── L0: Validate worktree identity ──────────────────────────────────────
const configPath = path.join(cwd, ".paperclip", "config.json");
if (!existsSync(configPath)) {
  console.error(`[bootstrap] FATAL: .paperclip/config.json not found in ${cwd}`);
  console.error("[bootstrap] Run inside a worktree after worktree:init.");
  process.exit(1);
}
if (!existsSync(path.join(cwd, ".git"))) {
  console.error("[bootstrap] FATAL: Not a git worktree.");
  process.exit(1);
}
const cliBundledEntry = path.join(cwd, "cli", "dist", "index.js");
if (!existsSync(cliBundledEntry)) {
  console.error("[bootstrap] FATAL: cli/dist/index.js not found.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const serverPort = config.server?.port ?? 3101;
const serverHost = config.server?.host ?? "127.0.0.1";
const surfaceProfile = config.surface?.profile ?? "gtm";
const surfaceMount = surfaceProfile === "gtm" ? "/gtm/GHA/workspace" : "/";

console.log(`[bootstrap] Worktree: ${cwd}`);
console.log(`[bootstrap] Target: http://${serverHost}:${serverPort}${surfaceMount}`);

// ── 1: Sync changed source files to growthub-core ──────────────────────
let uiRebuilt = false;

if (GROWTHUB_CORE && existsSync(GROWTHUB_CORE)) {
  console.log(`[bootstrap] Detecting changes vs origin/main...`);
  try {
    const diffOutput = execSync("git diff --name-only origin/main...HEAD", {
      cwd, encoding: "utf8", timeout: 10_000,
    }).trim();

    if (diffOutput) {
      const changedFiles = diffOutput.split("\n").filter(Boolean);
      const syncDirs = ["ui/src/", "server/src/"];
      let synced = 0;
      let hasUiChanges = false;

      for (const file of changedFiles) {
        if (!syncDirs.some((d) => file.startsWith(d))) continue;
        const src = path.join(cwd, file);
        if (!existsSync(src)) continue;
        const dest = path.join(GROWTHUB_CORE, file);
        mkdirSync(path.dirname(dest), { recursive: true });
        cpSync(src, dest);
        synced++;
        if (file.startsWith("ui/src/")) hasUiChanges = true;
      }

      console.log(`[bootstrap] Synced ${synced} source files to growthub-core.`);

      // ── 2: Rebuild UI if there were UI changes ────────────────────────
      if (hasUiChanges) {
        console.log("[bootstrap] UI changes detected — rebuilding via vite...");
        try {
          execSync("pnpm --filter @paperclipai/ui build", {
            cwd: GROWTHUB_CORE,
            stdio: "inherit",
            timeout: 120_000,
          });

          // ── 3: Swap built UI into cli/dist ────────────────────────────
          const newUiDist = path.join(GROWTHUB_CORE, "ui", "dist");
          if (existsSync(path.join(newUiDist, "index.html"))) {
            const backup = `${UI_DIST_TARGET}.bak`;
            if (existsSync(UI_DIST_TARGET) && !existsSync(backup)) {
              cpSync(UI_DIST_TARGET, backup, { recursive: true });
            }
            rmSync(UI_DIST_TARGET, { recursive: true, force: true });
            cpSync(newUiDist, UI_DIST_TARGET, { recursive: true });
            console.log("[bootstrap] UI dist swapped with PR build.");
            uiRebuilt = true;
          } else {
            console.warn("[bootstrap] WARNING: UI build succeeded but ui/dist/index.html missing.");
          }
        } catch {
          console.warn("[bootstrap] WARNING: UI build failed — serving existing dist.");
        }
      } else {
        console.log("[bootstrap] No UI changes — using existing dist.");
      }
    } else {
      console.log("[bootstrap] No changes vs origin/main — using existing dist.");
    }
  } catch (err) {
    console.warn(`[bootstrap] WARNING: Diff/sync failed — ${err.message ?? err}`);
  }
} else {
  if (GROWTHUB_CORE) {
    console.log(`[bootstrap] growthub-core not found at ${GROWTHUB_CORE} — using existing dist.`);
  } else {
    console.log("[bootstrap] GROWTHUB_CORE_PATH not set — using existing dist.");
  }
}

// ── 4: Reset stale session state ────────────────────────────────────────
const sessionsDir = path.join(cwd, ".paperclip", "sessions");
if (existsSync(sessionsDir)) {
  rmSync(sessionsDir, { recursive: true, force: true });
  console.log("[bootstrap] Stale sessions cleared.");
}

// ── 5: Start the server ────────────────────────────────────────────────
console.log("[bootstrap] Starting server...");

const serverProcess = spawn("node", [cliBundledEntry, "run"], {
  cwd,
  stdio: "inherit",
  detached: true,
  env: { ...process.env, PAPERCLIP_CONFIG: configPath },
});
serverProcess.unref();

// ── 6: Wait for healthy ────────────────────────────────────────────────
const healthUrl = `http://${serverHost}:${serverPort}/api/health`;
let healthy = false;

console.log(`[bootstrap] Waiting for ${healthUrl}...`);
for (let i = 1; i <= 30; i++) {
  await delay(2000);
  try {
    const res = await fetch(healthUrl);
    if (res.ok) {
      const body = await res.json();
      console.log(`[bootstrap] Server healthy: ${body.status} (${body.surfaceProfile})`);
      healthy = true;
      break;
    }
  } catch {}
  if (i % 5 === 0) console.log(`[bootstrap] Still waiting... (${i}/30)`);
}

if (!healthy) {
  console.error("[bootstrap] FATAL: Server not healthy within 60s.");
  process.exit(1);
}

// ── 7: Open browser ────────────────────────────────────────────────────
const appUrl = `http://${serverHost}:${serverPort}${surfaceMount}`;
try { execSync(`open "${appUrl}"`, { stdio: "ignore" }); } catch {}

console.log(`[bootstrap] ✅ Live at ${appUrl}`);
console.log(`[bootstrap] Server PID: ${serverProcess.pid}`);
if (uiRebuilt) console.log(`[bootstrap] UI rebuilt from PR source — changes visible in browser.`);
