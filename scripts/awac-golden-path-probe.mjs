#!/usr/bin/env node
/**
 * Optional golden-path probe against a running exported workspace app (`apps/workspace`).
 *
 * Prerequisites: `npm run dev` (default Next.js port 3000).
 *
 *   AWAC_PROBE_BASE_URL=http://127.0.0.1:3000 node scripts/awac-golden-path-probe.mjs
 *
 * Exits non-zero if GET /api/workspace fails or reference-options returns an unexpected shape when exercised.
 * Sandbox-run is executed only when a sandbox-environment row with Name exists (otherwise skipped with a log line).
 */

const base = String(process.env.AWAC_PROBE_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function main() {
  const getRes = await fetch(`${base}/api/workspace`, { cache: "no-store" });
  if (!getRes.ok) {
    console.error(`FAIL GET /api/workspace → ${getRes.status}`);
    process.exit(1);
  }
  const getBody = await readJson(getRes);
  const wc = getBody.workspaceConfig;
  if (!wc || typeof wc !== "object") {
    console.error("FAIL GET /api/workspace: missing workspaceConfig");
    process.exit(1);
  }
  console.log("OK GET /api/workspace");

  const objects = Array.isArray(wc.dataModel?.objects) ? wc.dataModel.objects : [];

  const dataSource = objects.find((o) => o.objectType === "data-source" && o.id);
  if (dataSource) {
    const refRes = await fetch(`${base}/api/workspace/reference-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectId: dataSource.id,
        field: "registryId",
        query: "",
        limit: 10
      })
    });
    const refBody = await readJson(refRes);
    if (!refRes.ok || refBody.ok === false) {
      console.error("FAIL POST /api/workspace/reference-options", refBody);
      process.exit(1);
    }
    if (!Array.isArray(refBody.options)) {
      console.error("FAIL reference-options: options must be an array");
      process.exit(1);
    }
    console.log(`OK POST /api/workspace/reference-options (${refBody.options.length} options)`);
  } else {
    console.log("SKIP POST /api/workspace/reference-options (no data-source object in workspaceConfig)");
  }

  const sandbox = objects.find((o) => o.objectType === "sandbox-environment" && o.id);
  const row = sandbox?.rows?.find((r) => String(r?.Name || "").trim());
  if (!sandbox || !row) {
    console.log("SKIP POST /api/workspace/sandbox-run (no sandbox-environment row with Name)");
    console.log("Done.");
    return;
  }

  const runRes = await fetch(`${base}/api/workspace/sandbox-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectId: sandbox.id, name: String(row.Name).trim() })
  });
  const runBody = await readJson(runRes);
  if (typeof runBody.sourceId !== "string") {
    console.error("FAIL sandbox-run: sourceId must be a string", runBody);
    process.exit(1);
  }
  if (!runBody.response || typeof runBody.response !== "object") {
    console.error("FAIL sandbox-run: response object missing", runBody);
    process.exit(1);
  }
  const st = String(runBody.status || "").toLowerCase();
  if (st !== "connected" && st !== "failed") {
    console.error("FAIL sandbox-run: status must be connected|failed", runBody);
    process.exit(1);
  }
  if (typeof runBody.response.durationMs !== "number") {
    console.warn("WARN sandbox-run: response.durationMs is not a number (probe continues)");
  }
  console.log(`OK POST /api/workspace/sandbox-run (status=${runBody.status}, sourceId=${runBody.sourceId})`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
