/**
 * Server-side orchestration for POST /api/workspace/reference-options.
 * Dispatches: workspace-rows (default), source-records sidecar, or resolver listEntities.
 */

import { readAdapterConfig } from "@/lib/adapters/env";
import { listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { getSourceResolver } from "@/lib/adapters/integrations/source-resolver-registry";
import {
  findRelationForField,
  normalizeManualObjects,
  normalizeReferenceOption,
  resolveLocalReferenceOptions
} from "@/lib/workspace-data-model";
import { resolveSourceRecordReferenceOptions } from "./resolvers/source-records.js";

function normalizeListEntity(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = String(entry.id ?? entry.entityType ?? "").trim();
  if (!id) return null;
  return normalizeReferenceOption({
    value: id,
    label: String(entry.label ?? id).trim() || id,
    secondaryLabel: entry.secondaryLabel ? String(entry.secondaryLabel) : undefined,
    source: "resolver",
    provider: typeof entry.provider === "string" ? entry.provider : undefined,
    metadata: entry.meta && typeof entry.meta === "object" ? entry.meta : undefined
  });
}

async function collectReferenceOptions(workspaceConfig, parsed) {
  const { objectId, field, query, cursor, limit, context } = parsed;
  const objects = normalizeManualObjects(workspaceConfig);
  const objectItem = objects.find((o) => o.id === objectId);
  if (!objectItem) {
    return {
      ok: false,
      options: [],
      nextCursor: null,
      reason: "unknown-object",
      error: "dataModel object not found"
    };
  }
  const relation = findRelationForField(objectItem, field);
  if (!relation) {
    return {
      ok: false,
      options: [],
      nextCursor: null,
      reason: "unknown-field",
      error: "no relation metadata for this field"
    };
  }

  if (relation.referenceSource === "source-records") {
    const sourceId =
      typeof relation.sidecarSourceId === "string" && relation.sidecarSourceId.trim()
        ? relation.sidecarSourceId.trim()
        : typeof context.sourceId === "string"
          ? context.sourceId.trim()
          : "";
    const sr = await resolveSourceRecordReferenceOptions(sourceId, { query, limit });
    return { ok: true, options: sr.options, nextCursor: null, reason: sr.reason || null };
  }

  if (relation.resolver && typeof relation.resolver.integrationId === "string" && relation.resolver.integrationId.trim()) {
    await loadAllResolvers();
    const integId = relation.resolver.integrationId.trim();
    const resolver = getSourceResolver(integId);
    if (!resolver) {
      return {
        ok: true,
        options: [],
        nextCursor: null,
        reason: "no-resolver",
        resolverIntegrationId: integId
      };
    }
    if (typeof resolver.listEntities !== "function") {
      return { ok: true, options: [], nextCursor: null, reason: "no-list-entities" };
    }
    const adapterConfig = readAdapterConfig();
    let connection = null;
    try {
      const integrations = await listGovernedWorkspaceIntegrations();
      connection =
        integrations.find((i) => i.provider === integId || i.id === integId) || null;
    } catch {
      /* non-fatal */
    }
    let entities;
    try {
      entities = await resolver.listEntities(adapterConfig, connection, {
        query,
        cursor,
        limit,
        context,
        field,
        objectId
      });
    } catch (err) {
      return {
        ok: false,
        options: [],
        nextCursor: null,
        reason: "list-error",
        error: err?.message || "listEntities failed"
      };
    }
    const raw = Array.isArray(entities) ? entities : [];
    const options = raw.map(normalizeListEntity).filter(Boolean);
    return { ok: true, options: options.slice(0, limit), nextCursor: null, reason: null };
  }

  const local = resolveLocalReferenceOptions(workspaceConfig, {
    objectId,
    field,
    query,
    cursor,
    limit,
    relation
  });
  return {
    ok: true,
    options: local.options,
    nextCursor: local.nextCursor,
    reason: local.reason,
    total: local.total
  };
}

export { collectReferenceOptions };
