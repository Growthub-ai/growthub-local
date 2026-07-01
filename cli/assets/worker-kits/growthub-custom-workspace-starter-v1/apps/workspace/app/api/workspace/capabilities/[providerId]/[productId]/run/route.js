/**
 * POST /api/workspace/capabilities/[providerId]/[productId]/run
 *
 * The governed ACTION edge of the capability closed loop (the non-scheduler
 * analog of the QStash schedule/run route). It resolves the capability adapter
 * from the marketplace descriptor, builds the provider request with the auth
 * atom (secret in headers ONLY), calls the provider, writes NON-SECRET last-run
 * proof back onto the owning workflow row through the governed workspace write,
 * and records a `workspace:agent-outcomes` receipt — the reward signal that both
 * the /deploy·/data cockpit (dopamine loop) and an agent (RL loop) re-derive from.
 *
 * GOVERNANCE: config changes go through the governed workspace write; secrets
 * stay server-side (never in the row, receipt, or response); the run pointer
 * body carries no secret.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  getMarketplaceProduct,
  withSandboxScheduledRunProof,
} from "@/lib/workspace-add-ons";
import {
  resolveCapabilityBaseUrl,
  buildCapabilityActionRequest,
  parseCapabilityActionResponse,
} from "@/lib/capability-binding";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const ACTION_TIMEOUT_MS = 15000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the action step for this product: explicit `step` name, else the
 * first declared step under the product's `action` descriptor (skipping `lane`
 * and host-config keys). */
function resolveActionStep(product, stepName) {
  const action = product?.action && typeof product.action === "object" ? product.action : {};
  if (clean(stepName) && action[clean(stepName)] && action[clean(stepName)].path) {
    return { name: clean(stepName), step: action[clean(stepName)] };
  }
  for (const [name, value] of Object.entries(action)) {
    if (name === "lane" || name === "baseUrlEnv") continue;
    if (value && typeof value === "object" && value.path) return { name, step: value };
  }
  return null;
}

async function POST(request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const productId = clean(params?.productId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });
  const product = getMarketplaceProduct(provider.providerId, productId);
  if (!product) return jsonError("unknown provider product", 404, { providerId: provider.providerId, productId });

  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }

  const resolved = resolveActionStep(product, body.step);
  if (!resolved) return jsonError(`${product.label} declares no runnable action step`, 400, { providerId: provider.providerId, productId });

  // Base URL: fixed provider host, or a per-project host from the action's
  // baseUrlEnv (e.g. Supabase SUPABASE_URL) — same pattern as the probe lane.
  const baseUrl = resolveCapabilityBaseUrl(
    { baseUrl: provider.baseUrl, baseUrlEnv: product.action?.baseUrlEnv },
    process.env,
  );
  const built = buildCapabilityActionRequest({
    auth: product.auth,
    baseUrl,
    step: resolved.step,
    body: body.payload ?? null,
    pathVars: body.pathVars && typeof body.pathVars === "object" ? body.pathVars : {},
    env: process.env,
  });
  if (!built.ok) {
    await appendOutcomeReceipt({
      kind: "workspace-capability-run",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
      summary: `${product.label} action blocked: credentials/host not resolved.`,
      policyVerdict: { ok: false, violationCodes: ["capability_credentials_missing"] },
      nextActions: [`Complete ${provider.label} setup so ${(built.missingEnv || []).join(", ")} resolve, then run again.`],
    });
    return jsonError(`${product.label} credentials/host are not resolved`, 422, { providerId: provider.providerId, productId, missingEnv: built.missingEnv || [] });
  }

  let outcome;
  try {
    const response = await fetchWithTimeout(built.request.url, {
      method: built.request.method,
      headers: built.request.headers,
      ...(built.request.body ? { body: built.request.body } : {}),
    });
    let text = "";
    try { text = await response.text(); } catch { text = ""; }
    outcome = parseCapabilityActionResponse({ label: product.label, status: response.status, body: text });
    outcome.status = response.status;
  } catch (error) {
    outcome = { ok: false, status: 0, proof: `${product.label} action failed: ${error?.message || "network error"}`, summary: `${product.label} action failed to reach the provider.`, responsePreview: "" };
  }

  // Write NON-SECRET last-run proof back onto the owning workflow row (if the
  // action was invoked for one) through the governed workspace write.
  const objectId = clean(body.objectId);
  const rowId = clean(body.rowId);
  let persisted = null;
  if (objectId && rowId) {
    const currentConfig = await readWorkspaceConfig();
    const { config: nextConfig, found } = withSandboxScheduledRunProof(currentConfig, {
      objectId,
      rowId,
      patch: {
        lastCapabilityRunStatus: String(outcome.status || ""),
        lastCapabilityRunAt: outcome.testedAt || "",
        lastCapabilityRunProof: outcome.proof || "",
        lastCapabilityRunProvider: provider.providerId,
        lastCapabilityRunProduct: product.productId,
      },
    });
    if (found) persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  }

  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-capability-run",
    lane: "execution-proof",
    outcomeStatus: outcome.ok ? "published" : "failed",
    actor: "workspace-marketplace",
    objectRefs: objectId && rowId
      ? [{ objectId, objectType: "sandbox-environment", rowName: rowId }]
      : [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
    changedFields: persisted ? [`${objectId}.${rowId}.lastCapabilityRunStatus`] : [],
    policyVerdict: { ok: true },
    summary: outcome.summary,
    nextActions: outcome.ok
      ? [`Open /${provider.category === "deploy" ? "deploy" : provider.category === "data" ? "data" : "workflows"} to see the run proof and the next move.`]
      : [`Re-run after resolving the provider error, or open the workflow to inspect the ${resolved.name} node.`],
  });

  return NextResponse.json({
    ok: outcome.ok,
    providerId: provider.providerId,
    productId: product.productId,
    action: resolved.name,
    run: { status: outcome.status, proof: outcome.proof, summary: outcome.summary },
    workspaceConfig: persisted || undefined,
    receiptId: receipt.receiptId,
  }, { status: outcome.ok ? 200 : 502 });
}

export { POST };
