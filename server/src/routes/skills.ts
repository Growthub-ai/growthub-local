/**
 * Skills routes — CRUD for skill knowledge items + agent-skill assignment.
 *
 * Skills are stored as GtmKnowledgeItemRecord entries with sourceType "skill".
 * Agent-skill assignment lives in agent.metadata.skills (array of item IDs).
 * No new DB tables — uses existing knowledge item + agent metadata patterns.
 */

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  listSkillKnowledgeItems,
  getSkillKnowledgeItem,
  createSkillKnowledgeItem,
  updateSkillKnowledgeItem,
  deleteSkillKnowledgeItem,
  seedSkillsFromFilesystem,
} from "../services/gtm-knowledge-capture.js";
import { agentService } from "../services/agents.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readMetadataSkills(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const skills = metadata.skills;
  if (!Array.isArray(skills)) return [];
  return skills.filter((s): s is string => typeof s === "string");
}

function patchMetadataSkills(
  metadata: Record<string, unknown> | null,
  skills: string[],
): Record<string, unknown> {
  return { ...(metadata ?? {}), skills };
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function skillRoutes(db: Db) {
  const router = Router();
  const agents = agentService(db);
  let seeded = false;

  function ensureSeeded() {
    if (seeded) return;
    seeded = true;
    try {
      seedSkillsFromFilesystem();
    } catch (err) {
      logger.warn({ error: err }, "Skills: filesystem seed failed");
    }
  }

  // List all workspace skills
  router.get("/skills", (_req, res, next) => {
    try {
      ensureSeeded();
      const skills = listSkillKnowledgeItems();
      res.json({ skills });
    } catch (err) {
      next(err);
    }
  });

  // Create a custom skill
  router.post("/skills", (req, res, next) => {
    try {
      const { name, description, body } = req.body as {
        name?: string;
        description?: string;
        body?: string;
      };
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const skill = createSkillKnowledgeItem({
        name: name.trim(),
        description: typeof description === "string" ? description : "",
        body: typeof body === "string" ? body : "",
        source: "custom",
      });
      res.status(201).json(skill);
    } catch (err) {
      next(err);
    }
  });

  // Get a single skill
  router.get("/skills/:itemId", (req, res, next) => {
    try {
      const skill = getSkillKnowledgeItem(req.params.itemId as string);
      if (!skill) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      res.json(skill);
    } catch (err) {
      next(err);
    }
  });

  // Update a skill
  router.patch("/skills/:itemId", (req, res, next) => {
    try {
      const { name, description, body } = req.body as {
        name?: string;
        description?: string;
        body?: string;
      };
      const updated = updateSkillKnowledgeItem(req.params.itemId as string, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(body !== undefined ? { body } : {}),
      });
      if (!updated) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // Soft-delete a skill
  router.delete("/skills/:itemId", (req, res, next) => {
    try {
      const deleted = deleteSkillKnowledgeItem(req.params.itemId as string);
      if (!deleted) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // List skills assigned to an agent
  router.get("/agents/:agentId/skills", async (req, res, next) => {
    try {
      ensureSeeded();
      const agent = await agents.getById(req.params.agentId as string);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const skillIds = readMetadataSkills(agent.metadata as Record<string, unknown> | null);
      const skills = skillIds
        .map((id) => getSkillKnowledgeItem(id))
        .filter((s): s is NonNullable<typeof s> => s !== null);
      res.json({ skills });
    } catch (err) {
      next(err);
    }
  });

  // Assign a skill to an agent
  router.post("/agents/:agentId/skills/:itemId", async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const itemId = req.params.itemId as string;

      const agent = await agents.getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const skill = getSkillKnowledgeItem(itemId);
      if (!skill) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }

      const existing = readMetadataSkills(agent.metadata as Record<string, unknown> | null);
      if (existing.includes(itemId)) {
        res.json({ ok: true });
        return;
      }

      await agents.update(agentId, {
        metadata: patchMetadataSkills(
          agent.metadata as Record<string, unknown> | null,
          [...existing, itemId],
        ),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Unassign a skill from an agent
  router.delete("/agents/:agentId/skills/:itemId", async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const itemId = req.params.itemId as string;

      const agent = await agents.getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const existing = readMetadataSkills(agent.metadata as Record<string, unknown> | null);
      const filtered = existing.filter((id) => id !== itemId);

      if (filtered.length === existing.length) {
        res.json({ ok: true });
        return;
      }

      await agents.update(agentId, {
        metadata: patchMetadataSkills(
          agent.metadata as Record<string, unknown> | null,
          filtered,
        ),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
