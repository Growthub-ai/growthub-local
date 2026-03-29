import { Router } from "express";
import { createTicketSchema, updateTicketSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { ticketService } from "../services/tickets.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
export function ticketRoutes(db) {
    const router = Router();
    const svc = ticketService(db);
    router.get("/companies/:companyId/tickets", async (req, res) => {
        const companyId = req.params.companyId;
        assertCompanyAccess(req, companyId);
        const result = await svc.list(companyId);
        res.json(result);
    });
    router.get("/companies/:companyId/tickets/:id", async (req, res) => {
        const companyId = req.params.companyId;
        const id = req.params.id;
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
        const companyId = req.params.companyId;
        assertCompanyAccess(req, companyId);
        const actor = getActorInfo(req);
        const ticket = await svc.create(companyId, req.body, actor.actorId ?? undefined);
        res.status(201).json(ticket);
    });
    router.patch("/companies/:companyId/tickets/:id", validate(updateTicketSchema), async (req, res) => {
        const companyId = req.params.companyId;
        const id = req.params.id;
        assertCompanyAccess(req, companyId);
        const ticket = await svc.update(id, req.body);
        if (!ticket) {
            res.status(404).json({ error: "Ticket not found" });
            return;
        }
        res.json(ticket);
    });
    router.post("/companies/:companyId/tickets/:id/advance", async (req, res) => {
        const companyId = req.params.companyId;
        const id = req.params.id;
        assertCompanyAccess(req, companyId);
        const ticket = await svc.advanceStage(id);
        if (!ticket) {
            res.status(404).json({ error: "Ticket not found" });
            return;
        }
        res.json(ticket);
    });
    router.delete("/companies/:companyId/tickets/:id", async (req, res) => {
        const companyId = req.params.companyId;
        const id = req.params.id;
        assertCompanyAccess(req, companyId);
        const ticket = await svc.remove(id);
        if (!ticket) {
            res.status(404).json({ error: "Ticket not found" });
            return;
        }
        res.json({ ok: true });
    });
    router.get("/companies/:companyId/github/prs", async (req, res) => {
        const repo = typeof req.query.repo === "string" ? req.query.repo.trim() : "";
        const state = req.query.state || "open";
        if (!repo) {
            res.json([]);
            return;
        }
        const { execSync } = await import("child_process");
        try {
            const raw = execSync(`gh api "/repos/${repo}/pulls?state=${state}&per_page=50" 2>/dev/null`, { encoding: "utf8", timeout: 8000 });
            const prs = JSON.parse(raw);
            res.json(prs.map((p) => ({
                number: p.number,
                title: p.title,
                state: p.state,
                url: p.html_url,
                branch: p.head?.ref,
                repo,
                createdAt: p.created_at,
                user: p.user?.login,
                draft: p.draft,
            })));
        }
        catch {
            res.json([]);
        }
    });
    router.get("/companies/:companyId/github/repos", async (req, res) => {
        const { execSync } = await import("child_process");
        try {
            const raw = execSync(`gh api "/user/repos?per_page=50&sort=pushed&type=all" 2>/dev/null`, { encoding: "utf8", timeout: 8000 });
            const repos = JSON.parse(raw);
            res.json(repos.map((r) => ({
                fullName: r.full_name,
                name: r.name,
                private: r.private,
                pushedAt: r.pushed_at,
            })));
        }
        catch {
            res.json([]);
        }
    });
    return router;
}
//# sourceMappingURL=tickets.js.map