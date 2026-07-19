/**
 * Read-only custom-model branch for POST /api/workspace/test-source.
 *
 * A generic resolver and a governed custom model are different registry
 * capabilities. This helper recognizes only the explicit custom-model trait
 * plus its mothership -> local-student relationship, then performs the first
 * real student invocation through the existing inference gateway. It does no
 * persistence and creates no mutation lane.
 */

import { executeCustomModelInference } from "./custom-model-inference.js";

const DEFAULT_TEST_PROMPT = "Reply in one short line to confirm you are the tuned workspace model.";

function registryRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  return objects
    .filter((object) => object?.objectType === "api-registry")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : [])
    .filter((row) => row && typeof row === "object");
}

function hasExplicitCustomModelTrait(row) {
  return String(row?.kind || "") === "custom-model"
    || String(row?.capabilityType || "") === "custom-model-inference";
}

function mothershipPolicy(row) {
  const value = row?.metadata?.mothershipProxy;
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function localStudentRoute(policy, registryId = "") {
  const wanted = String(registryId || "").trim();
  const routes = Array.isArray(policy?.routes) ? policy.routes : [];
  return routes.find((route) => String(route?.target || "") === "local-student"
    && (!wanted || String(route?.registryId || "").trim() === wanted)) || null;
}

/**
 * Resolve an unambiguous custom-model verification target. `recognized` is
 * separate from `ok` so a malformed custom-model row fails closed instead of
 * falling through to the ordinary resolver lane.
 */
export function resolveCustomModelTestTarget(workspaceConfig, integrationId) {
  const id = String(integrationId || "").trim();
  const rows = registryRows(workspaceConfig);
  const requestedRow = rows.find((row) => String(row?.integrationId || "").trim() === id) || null;
  if (!requestedRow || !hasExplicitCustomModelTrait(requestedRow)) {
    return { recognized: false, ok: false };
  }

  let policyRow = null;
  let studentRow = null;
  let route = null;
  const requestedPolicy = mothershipPolicy(requestedRow);
  if (requestedPolicy) {
    policyRow = requestedRow;
    route = localStudentRoute(requestedPolicy);
    studentRow = rows.find((row) => String(row?.integrationId || "").trim() === String(route?.registryId || "").trim()) || null;
  } else {
    const matches = rows.filter((row) => hasExplicitCustomModelTrait(row)
      && localStudentRoute(mothershipPolicy(row), id));
    if (matches.length > 1) {
      return {
        recognized: true,
        ok: false,
        reason: "ambiguous-mothership-policy",
        error: `multiple mothership policies reference custom model ${id}`,
      };
    }
    policyRow = matches[0] || null;
    route = policyRow ? localStudentRoute(mothershipPolicy(policyRow), id) : null;
    studentRow = requestedRow;
  }

  if (!policyRow || !route || !studentRow || !hasExplicitCustomModelTrait(studentRow)) {
    return {
      recognized: true,
      ok: false,
      reason: "invalid-mothership-policy",
      error: "custom-model verification requires one explicit mothership local-student relationship",
    };
  }

  const policy = mothershipPolicy(policyRow);
  const tags = [policy?.modelTag, route?.modelTag, studentRow?.expectedModelTag]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const distinctTags = new Set(tags);
  if (tags.length !== 3 || distinctTags.size !== 1) {
    return {
      recognized: true,
      ok: false,
      reason: "model-tag-mismatch",
      error: "mothership policy, student route, and registry row must name one exact tuned model tag",
    };
  }

  return {
    recognized: true,
    ok: true,
    integrationId: id,
    policyRow,
    studentRow,
    route,
    expectedModel: tags[0],
  };
}

function isLlamaCppStudent(studentRow) {
  const control = studentRow?.metadata?.inferenceControlPlane;
  const kind = String(control?.providerKind || control?.runtime?.kind || studentRow?.connectorKind || "").toLowerCase();
  return ["llama.cpp", "llama-cpp", "llamacpp", "llama.cpp-server", "llama-cpp-server"].includes(kind);
}

export async function executeCustomModelSourceTest({
  workspaceConfig,
  integrationId,
  prompt = DEFAULT_TEST_PROMPT,
  runId = "",
  traceparent = "",
  tracestate = "",
  appScope = "",
  fetchImpl,
  llamaPool,
  networkPolicy = {},
  resolvedEnv = {},
  allowedEnvRefs = [],
  signal,
  timeoutMs = 120_000,
  executeImpl = executeCustomModelInference,
} = {}) {
  const target = resolveCustomModelTestTarget(workspaceConfig, integrationId);
  if (!target.recognized) return { handled: false };
  if (!target.ok) return { handled: true, ok: false, ...target };

  let inference;
  try {
    inference = await executeImpl({
      workspaceConfig,
      policyRow: target.policyRow,
      inputPayload: {
        prompt: String(prompt || DEFAULT_TEST_PROMPT),
        // Verification must touch the live runtime. A completion-cache replay
        // can be valid for serving but cannot prove that the endpoint is
        // currently callable, so the server forces this one probe to bypass it.
        inference: { cache_policy: { mode: "bypass" } },
      },
      runId: String(runId || `test-source:${target.integrationId}`),
      maxTokens: 64,
      allowedTargets: ["local-student"],
      verificationProbe: true,
      traceparent: String(traceparent || ""),
      tracestate: String(tracestate || ""),
      appScope: String(appScope || ""),
      fetchImpl,
      llamaPool,
      networkPolicy,
      resolvedEnv,
      allowedEnvRefs,
      signal,
      timeoutMs,
    });
  } catch (error) {
    return {
      handled: true,
      ok: false,
      reason: "custom-model-verification-failed",
      error: String(error?.message || "custom-model gateway invocation failed"),
      integrationId: target.integrationId,
      expectedModel: target.expectedModel,
      servedModel: "",
      response: null,
      verificationReceipt: null,
      attempts: [],
    };
  }
  const response = inference?.response || null;
  const receipt = inference?.verificationReceipt || inference?.invocation?.verificationReceipt || null;
  const servedModel = String(response?.model || inference?.invocation?.servedModel || "").trim();
  const llamaIdentityVerified = !isLlamaCppStudent(target.studentRow)
    || receipt?.identity?.status === "verified";
  const tunedTagVerified = inference?.ok === true
    && inference?.awaitingToolResult !== true
    && servedModel === target.expectedModel
    && Boolean(receipt)
    && llamaIdentityVerified;

  if (!tunedTagVerified) {
    return {
      handled: true,
      ok: false,
      reason: inference?.awaitingToolResult === true ? "tool-result-required" : "custom-model-verification-failed",
      error: String(
        inference?.error
          || inference?.attempts?.at(-1)?.reason
          || (servedModel ? `student served ${servedModel}; expected ${target.expectedModel}` : "student did not return a verifiable chat completion"),
      ),
      integrationId: target.integrationId,
      expectedModel: target.expectedModel,
      servedModel,
      response,
      verificationReceipt: receipt,
      attempts: Array.isArray(inference?.attempts) ? inference.attempts : [],
    };
  }

  return {
    handled: true,
    ok: true,
    integrationId: target.integrationId,
    policyIntegrationId: String(target.policyRow?.integrationId || ""),
    expectedModel: target.expectedModel,
    servedModel,
    tunedTagVerified: true,
    response,
    verificationReceipt: receipt,
    invocation: inference.invocation,
  };
}

export { DEFAULT_TEST_PROMPT };
