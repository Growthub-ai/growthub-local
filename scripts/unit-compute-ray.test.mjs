/**
 * Governed Compute Realization — portable Ray backend + HyperPod/CoreWeave
 * realizations (Sprints 8–9).
 *
 * Proves against the current Ray Jobs REST contract (submit with trailing
 * slash + client-supplied at-most-once submission_id; PENDING/RUNNING/
 * STOPPED/SUCCEEDED/FAILED): portable-plan compilation, provider-native
 * idempotent adoption, GH_CHECKPOINT/GH_ARTIFACT driver evidence parsing,
 * honest attestation-gated capabilities, cost honesty, release honesty, and
 * PORTABILITY — the same distributed plan compiles identically across the
 * HyperPod and CoreWeave realizations.
 *
 * Run with: node --test scripts/unit-compute-ray.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  rayAdapter,
  hyperpodAdapter,
  coreweaveAdapter,
  buildRayJobSubmission,
  parseRayDriverEvidence,
  RAY_JOB_STATUS_MAP,
  RAY_ADAPTER_ID,
  HYPERPOD_ADAPTER_ID,
  COREWEAVE_ADAPTER_ID,
} = await import(lib("adapters/compute/ray-cluster-compute.js"));
const { getComputeProviderAdapter } = await import(lib("adapters/compute/compute-adapter-registry.js"));
const { executeProviderComputeRun } = await import(lib("compute-execution.js"));

const DASH = "http://ray-head.internal:8265";
const DIST_REQ = {
  workloadKind: "training",
  acceleratorClass: "high-memory-gpu",
  gpuCount: 8,
  minVramPerGpuGB: 80,
  minCpuCores: 16,
  minRamGB: 128,
  minDiskGB: 500,
  checkpointRequired: true,
  distributed: { workers: 4, gpusPerWorker: 8, gangScheduling: true, highBandwidthInterconnect: true },
  locality: { regions: [], dataResidency: "" },
  estimatedDurationMinutes: 480,
};

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
    for (const [pattern, handler] of routes) {
      if (url.includes(pattern) && (!handler.method || handler.method === (init.method || "GET"))) {
        if (handler.throws) throw new Error(handler.throws);
        return typeof handler.reply === "function" ? handler.reply(url, init) : handler.reply;
      }
    }
    throw new Error(`unmatched fake route: ${init.method || "GET"} ${url}`);
  };
  fn.calls = calls;
  return fn;
}

function ctxWith({ fetchJson, config = {}, resourceId = "", requirements = DIST_REQ, hash = "deadbeef00112233" }) {
  return {
    runRef: { trainingRunId: "trainrun_ray", modelTrainingRowId: "workspace-local", providerId: config.providerId || "ray-main", capacityProfileId: "distributed-training", providerResourceId: resourceId },
    requirements,
    capacityProfileId: "distributed-training",
    idempotencyKeyHash: hash,
    providerConfig: { providerId: "ray-main", dashboardUrl: DASH, maxWorkers: 8, storagePath: "s3://growthub-ckpt/runs", corpusRootHash: "corpus-hash-1", workspaceId: "ws-1", ...config },
    resolveEnv: (name) => (name === "RAY_AUTH_TOKEN" ? "ray-token-value" : ""),
    fetchJson,
  };
}

// ---------------------------------------------------------------------------

test("all three Ray-backed adapters register", () => {
  assert.equal(getComputeProviderAdapter(RAY_ADAPTER_ID), rayAdapter);
  assert.equal(getComputeProviderAdapter(HYPERPOD_ADAPTER_ID), hyperpodAdapter);
  assert.equal(getComputeProviderAdapter(COREWEAVE_ADAPTER_ID), coreweaveAdapter);
});

test("capabilities are attestation-gated: workers, checkpointing, gang, auth env", () => {
  const single = rayAdapter.describeCapabilities({ dashboardUrl: DASH });
  assert.equal(single.maxWorkers, 1);
  assert.ok(!single.capacityProfiles.includes("distributed-training"), "one declared worker is not a cluster");
  assert.equal(single.supportsCheckpointing, false, "no shared storage path → no checkpoint claim (Ray Train rejects local paths multi-node)");
  assert.deepEqual(single.requiredEnv, [], "tokenless clusters (network-isolated) require no env");

  const cluster = rayAdapter.describeCapabilities({ dashboardUrl: DASH, maxWorkers: 16, storagePath: "s3://b/ck", gangScheduling: true, authTokenEnv: "RAY_AUTH_TOKEN" });
  assert.equal(cluster.maxWorkers, 16);
  assert.ok(cluster.capacityProfiles.includes("distributed-training"));
  assert.equal(cluster.supportsCheckpointing, true);
  assert.equal(cluster.supportsGangScheduling, true);
  assert.deepEqual(cluster.requiredEnv, ["RAY_AUTH_TOKEN"]);

  // Realization defaults: CoreWeave = Kueue gang admission by default;
  // HyperPod = EFA-class interconnect; NEITHER assumes cluster size.
  assert.equal(coreweaveAdapter.describeCapabilities({ dashboardUrl: DASH }).supportsGangScheduling, true);
  assert.equal(hyperpodAdapter.describeCapabilities({ dashboardUrl: DASH }).maxWorkers, 1);
});

test("PORTABILITY — the same distributed plan submits the identical Ray job body on every realization", async () => {
  const submitBodies = [];
  const mkFetch = () => fakeFetch([["/api/jobs/", { method: "POST", reply: (url, init) => { submitBodies.push(JSON.parse(init.body)); return { submission_id: JSON.parse(init.body).submission_id }; } }]]);
  for (const adapter of [rayAdapter, hyperpodAdapter, coreweaveAdapter]) {
    const allocation = await adapter.allocate(ctxWith({ fetchJson: mkFetch() }));
    assert.equal(allocation.status, "allocated", `${adapter.id} allocates the same plan`);
  }
  assert.equal(submitBodies.length, 3);
  assert.deepEqual(submitBodies[1], submitBodies[0], "HyperPod realization does not alter the portable plan compilation");
  assert.deepEqual(submitBodies[2], submitBodies[0], "CoreWeave realization does not alter the portable plan compilation");
  // The compiled submission carries the portable shape + stable identity:
  const base = submitBodies[0];
  assert.equal(base.submission_id, "ghl-deadbeef00112233");
  assert.equal(base.runtime_env.env_vars.GROWTHUB_NUM_WORKERS, "4");
  assert.equal(base.runtime_env.env_vars.GROWTHUB_GPUS_PER_WORKER, "8");
  assert.equal(base.runtime_env.env_vars.GROWTHUB_STORAGE_PATH, "s3://growthub-ckpt/runs");
  assert.equal(base.metadata.growthubTrainingRunId, "trainrun_ray");
  assert.equal(base.metadata.growthubCorpusRootHash, "corpus-hash-1");
  assert.ok(!JSON.stringify(base).includes("ray-token-value"), "no secret in the submission");
  // buildRayJobSubmission is the ONE shared compiler behind all three.
  assert.equal(typeof buildRayJobSubmission, "function");
});

test("submit uses POST /api/jobs/ (trailing slash) with Bearer auth when attested", async () => {
  const fetchJson = fakeFetch([["/api/jobs/", { method: "POST", reply: { submission_id: "ghl-deadbeef00112233" } }]]);
  const allocation = await rayAdapter.allocate(ctxWith({ fetchJson, config: { authTokenEnv: "RAY_AUTH_TOKEN" } }));
  assert.equal(allocation.status, "allocated");
  const call = fetchJson.calls[0];
  assert.ok(call.url.endsWith("/api/jobs/"), "the Jobs API requires the trailing slash");
  assert.equal(call.headers.Authorization, "Bearer ray-token-value");
});

test("provider-native idempotency: 'already exists' adopts the existing submission, never duplicates", async () => {
  const fetchJson = fakeFetch([
    ["/api/jobs/ghl-deadbeef00112233", { reply: { submission_id: "ghl-deadbeef00112233", status: "RUNNING" } }],
    ["/api/jobs/", { method: "POST", throws: "HTTP 400: Job with submission_id ghl-deadbeef00112233 already exists" }],
  ]);
  const allocation = await rayAdapter.allocate(ctxWith({ fetchJson }));
  assert.equal(allocation.status, "allocated");
  assert.equal(allocation.reconciled, true);
  assert.equal(allocation.allocationId, "ghl-deadbeef00112233");
});

test("a plan exceeding the declared cluster size fails closed at the adapter too", async () => {
  const allocation = await rayAdapter.allocate(ctxWith({ fetchJson: fakeFetch([]), config: { maxWorkers: 2 } }));
  assert.equal(allocation.status, "failed");
  assert.match(allocation.error, /needs 4 workers.*declares 2/);
});

test("status maps the five Ray job states; checkpoint evidence parsed from bounded GH_CHECKPOINT lines", async () => {
  assert.deepEqual(RAY_JOB_STATUS_MAP, { PENDING: "compute-queued", RUNNING: "compute-running", SUCCEEDED: "compute-completed", FAILED: "compute-failed", STOPPED: "compute-cancelled" });
  const logs = [
    "training step 100",
    `GH_CHECKPOINT ${JSON.stringify({ checkpointId: "ck-100", locator: "s3://growthub-ckpt/runs/ck-100", sha256: "f".repeat(64), step: 100 })}`,
    "GH_CHECKPOINT {malformed json",
    "training step 200",
  ].join("\n");
  const fetchJson = fakeFetch([
    ["/logs", { reply: { logs } }],
    ["/api/jobs/job-1", { reply: { submission_id: "job-1", status: "RUNNING" } }],
  ]);
  const events = await rayAdapter.status(ctxWith({ fetchJson, resourceId: "job-1" }));
  const checkpointEvents = events.filter((e) => e.type === "checkpoint-created");
  assert.equal(checkpointEvents.length, 1, "malformed evidence lines are dropped, not guessed");
  assert.equal(checkpointEvents[0].checkpoint.checkpointId, "ck-100");
  assert.equal(events.at(-1).type, "compute-running");

  const failed = await rayAdapter.status(ctxWith({ resourceId: "job-1", fetchJson: fakeFetch([["/api/jobs/job-1", { reply: { status: "FAILED", message: "worker OOM" } }]]) }));
  assert.match(failed[0].detail, /worker OOM/);
});

test("driver evidence parser is bounded and honest", () => {
  const artifactLine = `GH_ARTIFACT ${JSON.stringify({ locator: "s3://out/model.gguf", sha256: "a".repeat(64), sizeBytes: 5, kind: "gguf" })}`;
  const giant = `${"x".repeat(300 * 1024)}\n${artifactLine}`;
  const { artifact } = parseRayDriverEvidence(giant);
  assert.equal(artifact.locator, "s3://out/model.gguf", "evidence within the bounded tail is found");
  const outside = `${artifactLine}\n${"x".repeat(300 * 1024)}`;
  assert.equal(parseRayDriverEvidence(outside).artifact, null, "evidence outside the bounded tail is not invented");
  assert.equal(parseRayDriverEvidence("").artifact, null);
});

test("cost honesty: owned → $0 truth; declared rate → per-hour; neither → unknown (never zero)", async () => {
  const probe = fakeFetch([["/api/version", { reply: { version: "2.56.0" } }]]);
  const owned = await rayAdapter.inspectCapacity(ctxWith({ fetchJson: probe, config: { owned: true } }));
  assert.equal(owned.costBasis.kind, "owned-hardware");
  assert.equal(owned.estimatedTotalUsd, 0);
  const rated = await rayAdapter.inspectCapacity(ctxWith({ fetchJson: fakeFetch([["/api/version", { reply: {} }]]), config: { clusterHourlyUsd: 32 } }));
  assert.equal(rated.costBasis.kind, "per-hour");
  assert.equal(rated.estimatedTotalUsd, 256, "8h × $32");
  const undeclared = await rayAdapter.inspectCapacity(ctxWith({ fetchJson: fakeFetch([["/api/version", { reply: {} }]]) }));
  assert.equal(undeclared.costBasis.kind, "unknown");
  assert.equal(undeclared.estimatedTotalUsd, null);
  const unreachable = await rayAdapter.inspectCapacity(ctxWith({ fetchJson: fakeFetch([["/api/version", { throws: "HTTP 503" }]]) }));
  assert.equal(unreachable.available, false);
});

test("release honesty: terminal job → released with external-cluster-authority note; unreachable → release-failed", async () => {
  const done = await rayAdapter.release(ctxWith({ resourceId: "job-1", fetchJson: fakeFetch([["/api/jobs/job-1", { reply: { status: "SUCCEEDED" } }]]) }));
  assert.equal(done[0].type, "compute-released");
  assert.match(done[0].detail, /externally managed/);
  const broken = await rayAdapter.release(ctxWith({ resourceId: "job-1", fetchJson: fakeFetch([["/api/jobs/job-1", { throws: "HTTP 502" }]]) }));
  assert.equal(broken[0].type, "compute-release-failed");
  assert.match(broken[0].detail, /may still hold cluster resources/);
});

// ---------------------------------------------------------------------------
// End-to-end distributed conformance through the governed orchestrator
// ---------------------------------------------------------------------------

test("CONFORMANCE — distributed lifecycle over the CoreWeave realization: queued → running + checkpoint → succeeded → artifact → released", async () => {
  let statusCalls = 0;
  const artifactLine = `GH_ARTIFACT ${JSON.stringify({ locator: "s3://growthub-ckpt/runs/final/model.gguf", sha256: "9".repeat(64), sizeBytes: 7, kind: "gguf" })}`;
  const checkpointLine = `GH_CHECKPOINT ${JSON.stringify({ checkpointId: "ck-500", locator: "s3://growthub-ckpt/runs/ck-500", sha256: "8".repeat(64), step: 500 })}`;
  const fetchJson = fakeFetch([
    ["/api/version", { reply: { version: "2.56.0" } }],
    ["/logs", { reply: { logs: `${checkpointLine}\n${artifactLine}` } }],
    ["/api/jobs/ghl-", { reply: () => { statusCalls += 1; return { status: statusCalls === 1 ? "PENDING" : statusCalls === 2 ? "RUNNING" : "SUCCEEDED" }; } }],
    ["/api/jobs/", { method: "POST", reply: (url, init) => ({ submission_id: JSON.parse(init.body).submission_id }) }],
  ]);
  const workspaceConfig = {
    dataModel: {
      objects: [{
        id: "api-registry",
        objectType: "api-registry",
        rows: [{
          integrationId: "coreweave-cluster",
          Name: "CoreWeave training cluster",
          metadata: {
            computeProvider: {
              schema: "growthub-compute-provider-v1",
              adapterId: COREWEAVE_ADAPTER_ID,
              capacityProfiles: ["distributed-training", "multi-gpu-finetune"],
              availabilityModes: ["reserved"],
              requiredEnv: [],
              executionLane: "sandbox-local",
              config: { dashboardUrl: DASH, maxWorkers: 8, storagePath: "s3://growthub-ckpt/runs", clusterHourlyUsd: 32, maxVramPerGpuGB: 141, gpusPerWorkerMax: 8 },
            },
          },
        }],
      }],
    },
  };
  let clock = Date.parse("2026-07-20T12:00:00.000Z");
  const outcome = await executeProviderComputeRun({
    workspaceConfig,
    trainingRunId: "trainrun_cw_e2e",
    computeAsk: { capacityProfileId: "distributed-training", providerRegistryId: "coreweave-cluster", selectionMode: "explicit" },
    requirements: DIST_REQ,
    budget: { mode: "hard-cap", maxTotalUsd: 500, maxHourlyUsd: 0, allowUnknownCost: false },
    io: {
      getAdapter: (id) => (id === COREWEAVE_ADAPTER_ID ? coreweaveAdapter : null),
      listAdapterIds: () => [COREWEAVE_ADAPTER_ID],
      envPresent: () => true,
      resolveEnv: () => "",
      fetchJson,
      now: () => { clock += 1000; return clock; },
      sleep: async () => {},
      maxPolls: 8,
      pollIntervalMs: 0,
    },
  });
  assert.equal(outcome.result.ok, true, outcome.result.error || "distributed run should complete promotably");
  const types = outcome.computeBlock.events.map((e) => e.type);
  assert.ok(types.includes("compute-queued"));
  assert.ok(types.includes("compute-running"));
  assert.ok(types.includes("checkpoint-created"));
  assert.ok(types.includes("compute-completed"));
  assert.ok(types.includes("compute-released"));
  assert.equal(outcome.computeBlock.artifact.sha256, "9".repeat(64));
  assert.equal(outcome.result.adapterMeta.compute.promotable, true);
  // Budget was honored: $32/h × 8h = $256 ≤ $500 hard cap.
  const verdict = outcome.computeBlock.decision.candidates.find((c) => c.providerId === "coreweave-cluster");
  assert.equal(verdict.eligible, true);
});
