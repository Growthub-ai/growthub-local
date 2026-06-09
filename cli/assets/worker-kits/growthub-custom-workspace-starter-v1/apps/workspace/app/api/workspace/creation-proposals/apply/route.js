/**
 * POST /api/workspace/creation-proposals/apply
 *
 * Validates and applies a creation proposal bundle:
 *   1. durable dataModel PATCH (API registry, data source, sandbox rows)
 *   2. optional resolver file write (filesystem gate)
 *
 * Returns receipts — never secret values.
 */

import { NextResponse } from "next/server";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig,
} from "@/lib/workspace-config";
import { applyCreationBundle } from "@/lib/workspace-creation-apply";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const bundle = body?.bundle;
  if (!bundle || bundle.kind !== "growthub-creation-proposal-bundle-v1") {
    return NextResponse.json({ ok: false, error: "bundle must be growthub-creation-proposal-bundle-v1" }, { status: 400 });
  }

  const persistence = describePersistenceMode();
  const workspaceConfig = await readWorkspaceConfig();
  const configLeg = await applyCreationBundle(workspaceConfig, bundle, { skipFileWrites: true });

  if (!configLeg.applied.length) {
    return NextResponse.json(
      {
        ok: false,
        errors: configLeg.errors || ["nothing applied"],
        skipped: configLeg.skipped,
        persistence,
      },
      { status: 400 }
    );
  }

  try {
    const next = await writeWorkspaceConfig({ dataModel: configLeg.config.dataModel });
    const fileLeg = await applyCreationBundle(next, bundle, {
      filesOnly: true,
      canWrite: persistence.canSave === true,
    });
    const applied = [...configLeg.applied, ...fileLeg.applied];
    const skipped = [...configLeg.skipped, ...fileLeg.skipped];
    return NextResponse.json({
      ok: skipped.length === 0,
      partial: applied.length > 0 && skipped.length > 0,
      applied,
      skipped,
      workspaceConfig: next,
      persistence,
      activationNote: skipped.length
        ? "Some legs did not apply — activation remains blocked until resolved."
        : "Config changes saved. Test API and verify env resolution before marking ready.",
    });
  } catch (error) {
    if (error.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
      return NextResponse.json(
        {
          ok: false,
          error: "workspace config is read-only in this runtime",
          reason: error.message,
          guidance: error.guidance,
          applied: result.applied,
          skipped: result.skipped,
          persistence,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message || "apply failed" }, { status: 500 });
  }
}

export { POST };
