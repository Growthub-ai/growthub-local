/**
 * POST /api/workspace/helper/apply
 *
 * Governed mutation endpoint for workspace helper proposals.
 *
 * Takes accepted WorkspaceHelperProposal objects from a prior query response,
 * validates each against the PATCH allowlist + validateWorkspaceConfig, writes
 * the merged config, and persists a durable receipt per applied proposal.
 *
 * The apply step is always explicit and human-reviewed. The helper never
 * calls this route on its own — it is a separate governed action.
 *
 * Request body (WorkspaceHelperApplyRequest):
 *   {
 *     proposals: WorkspaceHelperProposal[],
 *     reviewedBy?: string,
 *     sessionId?: string,
 *   }
 *
 * Response (WorkspaceHelperApplyResponse):
 *   {
 *     ok: boolean,
 *     applied: WorkspaceHelperApplyReceipt[],
 *     skipped: { proposal, reason }[],
 *     workspaceConfig?: object,
 *     error?: string,
 *   }
 */

import { NextResponse } from "next/server";
import {
  readWorkspaceConfig,
  writeWorkspaceConfig,
  readWorkspaceSourceRecords,
  writeWorkspaceSourceRecords,
  describePersistenceMode,
} from "@/lib/workspace-config";
import {
  applyProposalToConfig,
  validateProposalForApply,
  buildApplyReceipt,
} from "@/lib/workspace-helper-apply";

const HELPER_APPLY_SOURCE_KEY = "helper:apply:receipts";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body?.proposals) || body.proposals.length === 0) {
    return NextResponse.json(
      { ok: false, error: "proposals must be a non-empty array" },
      { status: 400 }
    );
  }

  const reviewedBy = typeof body.reviewedBy === "string" ? body.reviewedBy.trim() : "user";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : null;
  const appliedAt = new Date().toISOString();

  let currentConfig;
  try {
    currentConfig = await readWorkspaceConfig();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || "failed to read workspace config" },
      { status: 500 }
    );
  }

  const applied = [];
  const skipped = [];
  let workingConfig = currentConfig;

  for (const proposal of body.proposals) {
    if (
      !proposal ||
      typeof proposal.type !== "string" ||
      typeof proposal.affectedField !== "string" ||
      !proposal.payload ||
      typeof proposal.payload !== "object"
    ) {
      skipped.push({ proposal, reason: "malformed proposal: missing type, affectedField, or payload" });
      continue;
    }

    // explain.object proposals are informational — no config write needed
    if (proposal.type === "explain.object") {
      applied.push(buildApplyReceipt(proposal, appliedAt, reviewedBy, sessionId));
      continue;
    }

    const validation = validateProposalForApply(proposal, workingConfig);
    if (!validation.ok) {
      skipped.push({ proposal, reason: validation.error || "failed validation" });
      continue;
    }

    try {
      workingConfig = applyProposalToConfig(workingConfig, proposal);
      applied.push(buildApplyReceipt(proposal, appliedAt, reviewedBy, sessionId));
    } catch (err) {
      skipped.push({ proposal, reason: err?.message || "apply threw" });
    }
  }

  // Only write if at least one non-explain proposal was applied
  const mutatingApplied = applied.filter((r) => r.type !== "explain.object");
  if (mutatingApplied.length > 0) {
    const patchFields = [...new Set(mutatingApplied.map((r) => r.affectedField))];
    const patch = {};
    for (const field of patchFields) {
      patch[field] = workingConfig[field];
    }

    try {
      const next = await writeWorkspaceConfig(patch);
      workingConfig = next;
    } catch (err) {
      if (err.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
        return NextResponse.json(
          {
            ok: false,
            error: "workspace config is read-only in this runtime",
            reason: err.message,
            guidance:
              err.guidance ||
              "Edit growthub.config.json locally, or set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime.",
          },
          { status: 409 }
        );
      }
      if (err.code === "INVALID_WORKSPACE_CONFIG") {
        return NextResponse.json({ ok: false, error: err.message, details: err.details }, { status: 400 });
      }
      return NextResponse.json(
        { ok: false, error: err?.message || "failed to write workspace config" },
        { status: 500 }
      );
    }
  }

  // Persist receipts to source-records for fine-tune loop seeding
  const persistence = describePersistenceMode();
  if (persistence.canSave && applied.length > 0) {
    try {
      const existing = await readWorkspaceSourceRecords(HELPER_APPLY_SOURCE_KEY);
      const priorRecords = Array.isArray(existing?.records) ? existing.records : [];
      const newRecords = applied.map((receipt) => ({
        ...receipt,
        sessionId: sessionId || null,
        reviewedBy,
      }));
      await writeWorkspaceSourceRecords(
        HELPER_APPLY_SOURCE_KEY,
        [...priorRecords, ...newRecords].slice(-200),
        { integrationId: HELPER_APPLY_SOURCE_KEY, fetchedAt: appliedAt }
      );
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({
    ok: true,
    applied,
    skipped,
    workspaceConfig: workingConfig,
  });
}

export { POST };
