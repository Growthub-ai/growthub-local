/**
 * Agent Outcome Receipt V1 writer — the unified receipt every mutation lane
 * emits (contract: `@growthub/api-contract/workspace-outcome`).
 *
 * One canonical stream answers, for any agent action:
 *   intent → what changed → was it preflighted → was it proven →
 *   was it published → what runId/sourceId/hash/version proves it →
 *   how does the next agent replay / rollback / continue.
 *
 * Storage is the EXISTING source-record sidecar (`growthub.source-records.json`)
 * under the stable source id `workspace:agent-outcomes` — no new persistence
 * backend. The stream is a rolling window (last 200 receipts). Existing
 * helper-apply receipts and sandbox run records are untouched; outcome
 * receipts LINK to them via `sourceId` / `runId` / `rollbackRef`.
 *
 * Safety rules enforced here, not trusted from callers:
 *   - every string field is secret-redacted (`redactSecrets`) and truncated;
 *   - receipt append failures are NEVER fatal to the mutation route
 *     (read-only runtimes simply do not accumulate a stream);
 *   - receipts carry summaries and references — never raw payloads.
 */

import { createHash } from "node:crypto";
import {
  readWorkspaceSourceRecords,
  writeWorkspaceSourceRecords,
  describePersistenceMode
} from "@/lib/workspace-config";
import { redactSecrets } from "@/lib/sandbox-agent-auth-redaction";
import { stableStringify } from "@/lib/workspace-patch-policy";

const AGENT_OUTCOMES_SOURCE_ID = "workspace:agent-outcomes";
const MAX_RECEIPTS = 200;
const MAX_SUMMARY_CHARS = 400;
const MAX_INTENT_CHARS = 280;
const MAX_LIST_ENTRIES = 24;

function newReceiptId() {
  return `aor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeText(value, maxChars) {
  const text = redactSecrets(String(value ?? "")).trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function safeList(values, maxChars = 160) {
  return (Array.isArray(values) ? values : [])
    .slice(0, MAX_LIST_ENTRIES)
    .map((v) => safeText(v, maxChars))
    .filter(Boolean);
}

/**
 * Build a canonical receipt from partial fields. Unknown/raw payloads are
 * not accepted — only the contract's named fields survive.
 */
function buildOutcomeReceipt(fields) {
  const f = fields && typeof fields === "object" ? fields : {};
  const receipt = {
    receiptId: newReceiptId(),
    kind: safeText(f.kind || "agent-outcome", 40),
    lane: safeText(f.lane || "untrusted-direct", 40),
    outcomeStatus: safeText(f.outcomeStatus || "failed", 24),
    summary: safeText(f.summary || "", MAX_SUMMARY_CHARS) || "(no summary)",
    createdAt: new Date().toISOString()
  };
  if (f.intent) receipt.intent = safeText(f.intent, MAX_INTENT_CHARS);
  if (f.actor) receipt.actor = safeText(f.actor, 80);
  if (Array.isArray(f.objectRefs)) {
    receipt.objectRefs = f.objectRefs.slice(0, MAX_LIST_ENTRIES).map((ref) => {
      const out = { objectId: safeText(ref?.objectId, 120) };
      if (ref?.rowName) out.rowName = safeText(ref.rowName, 120);
      if (ref?.objectType) out.objectType = safeText(ref.objectType, 60);
      return out;
    });
  }
  if (Array.isArray(f.changedFields)) receipt.changedFields = safeList(f.changedFields, 60);
  if (f.policyVerdict && typeof f.policyVerdict === "object") {
    receipt.policyVerdict = {
      ok: f.policyVerdict.ok === true,
      ...(Array.isArray(f.policyVerdict.violationCodes)
        ? { violationCodes: safeList(f.policyVerdict.violationCodes, 60) }
        : {})
    };
  }
  if (f.schemaVerdict && typeof f.schemaVerdict === "object") {
    receipt.schemaVerdict = {
      ok: f.schemaVerdict.ok === true,
      ...(Number.isFinite(f.schemaVerdict.errorCount) ? { errorCount: f.schemaVerdict.errorCount } : {})
    };
  }
  for (const key of ["runId", "sourceId", "draftSha256", "publishedSha256", "version", "appId"]) {
    if (f[key]) receipt[key] = safeText(f[key], 160);
  }
  if (Array.isArray(f.nextActions)) receipt.nextActions = safeList(f.nextActions, 240);
  if (f.rollbackRef && typeof f.rollbackRef === "object") {
    const rb = {};
    for (const key of ["objectId", "rowName", "liveField", "previousVersion", "sourceId"]) {
      if (f.rollbackRef[key]) rb[key] = safeText(f.rollbackRef[key], 120);
    }
    if (Number.isFinite(f.rollbackRef.deltaIndex)) rb.deltaIndex = f.rollbackRef.deltaIndex;
    if (Object.keys(rb).length) receipt.rollbackRef = rb;
  }
  return receipt;
}

/**
 * Append a receipt to the stream. NEVER throws — mutation routes must not
 * fail because the receipt sidecar is read-only or momentarily unwritable.
 * Returns the receipt (with `persisted` flag) so routes can echo its id.
 */
async function appendOutcomeReceipt(fields) {
  const receipt = buildOutcomeReceipt(fields);
  try {
    const persistence = describePersistenceMode();
    if (!persistence.canSave) return { receipt, persisted: false };
    const existing = await readWorkspaceSourceRecords(AGENT_OUTCOMES_SOURCE_ID);
    const prior = Array.isArray(existing?.records) ? existing.records : [];
    // Tamper-evidence (Paperclip pattern, scoped to what this runtime can
    // honestly provide): server-side monotonic sequence + hash chain. Each
    // receipt carries sha256(stableStringify(previous receipt)); a mutated
    // or removed receipt breaks every subsequent link. No signing key /
    // TEE exists in this runtime — that stronger anchor is named future work.
    const last = prior.length > 0 ? prior[prior.length - 1] : null;
    receipt.seq = (Number.isFinite(last?.seq) ? last.seq : prior.length - 1) + 1;
    receipt.prevReceiptSha256 = last
      ? createHash("sha256").update(stableStringify(last), "utf8").digest("hex")
      : null;
    await writeWorkspaceSourceRecords(
      AGENT_OUTCOMES_SOURCE_ID,
      [...prior, receipt].slice(-MAX_RECEIPTS),
      { integrationId: AGENT_OUTCOMES_SOURCE_ID, fetchedAt: receipt.createdAt }
    );
    return { receipt, persisted: true };
  } catch {
    return { receipt, persisted: false };
  }
}

/** Read the stream, newest first. Returns [] when absent/unreadable. */
async function readOutcomeReceipts(limit = MAX_RECEIPTS) {
  try {
    const existing = await readWorkspaceSourceRecords(AGENT_OUTCOMES_SOURCE_ID);
    const records = Array.isArray(existing?.records) ? existing.records : [];
    return records.slice(-Math.max(1, limit)).reverse();
  } catch {
    return [];
  }
}

export {
  AGENT_OUTCOMES_SOURCE_ID,
  appendOutcomeReceipt,
  buildOutcomeReceipt,
  readOutcomeReceipts
};
