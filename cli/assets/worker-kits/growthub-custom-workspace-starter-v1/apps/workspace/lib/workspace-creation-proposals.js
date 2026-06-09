/**
 * Governed Creation Proposals V1 — normalized proposal shape for the
 * intent → lane → apply loop. Proposals are inert until explicitly applied.
 *
 * Never includes secret values. Config patches stay within PATCH allowlist.
 * File proposals target approved resolver paths only.
 */

const CREATION_PROPOSAL_KIND = "growthub-creation-proposal-bundle-v1";

const OUTPUT_MODES = ["raw-response", "normalized-rows", "data-source", "workflow-action"];
const AUTH_MODES = ["none", "bearer", "api-key", "custom-header", "env-ref"];

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "api";
}

function normalizeMethod(value) {
  const method = String(value || "GET").trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ? method : "GET";
}

function buildApiRegistryRowProposal(draft) {
  const integrationId = slugify(draft.integrationId || draft.name);
  const authRef = String(draft.authRef || integrationId).trim();
  return {
    type: "dataModel.row.add",
    affectedField: "dataModel",
    payload: {
      objectType: "api-registry",
      objectId: draft.objectId || null,
      row: {
        Name: String(draft.name || integrationId).trim(),
        integrationId,
        description: String(draft.description || draft.businessPurpose || "").trim(),
        baseUrl: String(draft.baseUrl || "").trim(),
        endpoint: String(draft.endpoint || "").trim(),
        method: normalizeMethod(draft.method),
        authRef,
        authHeaderName: String(draft.authHeaderName || "x-api-key").trim(),
        authPrefix: String(draft.authPrefix || "").trim(),
        status: "",
        connectorKind: String(draft.connectorKind || "rest").trim(),
        executionLane: String(draft.executionLane || "outbound-http").trim(),
      },
    },
    rationale: `Register API ${integrationId} in API Registry`,
    confidence: 0.95,
    meta: {
      surface: "api-registry",
      authRef,
      envRequirement: draft.authMode === "none" ? null : authRef,
      testPlan: "POST /api/workspace/test-api-record after apply",
    },
  };
}

function buildDataSourceRowProposal(draft, apiRow) {
  const registryId = String(apiRow?.integrationId || draft.registryId || "").trim();
  const sourceId = slugify(draft.sourceId || `${registryId}-source`);
  return {
    type: "dataModel.row.add",
    affectedField: "dataModel",
    payload: {
      objectType: "data-source",
      objectId: draft.objectId || null,
      row: {
        Name: String(draft.name || sourceId).trim(),
        registryId,
        sourceId,
        resolverTemplateId: String(draft.resolverTemplateId || "").trim(),
        status: "",
        description: String(draft.description || `Data source for ${registryId}`).trim(),
        fieldMap: draft.fieldMap || "",
        storageMode: String(draft.storageMode || "source-record").trim(),
      },
    },
    rationale: `Create Data Source bound to API Registry row ${registryId}`,
    confidence: 0.9,
    meta: {
      surface: "data-source",
      registryId,
      testPlan: "POST /api/workspace/refresh-source after apply",
    },
  };
}

function buildResolverFileProposal(draft) {
  const integrationId = slugify(draft.integrationId || draft.name);
  const filename = `${integrationId}.js`;
  const targetPath = `lib/adapters/integrations/resolvers/${filename}`;
  const code = String(draft.resolverCode || defaultResolverTemplate(integrationId, draft)).trim();
  return {
    type: "resolver.file.write",
    affectedField: null,
    payload: {
      targetPath,
      filename,
      integrationId,
      code,
      linkedRegistryId: integrationId,
    },
    rationale: `Write resolver module for ${integrationId}`,
    confidence: 0.85,
    meta: {
      surface: "resolver-studio",
      securityWarnings: code.includes("process.env") ? [] : ["Resolver should read secrets via process.env only"],
      rollback: "Delete the resolver file and re-upload if apply fails",
    },
  };
}

function buildSandboxRowProposal(draft, apiRow) {
  const registryId = String(apiRow?.integrationId || draft.registryId || "").trim();
  const name = String(draft.sandboxName || `${registryId}-tool`).trim();
  return {
    type: "dataModel.row.add",
    affectedField: "dataModel",
    payload: {
      objectType: "sandbox-environment",
      objectId: draft.sandboxObjectId || null,
      row: {
        Name: name,
        lifecycleStatus: "draft",
        version: "0.1.0",
        runLocality: String(draft.runLocality || "local").trim(),
        schedulerRegistryId: String(draft.schedulerRegistryId || "").trim(),
        runtime: String(draft.runtime || "node").trim(),
        adapter: String(draft.adapter || "default-local-process").trim(),
        authRef: String(draft.authRef || apiRow?.authRef || registryId).trim(),
        envRefs: String(draft.envRefs || draft.authRef || apiRow?.authRef || registryId).trim(),
        networkAllow: draft.networkAllow !== false,
        status: "",
        description: String(draft.description || `Sandbox tool for ${registryId}`).trim(),
        orchestrationConfig: draft.orchestrationConfig || "",
      },
    },
    rationale: `Create sandbox workflow row ${name} linked to ${registryId}`,
    confidence: 0.88,
    meta: {
      surface: "sandbox-environment",
      registryId,
      testPlan: "POST /api/workspace/sandbox-run after apply",
    },
  };
}

function defaultResolverTemplate(integrationId, draft) {
  const method = normalizeMethod(draft?.method);
  return `import { registerSourceResolver } from "../source-resolver-registry.js";

registerSourceResolver({
  integrationId: "${integrationId}",
  label: "${String(draft?.name || integrationId).replace(/"/g, '\\"')}",
  async fetchRecords({ integrationId }) {
    const baseUrl = process.env.${integrationId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_BASE_URL || "${String(draft?.baseUrl || "").replace(/"/g, '\\"')}";
    const res = await fetch(baseUrl, { method: "${method}" });
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [data]);
    return rows.map((item, index) => ({
      id: String(item?.id ?? index),
      title: String(item?.title ?? item?.name ?? \`Row \${index + 1}\`),
      raw: item,
    }));
  },
});
`;
}

function validateResolverTargetPath(targetPath) {
  const normalized = String(targetPath || "").replace(/\\/g, "/").trim();
  const prefix = "lib/adapters/integrations/resolvers/";
  if (!normalized.startsWith(prefix)) {
    return { valid: false, error: `resolver path must start with ${prefix}` };
  }
  if (normalized.includes("..")) return { valid: false, error: "path traversal not allowed" };
  if (!normalized.endsWith(".js")) return { valid: false, error: "resolver must be a .js file" };
  return { valid: true, normalized };
}

function findObjectIdByType(workspaceConfig, objectType) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const match = objects.find((o) => o?.objectType === objectType);
  return match?.id || null;
}

function buildObjectCreateProposal(objectType, label, columns) {
  const id = `${objectType.replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  return {
    type: "dataModel.object.create",
    affectedField: "dataModel",
    payload: {
      object: {
        id,
        label,
        objectType,
        columns,
        rows: [],
        binding: { mode: "manual", source: "Data Model" },
      },
    },
    rationale: `Create ${label} object`,
    confidence: 0.95,
    meta: { surface: "data-model", objectType, objectId: id },
  };
}

const OBJECT_TYPE_COLUMNS = {
  "api-registry": [
    "integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse",
    "entityTypes", "description", "connectorKind", "resolverTemplateId", "schemaVersion", "capabilities", "executionLane",
  ],
  "data-source": ["registryId", "sourceId", "resolverTemplateId", "status", "lastTested", "lastResponse", "fieldMap", "description"],
  "sandbox-environment": [
    "Name", "lifecycleStatus", "version", "runLocality", "schedulerRegistryId", "runtime", "adapter", "agentHost",
    "authRef", "envRefs", "networkAllow", "status", "lastTested", "lastRunId", "lastSourceId", "lastResponse", "orchestrationConfig", "description",
  ],
};

function hydrateProposalsForConfig(workspaceConfig, proposals) {
  const objectIds = new Map();
  for (const objectType of ["api-registry", "data-source", "sandbox-environment"]) {
    const existing = findObjectIdByType(workspaceConfig, objectType);
    if (existing) objectIds.set(objectType, existing);
  }

  const needs = new Set();
  for (const proposal of proposals) {
    if (proposal.type === "dataModel.row.add") needs.add(proposal.payload?.objectType);
  }

  const hydrated = [];
  for (const objectType of needs) {
    if (!objectIds.has(objectType)) {
      const create = buildObjectCreateProposal(
        objectType,
        objectType === "api-registry" ? "API Registry" : objectType === "data-source" ? "Data Sources" : "Sandbox Environments",
        OBJECT_TYPE_COLUMNS[objectType] || [],
      );
      hydrated.push(create);
      objectIds.set(objectType, create.payload.object.id);
    }
  }

  for (const proposal of proposals) {
    if (proposal.type !== "dataModel.row.add") {
      hydrated.push(proposal);
      continue;
    }
    const objectType = proposal.payload?.objectType;
    hydrated.push({
      ...proposal,
      payload: { ...proposal.payload, objectId: objectIds.get(objectType) || proposal.payload?.objectId },
    });
  }
  return hydrated;
}

function hydrateCreationProposalsForConfig(workspaceConfig, draft) {
  const bundle = buildCreationProposalBundle(draft);
  return { ...bundle, proposals: hydrateProposalsForConfig(workspaceConfig, bundle.proposals) };
}

function hydrateBundleForConfig(workspaceConfig, bundle) {
  if (!bundle || !Array.isArray(bundle.proposals)) return bundle;
  return { ...bundle, proposals: hydrateProposalsForConfig(workspaceConfig, bundle.proposals) };
}

function buildCreationProposalBundle(draft) {
  const warnings = [];
  const proposals = [];
  const outputMode = String(draft.outputMode || "data-source").trim();
  const authMode = String(draft.authMode || "env-ref").trim();

  if (!String(draft.name || "").trim()) warnings.push("API name is required");
  if (!String(draft.baseUrl || "").trim() && !String(draft.endpoint || "").trim()) {
    warnings.push("baseUrl or endpoint is required");
  }
  if (authMode !== "none" && !String(draft.authRef || draft.integrationId || "").trim()) {
    warnings.push("authRef is required for authenticated APIs");
  }

  const apiProposal = buildApiRegistryRowProposal(draft);
  proposals.push(apiProposal);

  const needsResolver = outputMode === "normalized-rows" || outputMode === "data-source" || draft.generateResolver;
  if (needsResolver) {
    proposals.push(buildResolverFileProposal({ ...draft, integrationId: apiProposal.payload.row.integrationId }));
  }

  if (outputMode === "data-source" || outputMode === "normalized-rows") {
    proposals.push(buildDataSourceRowProposal(draft, apiProposal.payload.row));
  }

  if (outputMode === "workflow-action") {
    proposals.push(buildSandboxRowProposal(draft, apiProposal.payload.row));
  }

  const state = warnings.length
    ? "draft-incomplete"
    : needsResolver && !draft.resolverCode ? "resolver-recommended" : "draft-valid";

  return {
    kind: CREATION_PROPOSAL_KIND,
    businessGoal: String(draft.businessPurpose || draft.description || `Register ${draft.name || "API"}`).trim(),
    targetSurfaces: proposals.map((p) => p.meta?.surface).filter(Boolean),
    proposals,
    warnings,
    validation: { state, authMode, outputMode },
    envRequirement: authMode === "none" ? null : apiProposal.payload.row.authRef,
    activationPlan: [
      "Save secret in Settings if authRef is new",
      "Apply config proposals",
      "Apply resolver file if proposed",
      "Test API via test-api-record",
      outputMode === "data-source" ? "Refresh data source records" : null,
      outputMode === "workflow-action" ? "Test draft workflow in cockpit" : null,
    ].filter(Boolean),
    risks: needsResolver ? ["Resolver write requires writable filesystem runtime"] : [],
  };
}

function validateCreationProposalBundle(bundle) {
  const errors = [];
  if (!bundle || bundle.kind !== CREATION_PROPOSAL_KIND) errors.push("invalid bundle kind");
  const proposals = Array.isArray(bundle?.proposals) ? bundle.proposals : [];
  for (const proposal of proposals) {
    if (proposal.type === "resolver.file.write") {
      const check = validateResolverTargetPath(proposal.payload?.targetPath);
      if (!check.valid) errors.push(check.error);
      if (String(proposal.payload?.code || "").match(/sk_live|api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i)) {
        errors.push("resolver code must not inline secret values");
      }
    }
    if (proposal.type?.startsWith("dataModel.") && proposal.affectedField !== "dataModel") {
      errors.push(`proposal ${proposal.type} must affect dataModel`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export {
  CREATION_PROPOSAL_KIND,
  OUTPUT_MODES,
  AUTH_MODES,
  buildApiRegistryRowProposal,
  buildDataSourceRowProposal,
  buildResolverFileProposal,
  buildSandboxRowProposal,
  buildCreationProposalBundle,
  hydrateCreationProposalsForConfig,
  hydrateBundleForConfig,
  hydrateProposalsForConfig,
  validateCreationProposalBundle,
  validateResolverTargetPath,
  slugify,
};
