/**
 * POST /api/workspace/integrations/nango/connect-session
 *
 * Creates a Nango Connect Session for the given providerConfigKey and
 * returns a short-lived connect_link the browser opens to start OAuth.
 * The Nango Connect UI mints tokens directly against Nango — the workspace
 * never sees the resulting OAuth credentials. The token returned here is a
 * Connect Session token (handoff only), not a provider credential.
 *
 * Request body:
 *   {
 *     providerConfigKey: string,        // required, alphanumeric (+ _.-) <= 64 chars
 *     connectionId?: string,             // optional pre-mint connection id
 *     endUser?: { id?: string, email?: string }
 *   }
 *
 * Response — success: 200 { ok: true, providerConfigKey, environment, token, connectLink, sdkMethod }
 * Response — validation failure: 400 { ok: false, error, details }
 * Response — Nango not configured / SDK missing: 503 { ok: false, error, code }
 * Response — upstream failure: 502 { ok: false, error }
 */

import { NextResponse } from "next/server";
import { createConnectSession, validateConnectSessionRequest } from "@/lib/adapters/integrations/nango";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  let validated;
  try {
    validated = validateConnectSessionRequest(body);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message, details: error.details || null },
      { status: 400 }
    );
  }

  try {
    const result = await createConnectSession(validated);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error.code === "NANGO_NOT_CONFIGURED" || error.code === "NANGO_SDK_UNAVAILABLE" || error.code === "NANGO_SDK_SHAPE") {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error?.message || "nango connect session failed" },
      { status: 502 }
    );
  }
}

export { POST };
