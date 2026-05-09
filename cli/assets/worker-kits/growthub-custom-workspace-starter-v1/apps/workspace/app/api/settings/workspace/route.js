import { NextResponse } from "next/server";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter } from "@/lib/adapters/integrations";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceIdentitySettings
} from "@/lib/workspace-config";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  return NextResponse.json({
    adapterScope: "local-workspace-config",
    config: readAdapterConfig(),
    integrationAdapter: describeIntegrationAdapter(),
    persistence: describePersistenceMode(),
    workspace: {
      id: workspaceConfig.id,
      name: workspaceConfig.name,
      branding: workspaceConfig.branding || {},
      provenance: workspaceConfig.provenance || {}
    }
  });
}

async function PATCH(request) {
  let patch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  try {
    const workspaceConfig = await writeWorkspaceIdentitySettings(patch);
    return NextResponse.json({
      adapterScope: "local-workspace-config",
      workspace: {
        id: workspaceConfig.id,
        name: workspaceConfig.name,
        branding: workspaceConfig.branding || {},
        provenance: workspaceConfig.provenance || {}
      }
    });
  } catch (error) {
    if (error.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
      return NextResponse.json(
        {
          error: "workspace config is read-only in this runtime",
          reason: error.message,
          adapter: error.adapter,
          guidance: error.guidance
        },
        { status: 409 }
      );
    }
    if (error.code === "INVALID_WORKSPACE_SETTINGS_PATCH") {
      return NextResponse.json({ error: error.message, details: error.details || [] }, { status: 400 });
    }
    if (error.code === "WORKSPACE_PERSISTENCE_PATH_REFUSED") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error.code === "INVALID_WORKSPACE_CONFIG") {
      return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "failed to write workspace settings" }, { status: 500 });
  }
}

export { GET, PATCH };
