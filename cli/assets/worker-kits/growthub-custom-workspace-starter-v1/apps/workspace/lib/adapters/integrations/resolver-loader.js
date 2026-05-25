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
 * Called once per route handler invocation (Next.js module cache means it
 * will only do real I/O on the first call in each worker process).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const loaded = new Set();
let loadAttempted = false;

async function loadAllResolvers() {
  if (loadAttempted) return;
  loadAttempted = true;
  const resolversDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/integrations/resolvers");
  try {
    const entries = await fs.readdir(resolversDir);
    const jsFiles = entries.filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."));
    await Promise.all(
      jsFiles.map(async (file) => {
        if (loaded.has(file)) return;
        try {
          const absolutePath = path.join(resolversDir, file);
          await import(/*turbopackIgnore: true*/ pathToFileURL(absolutePath).href);
          loaded.add(file);
        } catch {
          // Malformed resolver — skip silently; operator needs to fix the file
        }
      })
    );
  } catch {
    // resolvers directory missing or empty — normal for fresh upstream kit
  }
  // Config-driven Nango resolvers — picks up `objectType: "api-registry"`
  // rows with `connectorKind: "nango"` from growthub.config.json. No
  // resolver file authoring is required for Nango-backed providers.
  try {
    const { readWorkspaceConfig } = await import("../../workspace-config.js");
    const { registerNangoResolversFromConfig } = await import("./nango/index.js");
    const workspaceConfig = await readWorkspaceConfig();
    registerNangoResolversFromConfig(workspaceConfig);
  } catch {
    // Missing config or Nango module — non-fatal; static resolvers still work.
  }
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

export { loadAllResolvers, listResolverFiles };
