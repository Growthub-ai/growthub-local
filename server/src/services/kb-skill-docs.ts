import fs from "node:fs";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, companies, kbSkillDocs } from "@paperclipai/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { KbSkillDocPayload } from "@paperclipai/shared";
import { listSkillKnowledgeItems } from "./gtm-knowledge-capture.js";
import { logger } from "../middleware/logger.js";

export interface KbSkillDocRowView {
  id: string;
  companyId: string;
  name: string;
  description: string;
  body: string;
  format: string;
  source: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toView(row: typeof kbSkillDocs.$inferSelect): KbSkillDocRowView {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    body: row.body,
    format: row.format,
    source: row.source,
    metadata: row.metadata ?? {},
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSkillItemApi(view: KbSkillDocRowView): {
  id: string;
  name: string;
  description: string;
  body: string;
  source: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: view.id,
    name: view.name,
    description: view.description,
    body: view.body,
    source: view.source,
    isActive: view.isActive,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

export function rowToPayload(view: KbSkillDocRowView): KbSkillDocPayload {
  return {
    id: view.id,
    name: view.name,
    description: view.description,
    body: view.body,
    format: view.format,
    source: view.source,
  };
}

/**
 * One-time import from legacy GTM file-backed skill items into `kb_skill_docs`, preserving UUIDs.
 */
export async function importLegacyGtmSkillsIfEmpty(db: Db, companyId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kbSkillDocs)
    .where(eq(kbSkillDocs.companyId, companyId));

  if (count > 0) return 0;

  const [firstCompany] = await db
    .select({ id: companies.id })
    .from(companies)
    .orderBy(asc(companies.createdAt))
    .limit(1);
  // Legacy file-backed skills use global UUIDs; kb_skill_docs PK is `id` cluster-wide.
  // Import once for the first company only so assignments keep working.
  if (!firstCompany || firstCompany.id !== companyId) return 0;

  const legacy = listSkillKnowledgeItems();
  if (legacy.length === 0) return 0;

  let inserted = 0;
  for (const s of legacy) {
    await db.insert(kbSkillDocs).values({
      id: s.id,
      companyId,
      name: s.name,
      description: s.description,
      body: s.body,
      format: "markdown",
      source: s.source,
      metadata: {},
      isActive: s.isActive,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    });
    inserted++;
  }
  logger.info({ companyId, inserted }, "Imported legacy GTM skill items into kb_skill_docs");
  return inserted;
}

/**
 * Seeds ~/.claude/skills into kb_skill_docs only (does not write GTM state).
 */
export async function seedKbSkillDocsFromClaudeDir(db: Db, companyId: string): Promise<number> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeSkillsDir = `${homeDir}/.claude/skills`;
  let added = 0;
  try {
    const entries = fs.readdirSync(claudeSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      const name = entry.name;

      const dup = await db
        .select({ id: kbSkillDocs.id })
        .from(kbSkillDocs)
        .where(
          and(eq(kbSkillDocs.companyId, companyId), eq(kbSkillDocs.name, name), eq(kbSkillDocs.source, "filesystem")),
        )
        .then((rows) => rows[0] ?? null);
      if (dup) continue;

      const skillMdPath = `${claudeSkillsDir}/${name}/SKILL.md`;
      let body = "";
      let description = "";
      try {
        body = fs.readFileSync(skillMdPath, "utf8");
        const fmMatch = body.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const descMatch = fmMatch[1]?.match(/^description:\s*["']?(.*?)["']?\s*$/m);
          description = descMatch?.[1]?.trim() ?? "";
        }
      } catch {
        /* skip unreadable */
      }

      const now = new Date();
      await db.insert(kbSkillDocs).values({
        companyId,
        name,
        description,
        body,
        format: "markdown",
        source: "filesystem",
        metadata: { origin: "claude_skills_dir" },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
  } catch {
    /* ~/.claude/skills/ missing — fine */
  }

  if (added > 0) {
    logger.info({ companyId, added }, "Seeded kb_skill_docs from ~/.claude/skills");
  }
  return added;
}

export async function ensureKbSkillWorkspaceHydrated(db: Db, companyId: string): Promise<void> {
  await importLegacyGtmSkillsIfEmpty(db, companyId);
  await seedKbSkillDocsFromClaudeDir(db, companyId);
}

export async function listKbSkillDocsForCompany(db: Db, companyId: string): Promise<KbSkillDocRowView[]> {
  const rows = await db
    .select()
    .from(kbSkillDocs)
    .where(and(eq(kbSkillDocs.companyId, companyId), eq(kbSkillDocs.isActive, true)))
    .orderBy(desc(kbSkillDocs.updatedAt));

  return rows.map(toView);
}

export async function getKbSkillDoc(
  db: Db,
  companyId: string,
  id: string,
): Promise<KbSkillDocRowView | null> {
  const row = await db
    .select()
    .from(kbSkillDocs)
    .where(and(eq(kbSkillDocs.companyId, companyId), eq(kbSkillDocs.id, id)))
    .then((rows) => rows[0] ?? null);
  return row ? toView(row) : null;
}

export async function getKbSkillDocsByIds(
  db: Db,
  companyId: string,
  ids: string[],
): Promise<Map<string, KbSkillDocRowView>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return new Map();

  const rows = await db
    .select()
    .from(kbSkillDocs)
    .where(
      and(eq(kbSkillDocs.companyId, companyId), eq(kbSkillDocs.isActive, true), inArray(kbSkillDocs.id, uniq)),
    );

  const m = new Map<string, KbSkillDocRowView>();
  for (const r of rows) m.set(r.id, toView(r));
  return m;
}

export async function createKbSkillDoc(
  db: Db,
  companyId: string,
  input: {
    name: string;
    description?: string;
    body?: string;
    format?: string;
    source?: string;
    metadata?: Record<string, unknown>;
    id?: string;
  },
): Promise<KbSkillDocRowView> {
  const now = new Date();
  const values = {
    ...(input.id ? { id: input.id } : {}),
    companyId,
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    body: input.body ?? "",
    format: input.format ?? "markdown",
    source: input.source ?? "custom",
    metadata: input.metadata ?? {},
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const [row] = await db.insert(kbSkillDocs).values(values).returning();
  if (!row) throw new Error("Failed to create kb_skill_docs row");
  return toView(row);
}

export async function updateKbSkillDoc(
  db: Db,
  companyId: string,
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    body: string;
    format: string;
    source: string;
    metadata: Record<string, unknown>;
    isActive: boolean;
  }>,
): Promise<KbSkillDocRowView | null> {
  const existing = await getKbSkillDoc(db, companyId, id);
  if (!existing) return null;

  const [row] = await db
    .update(kbSkillDocs)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.format !== undefined ? { format: patch.format } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(kbSkillDocs.companyId, companyId), eq(kbSkillDocs.id, id)))
    .returning();

  return row ? toView(row) : null;
}

export async function softDeleteKbSkillDoc(db: Db, companyId: string, id: string): Promise<boolean> {
  const updated = await updateKbSkillDoc(db, companyId, id, { isActive: false });
  return updated !== null;
}

export async function assertSkillBelongsToAgentCompany(
  db: Db,
  agentId: string,
  skillId: string,
): Promise<{ agentCompanyId: string; ok: boolean }> {
  const agent = await db
    .select({ companyId: agentsTable.companyId })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .then((rows) => rows[0] ?? null);
  if (!agent) return { agentCompanyId: "", ok: false };

  const skill = await getKbSkillDoc(db, agent.companyId, skillId);
  return { agentCompanyId: agent.companyId, ok: skill !== null && skill.isActive };
}
