/**
 * Kit Fork Policy — Unit Tests
 *
 * Covers:
 *   - default policy shape
 *   - read/write round-trip against <forkPath>/.growthub-fork/policy.json
 *   - updateKitForkPolicy patch semantics
 *   - path evaluation helpers (isUntouchable, requiresConfirmation)
 *   - autoApprove scope helpers
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readKitForkPolicy,
  writeKitForkPolicy,
  updateKitForkPolicy,
  makeDefaultKitForkPolicy,
  isUntouchable,
  requiresConfirmation,
  canAutoApplyAddition,
  canAutoApplyModification,
  canAutoApplyDepAddition,
  canAutoApplyDepUpgrade,
} from "../kits/fork-policy.js";

const ORIGINAL_ENV = { ...process.env };

function makeForkDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fork-policy-"));
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("makeDefaultKitForkPolicy", () => {
  it("is a safe conservative baseline", () => {
    const p = makeDefaultKitForkPolicy();
    expect(p.version).toBe(1);
    expect(p.autoApprove).toBe("additive");
    expect(p.autoApproveDepUpdates).toBe("additive");
    expect(p.remoteSyncMode).toBe("off");
    expect(p.interactiveConflicts).toBe(true);
    expect(p.untouchablePaths).toEqual([]);
    expect(p.confirmBeforeChange).toContain("package.json");
    expect(p.confirmBeforeChange).toContain("kit.json");
  });
});

describe("readKitForkPolicy", () => {
  it("returns defaults when no policy.json exists", () => {
    const dir = makeForkDir();
    const p = readKitForkPolicy(dir);
    expect(p.autoApprove).toBe("additive");
  });

  it("returns defaults on malformed JSON", () => {
    const dir = makeForkDir();
    fs.mkdirSync(path.resolve(dir, ".growthub-fork"), { recursive: true });
    fs.writeFileSync(path.resolve(dir, ".growthub-fork", "policy.json"), "{not json}");
    const p = readKitForkPolicy(dir);
    expect(p.autoApprove).toBe("additive");
  });
});

describe("writeKitForkPolicy + round-trip", () => {
  it("persists at <forkPath>/.growthub-fork/policy.json", () => {
    const dir = makeForkDir();
    writeKitForkPolicy(dir, {
      ...makeDefaultKitForkPolicy(),
      autoApprove: "all",
      untouchablePaths: ["custom/mine.md"],
    });
    const readBack = readKitForkPolicy(dir);
    expect(readBack.autoApprove).toBe("all");
    expect(readBack.untouchablePaths).toEqual(["custom/mine.md"]);
    const onDisk = path.resolve(dir, ".growthub-fork", "policy.json");
    expect(fs.existsSync(onDisk)).toBe(true);
  });
});

describe("updateKitForkPolicy", () => {
  it("patches specific fields and preserves the rest", () => {
    const dir = makeForkDir();
    writeKitForkPolicy(dir, { ...makeDefaultKitForkPolicy(), remoteSyncMode: "branch" });
    const next = updateKitForkPolicy(dir, { remoteSyncMode: "pr" });
    expect(next.remoteSyncMode).toBe("pr");
    expect(next.autoApprove).toBe("additive"); // unchanged
  });
});

describe("path evaluation helpers", () => {
  const p = {
    ...makeDefaultKitForkPolicy(),
    untouchablePaths: ["custom", "skills/personal.md"],
    confirmBeforeChange: ["package.json", "docs"],
  };

  it("isUntouchable matches exact paths and prefixes", () => {
    expect(isUntouchable(p, "custom")).toBe(true);
    expect(isUntouchable(p, "custom/foo.md")).toBe(true);
    expect(isUntouchable(p, "skills/personal.md")).toBe(true);
    expect(isUntouchable(p, "skills/other.md")).toBe(false);
    expect(isUntouchable(p, "src/app.ts")).toBe(false);
  });

  it("requiresConfirmation matches exact paths and prefixes", () => {
    expect(requiresConfirmation(p, "package.json")).toBe(true);
    expect(requiresConfirmation(p, "docs/README.md")).toBe(true);
    expect(requiresConfirmation(p, "src/index.ts")).toBe(false);
  });

  it("normalises leading/trailing slashes", () => {
    expect(isUntouchable({ ...p, untouchablePaths: ["/custom/"] }, "custom/foo.md")).toBe(true);
  });
});

describe("autoApprove scope helpers", () => {
  it("additive auto-approves additions but not modifications", () => {
    const p = { ...makeDefaultKitForkPolicy(), autoApprove: "additive" as const };
    expect(canAutoApplyAddition(p)).toBe(true);
    expect(canAutoApplyModification(p)).toBe(false);
  });

  it("all auto-approves everything", () => {
    const p = { ...makeDefaultKitForkPolicy(), autoApprove: "all" as const };
    expect(canAutoApplyAddition(p)).toBe(true);
    expect(canAutoApplyModification(p)).toBe(true);
  });

  it("none blocks every category", () => {
    const p = { ...makeDefaultKitForkPolicy(), autoApprove: "none" as const };
    expect(canAutoApplyAddition(p)).toBe(false);
    expect(canAutoApplyModification(p)).toBe(false);
  });

  it("dep-specific helpers are orthogonal to autoApprove", () => {
    const p = {
      ...makeDefaultKitForkPolicy(),
      autoApprove: "none" as const,
      autoApproveDepUpdates: "additive" as const,
    };
    expect(canAutoApplyDepAddition(p)).toBe(true);
    expect(canAutoApplyDepUpgrade(p)).toBe(false);
  });

  it("dep 'all' unlocks upgrades", () => {
    const p = {
      ...makeDefaultKitForkPolicy(),
      autoApproveDepUpdates: "all" as const,
    };
    expect(canAutoApplyDepUpgrade(p)).toBe(true);
  });
});
