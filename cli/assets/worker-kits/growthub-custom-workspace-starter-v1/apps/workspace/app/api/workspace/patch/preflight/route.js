/**
 * POST /api/workspace/patch/preflight
 *
 * Dry-run for `PATCH /api/workspace`. Takes the exact body you intend to
 * PATCH and returns the structured result of every gate the real PATCH will
 * apply — allowlist + mutation policy (workspace-patch-policy.js) + full
 * schema validation of the merged config (workspace-schema.js) — without
 * ever writing.
 *
 * Always responds 200; `ok` is the verdict. Agents should preflight any
 * non-trivial patch (especially dataModel mutations) and fix every reason
 * before issuing the real PATCH.
 *
 * Response:
 *   {
 *     ok: boolean,
 *     allowed: string[],            // the permanent PATCH allowlist
 *     policy:  { ok, violations: [{ code, path, message }] },
 *     schema:  { ok, errors: string[] },
 *     persistence: { mode, canSave, guidance }   // would the write even land?
 *   }
 */

import { NextResponse } from "next/server";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  validateWorkspaceConfig
} from "@/lib/workspace-config";
import {
  WORKSPACE_PATCH_ALLOWED_FIELDS,
  evaluateWorkspacePatchPolicy
} from "@/lib/workspace-patch-policy";

async function POST(request) {
  let patch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({
      ok: false,
      allowed: WORKSPACE_PATCH_ALLOWED_FIELDS,
      policy: { ok: false, violations: [{ code: "invalid_body", path: "", message: "invalid json body" }] },
      schema: { ok: false, errors: [] },
      persistence: null
    });
  }

  let currentConfig = null;
  try {
    currentConfig = await readWorkspaceConfig();
  } catch {
    currentConfig = null;
  }

  const policy = evaluateWorkspacePatchPolicy(currentConfig, patch);

  // Schema check mirrors writeWorkspaceConfig: merge allowlisted keys over
  // the current config, then validate the merged result. Skipped when the
  // body is not a plain object (policy already reports that).
  let schema = { ok: true, errors: [] };
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    const merged = { ...(currentConfig || {}) };
    for (const key of WORKSPACE_PATCH_ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) merged[key] = patch[key];
    }
    try {
      validateWorkspaceConfig({
        dashboards: merged.dashboards,
        widgetTypes: merged.widgetTypes,
        canvas: merged.canvas,
        dataModel: merged.dataModel
      });
    } catch (error) {
      schema = {
        ok: false,
        errors: Array.isArray(error?.details) ? error.details : [error?.message || "invalid workspace config"]
      };
    }
  } else {
    schema = { ok: false, errors: ["patch must be a plain object"] };
  }

  const persistence = describePersistenceMode();
  return NextResponse.json({
    ok: policy.ok && schema.ok,
    allowed: WORKSPACE_PATCH_ALLOWED_FIELDS,
    policy,
    schema,
    persistence: {
      mode: persistence.mode,
      canSave: persistence.canSave,
      guidance: persistence.guidance
    }
  });
}

export { POST };
