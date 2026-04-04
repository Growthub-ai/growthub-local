/**
 * KB skill docs API — CRUD on `kb_skill_docs` for board UI and agent-local tools (bearer / JWT).
 */
import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { forbidden, notFound, unprocessable } from "../errors.js";
import {
  createKbSkillDoc,
  ensureKbSkillWorkspaceHydrated,
  getKbSkillDoc,
  listKbSkillDocsForCompany,
  softDeleteKbSkillDoc,
  toSkillItemApi,
  updateKbSkillDoc,
} from "../services/kb-skill-docs.js";

async function resolveCompanyId(db: Db, req: Request): Promise<string | null> {
  if (req.actor.type === "agent" && req.actor.companyId) {
    return req.actor.companyId;
  }

  const raw = req.query.companyId ?? req.body?.companyId;
  const q = typeof raw === "string" ? raw.trim() : "";
  if (q) {
    assertCompanyAccess(req, q);
    return q;
  }

  if (req.actor.type === "board" && req.actor.source === "local_implicit") {
    const row = await db.select({ id: companies.id }).from(companies).limit(1).then((r) => r[0] ?? null);
    return row?.id ?? null;
  }

  return null;
}

export function kbSkillDocRoutes(db: Db) {
  const router = Router();

  router.get("/kb-skill-docs", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      assertCompanyAccess(req, companyId);
      await ensureKbSkillWorkspaceHydrated(db, companyId);
      const rows = await listKbSkillDocsForCompany(db, companyId);
      res.json({ skills: rows.map(toSkillItemApi) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/kb-skill-docs/:id", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      assertCompanyAccess(req, companyId);
      const row = await getKbSkillDoc(db, companyId, req.params.id as string);
      if (!row || !row.isActive) {
        res.status(404).json({ error: "Skill doc not found" });
        return;
      }
      res.json(toSkillItemApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.post("/kb-skill-docs", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      assertCompanyAccess(req, companyId);

      if (req.actor.type === "agent") {
        throw forbidden("Agents cannot create KB skill docs via this endpoint");
      }

      const { name, description, body, format, source, metadata } = req.body as Record<string, unknown>;
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      const row = await createKbSkillDoc(db, companyId, {
        name,
        description: typeof description === "string" ? description : "",
        body: typeof body === "string" ? body : "",
        format: typeof format === "string" ? format : undefined,
        source: typeof source === "string" ? source : undefined,
        metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : undefined,
      });
      res.status(201).json(toSkillItemApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/kb-skill-docs/:id", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      assertCompanyAccess(req, companyId);

      if (req.actor.type === "agent") {
        throw forbidden("Agents cannot update KB skill docs via this endpoint");
      }

      const { name, description, body, format, source, metadata, isActive } = req.body as Record<string, unknown>;
      const updated = await updateKbSkillDoc(db, companyId, req.params.id as string, {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(description !== undefined ? { description: String(description) } : {}),
        ...(body !== undefined ? { body: String(body) } : {}),
        ...(format !== undefined ? { format: String(format) } : {}),
        ...(source !== undefined ? { source: String(source) } : {}),
        ...(metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata)
          ? { metadata: metadata as Record<string, unknown> }
          : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      });
      if (!updated) {
        res.status(404).json({ error: "Skill doc not found" });
        return;
      }
      res.json(toSkillItemApi(updated));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/kb-skill-docs/:id", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      assertCompanyAccess(req, companyId);

      if (req.actor.type === "agent") {
        throw forbidden("Agents cannot delete KB skill docs via this endpoint");
      }

      const ok = await softDeleteKbSkillDoc(db, companyId, req.params.id as string);
      if (!ok) {
        res.status(404).json({ error: "Skill doc not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Agent-authenticated CRUD (custom adapter / bash tool) — same company as JWT only.
  router.post("/agent/kb-skill-docs", async (req, res, next) => {
    try {
      if (req.actor.type !== "agent" || !req.actor.companyId) {
        throw forbidden("Agent bearer token required");
      }
      const companyId = req.actor.companyId;
      const { action } = req.body as { action?: string };
      if (action === "list") {
        await ensureKbSkillWorkspaceHydrated(db, companyId);
        const rows = await listKbSkillDocsForCompany(db, companyId);
        res.json({ ok: true, skills: rows.map(toSkillItemApi) });
        return;
      }
      if (action === "get") {
        const id = typeof req.body.id === "string" ? req.body.id : "";
        if (!id) throw unprocessable("id required");
        const row = await getKbSkillDoc(db, companyId, id);
        if (!row || !row.isActive) throw notFound("Skill doc not found");
        res.json({ ok: true, skill: toSkillItemApi(row) });
        return;
      }
      if (action === "create") {
        const { name, description, body, format, source, metadata } = req.body as Record<string, unknown>;
        if (typeof name !== "string" || !name.trim()) throw unprocessable("name is required");
        const row = await createKbSkillDoc(db, companyId, {
          name,
          description: typeof description === "string" ? description : "",
          body: typeof body === "string" ? body : "",
          format: typeof format === "string" ? format : undefined,
          source: typeof source === "string" ? source : "agent_tool",
          metadata:
            metadata && typeof metadata === "object" && !Array.isArray(metadata)
              ? (metadata as Record<string, unknown>)
              : { origin: "agent_tool" },
        });
        res.status(201).json({ ok: true, skill: toSkillItemApi(row) });
        return;
      }
      if (action === "update") {
        const id = typeof req.body.id === "string" ? req.body.id : "";
        if (!id) throw unprocessable("id required");
        const { name, description, body, format, source, metadata, isActive } = req.body as Record<string, unknown>;
        const updated = await updateKbSkillDoc(db, companyId, id, {
          ...(name !== undefined ? { name: String(name) } : {}),
          ...(description !== undefined ? { description: String(description) } : {}),
          ...(body !== undefined ? { body: String(body) } : {}),
          ...(format !== undefined ? { format: String(format) } : {}),
          ...(source !== undefined ? { source: String(source) } : {}),
          ...(metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata)
            ? { metadata: metadata as Record<string, unknown> }
            : {}),
          ...(typeof isActive === "boolean" ? { isActive } : {}),
        });
        if (!updated) throw notFound("Skill doc not found");
        res.json({ ok: true, skill: toSkillItemApi(updated) });
        return;
      }
      if (action === "delete") {
        const id = typeof req.body.id === "string" ? req.body.id : "";
        if (!id) throw unprocessable("id required");
        const ok = await softDeleteKbSkillDoc(db, companyId, id);
        if (!ok) throw notFound("Skill doc not found");
        res.json({ ok: true });
        return;
      }

      res.status(400).json({ error: "Unknown action; use list | get | create | update | delete" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
