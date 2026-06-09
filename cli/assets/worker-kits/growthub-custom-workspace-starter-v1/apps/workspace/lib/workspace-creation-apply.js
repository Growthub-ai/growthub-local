/**
 * Governed Creation Apply V1 — ordered apply with receipts.
 *
 * Applies creation proposals to config (PATCH allowlist) and resolver files
 * (filesystem gate). Secrets never enter config; env requirements only stamp
 * hasSecret metadata after Settings writes.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig,
  writeWorkspaceApiWebhookSettings,
} from "./workspace-config.js";
import { validateResolverTargetPath } from "./workspace-resolver-proposal.js";
import { findApiRegistryObject } from "./workspace-creation-proposals.js";

function ensureApiRegistryObject(workspaceConfig) {
  const existing = findApiRegistryObject(workspaceConfig);
  if (existing) return existing;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return {
    id: "api-registry",
    label: "API Registry",
    objectType: "api-registry",
    columns: ["Name", "integrationId", "baseUrl", "endpoint", "method", "authRef", "status", "testStatus", "lastTested"],
    rows: [],
  };
}

function upsertIntegration(workspaceConfig, integrationEntry) {
  const integrations = Array.isArray(workspaceConfig.integrations) ? [...workspaceConfig.integrations] : [];
  const idx = integrations.findIndex((e) => e?.endpointRef === integrationEntry.endpointRef);
  const nextEntry = { ...integrationEntry };
  if (idx >= 0) integrations[idx] = { ...integrations[idx], ...nextEntry };
  else integrations.push(nextEntry);
  return { ...workspaceConfig, integrations };
}

function applyApiRegistryRow(workspaceConfig, row) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? [...workspaceConfig.dataModel.objects] : [];
  const registry = ensureApiRegistryObject(workspaceConfig);
  const rows = Array.isArray(registry.rows) ? [...registry.rows] : [];
  const integrationId = String(row.integrationId || "").trim();
  const idx = rows.findIndex((r) => String(r?.integrationId || "").trim() === integrationId);
  const nextRow = { ...row, status: row.status || "draft" };
  if (idx >= 0) rows[idx] = { ...rows[idx], ...nextRow };
  else rows.push(nextRow);
  const nextRegistry = { ...registry, rows };
  const objectIdx = objects.findIndex((o) => o?.objectType === "api-registry");
  if (objectIdx >= 0) objects[objectIdx] = nextRegistry;
  else objects.push(nextRegistry);
  return { ...workspaceConfig, dataModel: { ...workspaceConfig.dataModel, objects } };
}

function applyDataSourceObject(workspaceConfig, object) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? [...workspaceConfig.dataModel.objects] : [];
  const idx = objects.findIndex((o) => o?.id === object.id);
  if (idx >= 0) objects[idx] = { ...objects[idx], ...object };
  else objects.push(object);
  return { ...workspaceConfig, dataModel: { ...workspaceConfig.dataModel, objects } };
}

function applySandboxRow(workspaceConfig, row) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? [...workspaceConfig.dataModel.objects] : [];
  let sandbox = objects.find((o) => o?.objectType === "sandbox-environment");
  if (!sandbox) {
    sandbox = {
      id: "sandbox-environments",
      label: "Sandbox Environments",
      objectType: "sandbox-environment",
      columns: ["Name", "runtime", "adapter", "runLocality", "lifecycleStatus", "envRefs"],
      rows: [],
    };
    objects.push(sandbox);
  }
  const rows = Array.isArray(sandbox.rows) ? [...sandbox.rows] : [];
  const name = String(row.Name || "").trim();
  const idx = rows.findIndex((r) => String(r?.Name || "").trim() === name);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
  else rows.push(row);
  const nextSandbox = { ...sandbox, rows };
  const objectIdx = objects.findIndex((o) => o?.objectType === "sandbox-environment");
  objects[objectIdx] = nextSandbox;
  return { ...workspaceConfig, dataModel: { ...workspaceConfig.dataModel, objects } };
}

async function writeResolverProposal(proposal) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    const error = new Error("resolver write requires a writable filesystem runtime");
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.guidance = persistence.guidance;
    throw error;
  }
  const target = validateResolverTargetPath(proposal.targetPath);
  if (!target.ok) {
    const error = new Error(target.error);
    error.code = "RESOLVER_PATH_REFUSED";
    throw error;
  }
  const outPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), target.path);
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "lib/adapters/integrations/resolvers");
  if (path.dirname(outPath) !== expectedDir) {
    const error = new Error("resolver path outside approved directory");
    error.code = "RESOLVER_PATH_REFUSED";
    throw error;
  }
  await fs.mkdir(expectedDir, { recursive: true });
  let existed = false;
  try {
    await fs.access(outPath);
    existed = true;
  } catch {
    existed = false;
  }
  await fs.writeFile(outPath, proposal.code, "utf8");
  return {
    saved: true,
    path: target.path,
    filename: target.filename,
    conflict: existed,
    rollback: existed ? "Review the previous resolver in git or restore from backup before retrying." : null,
  };
}

async function applyCreationProposals(proposals = [], options = {}) {
  const list = Array.isArray(proposals) ? proposals : [];
  let config = options.workspaceConfig || await readWorkspaceConfig();
  const applied = [];
  const skipped = [];
  const fileReceipts = [];
  const integrationRefs = [];

  for (const proposal of list) {
    if (!proposal || typeof proposal !== "object") {
      skipped.push({ type: "unknown", reason: "invalid proposal" });
      continue;
    }
    if (proposal.type === "creation.api-registry-row") {
      config = applyApiRegistryRow(config, proposal.payload.row);
      applied.push({ type: proposal.type, integrationId: proposal.payload.row.integrationId });
      continue;
    }
    if (proposal.type === "creation.env-requirement") {
      integrationRefs.push({
        kind: proposal.payload.kind || "api",
        endpointRef: proposal.payload.endpointRef,
        status: proposal.payload.status || "not-configured",
        hasSecret: proposal.payload.hasSecret === true,
      });
      applied.push({ type: proposal.type, endpointRef: proposal.payload.endpointRef });
      continue;
    }
    if (proposal.type === "creation.data-source-row") {
      config = applyDataSourceObject(config, proposal.payload.object);
      applied.push({ type: proposal.type, sourceId: proposal.payload.object.sourceId });
      continue;
    }
    if (proposal.type === "creation.sandbox-workflow-row") {
      config = applySandboxRow(config, proposal.payload.row);
      applied.push({ type: proposal.type, name: proposal.payload.row.Name });
      continue;
    }
    if (proposal.type === "creation.resolver-file") {
      const receipt = await writeResolverProposal(proposal.payload);
      fileReceipts.push(receipt);
      applied.push({ type: proposal.type, path: receipt.path, conflict: receipt.conflict });
      continue;
    }
    skipped.push({ type: proposal.type || "unknown", reason: "unsupported proposal type" });
  }

  if (options.dryRun) {
    return { dryRun: true, applied, skipped, fileReceipts, workspaceConfig: config };
  }

  if (integrationRefs.length) {
    const existing = Array.isArray(config.integrations)
      ? config.integrations.filter((item) => item?.sourceType === "custom-api-webhooks")
      : [];
    await writeWorkspaceApiWebhookSettings({
      refs: [...existing, ...integrationRefs],
    });
    config = await readWorkspaceConfig();
  }

  await writeWorkspaceConfig({ dataModel: config.dataModel });
  return {
    applied,
    skipped,
    fileReceipts,
    workspaceConfig: config,
    receipt: {
      kind: "growthub-creation-apply-receipt-v1",
      appliedAt: new Date().toISOString(),
      applied,
      skipped,
      fileReceipts,
    },
  };
}

export {
  applyCreationProposals,
  applyApiRegistryRow,
  writeResolverProposal,
};
