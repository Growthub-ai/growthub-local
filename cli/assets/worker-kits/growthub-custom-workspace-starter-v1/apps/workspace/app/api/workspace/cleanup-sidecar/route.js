/**
 * POST /api/workspace/cleanup-sidecar
 *
 * Roadmap Phase 1.4 / 2.6. Prunes orphaned `growthub.source-records.json`
 * buckets after a governed Data Model delete. The browser computes the impact
 * with `computeDeleteImpact()` (pure), confirms with the operator, applies the
 * config delete (durably) and only THEN POSTs the orphaned `sourceIds` here.
 *
 * Request:  { sourceIds: string[] }
 * Response: { ok, removed: string[], skipped: string[], persistence }
 *
 * Read-only / non-filesystem runtimes return 409 with guidance. The handler is
 * an inline `export async function POST` and returns a NextResponse in every
 * branch (verified against the exported Next app).
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describePersistenceMode } from "@/lib/workspace-config";

export async function POST(request) {
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

  try {
    const cwd = process.cwd();
    const recordsPath = path.resolve(cwd, "growthub.source-records.json");
    // Refuse to touch anything outside the workspace cwd.
    if (path.dirname(recordsPath) !== path.resolve(cwd)) {
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
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "sidecar cleanup failed" }, { status: 500 });
  }
}
