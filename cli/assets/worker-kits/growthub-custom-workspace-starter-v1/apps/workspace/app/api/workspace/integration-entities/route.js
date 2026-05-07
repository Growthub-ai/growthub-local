/**
 * GET /api/workspace/integration-entities?integrationId=<id>
 *
 * Returns NormalizedIntegrationEntity[] for the requested integration.
 * This route is server-side only: no provider tokens are forwarded to the
 * browser, and no provider queries are executed in the client.
 *
 * In static adapter mode the response contains sample entities from the
 * local domain catalog so builders can preview the full entity-selection
 * UX without a live Bridge connection.
 *
 * In growthub-bridge adapter mode the server attempts to fetch live entities
 * from the bridge and falls back to sample data on failure.
 *
 * Authority invariant (from GOVERNED_WORKSPACE_TOPOLOGY_V1.md):
 *   The browser never queries integrations, holds tokens, or resolves
 *   entity metadata directly. This route is the only server-side surface
 *   that crosses the authority boundary.
 *
 * Response shape:
 *   200 { integrationId: string, entities: NormalizedIntegrationEntity[], source: "bridge" | "sample" }
 *   400 { error: string }
 */
import { NextResponse } from "next/server";
import { listEntityMetadataForIntegration } from "@/lib/adapters/integrations";
import { readAdapterConfig } from "@/lib/adapters/env";

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const integrationId = searchParams.get("integrationId");

  if (!integrationId || typeof integrationId !== "string" || !integrationId.trim()) {
    return NextResponse.json(
      { error: "integrationId query parameter is required" },
      { status: 400 }
    );
  }

  const config = readAdapterConfig();
  const isBridgeMode =
    config.integrationAdapter === "growthub-bridge" &&
    config.growthubBridge?.baseUrl &&
    !!process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN;

  const entities = await listEntityMetadataForIntegration(integrationId.trim());

  return NextResponse.json({
    integrationId: integrationId.trim(),
    entities,
    source: isBridgeMode ? "bridge" : "sample"
  });
}

export { GET };
