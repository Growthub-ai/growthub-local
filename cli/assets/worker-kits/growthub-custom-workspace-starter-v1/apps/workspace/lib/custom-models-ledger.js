/**
 * Custom Models ledger — pure causation deriver for the /custom-models
 * sidecar cockpit. No React, no fetch, no config writes.
 *
 * Answers: "Which custom model versions are now active, verified,
 * invokable, exportable, and usable as workspace capabilities?" — derived
 * ONLY from existing governed evidence: model-training rows, tagged
 * api-registry rows, training/invocation source records, sandbox rows and
 * run proof. Builds on deriveTrainingLedgerState (one evidence engine —
 * bonding, tuned-tag validation, and demotion semantics are shared, so
 * /training and /custom-models can never disagree).
 *
 * Tagging convention (normalized, not required verbatim): an api-registry
 * row is a custom-model endpoint when kind/capabilityType says so, when a
 * model-training row's apiRegistryId points at it, or when its
 * capabilities include "chat-completions" with a model-training linkage.
 *
 * Endpoint modes: local (loopback/host-local runtime) | hosted (https
 * endpoint) | serverless (serverless execution lane) | unknown. Localhost
 * is one deployment mode, never the model's identity.
 */

import { deriveTrainingLedgerState, TRAINING_OBJECT_TYPE } from "./training-ledger.js";

export const CUSTOM_MODEL_CAPABILITY_SCHEMA = "growthub-custom-model-capability-v1";

function registryRowsOf(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.filter((o) => o?.objectType === "api-registry").flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
}

function sandboxLinkFor(workspaceConfig, registryId) {
  if (!registryId) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const o of objects) {
    if (o?.objectType !== "sandbox-environment") continue;
    for (const r of (Array.isArray(o.rows) ? o.rows : [])) {
      const graph = String(r?.orchestrationConfig || "");
      if (String(r?.schedulerRegistryId || "") === registryId
        || graph.includes(`"registryId": "${registryId}"`) || graph.includes(`"registryId":"${registryId}"`)) {
        // Parsed proof only — regex over response strings can false-positive
        // on payload text. Malformed JSON demotes, never throws.
        let runOk = false;
        let outputHash = "";
        try {
          const parsed = JSON.parse(String(r?.lastResponse || "null"));
          runOk = parsed?.ok === true || Number(parsed?.exitCode) === 0;
          outputHash = typeof parsed?.outputHash === "string" ? parsed.outputHash : "";
        } catch { runOk = false; }
        return {
          objectId: String(o.id || ""),
          rowName: String(r?.Name || ""),
          runId: String(r?.lastRunId || ""),
          runOk,
          outputHash,
        };
      }
    }
  }
  return null;
}

export function deriveEndpointMode(registryRow) {
  if (!registryRow) return "unknown";
  const baseUrl = String(registryRow.baseUrl || "");
  if (/127\.0\.0\.1|localhost/.test(baseUrl)) return "local";
  if (String(registryRow.executionLane || "").includes("serverless")) return "serverless";
  if (/^https:\/\//.test(baseUrl)) return "hosted";
  return "unknown";
}

/**
 * THE isolation gate for the custom-model "genome": a registry row is a
 * custom-model endpoint ONLY when it carries the explicit trait
 * (kind=custom-model / capabilityType=custom-model-inference) or is bonded to
 * a model-training row (linkedIds). A generic integration / nango / standard
 * HTTP registry row is NEVER mistaken for a custom model. Exported so the Data
 * Model shell and the API Registry sidecar can gate any custom-model-specific
 * rendering on the SAME trait — the custom-model phenotype never leaks into
 * generic records or poisons other causation derivers.
 *
 * `linkedIds` is optional: when omitted, recognition is by explicit trait only
 * (the strictest, fully self-contained gate for a single clicked record).
 */
export function isCustomModelRegistryRow(row, linkedIds = new Set()) {
  if (!row || typeof row !== "object") return false;
  if (String(row.kind || "") === "custom-model") return true;
  if (String(row.capabilityType || "") === "custom-model-inference") return true;
  if (linkedIds instanceof Set && linkedIds.has(String(row.integrationId || ""))) return true;
  return false;
}

const djb2 = (str) => { let h = 5381; for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(16); };

/**
 * Derive the full /custom-models state. Command visibility is itself
 * evidence-derived: at least one model-training row with a model identity,
 * one tagged registry row, or one invocation proof record.
 */
export function deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords } = {}) {
  const ledger = deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords });
  const registryRows = registryRowsOf(workspaceConfig);
  const linkedIds = new Set(
    ledger.models.map((m) => m.bondedRegistry?.registryId || "").filter(Boolean),
  );
  const taggedRegistry = registryRows.filter((r) => isCustomModelRegistryRow(r, linkedIds));
  const invocationProofs = Object.keys(workspaceSourceRecords || {}).filter((k) => k.startsWith("model-invocation:"));

  const modelRows = ledger.models.filter((m) => m.localModel || m.bondedRegistry);
  const commandVisible = modelRows.length > 0 || taggedRegistry.length > 0 || invocationProofs.length > 0;

  const models = modelRows.map((m) => {
    const registryId = m.bondedRegistry?.registryId || "";
    const registryRow = registryRows.find((r) => String(r.integrationId || "") === registryId) || null;
    const sandbox = sandboxLinkFor(workspaceConfig, registryId);

    // Evidence ladder per model — same demotion semantics as /training:
    // a row claim never outranks live proof. The product invariant is strict:
    // NO outputHash means NO complete state. A smoke run that succeeded but
    // wrote no output hash stays sandbox-ready (proof incomplete), never
    // complete.
    let evidenceState = "recorded";
    if (registryRow) evidenceState = "deployed";
    if (m.bondedRegistry?.validated) evidenceState = "verified";
    if (m.bondedRegistry?.validated && sandbox) evidenceState = "sandbox-ready";
    if (m.bondedRegistry?.validated && sandbox?.runId && sandbox?.runOk && sandbox?.outputHash) evidenceState = "complete";

    const nextAction = evidenceState === "complete" ? "Run again"
      : evidenceState === "sandbox-ready" ? (sandbox?.runId && sandbox?.runOk ? "Smoke ran — output hash missing; re-run to capture proof" : "Run")
        : evidenceState === "verified" ? "Create/Open workflow"
          : evidenceState === "deployed" ? "Test"
            : "Open Training";

    return {
      id: m.name,
      name: m.name,
      status: m.status,
      modelVersion: m.localModel,
      localModel: m.localModel,
      baseModel: m.baseModel,
      apiRegistryId: registryId,
      endpointMode: deriveEndpointMode(registryRow),
      lastVerifiedAt: m.bondedRegistry?.validated?.at || "",
      lastInvocationSourceId: invocationProofs.find((k) => k.includes(registryId)) || "",
      lastSandboxObjectId: sandbox?.objectId || "",
      lastSandboxRunId: sandbox?.runId || "",
      // Honest hashing: modelOutputHash only when run/source evidence
      // carries a REAL output hash; the response-snippet digest is named
      // snippetHash and never masquerades as output proof.
      modelOutputHash: sandbox?.outputHash || "",
      snippetHash: m.bondedRegistry?.validated?.snippet ? djb2(m.bondedRegistry.validated.snippet) : "",
      // Endpoint verification proof — auditable fields (item 9): the actual
      // served model tag, a response-content hash, and a verification status
      // that never overclaims. Derived from the bonded registry validation.
      lastResponseModel: m.bondedRegistry?.validated?.model || "",
      lastResponseHash: m.bondedRegistry?.validated?.snippet ? djb2(m.bondedRegistry.validated.snippet) : "",
      verificationStatus: m.bondedRegistry?.validated ? "verified" : (registryRow ? "unverified" : "unregistered"),
      links: {
        workflow: sandbox ? `/workflows?object=${encodeURIComponent(sandbox.objectId)}&row=${encodeURIComponent(sandbox.rowName)}${sandbox.runId ? `&run=${encodeURIComponent(sandbox.runId)}` : ""}` : "",
        dataModel: "/data-model",
        registry: "/data-model",
        training: "/training",
      },
      evidenceState,
      nextAction,
      canTest: Boolean(registryRow),
      canExport: Boolean(registryId && m.localModel),
      canDuplicate: true,
      canDeleteViaDataModel: true,
    };
  });

  return {
    available: models.length > 0,
    commandVisible,
    models,
    filters: {
      statuses: [...new Set(models.map((m) => m.evidenceState))],
      versions: [...new Set(models.map((m) => m.modelVersion).filter(Boolean))],
      endpointModes: [...new Set(models.map((m) => m.endpointMode))],
    },
    guidance: models.length === 0
      ? "No custom model versions yet — complete the Training handoff first."
      : models.some((m) => m.evidenceState === "complete")
        ? "Latest custom model is verified and runnable."
        : `Next: ${models[models.length - 1].nextAction}.`,
  };
}

/**
 * Clean capability manifest for one derived model — the SDK-promotion
 * bridge. Deterministic, sourced from existing records, NEVER contains
 * secrets (authRef name only, by construction).
 */
export function buildCapabilityManifest(model, { workspaceConfig } = {}) {
  const registryRow = registryRowsOf(workspaceConfig).find((r) => String(r.integrationId || "") === model.apiRegistryId) || {};
  const capabilityName = String(model.apiRegistryId || model.name).replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
  return {
    schema: CUSTOM_MODEL_CAPABILITY_SCHEMA,
    modelTrainingId: model.name,
    modelVersion: model.modelVersion,
    localModel: model.localModel,
    baseModel: model.baseModel,
    apiRegistryId: model.apiRegistryId,
    endpointMode: model.endpointMode,
    verifiedAt: model.lastVerifiedAt,
    lastInvocationSourceId: model.lastInvocationSourceId,
    lastSandboxObjectId: model.lastSandboxObjectId,
    lastSandboxRunId: model.lastSandboxRunId,
    // Real proof hash from the sandbox run — was incorrectly reading a
    // nonexistent model.lastOutputHash, dropping the proof.
    lastOutputHash: model.modelOutputHash || "",
    lastResponseModel: model.lastResponseModel || "",
    lastResponseHash: model.lastResponseHash || "",
    verificationStatus: model.verificationStatus || "",
    requestContract: {
      method: String(registryRow.method || "POST"),
      baseUrl: String(registryRow.baseUrl || ""),
      endpoint: String(registryRow.endpoint || ""),
      authRef: String(registryRow.authRef || ""),
      contentType: "application/json",
    },
    responseContract: { model: "string", choices: [{ message: { role: "assistant", content: "string" } }] },
    sdk: {
      capabilityName,
      operation: "generate",
      inputSchema: { prompt: "string" },
      outputSchema: { content: "string", model: "string" },
    },
  };
}

/**
 * Derive the serializable workflow/sandbox NODE template for a verified custom
 * model — a clean API-Registry chat-completions node the existing sandbox/
 * workflow surfaces accept. No new runtime/schema; refs by NAME only (never a
 * secret value). Pure. `ready` is false (with a reason) until the endpoint is
 * verified so an unverified/base-model node can never be inserted.
 */
export function deriveCustomModelNodeTemplate(model, { workspaceConfig } = {}) {
  const registryRow = registryRowsOf(workspaceConfig).find((r) => String(r.integrationId || "") === String(model?.apiRegistryId || "")) || {};
  const verified = model?.verificationStatus === "verified";
  const local = String(registryRow.baseUrl || "").includes(":11434");
  const ready = verified && Boolean(model?.apiRegistryId);
  return {
    ready,
    blockedReason: !model?.apiRegistryId ? "no API Registry row bound"
      : !verified ? "endpoint not verified — served tag must equal the tuned tag before insertion"
        : "",
    node: {
      type: "api-registry-chat-completion",
      label: `Custom model — ${model?.localModel || model?.name || ""}`,
      apiRegistryId: model?.apiRegistryId || "",
      runLocality: local ? "local" : "serverless",
      networkPolicy: local ? "loopback-only" : "allow",
      authRef: String(registryRow.authRef || ""), // ref NAME only, never a value
      permissions: { browserUse: false, depth: 1 },
      boundary: { local, serverless: !local },
      provenance: {
        modelTrainingId: model?.name || "",
        servedTag: model?.lastResponseModel || model?.localModel || "",
        verificationStatus: model?.verificationStatus || "",
        outputHash: model?.modelOutputHash || "",
      },
    },
  };
}

/**
 * Provenance-safe synthetic training-trace proposal template. Generated traces
 * are ALWAYS marked synthetic and start rejected/ungraded — never blurred with
 * real user/workflow traces. Pure shape factory (the actual rows are produced
 * through the governed helper-proposal path, per row with its own promptHash).
 */
export function buildSyntheticTraceProvenance(model, { seed = "" } = {}) {
  return {
    objectType: "training-traces",
    provenance: {
      generated: true,
      synthetic: true,
      modelId: model?.apiRegistryId || "",
      sourceModelTrainingId: model?.name || "",
      seed: String(seed || ""),
      promptHash: "", // stamped per generated row
      accepted: false,
      qualityStatus: "ungraded",
      redactionStatus: "pending",
      reason: "synthetic generation from a verified custom model — review before accepting into the corpus",
    },
  };
}

/**
 * Suggested Actions for a custom model — a pure causation deriver (same
 * checklist grammar as the starter checklist). Each action carries: title,
 * whyNow, requiredEvidence, targetSurface, proposalPayload, blockedReason,
 * proofProduced, enabled. Actions NEVER mutate — they seed reviewable helper
 * proposals or route to an existing governed surface. Closed-by-default in UI.
 */
export function deriveCustomModelSuggestedActions(model, { workspaceConfig } = {}) {
  const verified = model?.verificationStatus === "verified";
  const complete = model?.evidenceState === "complete";
  const template = deriveCustomModelNodeTemplate(model, { workspaceConfig });
  const actions = [
    {
      id: "use-as-workflow-node", title: "Use as a workflow node",
      whyNow: "A verified custom model can back any governed workflow step.",
      requiredEvidence: "verified endpoint (served tag == tuned tag)",
      targetSurface: "/workflows", proposalPayload: template.node,
      blockedReason: template.ready ? "" : template.blockedReason,
      proofProduced: "a workflow graph referencing the api-registry chat-completions node",
    },
    {
      id: "run-chat-smoke", title: "Run a chat-completions smoke",
      whyNow: "Confirm the local endpoint still serves the tuned tag, not the base model.",
      requiredEvidence: "registered API Registry row",
      targetSurface: "/data-model", proposalPayload: { integrationId: model?.apiRegistryId, expectModel: model?.localModel },
      blockedReason: model?.apiRegistryId ? "" : "no API Registry row bound",
      proofProduced: "api-registry lastResponse with served model == tuned tag",
    },
    {
      id: "create-local-sandbox-agent", title: "Create a local/browser-use sandbox agent",
      whyNow: "Turn the model into a governed local agent (browser-use optional).",
      requiredEvidence: "verified endpoint",
      targetSurface: "/workflows", proposalPayload: { ...template.node, permissions: { browserUse: true, depth: 2 } },
      blockedReason: verified ? "" : "endpoint not verified",
      proofProduced: "a sandbox-environment row bound to the custom model",
    },
    {
      id: "generate-synthetic-training-data", title: "Generate synthetic training data",
      whyNow: "Grow the next-cycle corpus from the model — provenance-safe, review-gated.",
      requiredEvidence: "complete (verified + smoke outputHash)",
      targetSurface: "/data-model", proposalPayload: buildSyntheticTraceProvenance(model),
      blockedReason: complete ? "" : "model must be complete (verified + workflow outputHash) before generating data",
      proofProduced: "training-traces rows marked synthetic/ungraded/unaccepted with provenance",
    },
    {
      id: "create-dashboard-widget", title: "Create a dashboard widget generator",
      whyNow: "Expose the model's outputs as a governed dashboard widget.",
      requiredEvidence: "verified endpoint",
      targetSurface: "/data-model", proposalPayload: { integrationId: model?.apiRegistryId, widget: "custom-model-output" },
      blockedReason: verified ? "" : "endpoint not verified",
      proofProduced: "an app-surface widget bound to the model capability",
    },
  ].map((a) => ({ ...a, enabled: !a.blockedReason }));
  return { actions, hasActions: actions.length > 0, ready: actions.filter((a) => a.enabled).length };
}

export { TRAINING_OBJECT_TYPE };
