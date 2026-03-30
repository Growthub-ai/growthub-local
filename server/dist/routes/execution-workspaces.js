import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { issues, projects, projectWorkspaces } from "@paperclipai/db";
import { updateExecutionWorkspaceSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { executionWorkspaceService, logActivity, workspaceOperationService } from "../services/index.js";
import { parseProjectExecutionWorkspacePolicy } from "../services/execution-workspace-policy.js";
import { cleanupExecutionWorkspaceArtifacts, stopRuntimeServicesForExecutionWorkspace, } from "../services/workspace-runtime.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
const TERMINAL_ISSUE_STATUSES = new Set(["done", "cancelled"]);
const execFileAsync = promisify(execFile);
function resolveLocalDirectoryPath(rawPath, missingMessage) {
    if (!rawPath) {
        return { error: missingMessage };
    }
    const resolvedPath = path.resolve(rawPath);
    if (!existsSync(resolvedPath)) {
        return { error: `Workspace path "${resolvedPath}" does not exist on this machine.` };
    }
    if (!statSync(resolvedPath).isDirectory()) {
        return { error: `Workspace path "${resolvedPath}" is not a directory.` };
    }
    return { path: resolvedPath };
}
export function executionWorkspaceRoutes(db) {
    const router = Router();
    const svc = executionWorkspaceService(db);
    const workspaceOperationsSvc = workspaceOperationService(db);
    router.get("/companies/:companyId/execution-workspaces", async (req, res) => {
        const companyId = req.params.companyId;
        assertCompanyAccess(req, companyId);
        const workspaces = await svc.list(companyId, {
            projectId: req.query.projectId,
            projectWorkspaceId: req.query.projectWorkspaceId,
            issueId: req.query.issueId,
            status: req.query.status,
            reuseEligible: req.query.reuseEligible === "true",
        });
        res.json(workspaces);
    });
    router.get("/execution-workspaces/:id", async (req, res) => {
        const id = req.params.id;
        const workspace = await svc.getById(id);
        if (!workspace) {
            res.status(404).json({ error: "Execution workspace not found" });
            return;
        }
        assertCompanyAccess(req, workspace.companyId);
        res.json(workspace);
    });
    router.post("/execution-workspaces/:id/open-local", async (req, res) => {
        const id = req.params.id;
        const workspace = await svc.getById(id);
        if (!workspace) {
            res.status(404).json({ error: "Execution workspace not found" });
            return;
        }
        assertCompanyAccess(req, workspace.companyId);
        assertBoard(req);
        if (req.actor.source !== "local_implicit") {
            res.status(403).json({ error: "Opening in Cursor is only available from the local board context." });
            return;
        }
        const project = workspace.projectId ? await db
            .select({
            cwd: projectWorkspaces.cwd,
        })
            .from(projects)
            .leftJoin(projectWorkspaces, and(eq(projectWorkspaces.projectId, projects.id), eq(projectWorkspaces.isPrimary, true)))
            .where(and(eq(projects.id, workspace.projectId), eq(projects.companyId, workspace.companyId)))
            .then((rows) => rows[0] ?? null)
            : null;
        const resolved = resolveLocalDirectoryPath(project?.cwd ?? workspace.cwd ?? workspace.providerRef ?? null, "This execution workspace does not have a local project folder configured on this machine.");
        if ("error" in resolved) {
            res.status(409).json({ error: resolved.error });
            return;
        }
        if (workspace.branchName) {
            try {
                await execFileAsync("git", ["checkout", "--ignore-other-worktrees", workspace.branchName], {
                    cwd: resolved.path,
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                res.status(409).json({
                    error: `Failed to switch the main project folder to branch "${workspace.branchName}": ${message}`,
                });
                return;
            }
        }
        try {
            await execFileAsync("open", ["-a", "Cursor", resolved.path]);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: `Failed to open Cursor: ${message}` });
            return;
        }
        const actor = getActorInfo(req);
        await logActivity(db, {
            companyId: workspace.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "execution_workspace.opened_in_cursor",
            entityType: "execution_workspace",
            entityId: workspace.id,
            details: {
                app: "Cursor",
                path: resolved.path,
                branchName: workspace.branchName,
            },
        });
        res.json({
            ok: true,
            app: "Cursor",
            path: resolved.path,
            branchName: workspace.branchName ?? null,
        });
    });
    router.patch("/execution-workspaces/:id", validate(updateExecutionWorkspaceSchema), async (req, res) => {
        const id = req.params.id;
        const existing = await svc.getById(id);
        if (!existing) {
            res.status(404).json({ error: "Execution workspace not found" });
            return;
        }
        assertCompanyAccess(req, existing.companyId);
        const patch = {
            ...req.body,
            ...(req.body.cleanupEligibleAt ? { cleanupEligibleAt: new Date(req.body.cleanupEligibleAt) } : {}),
        };
        let workspace = existing;
        let cleanupWarnings = [];
        if (req.body.status === "archived" && existing.status !== "archived") {
            const linkedIssues = await db
                .select({
                id: issues.id,
                status: issues.status,
            })
                .from(issues)
                .where(and(eq(issues.companyId, existing.companyId), eq(issues.executionWorkspaceId, existing.id)));
            const activeLinkedIssues = linkedIssues.filter((issue) => !TERMINAL_ISSUE_STATUSES.has(issue.status));
            if (activeLinkedIssues.length > 0) {
                res.status(409).json({
                    error: `Cannot archive execution workspace while ${activeLinkedIssues.length} linked issue(s) are still open`,
                });
                return;
            }
            const closedAt = new Date();
            const archivedWorkspace = await svc.update(id, {
                ...patch,
                status: "archived",
                closedAt,
                cleanupReason: null,
            });
            if (!archivedWorkspace) {
                res.status(404).json({ error: "Execution workspace not found" });
                return;
            }
            workspace = archivedWorkspace;
            try {
                await stopRuntimeServicesForExecutionWorkspace({
                    db,
                    executionWorkspaceId: existing.id,
                    workspaceCwd: existing.cwd,
                });
                const projectWorkspace = existing.projectWorkspaceId
                    ? await db
                        .select({
                        cwd: projectWorkspaces.cwd,
                        cleanupCommand: projectWorkspaces.cleanupCommand,
                    })
                        .from(projectWorkspaces)
                        .where(and(eq(projectWorkspaces.id, existing.projectWorkspaceId), eq(projectWorkspaces.companyId, existing.companyId)))
                        .then((rows) => rows[0] ?? null)
                    : null;
                const projectPolicy = existing.projectId
                    ? await db
                        .select({
                        executionWorkspacePolicy: projects.executionWorkspacePolicy,
                    })
                        .from(projects)
                        .where(and(eq(projects.id, existing.projectId), eq(projects.companyId, existing.companyId)))
                        .then((rows) => parseProjectExecutionWorkspacePolicy(rows[0]?.executionWorkspacePolicy))
                    : null;
                const cleanupResult = await cleanupExecutionWorkspaceArtifacts({
                    workspace: existing,
                    projectWorkspace,
                    teardownCommand: projectPolicy?.workspaceStrategy?.teardownCommand ?? null,
                    recorder: workspaceOperationsSvc.createRecorder({
                        companyId: existing.companyId,
                        executionWorkspaceId: existing.id,
                    }),
                });
                cleanupWarnings = cleanupResult.warnings;
                const cleanupPatch = {
                    closedAt,
                    cleanupReason: cleanupWarnings.length > 0 ? cleanupWarnings.join(" | ") : null,
                };
                if (!cleanupResult.cleaned) {
                    cleanupPatch.status = "cleanup_failed";
                }
                if (cleanupResult.warnings.length > 0 || !cleanupResult.cleaned) {
                    workspace = (await svc.update(id, cleanupPatch)) ?? workspace;
                }
            }
            catch (error) {
                const failureReason = error instanceof Error ? error.message : String(error);
                workspace =
                    (await svc.update(id, {
                        status: "cleanup_failed",
                        closedAt,
                        cleanupReason: failureReason,
                    })) ?? workspace;
                res.status(500).json({
                    error: `Failed to archive execution workspace: ${failureReason}`,
                });
                return;
            }
        }
        else {
            const updatedWorkspace = await svc.update(id, patch);
            if (!updatedWorkspace) {
                res.status(404).json({ error: "Execution workspace not found" });
                return;
            }
            workspace = updatedWorkspace;
        }
        const actor = getActorInfo(req);
        await logActivity(db, {
            companyId: existing.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "execution_workspace.updated",
            entityType: "execution_workspace",
            entityId: workspace.id,
            details: {
                changedKeys: Object.keys(req.body).sort(),
                ...(cleanupWarnings.length > 0 ? { cleanupWarnings } : {}),
            },
        });
        res.json(workspace);
    });
    return router;
}
//# sourceMappingURL=execution-workspaces.js.map