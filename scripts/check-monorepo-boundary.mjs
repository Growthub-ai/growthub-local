#!/usr/bin/env node
/**
 * check-monorepo-boundary.mjs
 *
 * Machine-readable form of docs/MONOREPO_PROVENANCE_MAP_V1.md.
 *
 * growthub-local is the authoritative source of truth for the product. Each
 * path plays a product ROLE, and knowing that role is what an agent needs in
 * order to traverse the repo and judge the blast radius of a change. This check
 * makes the role boundary legible and enforced:
 *
 *   1. Classify every top-level path into a role zone (core-product /
 *      vendored-runtime / orphan / scaffolding); fail on anything UNCLASSIFIED
 *      (a new path nobody mapped).
 *   2. Verify that script invocations (`node scripts/X`, `bash scripts/X`) and
 *      relative markdown links inside docs/ and scripts/ resolve to files that
 *      exist — fail on a true dangling reference.
 *   3. REPORT (do not fail) dead pnpm-workspace.yaml globs that resolve to
 *      nothing.
 *
 * Errors exit non-zero. Warnings do not. `--json` emits the full classification.
 *
 * No dependencies; Node >= 20. Pure read-only.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const SELF = path.resolve(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(path.dirname(SELF), "..");
const JSON_OUT = process.argv.includes("--json");

/**
 * Role zones keyed by top-level entry name.
 * Mirrors docs/MONOREPO_PROVENANCE_MAP_V1.md §2. Keep the two in sync.
 */
const ZONES = {
  // CORE-PRODUCT — the published value (exporter, SDK, installer, exportable kits)
  cli: "core-product",
  "packages/api-contract": "core-product",
  "packages/create-growthub-local": "core-product",
  "packages/adapter-utils": "vendored-runtime",
  "packages/adapters": "vendored-runtime",
  "packages/plugins": "vendored-runtime",
  "packages/model-training": "scaffolding",

  // VENDORED-RUNTIME (Paperclip) — bundled local runtime, not the product
  server: "vendored-runtime",
  "packages/shared": "vendored-runtime",

  // CORE-PRODUCT (partial OSS view) — packages/db ships only src/** here; its
  // package.json lives in the full (super-admin) workspace. Not an orphan.
  "packages/db": "core-product",

  // SCAFFOLDING — tooling, contracts, docs, CI
  docs: "scaffolding",
  scripts: "scaffolding",
  "README.md": "scaffolding",
  "ARCHITECTURE.md": "scaffolding",
  "AGENTS.md": "scaffolding",
  "CLAUDE.md": "scaffolding",
  "LOCAL_AGENTS.md": "scaffolding",
  ".cursorrules": "scaffolding",
  "CONTRIBUTING.md": "scaffolding",
  ".github": "scaffolding",
  ".githooks": "scaffolding",
  ".claude": "scaffolding",
  ".agents": "scaffolding",
  ".gitignore": "scaffolding",
  "tsconfig.json": "scaffolding",
  "tsconfig.base.json": "scaffolding",
  "vitest.config.ts": "scaffolding",
  "package.json": "scaffolding",
  "pnpm-lock.yaml": "scaffolding",
  "pnpm-workspace.yaml": "scaffolding",
};

const errors = [];
const warnings = [];

// ---------------------------------------------------------------------------
// 1. Classify top-level entries (and the two-level packages/* entries).
// ---------------------------------------------------------------------------
const classification = {};

function classify(rel) {
  const zone = ZONES[rel];
  classification[rel] = zone ?? "UNCLASSIFIED";
  if (!zone) {
    errors.push(`UNCLASSIFIED path "${rel}" — add it to ZONES in check-monorepo-boundary.mjs and to docs/MONOREPO_PROVENANCE_MAP_V1.md §2.`);
  }
}

const IGNORE_TOP = new Set([
  "node_modules", ".git", ".worktrees", ".paperclip", "tmp", "coverage", ".npm-cache", ".DS_Store",
  ".env.local", ".growthub", ".reviews-consumers", ".superadmin",
  "codex-smoke-dashboard", "growthub-local", "instances", "output", "sdk-consumer-test",
]);

for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
  const name = entry.name;
  if (IGNORE_TOP.has(name)) continue;
  if (name === "packages") {
    for (const pkg of fs.readdirSync(path.join(repoRoot, "packages"), { withFileTypes: true })) {
      if (pkg.isDirectory()) classify(`packages/${pkg.name}`);
    }
    continue;
  }
  classify(name);
}

// ---------------------------------------------------------------------------
// 2. Dangling-reference check over OWNED zones (docs/, scripts/).
//    - script invocations: `node scripts/X.mjs`, `bash scripts/X.sh`
//    - relative markdown links: ](./path) or ](../path)
//    Lines marked as tombstones ("removed", "deleted", "do not use") are skipped
//    intentionally — they document that a file is gone, not a live reference.
// ---------------------------------------------------------------------------
const TOMBSTONE = /\b(removed|deleted|do not use|no longer|legacy|deprecated)\b/i;
const SCRIPT_INVOKE = /\b(?:node|bash|sh)\s+((?:\.\/)?scripts\/[A-Za-z0-9._\/-]+\.(?:mjs|js|sh|ts))/g;
const MD_LINK = /\]\((\.{1,2}\/[A-Za-z0-9._\/-]+)\)/g;

function walk(dir, exts, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, exts, cb);
    else if (exts.some((x) => e.name.endsWith(x))) cb(full);
  }
}

function checkRefsInFile(file) {
  if (path.resolve(file) === SELF) return; // never lint our own docstring examples
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const fileDir = path.dirname(file);
  lines.forEach((line, i) => {
    if (TOMBSTONE.test(line)) return;
    let m;
    SCRIPT_INVOKE.lastIndex = 0;
    while ((m = SCRIPT_INVOKE.exec(line))) {
      const target = m[1].replace(/^\.\//, "");
      if (!fs.existsSync(path.join(repoRoot, target))) {
        errors.push(`Dangling script reference in ${path.relative(repoRoot, file)}:${i + 1} → "${target}" does not exist.`);
      }
    }
    if (file.endsWith(".md")) {
      MD_LINK.lastIndex = 0;
      while ((m = MD_LINK.exec(line))) {
        const linkTarget = m[1].split("#")[0];
        if (!linkTarget) continue;
        const resolved = path.resolve(fileDir, linkTarget);
        if (!fs.existsSync(resolved)) {
          errors.push(`Dangling doc link in ${path.relative(repoRoot, file)}:${i + 1} → "${m[1]}" does not resolve.`);
        }
      }
    }
  });
}

walk(path.join(repoRoot, "docs"), [".md"], checkRefsInFile);
walk(path.join(repoRoot, "scripts"), [".md", ".mjs", ".sh"], checkRefsInFile);

// ---------------------------------------------------------------------------
// 3. pnpm-workspace.yaml globs — REPORT ONLY.
//    The OSS tree is a partial view (docs/AGENT_DIST_REBUILD_GUIDE.md §2): some
//    globs resolve to empty dirs ON PURPOSE because the packages live only in
//    the full super-admin workspace. Those are intentional — never flag them.
//    Only an unexpected non-existent glob is worth a note.
// ---------------------------------------------------------------------------
const INTENTIONAL_FULLWS_GLOBS = new Set([
  "packages/adapters/*",
  "packages/plugins/*",
  "packages/plugins/examples/*",
]);
const wsFile = path.join(repoRoot, "pnpm-workspace.yaml");
if (fs.existsSync(wsFile)) {
  const ws = fs.readFileSync(wsFile, "utf8");
  for (const glob of ws.matchAll(/^\s*-\s*([A-Za-z0-9._*\/-]+)\s*$/gm)) {
    if (INTENTIONAL_FULLWS_GLOBS.has(glob[1])) continue;
    const base = glob[1].replace(/\/?\*.*$/, "");
    if (base && !fs.existsSync(path.join(repoRoot, base))) {
      warnings.push(`pnpm-workspace.yaml glob "${glob[1]}" resolves to nothing and is not a known full-workspace glob — reconcile.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const summary = {
  classification,
  errors,
  warnings,
  ok: errors.length === 0,
};

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const counts = Object.values(classification).reduce((a, z) => ((a[z] = (a[z] || 0) + 1), a), {});
  console.log("Mono-repo boundary check (docs/MONOREPO_PROVENANCE_MAP_V1.md)\n");
  console.log("Provenance:", Object.entries(counts).map(([z, n]) => `${z}=${n}`).join("  "));
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} upstream-synced warning(s) (report-only):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (errors.length) {
    console.log(`\n✗ ${errors.length} error(s):`);
    for (const e of errors) console.log(`  - ${e}`);
  } else {
    console.log("\n✓ No owned-zone dangling references; no unclassified paths.");
  }
}

process.exit(errors.length === 0 ? 0 : 1);
