/**
 * Skills routes — CRUD for KB skill docs (`kb_skill_docs`) + agent-skill assignment
 * (`agent.metadata.skills`).
 */

import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { parseAgentSkillAssignment, patchMetadataSkills } from "@paperclipai/shared";
import { agentService } from "../services/agents.js";
import {
  createKbSkillDoc,
  ensureKbSkillWorkspaceHydrated,
  getKbSkillDoc,
  listKbSkillDocsForCompany,
  softDeleteKbSkillDoc,
  toSkillItemApi,
  updateKbSkillDoc,
} from "../services/kb-skill-docs.js";
import { assertCompanyAccess } from "./authz.js";
import { forbidden } from "../errors.js";

function assertNotAgentActor(req: Request) {
  if (req.actor.type === "agent") {
    throw forbidden("Use POST /api/agent/kb-skill-docs with agent authentication");
  }
}

async function resolveCompanyId(db: Db, req: Request): Promise<string | null> {
  if (req.actor.type === "agent" && req.actor.companyId) {
    return req.actor.companyId;
  }

  const q = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "";
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

export function skillRoutes(db: Db) {
  const router = Router();
  const agents = agentService(db);

  router.get("/skills", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId query parameter is required" });
        return;
      }
      assertCompanyAccess(req, companyId);
      assertNotAgentActor(req);
      await ensureKbSkillWorkspaceHydrated(db, companyId);
      const rows = await listKbSkillDocsForCompany(db, companyId);
      res.json({ skills: rows.map(toSkillItemApi) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/skills", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId query parameter is required" });
        return;
      }
      assertCompanyAccess(req, companyId);
      assertNotAgentActor(req);

      const { name, description, body } = req.body as {
        name?: string;
        description?: string;
        body?: string;
      };
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const row = await createKbSkillDoc(db, companyId, {
        name: name.trim(),
        description: typeof description === "string" ? description : "",
        body: typeof body === "string" ? body : "",
        source: "custom",
      });
      res.status(201).json(toSkillItemApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.get("/skills/:itemId", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId query parameter is required" });
        return;
      }
      assertCompanyAccess(req, companyId);
      const row = await getKbSkillDoc(db, companyId, req.params.itemId as string);
      if (!row || !row.isActive) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      res.json(toSkillItemApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/skills/:itemId", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId query parameter is required" });
        return;
      }
      assertCompanyAccess(req, companyId);
      assertNotAgentActor(req);
      const { name, description, body } = req.body as {
        name?: string;
        description?: string;
        body?: string;
      };
      const updated = await updateKbSkillDoc(db, companyId, req.params.itemId as string, {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(description !== undefined ? { description: String(description) } : {}),
        ...(body !== undefined ? { body: String(body) } : {}),
      });
      if (!updated) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      res.json(toSkillItemApi(updated));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/skills/:itemId", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId query parameter is required" });
        return;
      }
      assertCompanyAccess(req, companyId);
      assertNotAgentActor(req);
      const deleted = await softDeleteKbSkillDoc(db, companyId, req.params.itemId as string);
      if (!deleted) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/agents/:agentId/skills", async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const agent = await agents.getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      assertCompanyAccess(req, agent.companyId);

      await ensureKbSkillWorkspaceHydrated(db, agent.companyId);
      const assignment = parseAgentSkillAssignment(agent.metadata as Record<string, unknown> | null);
      const rows: ReturnType<typeof toSkillItemApi>[] = [];
      for (const id of assignment.ids) {
        const row = await getKbSkillDoc(db, agent.companyId, id);
        if (row && row.isActive) rows.push(toSkillItemApi(row));
      }
      res.json({ skills: rows, assignmentMode: assignment.mode });
    } catch (err) {
      next(err);
    }
  });

  /** Clear skill assignments (opt-in model: no skills until explicitly assigned). */
  router.delete("/agents/:agentId/skills", async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const agent = await agents.getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      assertCompanyAccess(req, agent.companyId);

      await agents.update(agentId, {
        metadata: patchMetadataSkills(agent.metadata as Record<string, unknown> | null, []),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /** Assign every active workspace KB skill doc explicitly in metadata (opt-in “use all”). */
  router.post("/agents/:agentId/skills/assign-all-workspace", async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const agent = await agents.getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      assertCompanyAccess(req, agent.companyId);

      await ensureKbSkillWorkspaceHydrated(db, agent.companyId);
      const allActive = await listKbSkillDocsForCompany(db, agent.companyId);
      const allIds = allActive.map((r) => r.id);
      await agents.update(agentId, {
        metadata: patchMetadataSkills(agent.metadata as Record<string, unknown> | null, allIds),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/agents/:agentId/skills/:itemId", async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const itemId = req.params.itemId as string;

      const agent = await agents.getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      assertCompanyAccess(req, agent.companyId);

      const skill = await getKbSkillDoc(db, agent.companyId, itemId);
      if (!skill || !skill.isActive) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }

      await ensureKbSkillWorkspaceHydrated(db, agent.companyId);
      const assignment = parseAgentSkillAssignment(agent.metadata as Record<string, unknown> | null);
      const current = [...assignment.ids];

      if (current.includes(itemId)) {
        res.json({ ok: true });
        return;
      }

      await agents.update(agentId, {
        metadata: patchMetadataSkills(agent.metadata as Record<string, unknown> | null, [...current, itemId]),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/agents/:agentId/skills/:itemId", async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const itemId = req.params.itemId as string;

      const agent = await agents.getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      assertCompanyAccess(req, agent.companyId);

      await ensureKbSkillWorkspaceHydrated(db, agent.companyId);
      const assignment = parseAgentSkillAssignment(agent.metadata as Record<string, unknown> | null);
      const next = assignment.ids.filter((id) => id !== itemId);

      if (next.length === assignment.ids.length) {
        res.json({ ok: true });
        return;
      }

      await agents.update(agentId, {
        metadata: patchMetadataSkills(agent.metadata as Record<string, unknown> | null, next),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}