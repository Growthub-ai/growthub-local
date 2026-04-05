import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveGrowthubRepoRoot } from "../utils/repo-root.js";

describe("resolveGrowthubRepoRoot", () => {
  it("prefers GH_LOCAL_ROOT when set", () => {
    const expected = path.resolve("/tmp/gh-fake-root");
    process.env.GH_LOCAL_ROOT = expected;
    expect(resolveGrowthubRepoRoot()).toBe(expected);
    delete process.env.GH_LOCAL_ROOT;
  });

  it("falls back to a path when not in git (cwd)", () => {
    delete process.env.GH_LOCAL_ROOT;
    const r = resolveGrowthubRepoRoot();
    expect(typeof r).toBe("string");
    expect(r.length).toBeGreaterThan(0);
  });
});
