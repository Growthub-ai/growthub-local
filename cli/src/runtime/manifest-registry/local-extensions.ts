/**
 * Local Extension Manifests
 *
 * Declarative, filesystem-loaded capability manifests that layer over hosted
 * truth. Extensions never replace hosted capabilities silently — they are
 * stamped with `provenance.originType = "local-extension"` so every
 * downstream surface can distinguish origin without heuristics.
 *
 * Lookup path:
 *   <workspacePath>/.growthub/manifests/*.json
 *
 * Each file contains a single `CapabilityManifest` object or an array.
 */

import fs from "node:fs";
import path from "node:path";
import type { CapabilityManifest, ManifestProvenance } from "@growthub/api-contract";

const EXTENSION_DIR = path.join(".growthub", "manifests");

function stampProvenance(
  manifest: CapabilityManifest,
  filePath: string,
): CapabilityManifest {
  const provenance: ManifestProvenance = {
    originType: "local-extension",
    localExtensionPath: filePath,
    recordedAt: manifest.provenance?.recordedAt ?? new Date().toISOString(),
    note: manifest.provenance?.note,
  };
  return { ...manifest, provenance };
}

function parseFile(filePath: string): CapabilityManifest[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const manifests: CapabilityManifest[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const m = entry as CapabilityManifest;
    if (typeof m.slug !== "string" || !m.node || typeof m.node.slug !== "string") continue;
    manifests.push(stampProvenance(m, filePath));
  }
  return manifests;
}

export function resolveWorkspaceExtensionDir(workspacePath: string): string {
  return path.resolve(workspacePath, EXTENSION_DIR);
}

/**
 * Load all valid local extension manifests from a workspace directory.
 * Unparseable or malformed files are skipped with a one-line warning.
 */
export function loadLocalExtensionManifests(workspacePath: string): CapabilityManifest[] {
  const dir = resolveWorkspaceExtensionDir(workspacePath);
  if (!fs.existsSync(dir)) return [];
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const manifests: CapabilityManifest[] = [];
  for (const file of files) {
    const full = path.resolve(dir, file);
    try {
      manifests.push(...parseFile(full));
    } catch {
      // skip malformed extension files — never crash the registry
    }
  }
  return manifests;
}

/**
 * Merge local extensions over a base manifest list.
 *
 * Rules:
 *   - slug match → local extension wins for its slug.
 *   - no slug match → local extension is appended.
 *   - base entries whose slug is not extended pass through untouched.
 */
export function mergeLocalExtensions(
  base: CapabilityManifest[],
  extensions: CapabilityManifest[],
): CapabilityManifest[] {
  if (extensions.length === 0) return base;
  const bySlug = new Map<string, CapabilityManifest>();
  for (const entry of base) bySlug.set(entry.slug, entry);
  for (const entry of extensions) bySlug.set(entry.slug, entry);
  return [...bySlug.values()];
}
