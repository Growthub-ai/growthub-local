import { NextResponse } from "next/server";
import {
  buildSessionCookie,
  createSessionToken,
  isGateEnabled,
  readGateConfig,
  verifyGateCredentials
} from "@/lib/auth.js";

/**
 * POST /api/auth/login — env-var credential check; session cookie is httpOnly.
 */
export async function POST(request) {
  if (!isGateEnabled()) {
    return NextResponse.json({ ok: false, error: "gate_disabled" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!verifyGateCredentials(username, password)) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const config = readGateConfig();
  const token = createSessionToken(config.username);
  const response = NextResponse.json({ ok: true, redirectTo: sanitizeNext(body?.next) });
  response.headers.set("Set-Cookie", buildSessionCookie(token));
  return response;
}

/**
 * @param {unknown} next
 */
function sanitizeNext(next) {
  const value = typeof next === "string" ? next.trim() : "";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}
