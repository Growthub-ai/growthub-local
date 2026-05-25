/**
 * POST /api/workspace/nango/connect-session
 *
 * Server-side handoff that asks Nango to mint a Connect session token + link
 * the browser can use to complete OAuth or API-key onboarding. The route
 * never returns `NANGO_SECRET_KEY`, never persists the session into
 * `growthub.config.json`, and only accepts safe identifiers in the request
 * body (`providerConfigKey`, optional `connectionId`, optional `tags`).
 *
 * Boundary invariants:
 *   - POST-only (other methods → 405).
 *   - NANGO_SECRET_KEY is read from process.env only.
 *   - Response shape: { ok, token, connect_link, expires_at, providerConfigKey, ... }.
 *   - Never echoes the secret. Never echoes provider credentials.
 */
import { NextResponse } from "next/server";
import { createNangoConnectSession, redactNangoError } from "@/lib/adapters/nango";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const providerConfigKey = typeof body?.providerConfigKey === "string" ? body.providerConfigKey.trim() : "";
  if (!providerConfigKey) {
    return NextResponse.json(
      { ok: false, error: "providerConfigKey is required" },
      { status: 400 },
    );
  }
  if (!process.env.NANGO_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: "NANGO_SECRET_KEY is not set on this server" },
      { status: 503 },
    );
  }
  try {
    const session = await createNangoConnectSession({
      providerConfigKey,
      connectionId: typeof body?.connectionId === "string" ? body.connectionId : undefined,
      endUserId: typeof body?.endUserId === "string" ? body.endUserId : undefined,
      endUserEmail: typeof body?.endUserEmail === "string" ? body.endUserEmail : undefined,
      endUserDisplayName: typeof body?.endUserDisplayName === "string" ? body.endUserDisplayName : undefined,
      tags: body?.tags && typeof body.tags === "object" && !Array.isArray(body.tags) ? body.tags : undefined,
      allowedIntegrations: Array.isArray(body?.allowedIntegrations) ? body.allowedIntegrations : undefined,
    });
    return NextResponse.json({
      ok: true,
      providerConfigKey,
      token: session.token,
      connect_link: session.connect_link,
      expires_at: session.expires_at,
    });
  } catch (error) {
    const status = error?.code === "NANGO_PROVIDER_CONFIG_KEY_MISSING" ? 400 : 502;
    return NextResponse.json(
      { ok: false, error: redactNangoError(error), code: error?.code || "NANGO_CONNECT_SESSION_FAILED" },
      { status },
    );
  }
}

function methodNotAllowed() {
  return NextResponse.json({ ok: false, error: "method not allowed" }, { status: 405 });
}

const GET = methodNotAllowed;
const PUT = methodNotAllowed;
const PATCH = methodNotAllowed;
const DELETE = methodNotAllowed;

export { POST, GET, PUT, PATCH, DELETE };
