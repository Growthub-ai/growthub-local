/**
 * Injects branding.brandKit tokens as CSS custom properties on :root.
 * Safe on server (no-op when document is undefined).
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const DEFAULT_BRAND_KIT = {
  version: "v1",
  colors: {
    primary: "#3f68ff",
    secondary: "#6366f1",
    accent: "#f59e0b",
    surface: "#111827",
    background: "#080b12",
    border: "#223047",
    textPrimary: "#f7fafc",
    textMuted: "#93a3b8",
    success: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    darkMode: true
  },
  typography: {
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "14px",
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    lineHeightBase: "1.5",
    letterSpacing: "0em"
  },
  shape: {
    borderRadius: "8px",
    borderRadiusSm: "4px",
    borderRadiusLg: "12px",
    spacingBase: "4px"
  },
  components: {
    sidebar: { background: "#0d1118", textColor: "#f1f5f9" },
    header: { background: "#111827", borderBottom: "1px solid #223047" },
    card: { background: "#111827", shadow: "0 1px 3px rgba(0,0,0,0.35)" },
    statusChip: { borderRadius: "999px" },
    tagChip: { borderRadius: "4px" }
  }
};

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch ?? base;
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = base[key];
    out[key] = isPlainObject(pv) && isPlainObject(bv) ? deepMerge(bv, pv) : pv;
  }
  return out;
}

function mergeBrandKitDefaults(brandKit) {
  return deepMerge(DEFAULT_BRAND_KIT, isPlainObject(brandKit) ? brandKit : {});
}

function injectBrandKitTokens(brandKit) {
  if (typeof document === "undefined") return;
  const kit = mergeBrandKitDefaults(brandKit);
  const root = document.documentElement;
  const { colors, typography, shape, components } = kit;

  root.style.setProperty("--color-primary", colors.primary);
  root.style.setProperty("--color-secondary", colors.secondary);
  root.style.setProperty("--color-accent", colors.accent);
  root.style.setProperty("--color-surface", colors.surface);
  root.style.setProperty("--color-background", colors.background);
  root.style.setProperty("--color-border", colors.border);
  root.style.setProperty("--color-text-primary", colors.textPrimary);
  root.style.setProperty("--color-text-muted", colors.textMuted);
  root.style.setProperty("--color-success", colors.success);
  root.style.setProperty("--color-warning", colors.warning);
  root.style.setProperty("--color-danger", colors.danger);

  root.style.setProperty("--font-family", typography.fontFamily);
  root.style.setProperty("--font-size-base", typography.fontSizeBase);
  root.style.setProperty("--font-weight-normal", String(typography.fontWeightNormal));
  root.style.setProperty("--font-weight-medium", String(typography.fontWeightMedium));
  root.style.setProperty("--font-weight-bold", String(typography.fontWeightBold));
  root.style.setProperty("--line-height-base", typography.lineHeightBase);
  root.style.setProperty("--letter-spacing", typography.letterSpacing);

  root.style.setProperty("--radius-base", shape.borderRadius);
  root.style.setProperty("--radius-sm", shape.borderRadiusSm);
  root.style.setProperty("--radius-lg", shape.borderRadiusLg);
  root.style.setProperty("--spacing-base", shape.spacingBase);

  if (components?.sidebar) {
    root.style.setProperty("--sidebar-bg", components.sidebar.background);
    root.style.setProperty("--sidebar-text", components.sidebar.textColor);
  }
  if (components?.header) {
    root.style.setProperty("--header-bg", components.header.background);
    root.style.setProperty("--header-border-bottom", components.header.borderBottom);
  }
  if (components?.card) {
    root.style.setProperty("--card-bg", components.card.background);
    root.style.setProperty("--card-shadow", components.card.shadow);
  }
  if (components?.statusChip) {
    root.style.setProperty("--status-chip-radius", components.statusChip.borderRadius);
  }
  if (components?.tagChip) {
    root.style.setProperty("--tag-chip-radius", components.tagChip.borderRadius);
  }

  if (colors.darkMode) {
    root.style.colorScheme = "dark";
  } else {
    root.style.colorScheme = "light";
  }
}

export { DEFAULT_BRAND_KIT, deepMerge, injectBrandKitTokens, mergeBrandKitDefaults };
