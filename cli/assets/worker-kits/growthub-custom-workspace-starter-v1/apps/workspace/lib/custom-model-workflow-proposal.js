/**
 * Custom-model workflow proposal lane (CUSTOM_MODEL_WORKFLOW_CONTRACT_V1).
 *
 * The governed "first-utilization" lane behind the /custom-models cockpit's two
 * focused actions. It mirrors the swarm lane exactly: the CLIENT sends only an
 * INTENT (which model, which variant); the SERVER rebuilds the full
 * orchestration graph + sandbox row from governed evidence (never trusting a
 * client-supplied graph), upserts it into a well-known sandbox-environment
 * object, and returns an artifact the cockpit opens on the canvas.
 *
 * Nothing executes here — creation is a governed config write; runs stay behind
 * POST /api/workspace/sandbox-run. The lane refuses unless the model's endpoint
 * is verified (served tag == tuned tag), so an unverified/base-model workflow
 * can never be created.
 */

import {
  deriveCustomModelsState,
  buildCustomModelWorkflowVariants,
  buildCustomModelSandboxRow,
  CUSTOM_MODEL_WORKFLOWS_OBJECT_ID,
  CUSTOM_MODEL_WORKFLOWS_LABEL,
} from "./custom-models-ledger.js";

export const CUSTOM_MODEL_WORKFLOW_PROPOSAL_TYPE = "custom-model.workflow.create";
// Custom-model workflows live in dataModel.objects[] — the existing patch lane.
export const CUSTOM_MODEL_WORKFLOW_AFFECTED_FIELD = "dataModel";

// The variants a cockpit action may request. Kept in lock-step with
// buildCustomModelWorkflowVariants; the two focused actions use chat +
// recursive-learning, but the whole reuse set is allowed (Usage tab).
export const CUSTOM_MODEL_WORKFLOW_VARIANTS = [
  "chat",
  "recursive-learning",
  "synthetic-scaling",
  "agentic",
  "eval-vs-base",
];

const clean = (value) => String(value == null ? "" : value).trim();

/** Client-built intent proposal — payload carries NO graph, only references. */
export function buildCustomModelWorkflowProposal({ modelId, variant, rationale } = {}) {
  return {
    type: CUSTOM_MODEL_WORKFLOW_PROPOSAL_TYPE,
    affectedField: CUSTOM_MODEL_WORKFLOW_AFFECTED_FIELD,
    payload: { modelId: clean(modelId), variant: clean(variant) },
    rationale: rationale || `Create the "${clean(variant)}" workflow for custom model ${clean(modelId)} and open it on the canvas.`,
    confidence: 1,
  };
}

export function validateCustomModelWorkflowProposal(proposal) {
  if (proposal?.type !== CUSTOM_MODEL_WORKFLOW_PROPOSAL_TYPE) {
    return { ok: false, error: "not a custom-model workflow proposal" };
  }
  const modelId = clean(proposal?.payload?.modelId);
  const variant = clean(proposal?.payload?.variant);
  if (!modelId) return { ok: false, error: "payload.modelId is required" };
  if (!CUSTOM_MODEL_WORKFLOW_VARIANTS.includes(variant)) {
    return { ok: false, error: `payload.variant must be one of ${CUSTOM_MODEL_WORKFLOW_VARIANTS.join(", ")}` };
  }
  return { ok: true };
}

// Mirror of ensureSwarmWorkflowsObject — a normal governed sandbox-environment
// object, re-seeded if the user deletes it.
export function ensureCustomModelWorkflowsObject(config) {
  const dm = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
  const idx = objects.findIndex((o) => o?.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
  if (idx >= 0) {
    const existing = objects[idx];
    if (!Array.isArray(existing.rows)) objects[idx] = { ...existing, rows: [] };
    return { ...config, dataModel: { ...dm, objects } };
  }
  const seeded = {
    id: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID,
    label: CUSTOM_MODEL_WORKFLOWS_LABEL,
    source: CUSTOM_MODEL_WORKFLOWS_LABEL,
    objectType: "sandbox-environment",
    icon: "Workflow",
    columns: [
      "Name", "lifecycleStatus", "runLocality", "runtime", "adapter",
      "schedulerRegistryId", "status", "lastTested", "instructions",
    ],
    rows: [],
    binding: { mode: "manual", source: CUSTOM_MODEL_WORKFLOWS_LABEL },
  };
  return { ...config, dataModel: { ...dm, objects: [...objects, seeded] } };
}

/** Upsert by Name — preserves prior run-history stamps on update (no audit loss). */
export function upsertCustomModelWorkflowRow(config, row) {
  const withObject = ensureCustomModelWorkflowsObject(config);
  const dm = withObject.dataModel;
  const objects = dm.objects.slice();
  const idx = objects.findIndex((o) => o?.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
  if (idx === -1) return withObject;
  const obj = objects[idx];
  const rows = Array.isArray(obj.rows) ? obj.rows.slice() : [];
  const rowIdx = rows.findIndex((r) => clean(r?.Name) === clean(row?.Name));
  if (rowIdx >= 0) {
    const prior = rows[rowIdx];
    rows[rowIdx] = {
      ...prior, ...row,
      status: prior.status || row.status,
      lastTested: prior.lastTested || "",
      lastRunId: prior.lastRunId || "",
      lastSourceId: prior.lastSourceId || "",
      lastResponse: prior.lastResponse || "",
    };
  } else {
    rows.push(row);
  }
  objects[idx] = { ...obj, rows };
  return { ...withObject, dataModel: { ...dm, objects } };
}

/**
 * Server-side normalize: rebuild the row from governed evidence, refuse unless
 * the model is a verified live custom model, upsert, and return the artifact
 * the cockpit opens. Returns { ok, config, artifact, summary, error? }.
 */
export function normalizeCustomModelWorkflowProposal(proposal, workspaceConfig, workspaceSourceRecords) {
  const validation = validateCustomModelWorkflowProposal(proposal);
  if (!validation.ok) return { ok: false, config: workspaceConfig, artifact: null, summary: "", error: validation.error };

  const modelId = clean(proposal.payload.modelId);
  const variant = clean(proposal.payload.variant);
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords });
  const model = state.models.find((m) => m.id === modelId || m.name === modelId);
  if (!model) {
    return { ok: false, config: workspaceConfig, artifact: null, summary: "", error: `no custom model "${modelId}" in this workspace` };
  }
  // Causation gate — an unverified/base-model endpoint can never bind a workflow.
  if (model.verificationStatus !== "verified") {
    return {
      ok: false, config: workspaceConfig, artifact: null, summary: "",
      error: "endpoint not verified — the served tag must equal the tuned tag before a workflow can bind",
    };
  }

  const variants = buildCustomModelWorkflowVariants(model, { workspaceConfig });
  const orchestrationConfig = variants[variant];
  if (!orchestrationConfig) {
    return { ok: false, config: workspaceConfig, artifact: null, summary: "", error: `unknown variant "${variant}"` };
  }

  const row = buildCustomModelSandboxRow(model, variant, orchestrationConfig);
  const nextConfig = upsertCustomModelWorkflowRow(workspaceConfig, row);
  return {
    ok: true,
    config: nextConfig,
    artifact: { surface: "workflow", objectId: CUSTOM_MODEL_WORKFLOWS_OBJECT_ID, rowName: row.Name },
    summary: `Created ${row.Name} bound to ${model.localModel || model.name}`,
  };
}
