/**
 * Browser / local-agent fast lane — run input templates V1.
 *
 * Pure helpers that turn the existing manual run-input contract
 * (`lib/orchestration-run-inputs.js`, kind `growthub-workflow-run-inputs-v1`)
 * into a no-code surface for browser-capable local sandbox rows. Templates
 * only pre-fill runInputs UI fields and defaults — they never execute
 * anything, never fetch, never write config.
 *
 * Safety contract (operator-owned browser sessions):
 *   - `sendMode` is constrained to the SEND_MODES enum; default "read-only".
 *   - Any externally mutating sendMode ("operator-approved-action") requires
 *     `operatorApproved === true` AND an explicit target (URL or platform).
 *   - Credential-shaped field ids and token-shaped values are rejected before
 *     an envelope is ever built — secrets never enter runInputs.
 *   - The server re-validates: normalizeRunInputsEnvelope still redacts, and
 *     workspace-schema still rejects token-shaped row fields.
 *
 * No React, no fetch, no workspace mutation.
 */

const RUN_INPUTS_KIND = "growthub-workflow-run-inputs-v1";
const BROWSER_RUN_SOURCE = "manual-browser-fastlane";

const SEND_MODES = Object.freeze([
  "read-only",
  "draft-only",
  "manual-review",
  "operator-approved-action"
]);
const DEFAULT_SEND_MODE = "read-only";
/** sendModes that may mutate an external logged-in surface. */
const MUTATING_SEND_MODES = Object.freeze(["operator-approved-action"]);

const CREDENTIAL_FIELD_IDS = /^(api[_-]?key|token|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer|password|secret|session[_-]?key|cookie|cookies|credential)$/i;
const TOKEN_SHAPED_VALUE = /(sk-[a-z0-9_-]{8,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|bearer\s+[a-z0-9._-]{12,}|api[_-]?key\s*=|access[_-]?token\s*=)/i;

/**
 * Browser-safe run input presets. Field shape mirrors the graph human-input
 * descriptor contract ({ id, label, type, required, helpText }) so the same
 * fields render through the RunSetupPanel grammar with zero raw JSON.
 */
const SANDBOX_BROWSER_RUN_TEMPLATES = Object.freeze([
  {
    id: "browser-research",
    label: "Browser research",
    description: "Open an operator-approved page and produce a research summary from user-visible content.",
    fields: [
      { id: "platform", label: "Platform", type: "text", required: true, helpText: "e.g. linkedin, medium, notebooklm" },
      { id: "targetName", label: "Target name", type: "text", required: true },
      { id: "targetUrl", label: "Target URL", type: "url", required: true },
      { id: "researchGoal", label: "Research goal", type: "textarea", required: true },
      { id: "outputFormat", label: "Output format", type: "text", required: false, helpText: "e.g. markdown, docx" },
      { id: "sendMode", label: "Send mode", type: "select", required: true, options: SEND_MODES, helpText: "read-only is the safe default" },
      { id: "operatorApproved", label: "Operator approved", type: "boolean", required: true, helpText: "I approve this run in my own browser session" }
    ],
    defaults: { sendMode: "read-only", operatorApproved: false }
  },
  {
    id: "notebook-brief",
    label: "Notebook brief",
    description: "Generate a brief from a NotebookLM notebook the operator already has open access to.",
    fields: [
      { id: "platform", label: "Platform", type: "text", required: true },
      { id: "notebookUrl", label: "Notebook URL", type: "url", required: true },
      { id: "initialUrl", label: "Initial URL", type: "url", required: false, helpText: "Optional source page to summarize into the notebook" },
      { id: "clientName", label: "Client name", type: "text", required: true },
      { id: "outputFormat", label: "Output format", type: "text", required: false, helpText: "e.g. docx" },
      { id: "sendMode", label: "Send mode", type: "select", required: true, options: SEND_MODES },
      { id: "operatorApproved", label: "Operator approved", type: "boolean", required: true }
    ],
    defaults: { platform: "notebooklm", sendMode: "read-only", operatorApproved: false }
  },
  {
    id: "profile-review",
    label: "Profile review",
    description: "Read one user-visible profile and draft (never send) outreach material.",
    fields: [
      { id: "platform", label: "Platform", type: "text", required: true },
      { id: "profileUrl", label: "Profile URL", type: "url", required: true },
      { id: "targetName", label: "Target name", type: "text", required: true },
      { id: "interest", label: "Interest", type: "text", required: false },
      { id: "sendMode", label: "Send mode", type: "select", required: true, options: SEND_MODES, helpText: "draft-only drafts a message without sending" },
      { id: "operatorApproved", label: "Operator approved", type: "boolean", required: true }
    ],
    defaults: { sendMode: "draft-only", operatorApproved: false }
  },
  {
    id: "manual-browser-smoke",
    label: "Manual browser smoke",
    description: "Safe configuration smoke — proves the fast lane wiring without touching any external platform.",
    fields: [
      { id: "lane", label: "Lane", type: "text", required: true, helpText: "e.g. browser-smoke" },
      { id: "clientName", label: "Client name", type: "text", required: true },
      { id: "outputFormat", label: "Output format", type: "text", required: false }
    ],
    defaults: { lane: "browser-smoke", sendMode: "read-only" }
  }
]);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function getBrowserRunInputTemplate(templateId) {
  const id = clean(templateId);
  if (!id) return null;
  return SANDBOX_BROWSER_RUN_TEMPLATES.find((t) => t.id === id) || null;
}

function normalizeSendMode(value) {
  const mode = clean(value).toLowerCase();
  return SEND_MODES.includes(mode) ? mode : DEFAULT_SEND_MODE;
}

function isMutatingSendMode(value) {
  return MUTATING_SEND_MODES.includes(clean(value).toLowerCase());
}

function hasExplicitTarget(values) {
  if (!values || typeof values !== "object") return false;
  return ["targetUrl", "profileUrl", "notebookUrl", "platform"]
    .some((key) => clean(values[key]).length > 0);
}

/**
 * Validate the operator-safety contract for a browser fast-lane run.
 * Pure — returns { ok, errors: string[], missing: string[] }. Never throws.
 */
function validateBrowserRunSafety(values, template) {
  const errors = [];
  const missing = [];
  const safeValues = values && typeof values === "object" && !Array.isArray(values) ? values : {};

  for (const [key, raw] of Object.entries(safeValues)) {
    if (CREDENTIAL_FIELD_IDS.test(clean(key))) {
      errors.push(`field "${key}" is credential-shaped — secrets are never accepted as run inputs`);
    }
    if (typeof raw === "string" && TOKEN_SHAPED_VALUE.test(raw)) {
      errors.push(`field "${key}" contains a token-shaped value — secrets are never accepted as run inputs`);
    }
  }

  const fields = Array.isArray(template?.fields) ? template.fields : [];
  for (const field of fields) {
    if (!field?.required) continue;
    const raw = safeValues[field.id];
    // Required booleans follow the RunSetupPanel semantic: only an explicit
    // true counts — operator approval can never be satisfied by a default.
    const empty = field.type === "boolean"
      ? raw !== true && clean(raw).toLowerCase() !== "true"
      : clean(raw).length === 0;
    if (empty) missing.push(field.id);
  }

  const sendMode = clean(safeValues.sendMode).toLowerCase();
  if (sendMode && !SEND_MODES.includes(sendMode)) {
    errors.push(`sendMode must be one of ${SEND_MODES.join(", ")}`);
  }
  if (isMutatingSendMode(sendMode)) {
    if (safeValues.operatorApproved !== true && clean(safeValues.operatorApproved).toLowerCase() !== "true") {
      errors.push("operatorApproved must be true when sendMode performs an external action");
    }
    if (!hasExplicitTarget(safeValues)) {
      errors.push("an explicit target (targetUrl / profileUrl / notebookUrl / platform) is required when sendMode performs an external action");
    }
  }

  return { ok: errors.length === 0 && missing.length === 0, errors, missing };
}

/**
 * Build the exact envelope `normalizeRunInputsEnvelope` expects from a
 * template + operator-entered values. Booleans stay booleans, everything
 * else is a trimmed string; unfilled optional fields are dropped.
 *
 * Returns { envelope, validation } — envelope is null when validation fails.
 */
function buildBrowserRunInputsEnvelope({ templateId, values, source } = {}) {
  const template = getBrowserRunInputTemplate(templateId);
  const merged = {
    ...(template?.defaults || {}),
    ...(values && typeof values === "object" && !Array.isArray(values) ? values : {})
  };
  if ("sendMode" in merged) merged.sendMode = normalizeSendMode(merged.sendMode);

  const validation = validateBrowserRunSafety(merged, template);
  if (!validation.ok) return { envelope: null, validation, template };

  const outValues = {};
  for (const [key, raw] of Object.entries(merged)) {
    const id = clean(key);
    if (!id) continue;
    if (typeof raw === "boolean") {
      outValues[id] = raw;
    } else {
      const text = clean(raw);
      if (text) outValues[id] = text;
    }
  }

  return {
    envelope: {
      kind: RUN_INPUTS_KIND,
      source: clean(source) || BROWSER_RUN_SOURCE,
      values: outValues,
      files: []
    },
    validation,
    template
  };
}

export {
  BROWSER_RUN_SOURCE,
  DEFAULT_SEND_MODE,
  MUTATING_SEND_MODES,
  RUN_INPUTS_KIND,
  SANDBOX_BROWSER_RUN_TEMPLATES,
  SEND_MODES,
  buildBrowserRunInputsEnvelope,
  getBrowserRunInputTemplate,
  isMutatingSendMode,
  normalizeSendMode,
  validateBrowserRunSafety
};
