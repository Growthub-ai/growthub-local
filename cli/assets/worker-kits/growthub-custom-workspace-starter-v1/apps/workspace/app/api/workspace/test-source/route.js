/**
 * POST /api/workspace/test-source
 *
 * Tests a live source binding by calling the registered resolver for the
 * requested integrationId and returning a preview of normalized records.
 * Used by the no-code Live Source wizard in the widget source panel before
 * the user applies the binding and triggers a full refresh.
 *
 * Dynamically loads resolver files from lib/adapters/integrations/resolvers/
 * so operators can drop new resolver files without restarting the server
 * (effective in Next.js dev mode with filesystem persistence).
 *
 * Request body:
 *   {
 *     integrationId: string,        // provider slug, e.g. "my-crm"
 *     binding: {                    // provisional binding config from wizard
 *       entityType?: string,
 *       entityId?: string,
 *       sourceId?: string,
 *       authMode?: "bridge" | "byo-token"
 *     }
 *   }
 *
 * Response — success:
 *   { ok: true, integrationId, recordCount, columns, preview: Record[] }
 *
 * Response — no resolver:
 *   { ok: false, reason: "no-resolver", registeredResolvers: string[] }
 *
 * Response — resolver error:
 *   { ok: false, reason: "fetch-error", error: string }
 *
 * Authority contract: tokens never leave the server. The browser sends only
 * non-secret binding metadata. Provider auth is read from env server-side.
 */

import { NextResponse } from "next/server";
import { readAdapterConfig } from "@/lib/adapters/env";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { getSourceResolver, listRegisteredResolvers } from "@/lib/adapters/integrations/source-resolver-registry";

const PREVIEW_ROW_LIMIT = 8;

function inferColumns(records) {
  const cols = new Set();
  for (const record of records.slice(0, 20)) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      for (const key of Object.keys(record)) cols.add(key);
    }
  }
  return Array.from(cols);
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-request", error: "invalid JSON body" }, { status: 400 });
  }

  const { integrationId, binding } = body || {};
  if (typeof integrationId !== "string" || !integrationId.trim()) {
    return NextResponse.json({ ok: false, reason: "bad-request", error: "integrationId must be a non-empty string" }, { status: 400 });
  }

  // Load any resolver files the operator has dropped in the resolvers directory.
  await loadAllResolvers();

  const resolver = getSourceResolver(integrationId.trim());
  if (!resolver) {
    return NextResponse.json({
      ok: false,
      reason: "no-resolver",
      integrationId: integrationId.trim(),
      registeredResolvers: listRegisteredResolvers(),
      hint: "Drop a resolver file in lib/adapters/integrations/resolvers/ that calls registerSourceResolver({ integrationId }) and re-run the test."
    });
  }

  const adapterConfig = readAdapterConfig();
  let records;
  try {
    records = await resolver.fetchRecords(adapterConfig, null, binding || {});
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reason: "fetch-error",
      integrationId: integrationId.trim(),
      error: err?.message || "resolver.fetchRecords threw an error"
    });
  }

  if (!Array.isArray(records)) {
    return NextResponse.json({
      ok: false,
      reason: "bad-resolver-response",
      integrationId: integrationId.trim(),
      error: "resolver.fetchRecords must return an array"
    });
  }

  const columns = inferColumns(records);
  const preview = records.slice(0, PREVIEW_ROW_LIMIT);

  return NextResponse.json({
    ok: true,
    integrationId: integrationId.trim(),
    recordCount: records.length,
    columns,
    preview,
    entityTypes: resolver.entityTypes || []
  });
}

export { POST };
