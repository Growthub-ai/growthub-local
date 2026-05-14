/**
 * GET /api/workspace/gtm-distillation-export
 *
 * Governed export of sandbox run history into JSONL suitable for SFT / labeling
 * pipelines. Reads workspace config + growthub.source-records.json only —
 * never executes models.
 *
 * Query:
 *   objectId (required) — dataModel.objects[].id for a sandbox-environment table
 *   name (required) — sandbox row Name
 *   format=sft|envelope — default sft (OpenAI messages). envelope = GTM trace struct.
 *   goldOnly=1 — emit nothing unless row.traceQualityLabel === "gold"
 *   exitZeroOnly=0 — include failed runs (default: only exitCode 0 and no error)
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { buildGtmDistillationExport } from "@/lib/gtm-distillation-export";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const objectId = String(searchParams.get("objectId") || "").trim();
  const name = String(searchParams.get("name") || "").trim();
  const formatRaw = String(searchParams.get("format") || "sft").trim().toLowerCase();
  const format = formatRaw === "envelope" ? "envelope" : "sft";
  const goldOnly =
    searchParams.get("goldOnly") === "1" || String(searchParams.get("goldOnly") || "").toLowerCase() === "true";
  const exitZeroOnly = !(
    searchParams.get("exitZeroOnly") === "0" || String(searchParams.get("exitZeroOnly") || "").toLowerCase() === "false"
  );

  if (!objectId || !name) {
    return NextResponse.json(
      { ok: false, error: "objectId and name query parameters are required" },
      { status: 400 },
    );
  }

  let workspaceConfig;
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "failed to read workspace config" },
      { status: 500 },
    );
  }

  let sourceRoot = {};
  try {
    sourceRoot = (await readWorkspaceSourceRecords()) || {};
  } catch {
    sourceRoot = {};
  }

  const built = buildGtmDistillationExport(workspaceConfig, sourceRoot, {
    objectId,
    name,
    format,
    goldOnly,
    exitZeroOnly,
  });

  if (built.missingRow) {
    return NextResponse.json(
      { ok: false, error: `no sandbox-environment row ${objectId} / ${name}` },
      { status: 404 },
    );
  }

  if (built.rejectedReason) {
    return NextResponse.json(
      {
        ok: false,
        error: built.rejectedReason,
        sourceId: built.sourceId,
      },
      { status: 409 },
    );
  }

  const body = `${built.lines.join("\n")}${built.lines.length ? "\n" : ""}`;
  const filename =
    format === "envelope"
      ? `gtm-traces-${objectId}-${name.replace(/[^a-z0-9]+/gi, "-")}.jsonl`
      : `gtm-sft-${objectId}-${name.replace(/[^a-z0-9]+/gi, "-")}.jsonl`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-growthub-export-lines": String(built.lines.length),
      "x-growthub-export-skipped": String(built.skipped ?? 0),
      "x-growthub-source-id": built.sourceId || "",
    },
  });
}
