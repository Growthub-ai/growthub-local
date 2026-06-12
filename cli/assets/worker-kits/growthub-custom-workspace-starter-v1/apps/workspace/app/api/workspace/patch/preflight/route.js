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
  applyWorkspaceConfigPatch,
  describePersistenceMode,
  readWorkspaceConfig,
  validateWorkspaceConfig
} from "@/lib/workspace-config";
import {
  WORKSPACE_PATCH_ALLOWED_FIELDS,
  evaluateWorkspacePatchPolicy,
  repairPlanForViolations
} from "@/lib/workspace-patch-policy";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

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

  // Schema check uses writeWorkspaceConfig's EXACT merge step
  // (applyWorkspaceConfigPatch) — canvas patches merge over the current
  // canvas with layout/bindings preservation and null-deletes, never a
  // top-level replacement — so preflight can never disagree with the real
  // PATCH about the merged result. Skipped when the body is not a plain
  // object (policy already reports that).
  let schema = { ok: true, errors: [] };
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    const sanitized = {};
    for (const key of WORKSPACE_PATCH_ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) sanitized[key] = patch[key];
    }
    const merged = applyWorkspaceConfigPatch(currentConfig || {}, sanitized);
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
  const ok = policy.ok && schema.ok;
  const repairPlan = repairPlanForViolations(policy.violations);
  // The single next governed call, when derivable from the verdicts.
  let safeNextStep;
  if (ok) {
    safeNextStep = "PATCH /api/workspace with this exact body";
  } else if (policy.violations.some((v) => v.code === "live_workflow_field" || v.code === "live_publish_via_patch")) {
    safeNextStep =
      "Save the graph as a draft field, prove it with POST /api/workspace/sandbox-run {useDraft:true}, then POST /api/workspace/workflow/publish";
  } else if (repairPlan.length > 0) {
    safeNextStep = repairPlan[0];
  } else if (!schema.ok) {
    safeNextStep = "Fix the schema errors against apps/workspace/lib/workspace-schema.js, then preflight again";
  }

  if (!ok) {
    // Failed attempts are governance signal — visible in the cockpit stream.
    await appendOutcomeReceipt({
      kind: "patch-preflight",
      lane: "untrusted-direct",
      outcomeStatus: "blocked",
      changedFields: patch && typeof patch === "object" && !Array.isArray(patch) ? Object.keys(patch) : [],
      policyVerdict: { ok: policy.ok, violationCodes: policy.violations.map((v) => v.code) },
      schemaVerdict: { ok: schema.ok, errorCount: schema.errors.length },
      summary: `preflight blocked: ${[...policy.violations.map((v) => v.code), ...(schema.ok ? [] : ["schema"])].join(", ")}`,
      nextActions: repairPlan.length ? repairPlan : (safeNextStep ? [safeNextStep] : [])
    });
  }

  return NextResponse.json({
    ok,
    allowed: WORKSPACE_PATCH_ALLOWED_FIELDS,
    policy,
    schema,
    repairPlan,
    ...(safeNextStep ? { safeNextStep } : {}),
    persistence: {
      mode: persistence.mode,
      canSave: persistence.canSave,
      guidance: persistence.guidance
    }
  });
}

export { POST };
