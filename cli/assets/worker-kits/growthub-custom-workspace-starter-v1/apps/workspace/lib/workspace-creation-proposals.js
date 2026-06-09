/**
 * Governed Creation Proposal System V1 — normalized bundle for the operator journey.
 *
 * Turns Register API wizard / helper intent into inert proposals for:
 *   - API Registry row (config / dataModel PATCH)
 *   - resolver file (server file write)
 *   - Data Source row (config)
 *   - Sandbox/Workflow row (config)
 *
 * No secret values. No hidden mutations. Apply routes validate + receipt each leg.
 */

import { resolveEnvRefStatus } from "./workspace-env-resolver.js";
import { buildResolverFileProposal } from "./workspace-resolver-proposal.js";

const BUNDLE_KIND = "growthub-creation-proposal-bundle-v1";
const TESTED_STATUSES = new Set(["connected", "approved", "ok", "success", "tested"]);

function clean(value) {
  return String(value ?? "").trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizeAuthMode(draft) {
  const mode = clean(draft.authMode || draft.authType).toLowerCase();
  if (["none", "bearer", "api-key", "custom-header"].includes(mode)) return mode;
  if (draft.authPrefix) return "bearer";
  if (draft.authHeaderName && draft.authHeaderName !== "x-api-key") return "custom-header";
  return draft.authRef ? "api-key" : "none";
}

function resolverRecommendation(draft) {
  const outputMode = clean(draft.outputMode).toLowerCase();
  if (outputMode === "raw-response") return "not-needed";
  if (outputMode === "workflow-action") return "optional";
  if (["normalized-rows", "data-source", "data source"].includes(outputMode)) return "required";
  return "recommended";
}

function buildApiRegistryRowProposal(draft = {}) {
  const integrationId = slugify(draft.integrationId || draft.name || "api");
  const authRef = clean(draft.authRef) || integrationId;
  const authMode = normalizeAuthMode({ ...draft, authRef });
  const envStatus = resolveEnvRefStatus(authRef);

  const row = {
    id: draft.id || `api-${integrationId}`,
    Name: clean(draft.name) || integrationId,
    integrationId,
    description: clean(draft.description || draft.businessPurpose),
    baseUrl: clean(draft.baseUrl),
    endpoint: clean(draft.endpoint),
    method: clean(draft.method || "GET").toUpperCase(),
    authRef,
    authHeaderName: clean(draft.authHeaderName || "x-api-key"),
    authPrefix: authMode === "bearer" ? "Bearer" : clean(draft.authPrefix),
    status: "draft",
    connectorKind: "custom-http",
    executionLane: "api-registry",
    entityTypes: clean(draft.entityType || "records"),
  };

  return {
    type: "creation.api-registry-row",
    affectedField: "dataModel",
    objectType: "api-registry",
    payload: { row, objectId: draft.apiRegistryObjectId || "api-registry" },
    envRequirement: {
      authRef,
      configured: authMode === "none" ? true : envStatus.configured,
      resolvedKey: envStatus.resolvedKey,
    },
    validation: {
      valid: Boolean(row.baseUrl || row.endpoint) && Boolean(row.integrationId),
      missing: [
        !row.integrationId ? "integrationId" : null,
        !(row.baseUrl || row.endpoint) ? "baseUrl or endpoint" : null,
        authMode !== "none" && !envStatus.configured ? "authRef env" : null,
      ].filter(Boolean),
    },
  };
}

function buildDataSourceRowProposal(draft = {}, apiRow = null) {
  const integrationId = clean(apiRow?.integrationId || draft.integrationId);
  const sourceId = slugify(draft.sourceId || `${integrationId}-source`);
  const entityType = clean(draft.entityType || apiRow?.entityTypes || "records");

  const row = {
    id: sourceId,
    Name: clean(draft.sourceName || draft.name) || `${integrationId} source`,
    registryId: integrationId,
    entityType,
    sourceId,
    sourceStorage: clean(draft.storageMode) === "data-model" ? "workspace-data-model" : "workspace-source-records",
    status: "draft",
    binding: {
      mode: "integration",
      integrationId,
      sourceId,
      entityType,
      sourceStorage: "workspace-source-records",
    },
  };

  return {
    type: "creation.data-source-row",
    affectedField: "dataModel",
    objectType: "data-source",
    payload: { row, objectId: draft.dataSourceObjectId || "data-sources" },
    validation: {
      valid: Boolean(integrationId) && Boolean(sourceId),
      missing: [!integrationId ? "registryId" : null, !sourceId ? "sourceId" : null].filter(Boolean),
    },
  };
}

function buildSandboxWorkflowProposal(draft = {}, apiRow = null) {
  const integrationId = clean(apiRow?.integrationId || draft.integrationId);
  const name = clean(draft.workflowName || draft.name) || `${integrationId} workflow`;
  const row = {
    id: slugify(draft.sandboxId || `${integrationId}-sandbox`),
    Name: name,
    lifecycleStatus: "draft",
    version: "0.1.0",
    runLocality: clean(draft.runLocality) === "serverless" ? "serverless" : "local",
    runtime: clean(draft.runtime || "node"),
    adapter: clean(draft.adapter || "default-local-process"),
    envRefs: clean(draft.envRefs || apiRow?.authRef || integrationId),
    status: "draft",
    orchestrationConfig: draft.orchestrationConfig || null,
    schedulerRegistryId: clean(draft.schedulerRegistryId),
  };

  return {
    type: "creation.sandbox-workflow-row",
    affectedField: "dataModel",
    objectType: "sandbox-environment",
    payload: { row, objectId: draft.sandboxObjectId || "sandbox-environments" },
    validation: {
      valid: Boolean(row.Name),
      missing: [!row.Name ? "name" : null].filter(Boolean),
    },
  };
}

function buildCreationProposalBundle(draft = {}, env = process.env) {
  const outputMode = clean(draft.outputMode).toLowerCase() || "data-source";
  const resolverNeed = resolverRecommendation(draft);
  const apiProposal = buildApiRegistryRowProposal(draft);
  const authRef = apiProposal.envRequirement?.authRef;
  const envStatus = resolveEnvRefStatus(authRef, env);

  const bundle = {
    kind: BUNDLE_KIND,
    businessGoal: clean(draft.businessPurpose || draft.description || draft.name) || "Register API and wire workspace data",
    targetSurfaces: ["api-registry", "settings-apis-webhooks"],
    outputMode,
    resolverNeed,
    proposals: [apiProposal],
    envAuth: {
      authRef,
      configured: apiProposal.envRequirement?.configured,
      resolvedKey: envStatus.resolvedKey,
      settingsHref: "/settings/apis-webhooks",
    },
    validation: {
      draftComplete: apiProposal.validation.valid,
      testPending: true,
      readyToApply: false,
      blockers: [...apiProposal.validation.missing],
    },
    testPlan: [
      "Save auth secret via Settings if authRef is not configured",
      "POST /api/workspace/test-api-record with the registry row",
      "Verify status becomes connected without leaking secret values",
    ],
    activationPlan: [
      "API Registry row exists and test passed",
      "Data Source linked when output mode requires records",
      "Sandbox workflow published when output mode is workflow-action",
    ],
    risks: [],
    applyActions: ["patch-data-model"],
  };

  if (resolverNeed !== "not-needed") {
    const resolverProposal = buildResolverFileProposal({
      ...draft,
      integrationId: apiProposal.payload.row.integrationId,
      authRef,
    });
    bundle.proposals.push({
      type: "creation.resolver-file",
      affectedField: "server-file",
      payload: resolverProposal,
      validation: {
        valid: resolverProposal.valid,
        missing: resolverProposal.errors,
      },
    });
    bundle.targetSurfaces.push("resolver-proposal-studio");
    bundle.applyActions.push("write-resolver-file");
    if (resolverNeed === "required" && !resolverProposal.valid) {
      bundle.validation.blockers.push("resolver path invalid");
    }
  }

  if (["data-source", "normalized-rows", "data source"].includes(outputMode)) {
    const ds = buildDataSourceRowProposal(draft, apiProposal.payload.row);
    bundle.proposals.push(ds);
    bundle.targetSurfaces.push("data-source-creation");
    bundle.applyActions.push("patch-data-model");
  }

  if (outputMode === "workflow-action") {
    const sb = buildSandboxWorkflowProposal(draft, apiProposal.payload.row);
    bundle.proposals.push(sb);
    bundle.targetSurfaces.push("workflow-cockpit");
    bundle.applyActions.push("patch-data-model");
  }

  if (envStatus.configured || normalizeAuthMode(draft) === "none") {
    bundle.validation.testReady = true;
  } else {
    bundle.risks.push("authRef env is not configured — save secret before testing");
    bundle.validation.blockers.push("authRef env");
  }

  bundle.validation.readyToApply =
    bundle.validation.draftComplete &&
    bundle.validation.blockers.length === 0 &&
    (draft.testPassed === true || draft.skipTest === true);

  if (draft.testPassed === true) {
    apiProposal.payload.row.status = "connected";
    apiProposal.payload.row.lastTested = draft.lastTested || new Date().toISOString();
    bundle.validation.testPending = false;
  }

  return bundle;
}

function validateCreationBundle(bundle) {
  const errors = [];
  if (!bundle || bundle.kind !== BUNDLE_KIND) errors.push("invalid bundle kind");
  const proposals = Array.isArray(bundle?.proposals) ? bundle.proposals : [];
  for (const proposal of proposals) {
    if (!proposal?.validation?.valid) {
      errors.push(`${proposal.type}: ${(proposal.validation?.missing || []).join(", ")}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Helper-facing structured response for register_api intent.
 */
function buildHelperCreationResponse(draft, env = process.env) {
  const bundle = buildCreationProposalBundle(draft, env);
  return {
    summary: bundle.businessGoal,
    proposals: bundle.proposals.map((p) => ({
      type: p.type,
      affectedField: p.affectedField,
      payload: p.payload,
      label: p.type.replace("creation.", "").replace(/-/g, " "),
    })),
    warnings: bundle.risks,
    creationBundle: bundle,
    activationPlan: bundle.activationPlan,
    testPlan: bundle.testPlan,
  };
}

export {
  BUNDLE_KIND,
  buildApiRegistryRowProposal,
  buildDataSourceRowProposal,
  buildSandboxWorkflowProposal,
  buildCreationProposalBundle,
  validateCreationBundle,
  buildHelperCreationResponse,
  resolverRecommendation,
};
