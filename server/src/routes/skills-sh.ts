/**
 * Skills.sh Integration Routes — search, resolve, create knowledge items.
 *
 * Ported from gh-app src/lib/skills-sh/skillsShModule.ts + API routes.
 * Self-contained: no db dependency, talks to skills.sh API + GitHub,
 * persists via GTM state (GtmKnowledgeItemRecord).
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readGtmState, writeGtmState } from "../services/gtm-state.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillsShSearchResult {
  id: string;
  owner: string;
  repo: string;
  skillName: string;
  summary: string;
  tags: string[];
  installCommand: string;
  skillUrl: string;
  repoUrl?: string;
  metrics?: { installs?: number; lastUpdated?: string };
}

export interface SkillsShSkillSnapshot {
  meta: SkillsShSearchResult;
  whenToUse: string;
  instructions: string;
  examples?: string[];
  rawDocsExcerpt?: string;
  fetchedAt: string;
  directoryVersion: string;
}

// ---------------------------------------------------------------------------
// In-memory cache for GitHub directory (5 min TTL)
// ---------------------------------------------------------------------------

const DIRECTORY_VERSION = "skills.sh/v1";
const SKILLS_SEARCH_BASE = "https://skills.sh";
const SEARCH_URL = (q: string, limit = 50) =>
  `${SKILLS_SEARCH_BASE}/api/search?q=${encodeURIComponent(q)}&limit=${limit}`;

const SKILLS_REPOS = [
  { owner: "vercel-labs", repo: "skills" },
  { owner: "vercel-labs", repo: "agent-skills" },
] as const;

let directoryCache: { skills: SkillsShSearchResult[]; until: number } | null = null;
const DIRECTORY_CACHE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Search helpers (ported 1:1 from gh-app skillsShModule.ts)
// ---------------------------------------------------------------------------

type SkillsShSearchApiResponse = {
  skills?: Array<{ id: string; name: string; installs?: number; source?: string }>;
};

function mapSkillsShApiSkill(
  s: { id: string; name: string; installs?: number; source?: string },
): SkillsShSearchResult {
  const source = (s.source || s.id || "").trim();
  const [owner = "", repo = ""] = source.includes("/") ? source.split("/") : ["", source];
  const skillName = (s.name || s.id || "").trim();
  const id = s.id || (owner && repo && skillName ? `${owner}/${repo}@${skillName}` : skillName);
  return {
    id,
    owner: owner || id.split("/")[0] || "",
    repo: repo || id.split("/")[1]?.split("@")[0] || "",
    skillName: skillName || id.split("@")[1] || id,
    summary: "",
    tags: [],
    installCommand: `npx skills add ${id}`,
    skillUrl: `https://skills.sh/${id}`,
    repoUrl: owner && repo ? `https://github.com/${owner}/${repo}` : undefined,
    metrics: s.installs != null ? { installs: s.installs } : undefined,
  };
}

function buildSkillFromGitHub(owner: string, repo: string, skillName: string): SkillsShSearchResult {
  const id = `${owner}/${repo}@${skillName}`;
  return {
    id,
    owner,
    repo,
    skillName,
    summary: "",
    tags: [],
    installCommand: `npx skills add ${id}`,
    skillUrl: `https://skills.sh/${owner}/${repo}/${skillName}`,
    repoUrl: `https://github.com/${owner}/${repo}`,
  };
}

async function fetchDirectoryFromGitHub(): Promise<SkillsShSearchResult[]> {
  const now = Date.now();
  if (directoryCache && directoryCache.until > now && directoryCache.skills.length > 0) {
    return directoryCache.skills;
  }

  const results: SkillsShSearchResult[] = [];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "skills-sh-search",
  };

  for (const { owner, repo } of SKILLS_REPOS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/skills`,
          { headers, cache: "no-store" },
        );
        if (!res.ok) {
          if (res.status === 403 && attempt === 1) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          break;
        }
        const raw = (await res.json()) as Array<{ name?: string; type?: string }>;
        const entries = Array.isArray(raw) ? raw : [];
        for (const entry of entries) {
          if (entry.type !== "dir" || (entry.name && entry.name.startsWith("."))) continue;
          const name = (entry.name ?? "").replace(/\.zip$/i, "").trim();
          if (!name) continue;
          results.push(buildSkillFromGitHub(owner, repo, name));
        }
        break;
      } catch (e) {
        if (attempt === 2) logger.warn({ owner, repo, error: e }, "[skills-sh] GitHub fetch failed");
        else await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  if (results.length > 0) {
    directoryCache = { skills: results, until: now + DIRECTORY_CACHE_MS };
  }
  return results;
}

function filterDirectory(directory: SkillsShSearchResult[], query: string): SkillsShSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return directory;
  return directory.filter(
    (s) =>
      s.skillName.toLowerCase().includes(q) ||
      (s.summary && s.summary.toLowerCase().includes(q)) ||
      s.owner.toLowerCase().includes(q) ||
      s.repo.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

async function searchSkillsSh(
  query: string,
  filters?: { owner?: string },
): Promise<SkillsShSearchResult[]> {
  const trimmedQuery = (query ?? "").trim();

  // Try live skills.sh API first
  if (trimmedQuery.length >= 2) {
    try {
      const url = filters?.owner
        ? `${SEARCH_URL(trimmedQuery)}&owner=${encodeURIComponent(filters.owner)}`
        : SEARCH_URL(trimmedQuery);
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as SkillsShSearchApiResponse;
        const skills = Array.isArray(data.skills) ? data.skills : [];
        if (skills.length > 0) return skills.slice(0, 50).map(mapSkillsShApiSkill);
      }
    } catch (e) {
      logger.warn({ error: e }, "[skills-sh] API search failed, falling back to GitHub");
    }
  }

  // Fallback: GitHub directory
  const directory = await fetchDirectoryFromGitHub();
  if (directory.length === 0) throw new Error("Skills directory unavailable");
  const filtered = filterDirectory(directory, trimmedQuery);
  const out = filtered.length > 0 ? filtered : directory;
  return out.slice(0, 50);
}

// ---------------------------------------------------------------------------
// Resolve helpers (fetch SKILL.md / AGENTS.md from GitHub raw)
// ---------------------------------------------------------------------------

function buildDocCandidates(skill: SkillsShSearchResult) {
  const branches = ["main", "master"];
  const baseRepoUrl = skill.repoUrl || `https://github.com/${skill.owner}/${skill.repo}`;
  const rawBase = baseRepoUrl.replace("https://github.com", "https://raw.githubusercontent.com");

  const candidates: Array<{ label: "skill" | "agents"; url: string }> = [];

  branches.forEach((branch) => {
    candidates.push(
      { label: "skill", url: `${rawBase}/${branch}/skills/${skill.skillName}/SKILL.md` },
      { label: "agents", url: `${rawBase}/${branch}/skills/${skill.skillName}/AGENTS.md` },
      { label: "skill", url: `${rawBase}/${branch}/${skill.skillName}/SKILL.md` },
      { label: "agents", url: `${rawBase}/${branch}/${skill.skillName}/AGENTS.md` },
    );
  });

  return candidates;
}

async function fetchFirstDocs(candidates: Array<{ label: "skill" | "agents"; url: string }>) {
  const docs: { skill?: string; agents?: string } = {};

  for (const candidate of candidates) {
    if (candidate.label === "skill" && docs.skill) continue;
    if (candidate.label === "agents" && docs.agents) continue;

    try {
      const response = await fetch(candidate.url);
      if (!response.ok) continue;
      const text = await response.text();
      if (candidate.label === "skill") docs.skill = text;
      if (candidate.label === "agents") docs.agents = text;
    } catch {
      // skip failed fetches
    }

    if (docs.skill && docs.agents) break;
  }

  return docs;
}

function extractSection(content: string, headings: string[]) {
  if (!content) return "";
  const headingPattern = headings
    .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`^#{1,6}\\s*(${headingPattern})\\s*$`, "im");
  const match = content.match(regex);
  if (!match || match.index === undefined) return "";

  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeading = rest.search(/^#{1,6}\s+/m);
  const section = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
  return section;
}

function extractListSection(content: string, headings: string[]) {
  const section = extractSection(content, headings);
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

async function resolveSkillSnapshot(skill: SkillsShSearchResult): Promise<SkillsShSkillSnapshot> {
  const docCandidates = buildDocCandidates(skill);
  const docs = await fetchFirstDocs(docCandidates);
  const combinedDoc = [docs.skill, docs.agents].filter(Boolean).join("\n\n");

  const whenToUse =
    extractSection(combinedDoc, ["When to use", "When to Use", "Use cases", "Use Cases"]) ||
    "Use this skill when you need the behavior or tooling described in the skill documentation.";
  const instructions =
    extractSection(combinedDoc, ["Instructions", "How to use", "How to Use", "Usage"]) ||
    "Follow the skill documentation for setup and usage details.";
  const examples = extractListSection(combinedDoc, ["Examples", "Example Usage", "Example"]);

  return {
    meta: skill,
    whenToUse,
    instructions,
    examples: examples.length > 0 ? examples : undefined,
    rawDocsExcerpt: combinedDoc ? combinedDoc.slice(0, 1600) : undefined,
    fetchedAt: new Date().toISOString(),
    directoryVersion: DIRECTORY_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Knowledge item creation (writes to GTM state)
// ---------------------------------------------------------------------------

function buildSkillMarkdown(snapshot: SkillsShSkillSnapshot): string {
  const lines = [
    `# ${snapshot.meta.skillName}`,
    snapshot.meta.summary ? `> ${snapshot.meta.summary}` : "",
    "",
    "## When to use",
    snapshot.whenToUse,
    "",
    "## Instructions",
    snapshot.instructions,
    "",
    "## Install",
    `\`${snapshot.meta.installCommand}\``,
    "",
    "## Links",
    `- Skill: ${snapshot.meta.skillUrl}`,
    snapshot.meta.repoUrl ? `- Repository: ${snapshot.meta.repoUrl}` : "",
    "",
  ];

  if (snapshot.examples && snapshot.examples.length > 0) {
    lines.push("## Examples");
    snapshot.examples.forEach((example) => lines.push(`- ${example}`));
    lines.push("");
  }

  if (snapshot.rawDocsExcerpt) {
    lines.push("## Docs excerpt");
    lines.push(snapshot.rawDocsExcerpt);
    lines.push("");
  }

  return lines.filter(Boolean).join("\n");
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function createKnowledgeItem(params: {
  agentSlug: string;
  snapshot: SkillsShSkillSnapshot;
  label?: string;
}) {
  const { agentSlug, snapshot, label } = params;
  const now = new Date().toISOString();
  const itemId = randomUUID();
  const baseName = label || `${snapshot.meta.owner}-${snapshot.meta.repo}-${snapshot.meta.skillName}`;
  const fileName = sanitizeFileName(baseName);
  const storagePath = `knowledge/skills-sh/${fileName}.md`;

  const item = {
    id: itemId,
    agentSlug,
    compressed: false,
    createdAt: now,
    fileName,
    isActive: true,
    itemCount: 1,
    metadata: {
      origin: "skills_sh",
      connector_type: "skills_sh_directory",
      notes: snapshot.meta.summary || snapshot.whenToUse.slice(0, 500),
      visibility: "private",
      // skills.sh-specific context
      skill_id: snapshot.meta.id,
      skill_name: snapshot.meta.skillName,
      skill_owner: snapshot.meta.owner,
      skill_repo: snapshot.meta.repo,
      skill_url: snapshot.meta.skillUrl,
      install_command: snapshot.meta.installCommand,
      fetched_at: snapshot.fetchedAt,
      directory_version: snapshot.directoryVersion,
    },
    sourceType: "markdown",
    storagePath,
    updatedAt: now,
    userId: agentSlug,
  };

  // Persist to GTM state
  const state = readGtmState();

  // Check for duplicate (same skill_id + agentSlug)
  const existingIndex = state.knowledge.items.findIndex(
    (existing) =>
      existing.metadata.origin === "skills_sh" &&
      (existing.metadata as Record<string, unknown>).skill_id === snapshot.meta.id &&
      existing.agentSlug === agentSlug,
  );

  if (existingIndex >= 0) {
    // Update existing — fresher snapshot
    state.knowledge.items[existingIndex] = {
      ...state.knowledge.items[existingIndex]!,
      updatedAt: now,
      metadata: {
        ...state.knowledge.items[existingIndex]!.metadata,
        ...item.metadata,
      },
    };
    logger.info({ itemId: state.knowledge.items[existingIndex]!.id, agentSlug }, "[skills-sh] Updated existing knowledge item");
  } else {
    state.knowledge.items.push(item);
    logger.info({ itemId, agentSlug }, "[skills-sh] Created new knowledge item");
  }

  writeGtmState(state);

  const savedItem = existingIndex >= 0 ? state.knowledge.items[existingIndex]! : item;
  return { item: savedItem, markdown: buildSkillMarkdown(snapshot) };
}

// ---------------------------------------------------------------------------
// Express routes
// ---------------------------------------------------------------------------

export function skillsShRoutes() {
  const router = Router();

  // GET /skills-sh/search?query=X&owner=Y
  router.get("/search", async (req, res) => {
    try {
      const query = (typeof req.query.query === "string" ? req.query.query : "").trim();
      const owner = typeof req.query.owner === "string" ? req.query.owner : undefined;

      const results = await searchSkillsSh(query, owner ? { owner } : undefined);
      if (!results || results.length === 0) {
        res.status(503).json({ error: "Skills directory unavailable" });
        return;
      }
      res.json({ success: true, items: results });
    } catch (error) {
      logger.error({ error }, "[skills-sh] Search failed");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Search failed",
      });
    }
  });

  // POST /skills-sh/resolve — { skill: SkillsShSearchResult }
  router.post("/resolve", async (req, res) => {
    try {
      const body = req.body as { skill?: SkillsShSearchResult };
      if (!body?.skill) {
        res.status(400).json({ error: "Skill payload required" });
        return;
      }

      const snapshot = await resolveSkillSnapshot(body.skill);
      res.json({ success: true, snapshot });
    } catch (error) {
      logger.error({ error }, "[skills-sh] Resolve failed");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Resolve failed",
      });
    }
  });

  // POST /skills-sh/create — { agent_slug, skill, label? }
  router.post("/create", async (req, res) => {
    try {
      const body = req.body as {
        agent_slug?: string;
        skill?: SkillsShSearchResult;
        label?: string;
      };

      if (!body?.agent_slug || !body?.skill) {
        res.status(400).json({ error: "agent_slug and skill are required" });
        return;
      }

      const snapshot = await resolveSkillSnapshot(body.skill);
      const { item, markdown } = createKnowledgeItem({
        agentSlug: body.agent_slug,
        snapshot,
        label: body.label,
      });

      res.json({
        success: true,
        item,
        snapshot,
        markdown_length: markdown.length,
      });
    } catch (error) {
      logger.error({ error }, "[skills-sh] Create failed");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Create failed",
      });
    }
  });

  return router;
}
