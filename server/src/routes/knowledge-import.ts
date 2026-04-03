/**
 * Knowledge Import routes — file upload, paste, and skills.sh API import.
 *
 * POST /knowledge-import/items   — create from JSON body (paste or skills-api)
 * POST /knowledge-import/file    — multipart file upload
 *
 * All endpoints create GtmKnowledgeItemRecord entries via the shared
 * createKnowledgeItemFromImport primitive in gtm-knowledge-capture.
 */

import { Router } from "express";
import multer from "multer";
import {
  createSkillKnowledgeItem,
} from "../services/gtm-knowledge-capture.js";
import { logger } from "../middleware/logger.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

export function knowledgeImportRoutes() {
  const router = Router();

  router.post("/knowledge-import/items", (req, res, next) => {
    try {
      const { items, mode } = req.body as {
        items?: Array<{
          name: string;
          description?: string;
          body: string;
          source?: string;
          fileName?: string;
        }>;
        mode?: "skill" | "knowledge";
      };

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "items array is required" });
        return;
      }

      const results = [];
      for (const item of items) {
        if (!item.name?.trim() || !item.body?.trim()) continue;

        if (mode === "skill") {
          const skill = createSkillKnowledgeItem({
            name: item.name.trim(),
            description: item.description ?? "",
            body: item.body,
            source: "custom",
          });
          results.push(skill);
        } else {
          res.status(501).json({ error: "Knowledge import is not implemented in this branch state" });
          return;
        }
      }

      res.status(201).json({ imported: results.length, items: results });
    } catch (err) {
      next(err);
    }
  });

  router.post("/knowledge-import/file", upload.array("files", 20), (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const mode = (req.body?.mode as string) ?? "knowledge";

      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }

      const results = [];
      for (const file of files) {
        const content = file.buffer.toString("utf8");
        const baseName = file.originalname.replace(/\.[^.]+$/, "");
        const titleized = baseName
          .split(/[-_ ]+/g)
          .filter(Boolean)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ");

        let name = titleized;
        let description = "";
        let body = content;

        if (mode === "skill") {
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const fm = fmMatch[1] ?? "";
            const nameMatch = fm.match(/^name:\s*["']?(.*?)["']?\s*$/m);
            const descMatch = fm.match(/^description:\s*["']?(.*?)["']?\s*$/m);
            if (nameMatch?.[1]) name = nameMatch[1].trim();
            if (descMatch?.[1]) description = descMatch[1].trim();
            body = content.slice(fmMatch[0].length).trim();
          }

          const skill = createSkillKnowledgeItem({
            name,
            description,
            body,
            source: "custom",
          });
          results.push(skill);
        } else {
          res.status(501).json({ error: "Knowledge import is not implemented in this branch state" });
          return;
        }
      }

      logger.info({ count: results.length, mode }, "Knowledge items imported via file upload");
      res.status(201).json({ imported: results.length, items: results });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
