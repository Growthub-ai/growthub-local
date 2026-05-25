/**
 * POST /api/workspace/integrations/nango/connection-status
 *
 * Returns the safe (non-credential) status summary for a specific Nango
 * connection. Used by the NangoConnectionPanel sidecar to verify a
 * per-row connection without exposing OAuth tokens to the browser.
 *
 * Request body:
 *   { providerConfigKey: string, connectionId: string }
 *
 * Response — connected: 200 { ok: true, status: "connected", providerConfigKey, connectionId, environment, connection: { ...safe fields... } }
 * Response — not yet connected: 200 { ok: true, status: "not-connected", providerConfigKey, connectionId, environment, reason }
 * Response — validation failure: 400 { ok: false, error, details }
 * Response — Nango not configured: 503 { ok: false, error, code }
 * Response — upstream failure: 502 { ok: false, error }
 */

import { NextResponse } from "next/server";
import { getConnectionSummary, validateConnectionSummaryRequest } from "@/lib/adapters/integrations/nango";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  let validated;
  try {
    validated = validateConnectionSummaryRequest(body);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message, details: error.details || null },
      { status: 400 }
    );
  }

  try {
    const result = await getConnectionSummary(validated);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error.code === "NANGO_NOT_CONFIGURED" || error.code === "NANGO_SDK_UNAVAILABLE" || error.code === "NANGO_SDK_SHAPE") {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error?.message || "nango connection status failed" },
      { status: 502 }
    );
  }
}

export { POST };
