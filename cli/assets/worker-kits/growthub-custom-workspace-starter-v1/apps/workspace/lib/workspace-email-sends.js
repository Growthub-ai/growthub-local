/**
 * Governed email SEND activity — PURE helpers for the workspace-messaging
 * lane's closed tracking loop.
 *
 * The unit of performance intelligence is the INDIVIDUAL SENT EMAIL, not the
 * template: every real send lands one atomic row on the `email-activity`
 * object (keyed by the provider's message id), and Resend webhook events
 * update THAT row across its lifecycle. Templates stay reusable content
 * blueprints — a send row carries `templateId` so per-template performance
 * is an aggregation over send rows, never invented counters on the template.
 *
 * Backed by Resend's REAL event surface (webhooks, Svix-signed):
 *   email.sent · email.delivered · email.delivery_delayed · email.bounced
 *   email.complained · email.failed · email.opened · email.clicked
 * There is NO reply event in Resend's webhook surface, so this grammar does
 * not carry a replies column — no fake metrics. Open/click events require
 * open/click tracking to be enabled on the sending domain in Resend.
 */

import crypto from "node:crypto";

const EMAIL_SENDS_OBJECT_ID = "email-activity";
const MAX_SEND_ROWS = 1000;

// The exact event types Resend delivers for sent emails (Svix webhooks).
const RESEND_EMAIL_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.opened",
  "email.clicked",
];

// Atomic row grammar — same discipline as the agent-teams/table pattern:
// explicit id (the provider message id — the correlation key Resend events
// carry as data.email_id), capital-N identity, lifecycle status, engagement
// counters, and per-stage timestamps.
const EMAIL_SENDS_COLUMNS = [
  "id",
  "Name",
  "status",
  "to",
  "from",
  "subject",
  "templateId",
  "templateName",
  "workflowRef",
  "nodeId",
  "opens",
  "clicks",
  "sentAt",
  "deliveredAt",
  "delayedAt",
  "bouncedAt",
  "complainedAt",
  "failedAt",
  "firstOpenedAt",
  "lastOpenedAt",
  "firstClickedAt",
  "lastClickedAt",
  "lastEventType",
  "lastEventAt",
  "registryId",
];

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function buildEmailSendsObject({ integrationId = "resend-email" } = {}) {
  return {
    id: EMAIL_SENDS_OBJECT_ID,
    label: "Email Activity",
    name: "Email Activity",
    source: "Email Activity",
    objectType: "data-source",
    icon: "Database",
    columns: EMAIL_SENDS_COLUMNS.slice(),
    rows: [],
    binding: { mode: "manual", source: "Email Activity" },
    templateProduct: clean(integrationId),
    relations: [
      {
        id: "template-binding",
        name: "Template",
        field: "templateId",
        targetObjectType: "data-source",
        type: "belongs-to",
        valueField: "id",
        labelField: "Name",
        searchable: true,
        pageSize: 25,
      },
    ],
  };
}

function findEmailSendsObject(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.find((object) => clean(object?.id) === EMAIL_SENDS_OBJECT_ID) || null;
}

function baseSendRow({ providerMessageId, to, from, subject, templateId, templateName, workflowRef, nodeId, registryId, nowIso }) {
  const recipient = Array.isArray(to) ? to.map(clean).filter(Boolean).join(", ") : clean(to);
  const subjectLine = clean(subject);
  return {
    id: clean(providerMessageId),
    Name: `${subjectLine || "(no subject)"} → ${recipient || "(unknown recipient)"}`,
    status: "sent",
    to: recipient,
    from: clean(from),
    subject: subjectLine,
    templateId: clean(templateId),
    templateName: clean(templateName),
    workflowRef: clean(workflowRef),
    nodeId: clean(nodeId),
    opens: 0,
    clicks: 0,
    sentAt: clean(nowIso),
    deliveredAt: "",
    delayedAt: "",
    bouncedAt: "",
    complainedAt: "",
    failedAt: "",
    firstOpenedAt: "",
    lastOpenedAt: "",
    firstClickedAt: "",
    lastClickedAt: "",
    lastEventType: "email.sent",
    lastEventAt: clean(nowIso),
    registryId: clean(registryId) || "resend-email",
  };
}

function withObjectRows(workspaceConfig, mutateRows, { integrationId = "resend-email" } = {}) {
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let found = false;
  const nextObjects = objects.map((object) => {
    if (clean(object?.id) !== EMAIL_SENDS_OBJECT_ID || found) return object;
    found = true;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    return { ...object, columns: EMAIL_SENDS_COLUMNS.slice(), rows: mutateRows(rows) };
  });
  if (!found) {
    nextObjects.push({ ...buildEmailSendsObject({ integrationId }), rows: mutateRows([]) });
  }
  return { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } };
}

/**
 * Record one REAL send as an atomic activity row (idempotent by provider
 * message id — a duplicate record call refreshes nothing and returns the
 * existing row). Returns { config, row, created }.
 */
function recordEmailSend(workspaceConfig, input = {}) {
  const row = baseSendRow(input);
  if (!row.id) return { config: workspaceConfig, row: null, created: false };
  let existing = null;
  const config = withObjectRows(workspaceConfig, (rows) => {
    existing = rows.find((candidate) => clean(candidate?.id) === row.id) || null;
    if (existing) return rows;
    return [row, ...rows].slice(0, MAX_SEND_ROWS);
  }, { integrationId: row.registryId });
  return { config, row: existing || row, created: !existing };
}

// Terminal-ish states never regress to "delivered"/"delayed".
const STATUS_RANK = { sent: 0, delayed: 1, delivered: 2, bounced: 3, complained: 3, failed: 3 };

function advanceStatus(current, next) {
  const from = clean(current) || "sent";
  if ((STATUS_RANK[next] ?? -1) >= (STATUS_RANK[from] ?? 0)) return next;
  return from;
}

/**
 * Apply one Resend webhook event to the activity table (pure). Unknown email
 * ids CREATE a row from the event's own data — sends made outside the door
 * (runtime nodes, other tooling on the same key) still close the loop.
 * Returns { config, row, applied, created, reason }.
 */
function applyResendEvent(workspaceConfig, event = {}, { nowIso = "" } = {}) {
  const type = clean(event.type);
  if (!RESEND_EMAIL_EVENT_TYPES.includes(type)) {
    return { config: workspaceConfig, row: null, applied: false, created: false, reason: `unsupported event type "${type || "(none)"}"` };
  }
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const emailId = clean(data.email_id || data.emailId || data.id);
  if (!emailId) {
    return { config: workspaceConfig, row: null, applied: false, created: false, reason: "event carries no email id" };
  }
  const at = clean(event.created_at || event.createdAt) || clean(nowIso);
  let resultRow = null;
  let created = false;
  const config = withObjectRows(workspaceConfig, (rows) => {
    const index = rows.findIndex((candidate) => clean(candidate?.id) === emailId);
    let row = index >= 0
      ? { ...rows[index] }
      : baseSendRow({
          providerMessageId: emailId,
          to: data.to,
          from: data.from,
          subject: data.subject,
          nowIso: at,
        });
    created = index < 0;
    if (type === "email.sent") {
      row.sentAt = row.sentAt || at;
    } else if (type === "email.delivered") {
      row.status = advanceStatus(row.status, "delivered");
      row.deliveredAt = row.deliveredAt || at;
    } else if (type === "email.delivery_delayed") {
      row.status = advanceStatus(row.status, "delayed");
      row.delayedAt = at;
    } else if (type === "email.bounced") {
      row.status = advanceStatus(row.status, "bounced");
      row.bouncedAt = at;
    } else if (type === "email.complained") {
      row.status = advanceStatus(row.status, "complained");
      row.complainedAt = at;
    } else if (type === "email.failed") {
      row.status = advanceStatus(row.status, "failed");
      row.failedAt = at;
    } else if (type === "email.opened") {
      row.opens = (Number(row.opens) || 0) + 1;
      row.firstOpenedAt = row.firstOpenedAt || at;
      row.lastOpenedAt = at;
    } else if (type === "email.clicked") {
      row.clicks = (Number(row.clicks) || 0) + 1;
      row.firstClickedAt = row.firstClickedAt || at;
      row.lastClickedAt = at;
    }
    row.lastEventType = type;
    row.lastEventAt = at;
    resultRow = row;
    if (index >= 0) {
      const next = rows.slice();
      next[index] = row;
      return next;
    }
    return [row, ...rows].slice(0, MAX_SEND_ROWS);
  });
  return { config, row: resultRow, applied: true, created, reason: "" };
}

/** Non-secret activity list (bounded, newest-first as stored). */
function listEmailSends(workspaceConfig, { limit = 50 } = {}) {
  const object = findEmailSendsObject(workspaceConfig);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows.slice(0, Math.max(1, Number(limit) || 50)).map((row) => ({ ...row }));
}

/**
 * Verify a Resend (Svix) webhook signature over the RAW request body.
 * Secret is the `whsec_…` value from the Resend webhook endpoint settings —
 * runtime env only (RESEND_WEBHOOK_SECRET), never stored in rows or config.
 * Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`; the header
 * carries space-separated `v1,<base64>` candidates. Constant-time compare,
 * bounded timestamp tolerance.
 */
function verifyResendWebhookSignature({ secret, id, timestamp, payload, signatureHeader, toleranceSeconds = 300, nowSeconds }) {
  const key = clean(secret).replace(/^whsec_/, "");
  if (!key) return { ok: false, reason: "missing-secret" };
  if (!clean(id) || !clean(timestamp) || !clean(signatureHeader) || typeof payload !== "string" || !payload.length) {
    return { ok: false, reason: "missing-signature-material" };
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad-timestamp" };
  const now = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) return { ok: false, reason: "stale-timestamp" };
  let expected;
  try {
    expected = crypto
      .createHmac("sha256", Buffer.from(key, "base64"))
      .update(`${clean(id)}.${clean(timestamp)}.${payload}`)
      .digest("base64");
  } catch {
    return { ok: false, reason: "bad-secret" };
  }
  const expectedBuffer = Buffer.from(expected, "utf8");
  const match = String(signatureHeader)
    .split(/\s+/)
    .map((part) => clean(part.split(",").pop()))
    .filter(Boolean)
    .some((candidate) => {
      const candidateBuffer = Buffer.from(candidate, "utf8");
      return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
    });
  return match ? { ok: true, reason: "" } : { ok: false, reason: "signature-mismatch" };
}

export {
  EMAIL_SENDS_OBJECT_ID,
  EMAIL_SENDS_COLUMNS,
  RESEND_EMAIL_EVENT_TYPES,
  applyResendEvent,
  buildEmailSendsObject,
  findEmailSendsObject,
  listEmailSends,
  recordEmailSend,
  verifyResendWebhookSignature,
};
