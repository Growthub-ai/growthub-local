/**
 * POST /api/workspace/nango/connection-status
 *
 * Returns a SAFE summary of a Nango connection (provider config key,
 * connection id, provider slug, created/updated timestamps, tags, end-user
 * metadata, error history). The route never requests or returns
 * `credentials`, `access_token`, `refresh_token`, or any other secret-shaped
 * field — `pickSafeConnectionFields` enforces the allowlist.
 *
 * Boundary invariants:
 *   - POST-only (other methods → 405).
 *   - NANGO_SECRET_KEY read from process.env only.
 *   - Never echoes the secret. Never returns `connection.credentials`.
 */
import { NextResponse } from "next/server";
import { getNangoConnectionSummary, redactNangoError } from "@/lib/adapters/nango";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const providerConfigKey = typeof body?.providerConfigKey === "string" ? body.providerConfigKey.trim() : "";
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
  if (!providerConfigKey) {
    return NextResponse.json({ ok: false, error: "providerConfigKey is required" }, { status: 400 });
  }
  if (!connectionId) {
    return NextResponse.json({ ok: false, error: "connectionId is required" }, { status: 400 });
  }
  if (!process.env.NANGO_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: "NANGO_SECRET_KEY is not set on this server" },
      { status: 503 },
    );
  }
  try {
    const summary = await getNangoConnectionSummary({ providerConfigKey, connectionId });
    return NextResponse.json({
      ok: true,
      providerConfigKey,
      connectionId,
      status: summary.status || "connected",
      connection: summary,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const status = error?.status === 404 ? 404 : 502;
    return NextResponse.json(
      {
        ok: false,
        providerConfigKey,
        connectionId,
        status: status === 404 ? "missing" : "error",
        error: redactNangoError(error),
        code: error?.code || "NANGO_CONNECTION_SUMMARY_FAILED",
        checkedAt: new Date().toISOString(),
      },
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
