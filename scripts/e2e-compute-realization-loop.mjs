/**
 * Governed Compute Realization V1 — composed A–J proof loop.
 *
 * Machine evidence is collected from the real local readiness probe. Remote
 * transports are faked only at adapter boundaries. The proof distinguishes
 * resource adoption from duplicate creation and canonical workspace
 * evaluation from provider-authored diagnostics.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const { collectTrainingLocalReadiness } = await import(lib("training-local-readiness-probe.js"));
const { buildAdaptiveStudentPlan } = await import(lib("distillation-student-plan.js"));
const {
  deriveCapacityPlan,
  deriveComputeRequirements,
  deriveLocalComputeCompatibility,
  resolveCapacityProfileForRequirements,
} = await import(lib("compute-capacity-profiles.js"));
const { deriveComputeProviders } = await import(lib("compute-provider-registry.js"));
const { resolveCompute } = await import(lib("compute-resolver.js"));
const {
  executeProviderComputeRun,
  cancelProviderComputeRun,
  resumeProviderComputeRun,
} = await import(lib("compute-execution.js"));
const { deriveComputeLifecycle, deriveComputeArtifactHonesty } = await import(lib("compute-evidence.js"));
const { deriveBenchmarkWins } = await import(lib("distillation-eval-harness.js"));
const { deriveActiveRoute } = await import(lib("distillation-fleet.js"));
const { getComputeProviderAdapter, listComputeProviderAdapters } = await import(lib("adapters/compute/index.js"));

let pass = 0;
const evidence = {};
const ok = (label, condition) => {
  assert.ok(condition, label);
  pass += 1;
  console.log(`  ✓ ${label}`);
};
const eq = (label, actual, expected) => {
  assert.deepEqual(actual, expected, label);
  pass += 1;
  console.log(`  ✓ ${label}`);
};

const writeEvidence = process.argv.includes("--write-evidence");
const evidenceDir = path.join(repoRoot, "docs/proofs/governed-compute-realization/evidence");

console.log("— A/B: real machine evidence → plan → profile → local verdict —");
const readiness = await collectTrainingLocalReadiness({});
const preflight = {
  ramGB: readiness.preflight.ramGB,
  diskFreeGB: readiness.preflight.diskFreeGB,
  gpu: readiness.preflight.gpu,
};
ok(`real machine measured: ${preflight.ramGB} GB RAM · ${preflight.diskFreeGB} GB free disk`, preflight.ramGB > 0);
evidence["machine-evidence"] = {
  collectedAt: new Date().toISOString(),
  preflight,
  tooling: readiness.tooling.map((tool) => ({ id: tool.id, ok: tool.ok })),
};

const plan = buildAdaptiveStudentPlan({ preflight });
const capacity = deriveCapacityPlan({ plan, preflight, workloadKind: "fine-tune" });
evidence["capacity-plan"] = capacity;
if (plan.mode === "train-local") {
  ok(`A: local plan resolves to ${capacity.capacityProfileId}`, capacity.local.eligible && capacity.capacityProfileId === "cpu-local-finetune");
  const providers = deriveComputeProviders({ workspaceConfig: {}, registeredAdapterIds: listComputeProviderAdapters(), envPresent: () => false, preflight });
  const local = getComputeProviderAdapter("local-machine");
  const quote = await local.inspectCapacity({ providerConfig: { preflight }, requirements: capacity.requirements, capacityProfileId: capacity.capacityProfileId, runRef: { providerId: "local-machine" } });
  const decision = resolveCompute({
    requirements: capacity.requirements,
    capacityProfileId: capacity.capacityProfileId,
    providers: providers.providers,
    capabilitiesById: { "local-machine": local.describeCapabilities({ preflight }) },
    quotesById: { "local-machine": quote },
    now: Date.now(),
  });
  eq("A: deterministic resolver selects local machine", decision.selectedProviderId, "local-machine");
  const allocation = await local.allocate({
    providerConfig: { preflight },
    requirements: capacity.requirements,
    idempotencyKeyHash: "e2e-local",
    runRef: { trainingRunId: "e2e-local-run", providerId: "local-machine", capacityProfileId: capacity.capacityProfileId, modelTrainingRowId: "workspace-local", providerResourceId: "" },
  });
  ok("A: local allocation is owned-hardware bookkeeping", allocation.status === "allocated" && allocation.costBasis.kind === "owned-hardware");
  evidence["proof-a-local-fit"] = { decision, allocation };
} else {
  ok("A: under-capacity machine remains harvest-only", plan.mode === "harvest-only" && capacity.capacityProfileId === "harvest-only");
  evidence["proof-a-local-fit"] = { plan, note: "machine below local training tier" };
}

const bigAsk = deriveComputeRequirements({ paramsB: 70, workloadKind: "fine-tune", preflight });
const bigVerdict = deriveLocalComputeCompatibility({ requirements: bigAsk, preflight });
ok(`B: 70B ask is locally ineligible (${bigVerdict.reasonCodes.join(",")})`, !bigVerdict.eligible && bigVerdict.reasonCodes.length > 0);
const remoteProfile = resolveCapacityProfileForRequirements(bigAsk);
ok("B: a governed remote profile derives", ["single-gpu-finetune", "multi-gpu-finetune"].includes(remoteProfile.profile.id));
evidence["proof-b-local-insufficient"] = { requirements: bigAsk, verdict: bigVerdict, remoteProfile: remoteProfile.profile.id };

console.log("— C/D: deterministic placement + budget fail-closed —");
const mkProvider = (id, extra = {}) => ({
  providerId: id,
  provenance: "governed-row",
  adapterId: `${id}-a`,
  status: "ready",
  statusReason: "",
  capacityProfiles: ["single-gpu-finetune"],
  availabilityModes: ["on-demand"],
  executionLane: "sandbox-local",
  requiredEnv: [],
  missingEnv: [],
  violations: [],
  config: {},
  ...extra,
});
const caps = {
  maxVramPerGpuGB: 80,
  maxGpusPerWorker: 8,
  maxWorkers: 1,
  acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"],
  supportsCheckpointing: true,
  supportsResume: true,
  supportsGangScheduling: false,
  regions: ["us-east"],
};
const mkQuote = (overrides = {}) => ({
  available: true,
  availabilityMode: "on-demand",
  costBasis: { kind: "per-hour", unitUsd: 2, source: "s" },
  estimatedTotalUsd: 4,
  queueLatencySeconds: 10,
  quoteObservedAt: "2026-07-20T12:00:00.000Z",
  quoteExpiresAt: "2026-07-20T13:00:00.000Z",
  quoteRef: "",
  ...overrides,
});
const req1 = { ...bigAsk, minVramPerGpuGB: 80, gpuCount: 1 };
const placementInput = {
  requirements: req1,
  capacityProfileId: "single-gpu-finetune",
  providers: [
    mkProvider("provider-b"),
    mkProvider("provider-a"),
    mkProvider("provider-c", { status: "credential-missing", statusReason: "KEY absent" }),
  ],
  capabilitiesById: { "provider-a": caps, "provider-b": caps, "provider-c": caps },
  quotesById: { "provider-a": mkQuote(), "provider-b": mkQuote({ estimatedTotalUsd: 9 }), "provider-c": mkQuote() },
  now: Date.parse("2026-07-20T12:05:00.000Z"),
};
const decisionA = resolveCompute(placementInput);
const decisionB = resolveCompute({ ...placementInput, providers: [...placementInput.providers].reverse() });
eq("C: equivalent shuffled inputs produce the same decision", decisionA, decisionB);
eq("C: cheapest eligible provider wins", decisionA.selectedProviderId, "provider-a");
ok("C: every skipped provider is explained", decisionA.candidates.filter((candidate) => candidate.providerId !== "provider-a").every((candidate) => candidate.reasonCodes.length > 0));
evidence["proof-c-deterministic-placement"] = decisionA;

const budgetDecision = resolveCompute({
  ...placementInput,
  quotesById: {
    "provider-a": mkQuote({ estimatedTotalUsd: null, costBasis: { kind: "unknown", unitUsd: 0, source: "" } }),
    "provider-b": mkQuote({ estimatedTotalUsd: 900 }),
    "provider-c": mkQuote(),
  },
  budget: { mode: "hard-cap", maxTotalUsd: 100, maxHourlyUsd: 0, allowUnknownCost: false },
});
eq("D: unknown/excess cost under hard cap selects nothing", budgetDecision.selectedProviderId, "");
ok("D: cost refusals are named", budgetDecision.candidates.some((candidate) => candidate.reasonCodes.includes("cost-unknown-under-hard-budget")) && budgetDecision.candidates.some((candidate) => candidate.reasonCodes.includes("over-budget")));
evidence["proof-d-budget"] = budgetDecision;

console.log("— E/F/G: lifecycle, adoption, artifact honesty —");
function scriptedAdapter(script = {}) {
  const calls = { allocate: 0, execute: 0, status: 0, resume: 0, release: 0, cancel: 0 };
  return {
    id: "e2e-adapter",
    label: "",
    description: "",
    locality: "remote",
    calls,
    describeCapabilities: () => ({
      providerId: "e2e-provider",
      adapterId: "e2e-adapter",
      capacityProfiles: ["single-gpu-finetune"],
      availabilityModes: ["on-demand"],
      acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"],
      maxVramPerGpuGB: 80,
      maxGpusPerWorker: 8,
      maxWorkers: 1,
      supportsCheckpointing: true,
      supportsResume: true,
      supportsGangScheduling: false,
      regions: [],
      requiredEnv: [],
    }),
    inspectCapacity: async (ctx) => {
      const observedAt = new Date().toISOString();
      return mkQuote({ providerId: "e2e-provider", capacityProfileId: ctx.capacityProfileId, quoteObservedAt: observedAt, quoteExpiresAt: new Date(Date.parse(observedAt) + 600000).toISOString() });
    },
    allocate: async (ctx) => {
      calls.allocate += 1;
      return {
        allocationId: "alloc-e2e",
        runRef: { ...ctx.runRef, providerResourceId: "res-e2e" },
        status: "allocated",
        idempotencyKeyHash: ctx.idempotencyKeyHash,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 2, source: "s" },
        requestedAt: "t",
        allocatedAt: "t",
        releasedAt: "",
        releaseConfirmed: false,
        allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "us-east" },
      };
    },
    execute: async (ctx) => {
      calls.execute += 1;
      return [{ type: "compute-queued", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "exec", detail: "exact work spec submitted" }];
    },
    resume: async (ctx) => {
      calls.resume += 1;
      return [{ type: "compute-resuming", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef, providerResourceId: "res-resumed" }, providerEventId: "resume", detail: "proven checkpoint submitted" }];
    },
    status: async (ctx) => {
      calls.status += 1;
      const mk = (type, id, extra = {}) => ({ type, at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: id, detail: "", ...extra });
      if (script.statusScript) return script.statusScript(calls.status, mk, ctx);
      if (calls.status === 1) return [mk("compute-running", "s1")];
      if (calls.status === 2) return [mk("checkpoint-created", "s2", { checkpoint: { checkpointId: "ck-1", runRef: ctx.runRef, locator: "s3://ck/1", sha256: "1".repeat(64), step: 100 } })];
      return [mk("compute-completed", "s3")];
    },
    collectArtifact: async (ctx) => script.noArtifact ? null : {
      runRef: { ...ctx.runRef },
      kind: "gguf",
      locator: "s3://out/model.gguf",
      sha256: script.artifactSha || "2".repeat(64),
      sizeBytes: 5,
      evidenceObservedAt: "t",
      ...(script.providerScores ? { evaluationResults: script.providerScores } : {}),
    },
    cancel: async (ctx) => {
      calls.cancel += 1;
      return [{ type: "compute-cancelled", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "cancel", detail: "" }];
    },
    release: async (ctx) => {
      calls.release += 1;
      if (script.releaseFails) throw new Error("terminate 500");
      return [{ type: "compute-released", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "rel", detail: "released" }];
    },
  };
}

const e2eConfig = {
  dataModel: {
    objects: [{
      id: "api-registry",
      objectType: "api-registry",
      rows: [{
        integrationId: "e2e-provider",
        Name: "E2E provider",
        metadata: { computeProvider: { schema: "growthub-compute-provider-v1", adapterId: "e2e-adapter", capacityProfiles: ["single-gpu-finetune"], availabilityModes: ["on-demand"], requiredEnv: [], executionLane: "sandbox-local", config: {} } },
      }],
    }],
  },
};
const e2eIo = (adapter, onPersist = null) => {
  let clock = Date.now();
  return {
    getAdapter: (id) => id === "e2e-adapter" ? adapter : null,
    listAdapterIds: () => ["e2e-adapter"],
    envPresent: () => true,
    resolveEnv: () => "",
    fetchJson: async () => { throw new Error("no net"); },
    now: () => { clock += 500; return clock; },
    sleep: async () => {},
    maxPolls: 8,
    pollIntervalMs: 0,
    persistCompute: async (block) => { if (onPersist) onPersist(block); },
    verifyArtifact: async (artifact) => ({ verifiedSha256: artifact.sha256, verificationKind: "test-materialized", sizeBytes: artifact.sizeBytes }),
  };
};

const firstAdapter = scriptedAdapter({ providerScores: Array.from({ length: 6 }, (_, index) => ({ taskId: `provider-${index}`, student: { quality: 1 }, baseline: { quality: 0 } })) });
const lifecycleRun = await executeProviderComputeRun({
  workspaceConfig: e2eConfig,
  trainingRunId: "e2e-run-1",
  computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "e2e-provider", selectionMode: "explicit" },
  requirements: req1,
  io: e2eIo(firstAdapter),
});
const lifecycleTypes = lifecycleRun.computeBlock.events.map((event) => event.type);
ok("E: quote → allocate → run → checkpoint → complete → release is normalized", ["compute-requested", "compute-allocated", "compute-running", "checkpoint-created", "compute-completed", "compute-release-requested", "compute-released"].every((type) => lifecycleTypes.includes(type)));
ok("E: verified artifact and confirmed release complete the compute run", lifecycleRun.result.ok === true && lifecycleRun.computeBlock.artifact.verifiedSha256 === lifecycleRun.computeBlock.artifact.sha256);
ok("E: provider-authored score rows are not canonical evaluation", lifecycleRun.computeBlock.evaluation === null);
evidence["proof-e-lifecycle"] = lifecycleRun.computeBlock;

const partialPrior = {
  ...lifecycleRun.computeBlock,
  allocation: { ...lifecycleRun.computeBlock.allocation, releaseConfirmed: false, releasedAt: "" },
  artifact: null,
  evaluation: null,
  events: lifecycleRun.computeBlock.events.filter((event) => ["compute-requested", "compute-allocated", "compute-queued", "compute-running"].includes(event.type)),
};
const continuationAdapter = scriptedAdapter({
  statusScript: (call, mk) => call === 1 ? [mk("compute-running", "continued-running")] : [mk("compute-completed", "continued-complete")],
});
const continued = await executeProviderComputeRun({
  workspaceConfig: e2eConfig,
  trainingRunId: "e2e-run-1",
  computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "e2e-provider", selectionMode: "explicit" },
  requirements: req1,
  priorCompute: partialPrior,
  io: e2eIo(continuationAdapter),
});
ok("F: restart adopts the same paid allocation without allocate/execute replay", continued.result.ok === true && continuationAdapter.calls.allocate === 0 && continuationAdapter.calls.execute === 0 && continued.computeBlock.allocation.allocationId === partialPrior.allocation.allocationId);
evidence["proof-f-idempotency"] = { allocationId: continued.computeBlock.allocation.allocationId, allocateCalls: continuationAdapter.calls.allocate, executeCalls: continuationAdapter.calls.execute };

const ghost = await executeProviderComputeRun({
  workspaceConfig: e2eConfig,
  trainingRunId: "e2e-run-2",
  computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "e2e-provider", selectionMode: "explicit" },
  requirements: req1,
  io: e2eIo(scriptedAdapter({ noArtifact: true })),
});
ok("G: provider complete without artifact remains non-successful", ghost.result.ok === false && ghost.result.adapterMeta.compute.artifactVerified === false);
const wrongHash = deriveComputeArtifactHonesty({ lifecycle: { terminal: "completed" }, artifact: { locator: "s3://x", sha256: "3".repeat(64) }, expectedSha256: "4".repeat(64) });
ok("G: mismatched artifact hash is named and non-promotable", !wrongHash.promotable && wrongHash.reasonCode === "artifact-hash-mismatch");
evidence["proof-g-artifact-honesty"] = { noArtifact: ghost.result.error, wrongHash };

console.log("— H: workspace evaluation owns promotion —");
const policyRow = { metadata: { mothershipProxy: { schema: "growthub-mothership-proxy-v1", modelTag: "tuned-v2", routes: [{ target: "local-student", registryId: "student-row", modelTag: "tuned-v2" }, { target: "local-base", baseUrl: "http://127.0.0.1:11434", modelTag: "gemma3:1b" }] } } };
const loser = deriveBenchmarkWins({ results: Array.from({ length: 6 }, (_, index) => ({ taskId: `t${index}`, student: { quality: 0.3 }, baseline: { quality: 0.8 } })) });
const routeAfterLoss = deriveActiveRoute({ policyRow, studentVerified: false, localRuntimeConnected: true, teacherAuthPresent: false });
ok("H: canonical loss retains current realization", loser.promoted === false && routeAfterLoss.active?.target === "local-base");
const winner = deriveBenchmarkWins({ results: Array.from({ length: 6 }, (_, index) => ({ taskId: `t${index}`, student: { quality: 0.9 }, baseline: { quality: 0.5 } })) });
const routeAfterWin = deriveActiveRoute({ policyRow, studentVerified: true, localRuntimeConnected: true, teacherAuthPresent: false });
ok("H: canonical measured win permits verified student route", winner.promoted === true && routeAfterWin.active?.target === "local-student");
evidence["proof-h-evaluation-boundary"] = { loser, winner, lossRoute: routeAfterLoss.active?.target, winRoute: routeAfterWin.active?.target };

console.log("— I/J: resume resource adoption + release failure honesty —");
const runRef = { trainingRunId: "e2e-run-3", modelTrainingRowId: "", providerId: "e2e-provider", capacityProfileId: "single-gpu-finetune", providerResourceId: "res-old" };
const checkpoint = { checkpointId: "ck-int", runRef, locator: "s3://ck/int", sha256: "5".repeat(64), step: 400, workSpecHash: "6".repeat(64) };
const priorForResume = {
  capacityProfileId: "single-gpu-finetune",
  providerRegistryId: "e2e-provider",
  workSpecHash: checkpoint.workSpecHash,
  requirementsHash: "7".repeat(64),
  intent: { requirements: req1 },
  workSpec: { workSpecHash: checkpoint.workSpecHash },
  capabilities: { supportsResume: true },
  allocation: { allocationId: "alloc-old", runRef, status: "failed", idempotencyKeyHash: "h", availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 2, source: "" }, requestedAt: "t", allocatedAt: "t", releasedAt: "", releaseConfirmed: false, allocated: null, workSpecHash: checkpoint.workSpecHash },
  events: [
    { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { ...runRef, providerResourceId: "" }, providerEventId: "rq", detail: "" },
    { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "al", detail: "", workSpecHash: checkpoint.workSpecHash },
    { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "rn", detail: "", workSpecHash: checkpoint.workSpecHash },
    { type: "checkpoint-created", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "ck", detail: "", workSpecHash: checkpoint.workSpecHash },
    { type: "compute-failed", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "fl", detail: "interrupted", workSpecHash: checkpoint.workSpecHash },
  ],
  checkpoints: [checkpoint],
};
const resumeAdapter = scriptedAdapter();
const resumed = await resumeProviderComputeRun({
  priorCompute: priorForResume,
  provider: { providerId: "e2e-provider", adapterId: "e2e-adapter", config: {} },
  checkpointId: checkpoint.checkpointId,
  io: e2eIo(resumeAdapter),
});
ok("I: proven checkpoint creates a new governed active resource", resumed.resumed === true && resumed.computeBlock.allocation.runRef.providerResourceId === "res-resumed" && resumeAdapter.calls.resume === 1);
evidence["proof-i-recovery"] = { resumed: resumed.resumed, activeResource: resumed.computeBlock.allocation.runRef.providerResourceId };

const releaseFailAdapter = scriptedAdapter({ releaseFails: true });
const cancelled = await cancelProviderComputeRun({
  priorCompute: {
    ...priorForResume,
    allocation: { ...priorForResume.allocation, status: "running" },
    events: priorForResume.events.filter((event) => event.type !== "compute-failed"),
  },
  provider: { providerId: "e2e-provider", adapterId: "e2e-adapter", config: {} },
  io: e2eIo(releaseFailAdapter),
});
ok("J: failed release keeps capacity and cost risk visible", cancelled.cancelled === true && cancelled.releaseConfirmed === false && cancelled.capacityMayStillExist === true && cancelled.costMayAccrue === true);
evidence["proof-j-release-failure"] = { reason: cancelled.reason, capacityMayStillExist: cancelled.capacityMayStillExist, costMayAccrue: cancelled.costMayAccrue };

if (writeEvidence) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  for (const [name, payload] of Object.entries(evidence)) {
    fs.writeFileSync(path.join(evidenceDir, `${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  }
  console.log(`\nEvidence artifacts written to ${path.relative(repoRoot, evidenceDir)}/`);
}

console.log(`\n✅ Governed Compute Realization V1 — proof loop passed (${pass} checks).`);
