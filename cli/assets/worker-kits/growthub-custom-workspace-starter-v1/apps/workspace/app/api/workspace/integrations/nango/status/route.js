/**
 * GET /api/workspace/integrations/nango/status
 *
 * Returns Nango connection health for the no-code Integrations panel.
 *
 * Query parameters (all optional):
 *   - providerConfigKey  probe a specific provider connection
 *   - connectionId       probe a specific connection (paired with providerConfigKey)
 *   - mode               override mode for the probe ("cloud" | "self-hosted")
 *   - hostUrl            override host URL for self-hosted probes
 *
 * Response shape:
 *   { status: "connected" | "disconnected" | "unconfigured", ... }
 *
 * Authority contract: never returns the Nango secret key. Never echoes
 * credential-shaped fields from upstream SDK responses.
 */

import { NextResponse } from "next/server";
import { getStatus, validateConnectionStatusRequest } from "@/lib/adapters/integrations/nango";

async function GET(request) {
  const url = new URL(request.url);
  const raw = {
    providerConfigKey: url.searchParams.get("providerConfigKey") || undefined,
    connectionId: url.searchParams.get("connectionId") || undefined,
    mode: url.searchParams.get("mode") || undefined,
    hostUrl: url.searchParams.get("hostUrl") || undefined
  };
  let input;
  try {
    input = validateConnectionStatusRequest(raw);
  } catch (error) {
    return NextResponse.json(
      { error: error.message, details: error.details || null },
      { status: 400 }
    );
  }
  try {
    const result = await getStatus(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "nango status probe failed" },
      { status: 500 }
    );
  }
}

export { GET };
