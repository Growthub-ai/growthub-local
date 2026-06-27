/**
 * POST /api/workspace/add-ons/[providerId]/failure
 *
 * Signed failure callback for a scheduled serverless run. Same verification +
 * synchronization path as the success callback, recording the failure reason
 * into workspace config so a broken scheduled run is visible, not silent.
 */

import { NextResponse } from "next/server";
import { handleSchedulerCallback } from "@/lib/workspace-add-on-callback";

async function POST(request, context) {
  const params = await context?.params;
  const { status, body } = await handleSchedulerCallback({
    request,
    providerId: params?.providerId,
    kind: "failure",
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
