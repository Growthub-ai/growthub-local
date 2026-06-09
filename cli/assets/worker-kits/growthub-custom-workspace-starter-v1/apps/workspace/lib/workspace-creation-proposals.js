/**
 * Governed Creation Proposal System V1 — normalized proposal builders.
 *
 * Turns operator intent (Register API wizard, helper lane) into inert
 * proposals for config rows, resolver files, env requirements, and test plans.
 * Nothing mutates until an explicit apply step with receipts.
 */

import { buildEnvKeyCatalog } from "./workspace-env-catalog.js";
import { isEnvRefConfigured } from "./workspace-env-resolver.js";
import { buildResolverFileProposal, slugifyIntegrationId } from "./workspace-resolver-proposal.js";

const CREATION_PROPOSAL_KIND = "growthub-creation-proposal-bundle-v1";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeAuthMode(value) {
  const mode = clean(value).toLowerCase();
  if (["none", "bearer", "api-key", "custom-header"].includes(mode)) return mode;
  if (mode === "api_key") return "api-key";
  return "api-key";
}

function authHeaderForMode(mode, customHeader) {
  if (mode === "bearer") return { authHeaderName: "authorization", authPrefix: "Bearer" };
  if (mode === "custom-header") return { authHeaderName: clean(customHeader) || "x-api-key", authPrefix: "" };
  if (mode === "none") return { authHeaderName: "", authPrefix: "" };
  return { authHeaderName: "x-api-key", authPrefix: "" };
}

function findApiRegistryObject(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.find((o) => o?.objectType === "api-registry") || null;
}

function buildApiRegistryRowProposal(draft = {}) {
  const integrationId = slugifyIntegrationId(draft.integrationId || draft.name);
  const authMode = normalizeAuthMode(draft.authMode);
  const auth = authHeaderForMode(authMode, draft.authHeaderName);
  const authRef = authMode === "none" ? "" : clean(draft.authRef || integrationId);
  return {
    type: "creation.api-registry-row",
    affectedField: "dataModel",
    payload: {
      objectType: "api-registry",
      row: {
        Name: clean(draft.name) || integrationId,
        integrationId,
        description: clean(draft.description),
        businessPurpose: clean(draft.businessPurpose),
        baseUrl: clean(draft.baseUrl),
        endpoint: clean(draft.endpoint),
        method: clean(draft.method || "GET").toUpperCase(),
        authRef,
        authMode,
        authHeaderName: auth.authHeaderName,
        authPrefix: auth.authPrefix,
        connectorKind: "http",
        status: "draft",
        lastTested: "",
        testStatus: "",
      },
    },
  };
}

function buildDataSourceProposal(draft = {}, apiRow = {}) {
  const integrationId = clean(apiRow.integrationId || draft.integrationId);
  const sourceId = clean(draft.sourceId || `${integrationId}-source`);
  const entityType = clean(draft.entityType || `${integrationId}.records`);
  return {
    type: "creation.data-source-row",
    affectedField: "dataModel",
    payload: {
      objectType: "data-source",
      object: {
        id: sourceId,
        label: clean(draft.sourceLabel || apiRow.Name || sourceId),
        objectType: "data-source",
        storageType: draft.storageMode === "data-model-rows" ? "manual-object" : "integration-backed",
        columns: Array.isArray(draft.fieldMap) && draft.fieldMap.length
          ? draft.fieldMap.map((f) => clean(f.target || f.source)).filter(Boolean)
          : ["id", "name", "status"],
        rows: [],
        sourceId,
        registryId: integrationId,
        binding: {
          mode: "integration",
          sourceStorage: draft.storageMode === "widget-binding" ? "widget-binding" : "workspace-source-records",
          integrationId,
          sourceId,
          entityType,
        },
      },
    },
  };
}

function buildSandboxWorkflowProposal(draft = {}, apiRow = {}) {
  const integrationId = clean(apiRow.integrationId || draft.integrationId);
  const name = clean(draft.workflowName || `${integrationId}-workflow`);
  return {
    type: "creation.sandbox-workflow-row",
    affectedField: "dataModel",
    payload: {
      objectType: "sandbox-environment",
      row: {
        Name: name,
        runtime: clean(draft.runtime || "node"),
        adapter: clean(draft.adapter || "default-local-process"),
        runLocality: clean(draft.runLocality || "local"),
        lifecycleStatus: "draft",
        version: "0.0.1",
        envRefs: clean(draft.envRefs || apiRow.authRef || integrationId),
        schedulerRegistryId: clean(draft.schedulerRegistryId || integrationId),
        orchestrationConfig: draft.orchestrationConfig || {
          version: 1,
          nodes: [
            {
              id: "input-1",
              type: "workflow-input",
              label: "Input",
              config: {},
            },
            {
              id: "api-1",
              type: "api-registry-call",
              label: apiRow.Name || integrationId,
              config: { registryId: integrationId, integrationId },
            },
          ],
          edges: [{ from: "input-1", to: "api-1" }],
        },
      },
    },
  };
}

function buildEnvRequirementProposal(draft = {}) {
  const authRef = clean(draft.authRef || draft.integrationId);
  if (!authRef || normalizeAuthMode(draft.authMode) === "none") return null;
  return {
    type: "creation.env-requirement",
    affectedField: "integrations",
    payload: {
      sourceType: "custom-api-webhooks",
      endpointRef: authRef,
      kind: "api",
      hasSecret: false,
      status: "not-configured",
    },
  };
}

function validateCreationDraft(draft = {}, workspaceConfig = {}, env = process.env) {
  const errors = [];
  const warnings = [];
  if (!clean(draft.name)) errors.push("name is required");
  if (!clean(draft.integrationId) && !clean(draft.name)) errors.push("integrationId is required");
  if (!clean(draft.baseUrl) && !clean(draft.endpoint)) errors.push("baseUrl or endpoint is required");
  const authMode = normalizeAuthMode(draft.authMode);
  const authRef = clean(draft.authRef || draft.integrationId);
  if (authMode !== "none" && authRef && !isEnvRefConfigured(authRef, env)) {
    warnings.push(`env ref "${authRef}" is not configured — save the secret in Settings before testing`);
  }
  const catalog = buildEnvKeyCatalog(workspaceConfig, env);
  const outputMode = clean(draft.outputMode || "raw-response");
  if (outputMode === "data-source" && !draft.baseUrl && !draft.endpoint) {
    errors.push("data source output requires a request contract");
  }
  return { ok: errors.length === 0, errors, warnings, catalogSummary: catalog.summary };
}

function buildCreationProposalBundle(draft = {}, workspaceConfig = {}, env = process.env) {
  const validation = validateCreationDraft(draft, workspaceConfig, env);
  const apiRowProposal = buildApiRegistryRowProposal(draft);
  const apiRow = apiRowProposal.payload.row;
  const resolverProposal = ["normalized-rows", "data-source", "workflow-action"].includes(clean(draft.outputMode))
    ? buildResolverFileProposal({ ...draft, ...apiRow, integrationId: apiRow.integrationId })
    : null;
  const envRequirement = buildEnvRequirementProposal({ ...draft, ...apiRow });
  const proposals = [apiRowProposal];
  if (envRequirement) proposals.push(envRequirement);
  if (resolverProposal) {
    proposals.push({
      type: "creation.resolver-file",
      affectedField: "server-file",
      payload: resolverProposal,
    });
  }
  if (["data-source", "workflow-action"].includes(clean(draft.outputMode))) {
    proposals.push(buildDataSourceProposal(draft, apiRow));
  }
  if (clean(draft.outputMode) === "workflow-action") {
    proposals.push(buildSandboxWorkflowProposal(draft, apiRow));
  }
  return {
    kind: CREATION_PROPOSAL_KIND,
    businessGoal: clean(draft.businessPurpose) || `Register ${apiRow.Name}`,
    targetSurfaces: [
      "api-registry",
      envRequirement ? "settings-apis-webhooks" : null,
      resolverProposal ? "resolver-file" : null,
      ["data-source", "workflow-action"].includes(clean(draft.outputMode)) ? "data-source" : null,
      clean(draft.outputMode) === "workflow-action" ? "sandbox-workflow" : null,
    ].filter(Boolean),
    proposals,
    envAuthRequirements: envRequirement ? [{ slug: envRequirement.payload.endpointRef, configured: isEnvRefConfigured(envRequirement.payload.endpointRef, env) }] : [],
    validation,
    testPlan: [
      "Save secret in Settings if authRef is missing",
      "POST /api/workspace/test-api-record with the registry row",
      resolverProposal ? "Apply resolver file then POST /api/workspace/test-source" : null,
      ["data-source", "workflow-action"].includes(clean(draft.outputMode)) ? "POST /api/workspace/refresh-source" : null,
      clean(draft.outputMode) === "workflow-action" ? "Test draft workflow in Workflow Cockpit" : null,
    ].filter(Boolean),
    activationPlan: [
      "API Registry row exists",
      "authRef resolves",
      resolverProposal ? "resolver file written" : "resolver not required",
      "API test passed",
      ["data-source", "workflow-action"].includes(clean(draft.outputMode)) ? "Data Source linked" : null,
      clean(draft.outputMode) === "workflow-action" ? "workflow published" : null,
    ].filter(Boolean),
    risks: validation.warnings,
  };
}

export {
  CREATION_PROPOSAL_KIND,
  normalizeAuthMode,
  buildApiRegistryRowProposal,
  buildDataSourceProposal,
  buildSandboxWorkflowProposal,
  buildEnvRequirementProposal,
  validateCreationDraft,
  buildCreationProposalBundle,
  findApiRegistryObject,
};
