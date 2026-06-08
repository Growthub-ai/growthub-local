import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describePersistenceMode } from "@/lib/workspace-config";

const SOURCE_RECORDS_FILENAME = "growthub.source-records.json";

function resolveSourceRecordsPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), SOURCE_RECORDS_FILENAME);
}

/**
 * POST /api/workspace/cleanup-sidecar
 *
 * Prune named keys from growthub.source-records.json (filesystem mode only).
 * Body: { keys: string[], reason?: string }
 */
async function POST(request) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return NextResponse.json({
      error: "sidecar cleanup requires a writable filesystem runtime",
      guidance: persistence.guidance || "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use local Next.js development mode.",
    }, { status: 409 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const keys = Array.isArray(body?.keys)
    ? body.keys.map((k) => String(k || "").trim()).filter(Boolean)
    : [];
  if (!keys.length) {
    return NextResponse.json({ error: "keys must be a non-empty string array" }, { status: 400 });
  }

  const recordsPath = resolveSourceRecordsPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  if (path.dirname(recordsPath) !== expectedDir) {
    return NextResponse.json({ error: "refused to write outside workspace cwd" }, { status: 500 });
  }

  let all = {};
  try {
    const raw = await fs.readFile(recordsPath, "utf8");
    all = JSON.parse(raw);
  } catch {
    all = {};
  }

  const pruned = [];
  const missing = [];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(all, key)) {
      delete all[key];
      pruned.push(key);
    } else {
      missing.push(key);
    }
  }

  if (pruned.length) {
    await fs.writeFile(recordsPath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  }

  return NextResponse.json({
    ok: true,
    pruned,
    missing,
    reason: typeof body?.reason === "string" ? body.reason.trim() : "delete-cascade",
  });
}

export { POST };
