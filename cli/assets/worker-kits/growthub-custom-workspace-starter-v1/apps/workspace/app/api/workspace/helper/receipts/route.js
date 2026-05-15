/**
 * GET /api/workspace/helper/receipts
 *
 * Returns the last N workspace helper apply receipts.
 * Used by the review UI to display accepted proposal history and seed
 * the fine-tune feedback loop.
 *
 * Query params:
 *   limit  — max records to return (default 25, max 100)
 *   type   — filter by proposal type (optional)
 */

import { NextResponse } from "next/server";
import { readWorkspaceSourceRecords } from "@/lib/workspace-config";

const HELPER_APPLY_SOURCE_KEY = "helper:apply:receipts";

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = parseInt(searchParams.get("limit") || "25", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;
  const typeFilter = searchParams.get("type") || "";

  let records = [];
  try {
    const existing = await readWorkspaceSourceRecords(HELPER_APPLY_SOURCE_KEY);
    records = Array.isArray(existing?.records) ? existing.records : [];
  } catch {
    records = [];
  }

  if (typeFilter) {
    records = records.filter((r) => r.type === typeFilter);
  }

  const page = records.slice(-limit).reverse();

  return NextResponse.json({
    ok: true,
    totalCount: records.length,
    recordCount: page.length,
    receipts: page,
    records: page,
  });
}

export { GET };
