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
 *   { objectId: string, name: string, useDraft?: boolean, draftGraph?: string | object }
 *
 * Response (success):
 *   {
 *     ok:          boolean,
 *     status:      "connected" | "failed",
 *     runId:       string,
 *     adapter:     string,
 *     runtime:     string,
 *     exitCode:    number | null,
 *     durationMs:  number,
 *     persisted:   boolean,
 *     sourceId:    string | null,
 *     response: {                               // saved into row.lastResponse
 *       runLocality, schedulerRegistryId?, runtime, adapter, exitCode, durationMs,
 *       stdout, stderr, error?,
 *       envRefsResolved: string[],              // slug names only — never values
 *       envRefsMissing:  string[],
 *       networkAllow:    boolean,
 *       allowList:       string[],
 *       adapterMeta?:    Record<string, unknown>
 *     }
 *   }
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  readWorkspaceSourceRecords,
  writeWorkspaceConfig,
  writeWorkspaceSourceRecords
} from "@/lib/workspace-config";
import {
  DEFAULT_SANDBOX_ADAPTER,
  DEFAULT_SANDBOX_RUN_LOCALITY,
  KNOWN_SANDBOX_RUNTIMES,
  SANDBOX_DEFAULT_TIMEOUT_MS,
  SANDBOX_MAX_TIMEOUT_MS
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
import { runOrchestrationGraphIfPresent } from "@/lib/orchestration-graph-runner";
import { parseOrchestrationGraph } from "@/lib/orchestration-graph";
import {
  buildInputPayloadForRunner,
  discoverRunInputSchema,
  normalizeRunInputsEnvelope,
  validateRunInputsEnvelope,
  summarizeRunInputs
} from "@/lib/orchestration-run-inputs";

function envKeyCandidates(ref) {
  const token = String(ref || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return Array.from(new Set([
    token,
    token ? `${token}_API_KEY` : "",
    token ? `${token}_TOKEN` : ""
  ].filter(Boolean)));
}

function readServerSecret(authRef) {
  for (const key of envKeyCandidates(authRef)) {
    if (process.env[key]) return { key, value: process.env[key] };
  }
  return null;
}

function coerceBoolean(value) {
  if (value === true || value === false) return value;
  const text = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "on", "yes"].includes(text);
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
  result,
  timeoutMs,
  row,
  runInputs
}) {
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
    envRefsResolved,
    envRefsMissing,
    networkAllow,
    allowList,
    adapterMeta: result.adapterMeta || null
  };
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

async function executeSandboxRun(body, { emit } = {}) {
  const objectId = typeof body?.objectId === "string" ? body.objectId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const useDraft = body?.useDraft === true;
  if (!objectId || !name) {
    return NextResponse.json({ ok: false, error: "objectId and name are required" }, { status: 400 });
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
  const networkAllow = coerceBoolean(rowForRun.networkAllow);
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
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(requestedTimeout, SANDBOX_MAX_TIMEOUT_MS)
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
  const envRefsResolved = [];
  const envRefsMissing = [];
  for (const slug of envRefSlugs) {
    const resolved = readServerSecret(slug);
    if (resolved) {
      env[resolved.key] = resolved.value;
      envRefsResolved.push(slug);
    } else {
      envRefsMissing.push(slug);
    }
  }

  // Browser / local agent fast lane: expose the validated, secret-stripped
  // manual run-input values to spawned local processes and agent hosts.
  // `buildInputPayloadForRunner` drops `{ secretRef }` entries, and the
  // envelope was already normalized + redacted above — raw secrets never
  // reach the child environment through this variable.
  if (normalizedRunInputs) {
    const runInputValues = buildInputPayloadForRunner(normalizedRunInputs);
    if (Object.keys(runInputValues).length > 0) {
      env.GROWTHUB_SANDBOX_RUN_INPUTS = JSON.stringify(runInputValues);
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
        envRefSlugs,
        envRefsMissing,
        envRefsResolved,
        networkAllow,
        allowList,
        instructions,
        command,
        timeoutMs,
        sandboxName: rowForRun.Name || name,
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
    result,
    timeoutMs,
    row: rowForRun,
    runInputs: normalizedRunInputs
  });

  const sourceId = sandboxRunSourceId(objectId, row.Name || name);
  const persistence = describePersistenceMode();
  const status = response.exitCode === 0 && !response.error ? "connected" : "failed";

  let persisted = false;
  let persistError = null;

  if (sourceId && persistence.canSave) {
    try {
      const existing = await readWorkspaceSourceRecords(sourceId);
      const priorRecords = Array.isArray(existing?.records) ? existing.records : [];
      const nextRecords = [...priorRecords, response].slice(-50);
      await writeWorkspaceSourceRecords(sourceId, nextRecords, {
        integrationId: sourceId,
        fetchedAt: ranAt
      });
      persisted = true;
    } catch (error) {
      persistError = error?.message || "failed to persist sandbox run record";
    }

    try {
      const compactResponse = JSON.stringify(response, null, 2);
      const sourceIdValue = sourceId || "";
      const objects = Array.isArray(workspaceConfig.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
      const nextObjects = objects.map((entry) => {
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
      await writeWorkspaceConfig({
        dataModel: { ...(workspaceConfig.dataModel || {}), objects: nextObjects }
      });
    } catch (error) {
      persistError = persistError || error?.message || "failed to stamp row status";
    }
  }

  return NextResponse.json({
    ok: response.exitCode === 0 && !response.error,
    status,
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
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const wantsStream = body?.stream === true || accept.includes("application/x-ndjson");
  if (!wantsStream) {
    return executeSandboxRun(body);
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
      executeSandboxRun(body, { emit })
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
