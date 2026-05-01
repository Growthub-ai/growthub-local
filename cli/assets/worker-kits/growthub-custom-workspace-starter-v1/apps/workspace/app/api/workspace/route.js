import { NextResponse } from "next/server";
import { describeAuthAdapter } from "@/lib/adapters/auth";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { describePaymentAdapter } from "@/lib/adapters/payments";
import { describePersistenceAdapter } from "@/lib/adapters/persistence";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { buildPortalWorkspace, portalCapabilities } from "@/lib/domain/portal";
async function GET() {
  const integrations = await listAgencyPortalIntegrations();
  const config = readAdapterConfig();
  const adapters = {
    persistence: describePersistenceAdapter(),
    auth: describeAuthAdapter(),
    payments: describePaymentAdapter(),
    integrations: describeIntegrationAdapter()
  };
  const settings = {
    integrations: groupIntegrationsByLane(integrations)
  };
  return NextResponse.json({
    config,
    adapters,
    capabilities: portalCapabilities,
    settings,
    workspace: buildPortalWorkspace({ config, adapters, integrations: settings.integrations })
  });
}
export {
  GET
};
