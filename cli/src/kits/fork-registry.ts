/**
 * Kit Fork Registry
 *
 * File-backed persistence for KitForkRegistration objects.
 * Storage layout:
 *   PAPERCLIP_HOME/kit-forks/<kit-id>/<fork-id>/fork.json
 *
 * Intentionally flat JSON files — human-readable, survives CLI upgrades,
 * zero schema-migration overhead.
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../config/home.js";
import type { KitForkRegistration, RegisterKitForkOptions } from "./fork-types.js";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function resolveKitForksRoot(): string {
  return path.resolve(resolvePaperclipHomeDir(), "kit-forks");
}

function resolveForkDir(kitId: string, forkId: string): string {
  return path.resolve(resolveKitForksRoot(), kitId, forkId);
}

function resolveForkJsonPath(kitId: string, forkId: string): string {
  return path.resolve(resolveForkDir(kitId, forkId), "fork.json");
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
// Low-level read / write
// ---------------------------------------------------------------------------

function readForkJson(jsonPath: string): KitForkRegistration | null {
  if (!fs.existsSync(jsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as KitForkRegistration;
  } catch {
    return null;
  }
}

function writeForkJson(reg: KitForkRegistration): void {
  const dir = resolveForkDir(reg.kitId, reg.forkId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    resolveForkJsonPath(reg.kitId, reg.forkId),
    JSON.stringify(reg, null, 2) + "\n",
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a new fork directory.
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
  return reg;
}

/** Persist an updated registration (e.g. after a successful sync). */
export function updateKitForkRegistration(reg: KitForkRegistration): void {
  writeForkJson(reg);
}

/** Load a specific fork by kitId + forkId.  Returns null if not found. */
export function loadKitForkRegistration(kitId: string, forkId: string): KitForkRegistration | null {
  return readForkJson(resolveForkJsonPath(kitId, forkId));
}

/**
 * List all registered forks.
 * Pass filterKitId to restrict results to a single kit.
 */
export function listKitForkRegistrations(filterKitId?: string): KitForkRegistration[] {
  const root = resolveKitForksRoot();
  if (!fs.existsSync(root)) return [];

  const kitDirs = filterKitId
    ? [filterKitId]
    : fs.readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

  const results: KitForkRegistration[] = [];

  for (const kitId of kitDirs) {
    const kitDir = path.resolve(root, kitId);
    if (!fs.existsSync(kitDir)) continue;
    for (const entry of fs.readdirSync(kitDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const reg = readForkJson(resolveForkJsonPath(kitId, entry.name));
      if (reg) results.push(reg);
    }
  }

  return results.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
}

/**
 * Remove a fork registration directory from disk.
 * Does NOT touch the user's fork directory itself.
 * Returns true if the registration was found and removed.
 */
export function deregisterKitFork(kitId: string, forkId: string): boolean {
  const dir = resolveForkDir(kitId, forkId);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
