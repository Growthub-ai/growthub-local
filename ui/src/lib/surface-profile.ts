export type SurfaceProfile = "dx" | "gtm";

function readSurfaceProfile(): SurfaceProfile {
  const meta = document.querySelector('meta[name="paperclip-surface-profile"]');
  const content = meta?.getAttribute("content")?.trim().toLowerCase();
  return content === "gtm" ? "gtm" : "dx";
}

export const surfaceProfile = readSurfaceProfile();
export const surfaceRouteMount = surfaceProfile === "gtm" ? "/gtm" : "/dx";

export function toSurfacePath(path = ""): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return surfaceRouteMount;
  if (normalized.startsWith(`${surfaceRouteMount}/`)) return normalized;
  return `${surfaceRouteMount}${normalized}`;
}
