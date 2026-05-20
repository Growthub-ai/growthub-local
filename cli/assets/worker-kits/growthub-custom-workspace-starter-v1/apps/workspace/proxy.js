import { NextResponse } from "next/server";
import { getSessionFromRequest, isGateEnabled } from "./lib/auth.js";

const PUBLIC_PATH_PREFIXES = ["/login", "/api/auth/"];

/**
 * Next.js 16 Proxy (formerly middleware) — env-var login gate for workspace routes.
 * @param {import('next/server').NextRequest} request
 */
export function proxy(request) {
  if (!isGateEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && getSessionFromRequest(request)) {
      const next = request.nextUrl.searchParams.get("next") || "/";
      return NextResponse.redirect(new URL(safeNextPath(next), request.url));
    }
    return NextResponse.next();
  }

  if (getSessionFromRequest(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  }
  return NextResponse.redirect(loginUrl);
}

/**
 * @param {string} pathname
 */
function isPublicPath(pathname) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}`));
}

/**
 * @param {string} nextPath
 */
function safeNextPath(nextPath) {
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return "/";
  if (nextPath.startsWith("/login")) return "/";
  return nextPath;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
