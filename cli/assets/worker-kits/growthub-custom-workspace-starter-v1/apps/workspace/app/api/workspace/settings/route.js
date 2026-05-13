import { NextResponse } from "next/server";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceIdentitySettings
} from "@/lib/workspace-config";

/**
 * PATCH /api/workspace/settings
 * Branding-only settings surface (separate from PATCH /api/workspace allowlist).
 * Body: { branding: { name?, logoUrl?, accent?, brandKit? } }
 */
async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  return NextResponse.json({
    persistence: describePersistenceMode(),
    branding: workspaceConfig.branding || {}
  });
}

async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "body must be a plain object" }, { status: 400 });
  }
  if (!body.branding || typeof body.branding !== "object" || Array.isArray(body.branding)) {
    return NextResponse.json({ error: "body must include a branding object" }, { status: 400 });
  }

  try {
    const workspaceConfig = await writeWorkspaceIdentitySettings({ branding: body.branding });
    return NextResponse.json({
      branding: workspaceConfig.branding || {}
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
    return NextResponse.json({ error: error.message || "failed to write settings" }, { status: 500 });
  }
}

export { GET, PATCH };
