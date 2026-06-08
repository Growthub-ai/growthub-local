import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { listWorkspaceDataModelTables } from "@/lib/workspace-data-model";
import { computeRowDeleteImpact } from "@/lib/workspace-lifecycle";

/**
 * POST /api/workspace/delete-impact
 *
 * Pre-delete impact preview for governed Data Model rows.
 * Body: { objectId: string, rowIndexes: number[] }
 */
async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const objectId = String(body?.objectId || "").trim();
  const rowIndexes = Array.isArray(body?.rowIndexes)
    ? body.rowIndexes.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0)
    : [];
  if (!objectId || !rowIndexes.length) {
    return NextResponse.json({ error: "objectId and rowIndexes are required" }, { status: 400 });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const tables = listWorkspaceDataModelTables(workspaceConfig);
  const table = tables.find((t) => t.objectId === objectId || t.id === objectId);
  if (!table) {
    return NextResponse.json({ error: `object "${objectId}" not found` }, { status: 404 });
  }

  const previews = rowIndexes.map((rowIndex) => ({
    rowIndex,
    ...computeRowDeleteImpact(workspaceConfig, table, rowIndex)
  }));

  const allImpacts = previews.flatMap((p) => p.impacts || []);
  const allSidecarKeys = [...new Set(previews.flatMap((p) => p.sidecarKeys || []))];

  return NextResponse.json({
    ok: true,
    objectId,
    previews,
    summary: {
      rowCount: rowIndexes.length,
      impactCount: allImpacts.length,
      sidecarKeyCount: allSidecarKeys.length,
      sidecarKeys: allSidecarKeys
    }
  });
}

export { POST };
