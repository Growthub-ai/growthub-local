/**
 * Browser / local agent fast lane — run-input templates V1.
 *
 * Pure helpers that make the EXISTING manual run-input lane
 * (lib/orchestration-run-inputs.js, `growthub-workflow-run-inputs-v1`)
 * no-code for browser-capable local sandbox workflows. Templates only
 * pre-fill values and describe safe fields — they never execute anything,
 * never fetch, and never write workspace state.
 *
 * Safety contract (operator-owned browser/session access):
 *   - `sendMode` is bounded to SEND_MODES; the default is read-only.
 *   - Any externally mutating sendMode requires `operatorApproved: true`.
 *   - Secret-looking field ids are rejected outright — credentials never
 *     travel through run inputs (secretRef is the only sanctioned path).
 *   - Values flow through the existing normalizeRunInputsEnvelope
 *     redaction before persistence; nothing here bypasses it.
 */

const RUN_INPUTS_KIND = "growthub-workflow-run-inputs-v1";

const SEND_MODES = Object.freeze([
  "read-only",
  "draft-only",
  "manual-review",
  "operator-approved-action"
]);

const DEFAULT_SEND_MODE = "read-only";

/** sendModes that may mutate external systems → hard operatorApproved gate. */
const MUTATING_SEND_MODES = Object.freeze(["operator-approved-action"]);

const SECRETISH_FIELD_ID = /^(api[_-]?key|token|password|secret|authorization|bearer|session[_-]?key|cookie)$/i;

const BROWSER_RUN_INPUT_TEMPLATES = Object.freeze([
  {
    id: "browser-research",
    label: "Browser research",
    description: "Open a user-approved page in the local browser session and summarize visible content into a research note.",
    fields: [
      { id: "platform", label: "Platform", type: "text", required: true, defaultValue: "" },
      { id: "targetName", label: "Target name", type: "text", required: true, defaultValue: "" },
      { id: "targetUrl", label: "Target URL", type: "url", required: true, defaultValue: "" },
      { id: "researchGoal", label: "Research goal", type: "text", required: true, defaultValue: "" },
      { id: "outputFormat", label: "Output format", type: "text", required: false, defaultValue: "markdown" },
      { id: "sendMode", label: "Send mode", type: "select", required: true, options: SEND_MODES, defaultValue: DEFAULT_SEND_MODE },
      { id: "operatorApproved", label: "Operator approved", type: "boolean", required: true, defaultValue: false }
    ]
  },
  {
    id: "notebook-brief",
    label: "Notebook brief (NotebookLM)",
    description: "Navigate the operator's logged-in NotebookLM session to a notebook and generate a brief artifact from visible content.",
    fields: [
      { id: "platform", label: "Platform", type: "text", required: true, defaultValue: "notebooklm" },
      { id: "notebookUrl", label: "Notebook URL", type: "url", required: true, defaultValue: "" },
      { id: "initialUrl", label: "Initial URL", type: "url", required: false, defaultValue: "" },
      { id: "clientName", label: "Client name", type: "text", required: true, defaultValue: "" },
      { id: "outputFormat", label: "Output format", type: "text", required: false, defaultValue: "docx" },
      { id: "sendMode", label: "Send mode", type: "select", required: true, options: SEND_MODES, defaultValue: DEFAULT_SEND_MODE },
      { id: "operatorApproved", label: "Operator approved", type: "boolean", required: true, defaultValue: false }
    ]
  },
  {
    id: "profile-review",
    label: "Profile review",
    description: "Read a user-visible profile page in the operator's own logged-in session, summarize it, and draft (never send) outreach.",
    fields: [
      { id: "platform", label: "Platform", type: "text", required: true, defaultValue: "" },
      { id: "profileUrl", label: "Profile URL", type: "url", required: true, defaultValue: "" },
      { id: "targetName", label: "Target name", type: "text", required: true, defaultValue: "" },
      { id: "interest", label: "Interest", type: "text", required: false, defaultValue: "" },
      { id: "sendMode", label: "Send mode", type: "select", required: true, options: SEND_MODES, defaultValue: "draft-only" },
      { id: "operatorApproved", label: "Operator approved", type: "boolean", required: true, defaultValue: false }
    ]
  },
  {
    id: "manual-browser-smoke",
    label: "Manual browser smoke",
    description: "Safe configuration smoke — proves run inputs, receipt inputSummary, and persistence without external interaction.",
    fields: [
      { id: "lane", label: "Lane", type: "text", required: true, defaultValue: "browser-smoke" },
      { id: "clientName", label: "Client name", type: "text", required: true, defaultValue: "" },
      { id: "outputFormat", label: "Output format", type: "text", required: false, defaultValue: "json" }
    ]
  }
]);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function listBrowserRunInputTemplates() {
  return BROWSER_RUN_INPUT_TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description }));
}

function getBrowserRunInputTemplate(templateId) {
  return BROWSER_RUN_INPUT_TEMPLATES.find((t) => t.id === clean(templateId)) || null;
}

function normalizeSendMode(value) {
  const mode = clean(value).toLowerCase();
  return SEND_MODES.includes(mode) ? mode : DEFAULT_SEND_MODE;
}

function sendModeRequiresOperatorApproval(value) {
  return MUTATING_SEND_MODES.includes(clean(value).toLowerCase());
}

function coerceBooleanValue(value) {
  if (value === true || value === false) return value;
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

/**
 * Default values for a template — used to pre-fill the no-code form.
 */
function buildTemplateDefaults(templateId) {
  const template = getBrowserRunInputTemplate(templateId);
  if (!template) return {};
  const out = {};
  for (const field of template.fields) {
    out[field.id] = field.defaultValue ?? (field.type === "boolean" ? false : "");
  }
  return out;
}

/**
 * Validate template values BEFORE the run request is built. The server-side
 * graph schema validation remains authoritative — this is the no-code
 * pre-flight so operators get exact, actionable errors in the panel.
 *
 * @returns {{ ok: boolean, missing: string[], errors: string[] }}
 */
function validateBrowserRunInputValues(templateOrId, values) {
  const template = typeof templateOrId === "string" ? getBrowserRunInputTemplate(templateOrId) : templateOrId;
  const safeValues = values && typeof values === "object" && !Array.isArray(values) ? values : {};
  const missing = [];
  const errors = [];

  for (const key of Object.keys(safeValues)) {
    if (SECRETISH_FIELD_ID.test(key)) {
      errors.push(`Field "${key}" looks like a credential — run inputs never carry secrets. Use envRefs / secretRef instead.`);
    }
  }

  const fields = Array.isArray(template?.fields) ? template.fields : [];
  for (const field of fields) {
    const raw = safeValues[field.id];
    const empty = raw == null || (typeof raw === "string" && !raw.trim());
    if (field.required && field.type !== "boolean" && empty) missing.push(field.id);
    if (field.type === "select" && !empty && Array.isArray(field.options) && !field.options.includes(clean(raw))) {
      errors.push(`Field "${field.id}" must be one of ${field.options.join(", ")}.`);
    }
  }

  const sendMode = "sendMode" in safeValues ? clean(safeValues.sendMode) : "";
  if (sendMode && !SEND_MODES.includes(sendMode.toLowerCase())) {
    errors.push(`sendMode must be one of ${SEND_MODES.join(", ")}.`);
  }
  const operatorApproved = coerceBooleanValue(safeValues.operatorApproved);
  if (sendModeRequiresOperatorApproval(sendMode) && !operatorApproved) {
    errors.push("This send mode performs an external action — operatorApproved must be true.");
  }
  const hasApprovalField = fields.some((f) => f.id === "operatorApproved");
  if (hasApprovalField && !operatorApproved) {
    missing.push("operatorApproved");
  }

  const dedupedMissing = Array.from(new Set(missing));
  return { ok: dedupedMissing.length === 0 && errors.length === 0, missing: dedupedMissing, errors };
}

/**
 * Build the exact envelope `normalizeRunInputsEnvelope` expects. Values stay
 * raw here (booleans as booleans); server-side normalization owns coercion
 * and redaction. Secret-looking ids are dropped defensively.
 */
function buildBrowserRunInputsEnvelope({ templateId, values, source } = {}) {
  const template = getBrowserRunInputTemplate(templateId);
  const merged = { ...buildTemplateDefaults(templateId), ...(values && typeof values === "object" && !Array.isArray(values) ? values : {}) };
  const safeValues = {};
  for (const [key, raw] of Object.entries(merged)) {
    const id = clean(key);
    if (!id || SECRETISH_FIELD_ID.test(id)) continue;
    if (raw == null) continue;
    safeValues[id] = typeof raw === "boolean" || typeof raw === "number" ? raw : String(raw);
  }
  return {
    kind: RUN_INPUTS_KIND,
    source: clean(source) || (template ? `template:${template.id}` : "manual"),
    values: safeValues,
    files: []
  };
}

export {
  BROWSER_RUN_INPUT_TEMPLATES,
  DEFAULT_SEND_MODE,
  MUTATING_SEND_MODES,
  RUN_INPUTS_KIND,
  SEND_MODES,
  buildBrowserRunInputsEnvelope,
  buildTemplateDefaults,
  getBrowserRunInputTemplate,
  listBrowserRunInputTemplates,
  normalizeSendMode,
  sendModeRequiresOperatorApproval,
  validateBrowserRunInputValues
};
