/**
 * Source Import Agent — skills-source.ts tests.
 *
 * Covers: parseSkillRef (all input forms + validation), the skip-probe
 * fast-path for probeSkillsSource, and the browse/fetch API shape
 * normalisation via a stubbed global fetch.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  parseSkillRef,
  probeSkillsSource,
  browseSkills,
  fetchSkillPayload,
} from "../starter/source-import/skills-source.js";
import type { SkillsSkillAccessProbe } from "../starter/source-import/types.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const cleanup: string[] = [];

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.SKILLS_SH_BASE = "https://fixture.skills.test";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  while (cleanup.length) {
    const d = cleanup.pop()!;
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function track(dir: string): string {
  cleanup.push(dir);
  return dir;
}

describe("parseSkillRef", () => {
  it("parses author/skill", () => {
    expect(parseSkillRef("acme/demo")).toEqual({ skillId: "acme/demo" });
  });

  it("parses author/skill@version", () => {
    expect(parseSkillRef("acme/demo@1.2.3")).toEqual({
      skillId: "acme/demo",
      version: "1.2.3",
    });
  });

  it("strips full URLs", () => {
    expect(parseSkillRef("https://skills.sh/acme/demo@2.0.0")).toEqual({
      skillId: "acme/demo",
      version: "2.0.0",
    });
  });

  it("rejects empty input", () => {
    expect(() => parseSkillRef("")).toThrow();
  });

  it("rejects missing slash", () => {
    expect(() => parseSkillRef("acme")).toThrow();
  });

  it("rejects bad characters", () => {
    expect(() => parseSkillRef("acme with space/demo")).toThrow();
  });
});

describe("probeSkillsSource (skipProbe)", () => {
  it("returns a probe without hitting the network when skipProbe=true", async () => {
    const probe = await probeSkillsSource({
      kind: "skills-skill",
      skillRef: "acme/demo",
      version: "3.0.0",
      skipProbe: true,
    });
    expect(probe.kind).toBe("skills-skill");
    expect(probe.skillId).toBe("acme/demo");
    expect(probe.version).toBe("3.0.0");
    expect(probe.warnings.some((w) => w.includes("skip-probe"))).toBe(true);
  });
});

describe("browseSkills (stubbed fetch)", () => {
  it("normalises the 'results' response shape", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      expect(String(url)).toContain("/api/skills?");
      return new Response(
        JSON.stringify({
          total: 2,
          results: [
            { id: "alice/one", name: "One", authorHandle: "alice" },
            { skillId: "bob/two", title: "Two", author: "bob", version: "1.0" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await browseSkills({ q: "demo", page: 1, pageSize: 10 });
    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].skillId).toBe("alice/one");
    expect(result.entries[1].version).toBe("1.0");
  });

  it("throws when the upstream returns non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;
    await expect(browseSkills({ q: "x" })).rejects.toThrow(/500/);
  });
});

describe("fetchSkillPayload (stubbed fetch)", () => {
  it("writes manifest-advertised files non-executable (mode 0o644)", async () => {
    const probe: SkillsSkillAccessProbe = {
      kind: "skills-skill",
      mode: "public",
      skillRef: "acme/demo",
      skillId: "acme/demo",
      version: "1.0.0",
      title: "Demo",
      author: "acme",
      htmlUrl: "https://skills.sh/acme/demo",
      files: ["SKILL.md", "prompt.md"],
      warnings: [],
    };
    globalThis.fetch = vi.fn(async (url) => {
      const s = String(url);
      if (s.includes("/files/SKILL.md")) {
        return new Response("# skill body", { status: 200 });
      }
      if (s.includes("/files/prompt.md")) {
        return new Response("system prompt", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const dest = path.join(track(makeTempDir("fetch-skill-")), "payload");
    const res = await fetchSkillPayload({ probe, destination: dest });
    expect(res.fileCount).toBe(2);
    expect(fs.existsSync(path.join(dest, "SKILL.md"))).toBe(true);
    const mode = fs.statSync(path.join(dest, "SKILL.md")).mode & 0o777;
    // 0o644 exactly (no exec bit anywhere)
    expect(mode & 0o111).toBe(0);
  });

  it("refuses to overwrite an existing destination", async () => {
    const probe: SkillsSkillAccessProbe = {
      kind: "skills-skill",
      mode: "public",
      skillRef: "a/b",
      skillId: "a/b",
      version: "1",
      title: "b",
      author: "a",
      htmlUrl: "",
      files: ["SKILL.md"],
      warnings: [],
    };
    const dest = path.join(track(makeTempDir("fetch-exists-")), "pre-existing");
    fs.mkdirSync(dest, { recursive: true });
    await expect(
      fetchSkillPayload({ probe, destination: dest }),
    ).rejects.toThrow(/already exists/);
  });
});
