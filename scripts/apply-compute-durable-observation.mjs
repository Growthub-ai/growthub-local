#!/usr/bin/env node
/**
 * Replace browser-dependent remote observation with a signed QStash
 * continuation on the existing sandbox-run authority. Idempotent and intended
 * to run after apply-compute-observation-hardening.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[durable-observe] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[durable-observe] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOrSkip(source, before, after, marker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (marker && source.includes(marker)) return source;
  throw new Error(`[durable-observe] neither old nor integrated form found: ${label}`);
}

function insertBefore(source, anchor, addition, marker, label) {
  if (marker && source.includes(marker)) return source;
  return replaceOnce(source, anchor, addition + anchor, label);
}

// ---------------------------------------------------------------------------
// Receipt-safe observation journal.
// ---------------------------------------------------------------------------
const evidencePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-evidence.js";
let evidence = read(evidencePath);
evidence = insertBefore(
  evidence,
  `export function normalizeComputeArtifactRef(raw) {`,
  `export function normalizeComputeObservationEvidence(raw) {
  if (!raw || typeof raw !== "object") return null;
  const status = String(raw.status || "").trim();
  return {
    schema: String(raw.schema || "").trim(),
    mode: ["qstash", "manual"].includes(raw.mode) ? raw.mode : "manual",
    status: ["scheduled", "delivered", "schedule-failed", "manual", "exhausted", "terminal"].includes(status) ? status : "manual",
    attempt: Math.max(0, Math.floor(num(raw.attempt))),
    nextAttempt: Math.max(0, Math.floor(num(raw.nextAttempt))),
    maxAttempts: Math.max(0, Math.floor(num(raw.maxAttempts))),
    requestId: str(raw.requestId).trim(),
    messageId: str(raw.messageId).trim(),
    scheduleId: str(raw.scheduleId).trim(),
    scheduledAt: str(raw.scheduledAt).trim(),
    nextObservationAt: str(raw.nextObservationAt).trim(),
    lastObservedAt: str(raw.lastObservedAt).trim(),
    lastErrorCode: str(raw.lastErrorCode).trim(),
    authorityHash: str(raw.authorityHash).trim(),
    workSpecHash: str(raw.workSpecHash).trim(),
  };
}

`,
  `export function normalizeComputeObservationEvidence`,
  "observation normalizer",
);
evidence = replaceOrSkip(
  evidence,
  `    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : null,
    evaluation: raw.evaluation && typeof raw.evaluation === "object" ? raw.evaluation : null,`,
  `    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : null,
    observation: normalizeComputeObservationEvidence(raw.observation),
    evaluation: raw.evaluation && typeof raw.evaluation === "object" ? raw.evaluation : null,`,
  `observation: normalizeComputeObservationEvidence(raw.observation)`,
  "observation in compute block",
);
write(evidencePath, evidence);

// ---------------------------------------------------------------------------
// Remote paid execution cannot start without a durable observer in production;
// observation state merges monotonically.
// ---------------------------------------------------------------------------
const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
execution = replaceOrSkip(
  execution,
  `    capabilities: incoming.capabilities || prior.capabilities,
`,
  `    capabilities: incoming.capabilities || prior.capabilities,
    observation: incoming.observation || prior.observation
      ? { ...(prior.observation || {}), ...(incoming.observation || {}) }
      : null,
`,
  `observation: incoming.observation || prior.observation`,
  "monotonic observation evidence",
);
execution = replaceOrSkip(
  execution,
  `  if (selectedId === LOCAL_PROVIDER_ID) return { localFallthrough: true, computeBlock: prior, result: null };

  const provider = observableProviders.find((candidate) => candidate.providerId === selectedId);`,
  `  if (selectedId === LOCAL_PROVIDER_ID) return { localFallthrough: true, computeBlock: prior, result: null };

  // A paid/remote production allocation is unsafe when the initiating request
  // is the only observer. QStash readiness is server-owned and checked before
  // allocation; local/test operation may still use explicit/manual observe.
  if (io.requireDurableObservation === true && io.observationSchedulerReady !== true) {
    const blocked = normalizeComputeBlock({
      capacityProfileId,
      selectionMode: decision.selectionMode,
      decision,
      authority: sealedAuthority,
      intent,
      workSpec,
      policy,
      observation: {
        schema: "growthub-compute-observation-v1",
        mode: "manual",
        status: "manual",
        attempt: 0,
        nextAttempt: 1,
        maxAttempts: 0,
        requestId: "",
        messageId: "",
        scheduleId: "",
        scheduledAt: "",
        nextObservationAt: "",
        lastObservedAt: "",
        lastErrorCode: "observation-scheduler-unavailable",
        authorityHash: str(sealedAuthority?.authorityHash),
        workSpecHash: str(workSpec?.workSpecHash),
      },
      evidenceObservedAt: nowIso(io),
    });
    const computeBlock = await persistMerged(io, prior, blocked);
    return {
      localFallthrough: false,
      computeBlock,
      result: {
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: "durable-observation-unavailable: remote production compute requires a configured signed QStash observer before paid allocation",
        adapterMeta: { adapter: "provider-compute", providerId: selectedId, compute: { blocked: true, reasonCode: "durable-observation-unavailable" } },
      },
    };
  }

  const provider = observableProviders.find((candidate) => candidate.providerId === selectedId);`,
  `durable-observation-unavailable: remote production compute requires`,
  "production observer gate",
);
write(executionPath, execution);

// ---------------------------------------------------------------------------
// Sandbox-run accepts QStash observations only after signature/body/url
// verification, rejects stale deliveries, schedules the next continuation, and
// returns 503 only when publishing the next continuation should be retried.
// ---------------------------------------------------------------------------
const routePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js";
let route = read(routePath);
route = insertBefore(
  route,
  `import { buildInferenceTrustContext } from "@/lib/sandbox-execution-context";`,
  `import {
  COMPUTE_OBSERVATION_SCHEMA,
  computeObservationMaxAttempts,
  computeObservationSchedulerReadiness,
  scheduleComputeObservation,
  verifyComputeObservationRequest
} from "@/lib/compute-observation-scheduler";
`,
  `from "@/lib/compute-observation-scheduler"`,
  "observation scheduler import",
);

const requestHelpers = `
async function readSandboxRunRequestBody(request) {
  const signature = String(request.headers.get("upstash-signature") || "").trim();
  if (!signature) {
    let body;
    try { body = await request.json(); } catch {
      return { ok: false, status: 400, error: "invalid JSON body" };
    }
    if (body?.observationKind === COMPUTE_OBSERVATION_SCHEMA || body?.actor === "qstash-compute-observer") {
      return { ok: false, status: 401, error: "unsigned QStash compute observation refused" };
    }
    return { ok: true, body, signedObservation: false };
  }
  let rawBody = "";
  try { rawBody = await request.text(); } catch {
    return { ok: false, status: 400, error: "signed observation body could not be read" };
  }
  const requestOrigin = (() => { try { return new URL(request.url).origin; } catch { return ""; } })();
  const verified = verifyComputeObservationRequest({
    signature,
    rawBody,
    requestUrl: request.url,
    requestOrigin,
    env: process.env,
  });
  if (!verified?.ok) {
    return { ok: false, status: 401, error: verified?.reason || "signed compute observation refused", reasonCode: verified?.reasonCode || "observation-signature-invalid" };
  }
  return { ok: true, body: verified.body, signedObservation: true };
}

async function validateSignedObservationAgainstJournal(body, request) {
  const config = await readWorkspaceConfig().catch(() => null);
  const row = config ? findTrainingRunReceiptRow(config, body?.name) : null;
  const compute = parseJsonColumn(row?.compute);
  const observation = compute?.observation && typeof compute.observation === "object" ? compute.observation : null;
  const same = Boolean(
    observation
      && String(observation.requestId || "") === String(body?.observationRequestId || "")
      && Number(observation.attempt) === Number(body?.observationAttempt)
      && String(observation.authorityHash || compute?.authorityHash || compute?.authority?.authorityHash || "") === String(body?.authorityHash || "")
      && String(observation.workSpecHash || compute?.workSpecHash || "") === String(body?.workSpecHash || ""),
  );
  if (!same || ["terminal", "exhausted"].includes(String(observation?.status || ""))) {
    return { ok: false, stale: true, reason: "signed observation is stale or no longer owns the journal continuation" };
  }
  const delivered = {
    ...compute,
    observation: {
      ...observation,
      status: "delivered",
      lastObservedAt: new Date().toISOString(),
      messageId: String(request.headers.get("upstash-message-id") || observation.messageId || ""),
      lastErrorCode: "",
    },
  };
  await persistComputeReceipt(String(body.name || ""), delivered);
  return { ok: true };
}

async function attachNextComputeObservation({ trainingRunId, computeBlock, result, requestOrigin, body }) {
  if (!computeBlock || result?.adapterMeta?.compute?.pending !== true) {
    if (computeBlock?.observation) {
      return {
        ...computeBlock,
        observation: {
          ...computeBlock.observation,
          status: "terminal",
          nextObservationAt: "",
          lastObservedAt: new Date().toISOString(),
          lastErrorCode: "",
        },
      };
    }
    return computeBlock;
  }
  const previous = computeBlock?.observation && typeof computeBlock.observation === "object" ? computeBlock.observation : null;
  const currentAttempt = Math.max(Number(previous?.attempt) || 0, Number(body?.observationAttempt) || 0);
  const nextAttempt = currentAttempt + 1;
  const scheduled = await scheduleComputeObservation({
    trainingRunId,
    authorityHash: String(computeBlock?.authorityHash || computeBlock?.authority?.authorityHash || ""),
    workSpecHash: String(computeBlock?.workSpecHash || ""),
    attempt: nextAttempt,
    requestOrigin,
    env: process.env,
    fetchImpl: fetch,
  });
  if (scheduled?.ok && scheduled.evidence) return { ...computeBlock, observation: scheduled.evidence };
  const exhausted = scheduled?.reasonCode === "observation-attempts-exhausted";
  return {
    ...computeBlock,
    observation: {
      ...(previous || {}),
      schema: COMPUTE_OBSERVATION_SCHEMA,
      mode: previous?.mode || "manual",
      status: exhausted ? "exhausted" : "schedule-failed",
      attempt: currentAttempt,
      nextAttempt,
      maxAttempts: Number(scheduled?.maxAttempts) || computeObservationMaxAttempts(process.env),
      authorityHash: String(computeBlock?.authorityHash || computeBlock?.authority?.authorityHash || ""),
      workSpecHash: String(computeBlock?.workSpecHash || ""),
      nextObservationAt: "",
      lastObservedAt: new Date().toISOString(),
      lastErrorCode: String(scheduled?.reasonCode || "observation-publish-failed"),
    },
  };
}

`;
route = insertBefore(route, `function coerceBoolean(value) {`, requestHelpers, `async function readSandboxRunRequestBody`, "signed observation helpers");
route = replaceOrSkip(
  route,
  `async function executeSandboxRun(body, {
  emit,
  traceparent = "",
  tracestate = "",
  appScope = "",
  signal,
} = {}) {`,
  `async function executeSandboxRun(body, {
  emit,
  traceparent = "",
  tracestate = "",
  appScope = "",
  requestOrigin = "",
  signal,
} = {}) {`,
  `requestOrigin = "",\n  signal,`,
  "request origin execution context",
);
route = replaceOrSkip(
  route,
  `  let providerComputeBlock = null;
  if (!result && runLocality !== "serverless") {`,
  `  let providerComputeBlock = null;
  const observationReadiness = computeObservationSchedulerReadiness({ env: process.env, requestOrigin });
  if (!result && runLocality !== "serverless") {`,
  `const observationReadiness = computeObservationSchedulerReadiness`,
  "observation readiness",
);
route = replaceOrSkip(
  route,
  `          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),`,
  `          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          observationSchedulerReady: observationReadiness.ready,
          requireDurableObservation: process.env.NODE_ENV === "production",`,
  `observationSchedulerReady: observationReadiness.ready`,
  "observer readiness into execution seam",
);
route = replaceOrSkip(
  route,
  `      if (providerCompute) {
        result = providerCompute.result;
        providerComputeBlock = providerCompute.computeBlock || null;
        effectiveAdapterId = "provider-compute";
      }`,
  `      if (providerCompute) {
        result = providerCompute.result;
        providerComputeBlock = providerCompute.computeBlock || null;
        if (providerComputeBlock) {
          providerComputeBlock = await attachNextComputeObservation({
            trainingRunId: rowForRun.Name || name,
            computeBlock: providerComputeBlock,
            result,
            requestOrigin,
            body,
          });
          await persistComputeReceipt(rowForRun.Name || name, providerComputeBlock);
          if (providerComputeBlock?.observation) {
            result = {
              ...result,
              adapterMeta: {
                ...(result?.adapterMeta || {}),
                compute: {
                  ...(result?.adapterMeta?.compute || {}),
                  observation: providerComputeBlock.observation,
                },
              },
            };
          }
        }
        effectiveAdapterId = "provider-compute";
      }`,
  `providerComputeBlock = await attachNextComputeObservation`,
  "schedule next observation",
);

const postStart = route.indexOf(`async function POST(request) {`);
const wantsAnchor = route.indexOf(`  const wantsStream =`, postStart);
if (postStart < 0 || wantsAnchor < 0) throw new Error("[durable-observe] POST body bounds not found");
const oldPostPrefix = route.slice(postStart, wantsAnchor);
if (!oldPostPrefix.includes("readSandboxRunRequestBody")) {
  const newPostPrefix = `async function POST(request) {
  const accept = request.headers.get("accept") || "";
  const incomingTraceparent = request.headers.get("traceparent") || "";
  const incomingTracestate = request.headers.get("tracestate") || "";
  const requestOrigin = (() => { try { return new URL(request.url).origin; } catch { return ""; } })();
  const parsedRequest = await readSandboxRunRequestBody(request);
  if (!parsedRequest.ok) {
    await appendOutcomeReceipt({
      kind: "sandbox-run",
      lane: "execution-proof",
      outcomeStatus: "blocked",
      summary: \`sandbox-run rejected (\${parsedRequest.status || 400}): \${parsedRequest.reasonCode || parsedRequest.error}\`,
    });
    return NextResponse.json({ ok: false, error: parsedRequest.error, reasonCode: parsedRequest.reasonCode }, { status: parsedRequest.status || 400 });
  }
  const body = parsedRequest.body;

  // Unified app-scope gate: with x-growthub-app-scope, this run must target
  // a workflow inside the app's governed scope (route-shopping closed).
  let scopedAppId = null;
  {
    const cfgForScope = await readWorkspaceConfig().catch(() => ({}));
    const scope = requireAppScope(request, cfgForScope);
    if (scope.scoped && scope.violation) {
      await appendOutcomeReceipt({
        kind: "sandbox-run", lane: "execution-proof", outcomeStatus: "blocked",
        appId: scope.violation.appScope,
        summary: \`sandbox-run rejected (422 app scope): \${scope.violation.violationType}\`,
        nextActions: [scope.violation.suggestedAction]
      });
      return NextResponse.json(scope.violation, { status: 422 });
    }
    if (scope.scoped) {
      const violation = checkScopedWorkflowAccess(scope.context, body?.objectId, body?.name);
      if (violation) {
        await appendOutcomeReceipt({
          kind: "sandbox-run", lane: "execution-proof", outcomeStatus: "blocked",
          appId: scope.appId,
          summary: \`sandbox-run rejected (422 app scope): workflow \${body?.objectId}:\${body?.name} outside app \${scope.appId}\`,
          nextActions: [violation.suggestedAction]
        });
        return NextResponse.json(violation, { status: 422 });
      }
      scopedAppId = scope.appId;
    }
  }

  if (parsedRequest.signedObservation) {
    const binding = await validateSignedObservationAgainstJournal(body, request);
    if (!binding.ok) {
      // Stale/duplicate deliveries are acknowledged so QStash does not create a
      // retry storm; they perform zero provider work.
      return NextResponse.json({ ok: true, ignored: true, reason: binding.reason, observationRequestId: body?.observationRequestId });
    }
  }

`;
  route = route.slice(0, postStart) + newPostPrefix + route.slice(wantsAnchor);
}
route = route.replace(
  `      appScope: scopedAppId || "",
      signal: request.signal,`,
  `      appScope: scopedAppId || "",
      requestOrigin,
      signal: request.signal,`,
);
route = route.replace(
  `        appScope: scopedAppId || "",
        signal: request.signal,`,
  `        appScope: scopedAppId || "",
        requestOrigin,
        signal: request.signal,`,
);
route = replaceOrSkip(
  route,
  `  return NextResponse.json({
    ok: runOk,`,
  `  const observationStatus = String(providerComputeBlock?.observation?.status || "");
  const httpStatus = observationStatus === "schedule-failed" ? 503 : 200;
  return NextResponse.json({
    ok: runOk,`,
  `const observationStatus = String(providerComputeBlock?.observation?.status`,
  "observation response status",
);
route = replaceOrSkip(
  route,
  `    response
  });
}`,
  `    response
  }, { status: httpStatus });
}`,
  `}, { status: httpStatus });`,
  "observation HTTP status",
);
write(routePath, route);

// Permanent certification coverage.
const certificationPath = "scripts/run-compute-certification.mjs";
let certification = read(certificationPath);
for (const suite of [
  "scripts/unit-compute-observation-scheduler.test.mjs",
  "scripts/unit-compute-durable-observation.test.mjs",
]) {
  if (certification.includes(suite)) continue;
  certification = replaceOnce(
    certification,
    `  "scripts/unit-compute-observation-wiring.test.mjs",\n`,
    `  "scripts/unit-compute-observation-wiring.test.mjs",\n  "${suite}",\n`,
    `certification ${suite}`,
  );
}
write(certificationPath, certification);

console.log("[durable-observe] production remote compute now uses signed, deduplicated QStash continuations on sandbox-run");
