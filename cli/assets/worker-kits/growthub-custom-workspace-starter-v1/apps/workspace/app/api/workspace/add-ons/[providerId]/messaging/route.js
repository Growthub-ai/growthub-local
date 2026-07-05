/**
 * GET  /api/workspace/add-ons/[providerId]/messaging
 * POST /api/workspace/add-ons/[providerId]/messaging
 *
 * Governed outbound-messaging door for workspace-messaging products — the
 * /messaging sibling of the /data and /storage doors. Provider-agnostic by
 * lane; the external HTTP grammar dispatches on the product's connectorKind
 * (V1: resend-messaging → POST {base}/emails).
 *
 *   GET  → read-only state: product readiness, env resolution (names only),
 *          sender resolution, and the verified product row summary.
 *   POST → one governed action per call, receipted (workspace-add-on-messaging):
 *            send-test { to, subject, html?, text?, from? }
 *          The REAL provider send the node sidecar's Test tab drives — a
 *          success is live proof (HTTP 200 + provider message id), a failure
 *          (including blocked prerequisites) is an honest receipted outcome.
 *
 * Secrets resolve server-side through the product's declared env contract and
 * never enter rows, receipts, or responses. The browser sends message
 * CONTENT, never a credential.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  findMarketplaceProviderRow,
  findRegistryRowByIntegrationId,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readEnvVar } from "@/lib/server-secrets";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const FETCH_TIMEOUT_MS = 15000;
// Connector kinds this door has an outbound-messaging adapter for.
const SUPPORTED_CONNECTOR_KINDS = new Set(["resend-messaging"]);
const MESSAGING_LANE = "workspace-messaging";
const MAX_RECIPIENTS = 10;
const MAX_BODY_CHARS = 100000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function envValue(key) {
  return clean(readEnvVar(key, process.env)?.value || "");
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the provider's workspace-messaging product + runtime env, or error. */
function resolveMessagingProduct(providerId) {
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return { error: "unknown marketplace provider", status: 404 };
  const product = (provider.products || []).find((item) => clean(item.executionLane) === MESSAGING_LANE);
  if (!product) return { error: `${provider.label} has no workspace-messaging product`, status: 404, provider };
  const kind = clean(product.connectorKind);
  if (!SUPPORTED_CONNECTOR_KINDS.has(kind)) {
    return { error: `connectorKind ${product.connectorKind} has no messaging adapter yet`, status: 400, provider, product };
  }
  const probe = product.probe || {};
  const secret = envValue(probe.tokenEnv);
  const baseUrl = envValue(probe.baseUrlEnv) || clean(probe.fallbackBaseUrl);
  const fromEnv = envValue("RESEND_FROM_EMAIL");
  return {
    provider,
    product,
    kind,
    baseUrl,
    secret,
    fromEnv,
    envReady: Boolean(baseUrl && secret),
    missingEnv: [...(secret ? [] : [probe.tokenEnv])].filter(Boolean),
  };
}

async function appendMessagingReceipt({ outcomeStatus, summary, product, nextActions = [], violationCodes = [] }) {
  return appendOutcomeReceipt({
    kind: "workspace-add-on-messaging",
    lane: "server-authoritative",
    outcomeStatus,
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: clean(product?.label) || "messaging product" }],
    changedFields: [],
    policyVerdict: violationCodes.length ? { ok: false, violationCodes } : { ok: true },
    schemaVerdict: { ok: true },
    summary,
    nextActions,
  });
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

/**
 * "Email HTML only, never app-executed" — strip script blocks, inline event
 * handlers, and javascript: URLs. Mirrors the sidecar editor's sanitizer so
 * the boundary holds even for callers that bypass the UI.
 */
function sanitizeEmailHtml(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?(?:<\/script>|$)/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, "$1=$2#$2");
}

async function GET(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const params = await context?.params;
  const resolution = resolveMessagingProduct(clean(params?.providerId));
  if (resolution.error) return jsonError(resolution.error, resolution.status);

  const workspaceConfig = await readWorkspaceConfig();
  const providerRow = findMarketplaceProviderRow(workspaceConfig, resolution.provider.providerId);
  const productRow = findRegistryRowByIntegrationId(workspaceConfig, resolution.product.integrationId);
  const productVerified = Boolean(productRow
    && clean(productRow.syncStatus) === "verified"
    && clean(productRow.syncProof)
    && clean(productRow.syncCheckedAt));

  return NextResponse.json({
    ok: true,
    providerId: resolution.provider.providerId,
    productId: resolution.product.productId,
    integrationId: resolution.product.integrationId,
    providerConnected: Boolean(providerRow?.isConnectedProvider),
    productVerified,
    envReady: resolution.envReady,
    missingEnv: resolution.missingEnv,
    // Sender readiness — names only. The node sidecar shows this as the
    // Connect step (RESEND_FROM_EMAIL chip), nothing is asked of the user
    // when the env ref already resolves.
    senderEnvRef: "RESEND_FROM_EMAIL",
    senderReady: Boolean(resolution.fromEnv),
    syncProof: clean(productRow?.syncProof || ""),
    syncCheckedAt: clean(productRow?.syncCheckedAt || ""),
  });
}

async function POST(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const params = await context?.params;
  const resolution = resolveMessagingProduct(clean(params?.providerId));
  if (resolution.error) return jsonError(resolution.error, resolution.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }
  const action = clean(body.action);
  if (action !== "send-test") {
    return jsonError("action must be send-test", 400);
  }

  const workspaceConfig = await readWorkspaceConfig();
  const providerRow = findMarketplaceProviderRow(workspaceConfig, resolution.provider.providerId);

  // Hard gate 1: provider must be connected for any messaging action.
  if (!providerRow?.isConnectedProvider) {
    await appendMessagingReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} send-test blocked: ${resolution.provider.label} account not connected.`,
      product: resolution.product,
      violationCodes: ["provider_not_connected"],
      nextActions: [`Connect the ${resolution.provider.label} provider account in the marketplace, then retry.`],
    });
    return jsonError(`${resolution.provider.label} provider account is not connected`, 409);
  }
  // Hard gate 2: runtime env must resolve server-side.
  if (!resolution.envReady) {
    await appendMessagingReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} send-test blocked: runtime env not resolved.`,
      product: resolution.product,
      violationCodes: ["messaging_env_not_ready"],
      nextActions: [`Resolve ${resolution.missingEnv.join(", ")} in the runtime.`],
    });
    return jsonError("messaging runtime env is not resolved", 422, { missingEnv: resolution.missingEnv });
  }

  const recipients = clean(body.to).split(",").map((value) => value.trim()).filter(Boolean).slice(0, MAX_RECIPIENTS);
  const subject = clean(body.subject);
  // Same "email HTML only, never app-executed" boundary the sidecar editor
  // enforces — script blocks, inline handlers, and javascript: URLs are
  // stripped server-side before any send or persistence-adjacent use.
  const html = sanitizeEmailHtml(String(body.html || "").slice(0, MAX_BODY_CHARS)).trim();
  const text = String(body.text || "").slice(0, MAX_BODY_CHARS).trim();
  const from = clean(body.from) || resolution.fromEnv;
  // Node-proof correlation key (workflow row + node id + draft hash) — the
  // sidecar sends it so the receipt can anchor a future publish contract.
  const context = body.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context : {};
  const proofKey = [clean(context.workflowRef), clean(context.nodeId), clean(context.draftHash)].filter(Boolean).join(" · ");
  if (!recipients.length || recipients.some((value) => !looksLikeEmail(value)) || !subject || (!html && !text)) {
    await appendMessagingReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} send-test blocked: To, Subject, and an HTML or text body are required.`,
      product: resolution.product,
      violationCodes: ["invalid_message_request"],
    });
    return jsonError("send-test requires valid To address(es), Subject, and an HTML or text body", 400);
  }
  if (!from) {
    await appendMessagingReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} send-test blocked: sender is not resolved (RESEND_FROM_EMAIL).`,
      product: resolution.product,
      violationCodes: ["sender_not_resolved"],
      nextActions: ["Set RESEND_FROM_EMAIL in the runtime, or pass a From value."],
    });
    return jsonError("sender is not resolved — set RESEND_FROM_EMAIL in the runtime or pass a From value", 422, { missingEnv: ["RESEND_FROM_EMAIL"] });
  }

  let response;
  try {
    response = await fetchWithTimeout(`${resolution.baseUrl.replace(/\/+$/, "")}/emails`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${resolution.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: recipients, subject, ...(html ? { html } : {}), ...(text ? { text } : {}) }),
    });
  } catch (error) {
    const detail = error?.name === "AbortError" ? "request timed out" : "network error";
    await appendMessagingReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} send-test failed: ${detail}.`,
      product: resolution.product,
      violationCodes: ["messaging_send_failed"],
    });
    return jsonError(`send-test failed (${detail})`, 502);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const providerMessageId = clean(payload?.id || "");
  const testedAt = new Date().toISOString();

  if (!response.ok) {
    await appendMessagingReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} send-test blocked: provider returned HTTP ${response.status}.`,
      product: resolution.product,
      violationCodes: ["messaging_send_failed"],
      nextActions: ["Verify the sending domain and API key scope in the provider dashboard, then retry."],
    });
    return jsonError(`send-test failed (HTTP ${response.status})`, 502, {
      httpStatus: response.status,
      testedAt,
    });
  }

  const summary = `${resolution.product.label} test email sent · HTTP ${response.status} · ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}${providerMessageId ? ` · id ${providerMessageId}` : ""}${proofKey ? ` · node ${proofKey}` : ""}`;
  const { receipt } = await appendMessagingReceipt({
    outcomeStatus: "published",
    summary,
    product: resolution.product,
    // Node-level proof only — the workflow publish gate remains owned by the
    // full draft test / serverless binding proof contract.
    nextActions: ["Node send proven live. Run the workflow's full draft test to unlock publish — sidecar proof does not gate publish."],
  });

  return NextResponse.json({
    ok: true,
    action,
    httpStatus: response.status,
    providerMessageId,
    recipientCount: recipients.length,
    testedAt,
    summary,
    receiptId: receipt.receiptId,
  });
}

export { GET, POST };
