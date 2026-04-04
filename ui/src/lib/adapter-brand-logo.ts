/** Paths are served from `ui/public` (e.g. `/brands/claude.png`). */

export function adapterBrandLogoSrc(adapterType: string): string | null {
  switch (adapterType) {
    case "claude_local":
      return "/brands/claude.png";
    case "codex_local":
      return "/brands/codex.png";
    case "gemini_local":
      return "/brands/gemini.png";
    case "cursor":
      return "/brands/cursor.webp";
    default:
      return null;
  }
}
