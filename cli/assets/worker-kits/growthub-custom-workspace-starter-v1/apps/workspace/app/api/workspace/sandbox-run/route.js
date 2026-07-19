/**
 * POST /api/workspace/sandbox-run
 *
 * Executes one row of a `sandbox-environment` governed Data Model object via
 * the registered sandbox adapter, then writes the result into:
 *
 *   1. `growthub.source-records.json` (sidecar, versioned run history) —
 *      keyed by `sandbox:<objectId>:<slug(name)>`. Each invocation appends a
 *      record so the full history travels with the workspace artifact.
 *   2. The row in `growthub.config.json` — stamps `status`, `lastTested`,
 *      and a compact `lastResponse` JSON so the existing Data Model drawer
 *      test bar surfaces the result with no UI rewrite.
 *
 * The route is provider-agnostic for **local** runs: adapters live under
 * `lib/adapters/sandboxes/adapters/` plus bundled defaults.
 *
 * When `runLocality === "serverless"`, execution is delegated with an outbound
 * HTTP request to an **API Registry** row referenced by `schedulerRegistryId`
 * (same FK pattern as Data Source → registryId). Credentials resolve
 * server-side only (authRef env); the JSON body never includes secret values.
 * Your Edge function / QStash worker / cron handler returns JSON or plain text,
 * surfaced as stdout / exitCode — keeping the sandbox row shape identical so
 * Data Sources downstream can normalize either locality.
 *
 * Request body:
 *   {
 *     objectId: string,
 *     name: string,
 *     useDraft?: boolean,
 *     draftGraph?: string | object,
 *     inference?: { prior_receipt_id: string, tool_results: object[] }
 *   }
 *
 * Response (success):
 *   {
 *     ok:          boolean,
 *     status:      "connected" | "pending" | "failed",
 *     runId:       string,
 *     adapter:     string,
 *     runtime:     string,
 *     exitCode:    number | null,
 *     durationMs:  number,
 *     persisted:   boolean,
 *     sourceId:    string | null,
 *     response: {                               // saved into row.lastResponse
 *       runLocality, schedulerRegistryId?, runtime, adapter, exitCode, durationMs,
 *       stdout, stderr, error?, executionStatus?: "awaiting_tool_result" | "audit_unpersisted",
 *       envRefsResolved: string[],              // slug names only — never values
 *       envRefsMissing:  string[],
 *       networkAllow:    boolean,
 *       allowList:       string[],
 *       browserAccess:   boolean,                // first-class browser capability (implies networkAllow)
 *       adapterMeta?:    Record<string, unknown>
 *     }
 *   }
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendWorkspaceSourceRecords,
  describePersistenceMode,
  readWorkspaceConfig,
  readWorkspaceSourceRecords,
  writeWorkspaceConfig
} from "@/lib/workspace-config";
import {
  DEFAULT_SANDBOX_ADAPTER,
  DEFAULT_SANDBOX_RUN_LOCALITY,
  KNOWN_SANDBOX_RUNTIMES,
  SANDBOX_DEFAULT_TIMEOUT_MS,
  SANDBOX_MAX_TIMEOUT_MS,
  SANDBOX_MAX_TIMEOUT_MS_LOCAL
} from "@/lib/workspace-schema";
import {
  parseSandboxAllowList,
  parseSandboxEnvRefs,
  sandboxRunSourceId
} from "@/lib/workspace-data-model";
import {
  ensureSandboxAdaptersLoaded,
  getSandboxAdapter
} from "@/lib/adapters/sandboxes";
import {
  classifySandboxRunResult,
  runOrchestrationGraphIfPresent
} from "@/lib/orchestration-graph-runner";
import { parseOrchestrationGraph } from "@/lib/orchestration-graph";
import { stableStringify } from "@/lib/workspace-patch-policy";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireAppScope, checkScopedWorkflowAccess } from "@/lib/workspace-app-registry";
import {
  discoverRunInputSchema,
  normalizeRunInputsEnvelope,
  validateRunInputsEnvelope,
  summarizeRunInputs
} from "@/lib/orchestration-run-inputs";
// Single canonical secret resolver — shared with the serverless add-on lane so
// both run lanes resolve stored env tokens identically (no copy-pasted logic).
import { readServerSecret } from "@/lib/server-secrets";
import {
  buildTraceCaptureReceiptFields,
  distillationTracesSourceKey,
  TRACE_CAPTURE_RUN_KIND
} from "@/lib/distillation-gateway";
import { trainingRunSourceKey } from "@/lib/training-run-receipts";
import { resolveTrustedInferenceContinuation } from "@/lib/adapters/inference/continuation";

function coerceBoolean(value) {
  if (value === true || value === false) return value;
  const text = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "on", "yes"].includes(text);
}

function normalizeInferenceContinuation(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("inference must be an object containing prior_receipt_id and tool_results");
  }
  const unknown = Object.keys(value).filter((key) => !["prior_receipt_id", "tool_results"].includes(key));
  if (unknown.length) throw new TypeError(`unsupported inference continuation fields: ${unknown.join(", ")}`);
  const priorReceiptId = String(value.prior_receipt_id || "").trim();
  const toolResults = value.tool_results;
  if (!priorReceiptId || priorReceiptId.length > 256) {
    throw new TypeError("inference.prior_receipt_id is required and must be at most 256 characters");
  }
  if (!Array.isArray(toolResults) || toolResults.length === 0 || toolResults.length > 64) {
    throw new TypeError("inference.tool_results must contain between 1 and 64 results");
  }
  if (Buffer.byteLength(stableStringify(toolResults), "utf8") > 1024 * 1024) {
    throw new TypeError("inference.tool_results exceeds 1 MiB");
  }
  return { prior_receipt_id: priorReceiptId, tool_results: toolResults };
}

async function resolvePersistedInferenceContinuation({
  receiptId,
  modelId,
  policyRegistryId,
  appScope,
} = {}) {
  const safeModelId = String(modelId || "workspace-local").trim() || "workspace-local";
  const safePolicyRegistryId = String(policyRegistryId || "").trim();
  if (!safePolicyRegistryId) {
    return { ok: false, reason: "the governed model policy registry id is required" };
  }
  const sourceId = `model-invocation:${safePolicyRegistryId}:${safeModelId}`;
  const source = await readWorkspaceSourceRecords(sourceId);
  return resolveTrustedInferenceContinuation(source?.records, {
    receiptId,
    modelId: safeModelId,
    policyRegistryId: safePolicyRegistryId,
    appScope,
  });
}

async function persistCustomModelExecutionEvidence(response, ranAt) {
  const evidence = response?.adapterMeta?.customModel;
  const invocationsToAppend = Array.isArray(evidence?.invocations) && evidence.invocations.length
    ? evidence.invocations
    : evidence?.invocation ? [evidence.invocation] : [];
  const tracesToAppend = Array.isArray(evidence?.traces) && evidence.traces.length
    ? evidence.traces
    : evidence?.trace ? [evidence.trace] : [];
  const invocation = invocationsToAppend[0];
  const trace = tracesToAppend[0];
  if (!invocation) return null;

  const modelId = String(invocation.modelId || "workspace-local").trim() || "workspace-local";
  const policyRegistryId = String(invocation.policyRegistryId || modelId).trim() || modelId;
  const invocationSourceId = `model-invocation:${policyRegistryId}:${modelId}`;
  const invocationEntry = await appendWorkspaceSourceRecords(invocationSourceId, invocationsToAppend, {
    integrationId: policyRegistryId,
    fetchedAt: ranAt,
  }, { maxRecords: 500 });
  const invocations = invocationEntry.records;

  let traceSourceId = "";
  let receiptSourceId = "";
  let traces = [];
  let distillation = null;
  // Awaiting-tool, rejected, and failed inference receipts are still durable
  // invocations, but they are not training corpus. Only a completed answer
  // with a normalized trace enters the distillation/capture lane.
  if (trace && tracesToAppend.length) {
    traceSourceId = distillationTracesSourceKey(modelId);
    const traceEntry = await appendWorkspaceSourceRecords(traceSourceId, tracesToAppend, {
      integrationId: policyRegistryId,
      fetchedAt: ranAt,
    }, { maxRecords: 5000 });
    traces = traceEntry.records;

    receiptSourceId = trainingRunSourceKey(modelId);
    distillation = buildTraceCaptureReceiptFields({
      traces,
      teacherModel: String(trace.teacherModel || ""),
      teacherProviderId: String(trace.teacherProviderId || ""),
      clusterId: String(trace.clusterId || ""),
    });
    const captureReceipt = {
      schema: "growthub-local-model-training-run-v1",
      trainingRunId: `capture_${String(response.runId || Date.now().toString(36))}`,
      modelTrainingRowId: modelId,
      status: "completed",
      runKind: TRACE_CAPTURE_RUN_KIND,
      capturedAt: ranAt,
      invocationSourceId,
      distillation,
    };
    await appendWorkspaceSourceRecords(receiptSourceId, [captureReceipt], {
      integrationId: modelId,
      fetchedAt: ranAt,
    }, { maxRecords: 500 });
  }

  let evaluationSourceId = "";
  if (evidence?.evaluation && typeof evidence.evaluation === "object") {
    evaluationSourceId = `model-evaluation:${policyRegistryId}:${modelId}`;
    await appendWorkspaceSourceRecords(evaluationSourceId, [
      { schema: "growthub-custom-model-evaluation-v1", runId: response.runId, evaluatedAt: ranAt, ...evidence.evaluation },
    ], { integrationId: policyRegistryId, fetchedAt: ranAt }, { maxRecords: 250 });
  }

  return {
    invocationSourceId,
    traceSourceId: traceSourceId || undefined,
    receiptSourceId: receiptSourceId || undefined,
    invocationCount: invocations.length,
    traceCount: traces.length,
    traceRootHash: distillation?.traceRootHash || undefined,
    evaluationSourceId: evaluationSourceId || undefined,
  };
}

function hasCustomModelInvocationEvidence(response) {
  const evidence = response?.adapterMeta?.customModel;
  return Boolean(
    (Array.isArray(evidence?.invocations) && evidence.invocations.length > 0)
      || evidence?.invocation,
  );
}

function applyRunCompletionTruth(response, completion) {
  if (!completion.runOk) delete response.outputHash;
  if (completion.awaitingToolResult) {
    response.executionStatus = "awaiting_tool_result";
    response.awaitingToolResult = true;
    response.pending = true;
    response.continuation = response?.continuation && typeof response.continuation === "object"
      ? response.continuation
      : { kind: "tool_result", status: "pending" };
  }
  if (completion.auditUnpersisted) {
    response.executionStatus = "audit_unpersisted";
    response.exitCode = null;
    response.error = "governed custom-model audit trail was not durably completed";
    response.audit = {
      required: true,
      status: "unpersisted",
      nextAction: "Restore writable workspace persistence, then rerun the inference turn.",
    };
  }
  return response;
}

function normalizeRunLocality(row) {
  const raw = String(row?.runLocality ?? "").trim().toLowerCase();
  if (raw === "serverless") return "serverless";
  if (raw === "local") return "local";
  return DEFAULT_SANDBOX_RUN_LOCALITY;
}

function normalizeMethod(value) {
  const method = String(value || "GET").trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ? method : "GET";
}

function buildSchedulerUrl(record) {
  const baseUrl = String(record?.baseUrl || "").trim();
  const endpoint = String(record?.endpoint || "").trim();
  const raw = endpoint || baseUrl;
  if (!raw) throw new Error("baseUrl or endpoint is required");
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (!baseUrl) throw new Error("baseUrl is required when endpoint is relative");
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function buildAuthHeaders(record, secretValue) {
  if (!secretValue) return {};
  const headerName = String(record?.authHeaderName || record?.authHeader || "x-api-key").trim();
  if (!headerName) return {};
  const prefix = String(record?.authPrefix || "").trim();
  return { [headerName]: prefix ? `${prefix} ${secretValue}` : secretValue };
}

function findRegistryRecord(workspaceConfig, registryId) {
  const id = String(registryId || "").trim();
  if (!id) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const objectItem of objects) {
    if (objectItem?.objectType !== "api-registry") continue;
    const rows = Array.isArray(objectItem.rows) ? objectItem.rows : [];
    const match = rows.find(
      (r) => String(r?.integrationId || "").trim() === id
        || String(r?.id || "").trim() === id
        || String(r?.Name || "").trim() === id
    );
    if (match) return match;
  }
  return null;
}

function reconcileModelTrainingRunnerResult({ workspaceConfig, objectId, name, response }) {
  if (objectId !== "model-training-runner") return null;
  const trainingRunId = String(name || "").trim();
  if (!trainingRunId) return null;
  const runOk = response?.exitCode === 0 && !response?.error;
  if (runOk) return null;
  const reason = String(response?.stderr || response?.error || response?.stdout || "Runner failed before writing a progress receipt").trim();
  if (!reason) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  let changed = false;
  const nextObjects = objects.map((entry) => {
    if (entry?.objectType !== "model-training-run") return entry;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    const nextRows = rows.map((row) => {
      if (String(row?.trainingRunId || "") !== trainingRunId) return row;
      changed = true;
      return {
        ...row,
        status: /preflight blocked/i.test(reason) ? "blocked" : "failed",
        blockedReason: reason,
        preflight: row.preflight && typeof row.preflight === "object" ? row.preflight : { ok: false },
        progress: {
          ...(row.progress && typeof row.progress === "object" ? row.progress : {}),
          stageId: "preflight",
          stageRank: 0,
          pct: 0,
          detail: reason,
          index: 0,
        },
      };
    });
    return { ...entry, rows: nextRows };
  });
  return changed ? nextObjects : null;
}

async function runServerlessScheduler({
  workspaceConfig,
  row,
  runId,
  ranAt,
  workspaceId,
  objectId,
  sandboxName,
  runtime,
  adapterId,
  agentHost,
  command,
  instructions,
  timeoutMs,
  networkAllow,
  allowList,
  browserAccess,
  envRefSlugs,
  envRefsResolved,
  envRefsMissing
}) {
  const registryId = String(row.schedulerRegistryId || "").trim();
  if (!registryId) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "schedulerRegistryId is required when runLocality is serverless",
      adapterMeta: { locality: "serverless", mode: "registry-delegation", registryId: null }
    };
  }

  const registryRecord = findRegistryRecord(workspaceConfig, registryId);
  if (!registryRecord) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `no API Registry row for integrationId ${registryId}`,
      adapterMeta: { locality: "serverless", mode: "registry-delegation", registryId }
    };
  }

  let url;
  try {
    url = buildSchedulerUrl(registryRecord);
  } catch (err) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: err.message || "invalid scheduler URL",
      adapterMeta: { locality: "serverless", registryId }
    };
  }

  let method = normalizeMethod(registryRecord.method);
  if (!["POST", "PUT", "PATCH"].includes(method)) {
    method = "POST";
  }

  const authRef = registryRecord.authRef || registryRecord.integrationId;
  const secretEntry = readServerSecret(authRef);
  const secret = secretEntry?.value || "";

  const outboundTimeout = Math.min(Math.max(timeoutMs, 1000), 120000);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), outboundTimeout);

  const payloadBody = {
    kind: "growthub-sandbox-run-v1",
    runId,
    ranAt,
    workspaceId: workspaceId || null,
    runLocality: "serverless",
    objectId,
    name: sandboxName,
    sandbox: {
      runtime,
      adapter: adapterId,
      agentHost: agentHost || null,
      lifecycleStatus: String(row.lifecycleStatus || "draft").trim().toLowerCase() === "live" ? "live" : "draft",
      version: row.version ?? "",
      instructions,
      command,
      timeoutMs,
      networkAllow,
      allowList,
      browserAccess,
      envRefSlugs,
      envRefsResolved,
      envRefsMissing
    }
  };

  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
        "content-type": "application/json",
        ...buildAuthHeaders(registryRecord, secret)
      },
      body: JSON.stringify(payloadBody),
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    const contentType = response.headers.get("content-type") || "";
    const rawPayload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (typeof rawPayload === "string") {
      return {
        ok: response.ok,
        exitCode: response.ok ? 0 : 1,
        durationMs,
        stdout: rawPayload,
        stderr: "",
        error: response.ok ? undefined : `HTTP ${response.status}`,
        adapterMeta: {
          locality: "serverless",
          registryId,
          url,
          httpStatus: response.status,
          schedulerMethod: method
        }
      };
    }

    const stdout = typeof rawPayload.stdout === "string"
      ? rawPayload.stdout
      : JSON.stringify(rawPayload.result ?? rawPayload, null, 2);
    const stderr = typeof rawPayload.stderr === "string" ? rawPayload.stderr : "";
    let exitCode;
    if (typeof rawPayload.exitCode === "number") {
      exitCode = rawPayload.exitCode;
    } else if (response.ok && rawPayload.ok !== false) {
      exitCode = 0;
    } else {
      exitCode = 1;
    }
    const innerOk = response.ok && rawPayload.ok !== false && exitCode === 0;

    return {
      ok: innerOk,
      exitCode,
      durationMs: typeof rawPayload.durationMs === "number" ? rawPayload.durationMs : durationMs,
      stdout,
      stderr,
      error: rawPayload.error || (!innerOk ? `HTTP ${response.status}` : undefined),
      adapterMeta: {
        locality: "serverless",
        registryId,
        url,
        httpStatus: response.status,
        schedulerMethod: method
      }
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    return {
      ok: false,
      exitCode: null,
      durationMs,
      stdout: "",
      stderr: "",
      error: error.name === "AbortError" ? `scheduler request timed out after ${outboundTimeout}ms` : (error.message || "scheduler fetch failed"),
      adapterMeta: { locality: "serverless", registryId, url, aborted: error.name === "AbortError" }
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildRunResponse({
  runId,
  ranAt,
  objectId,
  name,
  runLocality,
  schedulerRegistryId,
  runtime,
  adapterId,
  agentHost,
  command,
  instructions,
  lifecycleStatus,
  version,
  envRefsResolved,
  envRefsMissing,
  networkAllow,
  allowList,
  browserAccess,
  result,
  timeoutMs,
  row,
  runInputs
}) {
  const completion = classifySandboxRunResult(result);
  const base = {
    runId,
    ranAt,
    // Identity travels with the persisted record so run-console consumers
    // (lineage, swarm projection title) don't depend on the row context.
    objectId: objectId ? String(objectId).trim() : undefined,
    name: name ? String(name).trim() : undefined,
    runLocality,
    schedulerRegistryId: schedulerRegistryId ? String(schedulerRegistryId).trim() : null,
    runtime,
    adapter: adapterId,
    agentHost: agentHost || null,
    lifecycleStatus,
    version,
    instructions,
    command,
    timeoutMs,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error || undefined,
    // Output proof: the runtime hashes what the run actually produced, at
    // run time, server-side. This is the "output-hash" proofKind the custom
    // -model evidence ladder requires for `complete` — a REAL run now carries
    // it natively (previously only seeded fixtures could, which meant no real
    // run could ever finish the proof loop).
    outputHash: completion.runOk && String(result.stdout || "").length > 0
      ? createHash("sha256").update(String(result.stdout), "utf8").digest("hex").slice(0, 16)
      : undefined,
    envRefsResolved,
    envRefsMissing,
    networkAllow,
    allowList,
    browserAccess,
    adapterMeta: result.adapterMeta || null
  };
  if (completion.awaitingToolResult) {
    base.executionStatus = "awaiting_tool_result";
    base.awaitingToolResult = true;
    base.pending = true;
    base.continuation = result?.continuation && typeof result.continuation === "object"
      ? result.continuation
      : { kind: "tool_result", status: "pending" };
  }
  if (row && (row.resolverTemplateId || row.connectorKind || row.executionLane)) {
    base.templateTrace = {
      resolverTemplateId: row.resolverTemplateId ? String(row.resolverTemplateId) : null,
      connectorKind: row.connectorKind ? String(row.connectorKind) : null,
      executionLane: row.executionLane ? String(row.executionLane) : null
    };
  }
  if (runInputs && typeof runInputs === "object") {
    base.input = runInputs;
    base.runInputs = runInputs;
    base.inputSummary = summarizeRunInputs(runInputs);
  }
  if (result && typeof result === "object" && result.swarm && typeof result.swarm === "object") {
    base.swarm = result.swarm;
  }
  if (result && typeof result === "object" && Array.isArray(result.logTree)) {
    base.logTree = result.logTree;
  }
  // Per-node orchestration execution trace (general pipeline, not swarm) so the
  // Workflow Canvas can settle per-node status from the persisted record.
  if (result && typeof result === "object" && Array.isArray(result.nodeTrace)) {
    base.nodeTrace = result.nodeTrace;
  }
  base.exports = {
    available: ["download-json", "copy-output", "download-stdout", "download-stderr", "download-log-node"],
    external: []
  };
  return base;
}

function findSandboxRow(workspaceConfig, objectId, name) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((entry) => entry?.id === objectId && entry?.objectType === "sandbox-environment");
  if (!object) return { object: null, row: null, rowIndex: -1 };
  const wantedName = String(name || "").trim();
  const rows = Array.isArray(object.rows) ? object.rows : [];
  const rowIndex = rows.findIndex((row) => String(row?.Name || "").trim() === wantedName);
  if (rowIndex === -1) return { object, row: null, rowIndex: -1 };
  return { object, row: rows[rowIndex], rowIndex };
}

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const objectId = String(searchParams.get("objectId") || "").trim();
  const name = String(searchParams.get("name") || "").trim();
  if (!objectId || !name) {
    return NextResponse.json({ ok: false, error: "objectId and name are required" }, { status: 400 });
  }

  const sourceId = sandboxRunSourceId(objectId, name);
  if (!sourceId) {
    return NextResponse.json({ ok: false, error: "could not derive sandbox sourceId" }, { status: 400 });
  }

  const existing = await readWorkspaceSourceRecords(sourceId);
  const records = Array.isArray(existing?.records) ? existing.records : [];
  return NextResponse.json({
    ok: true,
    sourceId,
    recordCount: records.length,
    records: records.slice(-25).reverse()
  });
}

async function executeSandboxRun(body, {
  emit,
  traceparent = "",
  tracestate = "",
  appScope = "",
  signal,
} = {}) {
  const objectId = typeof body?.objectId === "string" ? body.objectId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const useDraft = body?.useDraft === true;
  if (!objectId || !name) {
    return NextResponse.json({ ok: false, error: "objectId and name are required" }, { status: 400 });
  }
  let inferenceContinuation = null;
  try {
    inferenceContinuation = normalizeInferenceContinuation(body?.inference);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "invalid inference continuation" }, { status: 400 });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) {
    return NextResponse.json({ ok: false, error: `no sandbox-environment object with id ${objectId}` }, { status: 404 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: `no sandbox row named ${name} in object ${objectId}` }, { status: 404 });
  }

  const draftGraph = useDraft
    ? parseOrchestrationGraph(body?.draftGraph || row.orchestrationDraftConfig || row.orchestrationDraftGraph)
    : null;
  // Hash the draft BEFORE execution (the graph runner may annotate the object
  // in place). This is the lineage anchor the workflow publish gate verifies.
  const draftSha256 = draftGraph
    ? createHash("sha256").update(stableStringify(draftGraph), "utf8").digest("hex")
    : null;
  const rowForRun = draftGraph
    ? { ...row, orchestrationGraph: draftGraph, orchestrationConfig: draftGraph }
    : row;

  const inputSchema = discoverRunInputSchema(rowForRun.orchestrationGraph || rowForRun.orchestrationConfig);
  let normalizedRunInputs = null;
  if (body?.runInputs != null) {
    const validation = validateRunInputsEnvelope(body.runInputs, inputSchema);
    if (validation.error) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }
    if (inputSchema.requiresInput && validation.missing.length > 0) {
      return NextResponse.json({
        ok: false,
        error: `Missing required run input fields: ${validation.missing.join(", ")}`,
        missingFields: validation.missing
      }, { status: 400 });
    }
    normalizedRunInputs = normalizeRunInputsEnvelope(body.runInputs, inputSchema);
  } else if (inputSchema.requiresInput) {
    return NextResponse.json({
      ok: false,
      error: "runInputs is required for this workflow",
      missingFields: (inputSchema.fields || []).filter((f) => f.required).map((f) => f.id)
    }, { status: 400 });
  }

  const runLocality = normalizeRunLocality(rowForRun);
  const runtime = KNOWN_SANDBOX_RUNTIMES.includes(rowForRun.runtime) ? rowForRun.runtime : "node";
  let adapterId = (typeof rowForRun.adapter === "string" && rowForRun.adapter.trim()) ? rowForRun.adapter.trim() : DEFAULT_SANDBOX_ADAPTER;
  const agentHost = typeof rowForRun.agentHost === "string" ? rowForRun.agentHost.trim() : "";
  const schedulerRegistryId = typeof rowForRun.schedulerRegistryId === "string" ? rowForRun.schedulerRegistryId.trim() : "";
  const browserAccess = coerceBoolean(rowForRun.browserAccess);
  // Browser access implies outbound network — the same deterministic
  // normalization the sidecar toggle applies, enforced server-side so
  // rows patched via the API behave identically to rows saved in the UI.
  const networkAllow = coerceBoolean(rowForRun.networkAllow) || browserAccess;
  const allowList = parseSandboxAllowList(rowForRun.allowList);
  const envRefSlugs = parseSandboxEnvRefs(rowForRun.envRefs);
  const command = typeof rowForRun.command === "string" ? rowForRun.command : "";
  const instructions = typeof rowForRun.instructions === "string" ? rowForRun.instructions.trim() : "";
  const agentCommand = instructions
    ? `Instructions:\n${instructions}\n\nPrompt:\n${command}`
    : command;
  const intelligenceSandbox =
    adapterId === "local-intelligence"
      ? {
          userIntent: agentCommand,
          localModel: typeof rowForRun.localModel === "string" ? rowForRun.localModel.trim() : "",
          localEndpoint: typeof rowForRun.localEndpoint === "string" ? rowForRun.localEndpoint.trim() : "",
          intelligenceAdapterMode:
            typeof rowForRun.intelligenceAdapterMode === "string"
              ? rowForRun.intelligenceAdapterMode.trim().toLowerCase()
              : "ollama",
        }
      : undefined;
  const lifecycleStatus = String(rowForRun.lifecycleStatus || "draft").trim().toLowerCase() === "live" ? "live" : "draft";
  const version = rowForRun.version ?? "";
  const requestedTimeout = Number(rowForRun.timeoutMs);
  // Locality-aware ceiling (mirrors the schema validator): a LOCAL run on the
  // user's own machine may legitimately hold for hours (dependency ensure,
  // QLoRA fine-tune, GGUF quantize) — clamping it to the serverless 10-minute
  // cap SIGKILLs real training/pre-init work mid-flight.
  const timeoutCap = runLocality === "local" ? SANDBOX_MAX_TIMEOUT_MS_LOCAL : SANDBOX_MAX_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(requestedTimeout, timeoutCap)
    : SANDBOX_DEFAULT_TIMEOUT_MS;

  if (runLocality === "serverless" && adapterId === "local-intelligence") {
    return NextResponse.json({
      ok: false,
      error: "`local-intelligence` applies only when runLocality is local. Switch run locality or choose a process adapter for serverless delegation.",
    }, { status: 400 });
  }

  if (runLocality === "serverless" && adapterId === "local-agent-host") {
    return NextResponse.json({
      ok: false,
      error: "`local-agent-host` applies only when runLocality is local. Switch run locality or choose a process adapter for serverless delegation."
    }, { status: 400 });
  }

  const env = {};
  const resolvedSecretsByRef = {};
  const envRefsResolved = [];
  const envRefsMissing = [];
  for (const slug of envRefSlugs) {
    const resolved = readServerSecret(slug);
    if (resolved) {
      env[resolved.key] = resolved.value;
      resolvedSecretsByRef[slug] = resolved.value;
      envRefsResolved.push(slug);
    } else {
      envRefsMissing.push(slug);
    }
  }

  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ranAt = new Date().toISOString();

  let result;
  let effectiveAdapterId = adapterId;

  const hasNativeGraph = Boolean(parseOrchestrationGraph(rowForRun.orchestrationGraph || rowForRun.orchestrationConfig));
  if (hasNativeGraph && runLocality !== "serverless") {
    const graphResult = await runOrchestrationGraphIfPresent({
      workspaceConfig,
      row: rowForRun,
      timeoutMs,
      runInputs: normalizedRunInputs,
      executionContext: {
        runId,
        ranAt,
        runtime,
        agentHost,
        adapterId,
        env,
        resolvedSecretsByRef,
        envRefSlugs,
        envRefsMissing,
        envRefsResolved,
        networkAllow,
        allowList,
        browserAccess,
        instructions,
        command,
        timeoutMs,
        sandboxName: rowForRun.Name || name,
        customModelId: String(rowForRun.customModelId || ""),
        workflowVariant: String(rowForRun.workflowVariant || "chat"),
        traceparent: String(traceparent || body?.otel_traceparent || ""),
        tracestate: String(tracestate || ""),
        appScope: String(appScope || ""),
        inferenceContinuation,
        resolveInferenceContinuation: resolvePersistedInferenceContinuation,
        signal,
        onEvent: emit
      }
    });
    if (graphResult !== null) {
      result = graphResult;
      effectiveAdapterId = String(graphResult?.adapterMeta?.adapter || "").trim() || "orchestration-graph";
    }
  }

  if (!result && runLocality === "serverless") {
    effectiveAdapterId = "serverless";
    result = await runServerlessScheduler({
      workspaceConfig,
      row: rowForRun,
      runId,
      ranAt,
      workspaceId: workspaceConfig?.id ?? null,
      objectId,
      sandboxName: rowForRun.Name || name,
      runtime,
      adapterId,
      agentHost,
      command,
      instructions,
      timeoutMs,
      networkAllow,
      allowList,
      browserAccess,
      envRefSlugs,
      envRefsResolved,
      envRefsMissing
    });
  } else if (!result) {
    await ensureSandboxAdaptersLoaded();
    const adapter = getSandboxAdapter(adapterId);
    if (!adapter) {
      return NextResponse.json({
        ok: false,
        error: `sandbox adapter not registered: ${adapterId}`,
        hint: "Drop a file under lib/adapters/sandboxes/adapters/ that calls registerSandboxAdapter()"
      }, { status: 404 });
    }
    if (Array.isArray(adapter.supportedRuntimes) && adapter.supportedRuntimes.length && !adapter.supportedRuntimes.includes(runtime)) {
      return NextResponse.json({
        ok: false,
        error: `adapter ${adapterId} does not support runtime ${runtime}`,
        supportedRuntimes: adapter.supportedRuntimes
      }, { status: 400 });
    }

    const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-sandbox-"));
    try {
      result = await adapter.run({
        runId,
        name: rowForRun.Name || name,
        runtime,
        agentHost,
        command: adapterId === "local-agent-host" || adapterId === "local-intelligence" ? agentCommand : command,
        timeoutMs,
        networkAllow,
        allowList,
        browserAccess,
        env,
        envRefSlugs,
        envRefsMissing,
        workdir,
        ranAt,
        ...(intelligenceSandbox ? { intelligenceSandbox } : {}),
      });
    } catch (error) {
      result = {
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: error?.message || "adapter threw",
        adapterMeta: { adapter: adapterId }
      };
    } finally {
      fs.rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const response = buildRunResponse({
    runId,
    ranAt,
    objectId,
    name: rowForRun.Name || name,
    runLocality,
    schedulerRegistryId: runLocality === "serverless" ? schedulerRegistryId : null,
    runtime,
    adapterId: effectiveAdapterId,
    agentHost,
    command,
    instructions,
    lifecycleStatus,
    version,
    envRefsResolved,
    envRefsMissing,
    networkAllow,
    allowList,
    browserAccess,
    result,
    timeoutMs,
    row: rowForRun,
    runInputs: normalizedRunInputs
  });

  // Draft-run lineage anchor: the sha256 of the exact graph that executed,
  // persisted into the run record. The sidecar is only writable by server
  // routes (PATCH is policy-blocked from it), so the workflow publish gate
  // can verify "this saved draft is what actually ran" against this hash —
  // the PATCH-writable draft attestation fields alone are never trusted.
  if (useDraft && draftSha256) {
    response.useDraft = true;
    response.draftSha256 = draftSha256;
  }

  const sourceId = sandboxRunSourceId(objectId, row.Name || name);
  const persistence = describePersistenceMode();
  let persisted = false;
  let persistError = null;
  const auditRequired = hasCustomModelInvocationEvidence(response);
  let auditPersisted = !auditRequired;

  // A custom-model response is only proof when its verification invocation is
  // durable. Persist that audit receipt before the sandbox record or row can
  // be stamped as tested. Read-only/failing persistence demotes the result to
  // an explicit non-success state while retaining the in-memory receipt for
  // diagnosis; it can never mint an outputHash or publishable draft proof.
  if (auditRequired && persistence.canSave) {
    try {
      const customModelEvidence = await persistCustomModelExecutionEvidence(response, ranAt);
      if (customModelEvidence) {
        response.customModelEvidence = customModelEvidence;
        auditPersisted = true;
      } else {
        persistError = "custom-model invocation evidence was missing at persistence time";
      }
    } catch (error) {
      persistError = error?.message || "failed to persist custom-model execution evidence";
    }
  } else if (auditRequired) {
    persistError = "workspace persistence is read-only; custom-model audit evidence was not persisted";
  }

  let completion = classifySandboxRunResult(response, { auditRequired, auditPersisted });
  applyRunCompletionTruth(response, completion);
  let status = completion.rowStatus;

  if (sourceId && persistence.canSave) {
    try {
      await appendWorkspaceSourceRecords(sourceId, [response], {
        integrationId: sourceId,
        fetchedAt: ranAt
      }, { maxRecords: 50 });
      persisted = true;
    } catch (error) {
      persistError = error?.message || "failed to persist sandbox run record";
    }

    // The invocation receipt alone is not a complete audit trail: the
    // canonical sandbox record must also be durable. If its append failed,
    // demote before stamping the row or emitting the Agent Outcome receipt.
    if (auditRequired && !persisted) {
      auditPersisted = false;
      completion = classifySandboxRunResult(response, { auditRequired, auditPersisted });
      applyRunCompletionTruth(response, completion);
      status = completion.rowStatus;
    }

    try {
      const compactResponse = JSON.stringify(response, null, 2);
      const sourceIdValue = sourceId || "";
      const objects = Array.isArray(workspaceConfig.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
      let nextObjects = objects.map((entry) => {
        if (entry.id !== object.id) return entry;
        const rows = Array.isArray(entry.rows) ? entry.rows : [];
        const nextRows = rows.map((existingRow, index) => {
          if (index !== rowIndex) return existingRow;
          return {
            ...existingRow,
            status,
            lastTested: ranAt,
            lastRunId: runId,
            lastSourceId: sourceIdValue,
            lastResponse: compactResponse,
            ...(useDraft ? {
              orchestrationDraftLastTested: ranAt,
              orchestrationDraftLastRunId: runId,
              orchestrationDraftLastStatus: status,
              orchestrationDraftLastResponse: compactResponse
            } : {})
          };
        });
        return { ...entry, rows: nextRows };
      });
      const reconciledObjects = reconcileModelTrainingRunnerResult({
        workspaceConfig: {
          ...(workspaceConfig || {}),
          dataModel: { ...(workspaceConfig.dataModel || {}), objects: nextObjects }
        },
        objectId,
        name: rowForRun.Name || name,
        response
      });
      if (reconciledObjects) nextObjects = reconciledObjects;
      await writeWorkspaceConfig({
        dataModel: { ...(workspaceConfig.dataModel || {}), objects: nextObjects }
      });
    } catch (error) {
      persistError = persistError || error?.message || "failed to stamp row status";
    }
  }

  // Agent Outcome Loop V1: every execution emits the same canonical receipt
  // (kind "sandbox-run", lane "execution-proof") into workspace:agent-outcomes,
  // linking the run record so publish gates and future agents can cite it.
  const runOk = completion.runOk;
  const outcomeLabel = completion.auditUnpersisted
    ? "failed audit persistence"
    : completion.awaitingToolResult
      ? "is awaiting a governed tool result"
      : runOk ? "passed" : "failed";
  const nextActions = completion.auditUnpersisted
    ? ["Restore writable workspace persistence, then rerun so the verification receipt and run record are durable."]
    : completion.awaitingToolResult
      ? ["Submit the correlated governed tool result, then resume this inference turn; the draft remains untested and unpublishable."]
      : runOk && useDraft
        ? ["Attest the tested draft (orchestrationDraftTestPassed + orchestrationDraftTestedConfig), then POST /api/workspace/workflow/publish"]
        : [];
  await appendOutcomeReceipt({
    kind: "sandbox-run",
    lane: "execution-proof",
    outcomeStatus: completion.outcomeStatus,
    intent: typeof body?.intent === "string" ? body.intent : undefined,
    actor: typeof body?.actor === "string" ? body.actor : undefined,
    objectRefs: [{ objectId, rowName: rowForRun.Name || name, objectType: "sandbox-environment" }],
    runId,
    sourceId: sourceId || undefined,
    ...(useDraft && draftSha256 ? { draftSha256 } : {}),
    summary: `${useDraft ? "draft " : ""}run ${outcomeLabel} (exit ${response.exitCode}, ${effectiveAdapterId}/${runtime}) — ${String(response.stdout || response.stderr || response.error || "").slice(0, 160)}`,
    ...(nextActions.length ? { nextActions } : {}),
    rollbackRef: sourceId ? { objectId, rowName: rowForRun.Name || name, sourceId } : undefined
  });

  return NextResponse.json({
    ok: runOk,
    status,
    ...(!runOk && (completion.awaitingToolResult || completion.auditUnpersisted)
      ? { executionStatus: completion.executionStatus }
      : {}),
    runId,
    adapter: effectiveAdapterId,
    runtime,
    exitCode: response.exitCode,
    durationMs: response.durationMs,
    persisted,
    persistError,
    sourceId,
    response
  });
}

async function POST(request) {
  const accept = request.headers.get("accept") || "";
  const incomingTraceparent = request.headers.get("traceparent") || "";
  const incomingTracestate = request.headers.get("tracestate") || "";
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
        summary: `sandbox-run rejected (422 app scope): ${scope.violation.violationType}`,
        nextActions: [scope.violation.suggestedAction]
      });
      return NextResponse.json(scope.violation, { status: 422 });
    }
    if (scope.scoped) {
      let peek = null;
      try { peek = await request.clone().json(); } catch { peek = null; }
      const violation = checkScopedWorkflowAccess(scope.context, peek?.objectId, peek?.name);
      if (violation) {
        await appendOutcomeReceipt({
          kind: "sandbox-run", lane: "execution-proof", outcomeStatus: "blocked",
          appId: scope.appId,
          summary: `sandbox-run rejected (422 app scope): workflow ${peek?.objectId}:${peek?.name} outside app ${scope.appId}`,
          nextActions: [violation.suggestedAction]
        });
        return NextResponse.json(violation, { status: 422 });
      }
      scopedAppId = scope.appId;
    }
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const wantsStream = body?.stream === true || accept.includes("application/x-ndjson");
  if (!wantsStream) {
    return executeSandboxRun(body, {
      traceparent: incomingTraceparent,
      tracestate: incomingTracestate,
      appScope: scopedAppId || "",
      signal: request.signal,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      emit({
        kind: "growthub-sandbox-run-delta-v1",
        type: "sandbox-run.accepted",
        emittedAt: new Date().toISOString(),
        objectId: typeof body?.objectId === "string" ? body.objectId.trim() : "",
        name: typeof body?.name === "string" ? body.name.trim() : ""
      });
      executeSandboxRun(body, {
        emit,
        traceparent: incomingTraceparent,
        tracestate: incomingTracestate,
        appScope: scopedAppId || "",
        signal: request.signal,
      })
        .then(async (response) => {
          const finalPayload = await response.json().catch(() => ({ ok: false, error: "stream final payload unreadable" }));
          emit({
            kind: "growthub-sandbox-run-delta-v1",
            type: "sandbox-run.final",
            emittedAt: new Date().toISOString(),
            status: response.status,
            payload: finalPayload
          });
        })
        .catch((error) => {
          emit({
            kind: "growthub-sandbox-run-delta-v1",
            type: "sandbox-run.final",
            emittedAt: new Date().toISOString(),
            status: 500,
            payload: { ok: false, error: error?.message || "sandbox run failed" }
          });
        })
        .finally(() => controller.close());
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export { GET, POST };
