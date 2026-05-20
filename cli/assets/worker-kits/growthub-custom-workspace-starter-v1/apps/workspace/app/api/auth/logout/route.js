import { NextResponse } from "next/server";
import { buildSessionClearCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", buildSessionClearCookie());
  return response;
}
