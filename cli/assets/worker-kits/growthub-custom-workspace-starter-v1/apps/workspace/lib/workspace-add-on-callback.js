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
  findSandboxRowByScheduleId,
  withSandboxScheduledRunProof,
} from "@/lib/workspace-add-ons";
import {
  getSchedulerAdapter,
  isSchedulerProduct,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
} from "@/lib/workspace-add-on-scheduler";
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

async function blockedCallbackReceipt(provider, kind, summary, code, objectRefs = []) {
  await appendOutcomeReceipt({
    kind: "workspace-add-on-callback",
    lane: "server-authoritative",
    outcomeStatus: "blocked",
    actor: provider.providerId,
    objectRefs,
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
    await blockedCallbackReceipt(provider, kind, `Rejected ${kind} callback for ${product.label}: ${verdict.reason}.`, `callback_signature_${verdict.reason}`);
    return { status: 401, body: { error: "invalid signature", reason: verdict.reason } };
  }

  const parsed = adapter.parseCallback({ rawBody, kind });

  // A governed scheduled callback MUST carry the installed schedule identity and
  // resolve to the OWNING workflow row. Signature proves QStash sent it; it does
  // NOT prove the workflow is still bound to that schedule — that is checked here
  // against workspace state, so a stray/stale signed callback cannot mutate config.
  if (!clean(parsed.scheduleId)) {
    await blockedCallbackReceipt(provider, kind, `${product.label} ${kind} callback ignored: no scheduleId.`, "callback_missing_schedule_id");
    return { status: 400, body: { error: "callback is missing a scheduleId" } };
  }
  const config = await readWorkspaceConfig();
  const owner = findSandboxRowByScheduleId(config, parsed.scheduleId);
  if (!owner) {
    await blockedCallbackReceipt(provider, kind, `${product.label} ${kind} callback ignored: no workflow row owns schedule ${parsed.scheduleId}.`, "callback_no_installed_schedule");
    return { status: 409, body: { error: "no workflow row owns this schedule" } };
  }
  // The owning row must still be bound to THIS provider's scheduler.
  if (clean(owner.row.schedulerRegistryId) !== product.integrationId) {
    await blockedCallbackReceipt(provider, kind, `${product.label} ${kind} callback ignored: ${owner.row.Name} is no longer bound to ${product.integrationId}.`, "callback_row_unbound", [{ objectId: owner.objectId, objectType: "sandbox-environment", rowName: owner.row.Name }]);
    return { status: 409, body: { error: "owning row is no longer bound to this scheduler" } };
  }

  const nowIso = new Date().toISOString();
  // Last scheduled-run proof lives on the OWNING WORKFLOW ROW (runtime truth),
  // not the provider capability row. Opening the workflow row shows whether THIS
  // schedule last fired/succeeded/failed.
  const retryStates = [
    parsed.retried != null ? `retried=${parsed.retried}` : "",
    parsed.maxRetries != null ? `maxRetries=${parsed.maxRetries}` : "",
  ].filter(Boolean).join(",");
  const patch = {
    status: parsed.succeeded ? "connected" : "failed",
    lastTested: nowIso,
    lastResponse: parsed.succeeded ? `Scheduled run ok (HTTP ${parsed.status}).` : `Scheduled run failed: ${parsed.failureReason}.`,
    lastScheduledRunStatus: parsed.status == null ? "" : String(parsed.status),
    lastScheduledRunMessageId: parsed.messageId,
    lastScheduledRunAttemptedAt: nowIso,
    lastScheduledRunBodyPreview: parsed.bodyPreview,
    lastScheduledRunFailureReason: parsed.succeeded ? "" : parsed.failureReason,
    lastScheduledRunRetries: retryStates,
  };
  patch[parsed.succeeded ? "lastScheduledRunSucceededAt" : "lastScheduledRunFailedAt"] = nowIso;

  const { config: nextConfig, found } = withSandboxScheduledRunProof(config, { objectId: owner.objectId, rowId: owner.row.Name, patch });
  let persisted = true;
  try {
    if (found) await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
    else persisted = false;
  } catch {
    persisted = false;
  }

  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-scheduled-run-callback",
    lane: "server-authoritative",
    outcomeStatus: parsed.succeeded ? "published" : "failed",
    actor: provider.providerId,
    objectRefs: [{ objectId: owner.objectId, objectType: "sandbox-environment", rowName: owner.row.Name }],
    changedFields: [`dataModel.${owner.objectId}.${owner.row.Name}.lastScheduledRunStatus`],
    policyVerdict: { ok: parsed.succeeded },
    summary: parsed.succeeded
      ? `${owner.row.Name} scheduled run synced (HTTP ${parsed.status}, msg ${parsed.messageId || "?"}) via ${product.label}.`
      : `${owner.row.Name} scheduled run failed: ${parsed.failureReason} (via ${product.label}).`,
    runId: parsed.messageId || undefined,
  });

  return {
    status: 200,
    body: {
      ok: true,
      providerId: provider.providerId,
      productId: product.productId,
      objectId: owner.objectId,
      rowId: owner.row.Name,
      synced: parsed.succeeded,
      persisted,
      receiptId: receipt.receiptId,
    },
  };
}

export { handleSchedulerCallback };
