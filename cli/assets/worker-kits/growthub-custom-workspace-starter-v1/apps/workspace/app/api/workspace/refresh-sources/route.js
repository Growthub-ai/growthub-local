/**
 * POST /api/workspace/refresh-sources
 *
 * Thin dispatcher for live-backed data sources. Zero provider-specific logic
 * lives here. Each integration ships its own resolver file under
 * `lib/adapters/integrations/resolvers/<id>.js` and registers itself via
 * `registerSourceResolver()` from source-resolver-registry.js.
 *
 * This route never imports any provider directly. It reads the registry and
 * dispatches to whatever resolvers the operator has registered. An upstream
 * kit with no resolver files registered still works — it just skips sources
 * that have no resolver and returns them in the `skipped` array.
 *
 * Request body:
 *   { sourceIds: string[] }   — IDs of dataModel.objects to refresh
 *
 * Response shape:
 *   200 { refreshed: SourceRefreshResult[], skipped: string[] }
 *   400 { error: string }
 *   500 { error: string }
 *
 * SourceRefreshResult:
 *   { sourceId: string, integrationId: string, recordCount: number, fetchedAt: string }
 *
 * Authority contract (GOVERNED_WORKSPACE_TOPOLOGY_V1):
 *   - Browser sends only non-secret sourceIds. No tokens, no provider auth.
 *   - Server reads env credentials via readAdapterConfig().
 *   - Normalized records are persisted via writeWorkspaceSourceRecords().
 *   - Raw provider payloads are never forwarded to the client.
 *   - The Growthub bridge owns provider auth — this route never holds tokens.
 */

import { NextResponse } from "next/server";
import { requireAppScope, checkScopedSourceAccess } from "@/lib/workspace-app-registry";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readAdapterConfig } from "@/lib/adapters/env";
import { listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { readWorkspaceConfig, writeWorkspaceSourceRecords } from "@/lib/workspace-config";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { getSourceResolver } from "@/lib/adapters/integrations/source-resolver-registry";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "body must be a plain object" }, { status: 400 });
  }

  const { sourceIds } = body;
  // App-scope gate: a scoped agent may only refresh sources referenced on
  // its registry row (dataSourceIds / derived sourceIds).
  {
    let cfgForScope = {};
    try { cfgForScope = await readWorkspaceConfig(); } catch { cfgForScope = {}; }
    const scope = requireAppScope(request, cfgForScope);
    if (scope.scoped) {
      const violation = scope.violation || checkScopedSourceAccess(scope.context, sourceIds);
      if (violation) {
        await appendOutcomeReceipt({
          kind: "agent-outcome", lane: "untrusted-direct", outcomeStatus: "blocked",
          appId: violation.appScope || scope.appId,
          summary: `refresh-sources rejected (422 app scope): ${violation.violationType}`,
          nextActions: violation.repairPlan
        });
        return NextResponse.json(violation, { status: 422 });
      }
    }
  }
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    return NextResponse.json({ error: "sourceIds must be a non-empty array" }, { status: 400 });
  }

  const invalidIds = sourceIds.filter((id) => typeof id !== "string" || !id.trim());
  if (invalidIds.length) {
    return NextResponse.json({ error: "every sourceId must be a non-empty string" }, { status: 400 });
  }

  let workspaceConfig;
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch (err) {
    return NextResponse.json({ error: `failed to read workspace config: ${err.message}` }, { status: 500 });
  }

  await loadAllResolvers();

  const adapterConfig = readAdapterConfig();
  const dataObjects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];

  // Resolve bridge connections once for this batch so every resolver
  // receives the full live connection object (connectionId, authPath, metadata).
  let bridgeIntegrations = [];
  try {
    bridgeIntegrations = await listGovernedWorkspaceIntegrations();
  } catch {
    // Non-fatal — resolvers fall back to env-only auth
  }

  const refreshed = [];
  const skipped = [];
  const skippedDetail = [];

  for (const sourceId of sourceIds) {
    const obj = dataObjects.find((o) => o.id === sourceId);
    if (!obj) {
      skipped.push(sourceId);
      skippedDetail.push({ sourceId, reason: "unknown-object" });
      continue;
    }

    const binding = obj.binding;
    if (!binding || binding.sourceStorage !== "workspace-source-records") {
      skipped.push(sourceId);
      skippedDetail.push({ sourceId, reason: "not-live-backed" });
      continue;
    }

    const integrationId = binding.integrationId;
    if (!integrationId) {
      skipped.push(sourceId);
      skippedDetail.push({ sourceId, reason: "missing-integration-id" });
      continue;
    }

    const resolver = getSourceResolver(integrationId);
    if (!resolver) {
      skipped.push(sourceId);
      skippedDetail.push({ sourceId, reason: "missing-resolver", integrationId });
      continue;
    }

    try {
      const connection = bridgeIntegrations.find(
        (i) => i.provider === integrationId || i.id === integrationId
      ) || null;
      const records = await resolver.fetchRecords(adapterConfig, connection, binding);
      const fetchedAt = new Date().toISOString();
      // Persist the records under the object's `id` (canonical sidecar key).
      // We also include `objectId`, `objectSourceId`, and `bindingSourceId`
      // metadata so reader-side hydration in `lib/workspace-data-model.js`
      // can fall back across the three places that may legitimately store
      // the same key (object.id, object.sourceId, object.binding.sourceId)
      // without having to re-parse the object.
      const objectSourceId = typeof obj.sourceId === "string" && obj.sourceId.trim() ? obj.sourceId.trim() : null;
      const bindingSourceId = typeof binding.sourceId === "string" && binding.sourceId.trim() ? binding.sourceId.trim() : null;
      await writeWorkspaceSourceRecords(sourceId, records, {
        integrationId,
        fetchedAt,
        objectId: sourceId,
        objectSourceId,
        bindingSourceId
      });
      refreshed.push({
        sourceId,
        integrationId,
        recordCount: records.length,
        fetchedAt,
        objectId: sourceId,
        objectSourceId,
        bindingSourceId
      });
    } catch (err) {
      skipped.push(sourceId);
      skippedDetail.push({
        sourceId,
        reason: "fetch-error",
        integrationId,
        message: err?.message || "fetchRecords failed"
      });
    }
  }

  return NextResponse.json({ refreshed, skipped, skippedDetail });
}

export { POST };
