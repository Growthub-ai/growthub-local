#!/usr/bin/env node
/**
 * E2E probe — Unified API Resolver Registry (CMS SDK v1.5.1) against a REAL
 * exported workspace runtime. Not a unit test: it reconstructs the export the
 * CLI produces (the bundled growthub-custom-workspace-starter-v1 apps/workspace),
 * installs it, boots `next dev`, and drives the full no-code customer journey
 * against a deterministic local fixture API — positive AND negative paths.
 *
 * Journey proven:
 *   1. GET /api/workspace/resolvers              → additive `registry` index present
 *   2. GET /api/resolvers/<unknown>              → 404 no-resolver  (NEGATIVE)
 *   3. PATCH /api/workspace                      → register a governed api-registry row
 *   4. POST /api/workspace/test-api-record       → API tested server-side
 *   5. PATCH /api/workspace                      → persist tested state (as the drawer does)
 *   6. POST /api/workspace/helper/apply          → CONSTRUCT the governed resolver (file lane)
 *   7. GET /api/workspace/resolvers              → record now correlated: registered + endpoint
 *   8. GET /api/resolvers/<id>                   → governed endpoint returns shaped records (POSITIVE)
 *   9. scripts/check-resolver-registry.mjs --fork → drift guard clean on the live fork
 *
 * Network-independent: the "external API" is a local node http fixture, so the
 * probe is reproducible in any sandbox. Run with:
 *   node scripts/e2e-resolver-registry-probe.mjs [--keep] [--port 3987]
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const kitApp = path.join(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);

const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const portIdx = args.indexOf("--port");
const DEV_PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 3987;
const INTEGRATION_ID = "probe-api";

const FIXTURE_RECORDS = [
  { id: "r1", name: "Ada Lovelace", email: "ada@probe.test", created_at: "2026-01-01" },
  { id: "r2", name: "Alan Turing", email: "alan@probe.test", created_at: "2026-02-01" },
  { id: "r3", name: "Grace Hopper", email: "grace@probe.test", created_at: "2026-03-01" },
];

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gh-resolver-e2e-"));
  const appDir = path.join(tmp, "workspace-app");
  let fixture;
  let dev;
  let fixturePort = 0;

  const cleanup = async () => {
    try { if (dev && !dev.killed) process.kill(-dev.pid, "SIGKILL"); } catch {}
    try { if (fixture) fixture.close(); } catch {}
    if (!KEEP) { try { await fs.rm(tmp, { recursive: true, force: true }); } catch {} }
    else console.log(`\n(kept) temp workspace: ${appDir}`);
  };

  try {
    // ── Fixture API ─────────────────────────────────────────────────────────
    fixture = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url.startsWith("/records")) {
        res.end(JSON.stringify({ data: FIXTURE_RECORDS, count: FIXTURE_RECORDS.length }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
      }
    });
    await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
    fixturePort = fixture.address().port;
    const fixtureBase = `http://127.0.0.1:${fixturePort}`;
    record("fixture API up", true, fixtureBase);

    // ── Reconstruct the export (what the CLI's copyBundledKitSource does) ─────
    await fs.cp(kitApp, appDir, {
      recursive: true,
      filter: (src) => !src.includes("node_modules") && !src.includes("/.next"),
    });
    record("export reconstructed", true, appDir);

    // ── Install + boot the exported runtime ──────────────────────────────────
    console.log("Installing exported workspace (npm install)…");
    await run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: appDir });
    record("npm install", true);

    const env = {
      ...process.env,
      WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      // authRef "PROBE" resolves through these — fixture ignores auth, but the
      // tested + resolver paths exercise server-side secret resolution.
      PROBE_API_KEY: "probe-secret",
    };
    dev = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
      cwd: appDir,
      env,
      detached: true,
      stdio: "ignore",
    });

    const base = `http://127.0.0.1:${DEV_PORT}`;
    let ready = false;
    for (let i = 0; i < 90; i++) {
      await sleep(2000);
      try {
        const r = await fetch(`${base}/api/workspace`, { cache: "no-store" });
        if (r.ok) { ready = true; break; }
      } catch {}
    }
    if (!ready) throw new Error(`dev server never became ready at ${base}`);
    record("next dev ready", true, base);

    // ── 1. registry index present (additive field) ───────────────────────────
    {
      const r = await jfetch(`${base}/api/workspace/resolvers`);
      const ok = r.ok && r.body?.registry?.kind === "growthub-resolver-registry-index-v1"
        && Array.isArray(r.body.registry.entries);
      record("1. GET /api/workspace/resolvers → registry index", ok,
        ok ? `${r.body.registry.entries.length} entries` : `status ${r.status}`);
    }

    // ── 2. NEGATIVE: unknown resolver endpoint → 404 ─────────────────────────
    {
      const r = await jfetch(`${base}/api/resolvers/does-not-exist-xyz`);
      const ok = r.status === 404 && r.body?.reason === "no-resolver";
      record("2. NEGATIVE GET /api/resolvers/<unknown> → 404 no-resolver", ok, `status ${r.status}`);
    }

    // ── 3. register a governed api-registry row ──────────────────────────────
    const apiObject = {
      id: "workspace-api-registry",
      label: "API Registry",
      objectType: "api-registry",
      columns: ["Name", "integrationId", "baseUrl", "endpoint", "method", "authRef", "authHeaderName", "status", "lastResponse", "resolverTemplateId", "connectorKind"],
      rows: [{
        Name: "Probe API",
        integrationId: INTEGRATION_ID,
        baseUrl: fixtureBase,
        endpoint: "/records",
        method: "GET",
        authRef: "PROBE",
        authHeaderName: "x-api-key",
        connectorKind: "custom-http",
        status: "",
        lastResponse: "",
        resolverTemplateId: "",
      }],
    };
    {
      const cur = await jfetch(`${base}/api/workspace`);
      const dm = cur.body?.workspaceConfig?.dataModel || cur.body?.dataModel || {};
      const objects = Array.isArray(dm.objects) ? dm.objects.filter((o) => o.id !== apiObject.id) : [];
      const r = await jfetch(`${base}/api/workspace`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: { ...dm, objects: [...objects, apiObject] } }),
      });
      record("3. PATCH /api/workspace → api-registry row registered", r.ok, `status ${r.status}`);
      if (!r.ok) throw new Error(`registry PATCH failed: ${JSON.stringify(r.body).slice(0, 300)}`);
    }

    // ── 4. test the API server-side ──────────────────────────────────────────
    let lastResponse = "";
    {
      const r = await jfetch(`${base}/api/workspace/test-api-record`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ record: { baseUrl: fixtureBase, endpoint: "/records", method: "GET", authRef: "PROBE", authHeaderName: "x-api-key" } }),
      });
      const ok = r.ok && r.body?.ok === true;
      lastResponse = JSON.stringify(r.body?.response ?? {});
      record("4. POST /api/workspace/test-api-record → tested", ok, ok ? `status ${r.body.status}` : `status ${r.status}`);
    }

    // ── 5. persist tested state (mirrors the drawer's onSave) ────────────────
    {
      apiObject.rows[0].status = "connected";
      apiObject.rows[0].lastResponse = lastResponse;
      const cur = await jfetch(`${base}/api/workspace`);
      const dm = cur.body?.workspaceConfig?.dataModel || cur.body?.dataModel || {};
      const objects = (Array.isArray(dm.objects) ? dm.objects : []).filter((o) => o.id !== apiObject.id);
      const r = await jfetch(`${base}/api/workspace`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: { ...dm, objects: [...objects, apiObject] } }),
      });
      record("5. PATCH /api/workspace → tested state persisted", r.ok, `status ${r.status}`);
    }

    // ── 6. CONSTRUCT the governed resolver (the v1.5.1 no-code core) ──────────
    {
      const r = await jfetch(`${base}/api/workspace/helper/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewedBy: "e2e-probe",
          proposals: [{
            type: "resolver.create",
            affectedField: "server-file",
            payload: { integrationId: INTEGRATION_ID, rootPath: "data", entityType: "records" },
          }],
        }),
      });
      const applied = Array.isArray(r.body?.applied) ? r.body.applied.find((a) => a.type === "resolver.create") : null;
      record("6. POST helper/apply → resolver constructed (file lane)", r.ok && Boolean(applied),
        applied ? applied.resolverFilename : `skipped: ${JSON.stringify(r.body?.skipped || []).slice(0, 200)}`);
    }

    // ── 7. registry now correlates the record → resolver + endpoint ──────────
    {
      const r = await jfetch(`${base}/api/workspace/resolvers`);
      const entry = (r.body?.registry?.entries || []).find((e) => e.integrationId === INTEGRATION_ID);
      const ok = Boolean(entry) && entry.registered === true
        && entry.endpoint === `/api/resolvers/${INTEGRATION_ID}`
        && entry.provenance === "helper-generated";
      record("7. registry correlates record → resolver (registered + endpoint + provenance)", ok,
        entry ? `provenance=${entry.provenance} registered=${entry.registered} endpoint=${entry.endpoint}` : "entry missing");
    }

    // ── 8. POSITIVE: governed endpoint returns shaped records ────────────────
    {
      const r = await jfetch(`${base}/api/resolvers/${INTEGRATION_ID}`);
      const ok = r.ok && r.body?.ok === true && r.body.recordCount === FIXTURE_RECORDS.length
        && Array.isArray(r.body.records) && r.body.records[0]?.id === "r1";
      record("8. POSITIVE GET /api/resolvers/<id> → governed endpoint returns records", ok,
        ok ? `${r.body.recordCount} records` : `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    }

    // ── 8b. the edited no-code surface compiles (cockpit + construct panel) ──
    {
      const r = await fetch(`${base}/data-model`, { cache: "no-store" });
      record("8b. GET /data-model → edited cockpit/construct UI compiles", r.ok, `status ${r.status}`);
    }

    // ── 9. drift guard clean on the live fork ────────────────────────────────
    {
      let ok = false;
      try {
        await run("node", [path.join(repoRoot, "scripts/check-resolver-registry.mjs"), "--fork", appDir]);
        ok = true;
      } catch {
        ok = false;
      }
      record("9. drift guard clean on live fork", ok);
    }
  } finally {
    await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"} — ${results.length - failed.length}/${results.length} checks`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E probe crashed:", err?.message || err);
  process.exit(1);
});
