import { NextResponse } from "next/server";
import { describeIntegrationAdapter, listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";

export async function GET() {
  const integrations = await listAgencyPortalIntegrations();

  return NextResponse.json({
    adapter: describeIntegrationAdapter(),
    ...groupIntegrationsByLane(integrations),
  });
}
