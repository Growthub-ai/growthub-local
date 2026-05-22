import { NextResponse } from "next/server";
import { checkClaudeSandboxAuthStatus } from "@/lib/sandbox-agent-auth";

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function POST(request) {
  const body = await parseBody(request);
  const objectId = typeof body?.objectId === "string" ? body.objectId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!objectId || !name) {
    return NextResponse.json({ ok: false, error: "objectId and name are required" }, { status: 400 });
  }

  const result = await checkClaudeSandboxAuthStatus({ objectId, name });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 500 });
  }
  return NextResponse.json(result.payload);
}

export { POST };
