/**
 * POST /api/workspace/add-ons/[providerId]/callback
 *
 * Signed success callback for a scheduled serverless run. Verifies the provider
 * signature and synchronizes the last response into workspace config. Thin
 * wrapper over the shared, provider-agnostic handler.
 */

import { NextResponse } from "next/server";
import { handleSchedulerCallback } from "@/lib/workspace-add-on-callback";

async function POST(request, context) {
  const params = await context?.params;
  const { status, body } = await handleSchedulerCallback({
    request,
    providerId: params?.providerId,
    kind: "callback",
  });
  return NextResponse.json(body, { status });
}

function HEAD() {
  return new Response(null, { status: 200 });
}

function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "HEAD, OPTIONS, POST",
    },
  });
}

export { HEAD, OPTIONS, POST };
