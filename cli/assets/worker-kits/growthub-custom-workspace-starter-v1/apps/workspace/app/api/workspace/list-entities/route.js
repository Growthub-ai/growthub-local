/**
 * GET /api/workspace/list-entities?integrationId=<id>
 *
 * Calls the registered resolver's `listEntities()` function and returns a
 * normalized entity list. Fully composable — no provider-specific logic here.
 * The resolver file is the only place that knows what an "entity" means for its
 * integration.
 *
 * Response (success):
 *   { entities: { id: string, label: string, meta?: object }[], hasListEntities: true }
 *
 * Response (resolver has no listEntities):
 *   { entities: [], hasListEntities: false }
 *
 * Response (resolver not found):
 *   { error: "no-resolver", integrationId } — 404
 */

import { NextResponse } from "next/server";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { getSourceResolver } from "@/lib/adapters/integrations/source-resolver-registry";

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const integrationId = searchParams.get("integrationId");

  if (!integrationId) {
    return NextResponse.json(
      { error: "integrationId query param required" },
      { status: 400 }
    );
  }

  await loadAllResolvers();
  const resolver = getSourceResolver(integrationId);

  if (!resolver) {
    return NextResponse.json(
      { error: "no-resolver", integrationId },
      { status: 404 }
    );
  }

  if (typeof resolver.listEntities !== "function") {
    return NextResponse.json({ entities: [], hasListEntities: false });
  }

  try {
    const entities = await resolver.listEntities({}, {});
    return NextResponse.json({
      entities: Array.isArray(entities) ? entities : [],
      hasListEntities: true,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err.message || "Failed to list entities",
        reason: "list-error",
        entities: [],
        hasListEntities: true,
      },
      { status: 500 }
    );
  }
}

export { GET };
