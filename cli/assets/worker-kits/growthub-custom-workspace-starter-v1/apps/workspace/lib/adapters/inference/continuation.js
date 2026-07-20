/** Resolve a tool continuation only from an already persisted invocation. */

function clean(value) {
  return String(value || "").trim();
}

/**
 * Resolve a CHILD workflow receipt only from the persisted invocation
 * stream. Mirrors the continuation trust anchor: the caller supplies an
 * opaque id; the canonical receipt comes from server-owned records, bound to
 * the same model policy and app scope, and must declare the expected parent.
 * The caller-shaped receipt body is never the trust source.
 */
export function resolveTrustedChildReceipt(records, {
  childReceiptId,
  expectedParentReceiptId,
  modelId,
  policyRegistryId,
  appScope,
} = {}) {
  const wantedId = clean(childReceiptId);
  if (!wantedId || wantedId.length > 256) {
    return { ok: false, reason: "child receipt id is required and must be at most 256 characters" };
  }
  const sourceRecords = Array.isArray(records) ? records : [];
  const matching = sourceRecords.filter((candidate) => (
    clean(candidate?.verificationReceipt?.receipt_id) === wantedId
    && clean(candidate?.modelId) === clean(modelId)
    && clean(candidate?.policyRegistryId) === clean(policyRegistryId)
  ));
  if (matching.length === 0) return { ok: false, reason: "child receipt was not found in the governed invocation stream" };
  if (matching.length !== 1) return { ok: false, reason: "child receipt id is not unique in the governed invocation stream" };
  const invocation = matching[0];
  if (clean(invocation.appScope || "workspace-wide") !== clean(appScope || "workspace-wide")) {
    return { ok: false, reason: "child receipt is outside this app scope" };
  }
  const receipt = invocation.verificationReceipt;
  const declaredParent = clean(receipt?.lineage?.parent_receipt_id);
  if (clean(expectedParentReceiptId) && declaredParent !== clean(expectedParentReceiptId)) {
    return { ok: false, reason: "child receipt was not spawned from this parent receipt" };
  }
  return { ok: true, receipt };
}

export function resolveTrustedInferenceContinuation(records, {
  receiptId,
  modelId,
  policyRegistryId,
  integrationId,
  modelTag,
  appScope,
} = {}) {
  const wantedReceiptId = clean(receiptId);
  if (!wantedReceiptId || wantedReceiptId.length > 256) {
    return { ok: false, reason: "prior_receipt_id is required and must be at most 256 characters" };
  }
  const sourceRecords = Array.isArray(records) ? records : [];
  const matching = sourceRecords.filter((candidate) => (
    clean(candidate?.verificationReceipt?.receipt_id) === wantedReceiptId
    && clean(candidate?.modelId) === clean(modelId)
    && clean(candidate?.policyRegistryId) === clean(policyRegistryId)
  ));
  if (matching.length === 0) return { ok: false, reason: "prior inference receipt was not found in the governed invocation stream" };
  if (matching.length !== 1) return { ok: false, reason: "prior inference receipt id is not unique in the governed invocation stream" };
  if (sourceRecords.some((candidate) => clean(candidate?.priorReceiptId) === wantedReceiptId)) {
    return { ok: false, reason: "prior inference receipt has already been consumed" };
  }
  const invocation = matching[0];
  if ((clean(integrationId) && clean(invocation.integrationId) !== clean(integrationId))
    || (clean(modelTag) && clean(invocation.expectedModel) !== clean(modelTag))
    || clean(invocation.appScope || "workspace-wide") !== clean(appScope || "workspace-wide")) {
    return { ok: false, reason: "prior inference receipt is outside this model, integration, or app scope" };
  }
  const receipt = invocation.verificationReceipt;
  if (clean(invocation.outcomeStatus) !== "awaiting_tool_result"
    || clean(receipt?.tool_audit?.status) !== "awaiting_result") {
    return { ok: false, reason: "prior inference receipt is not awaiting tool results" };
  }
  const entries = Array.isArray(receipt?.tool_audit?.calls) ? receipt.tool_audit.calls : [];
  const validEntries = entries.filter((entry) => (
    entry?.tool_call
    && clean(entry?.tool_call?.id)
    && clean(entry?.validation?.status) === "valid"
    && clean(entry?.validation?.spec_sha256)
    && !entry.external_result
  ));
  if (validEntries.length === 0 || validEntries.length !== entries.length) {
    return { ok: false, reason: "prior inference receipt has incomplete or invalid tool-call proof" };
  }
  const specHashes = [...new Set(validEntries.map((entry) => clean(entry.validation.spec_sha256)))];
  if (specHashes.length !== 1 || !/^[a-f0-9]{64}$/.test(specHashes[0])) {
    return { ok: false, reason: "prior inference receipt does not bind one canonical tool contract" };
  }
  const conversationSha256 = clean(receipt?.conversation_sha256);
  if (!/^[a-f0-9]{64}$/.test(conversationSha256)) {
    return { ok: false, reason: "prior inference receipt does not bind the conversation that produced its tool call" };
  }
  return {
    ok: true,
    continuation: {
      trusted: true,
      receiptId: wantedReceiptId,
      requestId: clean(receipt.request_id),
      modelTag: clean(receipt?.identity?.model_tag),
      appScope: clean(invocation.appScope || "workspace-wide"),
      integrationId: clean(invocation.integrationId),
      route: clean(invocation.route),
      baseModelSha256: clean(receipt?.identity?.base_model_sha256),
      adapterSha256: clean(receipt?.identity?.adapter_sha256),
      toolContractSha256: specHashes[0],
      conversationSha256,
      toolCalls: validEntries.map((entry) => entry.tool_call),
    },
  };
}
