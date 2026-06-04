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
  createCodexSitesObject,
  ensureCodexSitesDataModel,
  isCodexSiteUrl
};
