import { NextResponse } from "next/server";
import { hasValidSessionCookie, isAuthGateEnabled } from "./lib/auth.js";

const PUBLIC_PATHS = new Set(["/login"]);

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

export function proxy(request) {
  if (!isAuthGateEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const cookieHeader = request.headers.get("cookie") || "";
  if (hasValidSessionCookie(cookieHeader)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  const returnTo = `${pathname}${request.nextUrl.search}`;
  if (returnTo && returnTo !== "/login") {
    loginUrl.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
  ]
};
