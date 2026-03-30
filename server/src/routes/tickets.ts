import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createTicketSchema, updateTicketSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { ticketService } from "../services/tickets.js";
import { accessService, agentService } from "../services/index.js";
import { forbidden, unauthorized } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function ticketRoutes(db: Db) {
  const router = Router();
  const svc = ticketService(db);
  const access = accessService(db);
  const agents = agentService(db);

  async function assertCanAssignTasks(req: Parameters<typeof getActorInfo>[0], companyId: string) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "board") {
      if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
      const allowed = await access.canUser(companyId, req.actor.userId, "tasks:assign");
      if (!allowed) throw forbidden("Missing permission: tasks:assign");
      return;
    }
    if (req.actor.type === "agent") {
      if (!req.actor.agentId) throw forbidden("Agent authentication required");
      const allowedByGrant = await access.hasPermission(companyId, "agent", req.actor.agentId, "tasks:assign");
      if (allowedByGrant) return;
      const actorAgent = await agents.getById(req.actor.agentId);
      if (
        actorAgent &&
        actorAgent.companyId === companyId &&
        (actorAgent.role === "ceo" || Boolean(actorAgent.permissions?.canCreateAgents))
      ) {
        return;
      }
      throw forbidden("Missing permission: tasks:assign");
    }
    throw unauthorized();
  }

  router.get("/companies/:companyId/tickets", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/companies/:companyId/tickets/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const ticket = await svc.getById(id);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const ticketIssues = await svc.getIssues(id);
    res.json({ ...ticket, issues: ticketIssues });
  });

  router.post("/companies/:companyId/tickets", validate(createTicketSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (req.body.leadAgentId) {
      await assertCanAssignTasks(req, companyId);
    }
    const actor = getActorInfo(req);
    const ticket = await svc.create(companyId, req.body, actor.actorId ?? undefined);
    res.status(201).json(ticket);
  });

  router.patch("/companies/:companyId/tickets/:id", validate(updateTicketSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const ticket = await svc.update(id, req.body);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res.json(ticket);
  });

  router.post("/companies/:companyId/tickets/:id/advance", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const ticket = await svc.advanceStage(id);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res.json(ticket);
  });

  router.delete("/companies/:companyId/tickets/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const ticket = await svc.remove(id);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.get("/companies/:companyId/github/prs", async (req, res) => {
    const repo = (req.query.repo as string) || "antonioromero1220/gh-app";
    const state = (req.query.state as string) || "open";
    const { execSync } = await import("child_process");
    try {
      const raw = execSync(
        `gh api "/repos/${repo}/pulls?state=${state}&per_page=50" 2>/dev/null`,
        { encoding: "utf8", timeout: 8000 }
      );
      const prs = JSON.parse(raw);
      res.json(
        prs.map((p: Record<string, unknown>) => ({
          number: p.number,
          title: p.title,
          state: p.state,
          url: (p as any).html_url,
          branch: (p as any).head?.ref,
          repo,
          createdAt: p.created_at,
          user: (p as any).user?.login,
          draft: p.draft,
        }))
      );
    } catch {
      res.json([]);
    }
  });

  router.get("/companies/:companyId/github/repos", async (req, res) => {
    const { execSync } = await import("child_process");
    try {
      const raw = execSync(
        `gh api "/user/repos?per_page=50&sort=pushed&type=all" 2>/dev/null`,
        { encoding: "utf8", timeout: 8000 }
      );
      const repos = JSON.parse(raw);
      res.json(
        repos.map((r: Record<string, unknown>) => ({
          fullName: r.full_name,
          name: r.name,
          private: r.private,
          pushedAt: r.pushed_at,
        }))
      );
    } catch {
      res.json([{ fullName: "antonioromero1220/gh-app", name: "gh-app", private: false }]);
    }
  });

  return router;
}
