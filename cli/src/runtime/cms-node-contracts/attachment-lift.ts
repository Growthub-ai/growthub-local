/**
 * Attachment Lift
 *
 * Resolves `UrlOrFileField` / `FileField` bindings. When a binding value
 * points at a local file, we construct a `NodeInputAttachment` record the
 * hosted-execution-client can upload before dispatch; the URL replacement
 * is the caller's responsibility so this module stays transport-free.
 *
 * Inputs that are already URLs pass through untouched.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  NodeInputAttachment,
  NodeInputSchema,
  NodeInputField,
} from "@growthub/api-contract";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^data:/i.test(value);
}

function isFileField(field: NodeInputField): boolean {
  return field.fieldType === "file" || field.fieldType === "url-or-file";
}

function buildAttachment(absolutePath: string): NodeInputAttachment | null {
  if (!fs.existsSync(absolutePath)) return null;
  const stats = fs.statSync(absolutePath);
  if (!stats.isFile()) return null;
  const ext = path.extname(absolutePath).toLowerCase();
  return {
    kind: "file",
    absolutePath,
    mediaType: MIME_BY_EXT[ext],
    sizeBytes: stats.size,
  };
}

export interface LiftedAttachments {
  /** Map of field key → local attachment awaiting upload. */
  attachments: Map<string, NodeInputAttachment>;
  /** Bindings with local paths resolved to absolute paths. */
  bindings: Record<string, unknown>;
}

export function liftAttachments(
  schema: NodeInputSchema,
  bindings: Record<string, unknown>,
  cwd: string = process.cwd(),
): LiftedAttachments {
  const out: Record<string, unknown> = { ...bindings };
  const attachments = new Map<string, NodeInputAttachment>();

  for (const field of schema.fields) {
    if (!isFileField(field)) continue;
    const value = out[field.key];
    if (typeof value !== "string" || value.length === 0) continue;
    if (isUrlLike(value)) continue;

    const absolutePath = path.isAbsolute(value) ? value : path.resolve(cwd, value);
    const attachment = buildAttachment(absolutePath);
    if (!attachment) continue;
    out[field.key] = absolutePath;
    attachments.set(field.key, attachment);
  }

  return { attachments, bindings: out };
}
