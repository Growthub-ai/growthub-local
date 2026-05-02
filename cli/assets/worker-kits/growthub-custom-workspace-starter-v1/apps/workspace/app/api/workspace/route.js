import { NextResponse } from "next/server";
import { describeAuthAdapter } from "@/lib/adapters/auth";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listAgencyPortalIntegrations } from "@/lib/adapters/integrations";
import { describePaymentAdapter } from "@/lib/adapters/payments";
import { describePersistenceAdapter } from "@/lib/adapters/persistence";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { buildPortalWorkspace, portalCapabilities } from "@/lib/domain/portal";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig
} from "@/lib/workspace-config";

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
  const workspaceConfig = await readWorkspaceConfig();
  const persistence = describePersistenceMode();
  return NextResponse.json({
    config,
    adapters,
    capabilities: portalCapabilities,
    settings,
    workspace: buildPortalWorkspace({ config, adapters, integrations: settings.integrations }),
    workspaceConfig,
    workspaceConfigPersistence: persistence
  });
}

async function PATCH(request) {
  let patch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return NextResponse.json({ error: "patch must be an object" }, { status: 400 });
  }
  try {
    const next = await writeWorkspaceConfig(patch);
    return NextResponse.json({ workspaceConfig: next });
  } catch (error) {
    if (error.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
      return NextResponse.json(
        {
          error: "workspace config is read-only in this runtime",
          reason: error.message,
          adapter: error.adapter,
          guidance: "Edit growthub.config.json locally, or set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime."
        },
        { status: 409 }
      );
    }
    if (error.code === "INVALID_WORKSPACE_CONFIG") {
      return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "failed to write workspace config" }, { status: 500 });
  }
}

export { GET, PATCH };
