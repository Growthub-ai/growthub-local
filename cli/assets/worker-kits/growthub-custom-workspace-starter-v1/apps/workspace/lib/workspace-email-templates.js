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

const EMAIL_TEMPLATE_COLUMNS = ["Name", "subject", "html", "text", "updatedAt", "registryId"];

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
  const html = String(input.html || "").slice(0, MAX_FIELD_CHARS).trim();
  const text = String(input.text || "").slice(0, MAX_FIELD_CHARS).trim();
  if (!subject && !html && !text) return { ok: false, error: "template needs a subject or a body" };
  return { ok: true, template: { name, subject, html, text } };
}

/** Upsert a template row by Name (pure). Returns { config, row, created }. */
function withEmailTemplateUpsert(workspaceConfig, { name, subject, html, text, integrationId = "resend-email", nowIso = "" } = {}) {
  const row = {
    Name: clean(name),
    subject: clean(subject),
    html: String(html || ""),
    text: String(text || ""),
    updatedAt: clean(nowIso),
    registryId: clean(integrationId),
  };
  if (!row.Name) return { config: workspaceConfig, row: null, created: false };
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let found = false;
  let created = false;
  const nextObjects = objects.map((object) => {
    if (clean(object?.id) !== EMAIL_TEMPLATES_OBJECT_ID || found) return object;
    found = true;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const has = rows.some((existing) => clean(existing?.Name) === row.Name);
    created = !has;
    const nextRows = has
      ? rows.map((existing) => (clean(existing?.Name) === row.Name ? { ...existing, ...row } : existing))
      : [row, ...rows].slice(0, MAX_TEMPLATES);
    return { ...object, columns: EMAIL_TEMPLATE_COLUMNS.slice(), rows: nextRows };
  });
  if (!found) {
    created = true;
    nextObjects.push({ ...buildEmailTemplatesObject({ integrationId }), rows: [row] });
  }
  return { config: { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } }, row, created };
}

/** Non-secret template list for sidecar reuse (content included — it is user content). */
function listEmailTemplates(workspaceConfig) {
  const object = findEmailTemplatesObject(workspaceConfig);
  return (Array.isArray(object?.rows) ? object.rows : [])
    .map((row) => ({
      name: clean(row?.Name),
      subject: clean(row?.subject),
      html: String(row?.html || ""),
      text: String(row?.text || ""),
      updatedAt: clean(row?.updatedAt),
    }))
    .filter((row) => row.name);
}

export {
  EMAIL_TEMPLATES_OBJECT_ID,
  EMAIL_TEMPLATE_COLUMNS,
  buildEmailTemplatesObject,
  findEmailTemplatesObject,
  listEmailTemplates,
  validateEmailTemplate,
  withEmailTemplateUpsert,
};
