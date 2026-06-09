/**
 * Resolver Proposal Studio V1 — path validation + code generation.
 *
 * Generates inert resolver file proposals for the governed creation loop.
 * Never inlines secret values. Refuses writes outside the approved resolver
 * directory (enforced again at register-resolver route).
 */

const RESOLVER_REL_DIR = "lib/adapters/integrations/resolvers";
const RESOLVER_KIND = "growthub-resolver-file-proposal-v1";

function slugifyIntegrationId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "integration";
}

function defaultResolverFilename(integrationId) {
  return `${slugifyIntegrationId(integrationId)}.js`;
}

function defaultResolverRelativePath(integrationId) {
  return `${RESOLVER_REL_DIR}/${defaultResolverFilename(integrationId)}`;
}

/**
 * Validate a target path for resolver writes. Returns { ok, relativePath, errors[] }.
 */
function validateResolverTargetPath(inputPath, { integrationId = "" } = {}) {
  const errors = [];
  const raw = String(inputPath || "").trim() || defaultResolverRelativePath(integrationId);
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) errors.push("path traversal is not allowed");
  if (!normalized.startsWith(`${RESOLVER_REL_DIR}/`)) {
    errors.push(`resolver must live under ${RESOLVER_REL_DIR}/`);
  }
  if (!normalized.endsWith(".js")) errors.push("resolver file must have a .js extension");
  const filename = normalized.slice(RESOLVER_REL_DIR.length + 1);
  if (!filename || filename.includes("/")) errors.push("resolver must be a single file in the resolvers directory");
  return {
    ok: errors.length === 0,
    relativePath: normalized,
    filename,
    errors,
  };
}

function generateResolverCode({
  integrationId,
  entityType = "records",
  method = "GET",
  baseUrl = "",
  endpoint = "",
  authRef = "",
  authHeaderName = "x-api-key",
  authPrefix = "",
  outputMode = "normalized-rows",
}) {
  const id = slugifyIntegrationId(integrationId);
  const entity = String(entityType || "records").trim() || "records";
  const header = String(authHeaderName || "x-api-key").trim() || "x-api-key";
  const prefix = String(authPrefix || "").trim();
  const envCandidates = ["token", "apiKey", "secret"].map((suffix) => {
    const base = id.toUpperCase().replace(/-/g, "_");
    return suffix === "token" ? base : `${base}_${suffix.toUpperCase()}`;
  });

  return `/**
 * Generated resolver — ${id}
 * Auth ref: ${authRef || id} (resolved server-side via env; never stored here)
 * Output mode: ${outputMode}
 */
import { registerSourceResolver } from "../source-resolver-registry.js";

const INTEGRATION_ID = "${id}";
const ENTITY_TYPE = "${entity}";

function resolveSecret() {
  const candidates = ${JSON.stringify(envCandidates)};
  for (const key of candidates) {
    if (process.env[key]) return process.env[key];
  }
  throw new Error(\`missing env for \${INTEGRATION_ID} — configure via Settings → APIs & Webhooks\`);
}

function buildUrl() {
  const base = ${JSON.stringify(String(baseUrl || "").replace(/\/+$/, ""))};
  const path = ${JSON.stringify(String(endpoint || "").replace(/^\/+/, ""))};
  if (!base && !path) throw new Error("baseUrl or endpoint required");
  if (/^https?:\\/\\//i.test(path)) return path;
  return \`\${base}/\${path}\`;
}

async function fetchPayload() {
  const secret = resolveSecret();
  const url = buildUrl();
  const headers = {
    accept: "application/json",
    "${header}": ${prefix ? `\`${prefix} \${secret}\`` : "secret"},
  };
  const res = await fetch(url, { method: ${JSON.stringify(String(method || "GET").toUpperCase())}, headers });
  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
  const contentType = res.headers.get("content-type") || "";
  return contentType.includes("application/json") ? res.json() : res.text();
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload.map((row, index) => ({ id: String(row?.id ?? index), ...row }));
  if (payload && typeof payload === "object") {
    const list = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.items) ? payload.items : [payload];
    return list.map((row, index) => ({ id: String(row?.id ?? index), ...row }));
  }
  return [{ id: "0", raw: payload }];
}

registerSourceResolver({
  integrationId: INTEGRATION_ID,
  entityTypes: [ENTITY_TYPE],
  listEntities: async () => [{ id: ENTITY_TYPE, label: ENTITY_TYPE, type: ENTITY_TYPE }],
  fetchRecords: async () => normalizeRows(await fetchPayload()),
});
`;
}

function buildResolverFileProposal(draft = {}) {
  const integrationId = slugifyIntegrationId(draft.integrationId || draft.authRef || "integration");
  const pathCheck = validateResolverTargetPath(draft.resolverPath, { integrationId });
  const code = generateResolverCode({
    integrationId,
    entityType: draft.entityType,
    method: draft.method,
    baseUrl: draft.baseUrl,
    endpoint: draft.endpoint,
    authRef: draft.authRef || integrationId,
    authHeaderName: draft.authHeaderName,
    authPrefix: draft.authPrefix,
    outputMode: draft.outputMode,
  });
  return {
    kind: RESOLVER_KIND,
    integrationId,
    relativePath: pathCheck.relativePath,
    filename: pathCheck.filename,
    valid: pathCheck.ok,
    errors: pathCheck.errors,
    code,
    why: "Resolver files translate API responses into governed source records without storing secrets in config.",
    inputContract: {
      integrationId,
      authRef: draft.authRef || integrationId,
      method: draft.method || "GET",
      baseUrl: draft.baseUrl || "",
      endpoint: draft.endpoint || "",
    },
    outputContract: {
      entityType: draft.entityType || "records",
      storage: draft.storageMode || "workspace-source-records",
    },
    securityWarnings: [
      "Never commit secret values into resolver source — use env refs only.",
      "Resolver writes require a writable filesystem runtime.",
    ],
  };
}

export {
  RESOLVER_REL_DIR,
  RESOLVER_KIND,
  slugifyIntegrationId,
  defaultResolverRelativePath,
  validateResolverTargetPath,
  generateResolverCode,
  buildResolverFileProposal,
};
