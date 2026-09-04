import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ROUTINE_ENVIRONMENT_PROPOSAL_TYPE,
  normalizeRoutineEnvironmentProposal,
  routineEnvironmentUsesBoundAdapter,
} from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/routine-environment-proposal.js";
import { stableStringify } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-patch-policy.js";

const sha = (value) => createHash("sha256").update(stableStringify(value), "utf8").digest("hex");

function fixture() {
  const objectId = "routine-environments";
  const rowName = "Daily readiness";
  const environmentId = "routine-env-0123456789abcdef01234567";
  const graph = {
    nodes: [{ id: "input", type: "input", config: { fields: [{ id: "prompt", required: false }] } }],
    edges: [],
  };
  const draftSha256 = sha(graph);
  const contract = {
    schema: "growthub-routine-cloud-environment-v1",
    environmentId,
    instance: { id: "workspace-1", slug: "project-workspace-1" },
    sandbox: { objectId, rowName },
    routine: { name: rowName, threadId: "thread-1" },
    workflow: { sourceId: "workflow-1", versionId: "version-1", version: 1, configSha256: sha(graph), capabilityRefs: [] },
    inputMethod: {
      triggerKind: "serverless-scheduler",
      capabilityId: "input-method:upstash",
      registryId: "upstash-qstash",
      providerId: "upstash",
      productId: "qstash",
      connectionRef: { kind: "mcp_connection", id: "connection-1" },
    },
    schedule: {
      scheduleId: "schedule-1",
      version: 1,
      cron: "0 9 * * 1-5",
      region: "eu-central-1",
      destination: "https://workspace.example/api/workspace/workflows/upstash",
      callback: "https://workspace.example/api/workspace/add-ons/upstash/callback?scheduleId=schedule-1",
      failureCallback: "https://workspace.example/api/workspace/add-ons/upstash/failure?scheduleId=schedule-1",
      triggerInput: "Summarize readiness",
      githubEvent: null,
    },
    deployment: {
      targetId: "target-1",
      provider: "vercel",
      projectRef: "project-1",
      repository: "Growthub-OS/gh-agency-portal",
      branch: "codex/workspace-control-plane-oidc",
      runtimeUrl: "https://workspace.example",
    },
    execution: {
      mode: "cloud",
      repository: "Growthub-OS/gh-agency-portal",
      runtimeTargetId: null,
      environment: { name: "Default", networkAccess: "trusted" },
      connectorRefs: [{ kind: "mcp_connection", id: "connector-1" }],
    },
  };
  const proofKey = sha({ contract, draftSha256, artifactSha256: draftSha256 });
  const row = {
    Name: rowName,
    lifecycleStatus: "draft",
    runtime: "node",
    adapter: "vercel-function",
    runLocality: "serverless",
    orchestrationDraftConfig: JSON.stringify(graph),
    orchestrationDraftTestPassed: false,
    orchestrationDraftTestedConfig: "",
    routineEnvironmentId: environmentId,
    routineEnvironmentContract: contract,
    routineEnvironmentDraftSha256: draftSha256,
    routineEnvironmentArtifactSha256: draftSha256,
    routineEnvironmentProofKey: proofKey,
    routineEnvironmentStatus: "draft",
  };
  const proposal = {
    type: ROUTINE_ENVIRONMENT_PROPOSAL_TYPE,
    affectedField: "dataModel",
    payload: {
      stage: "draft",
      objectId,
      rowName,
      environmentId,
      draftSha256,
      artifactSha256: draftSha256,
      proofKey,
      row,
    },
  };
  return { objectId, rowName, environmentId, graph, draftSha256, proofKey, row, proposal };
}

const emptyConfig = () => ({ dataModel: { objects: [] } });

test("delegates only an attested Routine row to the registered remote adapter", () => {
  const { row } = fixture();
  assert.equal(routineEnvironmentUsesBoundAdapter(row, "vercel-function"), true);
  assert.equal(routineEnvironmentUsesBoundAdapter(row, "local-process"), false);
  assert.equal(routineEnvironmentUsesBoundAdapter({ ...row, routineEnvironmentContract: null }, "vercel-function"), false);
});

test("upserts one exact credential-free Routine environment row", () => {
  const sample = fixture();
  const result = normalizeRoutineEnvironmentProposal(sample.proposal, emptyConfig());
  assert.equal(result.ok, true);
  assert.deepEqual(result.artifact, {
    surface: "workflow",
    objectId: sample.objectId,
    rowName: sample.rowName,
    environmentId: sample.environmentId,
    stage: "draft",
    draftSha256: sample.draftSha256,
  });
  const object = result.config.dataModel.objects[0];
  assert.equal(object.objectType, "sandbox-environment");
  assert.deepEqual(object.rows, [{
    ...sample.row,
    runLocality: "local",
    routineEnvironmentTargetLocality: "serverless",
  }]);
});

test("rejects credential material instead of copying it into the Workspace", () => {
  const sample = fixture();
  const proposal = structuredClone(sample.proposal);
  proposal.payload.row.accessToken = "should-never-cross-the-bridge";
  const result = normalizeRoutineEnvironmentProposal(proposal, emptyConfig());
  assert.equal(result.ok, false);
  assert.match(result.error, /credential-shaped material/);
  assert.deepEqual(result.config, emptyConfig());
});

test("attests only the exact durable sandbox run and stamps server-owned proof", () => {
  const sample = fixture();
  const drafted = normalizeRoutineEnvironmentProposal(sample.proposal, emptyConfig());
  assert.equal(drafted.ok, true);
  const runId = "run-0123456789";
  const sourceId = `sandbox:${sample.objectId}:daily-readiness`;
  const outputHash = sha("sandbox output");
  const attest = {
    type: ROUTINE_ENVIRONMENT_PROPOSAL_TYPE,
    affectedField: "dataModel",
    payload: {
      stage: "attest",
      objectId: sample.objectId,
      rowName: sample.rowName,
      environmentId: sample.environmentId,
      draftSha256: sample.draftSha256,
      artifactSha256: sample.draftSha256,
      proofKey: sample.proofKey,
      runId,
      sourceId,
      outputHash,
    },
  };
  const run = {
    runId,
    exitCode: 0,
    useDraft: true,
    draftSha256: sample.draftSha256,
    outputHash,
    ranAt: "2026-08-16T20:00:00.000Z",
  };
  const staleTransportFailure = {
    runId,
    exitCode: null,
    useDraft: true,
    draftSha256: sample.draftSha256,
    error: "fetch failed",
    ranAt: "2026-08-16T19:59:00.000Z",
  };
  const terminalHandle = {
    kind: "growthub-sandbox-run-handle-v1",
    runId,
    outputHash,
    ranAt: "2026-08-16T20:00:01.000Z",
  };
  const result = normalizeRoutineEnvironmentProposal(attest, drafted.config, {
    records: [staleTransportFailure, run, terminalHandle],
  });
  assert.equal(result.ok, true);
  const row = result.config.dataModel.objects[0].rows[0];
  assert.equal(row.routineEnvironmentStatus, "sandbox-verified");
  assert.equal(row.routineEnvironmentRunId, runId);
  assert.equal(row.routineEnvironmentSourceId, sourceId);
  assert.equal(row.routineEnvironmentOutputHash, outputHash);
  assert.equal(row.orchestrationDraftTestPassed, true);
  assert.equal(row.orchestrationDraftTestedConfig, sample.row.orchestrationDraftConfig);
  assert.equal(row.runLocality, "serverless");
});

test("refuses a client attestation without matching durable source evidence", () => {
  const sample = fixture();
  const drafted = normalizeRoutineEnvironmentProposal(sample.proposal, emptyConfig());
  const result = normalizeRoutineEnvironmentProposal({
    type: ROUTINE_ENVIRONMENT_PROPOSAL_TYPE,
    affectedField: "dataModel",
    payload: {
      stage: "attest",
      objectId: sample.objectId,
      rowName: sample.rowName,
      environmentId: sample.environmentId,
      draftSha256: sample.draftSha256,
      artifactSha256: sample.draftSha256,
      proofKey: sample.proofKey,
      runId: "run-forged",
      sourceId: `sandbox:${sample.objectId}:daily-readiness`,
      outputHash: sha("forged"),
    },
  }, drafted.config, { records: [] });
  assert.equal(result.ok, false);
  assert.match(result.error, /not durable/);
});
