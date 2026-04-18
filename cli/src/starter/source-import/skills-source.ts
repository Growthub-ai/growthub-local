/**
 * Source Import Agent — skills.sh source adapter.
 *
 * The live skills.sh surface is HTML-first. This adapter therefore treats the
 * public leaderboard pages and per-skill detail pages as the canonical source
 * of truth for discovery and metadata, then resolves the selected skill back
 * to its backing repository for payload materialization.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gitAvailable } from "../../kits/fork-remote.js";
import type {
  SkillsAuditSummary,
  SkillsBrowseEntry,
  SkillsBrowseQuery,
  SkillsBrowseResult,
  SkillsBrowseScope,
  SkillsSkillAccessProbe,
  SkillsSkillSourceInput,
} from "./types.js";

const DEFAULT_BASE = "https://skills.sh";
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

function resolveBase(): string {
  const raw = process.env.SKILLS_SH_BASE?.trim();
  if (!raw) return DEFAULT_BASE;
  return raw.replace(/\/+$/, "");
}

function baseHeaders(accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"): Record<string, string> {
  return {
    "User-Agent": "growthub-cli",
    Accept: accept,
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ");
}

function cleanText(input: string): string {
  return decodeHtmlEntities(stripTags(input))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHtml(input: string): string {
  return input.replace(COMMENT_PATTERN, "");
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: baseHeaders() });
  if (!res.ok) {
    throw new Error(`skills.sh request failed: ${res.status} ${res.statusText}`);
  }
  return normalizeHtml(await res.text());
}

function scopePath(scope: SkillsBrowseScope): string {
  if (scope === "trending") return "/trending";
  if (scope === "hot") return "/hot";
  return "/";
}

function buildBrowseUrl(base: string, query: SkillsBrowseQuery): string {
  const url = new URL(scopePath(query.scope ?? "all"), `${base}/`);
  if (query.q?.trim()) {
    url.searchParams.set("q", query.q.trim());
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Identifier parsing
// ---------------------------------------------------------------------------

export interface ParsedSkillRef {
  /** Canonical skill id, typically "<owner>/<repo>/<skill>". */
  skillId: string;
  /** Optional version suffix parsed from "@version". */
  version?: string;
}

export function parseSkillRef(raw: string): ParsedSkillRef {
  let working = raw.trim();
  if (!working) throw new Error("Skill reference is empty.");

  const urlMatch = working.match(/^https?:\/\/[^/]+\/(.*)$/i);
  if (urlMatch) working = urlMatch[1];
  working = working.replace(/^\/+|\/+$/g, "");

  const atIndex = working.lastIndexOf("@");
  let version: string | undefined;
  if (atIndex > 0 && working.indexOf("/") < atIndex) {
    version = working.slice(atIndex + 1) || undefined;
    working = working.slice(0, atIndex);
  }

  const parts = working.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(
      `Invalid skill reference: '${raw}'. Use '<owner>/<repo>/<skill>', a full skills.sh URL, or '<owner>/<repo>/<skill>@version'.`,
    );
  }
  for (const part of parts) {
    if (!/^[A-Za-z0-9._-]+$/.test(part)) {
      throw new Error(`Invalid skill path segment: '${part}'.`);
    }
  }

  return { skillId: parts.join("/"), version };
}

// ---------------------------------------------------------------------------
// Browse + pagination
// ---------------------------------------------------------------------------

function parseLeaderboardRows(html: string, base: string): SkillsBrowseEntry[] {
  const rows: SkillsBrowseEntry[] = [];
  const anchorRegex = /<a[^>]+href="\/([^"]+\/[^"]+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(anchorRegex)) {
    const skillId = cleanText(match[1] ?? "");
    const block = match[2] ?? "";
    const rankMatch = block.match(/font-mono">(\d+)<\/span>/);
    const titleMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/);
    const repositoryMatch = block.match(/<p[^>]*font-mono[^>]*>([^<]+)<\/p>/);
    const installsMatch = block.match(/<span class="font-mono text-sm text-foreground">([^<]+)<\/span>/);
    if (!skillId || !titleMatch?.[1] || !repositoryMatch?.[1]) continue;
    const title = cleanText(titleMatch[1]);
    const repository = cleanText(repositoryMatch[1]);
    const skillSlug = skillId.split("/").at(-1) ?? title;
    rows.push({
      skillId,
      title,
      author: repository,
      repository,
      skillSlug,
      htmlUrl: `${base}/${skillId}`,
      rank: rankMatch ? Number(rankMatch[1]) : undefined,
      weeklyInstalls: installsMatch ? cleanText(installsMatch[1]) : undefined,
    });
  }
  return rows;
}

function matchesQuery(entry: SkillsBrowseEntry, rawQuery?: string): boolean {
  const query = rawQuery?.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    entry.title,
    entry.skillId,
    entry.author,
    entry.repository,
    entry.skillSlug,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

function sortByPopularity(entries: SkillsBrowseEntry[]): SkillsBrowseEntry[] {
  return [...entries].sort((left, right) => {
    const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.title.localeCompare(right.title);
  });
}

async function enrichBrowseEntries(entries: SkillsBrowseEntry[]): Promise<SkillsBrowseEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      try {
        const detail = await loadSkillDetail(entry.skillId);
        return {
          ...entry,
          description: detail.summary ?? entry.description,
          githubStars: detail.githubStars,
          firstSeen: detail.firstSeen,
        };
      } catch {
        return entry;
      }
    }),
  );
}

export async function browseSkills(
  query: SkillsBrowseQuery = {},
): Promise<SkillsBrowseResult> {
  const scope = query.scope ?? "all";
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(query.pageSize ?? 10)));
  const base = resolveBase();
  const html = await fetchHtml(buildBrowseUrl(base, query));
  const allRows = parseLeaderboardRows(html, base);
  const filtered = sortByPopularity(allRows.filter((entry) => matchesQuery(entry, query.q)));
  const offset = (page - 1) * pageSize;
  const entries = await enrichBrowseEntries(filtered.slice(offset, offset + pageSize));

  return {
    query: { q: query.q, page, pageSize, scope },
    total: filtered.length,
    page,
    pageSize,
    scope,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Metadata probe
// ---------------------------------------------------------------------------

interface SkillDetailMetadata {
  skillId: string;
  title: string;
  htmlUrl: string;
  repository?: string;
  repoUrl?: string;
  skillSlug?: string;
  installCommand?: string;
  summary?: string;
  weeklyInstalls?: string;
  githubStars?: string;
  firstSeen?: string;
  audits?: SkillsAuditSummary[];
}

function parseInstallCommand(html: string): {
  installCommand?: string;
  repoUrl?: string;
  repository?: string;
  skillSlug?: string;
} {
  const match = html.match(/npx skills add\s+([^\s<]+)\s+--skill\s+([A-Za-z0-9._:-]+)/);
  if (!match) return {};
  const repoUrl = cleanText(match[1] ?? "");
  const skillSlug = cleanText(match[2] ?? "");
  const repoMatch = repoUrl.match(/github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?$/i);
  return {
    installCommand: cleanText(match[0] ?? ""),
    repoUrl,
    repository: repoMatch?.[1],
    skillSlug,
  };
}

function parseSectionValue(html: string, label: string): string | undefined {
  if (label === "GitHub Stars") {
    const starMatch = html.match(/GitHub Stars<\/span><\/div><div[^>]*>[\s\S]*?<span>([^<]+)<\/span>/);
    return starMatch?.[1] ? cleanText(starMatch[1]) : undefined;
  }
  const regex = new RegExp(
    `${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/span><\\/div><div[^>]*>[\\s\\S]*?(?:<span>)?([^<]+)(?:<\\/span>)?[\\s\\S]*?<\\/div>`,
  );
  const match = html.match(regex);
  return match?.[1] ? cleanText(match[1]) : undefined;
}

function parseSummary(html: string): string | undefined {
  const summaryIdx = html.indexOf("Summary</div>");
  if (summaryIdx === -1) return undefined;
  const slice = html.slice(summaryIdx, summaryIdx + 4000);
  const match = slice.match(/<p>([\s\S]*?)<\/p>/);
  return match?.[1] ? cleanText(match[1]) : undefined;
}

function parseAudits(html: string, skillId: string, base: string): SkillsAuditSummary[] {
  const sectionIdx = html.indexOf("Security Audits");
  if (sectionIdx === -1) return [];
  const endIdx = html.indexOf("Installed on", sectionIdx);
  const section = html.slice(sectionIdx, endIdx === -1 ? sectionIdx + 4000 : endIdx);
  const audits: SkillsAuditSummary[] = [];
  const auditRegex = /href="([^"]+)"[\s\S]*?<span class="text-sm font-medium text-foreground truncate">([^<]+)<\/span>[\s\S]*?<span class="text-xs font-mono uppercase px-2 py-1 rounded [^"]*">([^<]+)<\/span>/g;
  for (const match of section.matchAll(auditRegex)) {
    const href = match[1]?.startsWith("/")
      ? `${base}${match[1]}`
      : cleanText(match[1] ?? "");
    const statusRaw = cleanText(match[3] ?? "").toLowerCase();
    audits.push({
      name: cleanText(match[2] ?? ""),
      href,
      status:
        statusRaw === "pass"
          ? "pass"
          : statusRaw === "warn"
            ? "warn"
            : statusRaw === "fail"
              ? "fail"
              : "unknown",
    });
  }
  return audits.filter((audit) => audit.href?.includes(skillId) ?? true);
}

async function loadSkillDetail(
  skillId: string,
): Promise<SkillDetailMetadata> {
  const base = resolveBase();
  const htmlUrl = `${base}/${skillId}`;
  const html = await fetchHtml(htmlUrl);
  const install = parseInstallCommand(html);
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);

  return {
    skillId,
    title: titleMatch?.[1] ? cleanText(titleMatch[1]) : skillId.split("/").at(-1) ?? skillId,
    htmlUrl,
    ...install,
    summary: parseSummary(html),
    weeklyInstalls: parseSectionValue(html, "Weekly Installs"),
    githubStars: parseSectionValue(html, "GitHub Stars"),
    firstSeen: parseSectionValue(html, "First Seen"),
    audits: parseAudits(html, skillId, base),
  };
}

export async function probeSkillsSource(
  input: SkillsSkillSourceInput,
): Promise<SkillsSkillAccessProbe> {
  const parsed = parseSkillRef(input.skillRef);
  const base = resolveBase();
  const version = input.version ?? parsed.version ?? "latest";

  if (input.skipProbe) {
    return {
      kind: "skills-skill",
      mode: "public",
      skillRef: input.skillRef,
      skillId: parsed.skillId,
      version,
      title: parsed.skillId.split("/").at(-1) ?? parsed.skillId,
      author: parsed.skillId.split("/").slice(0, 2).join("/") || "unknown",
      htmlUrl: `${base}/${parsed.skillId}`,
      files: [],
      warnings: ["--skip-probe set; metadata defaults used"],
    };
  }

  const detail = await loadSkillDetail(parsed.skillId);
  const warnings: string[] = [];
  if (!detail.repoUrl && !detail.repository) {
    warnings.push("skills.sh detail page did not expose a backing repository URL.");
  }

  return {
    kind: "skills-skill",
    mode: "public",
    skillRef: input.skillRef,
    skillId: detail.skillId,
    version,
    title: detail.title,
    author: detail.repository ?? detail.skillId.split("/").slice(0, 2).join("/"),
    description: detail.summary,
    htmlUrl: detail.htmlUrl,
    repository: detail.repository,
    repoUrl: detail.repoUrl,
    skillSlug: detail.skillSlug,
    installCommand: detail.installCommand,
    summary: detail.summary,
    weeklyInstalls: detail.weeklyInstalls,
    githubStars: detail.githubStars,
    firstSeen: detail.firstSeen,
    audits: detail.audits,
    files: [],
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Payload fetch
// ---------------------------------------------------------------------------

export interface FetchSkillPayloadInput {
  probe: SkillsSkillAccessProbe;
  destination: string;
}

export interface FetchSkillPayloadResult {
  destination: string;
  fileCount: number;
}

function assertInsidePayloadRoot(root: string, candidate: string): void {
  const abs = path.resolve(candidate);
  const rootAbs = path.resolve(root);
  if (!abs.startsWith(rootAbs + path.sep) && abs !== rootAbs) {
    throw new Error(`Refusing to write outside payload root: ${candidate}`);
  }
}

function runGit(args: string[], cwd: string): { ok: boolean; stderr: string } {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    ok: res.status === 0,
    stderr: res.stderr ?? "",
  };
}

function skillDirectoryMatches(dir: string, skillSlug: string): boolean {
  const skillFile = path.resolve(dir, "SKILL.md");
  if (!fs.existsSync(skillFile) || !fs.statSync(skillFile).isFile()) {
    return false;
  }

  if (path.basename(dir) === skillSlug) {
    return true;
  }

  const content = fs.readFileSync(skillFile, "utf8");
  const nameMatch = content.match(/(?:^|\n)name:\s*["']?([A-Za-z0-9._:-]+)["']?\s*(?:\n|$)/i);
  return nameMatch?.[1] === skillSlug;
}

function locateSkillDirectory(root: string, skillSlug: string): string | null {
  const preferred = [
    path.resolve(root, "skills", skillSlug),
    path.resolve(root, skillSlug),
  ];
  for (const candidate of preferred) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory() && skillDirectoryMatches(candidate, skillSlug)) {
      return candidate;
    }
  }

  const queue: string[] = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (skillDirectoryMatches(current, skillSlug)) {
      return current;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if ([".git", "node_modules", ".next", "dist", "build", "coverage"].includes(entry.name)) {
        continue;
      }
      queue.push(path.resolve(current, entry.name));
    }
  }
  return null;
}

function copySkillTree(sourceDir: string, destination: string): number {
  let written = 0;
  const stack: Array<{ from: string; to: string }> = [{ from: sourceDir, to: destination }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    fs.mkdirSync(current.to, { recursive: true });
    for (const entry of fs.readdirSync(current.from, { withFileTypes: true })) {
      const fromPath = path.resolve(current.from, entry.name);
      const toPath = path.resolve(current.to, entry.name);
      assertInsidePayloadRoot(destination, toPath);
      if (entry.isDirectory()) {
        stack.push({ from: fromPath, to: toPath });
        continue;
      }
      const data = fs.readFileSync(fromPath);
      fs.mkdirSync(path.dirname(toPath), { recursive: true });
      fs.writeFileSync(toPath, data, { mode: 0o644 });
      written += 1;
    }
  }
  return written;
}

export async function fetchSkillPayload(
  input: FetchSkillPayloadInput,
): Promise<FetchSkillPayloadResult> {
  const { probe, destination } = input;
  if (!gitAvailable()) {
    throw new Error("`git` is not available on PATH — cannot materialize a skills.sh payload.");
  }
  if (fs.existsSync(destination)) {
    throw new Error(`Skill payload destination already exists: ${destination}`);
  }

  const repoSource = probe.repoUrl ?? (probe.repository ? `https://github.com/${probe.repository}` : undefined);
  const skillSlug = probe.skillSlug ?? probe.skillId.split("/").at(-1);
  if (!repoSource || !skillSlug) {
    throw new Error(`Skill '${probe.skillId}' is missing repository metadata — cannot materialize payload.`);
  }

  const cloneRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "growthub-skills-source-"),
  );

  try {
    const cloneRes = runGit(["clone", "--depth", "1", repoSource, cloneRoot], path.dirname(cloneRoot));
    if (!cloneRes.ok) {
      throw new Error(`git clone failed: ${cloneRes.stderr || "unable to clone skill repository"}`);
    }

    const skillDir = locateSkillDirectory(cloneRoot, skillSlug);
    if (!skillDir) {
      throw new Error(
        `Unable to locate skill '${skillSlug}' inside repository '${probe.repository ?? repoSource}'.`,
      );
    }

    const fileCount = copySkillTree(skillDir, destination);
    return { destination, fileCount };
  } finally {
    fs.rmSync(cloneRoot, { recursive: true, force: true });
  }
}
