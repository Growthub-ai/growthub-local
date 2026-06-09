/**
 * POST /api/workspace/creation-proposal
 *
 * Build, validate, or apply governed creation proposal bundles.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  readWorkspaceConfig,
  writeWorkspaceConfig,
  readWorkspaceSourceRecords,
  writeWorkspaceSourceRecords,
  describePersistenceMode,
} from "@/lib/workspace-config";
import {
  buildCreationProposalBundle,
  hydrateCreationProposalsForConfig,
  hydrateBundleForConfig,
  validateCreationProposalBundle,
  validateResolverTargetPath,
} from "@/lib/workspace-creation-proposals";
import { applyProposalToConfig, validateProposalForApply, buildApplyReceipt } from "@/lib/workspace-helper-apply";

const CREATION_APPLY_SOURCE_KEY = "creation:apply:receipts";

async function writeResolverProposal(proposal) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    const error = new Error(persistence.reason || "read-only runtime");
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.guidance = persistence.guidance;
    throw error;
  }
  const check = validateResolverTargetPath(proposal.payload?.targetPath);
  if (!check.valid) {
    const error = new Error(check.error);
    error.code = "INVALID_RESOLVER_PATH";
    throw error;
  }
  const outPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), check.normalized);
  const resolversDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/integrations/resolvers");
  if (path.dirname(outPath) !== resolversDir) {
    const error = new Error("resolver path outside approved directory");
    error.code = "INVALID_RESOLVER_PATH";
    throw error;
  }
  await fs.mkdir(resolversDir, { recursive: true });
  await fs.writeFile(outPath, String(proposal.payload?.code || ""), "utf8");
  return {
    kind: "growthub-resolver-write-receipt-v1",
    targetPath: check.normalized,
    filename: proposal.payload?.filename,
    linkedRegistryId: proposal.payload?.linkedRegistryId || null,
  };
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const action = String(body?.action || "build").trim();
  const workspaceConfig = await readWorkspaceConfig();

  if (action === "build") {
    const bundle = hydrateCreationProposalsForConfig(workspaceConfig, body?.draft || {});
    return NextResponse.json({ ok: true, bundle });
  }

  if (action === "validate") {
    const bundle = body?.bundle
      ? hydrateBundleForConfig(workspaceConfig, body.bundle)
      : hydrateCreationProposalsForConfig(workspaceConfig, body?.draft || {});
    const result = validateCreationProposalBundle(bundle);
    return NextResponse.json({ ok: result.valid, bundle, errors: result.errors || [] });
  }

  if (action === "apply") {
    const bundle = body?.bundle
      ? hydrateBundleForConfig(workspaceConfig, body.bundle)
      : hydrateCreationProposalsForConfig(workspaceConfig, body?.draft || {});
    const validation = validateCreationProposalBundle(bundle);
    if (!validation.valid) {
      return NextResponse.json({ ok: false, errors: validation.errors }, { status: 400 });
    }

    const applied = [];
    const skipped = [];
    const fileReceipts = [];
    let workingConfig = workspaceConfig;
    const appliedAt = new Date().toISOString();

    for (const proposal of bundle.proposals || []) {
      if (proposal.type === "resolver.file.write") {
        try {
          const receipt = await writeResolverProposal(proposal);
          fileReceipts.push(receipt);
          applied.push({ type: proposal.type, receipt });
        } catch (error) {
          const status = error.code === "WORKSPACE_PERSISTENCE_READ_ONLY" ? 409 : 400;
          return NextResponse.json({
            ok: false,
            error: error.message,
            guidance: error.guidance,
            partiallyApplied: applied,
          }, { status });
        }
        continue;
      }

      const applyCheck = validateProposalForApply(proposal, workingConfig);
      if (!applyCheck.ok) {
        skipped.push({ proposal, reason: applyCheck.error || "validation failed" });
        continue;
      }
      try {
        workingConfig = applyProposalToConfig(workingConfig, proposal);
        applied.push(buildApplyReceipt(proposal, appliedAt));
      } catch (error) {
        skipped.push({ proposal, reason: error.message || "apply failed" });
      }
    }

    if (applied.some((a) => a.affectedField)) {
      await writeWorkspaceConfig({ dataModel: workingConfig.dataModel });
    }

    try {
      const sidecar = await readWorkspaceSourceRecords();
      const prior = Array.isArray(sidecar[CREATION_APPLY_SOURCE_KEY]?.records)
        ? sidecar[CREATION_APPLY_SOURCE_KEY].records
        : [];
      await writeWorkspaceSourceRecords(CREATION_APPLY_SOURCE_KEY, [
        {
          appliedAt,
          businessGoal: bundle.businessGoal,
          applied,
          skipped,
          fileReceipts,
        },
        ...prior,
      ].slice(0, 50), { recordCount: Math.min(50, prior.length + 1) });
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      ok: true,
      applied,
      skipped,
      fileReceipts,
      workspaceConfig: workingConfig,
    });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}

export { POST };
