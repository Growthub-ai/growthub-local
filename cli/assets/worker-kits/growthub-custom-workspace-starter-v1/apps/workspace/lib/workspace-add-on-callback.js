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
import { getSchedulerAdapter, isSchedulerProduct } from "@/lib/workspace-add-on-scheduler";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function schedulerProductFor(provider) {
  return (provider?.products || []).find((product) => isSchedulerProduct(product)) || null;
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

  const verdict = adapter.verifyCallback({ signature, rawBody, env: process.env });
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
  // Defensive: confirm the callback maps to the installed schedule.
  if (parsed.scheduleId && row?.scheduleId && clean(parsed.scheduleId) !== clean(row.scheduleId)) {
    return { status: 409, body: { error: "callback scheduleId does not match installed schedule" } };
  }

  const nowIso = new Date().toISOString();
  const patch = {
    lastResponseStatus: parsed.status == null ? "" : String(parsed.status),
    lastResponseBodyPreview: parsed.bodyPreview,
    lastMessageId: parsed.messageId,
    lastAttemptedAt: nowIso,
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
