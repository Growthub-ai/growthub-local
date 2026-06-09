/**
 * Workspace Creation Proposals V1 — normalized governed creation artifacts.
 *
 * Builds inert proposals for the Register API wizard, resolver studio, data
 * source lane, and sandbox/workflow wiring. Proposals never contain secret
 * values. Apply is explicit and receipted.
 */

import { isApiRegistrySetupComplete } from "./orchestration-graph.js";
import { isEnvRefConfigured } from "./workspace-env-resolver.js";

const PROPOSAL_BUNDLE_KIND = "growthub-creation-proposal-bundle-v1";

const OUTPUT_MODES = ["raw-response", "normalized-rows", "data-source", "workflow-action"];
const AUTH_MODES = ["none", "bearer", "api-key-header", "custom-header"];

const RESOLVER_DIR = "lib/adapters/integrations/resolvers";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function slugify(value) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "integration";
}

function validateResolverTargetPath(targetPath) {
  const normalized = safeString(targetPath).replace(/\\/g, "/").trim();
  if (!normalized) return { ok: false, error: "target path is required" };
  if (normalized.includes("..")) return { ok: false, error: "path traversal not allowed" };
  if (!normalized.startsWith(`${RESOLVER_DIR}/`)) {
    return { ok: false, error: `resolver must live under ${RESOLVER_DIR}/` };
  }
  if (!normalized.endsWith(".js")) return { ok: false, error: "resolver must be a .js file" };
  return { ok: true, path: normalized };
}

function buildAuthHeaderConfig(authMode, draft) {
  if (authMode === "none") return { authRef: "", authHeaderName: "", authPrefix: "" };
  if (authMode === "bearer") {
    return {
      authRef: safeString(draft.authRef).trim(),
      authHeaderName: "Authorization",
      authPrefix: "Bearer",
    };
  }
  if (authMode === "api-key-header") {
    return {
      authRef: safeString(draft.authRef).trim(),
      authHeaderName: safeString(draft.authHeaderName || "x-api-key").trim() || "x-api-key",
      authPrefix: "",
    };
  }
  return {
    authRef: safeString(draft.authRef).trim(),
    authHeaderName: safeString(draft.authHeaderName).trim() || "x-api-key",
    authPrefix: safeString(draft.authPrefix).trim(),
  };
}

function buildApiRegistryRowProposal(draft) {
  const integrationId = slugify(draft.integrationId || draft.name);
  const auth = buildAuthHeaderConfig(draft.authMode || "api-key-header", draft);
  const row = {
    Name: safeString(draft.name).trim() || integrationId,
    integrationId,
    description: safeString(draft.description).trim(),
    businessPurpose: safeString(draft.businessPurpose || draft.purpose).trim(),
    baseUrl: safeString(draft.baseUrl).trim(),
    endpoint: safeString(draft.endpoint).trim(),
    method: safeString(draft.method || "GET").trim().toUpperCase(),
    ...auth,
    status: "draft",
    outputMode: safeString(draft.outputMode || "raw-response").trim(),
  };
  const complete = isApiRegistrySetupComplete(row);
  const authReady = !row.authRef || isEnvRefConfigured(row.authRef, draft.env);
  return {
    type: "creation.api-registry-row",
    stateKind: "portable-config",
    affectedField: "dataModel",
    status: complete ? (authReady ? "ready" : "auth-unresolved") : "draft-incomplete",
    payload: {
      objectType: "api-registry",
      objectLabel: "API Registry",
      row,
    },
    envRequirements: row.authRef ? [{ slug: row.authRef, configured: authReady }] : [],
    testPlan: complete ? ["POST /api/workspace/test-api-record"] : [],
  };
}

function buildResolverFileProposal(draft, apiRow) {
  const integrationId = safeString(apiRow?.integrationId || draft.integrationId).trim();
  const filename = `${slugify(integrationId)}.js`;
  const targetPath = `${RESOLVER_DIR}/${filename}`;
  const pathCheck = validateResolverTargetPath(targetPath);
  const label = safeString(apiRow?.Name || integrationId).replace(/"/g, "'");
  const baseUrl = safeString(apiRow?.baseUrl).replace(/"/g, "");
  const endpoint = safeString(apiRow?.endpoint).replace(/^\/+/, "").replace(/"/g, "");
  const method = safeString(apiRow?.method || "GET");
  const fetchUrl = endpoint && /^https?:\/\//i.test(endpoint) ? endpoint : `${baseUrl.replace(/\/+$/, "")}/${endpoint}`;
  const code = [
    'import { registerSourceResolver } from "@/lib/adapters/integrations/resolver-registry";',
    "",
    "registerSourceResolver({",
    `  integrationId: "${integrationId}",`,
    `  label: "${label}",`,
    '  entityTypes: ["records"],',
    "  async fetchRecords() {",
    `    const response = await fetch("${fetchUrl}", {`,
    `      method: "${method}",`,
    '      headers: { accept: "application/json" },',
    "    });",
    "    if (!response.ok) throw new Error(`fetch failed: ${response.status}`);",
    "    const payload = await response.json();",
    "    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : [payload]);",
    "    return rows.map((item, index) => ({ id: String(item?.id ?? index), ...item }));",
    "  },",
    "});",
    "",
  ].join("\n");

  return {
    type: "creation.resolver-file",
    stateKind: "server-file",
    status: pathCheck.ok ? (draft.resolverRequired ? "required" : "recommended") : "invalid-path",
    payload: {
      targetPath: pathCheck.ok ? pathCheck.path : targetPath,
      filename,
      integrationId,
      code,
      why: "Normalizes API output into governed source records without storing secrets in config.",
      inputContract: { integrationId, binding: "api-registry row" },
      outputContract: { records: "array of { id, ...fields }" },
      linkedRegistryId: integrationId,
      pathValidation: pathCheck,
    },
    securityWarnings: [
      "Never inline secret values in resolver source.",
      "Auth resolves server-side via envRef at fetch time.",
    ],
  };
}

function buildDataSourceProposal(draft, apiRow) {
  const registryId = safeString(apiRow?.integrationId).trim();
  const sourceId = slugify(draft.sourceId || `${registryId}-source`);
  const row = {
    Name: safeString(draft.sourceName || `${apiRow?.Name || registryId} Source`).trim(),
    sourceId,
    registryId,
    resolverMode: safeString(draft.resolverMode || "resolver").trim(),
    storageMode: safeString(draft.storageMode || "source-record-sidecar").trim(),
    fieldMap: Array.isArray(draft.fieldMap) ? draft.fieldMap : [],
    status: "draft",
  };
  return {
    type: "creation.data-source-row",
    stateKind: "portable-config",
    affectedField: "dataModel",
    status: registryId ? "ready" : "missing-registry",
    payload: {
      objectType: "data-source",
      objectLabel: "Data Sources",
      row,
    },
    testPlan: ["POST /api/workspace/refresh-source", "POST /api/workspace/test-source"],
  };
}

function buildSandboxProposal(draft, apiRow) {
  const registryId = safeString(apiRow?.integrationId).trim();
  const name = safeString(draft.workflowName || `${apiRow?.Name || registryId} Workflow`).trim();
  return {
    type: "creation.sandbox-workflow-row",
    stateKind: "portable-config",
    affectedField: "dataModel",
    status: registryId ? "ready" : "missing-registry",
    payload: {
      objectType: "sandbox-environment",
      objectLabel: "Workflows",
      row: {
        Name: name,
        runLocality: safeString(draft.runLocality || "local").trim(),
        schedulerRegistryId: safeString(draft.schedulerRegistryId).trim(),
        envRefs: Array.isArray(draft.envRefs) ? draft.envRefs : (apiRow?.authRef ? [apiRow.authRef] : []),
        lifecycleStatus: "draft",
        status: "draft",
      },
      orchestrationHint: "Wire api-registry-call node to registryId in Workflow Cockpit.",
    },
    testPlan: ["POST /api/workspace/sandbox-run"],
  };
}

function validateCreationDraft(draft) {
  const errors = [];
  const warnings = [];
  if (!safeString(draft.name).trim() && !safeString(draft.integrationId).trim()) {
    errors.push("name or integrationId is required");
  }
  if (!safeString(draft.baseUrl).trim() && !safeString(draft.endpoint).trim()) {
    errors.push("baseUrl or endpoint is required");
  }
  const outputMode = safeString(draft.outputMode).trim();
  if (outputMode && !OUTPUT_MODES.includes(outputMode)) {
    errors.push(`outputMode must be one of: ${OUTPUT_MODES.join(", ")}`);
  }
  const authMode = safeString(draft.authMode).trim();
  if (authMode && !AUTH_MODES.includes(authMode)) {
    errors.push(`authMode must be one of: ${AUTH_MODES.join(", ")}`);
  }
  if (authMode && authMode !== "none" && !safeString(draft.authRef).trim()) {
    warnings.push("authRef missing — set in Settings before test");
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Build a full creation proposal bundle from a Register API wizard draft.
 */
function buildCreationProposalBundle(draft = {}, options = {}) {
  const validation = validateCreationDraft(draft);
  const apiProposal = buildApiRegistryRowProposal({ ...draft, env: options.env });
  const apiRow = apiProposal.payload.row;
  const proposals = [apiProposal];

  const needsResolver = ["normalized-rows", "data-source"].includes(safeString(draft.outputMode));
  if (needsResolver || draft.includeResolver) {
    proposals.push(buildResolverFileProposal(draft, apiRow));
  }
  if (["data-source", "normalized-rows"].includes(safeString(draft.outputMode))) {
    proposals.push(buildDataSourceProposal(draft, apiRow));
  }
  if (safeString(draft.outputMode) === "workflow-action" || draft.includeWorkflow) {
    proposals.push(buildSandboxProposal(draft, apiRow));
  }

  const readyToApply = validation.ok
    && apiProposal.status !== "draft-incomplete"
    && proposals.every((p) => p.status !== "invalid-path" && p.status !== "missing-registry");

  return {
    kind: PROPOSAL_BUNDLE_KIND,
    businessGoal: safeString(draft.businessPurpose || draft.purpose || draft.name).trim(),
    validation,
    proposals,
    envRequirements: apiProposal.envRequirements || [],
    activationPlan: proposals.map((p) => p.testPlan || []).flat(),
    risks: validation.warnings,
    status: readyToApply ? "ready-to-apply" : (validation.ok ? "draft-valid" : "draft-incomplete"),
    applyActions: proposals.map((p) => ({
      type: p.type,
      stateKind: p.stateKind,
      affectedField: p.affectedField || null,
    })),
  };
}

/**
 * Apply receipt shape (name-only, no secrets).
 */
function buildApplyReceipt(applied, skipped, warnings = []) {
  return {
    kind: "growthub-creation-apply-receipt-v1",
    applied: Array.isArray(applied) ? applied : [],
    skipped: Array.isArray(skipped) ? skipped : [],
    warnings: Array.isArray(warnings) ? warnings : [],
    at: new Date().toISOString(),
  };
}

export {
  PROPOSAL_BUNDLE_KIND,
  OUTPUT_MODES,
  AUTH_MODES,
  RESOLVER_DIR,
  validateResolverTargetPath,
  validateCreationDraft,
  buildApiRegistryRowProposal,
  buildResolverFileProposal,
  buildDataSourceProposal,
  buildSandboxProposal,
  buildCreationProposalBundle,
  buildApplyReceipt,
};
