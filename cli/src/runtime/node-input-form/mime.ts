/**
 * Node Input Form — MIME + extension helpers.
 *
 * A deliberately small, dependency-free MIME table tuned for the file
 * categories the CMS capability registry actually consumes: images,
 * video, audio, documents, data, archives. Extend by adding rows.
 */

import fs from "node:fs";
import path from "node:path";

export const MIME_TABLE: Readonly<Record<string, string>> = {
  // image
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".avif": "image/avif",
  ".bmp":  "image/bmp",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  // video
  ".mp4":  "video/mp4",
  ".m4v":  "video/x-m4v",
  ".mov":  "video/quicktime",
  ".webm": "video/webm",
  ".mkv":  "video/x-matroska",
  ".avi":  "video/x-msvideo",
  ".mpeg": "video/mpeg",
  ".mpg":  "video/mpeg",
  // audio
  ".mp3":  "audio/mpeg",
  ".wav":  "audio/wav",
  ".ogg":  "audio/ogg",
  ".flac": "audio/flac",
  ".m4a":  "audio/mp4",
  ".aac":  "audio/aac",
  // documents
  ".pdf":  "application/pdf",
  ".txt":  "text/plain",
  ".md":   "text/markdown",
  ".json": "application/json",
  ".csv":  "text/csv",
  ".xml":  "application/xml",
  ".html": "text/html",
  ".htm":  "text/html",
  // archives
  ".zip":  "application/zip",
  ".tar":  "application/x-tar",
  ".gz":   "application/gzip",
  ".tgz":  "application/gzip",
  ".7z":   "application/x-7z-compressed",
};

export const MEDIA_CATEGORIES = {
  image: new Set<string>([
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
    "image/avif", "image/bmp", "image/tiff", "image/heic",
  ]),
  video: new Set<string>([
    "video/mp4", "video/x-m4v", "video/quicktime", "video/webm",
    "video/x-matroska", "video/x-msvideo", "video/mpeg",
  ]),
  audio: new Set<string>([
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4", "audio/aac",
  ]),
  document: new Set<string>([
    "application/pdf", "text/plain", "text/markdown",
    "application/json", "text/csv", "application/xml", "text/html",
  ]),
  archive: new Set<string>([
    "application/zip", "application/x-tar", "application/gzip",
    "application/x-7z-compressed",
  ]),
} as const;

export type MediaCategory = keyof typeof MEDIA_CATEGORIES | "binary";

export function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TABLE[ext] ?? "application/octet-stream";
}

export function categorizeMime(mime: string): MediaCategory {
  for (const [category, set] of Object.entries(MEDIA_CATEGORIES)) {
    if (set.has(mime)) return category as MediaCategory;
  }
  return "binary";
}

export interface LocalFileInfo {
  path: string;
  absolutePath: string;
  mime: string;
  category: MediaCategory;
  sizeBytes: number;
  exists: boolean;
  isFile: boolean;
  readable: boolean;
}

export function describeLocalFile(inputPath: string): LocalFileInfo {
  const absolutePath = path.resolve(expandHome(inputPath));
  const mime = mimeFromPath(absolutePath);
  const category = categorizeMime(mime);

  if (!fs.existsSync(absolutePath)) {
    return {
      path: inputPath,
      absolutePath,
      mime,
      category,
      sizeBytes: 0,
      exists: false,
      isFile: false,
      readable: false,
    };
  }

  let isFile = false;
  let sizeBytes = 0;
  let readable = false;
  try {
    const stat = fs.statSync(absolutePath);
    isFile = stat.isFile();
    sizeBytes = stat.size;
    try {
      fs.accessSync(absolutePath, fs.constants.R_OK);
      readable = true;
    } catch {
      readable = false;
    }
  } catch {
    isFile = false;
  }

  return {
    path: inputPath,
    absolutePath,
    mime,
    category,
    sizeBytes,
    exists: true,
    isFile,
    readable,
  };
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function expandHome(value: string): string {
  if (!value) return value;
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "", value.slice(2));
  return value;
}
