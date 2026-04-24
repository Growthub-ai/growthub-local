import { NextResponse } from "next/server";
import { describeAuthAdapter } from "@/lib/adapters/auth";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { describePaymentAdapter } from "@/lib/adapters/payments";
import { describePersistenceAdapter } from "@/lib/adapters/persistence";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { portalCapabilities } from "@/lib/domain/portal";

export async function GET() {
  const integrations = await listAgencyPortalIntegrations();

  return NextResponse.json({
    config: readAdapterConfig(),
    adapters: {
      persistence: describePersistenceAdapter(),
      auth: describeAuthAdapter(),
      payments: describePaymentAdapter(),
      integrations: describeIntegrationAdapter(),
    },
    capabilities: portalCapabilities,
    settings: {
      integrations: groupIntegrationsByLane(integrations),
    },
  });
}
