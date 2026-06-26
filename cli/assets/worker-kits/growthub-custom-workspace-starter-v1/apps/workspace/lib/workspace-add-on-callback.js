/**
 * Scheduler callback bridge — the synchronization closure point.
 *
 * When a provider runs a scheduled workflow it POSTs the run's result back to a
 * signed callback URL. This module verifies that signature, parses the envelope
 * into NON-SECRET proof, and writes the last response into workspace config (the
 * product's API Registry row) + an outcome receipt. Without this step the
 * scheduler can run but the workspace never learns what happened.
 *
 * Provider-agnostic: the provider's scheduler product supplies the adapter that
 * knows how to verify + parse. Both the success callback and the failure
 * callback flow through `handleSchedulerCallback` with a different `kind`.
 *
 * Returns a plain `{ status, body }` so the route wrappers stay one line and the
 * branching logic is server-testable without the Next runtime.
 */

import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  findRegistryRowByIntegrationId,
  withMarketplaceSchedulerMetadata,
} from "@/lib/workspace-add-ons";
import {
  getSchedulerAdapter,
  isSchedulerProduct,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
  evaluateCallbackScheduleMatch,
} from "@/lib/workspace-add-on-scheduler";

const SCHEDULE_MATCH_HTTP = {
  callback_no_installed_schedule: 409,
  callback_missing_schedule_id: 400,
  callback_schedule_id_mismatch: 409,
};
const SCHEDULE_MATCH_MESSAGE = {
  callback_no_installed_schedule: "no installed schedule for this product",
  callback_missing_schedule_id: "callback is missing a scheduleId",
  callback_schedule_id_mismatch: "callback scheduleId does not match installed schedule",
};
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function schedulerProductFor(provider) {
  return (provider?.products || []).find((product) => isSchedulerProduct(product)) || null;
}

function requestOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

async function blockedCallbackReceipt(provider, product, kind, summary, code) {
  await appendOutcomeReceipt({
    kind: "workspace-add-on-callback",
    lane: "server-authoritative",
    outcomeStatus: "blocked",
    actor: provider.providerId,
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
    summary,
    policyVerdict: { ok: false, violationCodes: [code] },
  });
}

/**
 * @param {object} args
 * @param {Request} args.request   incoming signed request
 * @param {string}  args.providerId
 * @param {"callback"|"failure"} args.kind
 */
async function handleSchedulerCallback({ request, providerId, kind }) {
  const provider = getMarketplaceProvider(clean(providerId));
  if (!provider) return { status: 404, body: { error: "unknown marketplace provider", providerId } };

  const product = schedulerProductFor(provider);
  if (!product) return { status: 400, body: { error: "provider has no serverless scheduler product" } };
  const adapter = getSchedulerAdapter(product);

  // RAW body — must be verified before parsing and never re-stringified.
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature") || request.headers.get("Upstash-Signature") || "";

  // Bind the signature to THIS endpoint (anti-replay). The expected URL is the
  // canonical callback/failure route derived from the public URL — never a header.
  const baseUrl = resolveWorkspacePublicUrl(process.env, requestOrigin(request));
  const callbackUrls = buildSchedulerCallbackUrls(baseUrl, provider.providerId);
  const expectedUrl = kind === "failure" ? callbackUrls.failureCallbackUrl : callbackUrls.callbackUrl;

  const verdict = adapter.verifyCallback({ signature, rawBody, expectedUrl, env: process.env });
  if (!verdict.ok) {
    await appendOutcomeReceipt({
      kind: "workspace-add-on-callback",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: provider.providerId,
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
      summary: `Rejected ${kind} callback for ${product.label}: ${verdict.reason}.`,
      policyVerdict: { ok: false, violationCodes: [`callback_signature_${verdict.reason}`] },
    });
    return { status: 401, body: { error: "invalid signature", reason: verdict.reason } };
  }

  const parsed = adapter.parseCallback({ rawBody, kind });

  const config = await readWorkspaceConfig();
  const row = findRegistryRowByIntegrationId(config, product.integrationId);
  // A governed scheduled callback MUST carry the installed schedule identity.
  // Reject (and record) anything that cannot be tied to a live installed
  // schedule, so a stray/forged-but-signed callback can never mutate config.
  const match = evaluateCallbackScheduleMatch({ rowScheduleId: row?.scheduleId, parsedScheduleId: parsed.scheduleId });
  if (!match.ok) {
    await blockedCallbackReceipt(provider, product, kind, `${product.label} ${kind} callback ignored (${match.code}): row=${clean(row?.scheduleId) || "none"} callback=${clean(parsed.scheduleId) || "none"}.`, match.code);
    return { status: SCHEDULE_MATCH_HTTP[match.code] || 409, body: { error: SCHEDULE_MATCH_MESSAGE[match.code] || "callback rejected" } };
  }

  const nowIso = new Date().toISOString();
  const patch = {
    lastResponseStatus: parsed.status == null ? "" : String(parsed.status),
    lastResponseBodyPreview: parsed.bodyPreview,
    lastMessageId: parsed.messageId,
    lastAttemptedAt: nowIso,
    lastScheduleStates: [
      parsed.retried != null ? `retried=${parsed.retried}` : "",
      parsed.maxRetries != null ? `maxRetries=${parsed.maxRetries}` : "",
    ].filter(Boolean).join(","),
    lastResponse: parsed.succeeded
      ? `Scheduled run ok (HTTP ${parsed.status}).`
      : `Scheduled run failed: ${parsed.failureReason}.`,
  };
  if (parsed.succeeded) {
    patch.lastSucceededAt = nowIso;
    patch.lastFailureReason = "";
  } else {
    patch.lastFailedAt = nowIso;
    patch.lastFailureReason = parsed.failureReason;
  }

  const nextConfig = withMarketplaceSchedulerMetadata(config, { integrationId: product.integrationId, patch });
  let persisted = true;
  try {
    await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  } catch {
    persisted = false;
  }

  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-callback",
    lane: "server-authoritative",
    outcomeStatus: parsed.succeeded ? "published" : "failed",
    actor: provider.providerId,
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
    changedFields: ["dataModel.api-registry"],
    policyVerdict: { ok: parsed.succeeded },
    summary: parsed.succeeded
      ? `${product.label} scheduled run synced (HTTP ${parsed.status}, msg ${parsed.messageId || "?"}).`
      : `${product.label} scheduled run failed: ${parsed.failureReason}.`,
    runId: parsed.messageId || undefined,
  });

  return {
    status: 200,
    body: {
      ok: true,
      providerId: provider.providerId,
      productId: product.productId,
      synced: parsed.succeeded,
      persisted,
      receiptId: receipt.receiptId,
    },
  };
}

export { handleSchedulerCallback };
