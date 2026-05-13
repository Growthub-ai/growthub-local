import { NextResponse } from "next/server";
import { deepMerge } from "@/lib/brand-kit-injector";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceIdentitySettings
} from "@/lib/workspace-config";

/**
 * PATCH /api/workspace/settings — branding-only (including brandKit tokens).
 * Separate from PATCH /api/workspace allowlist (dashboards | widgetTypes | canvas | dataModel).
 */
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
    return NextResponse.json({ error: "body must include branding object" }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((k) => k !== "branding");
  if (unknown.length) {
    return NextResponse.json({ error: "only branding is allowed", details: unknown }, { status: 400 });
  }

  try {
    const current = await readWorkspaceConfig();
    const prev = current.branding && typeof current.branding === "object" && !Array.isArray(current.branding) ? current.branding : {};
    const incoming = body.branding;
    const nextBranding = { ...prev, ...incoming };
    if (incoming.brandKit !== undefined && incoming.brandKit && typeof incoming.brandKit === "object" && !Array.isArray(incoming.brandKit)) {
      nextBranding.brandKit = deepMerge(prev.brandKit || {}, incoming.brandKit);
    }
    const workspaceConfig = await writeWorkspaceIdentitySettings({ branding: nextBranding });
    return NextResponse.json({
      ok: true,
      workspaceConfig,
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
    if (error.code === "INVALID_WORKSPACE_CONFIG") {
      return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "failed to write branding settings" }, { status: 500 });
  }
}

async function GET() {
  const persistence = describePersistenceMode();
  const workspaceConfig = await readWorkspaceConfig();
  return NextResponse.json({
    persistence,
    branding: workspaceConfig.branding || {}
  });
}

export { GET, PATCH };
