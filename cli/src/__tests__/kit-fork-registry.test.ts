/**
 * Kit Fork Registry — Unit Tests
 *
 * Covers: registration, retrieval, list, filter, update, and deregistration
 * of KitForkRegistration objects stored in the file-backed registry.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  registerKitFork,
  loadKitForkRegistration,
  listKitForkRegistrations,
  updateKitForkRegistration,
  deregisterKitFork,
  resolveKitForksRoot,
} from "../kits/fork-registry.js";

const ORIGINAL_ENV = { ...process.env };

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeForkDir(): string {
  const d = makeTempDir("kit-fork-dir-");
  fs.writeFileSync(path.join(d, "kit.json"), JSON.stringify({ schemaVersion: 2, kit: { id: "creative-strategist-v1" } }));
  return d;
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.GROWTHUB_KIT_FORKS_HOME = makeTempDir("growthub-kit-forks-");
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("registerKitFork", () => {
  it("creates a fork.json and returns the registration", () => {
    const forkDir = makeForkDir();
    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "1.0.0",
      label: "My Test Fork",
    });

    expect(reg.forkId).toBeTruthy();
    expect(reg.forkId).toContain("creative-strategist-v1");
    expect(reg.kitId).toBe("creative-strategist-v1");
    expect(reg.baseVersion).toBe("1.0.0");
    expect(reg.forkPath).toBe(forkDir);
    expect(reg.label).toBe("My Test Fork");
    expect(reg.registeredAt).toBeTruthy();
    expect(typeof new Date(reg.registeredAt).getTime()).toBe("number");

    // canonical fork.json must exist INSIDE the fork
    const inForkJson = path.resolve(forkDir, ".growthub-fork", "fork.json");
    expect(fs.existsSync(inForkJson)).toBe(true);

    const fromDisk = JSON.parse(fs.readFileSync(inForkJson, "utf8")) as typeof reg;
    expect(fromDisk.forkId).toBe(reg.forkId);

    // discovery index must list it
    const indexPath = path.resolve(resolveKitForksRoot(), "index.json");
    expect(fs.existsSync(indexPath)).toBe(true);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      entries: Array<{ forkId: string; kitId: string; forkPath: string }>;
    };
    expect(index.entries.some((e) => e.forkId === reg.forkId)).toBe(true);
  });

  it("throws when forkPath does not exist", () => {
    expect(() =>
      registerKitFork({
        forkPath: "/nonexistent/path/abc123",
        kitId: "creative-strategist-v1",
        baseVersion: "1.0.0",
      }),
    ).toThrow(/does not exist/);
  });

  it("stores customSkills array", () => {
    const forkDir = makeForkDir();
    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "1.0.0",
      customSkills: ["custom-skills/my-prompt.md", "custom-skills/another.md"],
    });
    expect(reg.customSkills).toEqual(["custom-skills/my-prompt.md", "custom-skills/another.md"]);
  });

  it("defaults customSkills to empty array when not provided", () => {
    const forkDir = makeForkDir();
    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "1.0.0",
    });
    expect(reg.customSkills).toEqual([]);
  });
});

describe("loadKitForkRegistration", () => {
  it("returns the registration that was registered", () => {
    const forkDir = makeForkDir();
    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "1.0.0",
    });

    const loaded = loadKitForkRegistration("creative-strategist-v1", reg.forkId);
    expect(loaded).not.toBeNull();
    expect(loaded!.forkId).toBe(reg.forkId);
    expect(loaded!.forkPath).toBe(forkDir);
  });

  it("returns null for a non-existent fork", () => {
    const result = loadKitForkRegistration("creative-strategist-v1", "nonexistent-fork-123");
    expect(result).toBeNull();
  });
});

describe("listKitForkRegistrations", () => {
  it("returns empty array when no forks registered", () => {
    expect(listKitForkRegistrations()).toEqual([]);
  });

  it("lists all registered forks across kits", () => {
    const d1 = makeForkDir();
    const d2 = makeForkDir();
    const r1 = registerKitFork({ forkPath: d1, kitId: "creative-strategist-v1", baseVersion: "1.0.0" });
    const r2 = registerKitFork({ forkPath: d2, kitId: "creative-strategist-v1", baseVersion: "1.1.0" });

    const all = listKitForkRegistrations();
    const ids = all.map((r) => r.forkId);
    expect(ids).toContain(r1.forkId);
    expect(ids).toContain(r2.forkId);
  });

  it("filters by kitId", () => {
    const d1 = makeForkDir();
    const r1 = registerKitFork({ forkPath: d1, kitId: "creative-strategist-v1", baseVersion: "1.0.0" });

    const filtered = listKitForkRegistrations("creative-strategist-v1");
    expect(filtered.some((r) => r.forkId === r1.forkId)).toBe(true);

    const empty = listKitForkRegistrations("nonexistent-kit");
    expect(empty).toHaveLength(0);
  });

  it("returns registrations sorted by registeredAt when timestamps differ", () => {
    const d1 = makeForkDir();
    const d2 = makeForkDir();
    const r1 = registerKitFork({ forkPath: d1, kitId: "creative-strategist-v1", baseVersion: "1.0.0" });
    // Backdate r1 by rewriting its in-fork state file so sort order is deterministic
    const r1Path = path.resolve(d1, ".growthub-fork", "fork.json");
    const r1Data = JSON.parse(fs.readFileSync(r1Path, "utf8")) as typeof r1;
    r1Data.registeredAt = "2020-01-01T00:00:00.000Z";
    fs.writeFileSync(r1Path, JSON.stringify(r1Data, null, 2));

    const r2 = registerKitFork({ forkPath: d2, kitId: "creative-strategist-v1", baseVersion: "1.0.0" });

    const all = listKitForkRegistrations();
    const idx1 = all.findIndex((r) => r.forkId === r1.forkId);
    const idx2 = all.findIndex((r) => r.forkId === r2.forkId);
    expect(idx1).toBeLessThan(idx2);
  });
});

describe("updateKitForkRegistration", () => {
  it("persists updated fields to disk", () => {
    const forkDir = makeForkDir();
    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "1.0.0",
    });

    const syncedAt = new Date().toISOString();
    updateKitForkRegistration({ ...reg, baseVersion: "1.2.0", lastSyncedAt: syncedAt });

    const loaded = loadKitForkRegistration("creative-strategist-v1", reg.forkId);
    expect(loaded!.baseVersion).toBe("1.2.0");
    expect(loaded!.lastSyncedAt).toBe(syncedAt);
  });
});

describe("deregisterKitFork", () => {
  it("removes the fork registration from disk", () => {
    const forkDir = makeForkDir();
    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "1.0.0",
    });

    const ok = deregisterKitFork(reg.kitId, reg.forkId);
    expect(ok).toBe(true);

    const loaded = loadKitForkRegistration("creative-strategist-v1", reg.forkId);
    expect(loaded).toBeNull();
  });

  it("returns false for a fork that does not exist", () => {
    const result = deregisterKitFork("creative-strategist-v1", "nonexistent-fork");
    expect(result).toBe(false);
  });

  it("removes the fork from listKitForkRegistrations after deregister", () => {
    const forkDir = makeForkDir();
    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "1.0.0",
    });

    expect(listKitForkRegistrations().some((r) => r.forkId === reg.forkId)).toBe(true);
    deregisterKitFork(reg.kitId, reg.forkId);
    expect(listKitForkRegistrations().some((r) => r.forkId === reg.forkId)).toBe(false);
  });
});
