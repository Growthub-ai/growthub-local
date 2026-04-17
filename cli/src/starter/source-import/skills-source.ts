/**
 * Source Import Agent — skills.sh source adapter.
 *
 * skills.sh is a public catalog of portable skill primitives. This adapter
 * exposes three operations over the catalog:
 *
 *   1. `browseSkills(query)`     — paginated search (Discovery UX).
 *   2. `probeSkillsSource(input)`— metadata probe that returns a
 *                                  `SkillsSkillAccessProbe`.
 *   3. `fetchSkillPayload(probe, dest)`
 *                                — materialise the skill's files into a
 *                                  bounded staging directory. Never
 *                                  auto-executes any script.
 *
 * Transport is the built-in `fetch`. No new credential surface is added —
 * skills.sh is public-by-design in v1 and we never attach Growthub-hosted
 * credentials to skills traffic.
 *
 * Base URL is sourced from `SKILLS_SH_BASE` so offline/test environments
 * can point at a local fixture server without code changes.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  SkillsBrowseEntry,
  SkillsBrowseQuery,
  SkillsBrowseResult,
  SkillsSkillAccessProbe,
  SkillsSkillSourceInput,
} from "./types.js";

const DEFAULT_BASE = "https://skills.sh";

function resolveBase(): string {
  const raw = process.env.SKILLS_SH_BASE?.trim();
  if (!raw) return DEFAULT_BASE;
  return raw.replace(/\/+$/, "");
}

function baseHeaders(): Record<string, string> {
  return {
    "User-Agent": "growthub-cli",
    Accept: "application/json",
  };
}

// ---------------------------------------------------------------------------
// Identifier parsing
// ---------------------------------------------------------------------------

export interface ParsedSkillRef {
  /** "author/skill" canonical id. */
  skillId: string;
  /** Optional version suffix parsed from `author/skill@version`. */
  version?: string;
}

/**
 * Parse a raw skill ref into canonical components. Accepts:
 *   - "author/skill"
 *   - "author/skill@version"
 *   - "https://skills.sh/author/skill"
 *   - "https://skills.sh/author/skill@version"
 */
export function parseSkillRef(raw: string): ParsedSkillRef {
  let working = raw.trim();
  if (!working) throw new Error("Skill reference is empty.");

  // Strip known URL prefixes.
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
      `Invalid skill reference: '${raw}'. Use 'author/skill' or 'author/skill@version'.`,
    );
  }

  const author = parts[0];
  const skill = parts.slice(1).join("/");
  if (!/^[A-Za-z0-9._-]+$/.test(author)) {
    throw new Error(`Invalid skill author segment: '${author}'.`);
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(skill)) {
    throw new Error(`Invalid skill name segment: '${skill}'.`);
  }

  return { skillId: `${author}/${skill}`, version };
}

// ---------------------------------------------------------------------------
// Browse + pagination
// ---------------------------------------------------------------------------

interface RawBrowseEntry {
  id?: string;
  skillId?: string;
  slug?: string;
  title?: string;
  name?: string;
  author?: string;
  authorHandle?: string;
  description?: string;
  version?: string;
  htmlUrl?: string;
  url?: string;
}

interface RawBrowseResponse {
  total?: number;
  entries?: RawBrowseEntry[];
  results?: RawBrowseEntry[];
  items?: RawBrowseEntry[];
}

function coerceBrowseEntry(raw: RawBrowseEntry, base: string): SkillsBrowseEntry | null {
  const skillId = raw.skillId ?? raw.id ?? raw.slug;
  const title = raw.title ?? raw.name;
  const author = raw.author ?? raw.authorHandle;
  if (!skillId || !title || !author) return null;
  return {
    skillId,
    title,
    author,
    description: raw.description,
    htmlUrl: raw.htmlUrl ?? raw.url ?? `${base}/${skillId}`,
    version: raw.version,
  };
}

/**
 * Search skills.sh with pagination. Returns normalised entries regardless
 * of which shape the upstream API emits.
 */
export async function browseSkills(
  query: SkillsBrowseQuery = {},
): Promise<SkillsBrowseResult> {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(query.pageSize ?? 20)));
  const base = resolveBase();

  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const res = await fetch(`${base}/api/skills?${params.toString()}`, {
    headers: baseHeaders(),
  });
  if (!res.ok) {
    throw new Error(`skills.sh browse failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as RawBrowseResponse;
  const rawEntries = raw.entries ?? raw.results ?? raw.items ?? [];
  const entries: SkillsBrowseEntry[] = [];
  for (const r of rawEntries) {
    const coerced = coerceBrowseEntry(r, base);
    if (coerced) entries.push(coerced);
  }
  return {
    query: { q: query.q, page, pageSize },
    total: typeof raw.total === "number" ? raw.total : undefined,
    page,
    pageSize,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Metadata probe
// ---------------------------------------------------------------------------

interface RawSkillMetadata {
  skillId?: string;
  id?: string;
  slug?: string;
  title?: string;
  name?: string;
  author?: string;
  authorHandle?: string;
  description?: string;
  version?: string;
  htmlUrl?: string;
  url?: string;
  files?: Array<string | { path?: string; name?: string }>;
}

function coerceFileList(raw: RawSkillMetadata["files"]): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      if (entry) out.push(entry);
      continue;
    }
    const p = entry?.path ?? entry?.name;
    if (typeof p === "string" && p) out.push(p);
  }
  return out;
}

/**
 * Probe skills.sh for a skill's metadata. Returns a
 * `SkillsSkillAccessProbe` the planner can consume.
 */
export async function probeSkillsSource(
  input: SkillsSkillSourceInput,
): Promise<SkillsSkillAccessProbe> {
  const parsed = parseSkillRef(input.skillRef);
  const warnings: string[] = [];
  const base = resolveBase();
  const version = input.version ?? parsed.version ?? "latest";

  if (input.skipProbe) {
    return {
      kind: "skills-skill",
      mode: "public",
      skillRef: input.skillRef,
      skillId: parsed.skillId,
      version,
      title: parsed.skillId,
      author: parsed.skillId.split("/")[0] ?? "unknown",
      htmlUrl: `${base}/${parsed.skillId}`,
      files: [],
      warnings: ["--skip-probe set; metadata defaults used"],
    };
  }

  const url = `${base}/api/skills/${parsed.skillId}${version === "latest" ? "" : `?version=${encodeURIComponent(version)}`}`;
  const res = await fetch(url, { headers: baseHeaders() });
  if (res.status === 404) {
    throw new Error(`skill not found on skills.sh: '${parsed.skillId}' (version=${version})`);
  }
  if (!res.ok) {
    throw new Error(`skills.sh metadata probe failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as RawSkillMetadata;
  const title = raw.title ?? raw.name ?? parsed.skillId;
  const author = raw.author ?? raw.authorHandle ?? parsed.skillId.split("/")[0] ?? "unknown";
  const resolvedVersion = raw.version ?? version;
  const files = coerceFileList(raw.files);
  if (files.length === 0) {
    warnings.push("skills.sh returned no file manifest — payload fetch will stream the default archive.");
  }

  return {
    kind: "skills-skill",
    mode: "public",
    skillRef: input.skillRef,
    skillId: raw.skillId ?? raw.id ?? raw.slug ?? parsed.skillId,
    version: resolvedVersion,
    title,
    author,
    description: raw.description,
    htmlUrl: raw.htmlUrl ?? raw.url ?? `${base}/${parsed.skillId}`,
    files,
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

async function fetchSkillFile(
  base: string,
  skillId: string,
  version: string,
  relPath: string,
): Promise<Buffer> {
  const url = `${base}/api/skills/${skillId}/files/${encodeURI(relPath)}?version=${encodeURIComponent(version)}`;
  const res = await fetch(url, { headers: baseHeaders() });
  if (!res.ok) {
    throw new Error(
      `skills.sh file fetch failed for '${relPath}': ${res.status} ${res.statusText}`,
    );
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Materialise a skill payload into `destination`. Writes each advertised
 * file as-is. Never marks any file executable. Never runs any script.
 */
export async function fetchSkillPayload(
  input: FetchSkillPayloadInput,
): Promise<FetchSkillPayloadResult> {
  const { probe, destination } = input;
  if (fs.existsSync(destination)) {
    throw new Error(`Skill payload destination already exists: ${destination}`);
  }
  fs.mkdirSync(destination, { recursive: true });

  const base = resolveBase();
  let written = 0;

  if (probe.files.length === 0) {
    // Fall back to a manifest probe that will tell us what exists. This
    // keeps the adapter behaviour deterministic even when the upstream
    // probe returned no file list.
    const manifestRes = await fetch(
      `${base}/api/skills/${probe.skillId}/manifest?version=${encodeURIComponent(probe.version)}`,
      { headers: baseHeaders() },
    );
    if (!manifestRes.ok) {
      throw new Error(
        `skills.sh manifest fetch failed: ${manifestRes.status} ${manifestRes.statusText}`,
      );
    }
    const manifestRaw = (await manifestRes.json()) as { files?: string[] };
    for (const f of manifestRaw.files ?? []) {
      const target = path.resolve(destination, f);
      assertInsidePayloadRoot(destination, target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const data = await fetchSkillFile(base, probe.skillId, probe.version, f);
      fs.writeFileSync(target, data, { mode: 0o644 });
      written += 1;
    }
  } else {
    for (const rel of probe.files) {
      const target = path.resolve(destination, rel);
      assertInsidePayloadRoot(destination, target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const data = await fetchSkillFile(base, probe.skillId, probe.version, rel);
      fs.writeFileSync(target, data, { mode: 0o644 });
      written += 1;
    }
  }

  return { destination, fileCount: written };
}
