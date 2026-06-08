/**
 * POST /api/workspace/cleanup-sidecar
 *
 * Roadmap Phase 1.4 / 2.6. Prunes orphaned `growthub.source-records.json`
 * buckets after a governed Data Model delete. The browser computes the impact
 * with `computeDeleteImpact()` (pure), confirms with the operator, applies the
 * config PATCH, then POSTs the orphaned `sourceIds` here for the optional
 * sidecar cleanup leg — the same persistence gate as register-resolver /
 * settings writes.
 *
 * Request:  { sourceIds: string[] }
 * Response: { ok, removed: string[], skipped: string[], persistence }
 *
 * Read-only / non-filesystem runtimes return 409 with guidance instead of a
 * dead end, matching writeWorkspaceApiWebhookSettings.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { describePersistenceMode } from "@/lib/workspace-config";

const SOURCE_RECORDS_FILENAME = "growthub.source-records.json";

function resolveSourceRecordsPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), SOURCE_RECORDS_FILENAME);
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const sourceIds = Array.isArray(body?.sourceIds)
    ? Array.from(new Set(body.sourceIds.map((id) => String(id || "").trim()).filter(Boolean)))
    : [];
  if (!sourceIds.length) {
    return NextResponse.json({ ok: false, error: "sourceIds must be a non-empty string array" }, { status: 400 });
  }

  const persistence = describePersistenceMode();
  if (persistence.mode !== "filesystem" || !persistence.canSave) {
    return NextResponse.json(
      {
        ok: false,
        error: "workspace sidecar is read-only in this runtime",
        reason: persistence.reason,
        guidance: persistence.guidance,
        persistence,
      },
      { status: 409 }
    );
  }

  const recordsPath = resolveSourceRecordsPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  if (path.dirname(recordsPath) !== expectedDir) {
    return NextResponse.json({ ok: false, error: "refused to write outside workspace cwd" }, { status: 500 });
  }

  let all = {};
  try {
    all = JSON.parse(await fs.readFile(recordsPath, "utf8"));
  } catch {
    all = {};
  }

  const removed = [];
  const skipped = [];
  for (const id of sourceIds) {
    if (Object.prototype.hasOwnProperty.call(all, id)) {
      delete all[id];
      removed.push(id);
    } else {
      skipped.push(id);
    }
  }

  if (removed.length) {
    await fs.writeFile(recordsPath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  }

  return NextResponse.json({ ok: true, removed, skipped, persistence });
}

export { POST };
