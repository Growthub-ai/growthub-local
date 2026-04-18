/**
 * Source Import Agent — skills-source.ts tests.
 *
 * Covers:
 *   - parseSkillRef for canonical skills.sh ids + URLs
 *   - browseSkills against live-page-style leaderboard HTML
 *   - probeSkillsSource against a live detail-page-style HTML response
 *   - fetchSkillPayload by cloning a local git repo and narrowing to one skill
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
  it("parses owner/repo/skill", () => {
    expect(parseSkillRef("anthropics/skills/frontend-design")).toEqual({
      skillId: "anthropics/skills/frontend-design",
    });
  });

  it("parses owner/repo/skill@version", () => {
    expect(parseSkillRef("anthropics/skills/frontend-design@1.2.3")).toEqual({
      skillId: "anthropics/skills/frontend-design",
      version: "1.2.3",
    });
  });

  it("strips full URLs", () => {
    expect(parseSkillRef("https://skills.sh/anthropics/skills/frontend-design@2.0.0")).toEqual({
      skillId: "anthropics/skills/frontend-design",
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
      skillRef: "anthropics/skills/frontend-design",
      version: "3.0.0",
      skipProbe: true,
    });
    expect(probe.kind).toBe("skills-skill");
    expect(probe.skillId).toBe("anthropics/skills/frontend-design");
    expect(probe.version).toBe("3.0.0");
    expect(probe.warnings.some((w) => w.includes("skip-probe"))).toBe(true);
  });
});

describe("browseSkills (stubbed fetch)", () => {
  it("parses leaderboard HTML and filters by query", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      expect(String(url)).toContain("https://fixture.skills.test/");
      return new Response(
        `
          <a class="group grid" href="/anthropics/skills/frontend-design">
            <span class="text-sm lg:text-base text-(--ds-gray-600) font-mono">3</span>
            <h3 class="font-semibold text-foreground truncate whitespace-nowrap">frontend-design</h3>
            <p class="text-xs lg:text-sm text-(--ds-gray-600) font-mono mt-0.5 lg:mt-0 truncate">anthropics/skills</p>
            <span class="font-mono text-sm text-foreground">307.3K</span>
          </a>
          <a class="group grid" href="/coreyhaines31/marketingskills/copywriting">
            <span class="text-sm lg:text-base text-(--ds-gray-600) font-mono">71</span>
            <h3 class="font-semibold text-foreground truncate whitespace-nowrap">copywriting</h3>
            <p class="text-xs lg:text-sm text-(--ds-gray-600) font-mono mt-0.5 lg:mt-0 truncate">coreyhaines31/marketingskills</p>
            <span class="font-mono text-sm text-foreground">70.9K</span>
          </a>
        `,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }) as typeof fetch;

    const result = await browseSkills({ q: "frontend", page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].skillId).toBe("anthropics/skills/frontend-design");
    expect(result.entries[0].repository).toBe("anthropics/skills");
    expect(result.entries[0].weeklyInstalls).toBe("307.3K");
  });

  it("throws when the upstream returns non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;
    await expect(browseSkills({ q: "x" })).rejects.toThrow(/500/);
  });
});

describe("probeSkillsSource (detail page parsing)", () => {
  it("extracts detail metadata from the live skill page shape", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        `
          <h1>frontend-design</h1>
          <div>Installation</div>
          <code>npx skills add https://github.com/anthropics/skills --skill frontend-design</code>
          <div>Summary</div>
          <p><strong>Distinctive, production-grade frontend interfaces.</strong></p>
          <div><span>Weekly Installs</span></div><div>307.3K</div>
          <a href="https://github.com/anthropics/skills" title="anthropics/skills">anthropics/skills</a>
          <div><span>GitHub Stars</span></div><div>119.0K</div>
          <div><span>First Seen</span></div><div>Jan 19, 2026</div>
          <div>Security Audits</div>
          <a href="/anthropics/skills/frontend-design/security/agent-trust-hub">
            <span class="text-sm font-medium text-foreground truncate">Gen Agent Trust Hub</span>
            <span class="text-xs font-mono uppercase px-2 py-1 rounded bg-green-500/10 text-green-500">Pass</span>
          </a>
          <div>Installed on</div>
        `,
        { status: 200, headers: { "Content-Type": "text/html" } },
      )) as typeof fetch;

    const probe = await probeSkillsSource({
      kind: "skills-skill",
      skillRef: "anthropics/skills/frontend-design",
    });

    expect(probe.skillId).toBe("anthropics/skills/frontend-design");
    expect(probe.repository).toBe("anthropics/skills");
    expect(probe.skillSlug).toBe("frontend-design");
    expect(probe.weeklyInstalls).toBe("307.3K");
    expect(probe.githubStars).toBe("119.0K");
    expect(probe.audits?.[0]?.status).toBe("pass");
  });
});

describe("fetchSkillPayload (git-backed skill extraction)", () => {
  it("clones the backing repository and copies only the selected skill files non-executable", async () => {
    const repoRoot = track(makeTempDir("skill-repo-"));
    fs.mkdirSync(path.join(repoRoot, "skills", "demo-skill"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "skills", "demo-skill", "SKILL.md"), "# Demo skill\n");
    fs.writeFileSync(path.join(repoRoot, "skills", "demo-skill", "notes.txt"), "notes\n");
    fs.writeFileSync(path.join(repoRoot, "README.md"), "root file\n");

    const git = (args: string[]) =>
      spawnSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
      });

    expect(git(["init"]).status).toBe(0);
    expect(git(["add", "."]).status).toBe(0);
    expect(
      spawnSync(
        "git",
        ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "seed"],
        { cwd: repoRoot, encoding: "utf8" },
      ).status,
    ).toBe(0);

    const probe: SkillsSkillAccessProbe = {
      kind: "skills-skill",
      mode: "public",
      skillRef: "local/demo-skill",
      skillId: "local/repo/demo-skill",
      version: "latest",
      title: "demo-skill",
      author: "local/repo",
      htmlUrl: "https://skills.sh/local/repo/demo-skill",
      repository: "local/repo",
      repoUrl: repoRoot,
      skillSlug: "demo-skill",
      files: [],
      warnings: [],
    };

    const dest = path.join(track(makeTempDir("fetch-skill-")), "payload");
    const res = await fetchSkillPayload({ probe, destination: dest });
    expect(res.fileCount).toBe(2);
    expect(fs.existsSync(path.join(dest, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "notes.txt"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "README.md"))).toBe(false);
    const mode = fs.statSync(path.join(dest, "SKILL.md")).mode & 0o777;
    expect(mode & 0o111).toBe(0);
  });
});
