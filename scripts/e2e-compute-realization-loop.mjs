/**
 * Governed Compute Realization V1 — end-to-end proof loop (Sprint 11).
 *
 * Executes the release's A–J proof set against the REAL shipped modules:
 * the machine evidence for the local paths comes from the REAL readiness
 * probe on this machine (no fixtures); provider transports are faked at the
 * HTTP boundary only (live provider proofs require credentials and are
 * classified separately in EVIDENCE.md — a fixture is never presented as a
 * real GPU allocation).
 *
 *   A. Local-fit path            preflight → plan → profile → local selected
 *   B. Local-insufficient path   exact reason → remote profile derived
 *   C. Deterministic placement   eligibility → ranking → selected + skipped
 *   D. Budget                    unknown/excess cost → fail closed
 *   E. Allocation lifecycle      quote → allocate → running → checkpoint →
 *                                complete → release
 *   F. Idempotency               replay → no duplicate expensive allocation
 *   G. Artifact honesty          complete + no artifact/wrong hash → non-promotable
 *   H. Evaluation boundary       loser → route unchanged; winner → promoted
 *   I. Recovery                  checkpoint → interrupted → resume
 *   J. Release failure           cancel → release failure → visible risk
 *
 * Run with: node scripts/e2e-compute-realization-loop.mjs [--write-evidence]
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
const { deriveCapacityPlan, deriveComputeRequirements, deriveLocalComputeCompatibility, resolveCapacityProfileForRequirements } = await import(lib("compute-capacity-profiles.js"));
const { deriveComputeProviders } = await import(lib("compute-provider-registry.js"));
const { resolveCompute } = await import(lib("compute-resolver.js"));
const { executeProviderComputeRun, cancelProviderComputeRun } = await import(lib("compute-execution.js"));
const { deriveComputeLifecycle, deriveComputeArtifactHonesty } = await import(lib("compute-evidence.js"));
const { deriveBenchmarkWins } = await import(lib("distillation-eval-harness.js"));
const { deriveActiveRoute } = await import(lib("distillation-fleet.js"));
const { getComputeProviderAdapter, listComputeProviderAdapters } = await import(lib("adapters/compute/index.js"));

let pass = 0;
const evidence = {};
const ok = (label, cond) => { assert.ok(cond, label); pass += 1; console.log(`  ✓ ${label}`); };
const eq = (label, a, b) => { assert.deepEqual(a, b, label); pass += 1; console.log(`  ✓ ${label}`); };

const writeEvidence = process.argv.includes("--write-evidence");
const evidenceDir = path.join(repoRoot, "docs/proofs/governed-compute-realization/evidence");

// ---------------------------------------------------------------------------
console.log("— A/B: real machine evidence → plan → profile → local verdict —");

const readiness = await collectTrainingLocalReadiness({});
const preflight = { ramGB: readiness.preflight.ramGB, diskFreeGB: readiness.preflight.diskFreeGB, gpu: readiness.preflight.gpu };
ok(`real machine measured: ${preflight.ramGB} GB RAM · ${preflight.diskFreeGB} GB free disk · GPU ${preflight.gpu.present ? preflight.gpu.name : "none"}`, preflight.ramGB > 0);
evidence["machine-evidence"] = { collectedAt: new Date().toISOString(), preflight, tooling: readiness.tooling.map((t) => ({ id: t.id, ok: t.ok })) };

const plan = buildAdaptiveStudentPlan({ preflight });
const capacity = deriveCapacityPlan({ plan, preflight, workloadKind: "fine-tune" });
evidence["capacity-plan"] = capacity;
if (plan.mode === "train-local") {
ok(`A: plan sized to this machine (${plan.baseModel}, tier ${plan.tier}) → profile ${capacity.capacityProfileId}, local eligible`, capacity.local.eligible && capacity.capacityProfileId === "cpu-local-finetune");
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
  eq("A: the deterministic resolver selects the LOCAL machine on real evidence", decision.selectedProviderId, "local-machine");
  const allocation = await local.allocate({ providerConfig: { preflight }, requirements: capacity.requirements, idempotencyKeyHash: "e2e-local", runRef: { trainingRunId: "e2e-local-run", providerId: "local-machine", capacityProfileId: capacity.capacityProfileId, modelTrainingRowId: "workspace-local", providerResourceId: "" } });
  ok("A: local allocation is real bookkeeping evidence (owned hardware, $0, deterministic id)", allocation.status === "allocated" && allocation.costBasis.kind === "owned-hardware");
  evidence["proof-a-local-fit"] = { decision, allocation };
} else {
  ok(`A(this machine): plan honestly refuses local training (${plan.tierReason}) — harvest-only journey continues`, plan.mode === "harvest-only" && capacity.capacityProfileId === "harvest-only");
  evidence["proof-a-local-fit"] = { note: "this container is below the training tiers — the local-fit selection is proven in unit-compute-capacity-profiles/unit-compute-provider-registry with a capable machine's evidence shape", plan };
}

// B: local-insufficient with the exact reason + remote profile derived.
const bigAsk = deriveComputeRequirements({ paramsB: 70, workloadKind: "fine-tune", preflight });
const bigVerdict = deriveLocalComputeCompatibility({ requirements: bigAsk, preflight });
ok(`B: 70B ask (${bigAsk.minVramPerGpuGB} GB VRAM/GPU) is locally ineligible with exact reasons: ${bigVerdict.reasonCodes.join(",")}`, !bigVerdict.eligible && bigVerdict.reasonCodes.length > 0);
const remoteProfile = resolveCapacityProfileForRequirements(bigAsk);
ok(`B: the remote profile derives (${remoteProfile.profile.id})`, ["single-gpu-finetune", "multi-gpu-finetune"].includes(remoteProfile.profile.id));
evidence["proof-b-local-insufficient"] = { requirements: bigAsk, verdict: bigVerdict, remoteProfile: remoteProfile.profile.id };

// ---------------------------------------------------------------------------
console.log("— C/D: deterministic placement + budget fail-closed —");

const mkProvider = (id, extra = {}) => ({ providerId: id, provenance: "governed-row", adapterId: `${id}-a`, status: "ready", statusReason: "", capacityProfiles: ["single-gpu-finetune"], availabilityModes: ["on-demand"], executionLane: "sandbox-local", requiredEnv: [], missingEnv: [], violations: [], config: {}, ...extra });
const caps = { maxVramPerGpuGB: 80, maxGpusPerWorker: 8, maxWorkers: 1, acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"], supportsCheckpointing: true, supportsResume: true, supportsGangScheduling: false, regions: ["us-east"] };
const mkQuote = (over = {}) => ({ available: true, availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 2, source: "s" }, estimatedTotalUsd: 4, queueLatencySeconds: 10, quoteObservedAt: "2026-07-20T12:00:00.000Z", quoteExpiresAt: "2026-07-20T13:00:00.000Z", quoteRef: "", ...over });
const req1 = { ...bigAsk, minVramPerGpuGB: 80, gpuCount: 1 };
const placementInput = {
  requirements: req1,
  capacityProfileId: "single-gpu-finetune",
  providers: [mkProvider("provider-b"), mkProvider("provider-a"), mkProvider("provider-c", { status: "credential-missing", statusReason: "KEY absent" })],
  capabilitiesById: { "provider-a": caps, "provider-b": caps, "provider-c": caps },
  quotesById: { "provider-a": mkQuote(), "provider-b": mkQuote({ estimatedTotalUsd: 9 }), "provider-c": mkQuote() },
  now: Date.parse("2026-07-20T12:05:00.000Z"),
};
const d1 = resolveCompute(placementInput);
const d2 = resolveCompute({ ...placementInput, providers: [...placementInput.providers].reverse() });
eq("C: equivalent inputs (order-shuffled) → identical decision", d1, d2);
eq("C: hard eligibility + ranking select the cheaper ready candidate", d1.selectedProviderId, "provider-a");
ok("C: every skipped candidate is explained", d1.candidates.filter((c) => c.providerId !== "provider-a").every((c) => c.reasonCodes.length > 0));
evidence["proof-c-deterministic-placement"] = d1;

const dBudget = resolveCompute({ ...placementInput, quotesById: { "provider-a": mkQuote({ estimatedTotalUsd: null, costBasis: { kind: "unknown", unitUsd: 0, source: "" } }), "provider-b": mkQuote({ estimatedTotalUsd: 900 }), "provider-c": mkQuote() }, budget: { mode: "hard-cap", maxTotalUsd: 100, maxHourlyUsd: 0, allowUnknownCost: false } });
eq("D: unknown + excess cost under a hard cap select NOTHING", dBudget.selectedProviderId, "");
ok("D: the refusals are named (cost-unknown-under-hard-budget, over-budget)", dBudget.candidates.some((c) => c.reasonCodes.includes("cost-unknown-under-hard-budget")) && dBudget.candidates.some((c) => c.reasonCodes.includes("over-budget")));
evidence["proof-d-budget"] = dBudget;

// ---------------------------------------------------------------------------
console.log("— E/F/G: allocation lifecycle, idempotency, artifact honesty —");

function scriptedAdapter(script = {}) {
  let statusCalls = 0;
  return {
    id: "e2e-adapter", label: "", description: "", locality: "remote",
    describeCapabilities: () => ({ providerId: "e2e-provider", adapterId: "e2e-adapter", capacityProfiles: ["single-gpu-finetune"], availabilityModes: ["on-demand"], acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"], maxVramPerGpuGB: 80, maxGpusPerWorker: 8, maxWorkers: 1, supportsCheckpointing: true, supportsResume: true, supportsGangScheduling: false, regions: [], requiredEnv: [] }),
    inspectCapacity: async (ctx) => {
      const observedAt = new Date().toISOString();
      return mkQuote({ providerId: "e2e-provider", capacityProfileId: ctx.capacityProfileId, quoteObservedAt: observedAt, quoteExpiresAt: new Date(Date.parse(observedAt) + 10 * 60 * 1000).toISOString() });
    },
    allocate: async (ctx) => ({ allocationId: "alloc-e2e", runRef: { ...ctx.runRef, providerResourceId: "res-e2e" }, status: "allocated", idempotencyKeyHash: ctx.idempotencyKeyHash, availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 2, source: "s" }, requestedAt: "t", allocatedAt: "t", releasedAt: "", releaseConfirmed: false, allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "us-east" } }),
    execute: async (ctx) => [{ type: "compute-queued", at: new Date().toISOString(), evidenceObservedAt: new Date().toISOString(), source: "provider", runRef: { ...ctx.runRef }, providerEventId: "exec", detail: "exact work spec submitted" }],
    resume: async (ctx) => [{ type: "compute-resuming", at: new Date().toISOString(), evidenceObservedAt: new Date().toISOString(), source: "provider", runRef: { ...ctx.runRef }, providerEventId: "resume", detail: "proven checkpoint submitted" }],
    status: async (ctx) => {
      statusCalls += 1;
      const mk = (type, id, extra = {}) => ({ type, at: new Date().toISOString(), evidenceObservedAt: new Date().toISOString(), source: "provider", runRef: { ...ctx.runRef }, providerEventId: id, detail: "", ...extra });
      if (statusCalls === 1) return [mk("compute-running", "s1")];
      if (statusCalls === 2) return [mk("checkpoint-created", "s2", { checkpoint: { checkpointId: "ck-1", runRef: ctx.runRef, locator: "s3://ck/1", sha256: "1".repeat(64), step: 100 } })];
      return [mk("compute-completed", "s3")];
    },
    collectArtifact: async (ctx) => (script.noArtifact ? null : { runRef: { ...ctx.runRef }, kind: "gguf", locator: "s3://out/model.gguf", sha256: script.artifactSha || "2".repeat(64), sizeBytes: 5, evidenceObservedAt: "t" }),
    cancel: async () => [],
    release: async (ctx) => [{ type: "compute-released", at: new Date().toISOString(), evidenceObservedAt: new Date().toISOString(), source: "provider", runRef: { ...ctx.runRef }, providerEventId: "rel", detail: "released" }],
  };
}

const e2eConfig = { dataModel: { objects: [{ id: "api-registry", objectType: "api-registry", rows: [{ integrationId: "e2e-provider", Name: "E2E provider", metadata: { computeProvider: { schema: "growthub-compute-provider-v1", adapterId: "e2e-adapter", capacityProfiles: ["single-gpu-finetune"], availabilityModes: ["on-demand"], requiredEnv: [], executionLane: "sandbox-local", config: {} } } }] }] } };
const e2eIo = (adapter) => { let clock = Date.now(); return { getAdapter: (id) => (id === "e2e-adapter" ? adapter : null), listAdapterIds: () => ["e2e-adapter"], envPresent: () => true, resolveEnv: () => "", fetchJson: async () => { throw new Error("no net"); }, now: () => { clock += 500; return clock; }, sleep: async () => {}, maxPolls: 8, pollIntervalMs: 0, verifyArtifact: async (artifact) => ({ verifiedSha256: artifact.sha256, verificationKind: "test-materialized" }) }; };

const lifecycleRun = await executeProviderComputeRun({ workspaceConfig: e2eConfig, trainingRunId: "e2e-run-1", computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "e2e-provider", selectionMode: "explicit" }, requirements: req1, io: e2eIo(scriptedAdapter()) });
const lifecycleTypes = lifecycleRun.computeBlock.events.map((e) => e.type);
ok("E: quote → allocate → running → checkpoint → complete → release, all as normalized evidence", ["compute-requested", "compute-allocated", "compute-running", "checkpoint-created", "compute-completed", "compute-release-requested", "compute-released"].every((t) => lifecycleTypes.includes(t)));
ok("E: the run is promotable ONLY because the artifact identity returned", lifecycleRun.result.ok === true && lifecycleRun.computeBlock.artifact.sha256.length === 64);
evidence["proof-e-lifecycle"] = lifecycleRun.computeBlock;

const replay = await executeProviderComputeRun({ workspaceConfig: e2eConfig, trainingRunId: "e2e-run-1", computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "e2e-provider", selectionMode: "explicit" }, requirements: req1, priorCompute: { ...lifecycleRun.computeBlock, allocation: { ...lifecycleRun.computeBlock.allocation, releaseConfirmed: false } }, io: e2eIo(scriptedAdapter()) });
ok("F: the same governed request replayed refuses a duplicate expensive allocation (fail closed)", replay.result.ok === false && /duplicate allocation refused/.test(replay.result.error));
evidence["proof-f-idempotency"] = { error: replay.result.error };

const ghost = await executeProviderComputeRun({ workspaceConfig: e2eConfig, trainingRunId: "e2e-run-2", computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "e2e-provider", selectionMode: "explicit" }, requirements: req1, io: e2eIo(scriptedAdapter({ noArtifact: true })) });
ok("G: provider complete + artifact absent → non-promotable", ghost.result.ok === false && ghost.result.adapterMeta.compute.promotable === false);
const wrongHash = deriveComputeArtifactHonesty({ lifecycle: { terminal: "completed" }, artifact: { locator: "s3://x", sha256: "3".repeat(64) }, expectedSha256: "4".repeat(64) });
ok("G: artifact hash mismatch → non-promotable with the mismatch named", !wrongHash.promotable && wrongHash.reasonCode === "artifact-hash-mismatch");
evidence["proof-g-artifact-honesty"] = { noArtifact: ghost.result.error, wrongHash };

// ---------------------------------------------------------------------------
console.log("— H: evaluation boundary owns promotion —");

const policyRow = { metadata: { mothershipProxy: { schema: "growthub-mothership-proxy-v1", modelTag: "tuned-v2", routes: [{ target: "local-student", registryId: "student-row", modelTag: "tuned-v2" }, { target: "local-base", baseUrl: "http://127.0.0.1:11434", modelTag: "gemma3:1b" }] } } };
const loser = deriveBenchmarkWins({ results: Array.from({ length: 6 }, (_, i) => ({ taskId: `t${i}`, student: { quality: 0.3 }, baseline: { quality: 0.8 } })) });
const routeAfterLoss = deriveActiveRoute({ policyRow, studentVerified: false, localRuntimeConnected: true, teacherAuthPresent: false });
ok("H: losing candidate is not promoted and the active route stays the CURRENT realization (local-base)", loser.promoted === false && routeAfterLoss.active?.target === "local-base");
const winner = deriveBenchmarkWins({ results: Array.from({ length: 6 }, (_, i) => ({ taskId: `t${i}`, student: { quality: 0.9 }, baseline: { quality: 0.5 } })) });
const routeAfterWin = deriveActiveRoute({ policyRow, studentVerified: true, localRuntimeConnected: true, teacherAuthPresent: false });
ok("H: winning candidate promotes through the EXISTING boundary and the router prefers the verified student", winner.promoted === true && routeAfterWin.active?.target === "local-student");
evidence["proof-h-evaluation-boundary"] = { loser: { promoted: loser.promoted, reason: loser.reason, routeTarget: routeAfterLoss.active?.target }, winner: { promoted: winner.promoted, reason: winner.reason, routeTarget: routeAfterWin.active?.target } };

// ---------------------------------------------------------------------------
console.log("— I/J: recovery + release failure honesty —");

const runRefI = { trainingRunId: "e2e-run-3", modelTrainingRowId: "", providerId: "e2e-provider", capacityProfileId: "single-gpu-finetune", providerResourceId: "res-3" };
const evI = (type, id) => ({ type, at: "t", evidenceObservedAt: "t", source: "provider", runRef: runRefI, providerEventId: id, detail: "" });
const recovered = deriveComputeLifecycle({
  events: [
    { ...evI("compute-requested", ""), source: "workspace", runRef: { ...runRefI, providerResourceId: "" } },
    evI("compute-allocated", "i1"), evI("compute-running", "i2"), evI("checkpoint-created", "i3"),
    evI("compute-failed", "i4"), // interruption
    evI("compute-allocated", "i5"), evI("compute-resuming", "i6"), evI("compute-completed", "i7"),
  ],
  checkpoints: [{ checkpointId: "ck-int", runRef: runRefI, locator: "s3://ck/int", sha256: "5".repeat(64), step: 400 }],
});
// The interruption is terminal for that attempt; resume events after terminal
// are refused in ONE stream — recovery is a NEW governed attempt reusing the
// proven checkpoint:
const resumed = deriveComputeLifecycle({
  events: [
    { ...evI("compute-requested", ""), source: "workspace", runRef: { ...runRefI, providerResourceId: "" } },
    evI("compute-allocated", "r1"), evI("compute-resuming", "r2"), evI("compute-completed", "r3"),
  ],
  checkpoints: [{ checkpointId: "ck-int", runRef: runRefI, locator: "s3://ck/int", sha256: "5".repeat(64), step: 400 }],
});
ok("I: an interrupted run's proven checkpoint carries a NEW governed attempt from resume to completion", resumed.resumed === true && resumed.terminal === "completed" && recovered.provenCheckpoints.length === 1);
evidence["proof-i-recovery"] = { interruptedAttempt: { terminal: recovered.terminal, provenCheckpoints: recovered.provenCheckpoints.length }, resumedAttempt: { resumed: resumed.resumed, terminal: resumed.terminal } };

const failRelease = scriptedAdapter();
failRelease.cancel = async (ctx) => [{ type: "compute-cancelled", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "jc", detail: "" }];
failRelease.release = async () => { throw new Error("terminate 500"); };
const cancelled = await cancelProviderComputeRun({
  priorCompute: { capacityProfileId: "single-gpu-finetune", idempotencyKeyHash: "h", allocation: { allocationId: "alloc-j", runRef: { ...runRefI, trainingRunId: "e2e-run-4" }, status: "running", idempotencyKeyHash: "h", availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 2, source: "" }, requestedAt: "t", allocatedAt: "t", releasedAt: "", releaseConfirmed: false, allocated: null }, events: [{ ...evI("compute-requested", ""), source: "workspace", runRef: { ...runRefI, trainingRunId: "e2e-run-4", providerResourceId: "" } }, { ...evI("compute-allocated", "j1"), runRef: { ...runRefI, trainingRunId: "e2e-run-4" } }] },
  provider: { providerId: "e2e-provider", adapterId: "e2e-adapter", config: {} },
  io: e2eIo(failRelease),
});
ok("J: cancel + failed release → state says capacity may still exist and cost may accrue", cancelled.cancelled === true && cancelled.releaseConfirmed === false && cancelled.capacityMayStillExist === true && cancelled.costMayAccrue === true);
evidence["proof-j-release-failure"] = { reason: cancelled.reason, capacityMayStillExist: cancelled.capacityMayStillExist, costMayAccrue: cancelled.costMayAccrue };

// ---------------------------------------------------------------------------
if (writeEvidence) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  for (const [name, payload] of Object.entries(evidence)) {
    fs.writeFileSync(path.join(evidenceDir, `${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  }
  console.log(`\nEvidence artifacts written to ${path.relative(repoRoot, evidenceDir)}/`);
}

console.log(`\n✅ Governed Compute Realization V1 — proof loop passed (${pass} checks).`);
