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
import { deriveServingProfile } from "./training-runtime-drivers.js";
import { deriveFlywheelState, deriveProxyServingState } from "./distillation-fleet.js";
import { buildAdaptiveStudentPlan } from "./distillation-student-plan.js";
import { deriveTrainingRunState } from "./training-run-receipts.js";

export const CUSTOM_MODEL_CAPABILITY_SCHEMA = "growthub-custom-model-capability-v1";
// Local model artifacts may live on external storage and require a cold load.
// Keep the generated row and every model-call node on one invariant because
// the node-level value is authoritative during orchestration execution.
export const CUSTOM_MODEL_WORKFLOW_TIMEOUT_MS = 120_000;

// Well-known governed object that hosts the cockpit-created custom-model
// workflows (a normal sandbox-environment object, same well-known-id pattern as
// "swarm-workflows"). Defined here — the ledger has no dependency on the
// proposal lane, so the lane imports this constant from the ledger, never the
// reverse (no import cycle).
export const CUSTOM_MODEL_WORKFLOWS_OBJECT_ID = "custom-model-workflows";
export const CUSTOM_MODEL_WORKFLOWS_LABEL = "Custom Model Workflows";

function registryRowsOf(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.filter((o) => o?.objectType === "api-registry").flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
}

function sandboxLinkFor(workspaceConfig, registryId, workspaceSourceRecords) {
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
        // Runtime cross-check (mirrors the publish gate): the sandbox-run
        // route persists every execution into the `sandbox:<objectId>:<row>`
        // sidecar, which PATCH is policy-blocked from. When that sidecar
        // exists, it is AUTHORITATIVE — a row stamp whose lastRunId has no
        // matching runtime record demotes (a forged/edited row stamp can
        // never mint run proof past a real run history).
        const sidecar = workspaceSourceRecords?.[`sandbox:${String(o.id || "")}:${String(r?.Name || "")}`];
        const runRecords = Array.isArray(sidecar?.records) ? sidecar.records : [];
        if (runRecords.length > 0) {
          const match = runRecords.find((rec) => String(rec?.runId || "") === String(r?.lastRunId || ""));
          if (!match) {
            runOk = false;
            outputHash = "";
          } else {
            runOk = Number(match?.exitCode) === 0 && !match?.error;
            outputHash = typeof match?.outputHash === "string" ? match.outputHash : "";
          }
        }
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

  const modelRows = ledger.models.filter((m) => {
    const status = String(m.status || "").toLowerCase();
    const preparationOnly = ["eligible", "prepared", "running"].includes(status);
    return Boolean(m.bondedRegistry?.validated) || ((m.localModel || m.bondedRegistry) && !preparationOnly);
  });
  const commandVisible = modelRows.length > 0 || taggedRegistry.length > 0 || invocationProofs.length > 0;

  const models = modelRows.map((m) => {
    const registryId = m.bondedRegistry?.registryId || "";
    const registryRow = registryRows.find((r) => String(r.integrationId || "") === registryId) || null;
    const sandbox = sandboxLinkFor(workspaceConfig, registryId, workspaceSourceRecords);

    // Evidence ladder per model — same demotion semantics as /training:
    // a row claim never outranks live proof. The product invariant is strict:
    // NO outputHash means NO complete state. A smoke run that succeeded but
    // wrote no output hash stays sandbox-ready (proof incomplete), never
    // complete.
    let evidenceState = "recorded";
    if (registryRow) evidenceState = "registered";
    // Deployed: a PARSED chat-completion body was captured from the endpoint
    // (choices/model present) but the tuned tag is NOT proven — a base-model
    // response reaches here and never higher (verifyTunedResponse demotion
    // semantics). A bare `status: "connected"` claim, a malformed body, or an
    // error envelope stays `registered`: "deployed" names captured output,
    // not a writable status string.
    let capturedCompletion = false;
    try {
      const parsed = JSON.parse(String(registryRow?.lastResponse || "null"));
      capturedCompletion = Boolean(parsed && typeof parsed === "object" && !parsed.error && (parsed.model || Array.isArray(parsed.choices)));
    } catch { capturedCompletion = false; }
    if (registryRow && capturedCompletion) evidenceState = "deployed";
    if (m.bondedRegistry?.validated) evidenceState = "verified";
    if (m.bondedRegistry?.validated && sandbox) evidenceState = "sandbox-ready";
    if (m.bondedRegistry?.validated && sandbox?.runId && sandbox?.runOk && sandbox?.outputHash) evidenceState = "complete";

    const nextAction = evidenceState === "complete" ? "Run again"
      : evidenceState === "sandbox-ready" ? (sandbox?.runId && sandbox?.runOk ? "Smoke ran — output hash missing; re-run to capture proof" : "Run")
        : evidenceState === "verified" ? "Create/Open workflow"
          : evidenceState === "deployed" || evidenceState === "registered" ? "Verify endpoint"
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
      // Governed serving profile — actual adapter/mode/batching/speculative,
      // proof-bound to the served tuned tag (never a throughput claim).
      servingProfile: deriveServingProfile(registryRow || {}, { expectedTag: m.localModel }),
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

function safeWorkflowIdentity(value) {
  return String(value || "custom-model")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "custom-model";
}

/** Resolve the durable serving identity. A mothership policy upgrades its
 * implementation without forcing any workflow to be rewritten. */
export function resolveCustomModelServingRegistry(model, { workspaceConfig } = {}) {
  const rows = registryRowsOf(workspaceConfig);
  const directId = String(model?.apiRegistryId || "").trim();
  const modelId = String(model?.id || model?.name || "").trim();
  const policyRow = rows.find((row) => {
    const policy = row?.metadata?.mothershipProxy;
    if (!policy) return false;
    if (String(policy.workspaceSlug || "").trim() === modelId) return true;
    return (Array.isArray(policy.routes) ? policy.routes : []).some(
      (route) => String(route?.target || "") === "local-student"
        && String(route?.registryId || "").trim() === directId,
    );
  }) || null;
  const directRow = rows.find((row) => String(row?.integrationId || "").trim() === directId) || null;
  return {
    row: policyRow || directRow,
    integrationId: String((policyRow || directRow)?.integrationId || directId),
    mode: policyRow ? "mothership" : directRow ? "direct" : "missing",
    available: Boolean(policyRow || (directRow && model?.verificationStatus === "verified")),
  };
}

export function customModelWorkflowRowName(model, variant) {
  const modelIdentity = safeWorkflowIdentity(model?.id || model?.name || model?.apiRegistryId);
  return `custom-model-${modelIdentity}-${safeWorkflowIdentity(variant)}`;
}

/**
 * Real closed-loop workflow variants for a deployed local model — each is a
 * COMPLETE governed orchestration graph (input → model-call → terminal write)
 * on the exact node/edge grammar the workflow canvas + orchestration runner
 * understand (mirrors the seed model-sandbox config). Not a link: a config the
 * canvas opens via `/workflows?object=<sandboxId>&row=<rowName>` and the
 * `sandbox-run` lane executes. Each variant is a distinct, intentional way to
 * USE the deployed model, with its own closed loop and governed proof. Pure.
 *
 * Variants:
 *  - `chat`               input → model-call → tool-result (writeLastResponse)
 *  - `recursive-learning` input → answer → self-grade → improve → write graded
 *                         training-traces (feedback closes back to the corpus)
 *  - `synthetic-scaling`  seed → model-call → write SYNTHETIC training-traces
 *                         (provenance-safe, review-gated)
 *  - `agentic`            input → plan → critique → final answer → result
 *  - `eval-vs-base`       holdout → tuned + base → teacher judge → metrics
 */
export function buildCustomModelWorkflowVariants(model, { workspaceConfig } = {}) {
  const serving = resolveCustomModelServingRegistry(model, { workspaceConfig });
  const registryRow = serving.row || {};
  const integrationId = serving.integrationId;
  const tag = String(model?.localModel || model?.lastResponseModel || model?.name || "");
  const base = String(model?.baseModel || "");
  const call = (id, label, subtitle, extra = {}) => ({
    id, type: "api-registry-call", label, subtitle: subtitle || `${integrationId} · POST /chat/completions`,
    // No bodyTemplate: the runner builds the canonical chat-completions body
    // from the record's declared capability + this modelTag (JSON-safe for
    // any prompt; a bodyTemplate here would break on quoted/multiline input).
    config: { registryId: integrationId, integrationId, customModelId: String(model?.id || model?.name || ""), servingMode: serving.mode, modelTag: tag, baseUrl: String(registryRow.baseUrl || ""), endpoint: String(registryRow.endpoint || "/chat/completions"), method: String(registryRow.method || "POST"), authRef: String(registryRow.authRef || ""), queryParams: {}, bodyTemplate: "", requestHeadersMetadata: { authHeaderName: "", authPrefix: "", contentType: "application/json" }, timeoutMs: CUSTOM_MODEL_WORKFLOW_TIMEOUT_MS, ...extra },
  });
  const input = (samplePayload, label = "Prompt") => ({ id: "input", type: "input", label, subtitle: "Chat prompt", config: { inputMode: "manual", samplePayload, sourceType: "", sourceId: "", entityId: "", filterMode: "and", filters: [] } });
  const result = (id, label, cfg = {}) => ({ id, type: "tool-result", label, subtitle: cfg.subtitle || "Save response", config: { successStatusCodes: [200], writeLastResponse: true, writeSourceRecord: true, sourceRecordId: "", outputMode: "normalized-json", previewFields: [], statusField: "status", lastTestedField: "lastTested", ...cfg } });
  const graph = (nodes, edges) => ({ version: 1, provider: "growthub-native", nodes, edges });

  return {
    chat: graph(
      [input({ prompt: "Reply in one short line to confirm you are the tuned workspace model." }), call("model-call", `Custom model — ${tag}`), result("result", "Result")],
      [{ from: "input", to: "model-call", passes: "payload" }, { from: "model-call", to: "result", passes: "provider-response" }],
    ),
    "recursive-learning": graph(
      [input({ prompt: "Answer this workspace task, then we score and feed the best answers back into training." }, "Task"), call("model-call", `Custom model — ${tag}`),
        call("self-grade", "Self-grade (reward)", "score the answer 0-1", { bodyTemplate: "grade" }),
        call("improve", "Improve answer", "apply the grader feedback"),
        result("write-trace", "Write graded trace", { subtitle: "append to training-traces (feedback loop)", sourceRecordId: `training:model-training:${String(model?.id || model?.name || "workspace-local")}`, outputMode: "training-trace" })],
      [{ from: "input", to: "model-call", passes: "payload" }, { from: "model-call", to: "self-grade", passes: "provider-response" }, { from: "self-grade", to: "improve", passes: "grade-and-feedback" }, { from: "improve", to: "write-trace", passes: "improved-answer-and-grade" }],
    ),
    "synthetic-scaling": graph(
      [input({ prompt: "Generate a diverse governed-task/answer pair in this workspace's domain." }, "Seed"), call("model-call", `Custom model — ${tag}`),
        result("write-synthetic", "Write synthetic trace", { subtitle: "training-traces · synthetic · ungraded · review-gated", sourceRecordId: `training:model-training:${String(model?.id || model?.name || "workspace-local")}`, outputMode: "synthetic-trace", provenance: buildSyntheticTraceProvenance(model).provenance })],
      [{ from: "input", to: "model-call", passes: "payload" }, { from: "model-call", to: "write-synthetic", passes: "provider-response" }],
    ),
    agentic: graph(
      [input({ prompt: "Complete this multi-step task using the local model as the agent brain." }, "Goal"),
        call("plan", `Plan — ${tag}`, "build assumptions and success criteria", { permissions: { browserUse: false, depth: 3 }, runLocality: "local", networkPolicy: "governed-registry-only" }),
        call("critique", "Critique plan", "find unsafe assumptions and verification gaps"),
        call("final", "Final answer", "apply the plan and critique"),
        result("result", "Agent result")],
      [{ from: "input", to: "plan", passes: "payload" }, { from: "plan", to: "critique", passes: "plan" }, { from: "critique", to: "final", passes: "plan-and-critique" }, { from: "final", to: "result", passes: "provider-response" }],
    ),
    "eval-vs-base": graph(
      [input({ prompt: "Run the holdout eval prompt against both the tuned model and its base." }, "Holdout"),
        call("tuned", `Tuned — ${tag}`), call("base", `Base — ${base || "base model"}`, `base ${base}`, { bodyTemplateModel: base }),
        call("judge", "Teacher judge", "scores tuned vs base using the governed teacher route"),
        result("compare", "Verdict & evidence", { subtitle: "teacher-judged holdout result, excluded from training", outputMode: "eval-metrics" })],
      [{ from: "input", to: "tuned", passes: "payload" }, { from: "input", to: "base", passes: "payload" }, { from: "tuned", to: "judge", passes: "tuned-response" }, { from: "base", to: "judge", passes: "base-response" }, { from: "judge", to: "compare", passes: "evaluation-verdict" }],
    ),
  };
}

/** The sandbox-environment row an action creates so the canvas can open + the
 *  sandbox-run lane can execute the variant. Governed row shape, no secrets. */
export function buildCustomModelSandboxRow(model, variant, orchestrationConfig, { workspaceConfig } = {}) {
  const serving = resolveCustomModelServingRegistry(model, { workspaceConfig });
  const name = customModelWorkflowRowName(model, variant);
  return {
    Name: name, lifecycleStatus: "draft", version: "1", runLocality: orchestrationConfig?.nodes?.some((n) => n.config?.networkPolicy === "loopback-only") ? "local" : "local",
    customModelId: String(model?.id || model?.name || ""), workflowVariant: String(variant || ""), servingRegistryId: serving.integrationId,
    schedulerRegistryId: serving.integrationId, runtime: "node", adapter: "local-process", agentHost: "", envRefs: "", networkAllow: "false", allowList: "",
    instructions: `Use the custom local model ${model?.localModel || model?.name || ""} in a ${variant} closed loop.`,
    command: "", timeoutMs: String(CUSTOM_MODEL_WORKFLOW_TIMEOUT_MS), status: "draft", resolverTemplateId: "custom-http", connectorKind: "http", executionLane: "sandbox-local",
    orchestrationConfig: JSON.stringify(orchestrationConfig, null, 2),
  };
}

/**
 * Suggested Actions for a custom model — a pure causation deriver (same
 * checklist grammar as the starter checklist). Each action is a REAL closed
 * loop: it carries a complete `orchestrationConfig` (built above), the
 * `sandboxRow` to create it, an `openHref` deep-link that opens that config on
 * the workflow canvas, honest `blockedReason` gating, and the governed
 * `proofProduced`. Actions NEVER mutate — they create a reviewable governed
 * sandbox row / route to the canvas. Closed-by-default in UI.
 */
export function deriveCustomModelSuggestedActions(model, { workspaceConfig } = {}) {
  const verified = model?.verificationStatus === "verified";
  const complete = model?.evidenceState === "complete";
  const serving = resolveCustomModelServingRegistry(model, { workspaceConfig });
  const bound = Boolean(serving.integrationId);
  const usable = serving.available;
  const variants = buildCustomModelWorkflowVariants(model, { workspaceConfig });
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const existingWorkflow = (variant) => {
    const rowName = customModelWorkflowRowName(model, variant);
    for (const object of objects) {
      if (object?.objectType !== "sandbox-environment") continue;
      const row = (Array.isArray(object.rows) ? object.rows : []).find((candidate) =>
        (String(candidate?.customModelId || "") === String(model?.id || model?.name || "")
          && String(candidate?.workflowVariant || "") === variant)
        || (String(candidate?.Name || "") === rowName
          && String(candidate?.servingRegistryId || candidate?.schedulerRegistryId || "") === serving.integrationId),
      );
      if (row) return { objectId: String(object.id || CUSTOM_MODEL_WORKFLOWS_OBJECT_ID), row };
    }
    return null;
  };
  const defs = [
    { id: "use-in-workflow", variant: "chat", title: "Use in a workflow",
      whyNow: "Back any governed step with your model.",
      blockedReason: usable ? "" : "connect a serving route first",
      proofProduced: "sandbox-environment row + orchestrationConfig; sandbox-run writes lastResponse (served == tuned tag)" },
    { id: "recursive-learning-loop", variant: "recursive-learning", title: "Recursive learning loop",
      whyNow: "Answer → self-grade → feed the best answers back into training.",
      blockedReason: usable ? "" : "connect a serving route first",
      proofProduced: "graded training-traces appended (feedback), linked to model-invocation receipts" },
    { id: "synthetic-data-scaling", variant: "synthetic-scaling", title: "Scale synthetic training data",
      whyNow: "Grow the next-cycle corpus from the model — synthetic, review-gated.",
      blockedReason: complete ? "" : "finish one proven run (verified + workflow outputHash) first",
      proofProduced: "training-traces marked synthetic/ungraded/unaccepted with provenance" },
    { id: "local-agentic-workflow", variant: "agentic", title: "Local agentic workflow",
      whyNow: "Run a real plan → critique → final-answer reasoning loop.",
      blockedReason: usable ? "" : "connect a serving route first",
      proofProduced: "three model invocations and traces bound to one governed run" },
    { id: "eval-vs-base", variant: "eval-vs-base", title: "Evaluate vs base model",
      whyNow: "Prove the tuned model beats its base on a holdout set.",
      blockedReason: verified ? "" : bound ? "verify the trained student before evaluating it against base" : "no API Registry row bound",
      proofProduced: "eval metrics (tuned vs base) on a holdout excluded from training" },
  ];
  const actions = defs.map((d) => {
    const existing = existingWorkflow(d.variant);
    const rowName = customModelWorkflowRowName(model, d.variant);
    return {
      ...d,
      enabled: !d.blockedReason,
      mode: existing ? "open" : (!d.blockedReason ? "create" : "blocked"),
      orchestrationConfig: variants[d.variant],
      sandboxRow: buildCustomModelSandboxRow(model, d.variant, variants[d.variant], { workspaceConfig }),
      openHref: `/workflows?object=${encodeURIComponent(existing?.objectId || CUSTOM_MODEL_WORKFLOWS_OBJECT_ID)}&row=${encodeURIComponent(existing ? String(existing.row?.Name || rowName) : rowName)}&field=orchestrationConfig`,
      // Governed create path: the UI seeds this as a reviewable sandbox row
      // (helper-proposal / PATCH), never a direct mutation from the cockpit.
      applyIntent: "create_sandbox_workflow",
    };
  });
  return { actions, hasActions: actions.length > 0, ready: actions.filter((a) => a.enabled).length };
}

/**
 * The single FOCUSED first-utilization action for a live custom model — the
 * causation-derived "what do I click to actually use this?" for a non-technical
 * operator. Mirrors the CEO cockpit's sub-atomic worker next-action pattern:
 * the action resolves to one of three governed modes, so a click always DOES
 * something real (never a dead redirect):
 *
 *   - "create" — the workflow row does not exist yet: clicking POSTs the
 *     governed custom-model.workflow.create proposal (helper/apply rebuilds the
 *     full orchestration graph from evidence server-side) and then opens it.
 *   - "open"   — the workflow already exists in sandbox records: clicking opens
 *     that exact row on the canvas (no duplicate, no re-create).
 *   - "blocked"— the endpoint is not verified yet: the served tag must equal the
 *     tuned tag before a workflow can bind. Honest reason, no fake enablement.
 *
 * `variant` maps to a REAL closed-loop graph from buildCustomModelWorkflowVariants:
 *   open-in-canvas → chat (input → model-call → save response).
 */
export function deriveCustomModelFocusActions(model, { workspaceConfig } = {}) {
  const serving = resolveCustomModelServingRegistry(model, { workspaceConfig });
  // Existing custom-model workflow rows across EVERY sandbox-environment object
  // (created here, in the canvas, or seeded) — matched by Name so a click on an
  // already-built workflow opens it instead of creating a duplicate.
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const existingRows = [];
  for (const o of objects) {
    if (o?.objectType !== "sandbox-environment") continue;
    for (const r of (Array.isArray(o.rows) ? o.rows : [])) {
      existingRows.push({ objectId: String(o.id || ""), row: r });
    }
  }

  const defs = [
    {
      id: "open-in-canvas", variant: "chat", title: "Open in canvas",
      createHint: "Wires your model into a ready-to-run workflow and opens it.",
      openHint: "Open your model's workflow on the canvas.",
    },
  ];

  return defs.map((d) => {
    const rowName = customModelWorkflowRowName(model, d.variant);
    const existing = existingRows.find(({ row }) =>
      (String(row?.customModelId || "").trim() === String(model?.id || model?.name || "").trim()
        && String(row?.workflowVariant || "").trim() === d.variant)
      || (String(row?.Name || "").trim() === rowName
        && String(row?.servingRegistryId || row?.schedulerRegistryId || "").trim() === serving.integrationId),
    );
    const mode = !serving.available ? "blocked" : existing ? "open" : "create";
    return {
      ...d,
      rowName,
      mode,
      enabled: serving.available,
      blockedReason: serving.available ? "" : "connect a real mothership, base, or verified student route first",
      // The canvas deep-link for the existing/created row (opens the config).
      openHref: `/workflows?object=${encodeURIComponent(existing?.objectId || CUSTOM_MODEL_WORKFLOWS_OBJECT_ID)}&row=${encodeURIComponent(existing ? String(existing.row?.Name || rowName) : rowName)}&field=orchestrationConfig`,
    };
  });
}

/**
 * Cockpit view-model for ONE derived model — the read-first data behind the
 * /custom-models tabbed cockpit (Overview / Usage / Settings). Pure: the
 * status tone and every config field is sourced from the SAME governed
 * evidence the ledger derives; nothing is fabricated. Where there is no real
 * telemetry the value is "—" (the CeoCockpit convention), never an invented
 * number — which is exactly why there are no eval%/latency/uptime tiles: that
 * telemetry is not governed, so it is not shown. The Settings config fields
 * mirror the workflow canvas node-config grammar (dm-orchestration-config__field)
 * and reflect the governed API-Registry row read-only — editing authority stays
 * in the Registry / Data Model, so the cockpit can never write a divergent truth.
 */
export function deriveCustomModelCockpit(model, { workspaceConfig, workspaceSourceRecords } = {}) {
  const servingRegistry = resolveCustomModelServingRegistry(model, { workspaceConfig });
  const directRegistryRow = registryRowsOf(workspaceConfig).find(
    (r) => String(r.integrationId || "") === String(model?.apiRegistryId || ""),
  ) || {};
  const registryRow = servingRegistry.row || directRegistryRow;

  // Continuum — the harvest → train → evaluate → serve loop, derived from
  // the SAME governed evidence as everything else in this cockpit: the trace
  // sidecar, model-training-run receipts (distillation block), the proxy
  // policy row, and the registry row's stamped chat-completions response.
  // `serve` is done only when the student actually serves (routing priority
  // earned through real verification), never on a claim.
  const slug = String(model?.name || "workspace-local");
  const flywheel = deriveFlywheelState({ workspaceConfig, workspaceSourceRecords, slug });
  const serving = deriveProxyServingState({ workspaceConfig, baseModel: model?.baseModel || "" });
  const runReceipts = deriveTrainingRunState({ workspaceConfig, workspaceSourceRecords, slug });
  const plan = buildAdaptiveStudentPlan({ preflight: runReceipts.preflight || null });
  const stepDone = (id) => flywheel.steps.find((s) => s.id === id)?.done === true;
  const continuum = {
    active: flywheel.hasProxy || flywheel.completed > 0,
    traceCount: flywheel.traceCount,
    generation: flywheel.generation,
    serving: serving.active
      ? {
        target: serving.active.target,
        servedTag: serving.verification?.servedModel || "",
        // Any non-student route is by definition still harvesting toward the
        // next student — the dopamine line the cockpit renders.
        harvesting: serving.active.target !== "local-student",
      }
      : null,
    plan: { mode: plan.mode, tierLabel: plan.tierLabel || "", baseModel: plan.baseModel || "" },
    loop: [
      { id: "harvest", label: "Harvest", done: stepDone("traces-harvested") },
      { id: "train", label: "Train", done: stepDone("student-trained") },
      { id: "evaluate", label: "Evaluate", done: stepDone("benchmark-promoted") },
      { id: "serve", label: "Serve", done: serving.active?.target === "local-student" },
    ],
    next: flywheel.next,
  };
  const state = String(model?.evidenceState || "recorded");
  const healthy = ["complete", "sandbox-ready", "verified"].includes(state);
  const health = {
    tone: healthy ? "ok" : state === "registered" ? "warn" : "muted",
    label: state === "complete" ? "Healthy"
      : state === "sandbox-ready" ? "Sandbox-ready"
        : state === "verified" ? "Verified"
          : state === "registered" ? "Registered"
            : "Recorded",
  };

  // Invocation receipts for THIS model — governed source records only.
  const invocationSources = Object.entries(workspaceSourceRecords || {}).filter(([key]) =>
    key.startsWith("model-invocation:")
      && (key.endsWith(`:${String(model?.id || model?.name || "")}`)
        || (!model?.apiRegistryId || key.includes(String(model.apiRegistryId)))),
  );
  const invocations = invocationSources.flatMap(([, source]) => Array.isArray(source?.records) ? source.records : []);
  const lastInvocation = [...invocations].sort((a, b) => String(a?.completedAt || "").localeCompare(String(b?.completedAt || ""))).at(-1) || null;

  // Usage — governed telemetry only, the CeoCockpit convention: every number
  // is counted from a real stamped row/record; where no evidence exists the
  // UI shows "—", never an invented figure.
  const registryId = String(servingRegistry.integrationId || model?.apiRegistryId || "");
  const boundRegistryIds = new Set([
    registryId,
    String(model?.apiRegistryId || ""),
  ].filter(Boolean));
  const allObjects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const boundWorkflows = [];
  for (const o of allObjects) {
    if (o?.objectType !== "sandbox-environment") continue;
    for (const r of (Array.isArray(o.rows) ? o.rows : [])) {
      const graphs = `${r?.orchestrationConfig || ""}${r?.orchestrationDraftConfig || ""}`;
      const rowRegistryId = String(r?.servingRegistryId || r?.schedulerRegistryId || "");
      const graphBindsModel = [...boundRegistryIds].some((id) =>
        graphs.includes(`"registryId": "${id}"`) || graphs.includes(`"registryId":"${id}"`),
      );
      if ((String(r?.customModelId || "") === String(model?.id || model?.name || ""))
        || boundRegistryIds.has(rowRegistryId)
        || graphBindsModel) {
        boundWorkflows.push(r);
      }
    }
  }
  const provenRuns = boundWorkflows.filter((r) => {
    try { const p = JSON.parse(String(r?.lastResponse || "null")); return p?.ok === true || Number(p?.exitCode) === 0; } catch { return false; }
  });
  // Tokens from STAMPED chat-completions usage blocks: the registry row's
  // last response + every proven run whose stdout is a completion.
  let promptTokens = 0;
  let completionTokens = 0;
  const countUsage = (u) => { if (u && typeof u === "object") { promptTokens += Number(u.prompt_tokens) || 0; completionTokens += Number(u.completion_tokens) || 0; } };
  if (invocations.length > 0) {
    // Canonical V1 telemetry: mothership invocation receipts are one record
    // per real upstream call, so they avoid double-counting the same response
    // when it is also stamped on a Registry row and sandbox run.
    for (const invocation of invocations) {
      promptTokens += Number(invocation?.promptTokens) || 0;
      completionTokens += Number(invocation?.completionTokens) || 0;
    }
  } else {
    // Backward compatibility for pre-mothership workspaces: retain their
    // direct-student Registry stamp and proven workflow output as the only
    // available usage evidence.
    try { countUsage(JSON.parse(String(directRegistryRow.lastResponse || "null"))?.usage); } catch { /* unstamped */ }
    for (const r of provenRuns) {
      try { countUsage(JSON.parse(JSON.parse(String(r.lastResponse || "null"))?.stdout || "null")?.usage); } catch { /* not a completion payload */ }
    }
  }
  // Tool-call surface: the model/agent call nodes across bound graphs.
  let toolCallNodes = 0;
  for (const r of boundWorkflows) {
    try {
      const g = JSON.parse(String(r?.orchestrationConfig || r?.orchestrationDraftConfig || "null"));
      toolCallNodes += (Array.isArray(g?.nodes) ? g.nodes : []).filter((n) => ["api-registry-call", "agent"].includes(String(n?.type || ""))).length;
    } catch { /* malformed graph counts nothing */ }
  }
  const usage = {
    invocations: invocations.length,
    workflowsBound: boundWorkflows.length,
    provenRuns: provenRuns.length,
    promptTokens,
    completionTokens,
    toolCallNodes,
    // Token counts are AS REPORTED by the endpoint's stamped usage blocks —
    // counted, never invented, but only as trustworthy as the endpoint that
    // reported them. The UI carries this basis on the usage line.
    usageBasis: "as reported by the endpoint's stamped responses",
    // Runtime/environment permission surface of the endpoint + bound rows —
    // read-only oversight, authority stays in the Data Model.
    permissions: {
      executionLane: String(registryRow.executionLane || "sandbox-local"),
      runLocality: [...new Set(boundWorkflows.map((r) => String(r?.runLocality || "local")))].join("/") || "local",
      networkAllow: boundWorkflows.some((r) => String(r?.networkAllow) === "true"),
      envRefs: boundWorkflows.filter((r) => String(r?.envRefs || "").trim()).length,
    },
  };

  // Settings — governed config surfaced with the canvas node-config field
  // grammar (dropdowns + text fields), read-only by construction. authRef is a
  // reference NAME only, never a secret value.
  const settingsFields = [
    { key: "endpointMode", label: "Endpoint mode", kind: "select", value: model?.endpointMode || "unknown", options: ["local", "hosted", "serverless", "unknown"] },
    { key: "method", label: "Method", kind: "select", value: String(registryRow.method || "POST"), options: ["POST", "GET"] },
    { key: "baseUrl", label: "Base URL", kind: "text", value: String(registryRow.baseUrl || "") },
    { key: "endpoint", label: "Endpoint path", kind: "text", value: String(registryRow.endpoint || "") },
    { key: "authRef", label: "Auth reference (name only)", kind: "text", value: String(registryRow.authRef || "") },
    { key: "timeoutMs", label: "Timeout (ms)", kind: "number", value: Number(registryRow.timeoutMs ?? CUSTOM_MODEL_WORKFLOW_TIMEOUT_MS) },
  ];

  return {
    health,
    settingsFields,
    invocations,
    continuum,
    usage,
    registryBound: Boolean(registryId),
    servingRegistryId: registryId,
    availability: lastInvocation
      ? { available: true, label: `Available · ${String(lastInvocation.route || "governed route")}`, servedModel: String(lastInvocation.servedModel || ""), completedAt: String(lastInvocation.completedAt || "") }
      : { available: servingRegistry.available, label: servingRegistry.available ? "Ready · not invoked yet" : "Not available", servedModel: model?.lastResponseModel || "", completedAt: "" },
    served: lastInvocation?.servedModel || model?.lastResponseModel || "",
    outputHash: model?.modelOutputHash || "",
  };
}

export { TRAINING_OBJECT_TYPE };
