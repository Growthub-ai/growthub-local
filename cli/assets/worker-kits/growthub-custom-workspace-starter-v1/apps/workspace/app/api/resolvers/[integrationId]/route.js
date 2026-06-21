/**
 * GET /api/resolvers/[integrationId]
 *
 * CMS SDK v1.5.1 — the governed, addressable endpoint every registered resolver
 * is exposed at. A resolver is the workspace's provider-agnostic "API → governed
 * rows" abstraction; this makes it a real, hittable Next.js route inside the
 * monorepo, so other apps and external callers consume governed records by
 * integrationId. One dynamic route serves every resolver (a projection of the
 * unified registry) — runtime-agnostic and drift-free by construction.
 *
 * Identity: the path segment is matched canonically. The governed record keeps
 * its human integrationId; the resolver registers under either the raw id
 * (config-driven/Nango) or the slug (generated), so lookup tries the raw value
 * then the slug — `/api/resolvers/my-crm` and `/api/resolvers/asana` both resolve.
 *
 * Same-level governance as every mutation/execution route (Governed Application
 * Control Plane V1): `x-growthub-app-scope` is runtime-enforced, scope rejections
 * emit a canonical outcome receipt, and under a scope the 404 body does NOT leak
 * the list of other registered integrations. Secret-safe: tokens never leave the
 * server, and error messages are redacted.
 *
 * Response — success: { ok, integrationId, resolverId, recordRef, connectorKind, recordCount, records }
 * Response — no resolver: 404 { ok:false, reason:"no-resolver", registeredResolvers? }
 * Response — scope violation: 422 AppScopeViolation
 * Response — resolver error: 502 { ok:false, reason:"fetch-error", error }
 */

import { NextResponse } from "next/server";
import { requireAppScope, checkScopedRegistryAccess } from "@/lib/workspace-app-registry";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readAdapterConfig } from "@/lib/adapters/env";
import { listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { getSourceResolver, listRegisteredResolvers } from "@/lib/adapters/integrations/source-resolver-registry";
import { slugifyIntegrationId } from "@/lib/unified-resolver-registry";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** Strip anything secret-shaped from an error string before it leaves the server. */
function redact(message) {
  return String(message || "")
    .replace(/(authorization|bearer|api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1 [redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 300);
}

/** Find the governed api-registry row backing an integrationId (raw or slug). */
function findRecordRef(workspaceConfig, integrationId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const wantSlug = slugifyIntegrationId(integrationId, "");
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      const id = String(row?.integrationId || "").trim();
      if (!id) continue;
      if (id === integrationId || slugifyIntegrationId(id, "") === wantSlug) {
        return { objectId: String(object.id || ""), rowName: String(row.Name || id), integrationId: id };
      }
    }
  }
  return null;
}

async function GET(request, context) {
  const params = await context?.params;
  const rawId = String(params?.integrationId || "").trim();
  if (!rawId) {
    return NextResponse.json({ ok: false, reason: "bad-request", error: "integrationId is required" }, { status: 400 });
  }
  const slugId = slugifyIntegrationId(rawId, "");

  const workspaceConfig = await readWorkspaceConfig().catch(() => ({}));

  // App-scope gate — data-plane isolation. Checked against both forms so a scoped
  // agent cannot dodge scope by varying slug/raw. The 404 path below is also
  // scope-aware so it never leaks the registered-integration list under a scope.
  const scope = requireAppScope(request, workspaceConfig);
  if (scope.scoped) {
    const violation =
      scope.violation ||
      checkScopedRegistryAccess(scope.context, rawId) && checkScopedRegistryAccess(scope.context, slugId);
    if (violation) {
      await appendOutcomeReceipt({
        kind: "agent-outcome",
        lane: "untrusted-direct",
        outcomeStatus: "blocked",
        appId: violation.appScope || scope.appId,
        summary: `resolver endpoint rejected (422 app scope): ${violation.violationType}`,
        nextActions: violation.repairPlan,
      });
      return NextResponse.json(violation, { status: 422 });
    }
  }

  await loadAllResolvers();
  const resolver = getSourceResolver(rawId) || (slugId ? getSourceResolver(slugId) : null);
  if (!resolver) {
    const body = { ok: false, reason: "no-resolver", integrationId: rawId, resolverId: slugId };
    // Only an UNSCOPED caller gets the discovery aid — under a scope this would
    // leak other apps' integration ids.
    if (!scope.scoped) {
      body.registeredResolvers = listRegisteredResolvers();
      if (slugId && slugId !== rawId && body.registeredResolvers.includes(slugId)) {
        body.hint = `No resolver for "${rawId}". Did you mean the canonical id "${slugId}"?`;
      } else {
        body.hint = "Register this API in the Data Model API Registry cockpit and construct its resolver, then re-call this endpoint.";
      }
    }
    return NextResponse.json(body, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;

  const adapterConfig = readAdapterConfig();
  let connection = null;
  try {
    const integrations = await listGovernedWorkspaceIntegrations();
    connection = integrations.find((i) => i.provider === rawId || i.id === rawId || i.provider === slugId) || null;
  } catch {
    // Non-fatal — resolver falls back to env-only auth.
  }

  let records;
  try {
    records = await resolver.fetchRecords(adapterConfig, connection, {});
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "fetch-error", integrationId: rawId, error: redact(err?.message) || "resolver.fetchRecords threw" },
      { status: 502 },
    );
  }

  if (!Array.isArray(records)) {
    return NextResponse.json(
      { ok: false, reason: "bad-resolver-response", integrationId: rawId, error: "resolver.fetchRecords must return an array" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    integrationId: rawId,
    resolverId: slugId,
    // Downstream apps/agents know exactly which governed row they consumed.
    recordRef: findRecordRef(workspaceConfig, rawId),
    source: "resolver-endpoint",
    connectorKind: typeof resolver.connectorKind === "string" ? resolver.connectorKind : null,
    recordCount: records.length,
    records: records.slice(0, limit),
  });
}

export { GET };
