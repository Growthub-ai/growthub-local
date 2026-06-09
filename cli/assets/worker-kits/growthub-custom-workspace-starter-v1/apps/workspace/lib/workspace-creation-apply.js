/**
 * Governed Creation Apply V1 — validates and applies creation proposal bundles.
 *
 * Ordering: config PATCH legs are durable before optional file writes report
 * receipts. Partial apply surfaces skipped legs with reasons — never fake ready.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { validateWorkspaceConfig } from "./workspace-schema.js";
import { validateCreationBundle } from "./workspace-creation-proposals.js";
import { validateResolverTargetPath } from "./workspace-resolver-proposal.js";
import { OBJECT_TYPE_PRESETS } from "./workspace-data-model.js";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findOrCreateObject(dataModel, objectType, preferredId) {
  const objects = Array.isArray(dataModel?.objects) ? [...dataModel.objects] : [];
  const id = String(preferredId || "").trim();
  let index = objects.findIndex((o) => (id && o?.id === id) || o?.objectType === objectType);
  if (index === -1) {
    const preset = OBJECT_TYPE_PRESETS[objectType] || OBJECT_TYPE_PRESETS.custom;
    objects.push({
      id: id || objectType,
      label: preset.label || objectType,
      objectType,
      columns: [...(preset.columns || [])],
      rows: [],
      relations: preset.relations ? preset.relations.map((r) => ({ ...r })) : [],
      binding: { mode: "manual", source: "Data Model" },
    });
    index = objects.length - 1;
  }
  return { objects, index };
}

function mergeRowProposal(workspaceConfig, proposal) {
  const payload = proposal?.payload || {};
  const row = payload.row;
  const objectType = proposal.objectType || payload.objectType;
  if (!isPlainObject(row) || !objectType) {
    return { config: workspaceConfig, applied: false, reason: "invalid row proposal" };
  }
  const dataModel = isPlainObject(workspaceConfig.dataModel) ? { ...workspaceConfig.dataModel } : {};
  const { objects, index } = findOrCreateObject(dataModel, objectType, payload.objectId);
  const object = { ...objects[index] };
  const rows = Array.isArray(object.rows) ? [...object.rows] : [];
  const rowId = String(row.id || "").trim();
  const existingIndex = rows.findIndex((r) => String(r?.id || "").trim() === rowId);
  if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...row };
  else rows.push(row);
  object.rows = rows;
  objects[index] = object;
  return {
    config: { ...workspaceConfig, dataModel: { ...dataModel, objects } },
    applied: true,
    objectId: object.id,
    rowId: rowId || row.integrationId || row.Name,
  };
}

async function writeResolverProposal(resolverPayload, { cwd = process.cwd(), canWrite = true } = {}) {
  const check = validateResolverTargetPath(resolverPayload?.relativePath, {
    integrationId: resolverPayload?.integrationId,
  });
  if (!check.ok) return { applied: false, reason: check.errors.join("; ") };
  if (!canWrite) return { applied: false, reason: "read-only runtime", guidance: "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true" };

  const outPath = path.resolve(/*turbopackIgnore: true*/ cwd, check.relativePath);
  const expectedRoot = path.resolve(/*turbopackIgnore: true*/ cwd, "lib/adapters/integrations/resolvers");
  if (path.dirname(outPath) !== expectedRoot) {
    return { applied: false, reason: "resolver path outside approved directory" };
  }

  await fs.mkdir(expectedRoot, { recursive: true });
  let existed = false;
  try {
    await fs.access(outPath);
    existed = true;
  } catch {
    existed = false;
  }
  await fs.writeFile(outPath, String(resolverPayload.code || ""), "utf8");
  return {
    applied: true,
    relativePath: check.relativePath,
    conflict: existed,
    receipt: { kind: "resolver-file-write", path: check.relativePath, conflict: existed },
  };
}

/**
 * Apply a creation bundle. Mutates config in memory; caller persists via writeWorkspaceConfig.
 */
async function applyCreationFileLegs(bundle, options = {}) {
  const applied = [];
  const skipped = [];
  const fileProposals = (bundle.proposals || []).filter((p) => p.affectedField === "server-file");
  for (const proposal of fileProposals) {
    const fileResult = await writeResolverProposal(proposal.payload, options);
    if (fileResult.applied) applied.push({ type: proposal.type, ...fileResult });
    else skipped.push({ type: proposal.type, reason: fileResult.reason, guidance: fileResult.guidance });
  }
  return { applied, skipped };
}

async function applyCreationBundle(workspaceConfig, bundle, options = {}) {
  const { skipFileWrites = false, filesOnly = false } = options;
  const validation = validateCreationBundle(bundle);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, applied: [], skipped: bundle?.proposals || [], config: workspaceConfig };
  }

  if (filesOnly) {
    const fileLeg = await applyCreationFileLegs(bundle, options);
    return {
      ok: fileLeg.skipped.length === 0,
      partial: fileLeg.applied.length > 0 && fileLeg.skipped.length > 0,
      applied: fileLeg.applied,
      skipped: fileLeg.skipped,
      config: workspaceConfig,
    };
  }

  let config = { ...workspaceConfig };
  const applied = [];
  const skipped = [];

  const configProposals = (bundle.proposals || []).filter((p) => p.affectedField === "dataModel");

  for (const proposal of configProposals) {
    const result = mergeRowProposal(config, proposal);
    if (result.applied) {
      config = result.config;
      applied.push({ type: proposal.type, ...result });
    } else {
      skipped.push({ type: proposal.type, reason: result.reason });
    }
  }

  try {
    validateWorkspaceConfig({
      dashboards: config.dashboards,
      widgetTypes: config.widgetTypes,
      canvas: config.canvas,
      dataModel: config.dataModel,
    });
  } catch (error) {
    return {
      ok: false,
      errors: [error.message],
      applied: [],
      skipped: bundle.proposals,
      config: workspaceConfig,
    };
  }

  if (!skipFileWrites) {
    const fileLeg = await applyCreationFileLegs(bundle, options);
    applied.push(...fileLeg.applied);
    skipped.push(...fileLeg.skipped);
  }

  return {
    ok: skipped.length === 0,
    partial: applied.length > 0 && skipped.length > 0,
    applied,
    skipped,
    config,
  };
}

export { mergeRowProposal, writeResolverProposal, applyCreationFileLegs, applyCreationBundle };
