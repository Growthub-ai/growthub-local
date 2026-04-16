/**
 * Kit Fork Registry
 *
 * Canonical fork state lives INSIDE the fork itself at:
 *   <forkPath>/.growthub-fork/fork.json
 *
 * The fork directory is therefore self-describing — move the fork, its
 * kernel-packet-style registration moves with it. No Paperclip harness
 * coupling, no external home directory required for correctness.
 *
 * A thin CLI-owned discovery index at:
 *   GROWTHUB_KIT_FORKS_HOME/index.json   (default: ~/.growthub/kit-forks/index.json)
 *
 * lets `list` / `status` commands enumerate registered forks without scanning
 * the filesystem. The index is rebuildable from the in-fork files and is
 * authoritative only for discovery — never for canonical registration fields.
 */

import fs from "node:fs";
import path from "node:path";
import {
  resolveKitForksHomeDir,
  resolveKitForksIndexPath,
  resolveInForkStateDir,
  resolveInForkRegistrationPath,
} from "../config/kit-forks-home.js";
import type { KitForkRegistration, RegisterKitForkOptions } from "./fork-types.js";

// ---------------------------------------------------------------------------
// Discovery index
// ---------------------------------------------------------------------------

interface KitForkIndexEntry {
  forkId: string;
  kitId: string;
  forkPath: string;
  registeredAt: string;
}

interface KitForkIndex {
  version: 1;
  entries: KitForkIndexEntry[];
}

function readIndex(): KitForkIndex {
  const p = resolveKitForksIndexPath();
  if (!fs.existsSync(p)) return { version: 1, entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as KitForkIndex;
    if (!parsed || !Array.isArray(parsed.entries)) return { version: 1, entries: [] };
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeIndex(index: KitForkIndex): void {
  const p = resolveKitForksIndexPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(index, null, 2) + "\n", "utf8");
}

function upsertIndexEntry(entry: KitForkIndexEntry): void {
  const index = readIndex();
  const idx = index.entries.findIndex(
    (e) => e.forkId === entry.forkId && e.kitId === entry.kitId,
  );
  if (idx >= 0) index.entries[idx] = entry;
  else index.entries.push(entry);
  writeIndex(index);
}

function removeIndexEntry(kitId: string, forkId: string): void {
  const index = readIndex();
  const next = index.entries.filter((e) => !(e.kitId === kitId && e.forkId === forkId));
  if (next.length !== index.entries.length) writeIndex({ ...index, entries: next });
}

// ---------------------------------------------------------------------------
// Public path helpers (preserved names for stable external API)
// ---------------------------------------------------------------------------

/**
 * Root CLI-owned directory for kit-forks operational state.
 * Kept for test/gate compatibility; does NOT hold canonical registration
 * content (that lives inside each fork).
 */
export function resolveKitForksRoot(): string {
  return resolveKitForksHomeDir();
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function sanitizeForkId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 56);
}

function generateForkId(forkPath: string, kitId: string): string {
  const dirName = path.basename(forkPath);
  const base = sanitizeForkId(`${kitId}-${dirName}`);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Low-level in-fork read / write
// ---------------------------------------------------------------------------

function readForkJson(forkPath: string): KitForkRegistration | null {
  const p = resolveInForkRegistrationPath(forkPath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as KitForkRegistration;
  } catch {
    return null;
  }
}

function writeForkJson(reg: KitForkRegistration): void {
  const stateDir = resolveInForkStateDir(reg.forkPath);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    resolveInForkRegistrationPath(reg.forkPath),
    JSON.stringify(reg, null, 2) + "\n",
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a new fork directory.
 * Writes <forkPath>/.growthub-fork/fork.json and adds an index entry.
 * Throws if forkPath does not exist on disk.
 */
export function registerKitFork(opts: RegisterKitForkOptions): KitForkRegistration {
  const resolvedPath = path.resolve(opts.forkPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Fork path does not exist: ${resolvedPath}`);
  }

  const forkId = generateForkId(resolvedPath, opts.kitId);
  const reg: KitForkRegistration = {
    forkId,
    kitId: opts.kitId,
    baseVersion: opts.baseVersion,
    forkPath: resolvedPath,
    registeredAt: new Date().toISOString(),
    label: opts.label,
    customSkills: opts.customSkills ?? [],
  };

  writeForkJson(reg);
  upsertIndexEntry({
    forkId: reg.forkId,
    kitId: reg.kitId,
    forkPath: reg.forkPath,
    registeredAt: reg.registeredAt,
  });
  return reg;
}

/** Persist an updated registration (e.g. after a successful sync). */
export function updateKitForkRegistration(reg: KitForkRegistration): void {
  writeForkJson(reg);
  upsertIndexEntry({
    forkId: reg.forkId,
    kitId: reg.kitId,
    forkPath: reg.forkPath,
    registeredAt: reg.registeredAt,
  });
}

/** Load a specific fork by kitId + forkId. Resolves via the discovery index. */
export function loadKitForkRegistration(kitId: string, forkId: string): KitForkRegistration | null {
  const entry = readIndex().entries.find((e) => e.kitId === kitId && e.forkId === forkId);
  if (!entry) return null;
  if (!fs.existsSync(entry.forkPath)) return null;
  return readForkJson(entry.forkPath);
}

/**
 * List all registered forks.
 * Pass filterKitId to restrict results to a single kit.
 * Stale index entries (forkPath no longer exists) are silently skipped.
 */
export function listKitForkRegistrations(filterKitId?: string): KitForkRegistration[] {
  const index = readIndex();
  const results: KitForkRegistration[] = [];

  for (const entry of index.entries) {
    if (filterKitId && entry.kitId !== filterKitId) continue;
    if (!fs.existsSync(entry.forkPath)) continue;
    const reg = readForkJson(entry.forkPath);
    if (reg) results.push(reg);
  }

  return results.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
}

/**
 * Remove a fork registration.  Deletes the in-fork .growthub-fork/ state
 * directory and drops the index entry.  Does NOT touch any of the user's
 * content files outside .growthub-fork/.
 * Returns true if the registration was found and removed.
 */
export function deregisterKitFork(kitId: string, forkId: string): boolean {
  const entry = readIndex().entries.find((e) => e.kitId === kitId && e.forkId === forkId);
  if (!entry) return false;

  if (fs.existsSync(entry.forkPath)) {
    const stateDir = resolveInForkStateDir(entry.forkPath);
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  removeIndexEntry(kitId, forkId);
  return true;
}

/**
 * Look up the canonical forkPath for a (kitId, forkId) pair via the index.
 * Returns null when no entry exists. Used by the job agent to route job state
 * into the fork's own `.growthub-fork/jobs/` directory when possible.
 */
export function lookupKitForkPath(kitId: string, forkId: string): string | null {
  const entry = readIndex().entries.find((e) => e.kitId === kitId && e.forkId === forkId);
  if (!entry) return null;
  if (!fs.existsSync(entry.forkPath)) return null;
  return entry.forkPath;
}
