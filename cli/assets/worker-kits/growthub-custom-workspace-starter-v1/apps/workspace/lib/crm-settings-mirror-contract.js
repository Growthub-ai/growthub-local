/**
 * CRM Settings Mirror — Phase 1 contract (governed Data Model).
 *
 * Mirrors Twenty CRM workspace toggles one-to-one inside growthub.config.json
 * as rows on the well-known `crm-settings-mirror` object (objectType: crm-settings).
 * Agents and background modules read the same artifact the admin surface will
 * control in Phase 2; no parallel settings store.
 *
 * @see apps/workspace/docs/crm-settings-mirror-primitive.md
 */

/** Well-known dataModel.objects[].id — single mirror object per workspace. */
const CRM_SETTINGS_OBJECT_ID = "crm-settings-mirror";
const CRM_SETTINGS_LABEL = "CRM Settings Mirror";
const CRM_SETTINGS_OBJECT_TYPE = "crm-settings";

/** Admin nav divider exposure (Phase 2 wires UI; schema is stable in Phase 1). */
const CRM_ADMIN_EXPOSURES = ["above-divider", "below-divider", "agent-only"];

/** Customer-journey grouping for agent normalization. */
const CRM_SETTING_CATEGORIES = [
  "identity",
  "visibility",
  "objects",
  "integrations",
  "automation",
  "team",
  "security"
];

/**
 * Canonical twenty toggles — stable keys align with growthub-twenty-crm-v1
 * workspace checklist sections (Settings > General, Members, Objects, etc.).
 * externalMirrorKey is the Twenty-side setting identifier when bridged.
 */
const CRM_SETTINGS_CATALOG = [
  {
    key: "workspace-branding-visible",
    label: "Workspace branding visible",
    description: "Show workspace name and logo on client-facing surfaces.",
    category: "identity",
    defaultEnabled: true,
    defaultAdminExposure: "above-divider",
    externalMirrorKey: "workspace.displayBranding"
  },
  {
    key: "client-portal-enabled",
    label: "Client portal enabled",
    description: "Expose client portal navigation and delivery dashboards.",
    category: "visibility",
    defaultEnabled: false,
    defaultAdminExposure: "above-divider",
    externalMirrorKey: "workspace.clientPortal"
  },
  {
    key: "pipeline-board-enabled",
    label: "Pipeline board enabled",
    description: "Show opportunity pipeline board to sales members.",
    category: "visibility",
    defaultEnabled: true,
    defaultAdminExposure: "above-divider",
    externalMirrorKey: "objects.opportunity.pipelineBoard"
  },
  {
    key: "lead-capture-enabled",
    label: "Lead capture enabled",
    description: "Allow creating Person records from lead-capture flows.",
    category: "objects",
    defaultEnabled: true,
    defaultAdminExposure: "above-divider",
    externalMirrorKey: "objects.person.leadCapture"
  },
  {
    key: "person-object-visible",
    label: "Person object visible",
    description: "Person standard object appears in member navigation.",
    category: "objects",
    defaultEnabled: true,
    defaultAdminExposure: "above-divider",
    externalMirrorKey: "objects.person.enabled"
  },
  {
    key: "company-object-visible",
    label: "Company object visible",
    description: "Company standard object appears in member navigation.",
    category: "objects",
    defaultEnabled: true,
    defaultAdminExposure: "above-divider",
    externalMirrorKey: "objects.company.enabled"
  },
  {
    key: "opportunity-object-visible",
    label: "Opportunity object visible",
    description: "Opportunity standard object appears in member navigation.",
    category: "objects",
    defaultEnabled: true,
    defaultAdminExposure: "above-divider",
    externalMirrorKey: "objects.opportunity.enabled"
  },
  {
    key: "custom-objects-visible",
    label: "Custom objects visible",
    description: "Custom metadata objects appear above the nav divider.",
    category: "objects",
    defaultEnabled: false,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "objects.custom.navExposure"
  },
  {
    key: "email-sync-enabled",
    label: "Email sync enabled",
    description: "Mailbox sync integration is active for the workspace.",
    category: "integrations",
    defaultEnabled: false,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "integrations.email.sync"
  },
  {
    key: "enrichment-pipeline-enabled",
    label: "Enrichment pipeline enabled",
    description: "Inbound enrichment (Apollo/Clay/webhook) may update CRM records.",
    category: "integrations",
    defaultEnabled: false,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "integrations.enrichment.pipeline"
  },
  {
    key: "workflow-automations-enabled",
    label: "Workflow automations enabled",
    description: "Twenty workflow automations may run in production.",
    category: "automation",
    defaultEnabled: false,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "workflows.automations.live"
  },
  {
    key: "inbound-webhooks-enabled",
    label: "Inbound webhooks enabled",
    description: "Accept inbound provider webhooks into the CRM workspace.",
    category: "integrations",
    defaultEnabled: false,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "integrations.webhooks.inbound"
  },
  {
    key: "api-token-access-enabled",
    label: "API token access enabled",
    description: "Workspace API tokens may be used for external integrations.",
    category: "security",
    defaultEnabled: false,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "security.apiTokens.enabled"
  },
  {
    key: "team-invites-enabled",
    label: "Team invites enabled",
    description: "Admins may invite new workspace members.",
    category: "team",
    defaultEnabled: true,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "members.invites.open"
  },
  {
    key: "reporting-dashboard-visible",
    label: "Reporting dashboard visible",
    description: "Executive reporting dashboards appear in member navigation.",
    category: "visibility",
    defaultEnabled: false,
    defaultAdminExposure: "above-divider",
    externalMirrorKey: "reporting.dashboard.visible"
  },
  {
    key: "notes-visible-to-members",
    label: "Notes visible to members",
    description: "Non-admin members can read Note records on assigned targets.",
    category: "objects",
    defaultEnabled: true,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "objects.note.memberRead"
  },
  {
    key: "tasks-assignable-by-members",
    label: "Tasks assignable by members",
    description: "Members may assign Task records without admin role.",
    category: "objects",
    defaultEnabled: true,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "objects.task.memberAssign"
  },
  {
    key: "notification-webhooks-enabled",
    label: "Notification webhooks enabled",
    description: "Outbound notification webhooks (Slack, etc.) are active.",
    category: "integrations",
    defaultEnabled: false,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "integrations.notifications.webhook"
  },
  {
    key: "integration-catalog-visible",
    label: "Integration catalog visible",
    description: "Settings > Integrations catalog is visible to operators.",
    category: "visibility",
    defaultEnabled: true,
    defaultAdminExposure: "below-divider",
    externalMirrorKey: "integrations.catalog.visible"
  },
  {
    key: "go-live-lock-enabled",
    label: "Go-live lock enabled",
    description: "Restrict draft schema and automation edits after production sign-off.",
    category: "security",
    defaultEnabled: false,
    defaultAdminExposure: "agent-only",
    externalMirrorKey: "workspace.goLive.lock"
  }
];

const CRM_SETTINGS_KEY_SET = new Set(CRM_SETTINGS_CATALOG.map((entry) => entry.key));
const CRM_SETTINGS_BY_KEY = Object.fromEntries(CRM_SETTINGS_CATALOG.map((entry) => [entry.key, entry]));

/** Row columns persisted under dataModel.objects[] (crm-settings-mirror). */
const CRM_SETTINGS_ROW_COLUMNS = [
  "key",
  "enabled",
  "adminExposure",
  "updatedAt",
  "mirroredAt"
];

function coerceBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function defaultCrmSettingsRows() {
  return CRM_SETTINGS_CATALOG.map((entry) => ({
    key: entry.key,
    enabled: entry.defaultEnabled,
    adminExposure: entry.defaultAdminExposure,
    updatedAt: "",
    mirroredAt: ""
  }));
}

function normalizeCrmSettingsRow(row) {
  const catalog = CRM_SETTINGS_BY_KEY[String(row?.key || "").trim()];
  if (!catalog) return null;
  const adminExposureRaw = String(row?.adminExposure || catalog.defaultAdminExposure).trim();
  const adminExposure = CRM_ADMIN_EXPOSURES.includes(adminExposureRaw)
    ? adminExposureRaw
    : catalog.defaultAdminExposure;
  return {
    key: catalog.key,
    enabled: coerceBoolean(row?.enabled, catalog.defaultEnabled),
    adminExposure,
    updatedAt: typeof row?.updatedAt === "string" ? row.updatedAt : "",
    mirroredAt: typeof row?.mirroredAt === "string" ? row.mirroredAt : ""
  };
}

/**
 * Merge persisted rows with catalog defaults (exactly one row per catalog key).
 */
function normalizeCrmSettingsRows(rows) {
  const incoming = Array.isArray(rows) ? rows : [];
  const byKey = new Map();
  for (const row of incoming) {
    const normalized = normalizeCrmSettingsRow(row);
    if (normalized) byKey.set(normalized.key, normalized);
  }
  return CRM_SETTINGS_CATALOG.map((entry) => byKey.get(entry.key) || {
    key: entry.key,
    enabled: entry.defaultEnabled,
    adminExposure: entry.defaultAdminExposure,
    updatedAt: "",
    mirroredAt: ""
  });
}

/**
 * Agent-facing snapshot: catalog metadata + resolved enabled flags.
 */
function buildCrmSettingsSnapshot(rows) {
  const normalized = normalizeCrmSettingsRows(rows);
  return {
    objectId: CRM_SETTINGS_OBJECT_ID,
    objectType: CRM_SETTINGS_OBJECT_TYPE,
    settings: normalized.map((row) => {
      const catalog = CRM_SETTINGS_BY_KEY[row.key];
      return {
        ...catalog,
        enabled: row.enabled,
        adminExposure: row.adminExposure,
        updatedAt: row.updatedAt,
        mirroredAt: row.mirroredAt
      };
    }),
    journeySignals: normalized
      .filter((row) => row.enabled)
      .map((row) => ({
        key: row.key,
        category: CRM_SETTINGS_BY_KEY[row.key]?.category,
        adminExposure: row.adminExposure
      }))
  };
}

export {
  CRM_ADMIN_EXPOSURES,
  CRM_SETTING_CATEGORIES,
  CRM_SETTINGS_BY_KEY,
  CRM_SETTINGS_CATALOG,
  CRM_SETTINGS_KEY_SET,
  CRM_SETTINGS_LABEL,
  CRM_SETTINGS_OBJECT_ID,
  CRM_SETTINGS_OBJECT_TYPE,
  CRM_SETTINGS_ROW_COLUMNS,
  buildCrmSettingsSnapshot,
  coerceBoolean,
  defaultCrmSettingsRows,
  normalizeCrmSettingsRow,
  normalizeCrmSettingsRows
};
