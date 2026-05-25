/**
 * GET /api/workspace/integrations/nango/actions
 *
 * Lists the actions declared in `nango.yaml` for a given provider config key
 * (or, when no key is provided, returns the full discoverable set). The
 * response shape is MCP-compatible: each action exposes a name and (when
 * provided by Nango) an input/output schema.
 *
 * Query parameters (optional):
 *   - providerConfigKey  filter to actions for a single provider
 *
 * Response shape:
 *   { ok: true, providerConfigKey, probedShape, actions: Array, hint: string|null }
 */

import { NextResponse } from "next/server";
import { listActions, validateActionsListInput } from "@/lib/adapters/integrations/nango";

async function GET(request) {
  const url = new URL(request.url);
  const raw = {
    providerConfigKey: url.searchParams.get("providerConfigKey") || undefined
  };
  let input;
  try {
    input = validateActionsListInput(raw);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message, details: error.details || null },
      { status: 400 }
    );
  }
  try {
    const result = await listActions(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error.code === "NANGO_NOT_CONFIGURED" || error.code === "NANGO_SDK_UNAVAILABLE") {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error?.message || "nango actions list failed" },
      { status: 502 }
    );
  }
}

export { GET };
