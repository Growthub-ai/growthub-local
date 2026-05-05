import { NextResponse } from "next/server";
import { describeIntegrationAdapter, listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
async function GET() {
  const integrations = await listGovernedWorkspaceIntegrations();
  return NextResponse.json({
    adapter: describeIntegrationAdapter(),
    ...groupIntegrationsByLane(integrations)
  });
}
export {
  GET
};
