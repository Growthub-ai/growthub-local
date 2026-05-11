/**
 * GET /api/workspace/integration-entities?integrationId=<id>
 *
 * Returns NormalizedIntegrationEntity[] for the requested integration when a
 * server-side object resolver can fetch real source objects.
 * This route is server-side only: no source credentials are forwarded to the
 * browser, and no provider queries are executed in the client.
 *
 * Authority invariant (from GOVERNED_WORKSPACE_TOPOLOGY_V1.md):
 *   The browser never queries integrations, holds tokens, or resolves
 *   entity metadata directly. This route is the only server-side surface
 *   that crosses the authority boundary.
 *
 * Response shape:
   *   200 { integrationId: string, entities: NormalizedIntegrationEntity[], source: "resolver", requiresObjectResolver: boolean }
 *   400 { error: string }
 */
import { NextResponse } from "next/server";
import { listEntityMetadataForIntegration, listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { readAdapterConfig } from "@/lib/adapters/env";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { getSourceResolver } from "@/lib/adapters/integrations/source-resolver-registry";

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const integrationId = searchParams.get("integrationId");

  if (!integrationId || typeof integrationId !== "string" || !integrationId.trim()) {
    return NextResponse.json(
      { error: "integrationId query parameter is required" },
      { status: 400 }
    );
  }

  const id = integrationId.trim();
  const config = readAdapterConfig();
  const isBridgeMode =
    config.integrationAdapter === "growthub-bridge" &&
    config.growthubBridge?.baseUrl &&
    !!process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN;

  // 1. Try the Bridge / catalog path first
  let entities = await listEntityMetadataForIntegration(id);
  let source = entities.length ? "bridge" : "none";

  // 2. If Bridge returned nothing, fall back to resolver registry listEntities()
  if (!entities.length) {
    try {
      await loadAllResolvers();
      const resolver = getSourceResolver(id);
      if (resolver && typeof resolver.listEntities === "function") {
        const allConnections = await listGovernedWorkspaceIntegrations().catch(() => []);
        const connection = allConnections.find((c) => c.provider === id || c.id === id) || null;
        const raw = await resolver.listEntities(config, connection);
        if (Array.isArray(raw) && raw.length) {
          entities = raw.map((item) => ({
            id: String(item.id || item.entityId || item.propertyId || item.accountId || ""),
            label: String(item.label || item.name || item.displayName || item.id || ""),
            secondaryLabel: item.secondaryLabel || item.domain || item.accountId || undefined,
            entityType: item.entityType || item.type || undefined,
            provider: id,
            status: item.status || undefined,
            metadata: item.metadata || undefined
          })).filter((e) => e.id);
          source = "resolver";
        }
      }
    } catch {
      // resolver not available or threw — leave entities empty
    }
  }

  return NextResponse.json({
    integrationId: id,
    entities,
    source,
    requiresObjectResolver: entities.length === 0,
    authority: isBridgeMode ? "growthub-bridge" : "local"
  });
}

export { GET };
