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

async function POST(request) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return NextResponse.json({
      error: "resolver upload requires a writable filesystem runtime",
      guidance: persistence.guidance || "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use local Next.js development mode."
    }, { status: 409 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data with a file field" }, { status: 400 });
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

  if (!text.includes("registerSourceResolver")) {
    return NextResponse.json({
      error: "resolver file must call registerSourceResolver() — see lib/adapters/integrations/resolvers/README.md for the required shape"
    }, { status: 400 });
  }

  const rawName = typeof filenameOverride === "string" && filenameOverride.trim()
    ? filenameOverride.trim()
    : originalName;
  const filename = `${slugify(rawName)}.js`;

  const resolversDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/integrations/resolvers");
  const outPath = path.join(resolversDir, filename);

  if (path.dirname(outPath) !== resolversDir) {
    return NextResponse.json({ error: "invalid filename — path traversal not allowed" }, { status: 400 });
  }

  try {
    await fs.mkdir(resolversDir, { recursive: true });
    await fs.writeFile(outPath, text, "utf8");
  } catch (err) {
    return NextResponse.json({ error: `failed to write resolver file: ${err.message}` }, { status: 500 });
  }

  return NextResponse.json({
    saved: true,
    filename,
    path: `lib/adapters/integrations/resolvers/${filename}`,
    hint: "Run POST /api/workspace/test-source with integrationId to verify the resolver registers and fetchRecords works."
  }, { status: 201 });
}

export { POST };
