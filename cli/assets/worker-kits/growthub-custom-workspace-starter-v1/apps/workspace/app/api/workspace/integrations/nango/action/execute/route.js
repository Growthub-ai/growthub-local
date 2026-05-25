/**
 * POST /api/workspace/integrations/nango/action/execute
 *
 * Executes a declared Nango action function against the connection
 * identified by `providerConfigKey` + `connectionId`. Used by workspace
 * agents as a tool-call surface.
 *
 * Request body:
 *   {
 *     providerConfigKey: string,
 *     connectionId: string,
 *     action: string,              // action function name from nango.yaml
 *     input?: object | array       // arguments to the action
 *   }
 *
 * Response — success: 200 { ok: true, action, providerConfigKey, connectionId, result, environment }
 * Response — validation failure: 400 { ok: false, error, details }
 * Response — Nango not configured: 503 { ok: false, error, code }
 * Response — upstream failure: 502 { ok: false, error }
 */

import { NextResponse } from "next/server";
import { executeAction, validateActionExecuteRequest } from "@/lib/adapters/integrations/nango";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  let validated;
  try {
    validated = validateActionExecuteRequest(body);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message, details: error.details || null },
      { status: 400 }
    );
  }

  try {
    const result = await executeAction(validated);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error.code === "NANGO_NOT_CONFIGURED" || error.code === "NANGO_SDK_UNAVAILABLE" || error.code === "NANGO_SDK_SHAPE") {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error?.message || "nango action execution failed" },
      { status: 502 }
    );
  }
}

export { POST };
