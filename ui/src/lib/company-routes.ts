const BOARD_ROUTE_ROOTS = new Set([
  "dashboard",
  "companies",
  "company",
  "org",
  "agents",
  "projects",
  "tickets",
  "issues",
  "goals",
  "approvals",
  "costs",
  "usage",
  "activity",
  "inbox",
  "design-guide",
  "archive",
]);

const GLOBAL_ROUTE_ROOTS = new Set(["auth", "invite", "board-claim", "docs", "instance"]);
const SURFACE_ROUTE_ROOTS = new Set(["dx", "gtm"]);

export function normalizeCompanyPrefix(prefix: string): string {
  return prefix.trim().toUpperCase();
}

function splitPath(path: string): { pathname: string; search: string; hash: string } {
  const match = path.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return {
    pathname: match?.[1] ?? path,
    search: match?.[2] ?? "",
    hash: match?.[3] ?? "",
  };
}

function getRootSegment(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment ?? null;
}

function stripSurfaceRoot(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0 || !SURFACE_ROUTE_ROOTS.has(segments[0]!.toLowerCase())) {
    return pathname;
  }

  const stripped = segments.slice(1).join("/");
  return stripped.length > 0 ? `/${stripped}` : "/";
}

export function extractSurfaceRootFromPath(pathname: string): "/dx" | "/gtm" | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0]!.toLowerCase();
  if (first === "dx") return "/dx";
  if (first === "gtm") return "/gtm";
  return null;
}

export function isGlobalPath(pathname: string): boolean {
  const normalizedPathname = stripSurfaceRoot(pathname);
  if (normalizedPathname === "/") return true;
  const root = getRootSegment(normalizedPathname);
  if (!root) return true;
  return GLOBAL_ROUTE_ROOTS.has(root.toLowerCase());
}

export function isBoardPathWithoutPrefix(pathname: string): boolean {
  const root = getRootSegment(stripSurfaceRoot(pathname));
  if (!root) return false;
  return BOARD_ROUTE_ROOTS.has(root.toLowerCase());
}

export function extractCompanyPrefixFromPath(pathname: string): string | null {
  const segments = stripSurfaceRoot(pathname).split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0]!.toLowerCase();
  if (GLOBAL_ROUTE_ROOTS.has(first) || BOARD_ROUTE_ROOTS.has(first)) {
    return null;
  }
  return normalizeCompanyPrefix(segments[0]!);
}

export function applyCompanyPrefix(
  path: string,
  companyPrefix: string | null | undefined,
  activeSurfaceRoot?: "/dx" | "/gtm" | null,
): string {
  const { pathname, search, hash } = splitPath(path);
  if (!pathname.startsWith("/")) return path;
  const surfaceRoot =
    activeSurfaceRoot ?? extractSurfaceRootFromPath(pathname) ?? "";
  const scopedPathname = stripSurfaceRoot(pathname);
  if (isGlobalPath(scopedPathname)) return path;
  if (!companyPrefix) return path;

  const prefix = normalizeCompanyPrefix(companyPrefix);
  const activePrefix = extractCompanyPrefixFromPath(scopedPathname);
  if (activePrefix) return path;

  const base = `${surfaceRoot}/${prefix}${scopedPathname}`.replace(/\/{2,}/g, "/");
  return `${base}${search}${hash}`;
}

export function toCompanyRelativePath(path: string): string {
  const { pathname, search, hash } = splitPath(path);
  const segments = stripSurfaceRoot(pathname).split("/").filter(Boolean);

  if (segments.length >= 2) {
    const second = segments[1]!.toLowerCase();
    if (!GLOBAL_ROUTE_ROOTS.has(segments[0]!.toLowerCase()) && BOARD_ROUTE_ROOTS.has(second)) {
      return `/${segments.slice(1).join("/")}${search}${hash}`;
    }
  }

  return `${pathname}${search}${hash}`;
}
