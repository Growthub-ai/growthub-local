import { NextResponse } from "next/server";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceApiWebhookSettings
} from "@/lib/workspace-config";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  const refs = Array.isArray(workspaceConfig.integrations)
    ? workspaceConfig.integrations.filter((item) => item?.sourceType === "custom-api-webhooks")
    : [];
  return NextResponse.json({
    adapterScope: "local-workspace-config",
    persistence: describePersistenceMode(),
    refs
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
    const result = await writeWorkspaceApiWebhookSettings(patch);
    return NextResponse.json({
      adapterScope: "local-workspace-config",
      refs: result.refs,
      envWritten: result.envWritten || [],
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
    return NextResponse.json({ error: error.message || "failed to write API/Webhook settings" }, { status: 500 });
  }
}

export { GET, PATCH };
