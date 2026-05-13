#!/usr/bin/env node
/**
 * End-to-end API verification for the bundled custom-workspace starter:
 * 1) Ensure official CLI dist: `npm install` + `npx tsc` inside `cli/` (standalone
 *    npm graph — avoids broken root `pnpm install` in partial checkouts). Same
 *    `dist/index.js` entrypoint as `scripts/demo-cli.sh`.
 * 2) Export kit to a temp directory with an isolated PAPERCLIP_HOME (demo profile).
 * 3) npm install + next dev in apps/workspace with WORKSPACE_CONFIG_ALLOW_FS_WRITE=true.
 * 4) HTTP probes: PATCH /api/workspace, PATCH /api/workspace/settings, POST sandbox-run,
 *    POST refresh-sources — positive and negative cases.
 *
 * Usage (from repo root):
 *   node scripts/verify-custom-workspace-starter-export-api.mjs
 *
 * Optional env:
 *   KEEP_EXPORT=1   — do not delete the temp export directory on exit
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const cliDir = path.join(repoRoot, "cli");
const cliEntry = path.join(cliDir, "dist", "index.js");

function fail(message) {
  console.error(`\nVERIFY FAIL: ${message}\n`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: opts.stdio ?? "inherit",
      cwd: opts.cwd ?? repoRoot,
      env: { ...process.env, ...opts.env },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function ensureCliRunner() {
  const cliZod = path.join(cliDir, "node_modules", "zod", "package.json");
  if (!fs.existsSync(cliZod)) {
    console.log("Installing CLI-local npm deps (cli/ — standalone from npmjs)…");
    await run("npm", ["install", "--no-fund", "--no-audit"], { cwd: cliDir });
  }
  if (!fs.existsSync(cliEntry)) {
    console.log("Compiling CLI dist (tsc in cli/)…");
    await run("npx", ["tsc", "--project", "tsconfig.json"], { cwd: cliDir });
  }
  assert(fs.existsSync(cliEntry), "cli dist missing after setup");
}

async function waitForHttp(url, { timeoutMs = 120_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await delay(intervalMs);
  }
  fail(`server did not become ready at ${url} within ${timeoutMs}ms`);
}

async function main() {
  await ensureCliRunner();

  const stamp = `${Date.now()}-${process.pid}`;
  const demoHome = path.join(os.tmpdir(), `growthub-verify-pc-${stamp}`);
  const kitOut = path.join(os.tmpdir(), `growthub-verify-kit-${stamp}`);
  fs.mkdirSync(demoHome, { recursive: true });

  console.log("\n→ kit download (CLI dist, isolated PAPERCLIP_HOME)…");
  console.log(`   PAPERCLIP_HOME=${demoHome}`);
  console.log(`   --out ${kitOut}`);
  await run(process.execPath, [
    "dist/index.js",
    "kit",
    "download",
    "growthub-custom-workspace-starter-v1",
    "--out",
    kitOut,
    "--yes",
  ], {
    cwd: cliDir,
    env: { PAPERCLIP_HOME: demoHome },
  });

  const workspaceApp = path.join(kitOut, "apps", "workspace");
  assert(fs.existsSync(workspaceApp), `expected ${workspaceApp}`);

  console.log("\n→ npm install (exported apps/workspace)…");
  await run("npm", ["install", "--no-fund", "--no-audit"], { cwd: workspaceApp });

  const port = 38400 + Math.floor(Math.random() * 200);
  const base = `http://127.0.0.1:${port}`;

  console.log(`\n→ next dev on port ${port} (WORKSPACE_CONFIG_ALLOW_FS_WRITE=true)…`);
  const dev = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: workspaceApp,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
    },
  });

  let devLog = "";
  dev.stdout?.on("data", (c) => {
    devLog += c;
  });
  dev.stderr?.on("data", (c) => {
    devLog += c;
  });

  const cleanup = async () => {
    try {
      if (process.platform !== "win32" && typeof dev.pid === "number") {
        try {
          process.kill(-dev.pid, "SIGTERM");
        } catch {
          dev.kill("SIGTERM");
        }
      } else {
        dev.kill("SIGTERM");
      }
    } catch {
      /* ignore */
    }
    await delay(800);
    try {
      if (process.platform !== "win32" && typeof dev.pid === "number") {
        try {
          process.kill(-dev.pid, "SIGKILL");
        } catch {
          dev.kill("SIGKILL");
        }
      } else {
        dev.kill("SIGKILL");
      }
    } catch {
      /* ignore */
    }
    await delay(2000);
    if (process.env.KEEP_EXPORT !== "1") {
      try {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            fs.rmSync(kitOut, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 });
            fs.rmSync(demoHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            break;
          } catch (err) {
            if (attempt === 5) {
              console.warn(`warning: could not remove temp dirs: ${err.message}`);
            } else {
              await delay(800);
            }
          }
        }
      } catch (err) {
        console.warn(`warning: temp dir cleanup: ${err.message}`);
      }
    } else {
      console.log(`\nKEEP_EXPORT=1 — left export at ${kitOut}`);
    }
  };

  process.on("SIGINT", () => {
    cleanup().finally(() => process.exit(130));
  });

  try {
    await waitForHttp(`${base}/api/workspace`);

    console.log("\n── Probes: PATCH /api/workspace ──");

    const getRes = await fetch(`${base}/api/workspace`);
    assert(getRes.ok, `GET /api/workspace expected 200, got ${getRes.status}`);
    const getJson = await getRes.json();
    const wc = getJson.workspaceConfig;
    assert(wc?.dataModel?.objects?.length, "workspaceConfig.dataModel.objects missing");

    const badPatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branding: { name: "x" } }),
    });
    assert(badPatch.status === 400, `unknown PATCH field: expected 400, got ${badPatch.status}`);
    const badPatchJson = await badPatch.json();
    assert(
      String(badPatchJson.error || "").includes("unknown"),
      `expected unknown fields error, got ${JSON.stringify(badPatchJson)}`,
    );

    const dm = structuredClone(wc.dataModel);
    const companies = dm.objects.find((o) => o.id === "obj_companies_demo");
    assert(companies?.rows?.length, "demo Companies rows missing");
    const probeSuffix = `probe-${stamp}`;
    companies.rows[0].data.fld_company_name = `Acme Corp (${probeSuffix})`;

    const goodDm = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: dm }),
    });
    assert(goodDm.ok, `PATCH dataModel expected 200, got ${goodDm.status} ${await goodDm.text()}`);

    const afterDm = await fetch(`${base}/api/workspace`).then((r) => r.json());
    const nameAfter = afterDm.workspaceConfig?.dataModel?.objects
      ?.find((o) => o.id === "obj_companies_demo")
      ?.rows?.[0]?.data?.fld_company_name;
    assert(
      String(nameAfter || "").includes(probeSuffix),
      `dataModel cell not persisted: got ${nameAfter}`,
    );

    const canvasPatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ canvas: { name: `Tab 1 (${probeSuffix})` } }),
    });
    assert(canvasPatch.ok, `PATCH canvas expected 200, got ${canvasPatch.status}`);

    console.log("\n── Probes: PATCH /api/workspace/settings (brandKit) ──");

    const settingsNoBranding = await fetch(`${base}/api/workspace/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "nope" }),
    });
    assert(
      settingsNoBranding.status === 400,
      `settings without branding: expected 400, got ${settingsNoBranding.status}`,
    );

    const settingsBadKit = await fetch(`${base}/api/workspace/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branding: {
          brandKit: { colors: { primary: 12345 } },
        },
      }),
    });
    assert(
      settingsBadKit.status === 400,
      `invalid brandKit: expected 400, got ${settingsBadKit.status}`,
    );

    const settingsOk = await fetch(`${base}/api/workspace/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branding: {
          brandKit: {
            colors: { primary: "#ff00aa" },
          },
        },
      }),
    });
    const settingsOkBody = await settingsOk.text();
    assert(settingsOk.ok, `PATCH brandKit expected 200, got ${settingsOk.status} ${settingsOkBody}`);
    const settingsJson = JSON.parse(settingsOkBody);
    assert(
      settingsJson.branding?.brandKit?.colors?.primary === "#ff00aa",
      `brandKit primary not merged: ${JSON.stringify(settingsJson.branding?.brandKit?.colors)}`,
    );

    const settingsGet = await fetch(`${base}/api/workspace/settings`);
    assert(settingsGet.ok, `GET settings expected 200`);
    const settingsBody = await settingsGet.json();
    assert(
      settingsBody.branding?.brandKit?.colors?.primary === "#ff00aa",
      "GET /api/workspace/settings did not reflect persisted brandKit",
    );

    console.log("\n── Probes: POST /api/workspace/sandbox-run ──");

    const sandMissing = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(sandMissing.status === 400, `sandbox-run missing ids: expected 400, got ${sandMissing.status}`);

    const sand404 = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "obj_missing", name: "row" }),
    });
    assert(sand404.status === 404, `sandbox-run unknown object: expected 404, got ${sand404.status}`);

    console.log("\n── Probes: POST /api/workspace/refresh-sources ──");

    const refBad = await fetch(`${base}/api/workspace/refresh-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceIds: [] }),
    });
    assert(refBad.status === 400, `refresh-sources empty: expected 400, got ${refBad.status}`);

    const refOk = await fetch(`${base}/api/workspace/refresh-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceIds: ["obj_companies_demo"] }),
    });
    assert(refOk.ok, `refresh-sources expected 200, got ${refOk.status}`);
    const refJson = await refOk.json();
    assert(
      Array.isArray(refJson.dataModelRefAudit),
      `expected dataModelRefAudit array, got ${JSON.stringify(refJson).slice(0, 200)}`,
    );

    console.log("\nVERIFY OK — exported starter + live Next APIs behaved as expected.\n");
  } catch (err) {
    console.error(devLog.slice(-8000));
    throw err;
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
