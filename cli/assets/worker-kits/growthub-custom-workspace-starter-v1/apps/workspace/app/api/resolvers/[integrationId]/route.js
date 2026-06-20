/**
 * GET /api/resolvers/[integrationId]
 *
 * CMS SDK v1.5.1 — the governed, addressable endpoint every registered resolver
 * is exposed at. This makes a resolver — already the workspace's provider-
 * agnostic "API → governed rows" abstraction — a real, hittable Next.js API
 * route inside the monorepo, so other apps (apps/agency-portal, studio, future
 * apps) and external callers consume governed records by integrationId.
 *
 * One dynamic route serves every resolver (a projection of the unified registry)
 * rather than per-resolver codegen: it is runtime-agnostic (works identically in
 * filesystem dev, read-only serverless, and the reserved database adapter — no
 * per-file FS write needed) and drift-free by construction. The generated
 * endpoint MANIFEST (_endpoints.generated.json) lists which integrationIds are
 * exposed; this route is the single handler behind all of them.
 *
 * Same-level governance as every mutation/execution route (Governed Application
 * Control Plane V1): `x-growthub-app-scope` is runtime-enforced (a scoped agent
 * may only read integrations on its registry-row registryIds), and scope
 * rejections emit a canonical outcome receipt. Secret-safe: tokens never leave
 * the server; the resolver reads its secret from env via authRef server-side.
 *
 * Response — success: { ok, integrationId, recordCount, records, source: "resolver-endpoint" }
 * Response — no resolver: 404 { ok:false, reason:"no-resolver", registeredResolvers }
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

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

async function GET(request, context) {
  const params = await context?.params;
  const integrationId = String(params?.integrationId || "").trim();
  if (!integrationId) {
    return NextResponse.json({ ok: false, reason: "bad-request", error: "integrationId is required" }, { status: 400 });
  }

  // App-scope gate — data-plane isolation: a scoped agent may only read
  // integrations referenced on its app's registry row (registryIds).
  {
    const cfgForScope = await readWorkspaceConfig().catch(() => ({}));
    const scope = requireAppScope(request, cfgForScope);
    if (scope.scoped) {
      const violation = scope.violation || checkScopedRegistryAccess(scope.context, integrationId);
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
  }

  await loadAllResolvers();
  const resolver = getSourceResolver(integrationId);
  if (!resolver) {
    return NextResponse.json(
      {
        ok: false,
        reason: "no-resolver",
        integrationId,
        registeredResolvers: listRegisteredResolvers(),
        hint: "Register this API in the Data Model API Registry cockpit and construct its resolver, then re-call this endpoint.",
      },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;

  const adapterConfig = readAdapterConfig();
  let connection = null;
  try {
    const integrations = await listGovernedWorkspaceIntegrations();
    connection = integrations.find((i) => i.provider === integrationId || i.id === integrationId) || null;
  } catch {
    // Non-fatal — resolver falls back to env-only auth.
  }

  let records;
  try {
    records = await resolver.fetchRecords(adapterConfig, connection, {});
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "fetch-error", integrationId, error: err?.message || "resolver.fetchRecords threw" },
      { status: 502 },
    );
  }

  if (!Array.isArray(records)) {
    return NextResponse.json(
      { ok: false, reason: "bad-resolver-response", integrationId, error: "resolver.fetchRecords must return an array" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    integrationId,
    source: "resolver-endpoint",
    recordCount: records.length,
    records: records.slice(0, limit),
    connectorKind: typeof resolver.connectorKind === "string" ? resolver.connectorKind : null,
  });
}

export { GET };
