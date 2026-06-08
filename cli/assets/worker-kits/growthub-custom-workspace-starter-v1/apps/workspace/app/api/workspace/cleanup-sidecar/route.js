import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  describePersistenceMode,
  readWorkspaceSourceRecords,
  resolveWorkspaceConfigPath
} from "@/lib/workspace-config";
import { pruneSourceRecordKeys } from "@/lib/workspace-lifecycle";

const SOURCE_RECORDS_FILENAME = "growthub.source-records.json";

function resolveSourceRecordsPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), SOURCE_RECORDS_FILENAME);
}

/**
 * POST /api/workspace/cleanup-sidecar
 *
 * Prune named keys from growthub.source-records.json after governed delete.
 * Body: { keys: string[] }
 */
async function POST(request) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return NextResponse.json({
      error: "sidecar cleanup requires a writable filesystem runtime",
      guidance: persistence.guidance
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
    return NextResponse.json({ ok: true, pruned: [], message: "no keys to prune" });
  }

  const all = await readWorkspaceSourceRecords();
  const pruned = keys.filter((key) => all && typeof all === "object" && Object.prototype.hasOwnProperty.call(all, key));
  const next = pruneSourceRecordKeys(all || {}, keys);

  const recordsPath = resolveSourceRecordsPath();
  const expectedDir = path.dirname(resolveWorkspaceConfigPath());
  if (path.dirname(recordsPath) !== expectedDir) {
    return NextResponse.json({ error: "refused to write outside workspace cwd" }, { status: 500 });
  }

  try {
    await fs.writeFile(recordsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch (err) {
    return NextResponse.json({ error: err.message || "failed to write source records" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    pruned,
    receipt: {
      at: new Date().toISOString(),
      action: "cleanup-sidecar",
      keys: pruned
    }
  });
}

export { POST };
