/**
 * Growthub control-plane workflow adapter.
 *
 * Routine drafts created from GH App workflows remain owned by GH App. The
 * deployed Workspace proves the run without copying credentials or inventing
 * a second workflow engine: it presents its short-lived Vercel OIDC identity
 * to the control plane, which re-reads and executes the exact pinned workflow.
 * The ordinary sandbox-run route then persists the returned result in this
 * Workspace's canonical source-record stream.
 */

import { registerSandboxAdapter } from "../sandbox-adapter-registry.js";
import { normalizeRoutineProviderProof } from "../../../routine-provider-proof.js";

const CALLBACK_PATH = "/api/workspaces/routine-environments/execute";
const MAX_RESPONSE_BYTES = 1_048_576;

function clean(value, max = 500) {
  const result = String(value == null ? "" : value).trim();
  return result && result.length <= max ? result : "";
}

function callbackUrl(contract) {
  const runtimeUrl = clean(contract?.controlPlane?.runtimeUrl, 2048);
  if (!runtimeUrl) return null;
  try {
    const url = new URL(CALLBACK_PATH, runtimeUrl);
    const base = new URL(runtimeUrl);
    if (
      base.protocol !== "https:"
      || base.username
      || base.password
      || url.origin !== base.origin
      || url.pathname !== CALLBACK_PATH
    ) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

async function boundedJson(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error("control-plane workflow response exceeded the governed limit");
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("control-plane workflow response exceeded the governed limit");
  }
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

function callbackBody(request) {
  const contract = request?.routineEnvironmentContract;
  const recoveredWorkflowRunId = clean(request?.recoveredWorkflowRunId, 200);
  return {
    instanceId: clean(contract?.instance?.id, 240),
    instanceSlug: clean(contract?.instance?.slug, 240),
    objectId: clean(contract?.sandbox?.objectId, 240),
    rowName: clean(contract?.sandbox?.rowName, 240),
    environmentId: clean(contract?.environmentId, 240),
    deploymentTargetId: clean(contract?.deployment?.targetId, 240),
    draftSha256: clean(request?.routineEnvironmentDraftSha256, 64),
    proofKey: clean(request?.routineEnvironmentProofKey, 64),
    targetRunId: clean(request?.runId, 200),
    ...(recoveredWorkflowRunId ? { workflowRunId: recoveredWorkflowRunId } : {}),
    runInputs: request?.runInputs && typeof request.runInputs === "object" && !Array.isArray(request.runInputs)
      ? request.runInputs
      : {},
  };
}

// `@vercel/oidc` is a dependency of the deployed Workspace, not of the starter
// kit's host repository. Loading it lazily keeps the adapter registry importable
// in template checks and unit tests where the package is not installed, while a
// deployed Workspace still fails closed when its OIDC identity is unavailable.
async function deployedVercelOidcToken() {
  let mod;
  try {
    mod = await import("@vercel/oidc");
  } catch {
    return "";
  }
  try {
    return await mod.getVercelOidcToken();
  } catch {
    return "";
  }
}

async function callbackIdentity(request, options = {}) {
  const url = callbackUrl(request?.routineEnvironmentContract);
  const resolveOidcToken = typeof options.getOidcToken === "function"
    ? options.getOidcToken
    : deployedVercelOidcToken;
  const token = clean(await resolveOidcToken(), 16_384);
  const body = callbackBody(request);
  if (Object.values(body).some((value) => typeof value === "string" && !value)) {
    return { ok: false, url, token, body, error: "Routine execution identity is incomplete" };
  }
  if (!url) return { ok: false, url, token, body, error: "Routine control-plane callback is not bound to this environment" };
  if (!token) return { ok: false, url, token, body, error: "The deployed Workspace has no short-lived Vercel OIDC identity" };
  return { ok: true, url, token, body };
}

function resultFromPayload({ response, payload, runId, startedAt, url, workflowVersionId }) {
  const awaitingProvider = response.status === 202
    && payload?.ok === true
    && payload?.terminal === false
    && payload?.state === "awaiting-provider"
    && clean(payload?.providerRunId, 200) === clean(runId, 200)
    && Boolean(clean(payload?.workflowRunId, 200));
  const succeeded = response.ok && payload?.ok === true && Number(payload?.status) === 200;
  const routineProviderProof = succeeded
    ? normalizeRoutineProviderProof(payload, runId)
    : null;
  const safeOutput = succeeded
    ? {
        summary: clean(payload?.summary, 20_000),
        contentText: clean(payload?.contentText, 100_000),
        output: payload?.output ?? null,
        uiParts: Array.isArray(payload?.uiParts) ? payload.uiParts : [],
      }
    : null;
  return {
    ok: succeeded,
    exitCode: awaitingProvider ? null : succeeded ? 0 : 1,
    durationMs: Date.now() - startedAt,
    stdout: safeOutput ? JSON.stringify(safeOutput) : "",
    stderr: "",
    ...(awaitingProvider ? {
      pending: true,
      executionStatus: "awaiting_provider",
      continuation: payload.continuation,
    } : {}),
    ...(routineProviderProof ? { routineProviderProof } : {}),
    error: succeeded || awaitingProvider
      ? undefined
      : clean(payload?.error, 2_000) || `control-plane workflow execution returned HTTP ${response.status}`,
    adapterMeta: {
      adapter: "vercel-function",
      transport: "vercel-oidc-control-plane",
      callbackOrigin: url.origin,
      httpStatus: response.status,
      workflowVersionId: clean(workflowVersionId, 240) || null,
      ...(awaitingProvider ? {
        providerContinuation: {
          pending: true,
          workflowRunId: clean(payload.workflowRunId, 200),
          providerRunId: clean(payload.providerRunId, 200),
        },
      } : {}),
    },
  };
}

function identityFailure(startedAt, identity) {
  return {
    ok: false,
    exitCode: null,
    durationMs: Date.now() - startedAt,
    stdout: "",
    stderr: "",
    error: identity.error,
    adapterMeta: { adapter: "vercel-function", transport: "vercel-oidc-control-plane" },
  };
}

async function run(request, options = {}) {
  const startedAt = Date.now();
  const identity = await callbackIdentity(request, options);
  if (!identity.ok) return identityFailure(startedAt, identity);
  const { url, token, body } = identity;
  const workflowVersionId = request?.routineEnvironmentContract?.workflow?.versionId;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-vercel-trusted-oidc-idp-token": token,
      },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(Number(request?.timeoutMs) || 120_000, 600_000))),
    });
    const payload = await boundedJson(response);
    return resultFromPayload({ response, payload, runId: body.targetRunId, startedAt, url, workflowVersionId });
  } catch (error) {
    return {
      ok: false,
      exitCode: null,
      durationMs: Date.now() - startedAt,
      stdout: "",
      stderr: "",
      error: error?.name === "TimeoutError"
        ? "control-plane workflow execution timed out"
        : clean(error?.message, 2_000) || "control-plane workflow execution failed",
      adapterMeta: { adapter: "vercel-function", transport: "vercel-oidc-control-plane", callbackOrigin: url.origin },
    };
  }
}

async function status(request, options = {}) {
  const startedAt = Date.now();
  const identity = await callbackIdentity(request, options);
  if (!identity.ok) return { terminal: false, error: identity.error };
  const { url, token, body } = identity;
  const workflowVersionId = request?.routineEnvironmentContract?.workflow?.versionId;
  const statusUrl = new URL(url);
  for (const [key, value] of Object.entries(body)) {
    if (key !== "runInputs") statusUrl.searchParams.set(key, String(value));
  }
  try {
    const response = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "x-vercel-trusted-oidc-idp-token": token,
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await boundedJson(response);
    if (response.status === 202 && payload?.terminal === false) {
      return { terminal: false, state: "running" };
    }
    if (payload?.terminal === true || (response.ok && payload?.ok === true)) {
      return {
        terminal: true,
        state: payload?.ok === true ? "completed" : "failed",
        result: resultFromPayload({ response, payload, runId: body.targetRunId, startedAt, url, workflowVersionId }),
      };
    }
    return {
      terminal: false,
      error: clean(payload?.error, 2_000) || `control-plane workflow status returned HTTP ${response.status}`,
    };
  } catch (error) {
    return { terminal: false, error: clean(error?.message, 2_000) || "control-plane workflow status failed" };
  }
}

registerSandboxAdapter({
  id: "vercel-function",
  label: "Growthub control plane (Vercel OIDC)",
  description: "Executes the exact GH App workflow through its authenticated control plane and returns durable Workspace sandbox evidence.",
  locality: "remote",
  supportedRuntimes: ["node"],
  run,
  status,
});

export { CALLBACK_PATH, callbackBody, callbackUrl, run, status };
