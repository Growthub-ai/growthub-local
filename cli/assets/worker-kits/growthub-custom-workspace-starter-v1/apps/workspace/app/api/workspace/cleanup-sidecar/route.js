/**
 * POST /api/workspace/cleanup-sidecar
 *
 * Prunes named keys from growthub.source-records.json after governed deletes.
 * Request: { keys: string[] }
 * Response: { ok: true, removed: string[] }
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describePersistenceMode } from "@/lib/workspace-config";

const SOURCE_RECORDS_FILENAME = "growthub.source-records.json";

function resolveSourceRecordsPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), SOURCE_RECORDS_FILENAME);
}

async function POST(request) {
  const persistence = describePersistenceMode();
  if (persistence.mode !== "filesystem" || !persistence.canSave) {
    return NextResponse.json({
      error: "sidecar cleanup requires a writable filesystem runtime",
      guidance: persistence.guidance || "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use local Next.js development mode."
    }, { status: 409 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const keys = Array.isArray(body?.keys)
    ? body.keys.map((key) => String(key || "").trim()).filter(Boolean)
    : [];
  if (!keys.length) {
    return NextResponse.json({ ok: true, removed: [] });
  }

  const recordsPath = resolveSourceRecordsPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  if (path.dirname(recordsPath) !== expectedDir) {
    return NextResponse.json({ error: `refused to write outside workspace cwd: ${recordsPath}` }, { status: 500 });
  }

  let all = {};
  try {
    const raw = await fs.readFile(recordsPath, "utf8");
    all = JSON.parse(raw);
  } catch {
    all = {};
  }

  const removed = [];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(all, key)) {
      delete all[key];
      removed.push(key);
    }
  }

  if (removed.length) {
    await fs.writeFile(recordsPath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  }

  return NextResponse.json({ ok: true, removed });
}

export { POST };
