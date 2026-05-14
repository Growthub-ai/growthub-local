/**
 * Turn persisted sandbox run receipts (growthub.source-records.json) into
 * GTM / SFT-friendly shapes. Raw persistence is the `response` envelope from
 * POST /api/workspace/sandbox-run (see sandbox-run/route.js).
 */

import { sandboxRunSourceId } from "@/lib/workspace-data-model";

const SANDBOX_SOURCE_PREFIX = "sandbox:";

/**
 * @param {string} sourceId e.g. sandbox:sandboxes-e2e:api-probe-row
 * @returns {{ objectId: string, rowSlug: string } | null}
 */
export function parseSandboxSourceId(sourceId) {
  const id = String(sourceId || "").trim();
  if (!id.startsWith(SANDBOX_SOURCE_PREFIX)) return null;
  const rest = id.slice(SANDBOX_SOURCE_PREFIX.length);
  const idx = rest.indexOf(":");
  if (idx <= 0 || idx >= rest.length - 1) return null;
  return { objectId: rest.slice(0, idx), rowSlug: rest.slice(idx + 1) };
}

function teacherModelFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const adapter = String(row.adapter || "").trim();
  if (adapter === "local-intelligence") {
    const m = String(row.localModel || "").trim();
    return m || "local-intelligence";
  }
  return adapter || null;
}

/**
 * @param {Record<string, unknown>} record one persisted sandbox run object
 * @param {{ sourceId: string, role?: string | null, qualityLabel?: string | null, sandboxRow?: Record<string, unknown> | null }} ctx
 */
export function sandboxRunRecordToStructuredTrace(record, ctx) {
  const runId = String(record?.runId || "").trim();
  const instructions = typeof record?.instructions === "string" ? record.instructions : "";
  const command = typeof record?.command === "string" ? record.command : "";
  const stdout = typeof record?.stdout === "string" ? record.stdout : "";
  const exitCode = record?.exitCode;
  const teacherModel = teacherModelFromRow(ctx.sandboxRow);

  return {
    traceId: runId || null,
    sourceId: ctx.sourceId,
    role: ctx.role ?? null,
    qualityLabel: ctx.qualityLabel ?? null,
    input: {
      instructions,
      command,
      prospectContext: command.trim() ? command : null
    },
    output: {
      stdout,
      stderr: typeof record?.stderr === "string" ? record.stderr : "",
      exitCode: typeof exitCode === "number" ? exitCode : null,
      durationMs: typeof record?.durationMs === "number" ? record.durationMs : null,
      error: typeof record?.error === "string" ? record.error : null
    },
    adapter: typeof record?.adapter === "string" ? record.adapter : null,
    teacherModel,
    ranAt: typeof record?.ranAt === "string" ? record.ranAt : null
  };
}

/**
 * OpenAI-style chat example for SFT / TRL / LlamaFactory datasets.
 * @param {Record<string, unknown>} record
 */
export function sandboxRunRecordToMessagesExample(record) {
  const instructions = typeof record?.instructions === "string" ? record.instructions : "";
  const command = typeof record?.command === "string" ? record.command : "";
  const stdout = typeof record?.stdout === "string" ? record.stdout : "";
  const system = instructions.trim() ? instructions : "(no system instructions)";
  const user = command.trim() ? command : "(empty command)";
  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: stdout }
    ]
  };
}

/**
 * @param {Record<string, unknown>} sidecar full growthub.source-records.json object
 * @param {{ exitCodeZeroOnly?: boolean, noError?: boolean }} opts
 * @returns {Array<{ sourceId: string, record: Record<string, unknown> }>}
 */
export function listSandboxRunRecordsFromSidecar(sidecar, opts = {}) {
  const exitCodeZeroOnly = opts.exitCodeZeroOnly !== false;
  const noError = opts.noError !== false;
  if (!sidecar || typeof sidecar !== "object") return [];
  const out = [];
  for (const sourceId of Object.keys(sidecar)) {
    if (!sourceId.startsWith(SANDBOX_SOURCE_PREFIX)) continue;
    const bucket = sidecar[sourceId];
    const records = Array.isArray(bucket?.records) ? bucket.records : [];
    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      if (exitCodeZeroOnly && record.exitCode !== 0) continue;
      if (noError && record.error) continue;
      out.push({ sourceId, record });
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} workspaceConfig
 * @param {string} objectId
 * @param {string} rowName sandbox row Name column
 */
export function findSandboxRowByName(workspaceConfig, objectId, rowName) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const object = objects.find(
    (o) => o?.id === objectId && o?.objectType === "sandbox-environment"
  );
  if (!object) return null;
  const wanted = String(rowName || "").trim();
  const rows = Array.isArray(object.rows) ? object.rows : [];
  return rows.find((r) => String(r?.Name || "").trim() === wanted) || null;
}

/**
 * Resolve the Data Model row for a persisted sidecar key `sandbox:<objectId>:<slug>`.
 * @param {Record<string, unknown>} workspaceConfig
 * @param {string} sourceId
 */
export function findSandboxRowForSourceId(workspaceConfig, sourceId) {
  const parsed = parseSandboxSourceId(sourceId);
  if (!parsed) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const object = objects.find(
    (o) => o?.id === parsed.objectId && o?.objectType === "sandbox-environment"
  );
  if (!object) return null;
  const rows = Array.isArray(object.rows) ? object.rows : [];
  for (const row of rows) {
    if (sandboxRunSourceId(parsed.objectId, row.Name) === sourceId) return row;
  }
  return null;
}
