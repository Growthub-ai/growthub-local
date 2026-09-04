import assert from "node:assert/strict";
import test from "node:test";

import {
  callbackUrl,
  run,
  status,
} from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/sandboxes/adapters/vercel-function.js";
import {
  classifySandboxRunResult,
  isRecoverableProviderContinuationRecord,
  sandboxRunHttpProjection,
} from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/orchestration-graph-runner.js";

const contract = {
  schema: "growthub-routine-cloud-environment-v1",
  environmentId: "routine-env-1",
  instance: { id: "workspace-1", slug: "project-workspace-1" },
  sandbox: { objectId: "chat-scheduling", rowName: "Daily readiness" },
  workflow: { sourceId: "workflow-1", versionId: "version-1", version: 1 },
  deployment: { targetId: "target-1" },
  controlPlane: { runtimeUrl: "https://gh-app.example" },
};

test("derives only the exact HTTPS control-plane callback", () => {
  assert.equal(callbackUrl(contract)?.toString(), "https://gh-app.example/api/workspaces/routine-environments/execute");
  assert.equal(callbackUrl({ ...contract, controlPlane: { runtimeUrl: "http://gh-app.example" } }), null);
  assert.equal(callbackUrl({ ...contract, controlPlane: { runtimeUrl: "https://user:pass@gh-app.example" } }), null);
});

test("executes with the short-lived Vercel identity and never returns it", async () => {
  const priorFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({
      ok: true,
      status: 200,
      summary: "Workspace ready",
      contentText: "Workspace ready",
      output: { text: "Workspace ready" },
      uiParts: [{ type: "text", text: "Workspace ready" }],
      providerRunId: "run-1",
      workflowRunId: "workflow-run-1",
      executionContractSha256: "c".repeat(64),
      registrationContractSha256: "d".repeat(64),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await run({
      runId: "run-1",
      timeoutMs: 5_000,
      runInputs: { prompt: "Summarize readiness" },
      routineEnvironmentContract: contract,
      routineEnvironmentProofKey: "a".repeat(64),
      routineEnvironmentDraftSha256: "b".repeat(64),
    }, { getOidcToken: async () => "header.payload.signature" });
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    assert.equal(request.url, "https://gh-app.example/api/workspaces/routine-environments/execute");
    assert.equal(request.init.headers.Authorization, "Bearer header.payload.signature");
    assert.equal(request.init.headers["x-vercel-trusted-oidc-idp-token"], "header.payload.signature");
    assert.deepEqual(JSON.parse(request.init.body), {
      instanceId: "workspace-1",
      instanceSlug: "project-workspace-1",
      objectId: "chat-scheduling",
      rowName: "Daily readiness",
      environmentId: "routine-env-1",
      deploymentTargetId: "target-1",
      draftSha256: "b".repeat(64),
      proofKey: "a".repeat(64),
      targetRunId: "run-1",
      runInputs: { prompt: "Summarize readiness" },
    });
    assert.deepEqual(result.routineProviderProof, {
      providerRunId: "run-1",
      workflowRunId: "workflow-run-1",
      executionContractSha256: "c".repeat(64),
      registrationContractSha256: "d".repeat(64),
    });
    assert.equal(JSON.stringify(result).includes("header.payload.signature"), false);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("drops incomplete or mismatched provider proof instead of inferring it", async () => {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    status: 200,
    summary: "done",
    contentText: "done",
    providerRunId: "different-run",
    workflowRunId: "workflow-run-1",
    executionContractSha256: "c".repeat(64),
    registrationContractSha256: "d".repeat(64),
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await run({
      runId: "run-1",
      timeoutMs: 5_000,
      routineEnvironmentContract: contract,
      routineEnvironmentProofKey: "a".repeat(64),
      routineEnvironmentDraftSha256: "b".repeat(64),
    }, { getOidcToken: async () => "header.payload.signature" });
    assert.equal(result.ok, true);
    assert.equal(result.routineProviderProof, undefined);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("fails closed when no deployment identity is present", async () => {
  const result = await run({
    runId: "run-1",
    routineEnvironmentContract: contract,
    routineEnvironmentProofKey: "a".repeat(64),
    routineEnvironmentDraftSha256: "b".repeat(64),
  }, { getOidcToken: async () => undefined });
  assert.equal(result.ok, false);
  assert.match(result.error, /short-lived Vercel OIDC identity/);
});

test("reads a completed durable result by the same frozen run identity", async () => {
  const priorFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({
      ok: true,
      terminal: true,
      state: "completed",
      status: 200,
      summary: "Workspace ready",
      contentText: "Workspace ready",
      output: { text: "Workspace ready" },
      uiParts: [{ type: "text", text: "Workspace ready" }],
      providerRunId: "run-1",
      workflowRunId: "workflow-run-1",
      executionContractSha256: "c".repeat(64),
      registrationContractSha256: "d".repeat(64),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const observed = await status({
      runId: "run-1",
      recoveredWorkflowRunId: "workflow-run-1",
      runInputs: { prompt: "Summarize readiness" },
      routineEnvironmentContract: contract,
      routineEnvironmentProofKey: "a".repeat(64),
      routineEnvironmentDraftSha256: "b".repeat(64),
    }, { getOidcToken: async () => "header.payload.signature" });
    assert.equal(observed.terminal, true);
    assert.equal(observed.state, "completed");
    assert.equal(observed.result.ok, true);
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.body, undefined);
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/workspaces/routine-environments/execute");
    assert.equal(url.searchParams.get("targetRunId"), "run-1");
    assert.equal(url.searchParams.get("workflowRunId"), "workflow-run-1");
    assert.equal(url.searchParams.get("instanceId"), "workspace-1");
    assert.equal(url.searchParams.get("draftSha256"), "b".repeat(64));
    assert.equal(url.searchParams.has("runInputs"), false);
    assert.deepEqual(observed.result.routineProviderProof, {
      providerRunId: "run-1",
      workflowRunId: "workflow-run-1",
      executionContractSha256: "c".repeat(64),
      registrationContractSha256: "d".repeat(64),
    });
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("keeps a durable result nonterminal while the canonical workflow is running", async () => {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    terminal: false,
    state: "running",
    targetRunId: "run-1",
  }), { status: 202, headers: { "content-type": "application/json" } });
  try {
    const observed = await status({
      runId: "run-1",
      routineEnvironmentContract: contract,
      routineEnvironmentProofKey: "a".repeat(64),
      routineEnvironmentDraftSha256: "b".repeat(64),
    }, { getOidcToken: async () => "header.payload.signature" });
    assert.deepEqual(observed, { terminal: false, state: "running" });
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("returns provider HTTP 202 as a durable pending continuation, not a failed execution", async () => {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    terminal: false,
    state: "awaiting-provider",
    status: 202,
    providerRunId: "run-1",
    workflowRunId: "workflow-run-1",
    continuation: { commandId: "command-1" },
  }), { status: 202, headers: { "content-type": "application/json" } });
  try {
    const result = await run({
      runId: "run-1",
      timeoutMs: 5_000,
      routineEnvironmentContract: contract,
      routineEnvironmentProofKey: "a".repeat(64),
      routineEnvironmentDraftSha256: "b".repeat(64),
    }, { getOidcToken: async () => "header.payload.signature" });
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, null);
    assert.equal(result.error, undefined);
    assert.equal(result.pending, true);
    assert.equal(result.executionStatus, "awaiting_provider");
    assert.deepEqual(result.continuation, { commandId: "command-1" });
    assert.deepEqual(result.adapterMeta.providerContinuation, {
      pending: true,
      workflowRunId: "workflow-run-1",
      providerRunId: "run-1",
    });
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("classifies a durable provider continuation as pending and unpublishable", () => {
  const completion = classifySandboxRunResult({
    pending: true,
    executionStatus: "awaiting_provider",
    adapterMeta: { providerContinuation: { pending: true } },
  });
  assert.deepEqual(completion, {
    awaitingToolResult: false,
    awaitingProvider: true,
    auditUnpersisted: false,
    computePending: false,
    runOk: false,
    executionStatus: "awaiting_provider",
    rowStatus: "pending",
    outcomeStatus: "drafted",
  });
  assert.deepEqual(sandboxRunHttpProjection(completion), {
    ok: true,
    httpStatus: 202,
    accepted: true,
    pending: true,
    terminal: false,
  });
});

test("keeps terminal sandbox success and failure on the ordinary response contract", () => {
  assert.deepEqual(sandboxRunHttpProjection(classifySandboxRunResult({ exitCode: 0 })), {
    ok: true,
    httpStatus: 200,
    accepted: false,
    pending: false,
    terminal: true,
  });
  assert.deepEqual(sandboxRunHttpProjection(classifySandboxRunResult({
    exitCode: 1,
    error: "provider failed",
  })), {
    ok: false,
    httpStatus: 200,
    accepted: false,
    pending: false,
    terminal: true,
  });
});

test("recovers only the exact legacy provider HTTP 202 transport record", () => {
  const legacyRecord = {
    error: "control-plane workflow execution returned HTTP 202",
    adapterMeta: { httpStatus: 202 },
  };
  assert.equal(isRecoverableProviderContinuationRecord(legacyRecord), true);
  assert.equal(isRecoverableProviderContinuationRecord({
    ...legacyRecord,
    adapterMeta: { httpStatus: 500 },
  }), false);
  assert.equal(isRecoverableProviderContinuationRecord({
    ...legacyRecord,
    error: "control-plane workflow execution returned HTTP 202 with unrelated details",
  }), false);
});

test("preserves the Workspace serverless ceiling for long-running provider turns", async () => {
  const priorFetch = globalThis.fetch;
  const priorTimeout = AbortSignal.timeout;
  let observedTimeout = null;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    status: 200,
    summary: "done",
    contentText: "done",
  }), { status: 200, headers: { "content-type": "application/json" } });
  AbortSignal.timeout = (milliseconds) => {
    observedTimeout = milliseconds;
    return priorTimeout.call(AbortSignal, 1_000);
  };
  try {
    const result = await run({
      runId: "run-long",
      timeoutMs: 600_000,
      runInputs: { prompt: "Run the provider task" },
      routineEnvironmentContract: contract,
      routineEnvironmentProofKey: "a".repeat(64),
      routineEnvironmentDraftSha256: "b".repeat(64),
    }, { getOidcToken: async () => "header.payload.signature" });
    assert.equal(result.ok, true);
    assert.equal(observedTimeout, 600_000);
  } finally {
    AbortSignal.timeout = priorTimeout;
    globalThis.fetch = priorFetch;
  }
});
