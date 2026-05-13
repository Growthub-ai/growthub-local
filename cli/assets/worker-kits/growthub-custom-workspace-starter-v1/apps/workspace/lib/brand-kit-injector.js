/**
 * Injects BrandKit design tokens as CSS custom properties on :root (browser only).
 * @param {Record<string, unknown> | null | undefined} brandKit
 */
export function injectBrandKitTokens(brandKit) {
  if (typeof document === "undefined" || !brandKit || typeof brandKit !== "object") return;
  const root = document.documentElement;
  const { colors, typography, shape, components } = brandKit;
  if (colors && typeof colors === "object") {
    if (typeof colors.primary === "string") root.style.setProperty("--color-primary", colors.primary);
    if (typeof colors.secondary === "string") root.style.setProperty("--color-secondary", colors.secondary);
    if (typeof colors.accent === "string") root.style.setProperty("--color-accent", colors.accent);
    if (typeof colors.surface === "string") root.style.setProperty("--color-surface", colors.surface);
    if (typeof colors.background === "string") root.style.setProperty("--color-background", colors.background);
    if (typeof colors.border === "string") root.style.setProperty("--color-border", colors.border);
    if (typeof colors.textPrimary === "string") root.style.setProperty("--color-text-primary", colors.textPrimary);
    if (typeof colors.textMuted === "string") root.style.setProperty("--color-text-muted", colors.textMuted);
    if (typeof colors.success === "string") root.style.setProperty("--color-success", colors.success);
    if (typeof colors.warning === "string") root.style.setProperty("--color-warning", colors.warning);
    if (typeof colors.danger === "string") root.style.setProperty("--color-danger", colors.danger);
  }
  if (typography && typeof typography === "object") {
    if (typeof typography.fontFamily === "string") root.style.setProperty("--font-family", typography.fontFamily);
    if (typography.fontSizeBase !== undefined) root.style.setProperty("--font-size-base", String(typography.fontSizeBase));
    if (typography.fontWeightNormal !== undefined) {
      root.style.setProperty("--font-weight-normal", String(typography.fontWeightNormal));
    }
    if (typography.fontWeightMedium !== undefined) {
      root.style.setProperty("--font-weight-medium", String(typography.fontWeightMedium));
    }
    if (typography.fontWeightBold !== undefined) root.style.setProperty("--font-weight-bold", String(typography.fontWeightBold));
    if (typography.lineHeightBase !== undefined) {
      root.style.setProperty("--line-height-base", String(typography.lineHeightBase));
    }
    if (typography.letterSpacing !== undefined) {
      root.style.setProperty("--letter-spacing", String(typography.letterSpacing));
    }
  }
  if (shape && typeof shape === "object") {
    if (typeof shape.borderRadius === "string") root.style.setProperty("--radius-base", shape.borderRadius);
    if (typeof shape.borderRadiusSm === "string") root.style.setProperty("--radius-sm", shape.borderRadiusSm);
    if (typeof shape.borderRadiusLg === "string") root.style.setProperty("--radius-lg", shape.borderRadiusLg);
    if (typeof shape.spacingBase === "string") root.style.setProperty("--spacing-base", shape.spacingBase);
  }
  if (components && typeof components === "object") {
    const { sidebar, header, card, statusChip, tagChip } = components;
    if (sidebar && typeof sidebar.background === "string") root.style.setProperty("--sidebar-bg", sidebar.background);
    if (sidebar && typeof sidebar.textColor === "string") root.style.setProperty("--sidebar-text", sidebar.textColor);
    if (header && typeof header.background === "string") root.style.setProperty("--header-bg", header.background);
    if (header && typeof header.borderBottom === "string") {
      root.style.setProperty("--header-border-bottom", header.borderBottom);
    }
    if (card && typeof card.background === "string") root.style.setProperty("--card-bg", card.background);
    if (card && typeof card.shadow === "string") root.style.setProperty("--card-shadow", card.shadow);
    if (statusChip && typeof statusChip.borderRadius === "string") {
      root.style.setProperty("--status-chip-radius", statusChip.borderRadius);
    }
    if (tagChip && typeof tagChip.borderRadius === "string") {
      root.style.setProperty("--tag-chip-radius", tagChip.borderRadius);
    }
  }
}
