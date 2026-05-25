/**
 * POST /api/workspace/integrations/nango/proxy
 *
 * Proxies an API request through Nango using the connection identified by
 * `providerConfigKey` + `connectionId`. The Nango SDK injects credentials
 * server-side; the browser never holds the upstream provider's auth.
 *
 * Request body:
 *   {
 *     providerConfigKey: string,   // Nango integration config key
 *     connectionId: string,         // Nango connection id
 *     method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
 *     endpoint: string,             // path or absolute URL
 *     headers?: object,             // forbidden: Authorization, X-API-Key, etc.
 *     params?: object,
 *     data?: any,
 *     retries?: number,             // 0..10
 *     timeoutMs?: number            // 0..60000
 *   }
 *
 * Response — success:
 *   { ok: true, status: number, data: any, environment: string }
 *
 * Response — validation failure: 400 { ok: false, error, details }
 * Response — Nango not configured: 503 { ok: false, error, code }
 * Response — upstream failure: 502 { ok: false, error }
 */

import { NextResponse } from "next/server";
import { proxyRequest, validateProxyRequest } from "@/lib/adapters/integrations/nango";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  let validated;
  try {
    validated = validateProxyRequest(body);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message, details: error.details || null },
      { status: 400 }
    );
  }

  try {
    const result = await proxyRequest(validated);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error.code === "NANGO_NOT_CONFIGURED" || error.code === "NANGO_SDK_UNAVAILABLE" || error.code === "NANGO_SDK_SHAPE") {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error?.message || "nango proxy failed" },
      { status: 502 }
    );
  }
}

export { POST };
