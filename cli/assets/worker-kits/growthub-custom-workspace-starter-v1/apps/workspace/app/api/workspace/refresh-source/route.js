/**
 * POST /api/workspace/refresh-source
 *
 * Calls the registered resolver's `fetchRecords()` with the supplied binding,
 * then persists the resulting rows into the specified data model object.
 *
 * Fully composable — the route has no knowledge of any specific provider.
 * All provider logic lives in the resolver file.
 *
 * Request body:
 *   {
 *     integrationId: string,       // matches resolver.integrationId
 *     binding:       object,       // forwarded verbatim to resolver.fetchRecords
 *     objectId:      string | null // data model object to persist rows into
 *   }
 *
 * Response (success):
 *   {
 *     ok:        true,
 *     rowCount:  number,
 *     columns:   string[],
 *     objectId:  string | null,
 *     persisted: boolean,       // true when rows were written to growthub.config.json
 *     dataModel: object | null  // full updated dataModel (for local state sync)
 *   }
 *
 * Response (failure):
 *   { ok: false, reason: string, error: string }
 */

import { NextResponse } from "next/server";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { getSourceResolver } from "@/lib/adapters/integrations/source-resolver-registry";
import { readWorkspaceConfig, writeWorkspaceConfig, describePersistenceMode } from "@/lib/workspace-config";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid-json" }, { status: 400 });
  }

  const { integrationId, binding, objectId } = body || {};

  if (!integrationId) {
    return NextResponse.json({ ok: false, reason: "integrationId required" }, { status: 400 });
  }

  await loadAllResolvers();
  const resolver = getSourceResolver(integrationId);

  if (!resolver) {
    return NextResponse.json(
      { ok: false, reason: "no-resolver", integrationId },
      { status: 404 }
    );
  }

  let rows;
  try {
    rows = await resolver.fetchRecords({}, {}, binding || {});
    if (!Array.isArray(rows)) rows = [];
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "fetch-error", error: err.message || "Resolver threw" },
      { status: 500 }
    );
  }

  const columns = rows.length > 0
    ? Object.keys(rows[0])
    : (Array.isArray(binding?.columns) ? binding.columns : []);

  // Persist rows to the data model object when objectId is provided and FS writes are allowed
  const persistence = describePersistenceMode();
  let persisted = false;
  let dataModel = null;

  if (objectId && persistence.canSave) {
    try {
      const current = await readWorkspaceConfig();
      const wc = current.workspaceConfig || current;
      const existingObjects = Array.isArray(wc.dataModel?.objects) ? wc.dataModel.objects : [];

      const updatedObjects = existingObjects.map((obj) => {
        if (obj.id !== objectId) return obj;
        return {
          ...obj,
          columns: columns.length ? columns : obj.columns,
          rows,
          refreshedAt: new Date().toISOString(),
        };
      });

      // If objectId wasn't found in the list, nothing to update but don't error
      dataModel = { ...(wc.dataModel || {}), objects: updatedObjects };

      await writeWorkspaceConfig({ dataModel });
      persisted = true;
    } catch (err) {
      return NextResponse.json({
        ok: true,
        rowCount: rows.length,
        columns,
        objectId: objectId || null,
        persisted: false,
        persistError: err.message,
        dataModel: null,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    rowCount: rows.length,
    columns,
    objectId: objectId || null,
    persisted,
    dataModel,
  });
}

export { POST };
