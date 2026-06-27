/**
 * Scheduler callback bridge (route adapter).
 *
 * Thin wrapper: pulls the raw body + signature off the inbound request and
 * delegates to the dependency-injected `runSchedulerCallback` core (which holds
 * the verification + owning-row resolution + binding validation + persistence
 * logic, and is testable offline). The success and failure callback routes both
 * call this with a different `kind`.
 */

import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { runSchedulerCallback } from "@/lib/scheduler-orchestration";

const CALLBACK_DEPS = {
  readConfig: readWorkspaceConfig,
  writeConfig: writeWorkspaceConfig,
  appendReceipt: appendOutcomeReceipt,
  env: process.env,
};

function requestOrigin(request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function requestPublicUrl(request) {
  const origin = requestOrigin(request);
  try {
    const url = new URL(request.url);
    return `${origin}${url.pathname}${url.search}`;
  } catch {
    return origin;
  }
}

async function handleSchedulerCallback({ request, providerId, kind }) {
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature") || request.headers.get("Upstash-Signature") || "";
  let scheduleId = "";
  try {
    scheduleId = new URL(request.url).searchParams.get("scheduleId") || "";
  } catch {
    scheduleId = "";
  }
  return runSchedulerCallback(CALLBACK_DEPS, {
    providerId,
    kind,
    rawBody,
    signature,
    requestOrigin: requestOrigin(request),
    requestUrl: requestPublicUrl(request),
    scheduleId,
  });
}

export { handleSchedulerCallback };
