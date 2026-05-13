/**
 * Default BrandKit v1 token object — merged under growthub.config.json#branding.brandKit
 */

/** @typedef {{
 *   version: string,
 *   colors: Record<string, string|boolean>,
 *   typography: Record<string, string|number>,
 *   shape: Record<string, string>,
 *   components: Record<string, Record<string, string>>
 * }} BrandKitV1 */

/** @type {BrandKitV1} */
export const DEFAULT_BRAND_KIT = {
  version: "v1",
  colors: {
    primary: "#3f68ff",
    secondary: "#6366f1",
    accent: "#f59e0b",
    surface: "#ffffff",
    background: "#f8fafc",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textMuted: "#64748b",
    success: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    darkMode: false
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
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
    sidebar: {
      background: "#1e293b",
      textColor: "#f1f5f9"
    },
    header: {
      background: "#ffffff",
      borderBottom: "1px solid #e2e8f0"
    },
    card: {
      background: "#ffffff",
      shadow: "0 1px 3px rgba(0,0,0,0.07)"
    },
    statusChip: {
      borderRadius: "999px"
    },
    tagChip: {
      borderRadius: "4px"
    }
  }
};

/**
 * @param {unknown} raw
 * @returns {BrandKitV1}
 */
export function mergeBrandKitDefaults(raw) {
  const base = structuredClone(DEFAULT_BRAND_KIT);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  return {
    version: typeof raw.version === "string" ? raw.version : base.version,
    colors: { ...base.colors, ...(typeof raw.colors === "object" && raw.colors && !Array.isArray(raw.colors) ? raw.colors : {}) },
    typography: {
      ...base.typography,
      ...(typeof raw.typography === "object" && raw.typography && !Array.isArray(raw.typography) ? raw.typography : {})
    },
    shape: {
      ...base.shape,
      ...(typeof raw.shape === "object" && raw.shape && !Array.isArray(raw.shape) ? raw.shape : {})
    },
    components: {
      ...base.components,
      ...(typeof raw.components === "object" && raw.components && !Array.isArray(raw.components) ? raw.components : {})
    }
  };
}
