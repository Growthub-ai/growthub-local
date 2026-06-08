/**
 * POST /api/workspace/sandbox-scheduler
 *
 * Inbound receiver for growthub-sandbox-run-v1 envelopes. Serverless sandbox
 * rows point an API Registry record at this route; the outbound shape matches
 * local adapter responses (stdout / stderr / exitCode).
 */

import { NextResponse } from "next/server";

const ENVELOPE_KIND = "growthub-sandbox-run-v1";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "invalid JSON body",
      error: "invalid JSON body"
    }, { status: 400 });
  }

  if (String(body?.kind || "") !== ENVELOPE_KIND) {
    return NextResponse.json({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: `expected kind ${ENVELOPE_KIND}`,
      error: `expected kind ${ENVELOPE_KIND}`
    }, { status: 400 });
  }

  const objectId = String(body?.objectId || "").trim();
  const name = String(body?.name || "").trim();
  const runId = String(body?.runId || "").trim() || `scheduler-${Date.now()}`;
  const startedAt = Date.now();

  const command = String(body?.sandbox?.command || "").trim();
  const stdout = command
    ? `scheduler-ack:${objectId}:${name}:command-received`
    : `scheduler-ack:${objectId}:${name}`;

  return NextResponse.json({
    ok: true,
    runId,
    exitCode: 0,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr: "",
    adapterMeta: {
      locality: "serverless",
      receiver: "sandbox-scheduler",
      objectId,
      name,
      receivedAt: new Date().toISOString()
    }
  });
}

export { POST };
