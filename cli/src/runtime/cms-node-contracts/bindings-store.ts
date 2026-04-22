/**
 * Bindings Store
 *
 * Saved-bindings personalization. Bindings live inside the fork:
 *
 *   <forkPath>/.growthub-fork/bindings/<slug>/<name>.json
 *
 * Co-located with the fork's manifest snapshot so a team member on another
 * machine opening the fork gets the same manifest *and* the same saved
 * bindings — cross-machine handoff rides the existing fork-sync primitive.
 *
 * Each stored record carries:
 *   - the schema version it was authored against (API_CONTRACT_VERSION)
 *   - the manifest fetchedAt stamp
 *   - the field values themselves
 *
 * Drift against a newer schema is surfaced on load so callers can preview
 * changes before running.
 */

import fs from "node:fs";
import path from "node:path";
import {
  API_CONTRACT_VERSION,
  type CapabilityManifest,
  type NodeInputSchema,
} from "@growthub/api-contract";
import { resolveInForkBindingsDir } from "../../config/kit-forks-home.js";

export interface SavedBindingsRecord {
  version: 1;
  slug: string;
  name: string;
  schemaVersion: typeof API_CONTRACT_VERSION;
  manifestFetchedAt?: string;
  savedAt: string;
  bindings: Record<string, unknown>;
  note?: string;
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 64);
}

function resolveSlugDir(forkPath: string, slug: string): string {
  return path.resolve(resolveInForkBindingsDir(forkPath), slug);
}

function resolveRecordPath(forkPath: string, slug: string, name: string): string {
  return path.resolve(resolveSlugDir(forkPath, slug), `${sanitizeName(name)}.json`);
}

function atomicWriteJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

export function saveBindings(
  forkPath: string,
  slug: string,
  name: string,
  bindings: Record<string, unknown>,
  options: { manifestFetchedAt?: string; note?: string } = {},
): SavedBindingsRecord {
  const record: SavedBindingsRecord = {
    version: 1,
    slug,
    name: sanitizeName(name),
    schemaVersion: API_CONTRACT_VERSION,
    manifestFetchedAt: options.manifestFetchedAt,
    savedAt: new Date().toISOString(),
    bindings,
    note: options.note,
  };
  atomicWriteJson(resolveRecordPath(forkPath, slug, name), record);
  return record;
}

export function loadBindings(
  forkPath: string,
  slug: string,
  name: string,
): SavedBindingsRecord | null {
  const p = resolveRecordPath(forkPath, slug, name);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as SavedBindingsRecord;
    if (!parsed || parsed.version !== 1 || parsed.slug !== slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function listBindings(forkPath: string, slug?: string): SavedBindingsRecord[] {
  const root = resolveInForkBindingsDir(forkPath);
  if (!fs.existsSync(root)) return [];
  const out: SavedBindingsRecord[] = [];
  const slugs = slug ? [slug] : fs.readdirSync(root).filter((d) => {
    try { return fs.statSync(path.resolve(root, d)).isDirectory(); } catch { return false; }
  });
  for (const s of slugs) {
    const dir = resolveSlugDir(forkPath, s);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const name = file.replace(/\.json$/, "");
      const rec = loadBindings(forkPath, s, name);
      if (rec) out.push(rec);
    }
  }
  return out.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

export function deleteBindings(
  forkPath: string,
  slug: string,
  name: string,
): boolean {
  const p = resolveRecordPath(forkPath, slug, name);
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p);
  return true;
}

// ---------------------------------------------------------------------------
// Drift preview — saved record vs current schema
// ---------------------------------------------------------------------------

export interface SavedBindingsDrift {
  missingKeys: string[];
  extraKeys: string[];
  schemaVersionChanged: boolean;
}

export function compareRecordToSchema(
  record: SavedBindingsRecord,
  schema: NodeInputSchema,
  currentManifest?: CapabilityManifest,
): SavedBindingsDrift {
  const schemaKeys = new Set(schema.fields.map((f) => f.key));
  const recordKeys = new Set(Object.keys(record.bindings));
  const missingKeys: string[] = [];
  const extraKeys: string[] = [];
  for (const field of schema.fields) {
    if (field.required && !recordKeys.has(field.key)) missingKeys.push(field.key);
  }
  for (const key of recordKeys) {
    if (!schemaKeys.has(key)) extraKeys.push(key);
  }
  const schemaVersionChanged = record.schemaVersion !== API_CONTRACT_VERSION ||
    (currentManifest !== undefined &&
      record.manifestFetchedAt !== undefined &&
      currentManifest.provenance?.recordedAt !== undefined &&
      record.manifestFetchedAt !== currentManifest.provenance.recordedAt);
  return { missingKeys, extraKeys, schemaVersionChanged };
}
