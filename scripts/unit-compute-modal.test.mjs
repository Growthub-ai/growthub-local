/**
 * Governed Compute Realization — Modal adapter conformance (Sprint 7).
 *
 * Modal has no public REST control plane; the adapter drives a pre-deployed
 * proxy-authed execution function (submit/status/cancel/health) with plain
 * fetch and Modal-Key/Modal-Secret proxy-token headers. Same conformance
 * grammar as the Runpod suite: honest capabilities (clustered/warm/volume
 * claims only when the row attests them), proven availability (health probe,
 * never assumed), static-catalog pricing labeled as such, artifact honesty,
 * release honesty on scale-to-zero.
 *
 * Run with: node --test scripts/unit-compute-modal.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const { default: modalAdapter, MODAL_ADAPTER_ID, modalGpuFor, mapModalCallStatus, MODAL_GPU_CATALOG } = await import(lib("adapters/compute/modal-compute.js"));
const { getComputeProviderAdapter } = await import(lib("adapters/compute/compute-adapter-registry.js"));
const { executeProviderComputeRun } = await import(lib("compute-execution.js"));

const BASE = "https://acme--growthub-exec.modal.run";
const REQ = { workloadKind: "fine-tune", acceleratorClass: "datacenter-gpu", gpuCount: 1, minVramPerGpuGB: 80, minCpuCores: 4, minRamGB: 16, minDiskGB: 60, checkpointRequired: false, distributed: null, locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 60 };

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

function ctxWith({ fetchJson, config = {}, resourceId = "", requirements = REQ }) {
  return {
    runRef: { trainingRunId: "trainrun_modal", modelTrainingRowId: "workspace-local", providerId: "modal-burst", capacityProfileId: "single-gpu-finetune", providerResourceId: resourceId },
    requirements,
    capacityProfileId: "single-gpu-finetune",
    idempotencyKeyHash: "feedface87654321",
    providerConfig: { providerId: "modal-burst", baseUrl: BASE, ...config },
    resolveEnv: (name) => (name === "MODAL_KEY" ? "wk-testid" : name === "MODAL_SECRET" ? "ws-testsecret" : ""),
    fetchJson,
  };
}

// ---------------------------------------------------------------------------

test("adapter registers; capabilities are attestation-gated and honest", () => {
  assert.equal(getComputeProviderAdapter(MODAL_ADAPTER_ID), modalAdapter);
  const plain = modalAdapter.describeCapabilities({ providerId: "modal-burst", baseUrl: BASE });
  assert.equal(plain.maxWorkers, 1, "no clustered attestation → single worker");
  assert.equal(plain.supportsGangScheduling, false);
  assert.equal(plain.supportsCheckpointing, false, "no volume attestation → no checkpoint claim");
  assert.ok(!plain.capacityProfiles.includes("distributed-training"));
  assert.ok(!plain.capacityProfiles.includes("warm-inference"));
  assert.deepEqual(plain.requiredEnv, ["MODAL_KEY", "MODAL_SECRET"]);

  const attested = modalAdapter.describeCapabilities({ providerId: "modal-burst", baseUrl: BASE, clusterWorkers: 4, volumeConfigured: true, warmContainers: 2 });
  assert.equal(attested.maxWorkers, 4);
  assert.equal(attested.supportsGangScheduling, true, "clustered start is all-or-nothing = gang");
  assert.equal(attested.supportsCheckpointing, true);
  assert.ok(attested.capacityProfiles.includes("distributed-training"));
  assert.ok(attested.capacityProfiles.includes("warm-inference"));
  assert.ok(attested.availabilityModes.includes("warm"));
});

test("GPU catalog selection: cheapest satisfying the VRAM floor; pinned type honored when sufficient", () => {
  assert.equal(modalGpuFor({ requirements: { minVramPerGpuGB: 80 }, config: {} }).gpu, "A100-80GB", "cheapest 80GB class");
  assert.equal(modalGpuFor({ requirements: { minVramPerGpuGB: 80 }, config: { gpuType: "H100" } }).gpu, "H100", "pin honored");
  assert.equal(modalGpuFor({ requirements: { minVramPerGpuGB: 141 }, config: { gpuType: "T4" } }).gpu, "H200", "insufficient pin falls to the cheapest sufficient class");
  assert.equal(modalGpuFor({ requirements: { minVramPerGpuGB: 500 }, config: {} }), null, "no catalog GPU → null, never a guess");
  assert.equal(MODAL_GPU_CATALOG.at(-1).gpu, "B200");
});

test("availability is PROVEN by the health probe — unreachable endpoint quotes unavailable", async () => {
  const up = await modalAdapter.inspectCapacity(ctxWith({ fetchJson: fakeFetch([["/health", { reply: { ok: true } }]]) }));
  assert.equal(up.available, true);
  assert.equal(up.costBasis.kind, "per-hour");
  assert.match(up.costBasis.source, /static-catalog/);
  assert.equal(up.estimatedTotalUsd, 2.5, "1h × $2.50 A100-80GB");

  const down = await modalAdapter.inspectCapacity(ctxWith({ fetchJson: fakeFetch([["/health", { throws: "HTTP 502: bad gateway" }]]) }));
  assert.equal(down.available, false, "an unreachable function is not available capacity");

  const unconfigured = await modalAdapter.inspectCapacity(ctxWith({ fetchJson: fakeFetch([]), config: { baseUrl: "" } }));
  assert.equal(unconfigured.available, false);
});

test("missing proxy tokens throw env NAMES, never values", async () => {
  const ctx = ctxWith({ fetchJson: fakeFetch([]) });
  ctx.resolveEnv = () => "";
  await assert.rejects(() => modalAdapter.allocate(ctx), /MODAL_KEY.*MODAL_SECRET/);
});

test("submit: spawn returns call_id; the governed idempotency key is forwarded; secrets ride headers only", async () => {
  const fetchJson = fakeFetch([["/submit", { method: "POST", reply: { call_id: "fc-123abc" } }]]);
  const allocation = await modalAdapter.allocate(ctxWith({ fetchJson }));
  assert.equal(allocation.status, "allocated");
  assert.equal(allocation.runRef.providerResourceId, "fc-123abc");
  const call = fetchJson.calls[0];
  assert.equal(call.body.growthub.idempotencyKey, "feedface87654321");
  assert.equal(call.body.gpu, "A100-80GB");
  assert.equal(call.headers["Modal-Key"], "wk-testid", "proxy auth in the documented headers");
  assert.ok(!JSON.stringify(call.body).includes("ws-testsecret"), "secret never in the body");

  const noId = await modalAdapter.allocate(ctxWith({ fetchJson: fakeFetch([["/submit", { method: "POST", reply: { ok: true } }]]) }));
  assert.equal(noId.status, "failed");
  assert.match(noId.error, /call_id/);
});

test("status mapping covers the InputStatus-derived vocabulary", async () => {
  assert.equal(mapModalCallStatus("pending"), "compute-queued");
  assert.equal(mapModalCallStatus("running"), "compute-running");
  assert.equal(mapModalCallStatus("success"), "compute-completed");
  assert.equal(mapModalCallStatus("failure"), "compute-failed");
  assert.equal(mapModalCallStatus("timeout"), "compute-failed");
  assert.equal(mapModalCallStatus("terminated"), "compute-cancelled");
  assert.equal(mapModalCallStatus("???"), "");
  const events = await modalAdapter.status(ctxWith({ resourceId: "fc-1", fetchJson: fakeFetch([["/status", { reply: { status: "failure", error: "CUDA OOM" } }]]) }));
  assert.equal(events[0].type, "compute-failed");
  assert.match(events[0].detail, /CUDA OOM/);
});

test("artifact honesty: reported artifact needs a locator; none reported → null", async () => {
  const withArtifact = await modalAdapter.collectArtifact(ctxWith({
    resourceId: "fc-1",
    fetchJson: fakeFetch([["/status", { reply: { status: "success", artifact: { locator: "vol://out/model.gguf", sha256: "d".repeat(64), sizeBytes: 9, kind: "gguf" } } }]]),
  }));
  assert.equal(withArtifact.locator, "vol://out/model.gguf");
  const none = await modalAdapter.collectArtifact(ctxWith({ resourceId: "fc-1", fetchJson: fakeFetch([["/status", { reply: { status: "success" } }]]) }));
  assert.equal(none, null);
});

test("release honesty on scale-to-zero: terminal call releases; live call cancels; unobservable stays release-failed", async () => {
  const terminal = await modalAdapter.release(ctxWith({ resourceId: "fc-1", fetchJson: fakeFetch([["/status", { reply: { status: "success" } }]]) }));
  assert.equal(terminal[0].type, "compute-released");

  const live = await modalAdapter.release(ctxWith({
    resourceId: "fc-1",
    fetchJson: fakeFetch([
      ["/status", { reply: { status: "running" } }],
      ["/cancel", { method: "POST", reply: { cancelled: true } }],
    ]),
  }));
  assert.equal(live[0].type, "compute-released");
  assert.match(live[0].detail, /cancelled/);

  const broken = await modalAdapter.release(ctxWith({ resourceId: "fc-1", fetchJson: fakeFetch([["/status", { throws: "HTTP 503" }]]) }));
  assert.equal(broken[0].type, "compute-release-failed");
  assert.match(broken[0].detail, /may still be billing/);
});

// ---------------------------------------------------------------------------
// End-to-end conformance through the governed orchestrator
// ---------------------------------------------------------------------------

test("CONFORMANCE — full governed lifecycle over the Modal adapter (faked transport, artifact returned)", async () => {
  let statusCalls = 0;
  const fetchJson = fakeFetch([
    ["/health", { reply: { ok: true } }],
    ["/submit", { method: "POST", reply: { call_id: "fc-e2e" } }],
    ["/status", {
      reply: () => {
        statusCalls += 1;
        if (statusCalls === 1) return { status: "running" };
        return { status: "success", artifact: { locator: "vol://out/student.q4_k_m.gguf", sha256: "e".repeat(64), sizeBytes: 42, kind: "gguf" } };
      },
    }],
  ]);
  const workspaceConfig = {
    dataModel: {
      objects: [{
        id: "api-registry",
        objectType: "api-registry",
        rows: [{
          integrationId: "modal-burst",
          Name: "Modal burst",
          metadata: {
            computeProvider: {
              schema: "growthub-compute-provider-v1",
              adapterId: MODAL_ADAPTER_ID,
              capacityProfiles: ["burst-gpu", "single-gpu-finetune"],
              availabilityModes: ["on-demand"],
              requiredEnv: ["MODAL_KEY", "MODAL_SECRET"],
              executionLane: "sandbox-local",
              config: { baseUrl: BASE, gpuType: "H100" },
            },
          },
        }],
      }],
    },
  };
  let clock = Date.parse("2026-07-20T12:00:00.000Z");
  const outcome = await executeProviderComputeRun({
    workspaceConfig,
    trainingRunId: "trainrun_modal_e2e",
    computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "modal-burst", selectionMode: "explicit" },
    requirements: { ...REQ, checkpointRequired: false },
    io: {
      getAdapter: (id) => (id === MODAL_ADAPTER_ID ? modalAdapter : null),
      listAdapterIds: () => [MODAL_ADAPTER_ID],
      envPresent: (name) => ["MODAL_KEY", "MODAL_SECRET"].includes(name),
      resolveEnv: (name) => (name === "MODAL_KEY" ? "wk-testid" : name === "MODAL_SECRET" ? "ws-testsecret" : ""),
      fetchJson,
      now: () => { clock += 1000; return clock; },
      sleep: async () => {},
      maxPolls: 6,
      pollIntervalMs: 0,
    },
  });
  assert.equal(outcome.result.ok, true, outcome.result.error || "should complete promotably");
  assert.equal(outcome.result.exitCode, 0);
  assert.equal(outcome.computeBlock.artifact.sha256, "e".repeat(64));
  const types = outcome.computeBlock.events.map((e) => e.type);
  assert.ok(types.includes("compute-allocated"));
  assert.ok(types.includes("compute-running"));
  assert.ok(types.includes("compute-completed"));
  assert.ok(types.includes("compute-released"));
  assert.ok(!JSON.stringify(outcome.computeBlock).includes("ws-testsecret"), "evidence trail is secret-free");
});
