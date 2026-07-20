/**
 * Governed Compute Realization — Provider Registry + local provider +
 * read-only compute route (Sprint 3).
 *
 * Exit proofs:
 *   - an ordinary API Registry row (metadata.computeProvider) derives a
 *     compute provider;
 *   - a missing adapter blocks the provider (adapter-missing);
 *   - a missing secret reference reports credential-missing (names only);
 *   - the local provider derives capacity from existing machine evidence;
 *   - the derived route exposes NO mutation surface;
 *   - no credential value can enter a governed row (fail closed).
 *
 * Run with: node --test scripts/unit-compute-provider-registry.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  registerComputeProviderAdapter,
  getComputeProviderAdapter,
  listComputeProviderAdapters,
  describeRegisteredComputeProviderAdapters,
} = await import(lib("adapters/compute/compute-adapter-registry.js"));

const { default: localAdapter, LOCAL_COMPUTE_ADAPTER_ID } = await import(lib("adapters/compute/default-local-machine.js"));

const {
  COMPUTE_PROVIDER_ROW_SCHEMA,
  parseComputeProviderRow,
  deriveComputeProviders,
  buildComputeProviderRowProposal,
  LOCAL_PROVIDER_ID,
} = await import(lib("compute-provider-registry.js"));

const contract = await import(
  pathToFileURL(path.join(repoRoot, "packages/api-contract/dist/compute.js")).href
);

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

test("registry mirrors the sandbox registry philosophy: register / get / list", () => {
  assert.ok(listComputeProviderAdapters().includes(LOCAL_COMPUTE_ADAPTER_ID), "local adapter self-registers at import");
  assert.equal(getComputeProviderAdapter(LOCAL_COMPUTE_ADAPTER_ID), localAdapter);
  assert.equal(getComputeProviderAdapter("nope"), null);
  assert.equal(getComputeProviderAdapter(""), null);
  const described = describeRegisteredComputeProviderAdapters().find((a) => a.id === LOCAL_COMPUTE_ADAPTER_ID);
  assert.equal(described.locality, "local");
});

test("an adapter missing lifecycle methods is refused at registration", () => {
  assert.throws(() => registerComputeProviderAdapter({ id: "half-baked", describeCapabilities: () => ({}) }), /allocate|inspectCapacity|status|cancel|release/);
  assert.throws(() => registerComputeProviderAdapter({ run: () => {} }), /id/);
  assert.throws(() => registerComputeProviderAdapter(null), /plain object/);
  assert.equal(getComputeProviderAdapter("half-baked"), null, "a refused adapter never enters the registry");
});

// ---------------------------------------------------------------------------
// Governed row validation (schema growthub-compute-provider-v1)
// ---------------------------------------------------------------------------

const validRow = {
  integrationId: "runpod-burst",
  Name: "Runpod burst capacity",
  kind: "compute-provider",
  metadata: {
    computeProvider: {
      schema: "growthub-compute-provider-v1",
      adapterId: "runpod-pods",
      capacityProfiles: ["burst-gpu", "single-gpu-finetune"],
      availabilityModes: ["on-demand", "spot"],
      requiredEnv: ["RUNPOD_API_KEY"],
      executionLane: "sandbox-local",
      config: { cloudType: "SECURE" },
    },
  },
};

test("schema constant mirrors the contract and a valid row parses", () => {
  assert.equal(COMPUTE_PROVIDER_ROW_SCHEMA, contract.COMPUTE_PROVIDER_ROW_SCHEMA);
  const parsed = parseComputeProviderRow(validRow);
  assert.equal(parsed.present, true);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.violations, []);
  assert.equal(parsed.metadata.adapterId, "runpod-pods");
  assert.ok(contract.isComputeProviderRowMetadata(parsed.metadata), "normalized block satisfies the contract guard");
});

test("rows without the compute block are simply not providers", () => {
  assert.equal(parseComputeProviderRow({ integrationId: "some-api" }).present, false);
  assert.equal(parseComputeProviderRow(null).present, false);
});

test("strict validation: wrong schema, missing adapter, unknown profile/mode, missing lane", () => {
  const mutate = (fn) => {
    const row = structuredClone(validRow);
    fn(row.metadata.computeProvider);
    return parseComputeProviderRow(row);
  };
  assert.equal(mutate((b) => { b.schema = "v2"; }).valid, false);
  assert.equal(mutate((b) => { delete b.adapterId; }).violations.some((v) => v.code === "adapter-id-missing"), true);
  assert.equal(mutate((b) => { b.capacityProfiles = ["gpu-max-turbo"]; }).violations.some((v) => v.code === "unknown-capacity-profile"), true);
  assert.equal(mutate((b) => { b.capacityProfiles = []; }).violations.some((v) => v.code === "capacity-profiles-missing"), true);
  assert.equal(mutate((b) => { b.availabilityModes = ["sometimes"]; }).violations.some((v) => v.code === "unknown-availability-mode"), true);
  assert.equal(mutate((b) => { delete b.executionLane; }).violations.some((v) => v.code === "execution-lane-missing"), true);
});

test("CREDENTIAL FIREWALL — no credential value may enter the row", () => {
  const mutate = (fn) => {
    const row = structuredClone(validRow);
    fn(row.metadata.computeProvider);
    return parseComputeProviderRow(row);
  };
  // A raw key stored where a NAME belongs.
  const v1 = mutate((b) => { b.requiredEnv = ["rpa_C8H4nM2xQ9vT7wK1pL5sD3fG6hJ0kZ8yB4nM2xQ9"]; });
  assert.equal(v1.valid, false);
  assert.ok(v1.violations.some((v) => v.code === "credential-value-in-row" || v.code === "invalid-env-reference"));
  // A credential-shaped config value.
  const v2 = mutate((b) => { b.config.apiKey = "sk-abcdef1234567890abcdef"; });
  assert.equal(v2.valid, false);
  assert.ok(v2.violations.some((v) => v.code === "credential-value-in-row" || v.code === "credential-shaped-value"));
  // A JWT hiding in a nested field.
  const v3 = mutate((b) => { b.config.nested = { auth: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload" }; });
  assert.equal(v3.valid, false);
  // An env NAME in a credential-named field is FINE — that is the design.
  const ok = mutate((b) => { b.config.tokenEnv = "MODAL_TOKEN_SECRET"; });
  assert.equal(ok.valid, true, `env NAME must pass: ${JSON.stringify(ok.violations)}`);
});

// ---------------------------------------------------------------------------
// Provider derivation
// ---------------------------------------------------------------------------

function configWith(rows) {
  return { dataModel: { objects: [{ id: "api-registry", objectType: "api-registry", rows }] } };
}

test("EXIT PROOF — ordinary API Registry row derives a compute provider", () => {
  const { providers } = deriveComputeProviders({
    workspaceConfig: configWith([validRow]),
    registeredAdapterIds: ["local-machine", "runpod-pods"],
    envPresent: (name) => name === "RUNPOD_API_KEY",
  });
  const runpod = providers.find((p) => p.providerId === "runpod-burst");
  assert.ok(runpod, "row-derived provider exists");
  assert.equal(runpod.provenance, "governed-row");
  assert.equal(runpod.status, "ready");
  assert.deepEqual(runpod.capacityProfiles, ["burst-gpu", "single-gpu-finetune"]);
});

test("EXIT PROOF — missing adapter blocks the provider", () => {
  const { providers } = deriveComputeProviders({
    workspaceConfig: configWith([validRow]),
    registeredAdapterIds: ["local-machine"], // runpod-pods NOT registered
    envPresent: () => true,
  });
  const runpod = providers.find((p) => p.providerId === "runpod-burst");
  assert.equal(runpod.status, "adapter-missing");
  assert.match(runpod.statusReason, /runpod-pods/);
});

test("EXIT PROOF — missing secret reference reports credential-missing, names only", () => {
  const { providers } = deriveComputeProviders({
    workspaceConfig: configWith([validRow]),
    registeredAdapterIds: ["local-machine", "runpod-pods"],
    envPresent: () => false,
  });
  const runpod = providers.find((p) => p.providerId === "runpod-burst");
  assert.equal(runpod.status, "credential-missing");
  assert.deepEqual(runpod.missingEnv, ["RUNPOD_API_KEY"]);
  assert.ok(!JSON.stringify(runpod).match(/rpa_|sk-/), "no value-shaped content in the derived state");
});

test("an invalid row derives an invalid-row provider (fail closed, reasons named)", () => {
  const poisoned = structuredClone(validRow);
  poisoned.metadata.computeProvider.config.apiKey = "sk-abcdef1234567890abcdef";
  const { providers, invalid } = deriveComputeProviders({
    workspaceConfig: configWith([poisoned]),
    registeredAdapterIds: ["runpod-pods"],
    envPresent: () => true,
  });
  assert.equal(invalid, 1);
  const p = providers.find((x) => x.providerId === "runpod-burst");
  assert.equal(p.status, "invalid-row");
  assert.ok(p.violations.length > 0);
  assert.deepEqual(p.capacityProfiles, [], "an invalid row contributes no capability claims");
});

test("EXIT PROOF — local provider capacity derives from existing machine evidence", async () => {
  const preflight = { ramGB: 32, diskFreeGB: 500, gpu: { present: true, name: "RTX 4090", vramFreeGB: 24 } };
  const { providers } = deriveComputeProviders({
    workspaceConfig: {},
    registeredAdapterIds: listComputeProviderAdapters(),
    envPresent: () => false,
    preflight,
  });
  const local = providers.find((p) => p.providerId === LOCAL_PROVIDER_ID);
  assert.ok(local, "builtin local provider always exists");
  assert.equal(local.provenance, "builtin");
  assert.equal(local.status, "ready");
  assert.equal(local.preflightPresent, true);

  // The adapter's own surfaces read the SAME evidence:
  const caps = localAdapter.describeCapabilities({ preflight });
  assert.equal(caps.maxVramPerGpuGB, 24);
  assert.equal(caps.maxGpusPerWorker, 1);
  assert.equal(caps.maxWorkers, 1, "a local machine never claims a cluster");

  const requirements = { workloadKind: "fine-tune", acceleratorClass: "any-gpu", gpuCount: 1, minVramPerGpuGB: 16, minCpuCores: 2, minRamGB: 16, minDiskGB: 60, checkpointRequired: true, distributed: null, locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 0 };
  const quote = await localAdapter.inspectCapacity({ providerConfig: { preflight }, requirements, capacityProfileId: "single-gpu-finetune", runRef: { providerId: LOCAL_PROVIDER_ID } });
  assert.equal(quote.available, true);
  assert.equal(quote.costBasis.kind, "owned-hardware");
  assert.equal(quote.estimatedTotalUsd, 0, "owned hardware is the one honest zero");
  assert.ok(quote.quoteObservedAt && quote.quoteExpiresAt, "quotes carry observation + expiry stamps");
});

test("local adapter refuses to allocate an ineligible machine, and allocation is idempotent", async () => {
  const requirements = { workloadKind: "fine-tune", gpuCount: 1, minVramPerGpuGB: 80, minCpuCores: 2, minRamGB: 16, minDiskGB: 60, checkpointRequired: true, distributed: null, locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 0 };
  const badCtx = { providerConfig: { preflight: { ramGB: 32, diskFreeGB: 500, gpu: { present: true, vramFreeGB: 24 } } }, requirements, idempotencyKeyHash: "abc123", runRef: {} };
  const refused = await localAdapter.allocate(badCtx);
  assert.equal(refused.status, "failed");
  assert.match(refused.error, /80 GB/);

  const okReq = { ...requirements, minVramPerGpuGB: 16 };
  const okCtx = { ...badCtx, requirements: okReq };
  const a1 = await localAdapter.allocate(okCtx);
  const a2 = await localAdapter.allocate(okCtx);
  assert.equal(a1.status, "allocated");
  assert.equal(a1.allocationId, a2.allocationId, "same governed request → same allocation identity");
  const released = await localAdapter.release(okCtx);
  assert.equal(released[0].type, "compute-released");
});

// ---------------------------------------------------------------------------
// Route surface: read-only by construction
// ---------------------------------------------------------------------------

test("EXIT PROOF — GET /api/workspace/compute has no mutation surface", () => {
  const routeSrc = fs.readFileSync(path.join(kitApp, "app/api/workspace/compute/route.js"), "utf8");
  assert.ok(/export async function GET/.test(routeSrc), "route exports GET");
  for (const verb of ["POST", "PATCH", "DELETE", "PUT"]) {
    assert.ok(!new RegExp(`export\\s+(async\\s+)?function\\s+${verb}`).test(routeSrc), `route must not export ${verb}`);
  }
  for (const writer of ["writeWorkspaceConfig", "appendWorkspaceSourceRecords", "applyWorkspaceConfigPatch"]) {
    assert.ok(!routeSrc.includes(writer), `route must not import the ${writer} write path`);
  }
});

test("row proposal factory emits a governed, secret-free row", () => {
  const proposal = buildComputeProviderRowProposal({
    integrationId: "modal-burst",
    name: "Modal burst",
    adapterId: "modal-functions",
    capacityProfiles: ["burst-gpu"],
    availabilityModes: ["on-demand"],
    requiredEnv: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
  });
  const parsed = parseComputeProviderRow(proposal);
  assert.equal(parsed.valid, true, JSON.stringify(parsed.violations));
  assert.equal(proposal.metadata.computeProvider.schema, COMPUTE_PROVIDER_ROW_SCHEMA);
});
