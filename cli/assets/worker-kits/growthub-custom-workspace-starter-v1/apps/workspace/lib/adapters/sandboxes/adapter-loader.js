/**
 * Sandbox adapter dynamic loader — filesystem-safe, ESM-compatible.
 *
 * Reads every `.js` file from `lib/adapters/sandboxes/adapters/` and
 * side-effect-imports it so each file can call `registerSandboxAdapter()`.
 *
 * Mirrors `lib/adapters/integrations/resolver-loader.js` exactly so operators
 * recognize the drop-zone pattern. Server-side only — the browser never sees
 * this module.
 *
 * The default `local-process` adapter ships under
 * `lib/adapters/sandboxes/default-local-process.js` and is loaded eagerly by
 * `index.js`; this loader is for additional drop-zone adapters added by
 * forks (e.g. `fly-machines.js`, `e2b.js`, `modal.js`).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const loaded = new Set();
let loadAttempted = false;

async function loadAllSandboxAdapters() {
  if (loadAttempted) return;
  loadAttempted = true;
  const adaptersDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/sandboxes/adapters");
  try {
    const entries = await fs.readdir(adaptersDir);
    const jsFiles = entries.filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."));
    await Promise.all(
      jsFiles.map(async (file) => {
        if (loaded.has(file)) return;
        try {
          const absolutePath = path.join(adaptersDir, file);
          await import(/*turbopackIgnore: true*/ pathToFileURL(absolutePath).href);
          loaded.add(file);
        } catch {
          // Malformed adapter — skip silently; operator needs to fix the file
        }
      })
    );
  } catch {
    // adapters drop-zone missing or empty — normal for fresh upstream kit
  }
}

async function listSandboxAdapterFiles() {
  const adaptersDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/sandboxes/adapters");
  try {
    const entries = await fs.readdir(adaptersDir);
    return entries.filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."));
  } catch {
    return [];
  }
}

export { loadAllSandboxAdapters, listSandboxAdapterFiles };
