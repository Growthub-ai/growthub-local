/**
 * POST /api/workspace/register-resolver
 *
 * Accepts a `.js` resolver file upload and saves it to
 * `lib/adapters/integrations/resolvers/<filename>.js`.
 *
 * Only available in filesystem mode (local development with
 * WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or NODE_ENV=development).
 * In read-only runtimes this returns 409 with guidance.
 *
 * The uploaded file must:
 *   - be a valid UTF-8 text JavaScript module
 *   - call registerSourceResolver() at module level
 *   - have a .js extension
 *
 * After upload, call POST /api/workspace/test-source to verify the resolver
 * registers correctly and fetchRecords returns well-formed records.
 *
 * Request: multipart/form-data
 *   file     — the .js resolver file
 *   filename — optional override for the saved filename (slug.js)
 *
 * Response:
 *   201 { saved: true, filename, path }
 *   400 { error }
 *   409 { error, guidance }
 *   500 { error }
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describePersistenceMode } from "@/lib/workspace-config";
import { validateResolverTargetPath } from "@/lib/workspace-resolver-proposal";

const MAX_RESOLVER_SIZE = 256 * 1024; // 256 KB — resolvers should be small

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\.js$/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "resolver";
}

async function writeResolverFile({ text, filename }) {
  if (!text.includes("registerSourceResolver")) {
    return {
      status: 400,
      body: {
        error: "resolver file must call registerSourceResolver() — see lib/adapters/integrations/resolvers/README.md for the required shape",
      },
    };
  }
  const target = validateResolverTargetPath(`lib/adapters/integrations/resolvers/${filename}`);
  if (!target.ok) {
    return { status: 400, body: { error: target.error } };
  }
  const resolversDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/integrations/resolvers");
  const outPath = path.join(resolversDir, target.filename);
  if (path.dirname(outPath) !== resolversDir) {
    return { status: 400, body: { error: "invalid filename — path traversal not allowed" } };
  }
  let conflict = false;
  try {
    await fs.access(outPath);
    conflict = true;
  } catch {
    conflict = false;
  }
  try {
    await fs.mkdir(resolversDir, { recursive: true });
    await fs.writeFile(outPath, text, "utf8");
  } catch (err) {
    return { status: 500, body: { error: `failed to write resolver file: ${err.message}` } };
  }
  return {
    status: 201,
    body: {
      saved: true,
      filename: target.filename,
      path: target.path,
      conflict,
      hint: "Run POST /api/workspace/test-source with integrationId to verify the resolver registers and fetchRecords works.",
      rollback: conflict ? "Review git history or restore the previous resolver before retrying." : null,
    },
  };
}

async function POST(request) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return NextResponse.json({
      error: "resolver upload requires a writable filesystem runtime",
      guidance: persistence.guidance || "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use local Next.js development mode."
    }, { status: 409 });
  }

  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const text = typeof body?.code === "string" ? body.code : "";
    const rawName = typeof body?.filename === "string" && body.filename.trim() ? body.filename.trim() : "resolver.js";
    if (!text) return NextResponse.json({ error: "code is required for JSON resolver apply" }, { status: 400 });
    if (text.length > MAX_RESOLVER_SIZE) {
      return NextResponse.json({ error: `resolver file must be smaller than ${MAX_RESOLVER_SIZE / 1024} KB` }, { status: 400 });
    }
    const filename = `${slugify(rawName)}.js`;
    const result = await writeResolverFile({ text, filename });
    return NextResponse.json(result.body, { status: result.status });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data with a file field or JSON body with code" }, { status: 400 });
  }

  const file = formData.get("file");
  const filenameOverride = formData.get("filename");

  if (!file || typeof file.text !== "function") {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }

  const originalName = typeof file.name === "string" ? file.name : "resolver.js";
  if (!originalName.endsWith(".js")) {
    return NextResponse.json({ error: "resolver file must have a .js extension" }, { status: 400 });
  }

  if (file.size > MAX_RESOLVER_SIZE) {
    return NextResponse.json({ error: `resolver file must be smaller than ${MAX_RESOLVER_SIZE / 1024} KB` }, { status: 400 });
  }

  let text;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json({ error: "could not read uploaded file" }, { status: 400 });
  }

  const rawName = typeof filenameOverride === "string" && filenameOverride.trim()
    ? filenameOverride.trim()
    : originalName;
  const filename = `${slugify(rawName)}.js`;
  const result = await writeResolverFile({ text, filename });
  return NextResponse.json(result.body, { status: result.status });
}

export { POST };
