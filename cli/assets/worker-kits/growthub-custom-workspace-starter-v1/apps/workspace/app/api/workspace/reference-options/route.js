/**
 * POST /api/workspace/reference-options
 *
 * Lazy, status-aware reference picker backing store. No provider tokens in/out.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { validateReferenceOptionsRequest } from "@/lib/data-model/reference-option-schema";
import { collectReferenceOptions } from "@/lib/adapters/references/collect-reference-options";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = validateReferenceOptionsRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.errors.join("; ") },
      { status: 400 }
    );
  }

  let workspaceConfig;
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `failed to read workspace config: ${err.message}` },
      { status: 500 }
    );
  }

  const result = await collectReferenceOptions(workspaceConfig, parsed.value);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        options: [],
        nextCursor: null,
        reason: result.reason,
        error: result.error || "reference resolution failed"
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    options: result.options,
    nextCursor: result.nextCursor ?? null,
    reason: result.reason ?? null,
    total: result.total,
    resolverIntegrationId: result.resolverIntegrationId
  });
}

export { POST };
