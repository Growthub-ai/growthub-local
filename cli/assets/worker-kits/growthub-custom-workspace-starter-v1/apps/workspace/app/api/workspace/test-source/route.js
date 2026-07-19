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
 * Response — custom model:
 *   { ok: true, tunedTagVerified: true, response, verificationReceipt }
 *
 * Authority contract: tokens never leave the server. The browser sends only
 * non-secret binding metadata. Provider auth is read from env server-side.
 */

import { NextResponse } from "next/server";
import { requireAppScope, checkScopedRegistryAccess } from "@/lib/workspace-app-registry";
import { readWorkspaceConfig as readCfgForScope } from "@/lib/workspace-config";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readAdapterConfig } from "@/lib/adapters/env";
import { listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { getSourceResolver, listRegisteredResolvers } from "@/lib/adapters/integrations/source-resolver-registry";
import { executeCustomModelSourceTest } from "@/lib/custom-model-test-source";
import { readServerSecret } from "@/lib/server-secrets";

const PREVIEW_ROW_LIMIT = 8;

function operatorCsv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

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
  const workspaceConfig = await readCfgForScope().catch(() => ({}));
  let appScope = "";
  // App-scope gate: a scoped agent may only test integrations on its
  // registry-row registryIds (data-plane isolation, Attio-style object scope).
  {
    const scope = requireAppScope(request, workspaceConfig);
    if (scope.scoped) {
      const violation = scope.violation || checkScopedRegistryAccess(scope.context, integrationId);
      if (violation) {
        await appendOutcomeReceipt({
          kind: "agent-outcome", lane: "untrusted-direct", outcomeStatus: "blocked",
          appId: violation.appScope || scope.appId,
          summary: `test-source rejected (422 app scope): ${violation.violationType}`,
          nextActions: violation.repairPlan
        });
        return NextResponse.json(violation, { status: 422 });
      }
      appScope = String(scope.appId || "");
    }
  }
  if (typeof integrationId !== "string" || !integrationId.trim()) {
    return NextResponse.json({ ok: false, reason: "bad-request", error: "integrationId must be a non-empty string" }, { status: 400 });
  }

  // Custom models are explicit governed API Registry capabilities, not data
  // source resolvers. Recognize only the trait + mothership/student relation,
  // then run the real first invocation through the inference gateway. The
  // helper is read-only; durable activation still uses the canonical PATCH or
  // sandbox-run lanes.
  const testAuthRefs = operatorCsv("GROWTHUB_INFERENCE_TEST_AUTH_REFS");
  const testResolvedEnv = {};
  for (const ref of testAuthRefs) {
    const secret = readServerSecret(ref);
    if (secret) testResolvedEnv[ref] = secret.value;
  }
  const customModelResult = await executeCustomModelSourceTest({
    workspaceConfig,
    integrationId: integrationId.trim(),
    prompt: String(body?.prompt || ""),
    runId: `test-source:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`,
    traceparent: String(request.headers.get("traceparent") || ""),
    tracestate: String(request.headers.get("tracestate") || ""),
    appScope,
    networkPolicy: {
      networkAllow: operatorCsv("GROWTHUB_INFERENCE_TEST_ALLOWLIST").length > 0,
      allowList: operatorCsv("GROWTHUB_INFERENCE_TEST_ALLOWLIST"),
    },
    resolvedEnv: testResolvedEnv,
    allowedEnvRefs: testAuthRefs,
    signal: request.signal,
    // Artifact verification plus the first GGUF load can legitimately exceed
    // 30 seconds on external storage. Keep the verification probe bounded by
    // the inference runtime's existing hard ceiling while allowing a real
    // cold start to finish.
    timeoutMs: 120_000,
  });
  if (customModelResult.handled) {
    const policyError = ["ambiguous-mothership-policy", "invalid-mothership-policy", "model-tag-mismatch"]
      .includes(String(customModelResult.reason || ""));
    const status = customModelResult.ok ? 200
      : policyError ? 422
        : customModelResult.reason === "tool-result-required" ? 409
          : 502;
    return NextResponse.json(customModelResult, { status });
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

  // Resolve the live bridge connection for this integration so the resolver
  // receives the full connection object (connectionId, authPath, metadata).
  let connection = null;
  try {
    const integrations = await listGovernedWorkspaceIntegrations();
    connection = integrations.find(
      (i) => i.provider === integrationId.trim() || i.id === integrationId.trim()
    ) || null;
  } catch {
    // Non-fatal — resolver falls back to env-only auth
  }

  let records;
  try {
    records = await resolver.fetchRecords(adapterConfig, connection, binding || {});
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

  const resolverMeta = {
    entityTypes: Array.isArray(resolver.entityTypes) ? resolver.entityTypes : [],
    configSchema: Array.isArray(resolver.configSchema) ? resolver.configSchema : null,
    hasListEntities: typeof resolver.listEntities === "function",
    connectorKind: typeof resolver.connectorKind === "string" ? resolver.connectorKind : null,
    templateId: typeof resolver.templateId === "string" ? resolver.templateId : null,
    capabilities: Array.isArray(resolver.capabilities) ? resolver.capabilities : null,
    referenceSchema:
      resolver.referenceSchema && typeof resolver.referenceSchema === "object" && !Array.isArray(resolver.referenceSchema)
        ? resolver.referenceSchema
        : null
  };

  return NextResponse.json({
    ok: true,
    integrationId: integrationId.trim(),
    recordCount: records.length,
    columns,
    preview,
    entityTypes: resolverMeta.entityTypes,
    resolverMeta
  });
}

export { POST };
