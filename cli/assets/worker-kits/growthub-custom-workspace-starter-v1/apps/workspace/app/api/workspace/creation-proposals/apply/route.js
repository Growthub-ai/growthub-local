/**
 * POST /api/workspace/creation-proposals/apply
 *
 * Apply governed creation proposals with receipts. Config rows go through
 * PATCH-equivalent writeWorkspaceConfig; resolver files through the filesystem
 * gate. Never persists secret values.
 *
 * Request: { bundle, proposals?: Proposal[], writeResolver?: boolean }
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig,
} from "@/lib/workspace-config";
import {
  buildApplyReceipt,
  validateResolverTargetPath,
} from "@/lib/workspace-creation-proposals";
import { createTypedBusinessObject } from "@/lib/workspace-data-model";

const RESOLVER_ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/integrations/resolvers");

function ensureObjectType(config, objectType, label) {
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  const existing = objects.find((o) => o?.objectType === objectType);
  if (existing) return config;
  return createTypedBusinessObject(config, { name: label, objectType });
}

function appendRowToObjectType(config, objectType, row, label) {
  let next = ensureObjectType(config, objectType, label);
  const objects = Array.isArray(next?.dataModel?.objects) ? next.dataModel.objects : [];
  return {
    ...next,
    dataModel: {
      ...next.dataModel,
      objects: objects.map((object) => {
        if (object?.objectType !== objectType) return object;
        const rows = Array.isArray(object.rows) ? object.rows : [];
        return { ...object, rows: [...rows, row] };
      }),
    },
  };
}

async function writeResolverProposal(proposal) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return { ok: false, error: "read-only runtime", guidance: persistence.guidance };
  }
  const targetPath = proposal?.payload?.targetPath;
  const check = validateResolverTargetPath(targetPath);
  if (!check.ok) return { ok: false, error: check.error };
  const outPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), check.path);
  if (path.dirname(outPath) !== RESOLVER_ROOT) {
    return { ok: false, error: "resolver path outside approved directory" };
  }
  try {
    await fs.mkdir(RESOLVER_ROOT, { recursive: true });
    await fs.writeFile(outPath, proposal.payload.code, "utf8");
    return { ok: true, path: check.path, filename: proposal.payload.filename };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const proposals = Array.isArray(body?.proposals)
    ? body.proposals
    : (Array.isArray(body?.bundle?.proposals) ? body.bundle.proposals : []);
  if (!proposals.length) {
    return NextResponse.json({ ok: false, error: "no proposals to apply" }, { status: 400 });
  }

  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return NextResponse.json({
      ok: false,
      error: "writable runtime required to apply creation proposals",
      guidance: persistence.guidance,
    }, { status: 409 });
  }

  let config = await readWorkspaceConfig();
  const applied = [];
  const skipped = [];
  const warnings = [];

  for (const proposal of proposals) {
    const type = proposal?.type;
    if (type === "creation.api-registry-row") {
      const row = proposal?.payload?.row;
      if (!row) { skipped.push({ type, reason: "missing row" }); continue; }
      config = appendRowToObjectType(config, "api-registry", row, "API Registry");
      applied.push({ type, integrationId: row.integrationId, stateKind: "portable-config" });
      continue;
    }
    if (type === "creation.data-source-row") {
      const row = proposal?.payload?.row;
      if (!row) { skipped.push({ type, reason: "missing row" }); continue; }
      config = appendRowToObjectType(config, "data-source", row, "Data Sources");
      applied.push({ type, sourceId: row.sourceId, stateKind: "portable-config" });
      continue;
    }
    if (type === "creation.sandbox-workflow-row") {
      const row = proposal?.payload?.row;
      if (!row) { skipped.push({ type, reason: "missing row" }); continue; }
      config = appendRowToObjectType(config, "sandbox-environment", row, "Workflows");
      applied.push({ type, name: row.Name, stateKind: "portable-config" });
      continue;
    }
    if (type === "creation.resolver-file") {
      if (body?.writeResolver === false) {
        skipped.push({ type, reason: "writeResolver=false" });
        continue;
      }
      const result = await writeResolverProposal(proposal);
      if (result.ok) {
        applied.push({ type, path: result.path, stateKind: "server-file" });
      } else {
        warnings.push(`resolver write failed: ${result.error}`);
        skipped.push({ type, reason: result.error });
      }
      continue;
    }
    skipped.push({ type, reason: "unknown proposal type" });
  }

  if (applied.some((a) => a.stateKind === "portable-config")) {
    await writeWorkspaceConfig({ dataModel: config.dataModel });
  }

  const receipt = buildApplyReceipt(applied, skipped, warnings);
  return NextResponse.json({
    ok: applied.length > 0,
    applied,
    skipped,
    warnings,
    receipt,
    activationReady: warnings.length === 0 && !skipped.some((s) => s.type === "creation.resolver-file"),
  });
}

export { POST };
