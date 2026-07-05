#!/usr/bin/env node
// Export a NON-SECRET seeded workspace template from any live workspace
// config (growthub.config.json) — the generic, repo-side version of the
// exporter validated on the GTM OS conversion. This is the FIRST half of the
// workspace-template golden path (docs/WORKSPACE_TEMPLATE_GOLDEN_PATH_V1.md);
// the second half registers the output at
// cli/assets/worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/<slug>.config.json
// and verifies it with scripts/workspace-template-smoke.mjs.
//
// Contract (identical to the validated private-repo tool):
// - Every Data Model object schema is preserved: id, label, source,
//   objectType, columns, binding, fieldSettings, icon.
// - PII / run-data rows are stripped; only explicitly allowlisted
//   definition-row objects keep rows (after evidence scrubbing).
// - API Registry rows keep auth by env key NAME only (authRef). Test
//   evidence is cleared, status resets to needs-connection, and
//   connectionIds are emptied (operator-owned post-OAuth).
// - Dashboard/canvas widgets keep identity, binding, layout, chart config;
//   cached row data (config.rows / config.binding.rows) is emptied.
// - Workspace-template provenance keys (template, templateKind) are stamped.
// - The serialized output is verified against secret + PII patterns before
//   writing; any finding aborts with exit 1 and writes nothing.
//
// Usage (from repo root):
//   node scripts/export-workspace-seed-template.mjs \
//     --config <path/to/growthub.config.json> \
//     --slug gtm-os \
//     [--out <path>] [--check-only] \
//     [--definition-rows id1,id2,...]   # objects whose rows are governed
//                                       # definitions, safe to seed as-is

import fs from "node:fs";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (key === "--check-only") {
    args.set(key, "true");
    i -= 1;
    continue;
  }
  args.set(key, value);
}

const configPath = path.resolve(String(args.get("--config") || "apps/workspace/growthub.config.json"));
const slug = String(args.get("--slug") || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
const outPath = path.resolve(String(args.get("--out") || `${slug || "workspace"}.config.json`));
const checkOnly = args.get("--check-only") === "true";
if (!slug) {
  console.error("--slug <template-slug> is required (becomes templates/seeded-configs/<slug>.config.json).");
  process.exit(1);
}
if (!fs.existsSync(configPath)) {
  console.error(`No workspace config at ${configPath} (pass --config).`);
  process.exit(1);
}

// Objects whose rows are governed DEFINITIONS (agent setup, nav folders,
// sandbox/swarm workflow rows, team blueprints, ...) — everything else ships
// rows: []. Pass your variant's list explicitly; an empty allowlist is the
// safest default.
const DEFINITION_ROW_OBJECTS = new Set(
  String(args.get("--definition-rows") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

// Run/test evidence keys cleared from every kept row (name match,
// case-insensitive — draft/receipt variants like
// orchestrationDraftLastResponse are covered too).
const EVIDENCE_KEY_PATTERN = /lastresponse|lasttested|lastrunid|lastsourceid|lastapplied|lastskipped/i;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_PLACEHOLDER = "operator@example.com";

const SECRET_PATTERNS = [
  ["openai-style key", /sk-[A-Za-z0-9]{20,}/],
  ["stripe key", /sk_(?:live|test)_[A-Za-z0-9]{10,}/],
  ["svix/webhook secret", /whsec_[A-Za-z0-9+/=]{10,}/],
  ["resend key", /re_[A-Za-z0-9]{16,}/],
  ["slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ["jwt", /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}/],
  ["bearer value", /Bearer\s+[A-Za-z0-9._~+/=-]{25,}/],
  ["slack webhook url", /hooks\.slack\.com\/services\/[A-Za-z0-9/]+/],
  ["long hex blob", /\b[A-Fa-f0-9]{48,}\b/],
  ["email address (PII)", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isApiRegistryObject(object) {
  if (String(object.objectType || "") === "api-registry") return true;
  const columns = object.columns || [];
  return columns.includes("integrationId") && columns.includes("authRef");
}

function dropEvidenceKeys(row) {
  const next = {};
  for (const [key, value] of Object.entries(row)) {
    if (EVIDENCE_KEY_PATTERN.test(key)) continue;
    next[key] = value;
  }
  return next;
}

function redactEmails(value) {
  if (typeof value === "string") return value.replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER);
  if (Array.isArray(value)) return value.map(redactEmails);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactEmails(v)]));
  }
  return value;
}

function sanitizeRegistryRow(row) {
  const next = dropEvidenceKeys(row);
  next.status = "needs-connection";
  if ("syncStatus" in next) next.syncStatus = "";
  if ("syncProof" in next) next.syncProof = "";
  if ("syncCheckedAt" in next) next.syncCheckedAt = "";
  // Connection ids are operator-owned post-OAuth — never shipped in a seed.
  if ("connectionIds" in next) next.connectionIds = "";
  if (next.requestHeadersMetadata && typeof next.requestHeadersMetadata === "object") {
    const { authHeaderName, authPrefix, contentType } = next.requestHeadersMetadata;
    next.requestHeadersMetadata = { authHeaderName, authPrefix, contentType };
  }
  return redactEmails(next);
}

function sanitizeDefinitionRow(row) {
  const next = dropEvidenceKeys(row);
  if ("status" in next) next.status = "needs-run";
  return redactEmails(next);
}

// Dashboard/canvas widget configs cache rendered object rows (including CRM
// PII) inside config.rows and config.binding.rows. The seed keeps every
// widget's identity, source binding, layout, and chart config, but empties
// cached row data — a fresh workspace re-hydrates widgets from its own
// Data Model objects.
function sanitizeWidget(widget) {
  const next = { ...widget };
  if (next.config && typeof next.config === "object") {
    const config = { ...next.config };
    if (Array.isArray(config.rows)) config.rows = [];
    if (config.binding && typeof config.binding === "object" && Array.isArray(config.binding.rows)) {
      config.binding = { ...config.binding, rows: [] };
    }
    next.config = config;
  }
  return next;
}

function sanitizeTabs(tabs) {
  return (tabs || []).map((tab) => ({
    ...tab,
    widgets: (tab.widgets || []).map(sanitizeWidget),
  }));
}

function sanitizeCanvas(canvas) {
  if (!canvas || typeof canvas !== "object") return canvas;
  const next = { ...canvas };
  if (next.tabs) next.tabs = sanitizeTabs(next.tabs);
  if (Array.isArray(next.widgets)) next.widgets = next.widgets.map(sanitizeWidget);
  return next;
}

function sanitizeDashboards(dashboards) {
  return (dashboards || []).map((dashboard) => ({
    ...dashboard,
    tabs: sanitizeTabs(dashboard.tabs),
    widgets: (dashboard.widgets || []).map(sanitizeWidget),
  }));
}

function buildSeedObject(object) {
  const base = { ...object };
  if (isApiRegistryObject(object)) {
    base.rows = (object.rows || []).map(sanitizeRegistryRow);
  } else if (DEFINITION_ROW_OBJECTS.has(object.id)) {
    base.rows = (object.rows || []).map(sanitizeDefinitionRow);
  } else {
    base.rows = [];
  }
  // The runtime rows contract: never ship a legacy .records shape.
  delete base.records;
  return base;
}

function buildSeedIntegrations(integrations) {
  return (integrations || []).map((integration) => ({
    id: integration.id,
    label: integration.label,
    kind: integration.kind,
    sourceType: integration.sourceType,
    endpointRef: integration.endpointRef,
    url: "",
    status: "needs-configuration",
    hasSecret: Boolean(integration.hasSecret),
  }));
}

function verifyNoSecrets(serialized) {
  const findings = [];
  const scannable = serialized.split(EMAIL_PLACEHOLDER).join("operator-placeholder");
  for (const [label, pattern] of SECRET_PATTERNS) {
    const match = scannable.match(pattern);
    if (match) findings.push({ label, sample: String(match[0]).slice(0, 24) });
  }
  return findings;
}

const config = readJson(configPath);

const seed = {
  id: config.id,
  name: config.name,
  description: config.description,
  branding: config.branding,
  capabilities: config.capabilities,
  pipelines: config.pipelines || [],
  integrations: buildSeedIntegrations(config.integrations),
  dashboards: sanitizeDashboards(config.dashboards),
  widgetTypes: config.widgetTypes,
  canvas: sanitizeCanvas(config.canvas),
  provenance: {
    ...config.provenance,
    // Workspace-template contract keys — the starter-kit seed tests assert these.
    template: slug,
    templateKind: "workspace-template",
    seedTemplate: {
      generatedBy: "scripts/export-workspace-seed-template.mjs",
      generatedFrom: path.basename(configPath),
      contract:
        "Non-secret seeded starter: object schemas, dashboards, canvas tabs, workflow definitions, and API Registry env-key refs preserved; PII rows, run receipts, and test evidence stripped. Secrets stay in uncommitted .env.local, resolved by authRef env key name.",
    },
  },
  dataModel: {
    objects: (config.dataModel?.objects || []).map(buildSeedObject),
  },
};

const serialized = `${JSON.stringify(seed, null, 2)}\n`;
const findings = verifyNoSecrets(serialized);

const summary = {
  configPath,
  outPath,
  slug,
  checkOnly,
  bytes: serialized.length,
  objects: seed.dataModel.objects.length,
  seededRowObjects: seed.dataModel.objects
    .filter((object) => (object.rows || []).length > 0)
    .map((object) => `${object.id}=${object.rows.length}`),
  strippedRowObjects: seed.dataModel.objects.filter((object) => (object.rows || []).length === 0).length,
  secretFindings: findings,
};

console.log(JSON.stringify(summary, null, 2));

if (findings.length > 0) {
  console.error("Seed template verification FAILED: secret/PII patterns detected. Not writing output.");
  process.exit(1);
}

if (!checkOnly) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, serialized, "utf8");
  console.log(`Seed template written: ${outPath}`);
}
