/**
 * Knowledge Sync Routes
 *
 * POST /api/knowledge-sync/export — export kb_skill_docs to a KnowledgeSyncEnvelope
 * POST /api/knowledge-sync/import — import items from a KnowledgeSyncEnvelope
 * GET  /api/knowledge-sync/status — summary of local knowledge sync state
 *
 * Authenticated by the existing board/agent bearer middleware.
 * Delegates all DB reads/writes to kb-skill-docs service functions
 * (no direct table access in this route file).
 */

import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { forbidden } from "../errors.js";
import {
  createKbSkillDoc,
  ensureKbSkillWorkspaceHydrated,
  listKbSkillDocsForCompany,
  toSkillItemApi,
} from "../services/kb-skill-docs.js";
import {
  buildEnvelopeFromSource,
} from "@paperclipai/shared/kb-skill-bundle";
import type {
  WorkspaceKnowledgeRef,
  KnowledgeSyncEnvelope,
  KnowledgeSyncResult,
  KnowledgeSyncItemResult,
} from "@paperclipai/shared/types/knowledge-sync.js";
import { sha256Utf8 } from "@paperclipai/shared/kb-skill-bundle";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    const row = await db
      .select({ id: companies.id })
      .from(companies)
      .limit(1)
      .then((r) => r[0] ?? null);
    return row?.id ?? null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function knowledgeSyncRoutes(db: Db) {
  const router = Router();

  // ── GET /knowledge-sync/status ───────────────────────────────────────────
  router.get("/knowledge-sync/status", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      assertCompanyAccess(req, companyId);
      await ensureKbSkillWorkspaceHydrated(db, companyId);
      const rows = await listKbSkillDocsForCompany(db, companyId);
      const activeRows = rows.filter((r) => r.isActive);

      res.json({
        ok: true,
        companyId,
        localItemCount: activeRows.length,
        lastUpdatedAt: activeRows
          .map((r) => r.updatedAt)
          .sort()
          .at(-1) ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /knowledge-sync/export ──────────────────────────────────────────
  router.post("/knowledge-sync/export", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      assertCompanyAccess(req, companyId);

      const { label, targetRef, maxBytes } = req.body as {
        label?: string;
        targetRef?: WorkspaceKnowledgeRef;
        maxBytes?: number;
      };

      await ensureKbSkillWorkspaceHydrated(db, companyId);
      const rows = await listKbSkillDocsForCompany(db, companyId);
      const activeDocs = rows
        .filter((r) => r.isActive)
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description ?? "",
          body: r.body ?? "",
          format: r.format ?? "markdown",
          source: r.source ?? "custom",
        }));

      const sourceRef: WorkspaceKnowledgeRef = {
        kind: "instance_id",
        value: companyId,
        displayName: label ?? `workspace:${companyId}`,
      };

      const envelope = await buildEnvelopeFromSource(
        { ref: sourceRef, docs: activeDocs },
        { maxBytes: typeof maxBytes === "number" && maxBytes > 0 ? maxBytes : undefined },
      );

      if (targetRef) {
        (envelope as KnowledgeSyncEnvelope & { targetRef?: WorkspaceKnowledgeRef }).targetRef =
          targetRef;
      }

      logger.info({ companyId, itemCount: envelope.items.length, label }, "Knowledge sync export");
      res.json({ ok: true, envelope });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /knowledge-sync/import ──────────────────────────────────────────
  router.post("/knowledge-sync/import", async (req, res, next) => {
    try {
      const companyId = await resolveCompanyId(db, req);
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      assertCompanyAccess(req, companyId);

      if (req.actor.type === "agent" && !req.actor.companyId) {
        throw forbidden("Agent bearer token required for knowledge import");
      }

      const { envelope } = req.body as { envelope?: KnowledgeSyncEnvelope };
      if (!envelope || !Array.isArray(envelope.items)) {
        res.status(400).json({ error: "envelope with items array is required" });
        return;
      }

      // Verify envelope integrity
      const computedSig = await sha256Utf8(JSON.stringify(envelope.items));
      if (computedSig !== envelope.itemsSignature) {
        res.status(422).json({ error: "Envelope integrity check failed: itemsSignature mismatch" });
        return;
      }

      // Collect existing body sha256s for deduplication
      await ensureKbSkillWorkspaceHydrated(db, companyId);
      const existingRows = await listKbSkillDocsForCompany(db, companyId);
      const existingBodies = new Set<string>();
      for (const row of existingRows) {
        if (!row.isActive || !row.body) continue;
        const sig = await sha256Utf8(row.body);
        existingBodies.add(sig);
      }

      const itemResults: KnowledgeSyncItemResult[] = [];

      for (const item of envelope.items) {
        if (existingBodies.has(item.bodySha256)) {
          itemResults.push({
            originId: item.originId,
            name: item.name,
            status: "skipped_duplicate",
            reason: "Body already exists (sha256 match)",
          });
          continue;
        }

        try {
          const created = await createKbSkillDoc(db, companyId, {
            name: item.name,
            description: item.description,
            body: item.body,
            format: item.format,
            source: item.source ?? "cross_workspace",
            metadata: {
              ...(item.metadata ?? {}),
              originId: item.originId,
              importedFrom: envelope.sourceRef,
              envelopeId: envelope.envelopeId,
            },
          });
          existingBodies.add(item.bodySha256);
          itemResults.push({
            originId: item.originId,
            name: item.name,
            status: "imported",
            localId: created.id,
          });
        } catch (err) {
          itemResults.push({
            originId: item.originId,
            name: item.name,
            status: "failed",
            reason: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      const imported = itemResults.filter((r) => r.status === "imported").length;
      const skipped = itemResults.filter((r) => r.status === "skipped_duplicate").length;
      const failed = itemResults.filter((r) => r.status === "failed").length;

      const result: KnowledgeSyncResult = {
        envelopeId: envelope.envelopeId,
        processedAt: new Date().toISOString(),
        imported,
        skipped,
        failed,
        relayedToHosted: 0,
        items: itemResults,
      };

      logger.info({ companyId, imported, skipped, failed }, "Knowledge sync import complete");
      res.status(201).json({ ok: true, result });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /knowledge-sync/agent-capture ───────────────────────────────────
  // Agent-authenticated endpoint for post-run knowledge capture.
  router.post("/knowledge-sync/agent-capture", async (req, res, next) => {
    try {
      if (req.actor.type !== "agent" || !req.actor.companyId) {
        throw forbidden("Agent bearer token required");
      }
      const companyId = req.actor.companyId;

      const { runId, items } = req.body as {
        runId?: string;
        items?: Array<{
          name: string;
          description?: string;
          body: string;
          format?: string;
          metadata?: Record<string, unknown>;
        }>;
      };

      if (!runId || typeof runId !== "string") {
        res.status(400).json({ error: "runId is required" });
        return;
      }
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "items array is required" });
        return;
      }

      const savedIds: string[] = [];
      for (const item of items) {
        if (!item.name?.trim() || !item.body?.trim()) continue;
        try {
          const created = await createKbSkillDoc(db, companyId, {
            name: item.name.trim(),
            description: item.description ?? "",
            body: item.body,
            format: item.format ?? "markdown",
            source: "agent_run",
            metadata: { ...(item.metadata ?? {}), runId, capturedAt: new Date().toISOString() },
          });
          savedIds.push(created.id);
        } catch {
          // Non-fatal: skip individual failures
        }
      }

      logger.info({ companyId, runId, saved: savedIds.length }, "Agent knowledge capture");
      res.status(201).json({ ok: true, runId, saved: savedIds.length, ids: savedIds });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
