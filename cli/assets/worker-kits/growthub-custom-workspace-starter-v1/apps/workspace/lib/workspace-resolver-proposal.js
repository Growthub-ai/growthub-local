/**
 * Resolver file proposal helpers — path validation + code generation.
 *
 * Generates governed resolver modules for custom HTTP integrations. Never
 * inlines secret values; auth resolves at runtime via env refs.
 */

const RESOLVER_DIR = "lib/adapters/integrations/resolvers";
const RESOLVER_KIND = "growthub-resolver-proposal-v1";

function slugifyIntegrationId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "custom-http";
}

function validateResolverTargetPath(targetPath, cwd = process.cwd()) {
  const raw = String(targetPath || "").trim().replace(/\\/g, "/");
  if (!raw) return { ok: false, error: "target path is required" };
  if (raw.includes("..")) return { ok: false, error: "path traversal is not allowed" };
  const normalized = raw.startsWith(RESOLVER_DIR)
    ? raw
    : `${RESOLVER_DIR}/${raw.replace(/^\/+/, "")}`;
  if (!normalized.startsWith(`${RESOLVER_DIR}/`) || !normalized.endsWith(".js")) {
    return { ok: false, error: `resolver must live under ${RESOLVER_DIR}/ and end with .js` };
  }
  const filename = normalized.slice(RESOLVER_DIR.length + 1);
  if (!/^[a-z0-9-]+\.js$/.test(filename)) {
    return { ok: false, error: "filename must be a lowercase slug ending in .js" };
  }
  return { ok: true, path: normalized, filename, absoluteDir: `${cwd}/${RESOLVER_DIR}` };
}

function buildCustomHttpResolverCode(input = {}) {
  const integrationId = slugifyIntegrationId(input.integrationId);
  const entityType = String(input.entityType || `${integrationId}.records`).trim();
  const authRef = String(input.authRef || integrationId).trim();
  const authHeader = String(input.authHeaderName || "x-api-key").trim();
  const method = String(input.method || "GET").trim().toUpperCase();
  const baseUrl = String(input.baseUrl || "").trim();
  const endpoint = String(input.endpoint || "").trim();

  return `import { registerSourceResolver } from "../source-resolver-registry.js";

registerSourceResolver({
  integrationId: "${integrationId}",
  entityTypes: ["${entityType}"],
  listEntities: async () => [{ entityType: "${entityType}", label: "${entityType}" }],
  fetchRecords: async (config, connection, binding) => {
    const baseUrl = String(config?.baseUrl || "${baseUrl}").trim();
    const endpoint = String(config?.endpoint || binding?.endpoint || "${endpoint}").trim();
    const raw = endpoint && /^https?:\\/\\//i.test(endpoint) ? endpoint
      : [baseUrl.replace(/\\/+$/, ""), endpoint.replace(/^\\/+/, "")].filter(Boolean).join("/");
    if (!raw) throw new Error("baseUrl or endpoint is required");
    const authRef = String(config?.authRef || connection?.authRef || "${authRef}").trim();
    const headerName = String(config?.authHeaderName || "${authHeader}").trim();
    const token = [authRef, \`\${authRef.toUpperCase()}_API_KEY\`, \`\${authRef.toUpperCase()}_TOKEN\`]
      .map((key) => process.env[key])
      .find(Boolean) || "";
    const headers = { accept: "application/json" };
    if (token && headerName) headers[headerName] = token;
    const response = await fetch(raw, { method: "${method}", headers });
    const payload = await response.json().catch(() => response.text());
    if (!response.ok) {
      throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : [payload]);
    return rows.map((row, index) => ({
      id: String(row?.id ?? row?.ID ?? index + 1),
      ...row,
      fetchedAt: new Date().toISOString(),
    }));
  },
});
`;
}

function buildResolverFileProposal(input = {}) {
  const integrationId = slugifyIntegrationId(input.integrationId);
  const filename = `${integrationId}.js`;
  const target = validateResolverTargetPath(`${RESOLVER_DIR}/${filename}`);
  const code = buildCustomHttpResolverCode({ ...input, integrationId });
  const required = input.outputMode === "normalized-rows" || input.outputMode === "data-source";
  return {
    kind: RESOLVER_KIND,
    integrationId,
    targetPath: target.ok ? target.path : `${RESOLVER_DIR}/${filename}`,
    filename,
    code,
    why: required
      ? "Normalized rows and Data Source refresh require a server resolver file."
      : "Optional — raw API responses can be tested without a resolver.",
    recommendation: required ? "required" : (input.baseUrl ? "recommended" : "optional"),
    inputContract: {
      baseUrl: input.baseUrl || "",
      endpoint: input.endpoint || "",
      method: input.method || "GET",
      authRef: input.authRef || integrationId,
      authHeaderName: input.authHeaderName || "x-api-key",
    },
    outputContract: {
      entityType: String(input.entityType || `${integrationId}.records`),
      storage: input.storageMode || "workspace-source-records",
    },
    securityWarnings: [
      "Resolver code must never hard-code secret values.",
      "Auth resolves from runtime env only.",
    ],
  };
}

export {
  RESOLVER_DIR,
  RESOLVER_KIND,
  slugifyIntegrationId,
  validateResolverTargetPath,
  buildCustomHttpResolverCode,
  buildResolverFileProposal,
};
