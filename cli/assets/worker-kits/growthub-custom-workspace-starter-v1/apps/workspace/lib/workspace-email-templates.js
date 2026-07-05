/**
 * Governed email templates — PURE helpers for the workspace-messaging lane.
 *
 * Templates are rows on a `data-source` object (`email-templates`), the same
 * governed-object grammar every other marketplace surface uses: created
 * lazily by the messaging door, written only server-side, readable by the
 * node sidecar for template reuse. Rows carry content + stamps only — never
 * credentials, never provider payloads.
 */

const EMAIL_TEMPLATES_OBJECT_ID = "email-templates";
const MAX_TEMPLATES = 200;
const MAX_FIELD_CHARS = 100000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

// Atomic row grammar — mirrors the CEO Agent Teams pattern: explicit `id`
// (slug of Name), capital-N identity column, `status`, versioned content
// fields, and `lastUsedAt` reuse stamp. Performance intelligence does NOT
// live here: templates are reusable content blueprints; every real send
// lands its own atomic row on the `email-activity` object (see
// workspace-email-sends.js) carrying `templateId`, so per-template
// performance is an aggregation over real sends — never invented counters
// on the blueprint.
const EMAIL_TEMPLATE_COLUMNS = [
  "id",
  "Name",
  "status",
  "subject",
  "previewText",
  "html",
  "text",
  "version",
  "lastUsedAt",
  "createdAt",
  "updatedAt",
  "registryId",
];

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildEmailTemplatesObject({ integrationId = "resend-email" } = {}) {
  return {
    id: EMAIL_TEMPLATES_OBJECT_ID,
    label: "Email Templates",
    name: "Email Templates",
    source: "Email Templates",
    objectType: "data-source",
    icon: "Database",
    columns: EMAIL_TEMPLATE_COLUMNS.slice(),
    rows: [],
    binding: { mode: "manual", source: "Email Templates" },
    // Correlation to the owning messaging product row (api-registry).
    templateProduct: clean(integrationId),
    relations: [
      {
        id: "resolver-binding",
        name: "Resolver",
        field: "registryId",
        targetObjectType: "api-registry",
        type: "belongs-to",
        valueField: "integrationId",
        labelField: "Name",
        searchable: true,
        pageSize: 25,
      },
    ],
  };
}

function findEmailTemplatesObject(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.find((object) => clean(object?.id) === EMAIL_TEMPLATES_OBJECT_ID) || null;
}

/** Validate + canonicalize a save-template request. */
function validateEmailTemplate(input = {}) {
  const name = clean(input.name).slice(0, 120);
  if (name.length < 2) return { ok: false, error: "template name must be at least 2 characters" };
  const subject = clean(input.subject).slice(0, 500);
  const previewText = clean(input.previewText).slice(0, 300);
  const html = String(input.html || "").slice(0, MAX_FIELD_CHARS).trim();
  const text = String(input.text || "").slice(0, MAX_FIELD_CHARS).trim();
  if (!subject && !html && !text) return { ok: false, error: "template needs a subject or a body" };
  return { ok: true, template: { name, subject, previewText, html, text } };
}

/** Upsert a template row by Name (pure, atomic). Returns { config, row, created }.
 * Create: id slug + status "ready" + version 1.
 * Update: identity, lastUsedAt, and createdAt are PRESERVED; version
 * increments — a template is a stable atomic unit across content edits. */
function withEmailTemplateUpsert(workspaceConfig, { name, subject, previewText, html, text, integrationId = "resend-email", nowIso = "" } = {}) {
  const content = {
    Name: clean(name),
    subject: clean(subject),
    previewText: clean(previewText),
    html: String(html || ""),
    text: String(text || ""),
    updatedAt: clean(nowIso),
    registryId: clean(integrationId),
  };
  if (!content.Name) return { config: workspaceConfig, row: null, created: false };
  const freshRow = () => ({
    id: `email-template-${slugify(content.Name) || "untitled"}`,
    status: "ready",
    version: 1,
    lastUsedAt: "",
    createdAt: clean(nowIso),
    ...content,
  });
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let found = false;
  let created = false;
  let row = null;
  const nextObjects = objects.map((object) => {
    if (clean(object?.id) !== EMAIL_TEMPLATES_OBJECT_ID || found) return object;
    found = true;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const has = rows.some((existing) => clean(existing?.Name) === content.Name);
    created = !has;
    const nextRows = has
      ? rows.map((existing) => {
          if (clean(existing?.Name) !== content.Name) return existing;
          row = {
            ...freshRow(),
            ...existing,
            ...content,
            version: (Number(existing?.version) || 1) + 1,
          };
          return row;
        })
      : [(row = freshRow()), ...rows].slice(0, MAX_TEMPLATES);
    return { ...object, columns: EMAIL_TEMPLATE_COLUMNS.slice(), rows: nextRows };
  });
  if (!found) {
    created = true;
    row = freshRow();
    nextObjects.push({ ...buildEmailTemplatesObject({ integrationId }), rows: [row] });
  }
  return { config: { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } }, row, created };
}

/** Non-secret template list for sidecar reuse (content included — it is user content). */
function listEmailTemplates(workspaceConfig) {
  const object = findEmailTemplatesObject(workspaceConfig);
  return (Array.isArray(object?.rows) ? object.rows : [])
    .map((row) => ({
      id: clean(row?.id),
      name: clean(row?.Name),
      status: clean(row?.status),
      subject: clean(row?.subject),
      previewText: clean(row?.previewText),
      html: String(row?.html || ""),
      text: String(row?.text || ""),
      version: Number(row?.version) || 1,
      updatedAt: clean(row?.updatedAt),
    }))
    .filter((row) => row.name);
}

/** Stamp lastUsedAt on a template row when a REAL send references it (pure). */
function withTemplateUsageStamp(workspaceConfig, { templateId, nowIso = "" } = {}) {
  const target = clean(templateId);
  if (!target) return { config: workspaceConfig, stamped: false };
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let stamped = false;
  const nextObjects = objects.map((object) => {
    if (clean(object?.id) !== EMAIL_TEMPLATES_OBJECT_ID) return object;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    return {
      ...object,
      rows: rows.map((row) => {
        if (clean(row?.id) !== target) return row;
        stamped = true;
        return { ...row, lastUsedAt: clean(nowIso) };
      }),
    };
  });
  if (!stamped) return { config: workspaceConfig, stamped: false };
  return { config: { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } }, stamped: true };
}

export {
  EMAIL_TEMPLATES_OBJECT_ID,
  EMAIL_TEMPLATE_COLUMNS,
  buildEmailTemplatesObject,
  findEmailTemplatesObject,
  listEmailTemplates,
  validateEmailTemplate,
  withEmailTemplateUpsert,
  withTemplateUsageStamp,
};
