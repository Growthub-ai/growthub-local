/**
 * GET /api/workspace/distillation-traces
 *
 * Exports sandbox run history from growthub.source-records.json as:
 *   - structured GTM traces (instructions/command/stdout + metadata), or
 *   - OpenAI-style { messages: [...] } lines for SFT / JSONL pipelines.
 *
 * Query:
 *   scope=row|all          default row — row needs objectId + name
 *   objectId, name         sandbox-environment object id + row Name (scope=row)
 *   format=json|ndjson     default json — ndjson returns application/x-ndjson body
 *   exitCodeZeroOnly       default true (0|false to include failed runs)
 *   role                   optional string stored on each structured trace
 *   qualityLabel           optional string (manual corpus label)
 */

import { NextResponse } from "next/server";
import {
  findSandboxRowForSourceId,
  listSandboxRunRecordsFromSidecar,
  sandboxRunRecordToMessagesExample,
  sandboxRunRecordToStructuredTrace
} from "@/lib/distillation-traces";
import { readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { sandboxRunSourceId } from "@/lib/workspace-data-model";

function parseBool(param, defaultValue) {
  if (param == null || param === "") return defaultValue;
  const s = String(param).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(s)) return false;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  return defaultValue;
}

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const scope = String(searchParams.get("scope") || "row").trim().toLowerCase();
  const format = String(searchParams.get("format") || "json").trim().toLowerCase();
  const exitCodeZeroOnly = parseBool(searchParams.get("exitCodeZeroOnly"), true);
  const noError = parseBool(searchParams.get("noError"), true);
  const role = searchParams.get("role")?.trim() || null;
  const qualityLabel = searchParams.get("qualityLabel")?.trim() || null;

  if (scope !== "row" && scope !== "all") {
    return NextResponse.json({ ok: false, error: "scope must be row or all" }, { status: 400 });
  }
  if (format !== "json" && format !== "ndjson") {
    return NextResponse.json({ ok: false, error: "format must be json or ndjson" }, { status: 400 });
  }

  const objectId = String(searchParams.get("objectId") || "").trim();
  const name = String(searchParams.get("name") || "").trim();
  if (scope === "row" && (!objectId || !name)) {
    return NextResponse.json(
      { ok: false, error: "objectId and name are required when scope=row" },
      { status: 400 }
    );
  }

  let workspaceConfig;
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch {
    workspaceConfig = null;
  }

  let pairs = [];
  if (scope === "row") {
    const sourceId = sandboxRunSourceId(objectId, name);
    if (!sourceId) {
      return NextResponse.json({ ok: false, error: "could not derive sandbox sourceId" }, { status: 400 });
    }
    const bucket = await readWorkspaceSourceRecords(sourceId);
    const records = Array.isArray(bucket?.records) ? bucket.records : [];
    pairs = records.map((record) => ({ sourceId, record }));
  } else {
    const sidecar = await readWorkspaceSourceRecords();
    pairs = listSandboxRunRecordsFromSidecar(sidecar, { exitCodeZeroOnly, noError });
  }

  if (exitCodeZeroOnly || noError) {
    pairs = pairs.filter(({ record }) => {
      if (exitCodeZeroOnly && record.exitCode !== 0) return false;
      if (noError && record.error) return false;
      return true;
    });
  }

  const structured = pairs.map(({ sourceId, record }) => {
    const row = workspaceConfig ? findSandboxRowForSourceId(workspaceConfig, sourceId) : null;
    return sandboxRunRecordToStructuredTrace(record, {
      sourceId,
      role,
      qualityLabel,
      sandboxRow: row
    });
  });

  const messagesExamples = pairs.map(({ record }) => sandboxRunRecordToMessagesExample(record));

  if (format === "ndjson") {
    const body = `${messagesExamples.map((line) => JSON.stringify(line)).join("\n")}\n`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  return NextResponse.json(
    {
      ok: true,
      scope,
      traceCount: structured.length,
      traces: structured,
      messagesExamples
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export { GET };
