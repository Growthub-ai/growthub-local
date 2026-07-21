import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(app, "lib", rel)).href;

const { evaluateCandidateEligibility } = await import(lib("compute-resolver.js"));
const { executeProviderComputeRun } = await import(lib("compute-execution.js"));
const {
  registerComputeProviderAdapter,
  getComputeProviderAdapter,
} = await import(lib("adapters/compute/compute-adapter-registry.js"));
const { default: runpodAdapter } = await import(lib("adapters/compute/runpod-compute.js"));
const { default: modalAdapter } = await import(lib("adapters/compute/modal-compute.js"));
const { rayAdapter } = await import(lib("adapters/compute/ray-cluster-compute.js"));

const NOW = Date.parse("2026-07-21T12:00:00.000Z");
const REQUIREMENTS = {
  workloadKind: "fine-tune",
  acceleratorClass: "datacenter-gpu",
  gpuCount: 1,
  minVramPerGpuGB: 40,
  minCpuCores: 4,
  minRamGB: 16,
  minDiskGB: 60,
  checkpointRequired: false,
  distributed: null,
  locality: { regions: [], dataResidency: "" },
  estimatedDurationMinutes: 60,
};
const PROVIDER = {
  providerId: "remote-safe",
  status: "ready",
  capacityProfiles: ["single-gpu-finetune"],
  config: {},
};
const QUOTE = {
  providerId: "remote-safe",
  capacityProfileId: "single-gpu-finetune",
  available: true,
  availabilityMode: "on-demand",
  costBasis: { kind: "per-hour", unitUsd: 1, source: "test" },
  estimatedTotalUsd: 1,
  queueLatencySeconds: 0,
  quoteObservedAt: "2026-07-21T11:59:00.000Z",
  quoteExpiresAt: "2026-07-21T12:10:00.000Z",
};
const BASE_CAPS = {
  providerId: "remote-safe",
  adapterId: "safe-adapter",
  capacityProfiles: ["single-gpu-finetune"],
  availabilityModes: ["on-demand"],
  acceleratorClasses: ["datacenter-gpu", "high-memory-gpu"],
  maxVramPerGpuGB: 80,
  maxGpusPerWorker: 8,
  maxWorkers: 1,
  supportsCheckpointing: true,
  supportsResume: true,
  supportsGangScheduling: false,
  regions: [],
  requiredEnv: [],
};

function eligibility({ capabilities = BASE_CAPS, quote = QUOTE } = {}) {
  return evaluateCandidateEligibility({
    requirements: REQUIREMENTS,
    capacityProfileId: "single-gpu-finetune",
    provider: PROVIDER,
    capabilities,
    quote,
    budget: { mode: "advisory", maxTotalUsd: 0, maxHourlyUsd: 0, allowUnknownCost: false },
    policy: { mode: "cloud", excludeLocal: true },
    now: NOW,
  });
}

test("remote placement refuses an explicitly unproven allocation/reconciliation contract", () => {
  const refused = eligibility({
    capabilities: {
      ...BASE_CAPS,
      allocationIdempotency: { guaranteed: false, mode: "unproven", evidence: "no deterministic provider lookup" },
    },
  });
  assert.equal(refused.eligible, false);
  assert.ok(refused.reasonCodes.includes("allocation-idempotency-unproven"));

  const safe = eligibility({
    capabilities: {
      ...BASE_CAPS,
      allocationIdempotency: { guaranteed: true, mode: "reconcile-before-create", evidence: "deterministic resource name" },
    },
  });
  assert.equal(safe.eligible, true, safe.reasons.join("; "));

  const dynamicallyAttested = eligibility({
    capabilities: {
      ...BASE_CAPS,
      allocationIdempotency: { guaranteed: false, mode: "endpoint-contract", evidence: "health attestation required" },
    },
    quote: { ...QUOTE, allocationIdempotencyVerified: true },
  });
  assert.equal(dynamicallyAttested.eligible, true, dynamicallyAttested.reasons.join("; "));
});

test("production registry defaults every unknown remote adapter to fail-closed allocation safety", () => {
  const id = `unproven-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const methods = {
    id,
    label: "Unproven",
    description: "",
    locality: "remote",
    describeCapabilities: () => ({ ...BASE_CAPS, adapterId: id }),
    inspectCapacity: async () => ({ ...QUOTE, providerId: id }),
    allocate: async () => ({}),
    execute: async () => [],
    status: async () => [],
    resume: async () => [],
    cancel: async () => [],
    release: async () => [],
  };
  registerComputeProviderAdapter(methods);
  const registered = getComputeProviderAdapter(id);
  const caps = registered.describeCapabilities({ providerId: id });
  assert.equal(caps.allocationIdempotency.guaranteed, false);
  assert.equal(caps.allocationIdempotency.mode, "unproven");
});

test("Runpod Pods and Ray prove reconciliation; Runpod serverless remains ineligible", () => {
  const pods = runpodAdapter.describeCapabilities({ providerId: "runpod-pods", mode: "pods", networkVolumeId: "vol-1" });
  assert.equal(pods.allocationIdempotency.guaranteed, true);
  assert.equal(pods.allocationIdempotency.mode, "reconcile-before-create");

  const serverless = runpodAdapter.describeCapabilities({ providerId: "runpod-serverless", mode: "serverless", endpointId: "ep-1" });
  assert.equal(serverless.allocationIdempotency.guaranteed, false);

  const ray = rayAdapter.describeCapabilities({ providerId: "ray-safe", dashboardUrl: "https://ray.example", maxWorkers: 2, maxVramPerGpuGB: 80 });
  assert.equal(ray.allocationIdempotency.guaranteed, true);
  assert.equal(ray.allocationIdempotency.mode, "provider-native-key");
});

test("Modal becomes eligible only when the deployed function dynamically attests the dedupe contract", async () => {
  const caps = modalAdapter.describeCapabilities({ providerId: "modal-safe", baseUrl: "https://modal.example", volumeConfigured: true, gpuType: "H100" });
  assert.equal(caps.allocationIdempotency.guaranteed, false);
  assert.equal(caps.allocationIdempotency.mode, "endpoint-contract");

  const ctx = {
    providerConfig: { providerId: "modal-safe", baseUrl: "https://modal.example", volumeConfigured: true, gpuType: "H100" },
    requirements: REQUIREMENTS,
    capacityProfileId: "single-gpu-finetune",
    resolveEnv: () => "test-secret",
    fetchJson: async () => ({ ok: true }),
  };
  const unproven = await modalAdapter.inspectCapacity(ctx);
  assert.equal(unproven.allocationIdempotencyVerified, false);

  const proven = await modalAdapter.inspectCapacity({
    ...ctx,
    fetchJson: async () => ({ ok: true, growthub: { allocationIdempotency: "growthub-idempotency-key-v1" } }),
  });
  assert.equal(proven.allocationIdempotencyVerified, true);
});

function providerConfig() {
  return {
    dataModel: {
      objects: [{
        id: "api-registry",
        objectType: "api-registry",
        rows: [{
          integrationId: "crash-safe",
          status: "registered",
          metadata: {
            computeProvider: {
              schema: "growthub-compute-provider-v1",
              adapterId: "crash-safe-adapter",
              capacityProfiles: ["single-gpu-finetune"],
              availabilityModes: ["on-demand"],
              requiredEnv: [],
              executionLane: "sandbox-local",
              config: {},
            },
          },
        }],
      }],
    },
  };
}

test("crash after provider acceptance but before allocation persistence reconciles one resource, never a second spend", async () => {
  const resources = new Map();
  let providerCreates = 0;
  let clock = NOW;
  const adapter = {
    id: "crash-safe-adapter",
    locality: "remote",
    describeCapabilities: () => ({
      ...BASE_CAPS,
      providerId: "crash-safe",
      adapterId: "crash-safe-adapter",
      allocationIdempotency: { guaranteed: true, mode: "reconcile-before-create", evidence: "test deterministic map" },
    }),
    inspectCapacity: async () => ({ ...QUOTE, providerId: "crash-safe" }),
    allocate: async (ctx) => {
      let resource = resources.get(ctx.idempotencyKeyHash);
      if (!resource) {
        providerCreates += 1;
        resource = `resource-${ctx.idempotencyKeyHash.slice(0, 12)}`;
        resources.set(ctx.idempotencyKeyHash, resource);
      }
      return {
        allocationId: resource,
        runRef: { ...ctx.runRef, providerResourceId: resource },
        status: "allocated",
        idempotencyKeyHash: ctx.idempotencyKeyHash,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 1, source: "test" },
        requestedAt: new Date(clock).toISOString(),
        allocatedAt: new Date(clock).toISOString(),
        releasedAt: "",
        releaseConfirmed: false,
        allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "" },
        reconciled: providerCreates === 1 && resources.has(ctx.idempotencyKeyHash),
      };
    },
    execute: async (ctx) => [{ type: "compute-queued", at: new Date(clock).toISOString(), evidenceObservedAt: new Date(clock).toISOString(), source: "provider", runRef: { ...ctx.runRef }, providerEventId: `queued:${ctx.idempotencyKeyHash}`, detail: "queued" }],
    status: async (ctx) => [{ type: "compute-running", at: new Date(clock).toISOString(), evidenceObservedAt: new Date(clock).toISOString(), source: "provider", runRef: { ...ctx.runRef }, providerEventId: `running:${ctx.idempotencyKeyHash}`, detail: "running" }],
    resume: async () => [],
    cancel: async () => [],
    release: async () => [],
  };

  let durable = null;
  let persistCalls = 0;
  const firstIo = {
    getAdapter: (id) => id === adapter.id ? adapter : null,
    listAdapterIds: () => [adapter.id],
    envPresent: () => true,
    now: () => { clock += 1000; return clock; },
    sleep: async () => {},
    maxPolls: 1,
    pollIntervalMs: 0,
    persistCompute: async (value) => {
      persistCalls += 1;
      if (persistCalls === 1) { durable = value; return; }
      throw new Error("injected process loss after provider accepted allocation but before allocation journal commit");
    },
  };
  const args = {
    workspaceConfig: providerConfig(),
    trainingRunId: "crash-window-run",
    computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "crash-safe", selectionMode: "explicit", policy: { mode: "cloud", excludeLocal: true, budget: { mode: "advisory", maxTotalUsd: 0, maxHourlyUsd: 0, allowUnknownCost: false } } },
    requirements: REQUIREMENTS,
  };
  await assert.rejects(() => executeProviderComputeRun({ ...args, priorCompute: null, io: firstIo }), /injected process loss/);
  assert.equal(providerCreates, 1);
  assert.ok(durable && !durable.allocation, "only the pre-allocation intent survived the injected crash");

  const secondIo = {
    ...firstIo,
    persistCompute: async (value) => { durable = value; },
  };
  const recovered = await executeProviderComputeRun({ ...args, priorCompute: durable, io: secondIo });
  assert.equal(providerCreates, 1, "recovery adopted the provider resource keyed by the original durable idempotency identity");
  assert.ok(recovered.computeBlock.allocation?.allocationId);
  assert.equal(recovered.result.adapterMeta.compute.pending, true);
});
