/**
 * Resolver dynamic loader — filesystem-safe, ESM-compatible.
 *
 * Reads every `.js` file from `lib/adapters/integrations/resolvers/` and
 * side-effect-imports it so each file can call `registerSourceResolver()`.
 *
 * This runs server-side only. The browser never sees or calls this module.
 * In read-only / production runtimes with no resolver files the registry
 * stays empty — the refresh button and test route gracefully skip unknown
 * integrationIds and surface them in the `skipped` array.
 *
 * Two cadences:
 *   - `loadStaticResolversOnce()` — imports `.js` files in the resolvers/
 *     directory exactly once per worker process. Static resolvers register
 *     themselves at module-load time; re-importing would be a no-op anyway.
 *   - `refreshConfigDrivenResolvers()` — re-scans growthub.config.json on
 *     EVERY call. New Nango-backed api-registry rows are picked up without
 *     a server restart. The source-resolver registry's `registerSourceResolver`
 *     contract is "calling again with the same integrationId replaces the
 *     existing resolver", so repeated registration is safe.
 *
 * `loadAllResolvers()` calls both and remains the single entry point that
 * existing routes (test-source, refresh-source) consume.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const staticLoaded = new Set();
let staticLoadDone = false;

async function loadStaticResolversOnce() {
  if (staticLoadDone) return;
  staticLoadDone = true;
  const resolversDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/integrations/resolvers");
  try {
    const entries = await fs.readdir(resolversDir);
    const jsFiles = entries.filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."));
    await Promise.all(
      jsFiles.map(async (file) => {
        if (staticLoaded.has(file)) return;
        try {
          const absolutePath = path.join(resolversDir, file);
          await import(/*turbopackIgnore: true*/ pathToFileURL(absolutePath).href);
          staticLoaded.add(file);
        } catch {
          // Malformed resolver — skip silently; operator needs to fix the file
        }
      })
    );
  } catch {
    // resolvers directory missing or empty — normal for fresh upstream kit
  }
}

/**
 * Re-scan growthub.config.json for Nango-backed api-registry rows and
 * register one source resolver per row. Runs on every invocation so newly
 * added rows are picked up between requests without a server restart.
 *
 * Returns the list of integrationIds registered on this call (or `[]` on
 * any non-fatal error — the static resolvers still work).
 */
async function refreshConfigDrivenResolvers() {
  try {
    const { readWorkspaceConfig } = await import("../../workspace-config.js");
    const { registerNangoResolversFromConfig } = await import("./nango/index.js");
    const workspaceConfig = await readWorkspaceConfig();
    return registerNangoResolversFromConfig(workspaceConfig) || [];
  } catch {
    return [];
  }
}

async function loadAllResolvers() {
  await loadStaticResolversOnce();
  await refreshConfigDrivenResolvers();
}

async function listResolverFiles() {
  const resolversDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/integrations/resolvers");
  try {
    const entries = await fs.readdir(resolversDir);
    return entries.filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."));
  } catch {
    return [];
  }
}

export {
  loadAllResolvers,
  loadStaticResolversOnce,
  listResolverFiles,
  refreshConfigDrivenResolvers
};
