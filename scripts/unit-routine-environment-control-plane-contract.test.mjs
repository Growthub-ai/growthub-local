/**
 * GH App ⇄ Workspace contract for the `routine.environment.upsert` lane.
 *
 * Mirrors the exact request GH App builds in
 * `src/lib/deployments/vercel-runtime-secrets.ts::routineEnvironmentHelperBody`
 * (closed key sets, sha256 identities, `responseMode: "receipt"`) and the exact
 * receipt GH App accepts in
 * `src/lib/services/workspace-routine-registration.service.ts::routineHelperArtifact`
 * (`ok === true`, one applied, zero skipped, receipt.type, artifact identity).
 *
 * Guards the five invariants of the lane:
 *   - not an AI-generated WORKSPACE_HELPER_PROPOSAL_TYPES entry
 *   - never passes through workspace-helper-apply.js validation
 *   - no Routine definition is stored in the Workspace row
 *   - the client cannot claim execution success
 *   - receipt-only response carries no workspaceConfig
 *
 * Run with:  node --test scripts/unit-routine-environment-control-plane-contract.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  ROUTINE_ENVIRONMENT_PROPOSAL_TYPE,
  normalizeRoutineEnvironmentProposal,
} from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/routine-environment-proposal.js";
import {
  WORKSPACE_HELPER_PROPOSAL_TYPES,
} from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-helper.js";

// Same receipt shape as workspace-helper-apply.js::buildApplyReceipt. That
// module is Next-alias-only (`@/lib/...`), and this lane deliberately never
// passes a proposal through its validateProposalForApply, so the receipt shape
// is mirrored here rather than imported.
function buildApplyReceipt(proposal, appliedAt, reviewedBy, sessionId) {
  return {
    type: proposal.type,
    affectedField: proposal.affectedField,
    rationale: proposal.rationale,
    confidence: proposal.confidence,
    appliedAt,
    ranAt: appliedAt,
    reviewedBy: reviewedBy || "user",
    sessionId: sessionId || null,
  };
}
import { buildWorkspaceHelperApplyResponse } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-helper-response.js";
import { sandboxRunSourceId } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-data-model.js";

// GH App's canonical JSON (control-plane/canonical-evidence.ts::canonicalJson):
// recursively key-sorted objects, arrays in order, JSON scalars.
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
const sha256Canonical = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");

const OBJECT_ID = "chat-scheduling";
const ROW_NAME = "Weekly market brief";
const INSTANCE_ID = "inst_01HZY";
const graph = {
  nodes: [
    { id: "start", type: "trigger", config: {} },
    { id: "brief", type: "textModel", config: { capabilitySlug: "claude-code" } },
  ],
  edges: [{ from: "start", to: "brief" }],
};

// Mirrors buildRoutineCloudEnvironmentIdentity in gh-app.
function ghAppIdentity() {
  const environmentId = `routine-env-${sha256Canonical({ instanceId: INSTANCE_ID, objectId: OBJECT_ID, rowName: ROW_NAME }).slice(0, 24)}`;
  const contract = {
    schema: "growthub-routine-cloud-environment-v1",
    environmentId,
    instance: { id: INSTANCE_ID, slug: "acme" },
    sandbox: { objectId: OBJECT_ID, rowName: ROW_NAME },
    routine: { name: ROW_NAME, threadId: "thread_1" },
    workflow: { sourceId: "wf_1", versionId: "wfv_1", version: 1, configSha256: sha256Canonical(graph), capabilityRefs: ["claude-code"] },
    inputMethod: { triggerKind: "schedule", capabilityId: "cap_1", registryId: "reg_1", providerId: "upstash", productId: "qstash", connectionRef: null },
    schedule: { scheduleId: "sched_1", version: 1, cron: "0 9 * * 1", region: null, destination: "https://ws.example.com/api/workspace/sandbox-run", callback: "", failureCallback: "", triggerInput: "", githubEvent: null },
    deployment: { targetId: "tgt_1", provider: "vercel", projectRef: "prj_1", repository: "acme/workspace", branch: "main", runtimeUrl: "https://ws.example.com" },
    controlPlane: { runtimeUrl: "https://gh.example.com" },
    execution: { mode: "cloud", repository: "acme/workspace", runtimeTargetId: null, environment: {}, connectorRefs: [], cmsCapabilityRefs: [] },
  };
  const draftSha256 = sha256Canonical(graph);
  const artifactSha256 = draftSha256;
  const proofKey = sha256Canonical({ contract, draftSha256, artifactSha256 });
  return { contract, environmentId, draftSha256, artifactSha256, proofKey };
}

// Mirrors routineEnvironmentHelperBody in gh-app (draft stage).
function ghAppDraftBody(identity) {
  const row = {
    Name: ROW_NAME,
    lifecycleStatus: "draft",
    runLocality: "serverless",
    runtime: "node",
    adapter: "vercel-function",
    status: "draft",
    orchestrationDraftConfig: JSON.stringify(graph),
    routineEnvironmentId: identity.environmentId,
    routineEnvironmentDraftSha256: identity.draftSha256,
    routineEnvironmentArtifactSha256: identity.artifactSha256,
    routineEnvironmentProofKey: identity.proofKey,
    routineEnvironmentStatus: "draft",
    routineEnvironmentContract: identity.contract,
  };
  return {
    proposals: [{
      type: "routine.environment.upsert",
      affectedField: "dataModel",
      payload: {
        stage: "draft",
        objectId: OBJECT_ID,
        rowName: ROW_NAME,
        environmentId: identity.environmentId,
        draftSha256: identity.draftSha256,
        artifactSha256: identity.artifactSha256,
        proofKey: identity.proofKey,
        row,
      },
      rationale: "Save the exact credential-free Routine environment draft in the bound Workspace.",
      confidence: 1,
    }],
    reviewedBy: "gh-app:user_1",
    sessionId: "routine-env-session-1",
    responseMode: "receipt",
  };
}

function ghAppAttestBody(identity, { runId, sourceId, outputHash }) {
  return {
    proposals: [{
      type: "routine.environment.upsert",
      affectedField: "dataModel",
      payload: {
        stage: "attest",
        objectId: OBJECT_ID,
        rowName: ROW_NAME,
        environmentId: identity.environmentId,
        draftSha256: identity.draftSha256,
        artifactSha256: identity.artifactSha256,
        proofKey: identity.proofKey,
        runId,
        sourceId,
        outputHash,
      },
      rationale: "Attest the exact Routine environment from the bound Workspace sandbox source record.",
      confidence: 1,
    }],
    reviewedBy: "gh-app:user_1",
    sessionId: "routine-env-session-2",
    responseMode: "receipt",
  };
}

// The exact acceptance check GH App runs on the helper response.
function ghAppRoutineHelperArtifact(response, expected, stage) {
  const applied = Array.isArray(response?.applied) ? response.applied : [];
  const skipped = Array.isArray(response?.skipped) ? response.skipped : [];
  if (response?.ok !== true || applied.length !== 1 || skipped.length !== 0) return null;
  const receipt = applied[0];
  const artifact = receipt?.artifact;
  if (
    receipt?.type !== "routine.environment.upsert"
    || artifact?.environmentId !== expected.environmentId
    || artifact?.objectId !== expected.contract.sandbox.objectId
    || artifact?.rowName !== expected.contract.sandbox.rowName
    || artifact?.stage !== stage
    || artifact?.draftSha256 !== expected.draftSha256
  ) return null;
  return artifact;
}

// Runs the same steps helper/apply route.js performs for this lane.
function applyLane(body, workspaceConfig, sourceRecords = null) {
  const applied = [];
  const skipped = [];
  let working = workspaceConfig;
  for (const proposal of body.proposals) {
    const result = normalizeRoutineEnvironmentProposal(proposal, working, sourceRecords);
    if (!result.ok) { skipped.push({ proposal, reason: result.error }); continue; }
    working = result.config;
    applied.push({
      ...buildApplyReceipt({ ...proposal, affectedField: "dataModel" }, "2026-09-04T00:00:00.000Z", body.reviewedBy, body.sessionId),
      artifact: result.artifact,
      summary: result.summary,
    });
  }
  const response = buildWorkspaceHelperApplyResponse({
    responseMode: body.responseMode,
    threadId: null,
    applied,
    skipped,
    workspaceConfig: working,
    messages: undefined,
  });
  return { response, config: working };
}

const emptyConfig = { dataModel: { objects: [] } };

test("routine.environment.upsert is not an AI-generated helper type", () => {
  // Generic apply (workspace-helper-apply.js) throws `unknown proposal type`
  // for anything outside this list, which is exactly why helper/apply must
  // partition the lane before generic validation.
  assert.equal(WORKSPACE_HELPER_PROPOSAL_TYPES.includes(ROUTINE_ENVIRONMENT_PROPOSAL_TYPE), false);
  assert.equal(WORKSPACE_HELPER_PROPOSAL_TYPES.includes("custom-model.workflow.create"), false);
});

test("draft: GH App's exact body is accepted, one sandbox row is upserted, receipt matches GH App's check", () => {
  const identity = ghAppIdentity();
  const body = ghAppDraftBody(identity);
  const { response, config } = applyLane(body, emptyConfig);

  assert.ok(ghAppRoutineHelperArtifact(response, identity, "draft"), JSON.stringify(response.skipped));
  assert.equal("workspaceConfig" in response, false, "receipt mode must not echo the whole Workspace");

  const object = config.dataModel.objects.find((o) => o.id === OBJECT_ID);
  assert.equal(object.objectType, "sandbox-environment");
  assert.equal(object.rows.length, 1);
  const row = object.rows[0];
  assert.equal(row.routineEnvironmentStatus, "draft");
  assert.equal(row.adapter, "vercel-function");
  // Draft tests run inside this authenticated request; attestation restores locality.
  assert.equal(row.runLocality, "local");
  assert.equal(row.routineEnvironmentTargetLocality, "serverless");
  // Execution evidence only — no Routine definition, schedule owner, or credential.
  for (const key of ["routine", "schedule", "providerBinding", "claims", "runs", "threads", "apiKey", "token", "authorization"]) {
    assert.equal(key in row, false, `row must not carry ${key}`);
  }
});

test("draft is idempotent: resubmitting the same identity does not duplicate the row", () => {
  const identity = ghAppIdentity();
  const first = applyLane(ghAppDraftBody(identity), emptyConfig);
  const second = applyLane(ghAppDraftBody(identity), first.config);
  assert.ok(ghAppRoutineHelperArtifact(second.response, identity, "draft"));
  assert.equal(second.config.dataModel.objects.find((o) => o.id === OBJECT_ID).rows.length, 1);
});

test("draft refuses a credential-shaped row and a tampered digest", () => {
  const identity = ghAppIdentity();
  const leaked = ghAppDraftBody(identity);
  leaked.proposals[0].payload.row.execution = { apiKey: "sk-0123456789abcdef0123456789" };
  const leakedResult = applyLane(leaked, emptyConfig);
  assert.equal(leakedResult.response.applied.length, 0);
  assert.match(leakedResult.response.skipped[0].reason, /credential-shaped/);

  const tampered = ghAppDraftBody(identity);
  tampered.proposals[0].payload.row.orchestrationDraftConfig = JSON.stringify({ ...graph, nodes: [] });
  const tamperedResult = applyLane(tampered, emptyConfig);
  assert.equal(tamperedResult.response.applied.length, 0);
  assert.match(tamperedResult.response.skipped[0].reason, /draft bytes do not match/);
});

test("attest: the client cannot claim success; only a persisted exact terminal record promotes the row", () => {
  const identity = ghAppIdentity();
  const { config: drafted } = applyLane(ghAppDraftBody(identity), emptyConfig);
  const sourceId = sandboxRunSourceId(OBJECT_ID, ROW_NAME);
  const runId = "run_9f1c2b3a4d5e6f7081920a1b2c3d4e5f";
  const outputHash = "deadbeefdeadbeefdeadbeefdeadbeef";
  const attest = ghAppAttestBody(identity, { runId, sourceId, outputHash });

  // 1. No source record at all → refused.
  const missing = applyLane(attest, drafted, null);
  assert.equal(missing.response.applied.length, 0);
  assert.match(missing.response.skipped[0].reason, /not durable/);

  // 2. Only an admission handle (state completed) → refused; handles are not evidence.
  const handleOnly = { records: [{ kind: "growthub-sandbox-run-handle-v1", runId, state: "completed", terminal: true }] };
  const handleResult = applyLane(attest, drafted, handleOnly);
  assert.equal(handleResult.response.applied.length, 0);

  // 3. A failed transport record followed by the exact terminal execution → newest exact record wins.
  const records = {
    records: [
      { kind: "growthub-sandbox-run-handle-v1", runId, state: "running", terminal: false },
      { runId, exitCode: null, error: "fetch failed", useDraft: true, draftSha256: identity.draftSha256, adapter: "vercel-function" },
      { runId, exitCode: 0, useDraft: true, draftSha256: identity.draftSha256, outputHash, adapter: "vercel-function", ranAt: "2026-09-04T00:01:00.000Z", providerRunId: runId, workflowRunId: "wfr_1" },
    ],
  };
  const attested = applyLane(attest, drafted, records);
  const artifact = ghAppRoutineHelperArtifact(attested.response, identity, "sandbox-verified");
  assert.ok(artifact, JSON.stringify(attested.response.skipped));
  assert.equal(artifact.runId, runId);
  assert.equal(artifact.sourceId, sourceId);
  assert.equal(artifact.outputHash, outputHash);
  assert.equal("workspaceConfig" in attested.response, false);

  const row = attested.config.dataModel.objects.find((o) => o.id === OBJECT_ID).rows[0];
  assert.equal(row.routineEnvironmentStatus, "sandbox-verified");
  assert.equal(row.routineEnvironmentRunId, runId);
  assert.equal(row.routineEnvironmentSourceId, sourceId);
  assert.equal(row.routineEnvironmentOutputHash, outputHash);
  assert.equal(row.orchestrationDraftTestPassed, true);
  assert.equal(row.runLocality, "serverless");

  // 4. Wrong outputHash for the same runId → refused.
  const wrongHash = ghAppAttestBody(identity, { runId, sourceId, outputHash: "0000000000000000" });
  const wrong = applyLane(wrongHash, drafted, records);
  assert.equal(wrong.response.applied.length, 0);

  // 5. Wrong sourceId (not this row's canonical sandbox stream) → refused.
  const wrongSource = ghAppAttestBody(identity, { runId, sourceId: "sandbox:other:row", outputHash });
  const wrongSourceResult = applyLane(wrongSource, drafted, records);
  assert.equal(wrongSourceResult.response.applied.length, 0);
  assert.match(wrongSourceResult.response.skipped[0].reason, /canonical sandbox stream/);
});
