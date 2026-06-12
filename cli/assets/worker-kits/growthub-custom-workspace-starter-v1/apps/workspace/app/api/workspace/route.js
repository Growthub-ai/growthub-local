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
  readWorkspaceSourceRecords,
  writeWorkspaceConfig
} from "@/lib/workspace-config";
import {
  WORKSPACE_PATCH_ALLOWED_FIELDS,
  evaluateWorkspacePatchPolicy
} from "@/lib/workspace-patch-policy";

// Workspace Config Contract V1 — PATCH is permanently restricted to these
// four fields. Sidecar source records (`workspaceSourceRecords`) are exposed
// on GET for runtime hydration only; they are deliberately NOT in this set.
// Sidecar writes flow through POST /api/workspace/refresh-sources.
//
// Mutation policy (workspace-patch-policy.js) runs before any write: live
// workflow fields are publish-owned (POST /api/workspace/workflow/publish),
// size ceilings apply, and history blobs never enter dataModel. Dry-run the
// same checks via POST /api/workspace/patch/preflight.
const ALLOWED_PATCH_FIELDS = new Set(WORKSPACE_PATCH_ALLOWED_FIELDS);

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
  // Source records hydrate live-backed Data Model objects at runtime.
  // Missing or unreadable sidecar returns `{}` — never throws.
  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch {
    workspaceSourceRecords = {};
  }
  const persistence = describePersistenceMode();
  return NextResponse.json({
    config,
    adapters,
    capabilities: portalCapabilities,
    settings,
    workspace: buildPortalWorkspace({ config, adapters, integrations: settings.integrations }),
    workspaceConfig,
    workspaceSourceRecords,
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
  let currentConfig = null;
  try {
    currentConfig = await readWorkspaceConfig();
  } catch {
    currentConfig = null;
  }
  const policy = evaluateWorkspacePatchPolicy(currentConfig, patch);
  if (!policy.ok) {
    return NextResponse.json(
      {
        error: "patch rejected by workspace mutation policy",
        violations: policy.violations,
        preflight: "POST /api/workspace/patch/preflight dry-runs these checks without writing"
      },
      { status: 422 }
    );
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
