/**
 * Governed Compute Realization — Deterministic Compute Resolver (Sprint 4).
 *
 * Exit proofs:
 *   - equivalent inputs ALWAYS produce equivalent selection (including under
 *     shuffled candidate order — the stable provider-id tiebreak kills
 *     nondeterminism);
 *   - a locally-insufficient machine's reason is visible on the verdict;
 *   - unknown price fails a hard budget (unknown is never zero);
 *   - every skipped candidate is machine-explainable;
 *   - the run config / receipt extensions are additive.
 *
 * Run with: node --test scripts/unit-compute-resolver.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const { resolveCompute, evaluateCandidateEligibility, COMPUTE_DECISION_SCHEMA } = await import(lib("compute-resolver.js"));
const { computeIdempotencyKey } = await import(lib("compute-evidence.js"));
const { buildTrainingRunConfig } = await import(lib("training-runtime-profiles.js"));
const { buildTrainingRunReceipt } = await import(lib("training-run-receipts.js"));
const contract = await import(pathToFileURL(path.join(repoRoot, "packages/api-contract/dist/compute.js")).href);

const NOW = "2026-07-20T12:00:00.000Z";
const LATER = "2026-07-20T13:00:00.000Z";

function requirements(overrides = {}) {
  return {
    workloadKind: "fine-tune",
    acceleratorClass: "any-gpu",
    gpuCount: 1,
    minVramPerGpuGB: 24,
    minCpuCores: 4,
    minRamGB: 16,
    minDiskGB: 60,
    checkpointRequired: true,
    distributed: null,
    locality: { regions: [], dataResidency: "" },
    estimatedDurationMinutes: 120,
    ...overrides,
  };
}

function provider(id, overrides = {}) {
  return {
    providerId: id,
    provenance: "governed-row",
    adapterId: `${id}-adapter`,
    status: "ready",
    statusReason: "",
    capacityProfiles: ["burst-gpu", "single-gpu-finetune", "multi-gpu-finetune", "distributed-training", "warm-inference"],
    availabilityModes: ["on-demand"],
    executionLane: "sandbox-local",
    requiredEnv: [],
    missingEnv: [],
    violations: [],
    config: {},
    ...overrides,
  };
}

function capabilities(overrides = {}) {
  return {
    maxVramPerGpuGB: 80,
    maxGpusPerWorker: 8,
    maxWorkers: 1,
    acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"],
    supportsCheckpointing: true,
    supportsResume: true,
    supportsGangScheduling: false,
    regions: ["us-east"],
    ...overrides,
  };
}

function quote(overrides = {}) {
  return {
    available: true,
    availabilityMode: "on-demand",
    costBasis: { kind: "per-hour", unitUsd: 2.5, source: "static-catalog" },
    estimatedTotalUsd: 5,
    queueLatencySeconds: 30,
    quoteObservedAt: NOW,
    quoteExpiresAt: LATER,
    quoteRef: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("EXIT PROOF — equivalent inputs always produce equivalent selection, order-independent", () => {
  const providers = [provider("alpha"), provider("beta"), provider("gamma")];
  const caps = { alpha: capabilities(), beta: capabilities(), gamma: capabilities() };
  const quotes = { alpha: quote({ estimatedTotalUsd: 7 }), beta: quote({ estimatedTotalUsd: 5 }), gamma: quote({ estimatedTotalUsd: 5 }) };
  const input = { requirements: requirements(), capacityProfileId: "single-gpu-finetune", capabilitiesById: caps, quotesById: quotes, budget: { mode: "advisory" }, now: NOW };

  const d1 = resolveCompute({ ...input, providers });
  const d2 = resolveCompute({ ...input, providers });
  assert.deepEqual(d1, d2, "same inputs → identical decision object");

  const shuffled = [providers[2], providers[0], providers[1]];
  const d3 = resolveCompute({ ...input, providers: shuffled });
  assert.deepEqual(d1, d3, "candidate order must not affect the decision");
  assert.equal(d1.schema, COMPUTE_DECISION_SCHEMA);
  assert.ok(contract.isComputeDecision(d1), "decision satisfies the shared contract guard");
});

test("EXIT PROOF — stable provider-id tiebreak: beta beats gamma on identical quotes", () => {
  const providers = [provider("gamma"), provider("beta")];
  const caps = { beta: capabilities(), gamma: capabilities() };
  const quotes = { beta: quote(), gamma: quote() };
  const decision = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: quotes, now: NOW });
  assert.equal(decision.selectedProviderId, "beta", "lexicographically-lower id wins a full tie");
  const gamma = decision.candidates.find((c) => c.providerId === "gamma");
  assert.equal(gamma.eligible, true);
  assert.deepEqual(gamma.reasonCodes, ["outranked"]);
  assert.match(gamma.reasons[0], /beta/);
});

// ---------------------------------------------------------------------------
// Ranking policy
// ---------------------------------------------------------------------------

test("local ownership outranks cheaper remote capacity", () => {
  const providers = [provider("aaa-cloud"), provider("local-machine", { availabilityModes: ["local"] })];
  const caps = { "aaa-cloud": capabilities(), "local-machine": capabilities({ maxVramPerGpuGB: 24, maxGpusPerWorker: 1, regions: [] }) };
  const quotes = {
    "aaa-cloud": quote({ estimatedTotalUsd: 0.01 }),
    "local-machine": quote({ availabilityMode: "local", costBasis: { kind: "owned-hardware", unitUsd: 0, source: "local" }, estimatedTotalUsd: 0, queueLatencySeconds: 0 }),
  };
  const decision = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: quotes, now: NOW });
  assert.equal(decision.selectedProviderId, "local-machine");
  assert.ok(decision.selectedReasons.some((r) => /locally owned/.test(r)));
});

test("warm capacity outranks on-demand; cheaper wins within the same mode", () => {
  const providers = [provider("ondemand-cheap"), provider("warm-pricier", { availabilityModes: ["warm"] })];
  const caps = { "ondemand-cheap": capabilities(), "warm-pricier": capabilities() };
  const quotes = {
    "ondemand-cheap": quote({ estimatedTotalUsd: 1 }),
    "warm-pricier": quote({ availabilityMode: "warm", estimatedTotalUsd: 3, queueLatencySeconds: 0 }),
  };
  const d = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: quotes, now: NOW });
  assert.equal(d.selectedProviderId, "warm-pricier");

  const quotes2 = { a1: quote({ estimatedTotalUsd: 4 }), a2: quote({ estimatedTotalUsd: 2 }) };
  const d2 = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers: [provider("a1"), provider("a2")], capabilitiesById: { a1: capabilities(), a2: capabilities() }, quotesById: quotes2, now: NOW });
  assert.equal(d2.selectedProviderId, "a2", "same mode → lower cost wins");
});

test("explicit selection mode pins the provider; a pinned-ineligible provider selects nothing", () => {
  const providers = [provider("alpha"), provider("beta")];
  const caps = { alpha: capabilities(), beta: capabilities() };
  const quotes = { alpha: quote({ estimatedTotalUsd: 1 }), beta: quote({ estimatedTotalUsd: 99 }) };
  const pinned = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: quotes, selectionMode: "explicit", pinnedProviderId: "beta", now: NOW });
  assert.equal(pinned.selectedProviderId, "beta");
  const alpha = pinned.candidates.find((c) => c.providerId === "alpha");
  assert.deepEqual(alpha.reasonCodes, ["not-selected-by-policy"]);

  const pinnedBad = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: { alpha: quotes.alpha, beta: quote({ available: false }) }, selectionMode: "explicit", pinnedProviderId: "beta", now: NOW });
  assert.equal(pinnedBad.selectedProviderId, "", "an ineligible pin never falls back silently");
  const beta = pinnedBad.candidates.find((c) => c.providerId === "beta");
  assert.ok(beta.reasonCodes.includes("capacity-unavailable"));
});

// ---------------------------------------------------------------------------
// Hard eligibility gates
// ---------------------------------------------------------------------------

test("EXIT PROOF — unknown price fails a hard budget; explicit opt-in permits it", () => {
  const providers = [provider("mystery")];
  const caps = { mystery: capabilities() };
  const unknownQuote = quote({ estimatedTotalUsd: null, costBasis: { kind: "unknown", unitUsd: 0, source: "" } });
  const hard = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: { mystery: unknownQuote }, budget: { mode: "hard-cap", maxTotalUsd: 100 }, now: NOW });
  assert.equal(hard.selectedProviderId, "");
  const v = hard.candidates.find((c) => c.providerId === "mystery");
  assert.ok(v.reasonCodes.includes("cost-unknown-under-hard-budget"), JSON.stringify(v.reasonCodes));

  const optIn = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: { mystery: unknownQuote }, budget: { mode: "hard-cap", maxTotalUsd: 100, allowUnknownCost: true }, now: NOW });
  assert.equal(optIn.selectedProviderId, "mystery", "explicit allowUnknownCost admits the unknown");
});

test("over-budget, expired quotes, and unavailable capacity are ineligible with named reasons", () => {
  const providers = [provider("p")];
  const caps = { p: capabilities() };
  const run = (q, budget) => resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: { p: q }, budget, now: NOW }).candidates[0];
  assert.ok(run(quote({ estimatedTotalUsd: 500 }), { mode: "hard-cap", maxTotalUsd: 100 }).reasonCodes.includes("over-budget"));
  assert.ok(run(quote({ costBasis: { kind: "per-hour", unitUsd: 50, source: "" } }), { mode: "hard-cap", maxHourlyUsd: 10 }).reasonCodes.includes("over-hourly-budget"));
  assert.ok(run(quote({ quoteExpiresAt: "2026-07-20T11:00:00.000Z" }), null).reasonCodes.includes("quote-expired"));
  assert.ok(run(quote({ available: false }), null).reasonCodes.includes("capacity-unavailable"));
});

test("capability floors fail closed: VRAM, GPU count, checkpointing, gang scheduling, region, residency, duration", () => {
  const base = { requirements: requirements(), capacityProfileId: "single-gpu-finetune", provider: provider("p"), quote: quote(), budget: null, now: NOW };
  const gate = (over) => evaluateCandidateEligibility({ ...base, ...over });

  assert.ok(gate({ capabilities: capabilities({ maxVramPerGpuGB: 16 }) }).reasonCodes.includes("insufficient-vram"));
  assert.ok(gate({ capabilities: capabilities({ maxVramPerGpuGB: 0 }) }).reasonCodes.includes("vram-unproven"), "unknown VRAM under a floor fails closed");
  assert.ok(gate({ requirements: requirements({ gpuCount: 8 }), capabilities: capabilities({ maxGpusPerWorker: 4 }) }).reasonCodes.includes("gpu-count-unsupported"));
  assert.ok(gate({ capabilities: capabilities({ supportsCheckpointing: false }) }).reasonCodes.includes("checkpoint-unsupported"));
  assert.ok(gate({ requirements: requirements({ distributed: { workers: 4, gpusPerWorker: 8, gangScheduling: true, highBandwidthInterconnect: true } }), capabilities: capabilities({ maxWorkers: 2 }) }).reasonCodes.includes("distributed-unsupported"));
  assert.ok(gate({ requirements: requirements({ distributed: { workers: 2, gpusPerWorker: 1, gangScheduling: true, highBandwidthInterconnect: false } }), capabilities: capabilities({ maxWorkers: 4, supportsGangScheduling: false }) }).reasonCodes.includes("gang-scheduling-unsupported"));
  assert.ok(gate({ requirements: requirements({ locality: { regions: ["eu-west"], dataResidency: "" } }), capabilities: capabilities({ regions: ["us-east"] }) }).reasonCodes.includes("region-unavailable"));
  assert.ok(gate({ requirements: requirements({ locality: { regions: ["eu-west"], dataResidency: "" } }), capabilities: capabilities({ regions: [] }) }).reasonCodes.includes("region-unproven"), "unknown region under a pin fails closed");
  assert.ok(gate({ requirements: requirements({ locality: { regions: [], dataResidency: "eu" } }), capabilities: capabilities() }).reasonCodes.includes("data-residency-unproven"));
  assert.ok(gate({ provider: provider("p", { config: { maxDurationMinutes: 60 } }), capabilities: capabilities() }).reasonCodes.includes("duration-unsupported"));
});

test("EXIT PROOF — local insufficiency reason is visible on the decision", () => {
  const providers = [
    provider("local-machine", { availabilityModes: ["local"] }),
    provider("cloud-a"),
  ];
  const caps = {
    "local-machine": capabilities({ maxVramPerGpuGB: 24, maxGpusPerWorker: 1, regions: [] }),
    "cloud-a": capabilities(),
  };
  const quotes = { "local-machine": quote({ availabilityMode: "local", costBasis: { kind: "owned-hardware", unitUsd: 0, source: "local" }, estimatedTotalUsd: 0 }), "cloud-a": quote() };
  const decision = resolveCompute({ requirements: requirements({ minVramPerGpuGB: 80 }), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: quotes, now: NOW });
  assert.equal(decision.selectedProviderId, "cloud-a");
  const local = decision.candidates.find((c) => c.providerId === "local-machine");
  assert.equal(local.eligible, false);
  assert.ok(local.reasonCodes.includes("insufficient-vram"));
  assert.match(local.reasons.join(" "), /80 GB.*24 GB/, "the local refusal names both numbers");
});

test("EXIT PROOF — every skipped candidate is explainable (no empty verdicts)", () => {
  const providers = [
    provider("ready-a"),
    provider("no-adapter", { status: "adapter-missing", statusReason: "no registered compute adapter" }),
    provider("no-creds", { status: "credential-missing", statusReason: "RUNPOD_API_KEY not present" }),
    provider("bad-row", { status: "invalid-row", statusReason: "credential-shaped value" }),
    provider("wrong-profile", { capacityProfiles: ["warm-inference"] }),
  ];
  const caps = Object.fromEntries(providers.map((p) => [p.providerId, capabilities()]));
  const quotes = Object.fromEntries(providers.map((p) => [p.providerId, quote()]));
  const decision = resolveCompute({ requirements: requirements(), capacityProfileId: "single-gpu-finetune", providers, capabilitiesById: caps, quotesById: quotes, now: NOW });
  assert.equal(decision.selectedProviderId, "ready-a");
  for (const candidate of decision.candidates) {
    if (candidate.providerId === "ready-a") continue;
    assert.equal(candidate.eligible, false);
    assert.ok(candidate.reasonCodes.length > 0, `${candidate.providerId} must carry reason codes`);
    assert.ok(candidate.reasons.length > 0, `${candidate.providerId} must carry human reasons`);
  }
  assert.ok(decision.candidates.find((c) => c.providerId === "no-adapter").reasonCodes.includes("adapter-missing"));
  assert.ok(decision.candidates.find((c) => c.providerId === "no-creds").reasonCodes.includes("credential-missing"));
  assert.ok(decision.candidates.find((c) => c.providerId === "bad-row").reasonCodes.includes("provider-invalid"));
  assert.ok(decision.candidates.find((c) => c.providerId === "wrong-profile").reasonCodes.includes("profile-unsupported"));
});

// ---------------------------------------------------------------------------
// Additive config/receipt extensions + deterministic allocation identity
// ---------------------------------------------------------------------------

test("run config carries optional compute selection additively; absent means null", () => {
  const plain = buildTrainingRunConfig({ profileId: "unsloth-qlora-quantize-pipeline", baseModel: "gemma3:1b", datasetPath: "data/train.jsonl", outputModelTag: "workspace-tuned-v1", artifactPath: "artifacts/run1" });
  assert.equal(plain.compute, null, "no compute ask → null (existing behavior untouched)");
  assert.equal(plain.ready, true);

  const remote = buildTrainingRunConfig({ profileId: "unsloth-qlora-quantize-pipeline", baseModel: "gemma3:1b", datasetPath: "data/train.jsonl", outputModelTag: "workspace-tuned-v1", artifactPath: "artifacts/run1", compute: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "runpod-burst", selectionMode: "explicit" } });
  assert.deepEqual(remote.compute, { capacityProfileId: "single-gpu-finetune", providerRegistryId: "runpod-burst", selectionMode: "explicit" });
  assert.equal(remote.compute.selectionMode, "explicit");
});

test("receipt carries the compute evidence block additively; garbage normalizes; absent stays null", () => {
  const bare = buildTrainingRunReceipt({ trainingRunId: "run_1", modelTrainingRowId: "workspace-local" });
  assert.equal(bare.compute, null);

  const withCompute = buildTrainingRunReceipt({
    trainingRunId: "run_2",
    modelTrainingRowId: "workspace-local",
    compute: {
      capacityProfileId: "single-gpu-finetune",
      providerRegistryId: "runpod-burst",
      selectionMode: "auto",
      idempotencyKeyHash: "abc",
      decision: { schema: COMPUTE_DECISION_SCHEMA, capacityProfileId: "single-gpu-finetune", candidates: [], selectedProviderId: "runpod-burst" },
      events: [{ type: "compute-requested", at: NOW, evidenceObservedAt: NOW, source: "workspace" }, { type: "pod-created" }],
    },
  });
  assert.equal(withCompute.compute.schema, "growthub-compute-evidence-v1");
  assert.equal(withCompute.compute.events.length, 1, "non-normalized provider-native event names are dropped at the receipt boundary");
  assert.equal(withCompute.compute.decision.selectedProviderId, "runpod-burst");
});

test("idempotency key is deterministic on the governed identity and changes only with it", () => {
  const a = computeIdempotencyKey({ trainingRunId: "run_9", attempt: 1, capacityProfileId: "burst-gpu", providerId: "runpod-burst" });
  const b = computeIdempotencyKey({ trainingRunId: "run_9", attempt: 1, capacityProfileId: "burst-gpu", providerId: "runpod-burst" });
  assert.deepEqual(a, b);
  const retry = computeIdempotencyKey({ trainingRunId: "run_9", attempt: 2, capacityProfileId: "burst-gpu", providerId: "runpod-burst" });
  assert.notEqual(a.hash, retry.hash, "an explicit governed retry is a NEW identity");
  const otherProvider = computeIdempotencyKey({ trainingRunId: "run_9", attempt: 1, capacityProfileId: "burst-gpu", providerId: "modal-burst" });
  assert.notEqual(a.hash, otherProvider.hash);
});

test("garbage inputs never throw and never select", () => {
  const d = resolveCompute({});
  assert.equal(d.selectedProviderId, "");
  assert.deepEqual(d.candidates, []);
  const d2 = resolveCompute({ providers: [null, undefined, "x"], requirements: null, now: "garbage" });
  assert.equal(d2.selectedProviderId, "");
});
