import { NextResponse } from "next/server";
import {
  buildSessionSetCookie,
  isAuthGateEnabled,
  verifyCredentials
} from "@/lib/auth";

export async function POST(request) {
  if (!isAuthGateEnabled()) {
    return NextResponse.json(
      { error: "auth gate is not enabled", hint: "Set GROWTHUB_WORKSPACE_AUTH_GATE=enabled with gate credentials." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const token = typeof body?.token === "string" ? body.token : "";

  if (!verifyCredentials(username, password, token)) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", buildSessionSetCookie());
  return response;
}
