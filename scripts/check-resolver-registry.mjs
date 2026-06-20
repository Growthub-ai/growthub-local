#!/usr/bin/env node
/**
 * Resolver Registry Drift Guard (CMS SDK v1.5.1).
 *
 * Enforces the invariant "generated resolver artifacts are projections of the
 * governed record, never hand-edited":
 *
 *   1. Every generated resolver file (carries the @growthub-resolver banner)
 *      must correspond to an `api-registry` row — no orphan generated files.
 *   2. If the externalized index artifact (_registry.generated.json) is present,
 *      it must match a fresh re-derivation (integrationId + provenance set) —
 *      a mismatch means someone edited a generated file or the artifact by hand.
 *   3. The endpoint manifest (_endpoints.generated.json), when present, must
 *      list exactly the exposed (registered) integrationIds.
 *
 * Runs against the bundled growthub-custom-workspace-starter-v1 app by default
 * (the shipped template carries no resolver files, so the guard passes clean),
 * or any fork via --fork <path>. Mirrors scripts/check-version-sync.mjs in role.
 *
 * Run with:  node scripts/check-resolver-registry.mjs [--fork <path>] [--json]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const json = args.includes("--json");
const forkIdx = args.indexOf("--fork");
const forkArg = forkIdx >= 0 ? args[forkIdx + 1] : "";

const defaultApp = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);
const appPath = forkArg
  ? (fs.existsSync(path.join(path.resolve(forkArg), "growthub.config.json"))
      ? path.resolve(forkArg)
      : path.join(path.resolve(forkArg), "apps/workspace"))
  : defaultApp;

const libDir = path.join(appPath, "lib");
const resolversDir = path.join(libDir, "adapters/integrations/resolvers");

const { deriveResolverRegistry, diffResolverArtifacts, parseResolverFileHeader, slugifyIntegrationId } = await import(
  pathToFileURL(path.join(libDir, "unified-resolver-registry.js")).href
);

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function listResolverFiles() {
  try {
    return fs
      .readdirSync(resolversDir)
      .filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."));
  } catch {
    return [];
  }
}

function readFileMeta(files) {
  const meta = {};
  for (const file of files) {
    const slug = slugifyIntegrationId(file, "");
    if (!slug) continue;
    try {
      const head = fs.readFileSync(path.join(resolversDir, file), "utf8").slice(0, 600);
      meta[slug] = parseResolverFileHeader(head);
    } catch {
      /* unreadable — skip */
    }
  }
  return meta;
}

const errors = [];
const warnings = [];

const workspaceConfig = readJsonSafe(path.join(appPath, "growthub.config.json")) || {};
const files = listResolverFiles();
const fileMeta = readFileMeta(files);

// Build the set of integrationIds the governed records declare.
const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
const declaredIds = new Set();
for (const object of objects) {
  if (object?.objectType !== "api-registry") continue;
  for (const row of Array.isArray(object.rows) ? object.rows : []) {
    const id = String(row?.integrationId || "").trim();
    if (id) declaredIds.add(slugifyIntegrationId(id, ""));
  }
}

// (1) No orphan generated files.
for (const [slug, meta] of Object.entries(fileMeta)) {
  if (meta.generated && !declaredIds.has(slug)) {
    errors.push(
      `orphan generated resolver "${slug}.js" has no api-registry row — generated files are projections of a governed record. Remove it or register the record.`,
    );
  }
}

// Re-derive the registry from current truth. registeredIds mirrors the runtime:
// generated/static files register under the slug, so the file slugs ARE the
// registered ids for drift purposes (the live registry is the authority at
// request time; here we verify the persisted projection against fresh truth).
const registeredIds = files.map((f) => slugifyIntegrationId(f, "")).filter(Boolean);
const fresh = deriveResolverRegistry({
  workspaceConfig,
  files,
  registeredIds,
  fileMeta,
  generatedAt: "drift-check",
});

// (2)+(3)+collisions — delegate to the shared pure comparison so the guard and
// the route can never disagree about what "drift" means.
const indexPath = path.join(resolversDir, "_registry.generated.json");
const manifestPath = path.join(resolversDir, "_endpoints.generated.json");
const { errors: driftErrors } = diffResolverArtifacts({
  fresh,
  savedIndex: fs.existsSync(indexPath) ? readJsonSafe(indexPath) : null,
  savedManifest: fs.existsSync(manifestPath) ? readJsonSafe(manifestPath) : null,
});
for (const e of driftErrors) errors.push(e);

const result = {
  ok: errors.length === 0,
  appPath,
  resolverFiles: files,
  declaredApiRegistryIds: [...declaredIds],
  derivedEntries: fresh.entries.length,
  errors,
  warnings,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log(`✓ resolver registry clean — ${files.length} file(s), ${fresh.entries.length} governed record(s), no drift`);
} else {
  console.error("✗ resolver registry drift guard failed:");
  for (const e of errors) console.error(`  - ${e}`);
}

process.exit(result.ok ? 0 : 1);
