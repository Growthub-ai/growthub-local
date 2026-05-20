import { NextResponse } from "next/server";
import { buildClearSessionCookie, isGateEnabled } from "@/lib/auth.js";

/**
 * POST /api/auth/logout — clears the workspace session cookie.
 */
export async function POST() {
  if (!isGateEnabled()) {
    return NextResponse.json({ ok: true });
  }
  const response = NextResponse.json({ ok: true, redirectTo: "/login" });
  response.headers.set("Set-Cookie", buildClearSessionCookie());
  return response;
}
