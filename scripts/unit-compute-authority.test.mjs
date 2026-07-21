/**
 * Governed Compute Realization — SERVER-OWNED compute authority.
 *
 * The trust boundary this suite pins: execution authority (intent, ordered
 * steps, work spec, dataset/output identity, policy) is compiled and
 * HMAC-sealed INSIDE the server from authoritative workspace records. A
 * caller who can PATCH the receipt store can produce a self-consistent
 * intent/work-spec — and it must count for nothing:
 *
 *   - compile: valid customer requests compile deterministically; missing
 *     dataset/output identity or contradictory requests fail closed;
 *   - seal: any post-seal mutation breaks verification; sealing is keyed,
 *     so a caller cannot mint a valid seal;
 *   - verify-against-workspace: recompilation over CURRENT governed inputs
 *     must reproduce the sealed content identity — changed policy, steps,
 *     dataset, or output identity is authority-drift and fails closed.
 *
 * Run with: node --test scripts/unit-compute-authority.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  COMPUTE_AUTHORITY_KEY_ENV,
  WORKSPACE_SIGNING_KEY_ENV,
  compileComputeAuthority,
  sealComputeAuthority,
  resolveComputeAuthorityKey,
  verifyComputeAuthoritySeal,
  verifyComputeAuthorityAgainstWorkspace,
} = await import(lib("compute-authority.js"));
const { COMPUTE_AUTHORITY_SCHEMA, hashComputeValue, verifyComputeAuthority } = await import(lib("compute-work-spec.js"));

const RUN_ID = "trainrun_authority";
const ENV = { [COMPUTE_AUTHORITY_KEY_ENV]: "unit-test-authority-key" };

function requestWith(overrides = {}) {
  return {
    schema: "growthub-compute-request-v1",
    policy: { mode: "cloud", excludeLocal: true, budget: { mode: "hard-cap", maxTotalUsd: 50 } },
    selectionMode: "explicit",
    providerRegistryId: "fake-remote",
    capacityProfileId: "single-gpu-finetune",
    trainingProfileId: "unsloth-qlora-quantize-pipeline",
    baseModel: "gemma3:4b",
    datasetExportId: "export-authority-1",
    datasetPath: "data/export-authority-1.jsonl",
    outputModelTag: "tuned-authority-v1",
    artifactPath: "artifacts/tuned-authority-v1",
    ...overrides,
  };
}

/** The authoritative model-training version row a compile must bind. */
function versionRowWith(overrides = {}) {
  return {
    Name: "workspace-local-v1",
    status: "prepared",
    apiRegistryId: "workspace-local-model",
    baseModel: "gemma3:4b",
    localModel: "tuned-authority-v1",
    lastExportId: "export-authority-1",
    lastExportSummary: JSON.stringify({ recordCount: 12, path: "data/export-authority-1.jsonl", registryId: "workspace-local-model", version: 1 }),
    ...overrides,
  };
}

function configWith({ request = requestWith(), rowOverrides = {}, versionRow = versionRowWith(), versionRows = null, runRows = null, registryRows = null } = {}) {
  const objects = [
    {
      id: "model-training-run",
      objectType: "model-training-run",
      rows: runRows || [{
        trainingRunId: RUN_ID,
        modelTrainingRowId: "workspace-local",
        datasetExportId: "export-authority-1",
        baseModel: "gemma3:4b",
        trainingProfile: "unsloth-qlora-quantize-pipeline",
        status: "running",
        preflight: { ramGB: 16, diskFreeGB: 200, gpu: { present: false, name: "", vramFreeGB: 0 } },
        ...(request ? { computeRequest: JSON.stringify(request) } : {}),
        ...rowOverrides,
      }],
    },
  ];
  const trainingRows = versionRows || (versionRow ? [versionRow] : []);
  if (trainingRows.length) objects.push({ id: "model-training", objectType: "model-training", rows: trainingRows });
  if (registryRows) objects.push({ id: "api-registry", objectType: "api-registry", rows: registryRows });
  return { dataModel: { objects } };
}

test("a valid customer request compiles to a sealed, internally consistent, deterministic authority", () => {
  const workspaceConfig = configWith({});
  const first = compileComputeAuthority({ workspaceConfig, trainingRunId: RUN_ID, now: "2026-07-20T12:00:00.000Z", env: ENV });
  assert.equal(first.ok, true, first.reason);
  const authority = first.authority;
  assert.equal(authority.schema, COMPUTE_AUTHORITY_SCHEMA);
  assert.match(authority.intentHash, /^[0-9a-f]{64}$/, "intent identity is canonical SHA-256");
  assert.match(authority.workSpecHash, /^[0-9a-f]{64}$/, "work-spec identity is canonical SHA-256");
  assert.match(authority.authorityHash, /^[0-9a-f]{64}$/);
  assert.equal(verifyComputeAuthority({ intent: authority.intent, workSpec: authority.workSpec }).ok, true);
  assert.equal(verifyComputeAuthoritySeal(authority, ENV).ok, true);
  assert.ok(authority.workSpec.training.steps.length > 0, "server compiled the exact ordered steps");
  assert.equal(authority.workSpec.output.modelTag, "tuned-authority-v1");
  assert.equal(authority.dataset.exportId, "export-authority-1");
  // Deterministic content identity: recompiling over unchanged inputs at a
  // different time yields the same authorityHash (drift detection = compare).
  const second = compileComputeAuthority({ workspaceConfig, trainingRunId: RUN_ID, now: "2026-07-21T09:00:00.000Z", env: ENV });
  assert.equal(second.ok, true);
  assert.equal(second.authority.authorityHash, authority.authorityHash);
});

test("compilation fails closed on missing identities and contradictory requests", () => {
  const noRequest = compileComputeAuthority({ workspaceConfig: configWith({ request: null }), trainingRunId: RUN_ID, env: ENV });
  assert.equal(noRequest.ok, false);
  assert.equal(noRequest.reasonCode, "request-missing");

  const noDataset = compileComputeAuthority({
    workspaceConfig: configWith({ request: requestWith({ datasetExportId: "" }), rowOverrides: { datasetExportId: "" } }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(noDataset.ok, false);
  assert.equal(noDataset.reasonCode, "dataset-identity-missing");

  const noOutput = compileComputeAuthority({ workspaceConfig: configWith({ request: requestWith({ outputModelTag: "" }) }), trainingRunId: RUN_ID, env: ENV });
  assert.equal(noOutput.ok, false);
  assert.equal(noOutput.reasonCode, "output-identity-missing");

  const baseConflict = compileComputeAuthority({ workspaceConfig: configWith({ request: requestWith({ baseModel: "other-model:9b" }) }), trainingRunId: RUN_ID, env: ENV });
  assert.equal(baseConflict.ok, false);
  assert.equal(baseConflict.reasonCode, "base-model-conflict");

  const staleTrainingRow = compileComputeAuthority({
    workspaceConfig: configWith({ versionRow: versionRowWith({ baseModel: "some-other-base:1b" }) }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(staleTrainingRow.ok, false);
  assert.equal(staleTrainingRow.reasonCode, "training-row-stale");

  const missingRow = compileComputeAuthority({ workspaceConfig: { dataModel: { objects: [] } }, trainingRunId: RUN_ID, env: ENV });
  assert.equal(missingRow.ok, false);
  assert.equal(missingRow.reasonCode, "receipt-missing");
});

test("BINDING — authority requires exactly one authoritative training-version row and consistent identities", () => {
  // No version row: a run without training-version lineage gets NO authority.
  const missing = compileComputeAuthority({ workspaceConfig: configWith({ versionRow: null }), trainingRunId: RUN_ID, env: ENV });
  assert.equal(missing.ok, false);
  assert.equal(missing.reasonCode, "training-row-missing");

  // Two version rows claiming the same export identity: ambiguous lineage.
  const ambiguous = compileComputeAuthority({
    workspaceConfig: configWith({ versionRows: [versionRowWith(), versionRowWith({ Name: "workspace-local-v2" })] }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.reasonCode, "training-row-ambiguous");

  // Two run rows claiming the same trainingRunId: ambiguous run identity.
  const runRow = { trainingRunId: RUN_ID, modelTrainingRowId: "workspace-local", datasetExportId: "export-authority-1", baseModel: "gemma3:4b", trainingProfile: "unsloth-qlora-quantize-pipeline", status: "running", computeRequest: JSON.stringify(requestWith()) };
  const dupRuns = compileComputeAuthority({ workspaceConfig: configWith({ runRows: [runRow, { ...runRow }] }), trainingRunId: RUN_ID, env: ENV });
  assert.equal(dupRuns.ok, false);
  assert.equal(dupRuns.reasonCode, "run-identity-ambiguous");

  // A version row that belongs to a DIFFERENT training identity.
  const foreign = compileComputeAuthority({
    workspaceConfig: configWith({ versionRow: versionRowWith({ Name: "other-slug-v1" }) }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reasonCode, "training-row-binding");

  // Output tag contradicting the version row's reserved tag.
  const tagConflict = compileComputeAuthority({
    workspaceConfig: configWith({ versionRow: versionRowWith({ localModel: "someone-elses-tag" }) }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(tagConflict.ok, false);
  assert.equal(tagConflict.reasonCode, "output-identity-conflict");

  // Output tag contradicting the bound API Registry expected served tag.
  const registryConflict = compileComputeAuthority({
    workspaceConfig: configWith({ registryRows: [{ integrationId: "workspace-local-model", expectedModelTag: "registry-says-otherwise" }] }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(registryConflict.ok, false);
  assert.equal(registryConflict.reasonCode, "output-identity-conflict");

  // Dataset path contradicting the export summary.
  const pathConflict = compileComputeAuthority({
    workspaceConfig: configWith({ request: requestWith({ datasetPath: "data/other-bytes.jsonl" }) }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(pathConflict.ok, false);
  assert.equal(pathConflict.reasonCode, "dataset-path-conflict");

  // A WEAKER requested capacity profile can never downgrade the derived plan.
  const bigPreflight = { ramGB: 256, diskFreeGB: 2000, gpu: { present: true, name: "H100", vramFreeGB: 80 } };
  const downgrade = compileComputeAuthority({
    workspaceConfig: configWith({
      request: requestWith({ baseModel: "qwen3:141b", capacityProfileId: "cpu-local-finetune" }),
      rowOverrides: { baseModel: "qwen3:141b", preflight: bigPreflight },
      versionRow: versionRowWith({ baseModel: "qwen3:141b" }),
    }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(downgrade.ok, false);
  assert.equal(downgrade.reasonCode, "capacity-profile-downgrade");

  // A correctly bound prepared run (matching registry included) compiles.
  const bound = compileComputeAuthority({
    workspaceConfig: configWith({ registryRows: [{ integrationId: "workspace-local-model", expectedModelTag: "tuned-authority-v1" }] }),
    trainingRunId: RUN_ID,
    env: ENV,
  });
  assert.equal(bound.ok, true, bound.reason);
  assert.equal(bound.keySource, "env");
  assert.equal(bound.authority.trainingRowBinding.rowName, "workspace-local-v1");
  assert.equal(bound.authority.dataset.binding, "metadata-only", "without a server corpus manifest the authority claims metadata identity only");
});

test("ADVERSARIAL — any post-seal mutation breaks the seal; a self-consistent forgery cannot mint one", () => {
  const { authority } = compileComputeAuthority({ workspaceConfig: configWith({}), trainingRunId: RUN_ID, now: "t", env: ENV });

  // Mutate one governed field after sealing.
  const mutated = { ...authority, workSpec: { ...authority.workSpec, output: { ...authority.workSpec.output, modelTag: "attacker-tag" } } };
  assert.equal(verifyComputeAuthoritySeal(mutated, ENV).ok, false, "field mutation breaks the seal");

  // An attacker who can hash rebuilds every self-hash so the object is
  // internally consistent — the seal still fails without the server key.
  const forgedSpecBody = { ...authority.workSpec, workSpecHash: undefined, output: { ...authority.workSpec.output, modelTag: "attacker-tag" } };
  const forgedSpec = { ...forgedSpecBody, workSpecHash: hashComputeValue(forgedSpecBody) };
  const forgedBody = { ...authority, seal: undefined, workSpec: forgedSpec, workSpecHash: forgedSpec.workSpecHash };
  const forged = { ...forgedBody, authorityHash: hashComputeValue({ ...forgedBody, authorityHash: undefined, compiledAt: undefined }) };
  assert.equal(verifyComputeAuthority({ intent: forged.intent, workSpec: forged.workSpec }).intentOk, true, "forgery is self-consistent");
  assert.equal(verifyComputeAuthoritySeal(forged, ENV).ok, false, "self-consistency never substitutes for the server seal");

  // Sealing under a DIFFERENT key (an attacker's own key) also fails.
  const wrongKeySeal = sealComputeAuthority({ ...forged, seal: undefined }, { key: "attacker-key", keyId: "env-attacker" });
  assert.equal(verifyComputeAuthoritySeal(wrongKeySeal, ENV).ok, false);

  // The honest authority still verifies.
  assert.equal(verifyComputeAuthoritySeal(authority, ENV).ok, true);
});

test("ADVERSARIAL — post-seal drift of policy, dataset, steps, or output fails verification against the workspace", () => {
  const baseConfig = configWith({});
  const { authority } = compileComputeAuthority({ workspaceConfig: baseConfig, trainingRunId: RUN_ID, now: "t", env: ENV });
  assert.equal(verifyComputeAuthorityAgainstWorkspace({ workspaceConfig: baseConfig, trainingRunId: RUN_ID, authority, env: ENV }).ok, true);

  const cases = [
    ["policy changed", configWith({ request: requestWith({ policy: { mode: "cloud", budget: { mode: "unlimited" } } }) })],
    ["output identity changed", configWith({
      request: requestWith({ outputModelTag: "tuned-authority-v2", artifactPath: "artifacts/tuned-authority-v2" }),
      versionRow: versionRowWith({ localModel: "tuned-authority-v2" }),
    })],
    ["ordered steps changed via training profile", configWith({ request: requestWith({ trainingProfileId: "compatible-runtime-endpoint" }), rowOverrides: { trainingProfile: "compatible-runtime-endpoint" } })],
    ["dataset identity changed", configWith({
      request: requestWith({ datasetExportId: "export-authority-2", datasetPath: "data/export-authority-2.jsonl" }),
      rowOverrides: { datasetExportId: "export-authority-2" },
      versionRow: versionRowWith({ Name: "workspace-local-v2", lastExportId: "export-authority-2", lastExportSummary: JSON.stringify({ recordCount: 12, path: "data/export-authority-2.jsonl", version: 2 }) }),
    })],
    ["provider preference changed", configWith({ request: requestWith({ providerRegistryId: "another-provider" }) })],
  ];
  for (const [label, driftedConfig] of cases) {
    const verdict = verifyComputeAuthorityAgainstWorkspace({ workspaceConfig: driftedConfig, trainingRunId: RUN_ID, authority, env: ENV });
    assert.equal(verdict.ok, false, `${label}: stale authority must fail closed`);
    assert.equal(verdict.reasonCode, "authority-drift", `${label}: named as drift`);
    assert.ok(verdict.recompiled, `${label}: current truth recompiles for explicit re-preparation`);
    assert.notEqual(verdict.recompiled.authorityHash, authority.authorityHash);
  }
});

test("key handling: dedicated env key, workspace-signing-key fallback, then ephemeral — all with non-secret keyIds", () => {
  const envKey = resolveComputeAuthorityKey(ENV);
  assert.equal(envKey.source, "env");
  assert.match(envKey.keyId, /^env-[0-9a-f]{16}$/);
  assert.ok(!envKey.keyId.includes(ENV[COMPUTE_AUTHORITY_KEY_ENV]), "keyId never leaks key material");

  // One operator key by default: the SAME workspace signing key the
  // inference manifest seam uses (GROWTHUB_WORKSPACE_SIGNING_KEY) seals
  // compute authority when no dedicated key is set. Domain-separated keyId.
  const shared = { [WORKSPACE_SIGNING_KEY_ENV]: "shared-workspace-signing-key" };
  const wsk = resolveComputeAuthorityKey(shared);
  assert.equal(wsk.source, "workspace-signing-key");
  assert.match(wsk.keyId, /^wsk-[0-9a-f]{16}$/);
  const dedicatedWins = resolveComputeAuthorityKey({ ...shared, ...ENV });
  assert.equal(dedicatedWins.source, "env", "the dedicated key overrides the shared one");

  const ephemeral = resolveComputeAuthorityKey({});
  assert.equal(ephemeral.source, "ephemeral");
  assert.equal(resolveComputeAuthorityKey({}).keyId, ephemeral.keyId, "stable within the process");

  // Sealed under the shared workspace key: verifies with it, refused without.
  const sealedUnderWsk = compileComputeAuthority({ workspaceConfig: configWith({}), trainingRunId: RUN_ID, now: "t", env: shared });
  assert.equal(verifyComputeAuthoritySeal(sealedUnderWsk.authority, shared).ok, true);
  assert.equal(verifyComputeAuthoritySeal(sealedUnderWsk.authority, ENV).ok, false);

  // Sealed under env key, verified without it (restart / rotation): the
  // stored object is refused — fails closed to recompilation, never trust.
  const { authority } = compileComputeAuthority({ workspaceConfig: configWith({}), trainingRunId: RUN_ID, now: "t", env: ENV });
  const rotated = verifyComputeAuthoritySeal(authority, {});
  assert.equal(rotated.ok, false);
  assert.equal(rotated.reasonCode, "seal-key-mismatch");
});
