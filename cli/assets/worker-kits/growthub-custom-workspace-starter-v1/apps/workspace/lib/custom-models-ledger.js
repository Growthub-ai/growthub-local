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

function isCustomModelRegistryRow(row, linkedIds) {
  if (!row) return false;
  if (String(row.kind || "") === "custom-model") return true;
  if (String(row.capabilityType || "") === "custom-model-inference") return true;
  if (linkedIds.has(String(row.integrationId || ""))) return true;
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
    // a row claim never outranks live proof.
    let evidenceState = "recorded";
    if (registryRow) evidenceState = "deployed";
    if (m.bondedRegistry?.validated) evidenceState = "verified";
    if (m.bondedRegistry?.validated && sandbox) evidenceState = "sandbox-ready";
    if (m.bondedRegistry?.validated && sandbox?.runId && sandbox?.runOk) evidenceState = "complete";

    const nextAction = evidenceState === "complete" ? "Run again"
      : evidenceState === "sandbox-ready" ? "Run"
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
    lastOutputHash: model.lastOutputHash,
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

export { TRAINING_OBJECT_TYPE };

// ---------------------------------------------------------------------------
// Canvas node option — first-class custom-model binding for the
// orchestration graph's api-registry-call node. Evidence-gated by the SAME
// deriver the /custom-models command uses: the option exists only when the
// workspace has a bonded custom model. The external-endpoint variant rides
// the existing thin adapter target (env refs only — never inline secrets).
// The node stays the proven executable type; `nodeKind: "custom-model"` is
// a first-class marker, not a new runtime.
// ---------------------------------------------------------------------------

import { FINE_TUNE_TARGETS } from "./adapters/fine-tune-targets.js";

export function deriveCustomModelNodeOption({ workspaceConfig, workspaceSourceRecords } = {}) {
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords });
  const bindable = state.models.filter((m) => m.apiRegistryId);
  const external = FINE_TUNE_TARGETS.find((t) => t.id === "openai-compatible-remote") || null;
  return {
    available: bindable.length > 0,
    models: bindable.map((m) => ({
      registryId: m.apiRegistryId,
      modelTag: m.localModel,
      label: `${m.name} · ${m.localModel}`,
      evidenceState: m.evidenceState,
    })),
    externalTarget: external ? { id: external.id, label: external.label, requiredEnv: external.requiredEnv, authRef: external.authRef, endpoint: external.endpoint, method: external.method } : null,
  };
}

/**
 * Build the api-registry-call config patch that bonds a graph node to a
 * custom model. Pure — the canvas applies it through its existing
 * updateGraphNode path; nothing here writes config.
 */
export function buildCustomModelNodeConfig({ workspaceConfig, registryId, external } = {}) {
  if (external && external.baseUrlEnvRef) {
    return {
      nodeKind: "custom-model",
      label: "Custom model (external)",
      subtitle: `external · ${external.baseUrlEnvRef}`,
      config: {
        registryId: "", integrationId: "",
        baseUrl: "", baseUrlEnvRef: String(external.baseUrlEnvRef),
        endpoint: "/chat/completions", method: "POST",
        authRef: String(external.authRef || "MODEL_RUNTIME_KEY"),
        queryParams: {}, bodyTemplate: "",
        requestHeadersMetadata: { authHeaderName: "Authorization", authPrefix: "Bearer ", contentType: "application/json" },
        timeoutMs: 30000,
      },
    };
  }
  const row = registryRowsOf(workspaceConfig).find((r) => String(r.integrationId || "") === String(registryId || ""));
  if (!row) return null;
  return {
    nodeKind: "custom-model",
    label: "Fine-tuned model",
    subtitle: `${row.integrationId} · ${row.method || "POST"} ${row.endpoint || ""}`,
    config: {
      registryId: String(row.integrationId), integrationId: String(row.integrationId),
      baseUrl: String(row.baseUrl || ""), endpoint: String(row.endpoint || ""), method: String(row.method || "POST"),
      authRef: String(row.authRef || ""), queryParams: {}, bodyTemplate: "",
      requestHeadersMetadata: { authHeaderName: "", authPrefix: "", contentType: "application/json" },
      timeoutMs: 30000,
    },
  };
}
