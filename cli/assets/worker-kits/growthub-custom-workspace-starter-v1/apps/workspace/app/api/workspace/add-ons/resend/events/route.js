/**
 * POST /api/workspace/add-ons/resend/events
 *
 * The Resend WEBHOOK door — the receiving half of the email tracking loop.
 * Point the Resend dashboard's webhook endpoint at this route and every
 * lifecycle event for a sent email (email.sent / delivered / delivery_delayed
 * / bounced / complained / failed / opened / clicked) lands on the governed
 * `email-activity` row for that exact message id.
 *
 * Authority contract (mirrors the inbound-webhook workflow lane):
 *   - EXTERNAL caller (Resend), so no operator session — the Svix signature
 *     IS the authentication. Verified over the RAW body with
 *     RESEND_WEBHOOK_SECRET (runtime env only; never stored anywhere).
 *   - Missing secret → 422 receipted blocked naming the env ref.
 *   - Invalid/stale signature → 401 receipted blocked. No row is touched.
 *   - Applied events mutate ONLY the email-activity object and are receipted.
 *   - Event types outside Resend's documented email surface are skipped
 *     honestly (202, skipped:true) — nothing invented.
 */

import { NextResponse } from "next/server";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readEnvVar } from "@/lib/server-secrets";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  RESEND_EMAIL_EVENT_TYPES,
  applyResendEvent,
  verifyResendWebhookSignature,
} from "@/lib/workspace-email-sends";

const WEBHOOK_SECRET_ENV = "RESEND_WEBHOOK_SECRET";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

async function appendEventReceipt({ outcomeStatus, summary, nextActions = [], violationCodes = [] }) {
  return appendOutcomeReceipt({
    kind: "workspace-add-on-messaging",
    lane: "server-authoritative",
    outcomeStatus,
    actor: "resend-webhook",
    objectRefs: [{ objectId: "email-activity", objectType: "data-source", rowName: "email activity" }],
    changedFields: [],
    policyVerdict: violationCodes.length ? { ok: false, violationCodes } : { ok: true },
    schemaVerdict: { ok: true },
    summary,
    nextActions,
  });
}

async function POST(request) {
  // Raw body FIRST — the signature covers the exact bytes on the wire.
  const rawBody = await request.text();

  const secret = clean(readEnvVar(WEBHOOK_SECRET_ENV, process.env)?.value || "");
  if (!secret) {
    await appendEventReceipt({
      outcomeStatus: "blocked",
      summary: `Resend event rejected: ${WEBHOOK_SECRET_ENV} is not resolved in the runtime.`,
      nextActions: [`Set ${WEBHOOK_SECRET_ENV} from the Resend webhook endpoint settings, then redeliver.`],
      violationCodes: ["webhook_secret_missing"],
    });
    return NextResponse.json({ error: "webhook secret is not resolved", missingEnv: [WEBHOOK_SECRET_ENV] }, { status: 422 });
  }

  const verdict = verifyResendWebhookSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
    payload: rawBody,
  });
  if (!verdict.ok) {
    await appendEventReceipt({
      outcomeStatus: "blocked",
      summary: `Resend event rejected: signature verification failed (${verdict.reason}).`,
      nextActions: ["Confirm the endpoint's signing secret matches RESEND_WEBHOOK_SECRET."],
      violationCodes: ["webhook_signature_invalid"],
    });
    return NextResponse.json({ error: "invalid signature", reason: verdict.reason }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON payload" }, { status: 400 });
  }
  const type = clean(event?.type);
  if (!RESEND_EMAIL_EVENT_TYPES.includes(type)) {
    // Signed but out of the email surface (contact.*, domain.*) — honest skip.
    return NextResponse.json({ ok: true, skipped: true, reason: `event type ${type || "(none)"} is outside the email tracking surface` }, { status: 202 });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const nowIso = new Date().toISOString();
  const { config, row, applied, created, reason } = applyResendEvent(workspaceConfig, event, { nowIso });
  if (!applied) {
    return NextResponse.json({ ok: true, skipped: true, reason }, { status: 202 });
  }

  await writeWorkspaceConfig({ dataModel: config.dataModel });
  const { receipt } = await appendEventReceipt({
    outcomeStatus: "published",
    summary: `Resend ${type} applied to email-activity ${row.id}${created ? " (row created from event)" : ""} · status ${row.status} · opens ${row.opens} · clicks ${row.clicks}.`,
  });

  return NextResponse.json({
    ok: true,
    applied: true,
    created,
    type,
    activity: {
      id: row.id,
      status: row.status,
      opens: row.opens,
      clicks: row.clicks,
      lastEventType: row.lastEventType,
      lastEventAt: row.lastEventAt,
    },
    receiptId: receipt.receiptId,
  });
}

export { POST };
