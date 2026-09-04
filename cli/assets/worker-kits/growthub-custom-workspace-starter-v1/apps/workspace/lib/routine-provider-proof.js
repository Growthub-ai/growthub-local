const HASH_256 = /^[a-f0-9]{64}$/;

function clean(value, max = 500) {
  const result = String(value == null ? "" : value).trim();
  return result && result.length <= max ? result : "";
}

/**
 * Preserve only the exact, secret-free Runtime v2 identity returned by the
 * authenticated control plane. The Workspace never derives or substitutes
 * provider proof from an account credential, adapter result, or local run id.
 */
export function normalizeRoutineProviderProof(value, expectedProviderRunId = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const providerRunId = clean(value.providerRunId, 200);
  const workflowRunId = clean(value.workflowRunId, 240);
  const executionContractSha256 = clean(value.executionContractSha256, 64);
  const registrationContractSha256 = clean(value.registrationContractSha256, 64);
  const expected = clean(expectedProviderRunId, 200);
  if (
    !providerRunId
    || (expected && providerRunId !== expected)
    || !workflowRunId
    || !HASH_256.test(executionContractSha256)
    || !HASH_256.test(registrationContractSha256)
  ) return null;
  return {
    providerRunId,
    workflowRunId,
    executionContractSha256,
    registrationContractSha256,
  };
}

