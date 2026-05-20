/**
 * AWaC CRM Settings Mirror — Phase 1 contract (additive, optional).
 *
 * Mirrors twenty workspace-relevant toggles one-to-one inside the governed
 * Data Model as object id `crm-settings` / objectType `crm-settings`.
 * Admin-control metadata (surface, nav exposure) lives in code — not duplicated
 * in growthub.config.json — so the artifact stays sub-MB and diffable.
 *
 * Row shape: singleton `rows[0]` with id `mirror` and twenty boolean fields.
 * Background agents read the same row the admin surface writes; Phase 3+ modules
 * import this contract instead of hardcoding CRM logic elsewhere.
 */

const CRM_SETTINGS_OBJECT_ID = "crm-settings";
const CRM_SETTINGS_ROW_ID = "mirror";
const CRM_SETTINGS_LABEL = "CRM Settings Mirror";

/** @typedef {"user" | "admin" | "agent"} CrmSettingsSurface */
/** @typedef {"above-divider" | "below-divider" | "none"} CrmSettingsNavExposure */

/**
 * Canonical twenty toggles — stable keys for external CRM 1:1 mirror.
 * @type {ReadonlyArray<{
 *   key: string,
 *   label: string,
 *   description: string,
 *   surface: CrmSettingsSurface,
 *   navExposure: CrmSettingsNavExposure,
 *   defaultValue: boolean
 * }>}
 */
const CRM_SETTINGS_DEFINITIONS = Object.freeze([
  {
    key: "userShowFoldersNav",
    label: "Folders navigation",
    description: "Show custom folders in the workspace rail (user surface).",
    surface: "user",
    navExposure: "none",
    defaultValue: true
  },
  {
    key: "userShowHelperChat",
    label: "Helper chat",
    description: "Show the Chat tab and helper thread list.",
    surface: "user",
    navExposure: "none",
    defaultValue: true
  },
  {
    key: "userShowDashboardBuilder",
    label: "Dashboard builder",
    description: "Enable the dashboard builder canvas and dashboard shortcuts.",
    surface: "user",
    navExposure: "none",
    defaultValue: true
  },
  {
    key: "userShowDataModelNav",
    label: "Data Model navigation",
    description: "Show Data Model in the workspace navigation.",
    surface: "user",
    navExposure: "none",
    defaultValue: true
  },
  {
    key: "userShowManagementNav",
    label: "Management navigation",
    description: "Show Management in the workspace navigation.",
    surface: "user",
    navExposure: "none",
    defaultValue: true
  },
  {
    key: "userShowIntegrationsSettings",
    label: "Integrations settings",
    description: "Expose Integrations under workspace settings.",
    surface: "user",
    navExposure: "none",
    defaultValue: true
  },
  {
    key: "userShowCustomerJourneyHints",
    label: "Customer journey hints",
    description: "Surface in-product journey hints derived from mirrored settings.",
    surface: "user",
    navExposure: "none",
    defaultValue: false
  },
  {
    key: "adminExposeFolderControls",
    label: "Folder controls (admin)",
    description: "Super-admin folder create and item wiring above the nav divider.",
    surface: "admin",
    navExposure: "above-divider",
    defaultValue: true
  },
  {
    key: "adminExposeNavCustomize",
    label: "Nav customize (admin)",
    description: "Super-admin NavCustomize overlay for folder and item styling.",
    surface: "admin",
    navExposure: "above-divider",
    defaultValue: true
  },
  {
    key: "adminExposeManagementRail",
    label: "Management rail (admin)",
    description: "Expose the Management slot in the workspace rail above the divider.",
    surface: "admin",
    navExposure: "above-divider",
    defaultValue: true
  },
  {
    key: "adminExposeSandboxPicker",
    label: "Sandbox picker (admin)",
    description: "Show sandbox-environment in the governed object picker below the divider.",
    surface: "admin",
    navExposure: "below-divider",
    defaultValue: false
  },
  {
    key: "adminExposeApiRegistryPicker",
    label: "API Registry picker (admin)",
    description: "Show api-registry objects in the picker below the divider.",
    surface: "admin",
    navExposure: "below-divider",
    defaultValue: false
  },
  {
    key: "adminExposeHiddenObjects",
    label: "Hidden objects (admin)",
    description: "Allow super-admins to inspect helper-owned hidden objects below the divider.",
    surface: "admin",
    navExposure: "below-divider",
    defaultValue: false
  },
  {
    key: "adminAllowRailDividerOverrides",
    label: "Divider overrides (admin)",
    description: "Allow moving nav exposure across the divider without bypassing governance.",
    surface: "admin",
    navExposure: "below-divider",
    defaultValue: false
  },
  {
    key: "agentEnableBackgroundModule",
    label: "Background agent module",
    description: "Enable the AWaC CRM background agent runtime module.",
    surface: "agent",
    navExposure: "none",
    defaultValue: false
  },
  {
    key: "agentEnableSettingsRead",
    label: "CRM settings read",
    description: "Allow the background agent to read mirrored CRM settings from config.",
    surface: "agent",
    navExposure: "none",
    defaultValue: false
  },
  {
    key: "agentEnableActionProposals",
    label: "CRM action proposals",
    description: "Agent may propose CRM actions; direct mutation remains forbidden.",
    surface: "agent",
    navExposure: "none",
    defaultValue: false
  },
  {
    key: "agentEnableJourneyNormalize",
    label: "Journey normalization",
    description: "Normalize customer journey / UX signals from mirrored toggles.",
    surface: "agent",
    navExposure: "none",
    defaultValue: false
  },
  {
    key: "agentEnableValidatedDispatch",
    label: "Validated dispatch",
    description: "Allow authority-gated dispatch after validation (never direct mutate).",
    surface: "agent",
    navExposure: "none",
    defaultValue: false
  },
  {
    key: "agentEnableCrmTrace",
    label: "CRM trace logging",
    description: "Emit trace events on CRM setting reads and validated dispatches.",
    surface: "agent",
    navExposure: "none",
    defaultValue: true
  }
]);

const CRM_SETTINGS_KEYS = Object.freeze(CRM_SETTINGS_DEFINITIONS.map((d) => d.key));
const CRM_SETTINGS_KEY_SET = new Set(CRM_SETTINGS_KEYS);
const CRM_SETTINGS_DEFAULTS = Object.freeze(
  CRM_SETTINGS_DEFINITIONS.reduce((acc, def) => {
    acc[def.key] = def.defaultValue;
    return acc;
  }, /** @type {Record<string, boolean>} */ ({}))
);

const CRM_SETTINGS_MIRROR_COLUMNS = Object.freeze([
  "id",
  "updatedAt",
  "updatedBy",
  "externalSource",
  ...CRM_SETTINGS_KEYS
]);

function getCrmSettingDefinition(key) {
  return CRM_SETTINGS_DEFINITIONS.find((d) => d.key === key) || null;
}

function listCrmSettingsBySurface(surface) {
  return CRM_SETTINGS_DEFINITIONS.filter((d) => d.surface === surface);
}

function listCrmSettingsByNavExposure(navExposure) {
  return CRM_SETTINGS_DEFINITIONS.filter((d) => d.navExposure === navExposure);
}

/**
 * Build the singleton mirror row with defaults for any omitted toggle.
 * @param {Record<string, unknown>} [partial]
 */
function buildDefaultCrmSettingsMirrorRow(partial = {}) {
  const row = {
    id: CRM_SETTINGS_ROW_ID,
    updatedAt: typeof partial.updatedAt === "string" ? partial.updatedAt : "",
    updatedBy: typeof partial.updatedBy === "string" ? partial.updatedBy : "",
    externalSource: typeof partial.externalSource === "string" ? partial.externalSource : ""
  };
  for (const key of CRM_SETTINGS_KEYS) {
    row[key] = typeof partial[key] === "boolean" ? partial[key] : CRM_SETTINGS_DEFAULTS[key];
  }
  return row;
}

/**
 * Merge persisted row with defaults; unknown keys are stripped.
 * @param {Record<string, unknown>} [row]
 */
function normalizeCrmSettingsMirrorRow(row = {}) {
  const partial = {};
  for (const key of CRM_SETTINGS_KEYS) {
    if (typeof row[key] === "boolean") partial[key] = row[key];
  }
  if (typeof row.updatedAt === "string") partial.updatedAt = row.updatedAt;
  if (typeof row.updatedBy === "string") partial.updatedBy = row.updatedBy;
  if (typeof row.externalSource === "string") partial.externalSource = row.externalSource;
  return buildDefaultCrmSettingsMirrorRow(partial);
}

/**
 * Customer journey / UX signal map for agent surface (read-only projection).
 * @param {Record<string, unknown>} [row]
 */
function projectCustomerJourneySignals(row = {}) {
  const normalized = normalizeCrmSettingsMirrorRow(row);
  return {
    foldersEnabled: normalized.userShowFoldersNav,
    helperChatEnabled: normalized.userShowHelperChat,
    dashboardBuilderEnabled: normalized.userShowDashboardBuilder,
    dataModelNavEnabled: normalized.userShowDataModelNav,
    managementNavEnabled: normalized.userShowManagementNav,
    integrationsEnabled: normalized.userShowIntegrationsSettings,
    journeyHintsEnabled: normalized.userShowCustomerJourneyHints,
    agentReadEnabled: normalized.agentEnableSettingsRead,
    agentProposalsEnabled: normalized.agentEnableActionProposals,
    traceEnabled: normalized.agentEnableCrmTrace
  };
}

export {
  CRM_SETTINGS_OBJECT_ID,
  CRM_SETTINGS_ROW_ID,
  CRM_SETTINGS_LABEL,
  CRM_SETTINGS_DEFINITIONS,
  CRM_SETTINGS_KEYS,
  CRM_SETTINGS_KEY_SET,
  CRM_SETTINGS_DEFAULTS,
  CRM_SETTINGS_MIRROR_COLUMNS,
  buildDefaultCrmSettingsMirrorRow,
  getCrmSettingDefinition,
  listCrmSettingsBySurface,
  listCrmSettingsByNavExposure,
  normalizeCrmSettingsMirrorRow,
  projectCustomerJourneySignals
};
