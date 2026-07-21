import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adapterUrl = pathToFileURL(path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js",
)).href;
const { default: runpodAdapter } = await import(adapterUrl);

function scriptedFetch(steps) {
  const calls = [];
  const queue = [...steps];
  const fetchJson = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET" });
    const step = queue.shift();
    assert.ok(step, `unexpected request ${init.method || "GET"} ${url}`);
    if (step.match) assert.match(`${init.method || "GET"} ${url}`, step.match);
    if (step.error) throw new Error(step.error);
    return step.value;
  };
  fetchJson.calls = calls;
  fetchJson.remaining = () => queue.length;
  return fetchJson;
}

function ctx(fetchJson, resourceId = "job-1") {
  return {
    runRef: {
      trainingRunId: "trainrun-runpod-release",
      modelTrainingRowId: "workspace-local",
      providerId: "runpod-serverless",
      capacityProfileId: "single-gpu-finetune",
      providerResourceId: resourceId,
    },
    requirements: { workloadKind: "fine-tune", gpuCount: 1 },
    capacityProfileId: "single-gpu-finetune",
    idempotencyKeyHash: "a".repeat(64),
    workSpecHash: "b".repeat(64),
    providerConfig: {
      providerId: "runpod-serverless",
      mode: "serverless",
      endpointId: "endpoint-1",
      apiKeyEnv: "RUNPOD_API_KEY",
    },
    resolveEnv: (name) => name === "RUNPOD_API_KEY" ? "test-secret" : "",
    fetchJson,
  };
}

test("terminal Runpod serverless job is released without a cancellation call", async () => {
  const fetchJson = scriptedFetch([
    { match: /GET .*\/status\/job-1$/, value: { id: "job-1", status: "COMPLETED" } },
  ]);
  const events = await runpodAdapter.release(ctx(fetchJson));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "compute-released");
  assert.match(events[0].detail, /COMPLETED/);
  assert.equal(fetchJson.calls.some((call) => call.url.includes("/cancel/")), false);
  assert.equal(fetchJson.remaining(), 0);
});

test("live Runpod serverless job is cancelled and re-observed before release is confirmed", async () => {
  const fetchJson = scriptedFetch([
    { match: /GET .*\/status\/job-1$/, value: { id: "job-1", status: "IN_PROGRESS" } },
    { match: /POST .*\/cancel\/job-1$/, value: { id: "job-1", status: "CANCELLED" } },
    { match: /GET .*\/status\/job-1$/, value: { id: "job-1", status: "CANCELLED" } },
  ]);
  const events = await runpodAdapter.release(ctx(fetchJson));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "compute-released");
  assert.match(events[0].detail, /CANCELLED/);
  assert.equal(fetchJson.calls.filter((call) => call.url.includes("/cancel/")).length, 1);
  assert.equal(fetchJson.remaining(), 0);
});

test("ambiguous cancellation acknowledgement cannot mint release evidence", async () => {
  const fetchJson = scriptedFetch([
    { match: /GET .*\/status\/job-1$/, value: { id: "job-1", status: "IN_QUEUE" } },
    { match: /POST .*\/cancel\/job-1$/, value: { id: "job-1", status: "CANCELLING" } },
  ]);
  const events = await runpodAdapter.release(ctx(fetchJson));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "compute-release-failed");
  assert.match(events[0].detail, /not confirm cancellation|may still be billing/i);
});

test("post-cancel status uncertainty remains release-failed and cost-risk visible", async () => {
  const fetchJson = scriptedFetch([
    { match: /GET .*\/status\/job-1$/, value: { id: "job-1", status: "IN_PROGRESS" } },
    { match: /POST .*\/cancel\/job-1$/, value: { id: "job-1", status: "CANCELLED" } },
    { match: /GET .*\/status\/job-1$/, error: "status endpoint unavailable" },
  ]);
  const events = await runpodAdapter.release(ctx(fetchJson));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "compute-release-failed");
  assert.match(events[0].detail, /not confirmed|may still be billing/i);
});

test("unknown nonterminal provider state is not treated as released", async () => {
  const fetchJson = scriptedFetch([
    { match: /GET .*\/status\/job-1$/, value: { id: "job-1", status: "MYSTERY_STATE" } },
  ]);
  const events = await runpodAdapter.release(ctx(fetchJson));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "compute-release-failed");
  assert.match(events[0].detail, /MYSTERY_STATE|not safely classifiable/);
});

test("direct serverless cancel only emits compute-cancelled on verifiable acknowledgement", async () => {
  const ambiguous = scriptedFetch([
    { match: /POST .*\/cancel\/job-1$/, value: { id: "job-1", status: "CANCELLING" } },
  ]);
  assert.deepEqual(await runpodAdapter.cancel(ctx(ambiguous)), []);

  const confirmed = scriptedFetch([
    { match: /POST .*\/cancel\/job-1$/, value: { id: "job-1", status: "CANCELLED" } },
  ]);
  const events = await runpodAdapter.cancel(ctx(confirmed));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "compute-cancelled");
});
