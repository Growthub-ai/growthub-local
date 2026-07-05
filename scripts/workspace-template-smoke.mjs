#!/usr/bin/env node
// E2E smoke for a registered workspace template on the canonical
// seeded-config pathway — the SECOND half of the golden path
// (docs/WORKSPACE_TEMPLATE_GOLDEN_PATH_V1.md). Run after registering
// templates/seeded-configs/<slug>.config.json and its WORKSPACE_TEMPLATES
// entry, exactly the way the gtm-os conversion was proven.
//
// What it does (all real, nothing mocked):
//   1. Resolves the CLI (growthub → cli/dist/index.js → scripts/demo-cli.sh).
//   2. `kit inspect <slug> --json` — the template resolves on the discover/kit
//      surface.
//   3. `starter init --out <tmp> --seed-config <slug>` — a REAL export.
//   4. Merged-config readbacks: objects merged, rows arrays only, api-registry
//      hygiene (env-ref authRefs, empty connectionIds), secret/PII grep.
//   5. Optional --boot: links node_modules (--link-node-modules <dir> or an
//      existing install), boots `next dev` on --port, and reads back
//      /api/workspace — object count, dashboards, registry hygiene as SERVED.
//
// Usage (from repo root):
//   node scripts/workspace-template-smoke.mjs --slug gtm-os
//   node scripts/workspace-template-smoke.mjs --slug gtm-os \
//     --boot --port 3779 --link-node-modules /path/to/existing/apps/workspace/node_modules
//
// Exit code 0 only when every check passes.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (key === "--boot") {
    args.set(key, "true");
    i -= 1;
    continue;
  }
  args.set(key, value);
}

const slug = String(args.get("--slug") || "").trim();
if (!slug) {
  console.error("--slug <template-slug> is required (e.g. gtm-os, project-management).");
  process.exit(1);
}
const boot = args.get("--boot") === "true";
const port = Number(args.get("--port") || 3779);
const linkNodeModules = args.get("--link-node-modules") ? path.resolve(String(args.get("--link-node-modules"))) : "";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- 1. Resolve the CLI (skill-catalog convention) ----
function resolveCli() {
  const probe = spawnSync("growthub", ["--version"], { encoding: "utf8" });
  if (probe.status === 0) return ["growthub"];
  const dist = path.join(repoRoot, "cli/dist/index.js");
  if (fs.existsSync(dist)) {
    const distProbe = spawnSync("node", [dist, "--version"], { encoding: "utf8" });
    if (distProbe.status === 0) return ["node", dist];
  }
  const demo = path.join(repoRoot, "scripts/demo-cli.sh");
  if (fs.existsSync(demo)) return ["bash", demo, "cli", "--"];
  return null;
}
const cli = resolveCli();
check("CLI entry resolves (growthub | dist | demo-cli)", Boolean(cli), cli ? cli.join(" ") : "none of the three entries work");
if (!cli) finish();

function runCli(cliArgs, opts = {}) {
  const [head, ...rest] = cli;
  return spawnSync(head, [...rest, ...cliArgs], { encoding: "utf8", cwd: opts.cwd || repoRoot, timeout: 180000 });
}

// ---- 2. Template resolves on the kit/discover surface ----
const inspect = runCli(["kit", "inspect", slug, "--json"]);
let templateItem = null;
try { templateItem = JSON.parse(inspect.stdout); } catch { templateItem = null; }
check("kit inspect resolves the template", inspect.status === 0 && templateItem?.briefType === "workspace-template", (inspect.stdout || inspect.stderr || "").slice(0, 120).trim());

// ---- 3. Real export via the canonical pathway ----
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `template-smoke-${slug}-`));
const outDir = path.join(tmpRoot, `${slug}-workspace`);
const init = runCli(["starter", "init", "--out", outDir, "--seed-config", slug, "--name", `${slug} smoke`, "--json"]);
check("starter init exports the seeded workspace", init.status === 0 && fs.existsSync(path.join(outDir, "apps/workspace/growthub.config.json")), (init.stderr || "").slice(0, 160).trim());

// ---- 4. Merged-config readbacks ----
const configPath = path.join(outDir, "apps/workspace/growthub.config.json");
let merged = null;
try { merged = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { merged = null; }
const objects = merged?.dataModel?.objects || [];
check("merged config parses with a populated data model", objects.length > 0, `objects=${objects.length}`);
check("provenance carries the workspace-template contract", merged?.provenance?.template === slug && merged?.provenance?.templateKind === "workspace-template", JSON.stringify({ template: merged?.provenance?.template }));
check("runtime rows contract (rows arrays, no legacy .records)", objects.every((o) => Array.isArray(o.rows) && !("records" in o)), "");
const registries = objects.filter((o) => o.objectType === "api-registry");
const registryRows = registries.flatMap((o) => o.rows || []);
check("api-registry hygiene: env-ref authRefs + EMPTY connectionIds", registryRows.every((r) => !String(r.connectionIds || "").trim() && !/\s/.test(String(r.authRef || ""))), `rows=${registryRows.length}`);
const serialized = fs.readFileSync(configPath, "utf8").split("operator@example.com").join("operator-placeholder");
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/, /sk_(?:live|test)_[A-Za-z0-9]{10,}/, /whsec_[A-Za-z0-9+/=]{10,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/, /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}/,
  /Bearer\s+[A-Za-z0-9._~+/=-]{25,}/, /hooks\.slack\.com\/services\/[A-Za-z0-9/]+/,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
];
check("exported config is secret/PII clean", SECRET_PATTERNS.every((p) => !p.test(serialized)), "");

// ---- 5. Optional real boot + served readback ----
if (!boot) {
  console.log("(--boot not set: skipping the live boot readback — config-level checks only)");
  finish();
}

const appDir = path.join(outDir, "apps/workspace");
if (!fs.existsSync(path.join(appDir, "node_modules"))) {
  if (linkNodeModules && fs.existsSync(linkNodeModules)) {
    fs.cpSync(linkNodeModules, path.join(appDir, "node_modules"), { recursive: true, force: false, errorOnExist: false });
  } else {
    console.log("Installing workspace dependencies (no --link-node-modules provided)…");
    const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: appDir, encoding: "utf8", timeout: 600000 });
    check("workspace dependencies install", install.status === 0, (install.stderr || "").slice(-160));
  }
}

const server = spawn("npx", ["next", "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], { cwd: appDir, stdio: "ignore", detached: true });
try {
  let served = null;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/workspace`);
      if (response.ok) { served = await response.json(); break; }
    } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const cfg = served?.workspaceConfig || {};
  const servedObjects = cfg?.dataModel?.objects || [];
  check("booted export serves /api/workspace", Boolean(served), "");
  check("served data model matches the merged export", servedObjects.length === objects.length, `served=${servedObjects.length} merged=${objects.length}`);
  check("dashboards are served", (cfg.dashboards || []).length === (merged.dashboards || []).length, (cfg.dashboards || []).map((d) => d.name).join(" | "));
  const servedRegistryRows = servedObjects.filter((o) => o.objectType === "api-registry").flatMap((o) => o.rows || []);
  check("served api-registry rows stay operator-clean", servedRegistryRows.every((r) => !String(r.connectionIds || "").trim()), `rows=${servedRegistryRows.length}`);
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { try { server.kill("SIGTERM"); } catch { /* gone */ } }
}
finish();

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== template-smoke[${slug}] ${failed.length === 0 ? "GREEN" : "RED"}: ${results.length - failed.length}/${results.length} ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}
