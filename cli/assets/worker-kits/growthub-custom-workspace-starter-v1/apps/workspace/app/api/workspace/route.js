import { NextResponse } from "next/server";
import { describeAuthAdapter } from "@/lib/adapters/auth";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { describePaymentAdapter } from "@/lib/adapters/payments";
import { describePersistenceAdapter } from "@/lib/adapters/persistence";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { buildPortalWorkspace, portalCapabilities } from "@/lib/domain/portal";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig
} from "@/lib/workspace-config";

const ALLOWED_PATCH_FIELDS = new Set(["dashboards", "widgetTypes", "canvas", "dataModel"]);

async function GET() {
  const integrations = await listGovernedWorkspaceIntegrations();
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
    return NextResponse.json({ error: "patch must be a plain object" }, { status: 400 });
  }
  const unknown = Object.keys(patch).filter((key) => !ALLOWED_PATCH_FIELDS.has(key));
  if (unknown.length) {
    return NextResponse.json(
      { error: "patch contains unknown fields", details: unknown, allowed: Array.from(ALLOWED_PATCH_FIELDS) },
      { status: 400 }
    );
  }
  const sanitized = {};
  for (const key of ALLOWED_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sanitized[key] = patch[key];
    }
  }
  try {
    const next = await writeWorkspaceConfig(sanitized);
    return NextResponse.json({ workspaceConfig: next });
  } catch (error) {
    if (error.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
      return NextResponse.json(
        {
          error: "workspace config is read-only in this runtime",
          reason: error.message,
          adapter: error.adapter,
          guidance: error.guidance
            || "Edit growthub.config.json locally, or set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime."
        },
        { status: 409 }
      );
    }
    if (error.code === "WORKSPACE_PERSISTENCE_PATH_REFUSED") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error.code === "INVALID_WORKSPACE_CONFIG") {
      return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "failed to write workspace config" }, { status: 500 });
  }
}

export { GET, PATCH };
