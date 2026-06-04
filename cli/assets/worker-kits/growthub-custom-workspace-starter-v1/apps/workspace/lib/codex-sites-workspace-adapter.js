const CODEX_SITES_OBJECT_ID = "workspace-codex-sites";
const CODEX_SITES_COLUMNS = [
  "Name",
  "app",
  "client",
  "url",
  "status",
  "accessMode",
  "dashboardId",
  "lastRecordedAt",
  "notes"
];
const CODEX_SITES_SOURCE_ID = "codex-sites";

function isCodexSiteUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function defaultAppSource(apps) {
  const first = Array.isArray(apps) ? apps.find((app) => app?.source) : null;
  return first?.source || "apps/workspace";
}

function createCodexSitesObject(apps = []) {
  return {
    id: CODEX_SITES_OBJECT_ID,
    label: "Codex Sites",
    source: "Workspace Apps",
    sourceId: CODEX_SITES_OBJECT_ID,
    objectType: "custom",
    icon: "Rocket",
    columns: CODEX_SITES_COLUMNS,
    rows: [],
    binding: {
      mode: "manual",
      source: "Settings / Apps",
      sourceType: "workspace-data-model",
      sourceAuthority: "workspace-config",
      objectId: CODEX_SITES_OBJECT_ID,
      sourceId: CODEX_SITES_SOURCE_ID,
      entityType: "codex-site",
      app: defaultAppSource(apps)
    },
    fieldSettings: {
      hidden: [],
      order: CODEX_SITES_COLUMNS,
      views: [
        {
          id: "codex-sites-live",
          name: "Live",
          favorite: true,
          order: CODEX_SITES_COLUMNS,
          filter: { op: "and", clauses: [{ fieldId: "status", operator: "eq", value: "live" }] }
        },
        {
          id: "codex-sites-review",
          name: "Draft & Review",
          order: CODEX_SITES_COLUMNS,
          filter: { op: "or", clauses: [
            { fieldId: "status", operator: "eq", value: "draft" },
            { fieldId: "status", operator: "eq", value: "review" }
          ] }
        }
      ],
      activeViewId: "codex-sites-live",
      types: {
        Name: "text",
        app: "text",
        client: "text",
        url: "url",
        status: "select",
        accessMode: "select",
        dashboardId: "text",
        lastRecordedAt: "date",
        notes: "text"
      }
    }
  };
}

function normalizeCodexSiteRecord(record = {}) {
  const url = String(record.url || record.liveUrl || record.current_live_url || "").trim();
  return {
    id: String(record.id || record.projectId || record.project_id || record.slug || url).trim(),
    Name: String(record.Name || record.name || record.title || record.slug || "Codex Site").trim(),
    app: String(record.app || record.source || "apps/workspace").trim(),
    client: String(record.client || record.workspace || "Workspace").trim(),
    url,
    status: String(record.status || (url ? "live" : "draft")).trim(),
    accessMode: String(record.accessMode || record.access_mode || "workspace").trim(),
    dashboardId: String(record.dashboardId || record.dashboard_id || record.slug || record.id || "").trim(),
    lastRecordedAt: String(record.lastRecordedAt || record.updated_at || record.created_at || "").trim(),
    notes: String(record.notes || record.description || "").trim()
  };
}

function codexSiteRecordToRow(record = {}) {
  const site = normalizeCodexSiteRecord(record);
  return {
    Name: site.Name,
    app: site.app,
    client: site.client,
    url: site.url,
    status: site.status,
    accessMode: site.accessMode,
    dashboardId: site.dashboardId,
    lastRecordedAt: site.lastRecordedAt || new Date().toISOString(),
    notes: site.notes
  };
}

function recordsFromSourceEntry(entry) {
  if (Array.isArray(entry)) return entry;
  if (Array.isArray(entry?.records)) return entry.records;
  if (Array.isArray(entry?.sites)) return entry.sites;
  if (Array.isArray(entry?.items)) return entry.items;
  return [];
}

function listAvailableCodexSites(workspaceConfig = {}, workspaceSourceRecords = {}) {
  const sidecarRecords = [
    ...recordsFromSourceEntry(workspaceSourceRecords?.[CODEX_SITES_SOURCE_ID]),
    ...recordsFromSourceEntry(workspaceSourceRecords?.[CODEX_SITES_OBJECT_ID])
  ];
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((item) => item?.id === CODEX_SITES_OBJECT_ID);
  const rowRecords = Array.isArray(object?.rows) ? object.rows : [];
  const byUrl = new Map();
  [...sidecarRecords, ...rowRecords].forEach((record) => {
    const site = normalizeCodexSiteRecord(record);
    if (!isCodexSiteUrl(site.url)) return;
    byUrl.set(site.url, site);
  });
  return Array.from(byUrl.values());
}

function ensureCodexSitesDataModel(dataModel, apps = []) {
  const objects = Array.isArray(dataModel?.objects) ? dataModel.objects : [];
  if (objects.some((object) => object?.id === CODEX_SITES_OBJECT_ID)) return dataModel || {};
  return {
    ...(dataModel || {}),
    objects: [...objects, createCodexSitesObject(apps)]
  };
}

export {
  CODEX_SITES_COLUMNS,
  CODEX_SITES_OBJECT_ID,
  CODEX_SITES_SOURCE_ID,
  codexSiteRecordToRow,
  createCodexSitesObject,
  ensureCodexSitesDataModel,
  isCodexSiteUrl,
  listAvailableCodexSites,
  normalizeCodexSiteRecord
};
