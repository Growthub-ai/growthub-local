/**
 * Governed Compute Realization — Runpod adapter conformance (Sprint 6).
 *
 * Verifies the adapter against the CURRENT official Runpod surfaces (REST v1
 * pods, GraphQL price/stock, api.runpod.ai v2 serverless jobs) with a fully
 * faked transport — no network. Adversarial coverage: missing credential,
 * price query failure (unknown cost stays unknown), out-of-stock, duplicate
 * allocation reconciled via the deterministic pod name, terminate failure
 * kept visible, TIMED_OUT jobs, honest capability boundaries (no multi-node,
 * checkpointing only with a network volume).
 *
 * Run with: node --test scripts/unit-compute-runpod.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  default: runpodAdapter,
  RUNPOD_ADAPTER_ID,
  runpodGpuCandidates,
  mapRunpodJobStatus,
} = await import(lib("adapters/compute/runpod-compute.js"));
const { getComputeProviderAdapter } = await import(lib("adapters/compute/compute-adapter-registry.js"));
const { executeProviderComputeRun } = await import(lib("compute-execution.js"));

const RUN_REF = { trainingRunId: "trainrun_rp", modelTrainingRowId: "workspace-local", providerId: "runpod-burst", capacityProfileId: "single-gpu-finetune", providerResourceId: "" };
const REQ = { workloadKind: "fine-tune", acceleratorClass: "any-gpu", gpuCount: 1, minVramPerGpuGB: 24, minCpuCores: 4, minRamGB: 16, minDiskGB: 60, checkpointRequired: true, distributed: null, locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 120 };

/** Scripted transport: matchers list of [pattern, handler]. Records calls. */
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

function ctxWith({ fetchJson, config = {}, resourceId = "", requirements = REQ, idempotencyKeyHash = "cafebabe12345678" }) {
  return {
    runRef: { ...RUN_REF, providerResourceId: resourceId },
    requirements,
    capacityProfileId: "single-gpu-finetune",
    idempotencyKeyHash,
    providerConfig: { providerId: "runpod-burst", imageName: "ghcr.io/growthub/train:latest", ...config },
    resolveEnv: (name) => (name === "RUNPOD_API_KEY" ? "test-key-value" : ""),
    fetchJson,
  };
}

const GRAPHQL_OK = {
  reply: {
    data: {
      gpuTypes: [
        { id: "NVIDIA GeForce RTX 4090", memoryInGb: 24, lowestPrice: { uninterruptablePrice: 0.69, minimumBidPrice: 0.35, stockStatus: "High" } },
        { id: "NVIDIA RTX A5000", memoryInGb: 24, lowestPrice: { uninterruptablePrice: 0.36, minimumBidPrice: 0.2, stockStatus: "Low" } },
      ],
    },
  },
};

// ---------------------------------------------------------------------------

test("adapter registers and declares HONEST capabilities", () => {
  assert.equal(getComputeProviderAdapter(RUNPOD_ADAPTER_ID), runpodAdapter);
  const noVolume = runpodAdapter.describeCapabilities({ providerId: "runpod-burst" });
  assert.equal(noVolume.maxWorkers, 1, "no public cluster API → never claims multi-node");
  assert.equal(noVolume.supportsGangScheduling, false);
  assert.equal(noVolume.supportsCheckpointing, false, "no network volume → container disk is wiped → no checkpoint claim");
  assert.deepEqual(noVolume.requiredEnv, ["RUNPOD_API_KEY"]);
  assert.ok(!noVolume.capacityProfiles.includes("distributed-training"));

  const withVolume = runpodAdapter.describeCapabilities({ providerId: "runpod-burst", networkVolumeId: "vol-1" });
  assert.equal(withVolume.supportsCheckpointing, true);
  assert.equal(withVolume.supportsResume, true);
});

test("GPU ladder maps VRAM floors to the smallest sufficient class; config overrides", () => {
  assert.ok(runpodGpuCandidates({ requirements: { minVramPerGpuGB: 24 }, config: {} })[0].includes("4090"));
  assert.ok(runpodGpuCandidates({ requirements: { minVramPerGpuGB: 80 }, config: {} })[0].includes("H100"));
  assert.ok(runpodGpuCandidates({ requirements: { minVramPerGpuGB: 141 }, config: {} })[0].includes("H200"));
  assert.deepEqual(runpodGpuCandidates({ requirements: { minVramPerGpuGB: 24 }, config: { gpuTypeIds: ["NVIDIA L40S"] } }), ["NVIDIA L40S"]);
});

test("quote: in-stock GraphQL price → per-hour basis, cheapest candidate, known total only with known duration", async () => {
  const fetchJson = fakeFetch([["graphql", GRAPHQL_OK]]);
  const quote = await runpodAdapter.inspectCapacity(ctxWith({ fetchJson }));
  assert.equal(quote.available, true);
  assert.equal(quote.costBasis.kind, "per-hour");
  assert.equal(quote.costBasis.unitUsd, 0.36, "cheapest in-stock candidate wins");
  assert.equal(quote.estimatedTotalUsd, 0.72, "2h × $0.36");
  assert.ok(quote.quoteExpiresAt > quote.quoteObservedAt);

  const noDuration = await runpodAdapter.inspectCapacity(ctxWith({ fetchJson, requirements: { ...REQ, estimatedDurationMinutes: 0 } }));
  assert.equal(noDuration.estimatedTotalUsd, null, "unknown duration → unknown total, never zero");
});

test("quote adversarial: out-of-stock and price-query failure stay honestly unknown/unavailable", async () => {
  const outOfStock = await runpodAdapter.inspectCapacity(ctxWith({
    fetchJson: fakeFetch([["graphql", { reply: { data: { gpuTypes: [{ id: "NVIDIA GeForce RTX 4090", lowestPrice: { uninterruptablePrice: 0.69, stockStatus: "None" } }] } } }]]),
  }));
  assert.equal(outOfStock.available, false);

  const broken = await runpodAdapter.inspectCapacity(ctxWith({ fetchJson: fakeFetch([["graphql", { throws: "HTTP 429: rate limited" }]]) }));
  assert.equal(broken.available, false);
  assert.equal(broken.costBasis.kind, "unknown");
  assert.equal(broken.estimatedTotalUsd, null);
});

test("missing credential throws the env NAME, never a value", async () => {
  const ctx = ctxWith({ fetchJson: fakeFetch([]) });
  ctx.resolveEnv = () => "";
  await assert.rejects(() => runpodAdapter.inspectCapacity(ctx), /RUNPOD_API_KEY/);
  await assert.rejects(() => runpodAdapter.allocate(ctx), /RUNPOD_API_KEY/);
});

test("pod allocation embeds the governed identity, carries no secret, and reconciles duplicates by name", async () => {
  const created = [];
  const fetchJson = fakeFetch([
    ["/pods?name=", { reply: [] }],
    ["/pods", { method: "POST", reply: (url, init) => { created.push(JSON.parse(init.body)); return { id: "pod-abc", costPerHr: 0.44, machine: { gpuType: { id: "NVIDIA RTX A5000" }, dataCenterId: "EU-RO-1" } }; } }],
  ]);
  const allocation = await runpodAdapter.allocate(ctxWith({ fetchJson }));
  assert.equal(allocation.status, "allocated");
  assert.equal(allocation.allocationId, "pod-abc");
  assert.equal(allocation.runRef.providerResourceId, "pod-abc");
  assert.equal(created[0].name, "ghl-cafebabe12345678");
  assert.equal(created[0].env.GROWTHUB_IDEMPOTENCY_HASH, "cafebabe12345678");
  assert.ok(!JSON.stringify(created[0]).includes("test-key-value"), "the API key value never enters a request BODY");

  // Replay: the same governed identity finds the live pod and adopts it.
  const fetchJson2 = fakeFetch([
    ["/pods?name=", { reply: [{ id: "pod-abc", name: "ghl-cafebabe12345678", desiredStatus: "RUNNING", costPerHr: 0.44, gpuCount: 1 }] }],
    ["/pods", { method: "POST", reply: () => { throw new Error("MUST NOT create a second pod"); } }],
  ]);
  const adopted = await runpodAdapter.allocate(ctxWith({ fetchJson: fetchJson2 }));
  assert.equal(adopted.allocationId, "pod-abc");
  assert.equal(adopted.reconciled, true);
  assert.equal(fetchJson2.calls.filter((c) => c.method === "POST").length, 0, "no duplicate pod creation");
});

test("pods without an image/template fail closed; serverless without endpointId fails closed", async () => {
  const noImage = await runpodAdapter.allocate(ctxWith({ fetchJson: fakeFetch([["/pods?name=", { reply: [] }]]), config: { imageName: "" } }));
  assert.equal(noImage.status, "failed");
  assert.match(noImage.error, /imageName|templateId/);

  const noEndpoint = await runpodAdapter.allocate(ctxWith({ fetchJson: fakeFetch([]), config: { mode: "serverless" } }));
  assert.equal(noEndpoint.status, "failed");
  assert.match(noEndpoint.error, /endpointId/);
});

test("pod status maps desiredStatus honestly (EXITED is a claim, not proof)", async () => {
  const mk = (desiredStatus) => fakeFetch([["/pods/pod-abc", { reply: { id: "pod-abc", desiredStatus, lastStatusChange: "x", machine: { gpuType: { id: "NVIDIA RTX A5000" } } } }]]);
  const running = await runpodAdapter.status(ctxWith({ fetchJson: mk("RUNNING"), resourceId: "pod-abc" }));
  assert.equal(running[0].type, "compute-running");
  const exited = await runpodAdapter.status(ctxWith({ fetchJson: mk("EXITED"), resourceId: "pod-abc" }));
  assert.equal(exited[0].type, "compute-completed");
  assert.match(exited[0].detail, /claim, not proof/);
  const terminated = await runpodAdapter.status(ctxWith({ fetchJson: mk("TERMINATED"), resourceId: "pod-abc" }));
  assert.equal(terminated[0].type, "compute-released");
});

test("serverless job lifecycle: submit, states (incl. TIMED_OUT → failed), cancel, artifact from output", async () => {
  assert.equal(mapRunpodJobStatus("IN_QUEUE"), "compute-queued");
  assert.equal(mapRunpodJobStatus("IN_PROGRESS"), "compute-running");
  assert.equal(mapRunpodJobStatus("COMPLETED"), "compute-completed");
  assert.equal(mapRunpodJobStatus("TIMED_OUT"), "compute-failed");
  assert.equal(mapRunpodJobStatus("CANCELLED"), "compute-cancelled");
  assert.equal(mapRunpodJobStatus("banana"), "");

  const config = { mode: "serverless", endpointId: "ep-1" };
  const submitted = await runpodAdapter.allocate(ctxWith({ config, fetchJson: fakeFetch([["/ep-1/run", { method: "POST", reply: { id: "job-9", status: "IN_QUEUE" } }]]) }));
  assert.equal(submitted.status, "allocated");
  assert.equal(submitted.runRef.providerResourceId, "job-9");

  const artifact = await runpodAdapter.collectArtifact(ctxWith({
    config,
    resourceId: "job-9",
    fetchJson: fakeFetch([["/ep-1/status/job-9", { reply: { id: "job-9", status: "COMPLETED", output: { artifact: { locator: "s3://ckpt/model.gguf", sha256: "c".repeat(64), sizeBytes: 123, kind: "gguf" } } } }]]),
  }));
  assert.equal(artifact.locator, "s3://ckpt/model.gguf");
  assert.equal(artifact.sha256, "c".repeat(64));

  const noArtifact = await runpodAdapter.collectArtifact(ctxWith({
    config,
    resourceId: "job-9",
    fetchJson: fakeFetch([["/ep-1/status/job-9", { reply: { id: "job-9", status: "COMPLETED", output: { note: "no artifact reported" } } }]]),
  }));
  assert.equal(noArtifact, null, "a completed job without a reported artifact yields NO artifact ref");
});

test("release: terminate success vs FAILED terminate stays visible with billing warning", async () => {
  const ok = await runpodAdapter.release(ctxWith({ resourceId: "pod-abc", fetchJson: fakeFetch([["/pods/pod-abc", { method: "DELETE", reply: null }]]) }));
  assert.equal(ok[0].type, "compute-released");

  const failed = await runpodAdapter.release(ctxWith({ resourceId: "pod-abc", fetchJson: fakeFetch([["/pods/pod-abc", { method: "DELETE", throws: "HTTP 500: internal" }]]) }));
  assert.equal(failed[0].type, "compute-release-failed");
  assert.match(failed[0].detail, /may still exist and continue billing/);
});

// ---------------------------------------------------------------------------
// End-to-end conformance through the governed orchestrator
// ---------------------------------------------------------------------------

test("CONFORMANCE — full governed lifecycle over the Runpod adapter (faked transport)", async () => {
  let statusCalls = 0;
  const fetchJson = fakeFetch([
    ["graphql", GRAPHQL_OK],
    ["/pods?name=", { reply: [] }],
    ["/pods/pod-e2e", {
      reply: () => {
        statusCalls += 1;
        return { id: "pod-e2e", desiredStatus: statusCalls < 2 ? "RUNNING" : "EXITED", lastStatusChange: `t${statusCalls}` };
      },
    }],
    ["/pods", { method: "POST", reply: { id: "pod-e2e", costPerHr: 0.36 } }],
  ]);
  // DELETE /pods/pod-e2e matches the same "/pods/pod-e2e" route (reply fn) — fine: 200-ish.

  const workspaceConfig = {
    dataModel: {
      objects: [{
        id: "api-registry",
        objectType: "api-registry",
        rows: [{
          integrationId: "runpod-burst",
          Name: "Runpod burst",
          metadata: {
            computeProvider: {
              schema: "growthub-compute-provider-v1",
              adapterId: RUNPOD_ADAPTER_ID,
              capacityProfiles: ["burst-gpu", "single-gpu-finetune"],
              availabilityModes: ["on-demand"],
              requiredEnv: ["RUNPOD_API_KEY"],
              executionLane: "sandbox-local",
              config: { imageName: "ghcr.io/growthub/train:latest", networkVolumeId: "vol-test" },
            },
          },
        }],
      }],
    },
  };
  let clock = Date.parse("2026-07-20T12:00:00.000Z");
  const outcome = await executeProviderComputeRun({
    workspaceConfig,
    trainingRunId: "trainrun_rp_e2e",
    computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "runpod-burst", selectionMode: "explicit" },
    requirements: { ...REQ, checkpointRequired: false },
    io: {
      getAdapter: (id) => (id === RUNPOD_ADAPTER_ID ? runpodAdapter : null),
      listAdapterIds: () => [RUNPOD_ADAPTER_ID],
      envPresent: (name) => name === "RUNPOD_API_KEY",
      resolveEnv: (name) => (name === "RUNPOD_API_KEY" ? "test-key-value" : ""),
      fetchJson,
      now: () => { clock += 1000; return clock; },
      sleep: async () => {},
      maxPolls: 6,
      pollIntervalMs: 0,
      verifyArtifact: async (artifact) => ({ verifiedSha256: artifact.sha256, verificationKind: "test-materialized" }),
    },
  });
  assert.equal(outcome.computeBlock.decision.selectedProviderId, "runpod-burst");
  assert.equal(outcome.computeBlock.allocation.allocationId, "pod-e2e");
  const types = outcome.computeBlock.events.map((e) => e.type);
  assert.ok(types.includes("compute-allocated"));
  assert.ok(types.includes("compute-running"));
  assert.ok(types.includes("compute-completed"));
  // Pods report no artifact through the API → completion is NON-promotable.
  assert.equal(outcome.result.ok, false);
  assert.equal(outcome.result.adapterMeta.compute.promotable, false);
  assert.match(outcome.result.error, /no artifact/);
  // The full evidence trail is secret-free.
  assert.ok(!JSON.stringify(outcome.computeBlock).includes("test-key-value"));
});
