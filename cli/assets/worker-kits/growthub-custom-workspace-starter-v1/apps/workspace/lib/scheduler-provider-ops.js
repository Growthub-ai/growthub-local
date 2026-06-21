/**
 * Scheduler Provider Ops — the SERVER-ONLY provider I/O shared by the provision
 * and lifecycle routes, so secret resolution and provider calls live in exactly
 * one place (no duplicated candidate logic, no duplicated fetch). Reads env at
 * call time; never logs or returns a secret value.
 */

import { authCandidates } from "./scheduler-providers.js";

const QSTASH_BASE = "https://qstash.upstash.io/v2/schedules";

/** Resolve a secret from server env via the SHARED candidate expansion. */
function readServerSecret(authRef) {
  for (const key of authCandidates(authRef)) {
    if (process.env[key]) return { key, value: process.env[key] };
  }
  return null;
}

/** Delete a QStash schedule by id. Returns { ok, status, error? }. Never throws. */
async function qstashDeleteSchedule(token, scheduleId) {
  if (!token || !scheduleId) return { ok: false, status: 0, error: "missing token or scheduleId" };
  try {
    const res = await fetch(`${QSTASH_BASE}/${encodeURIComponent(scheduleId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err?.name === "TimeoutError" ? "qstash delete timed out" : (err?.message || "qstash delete failed") };
  }
}

/** Create a QStash schedule. Returns { ok, status, scheduleId, detail }. Never throws. */
async function qstashCreateSchedule(token, { destinationUrl, cron, runId, objectId, name }) {
  try {
    const res = await fetch(`${QSTASH_BASE}/${encodeURIComponent(destinationUrl)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "Upstash-Cron": cron, "content-type": "application/json" },
      body: JSON.stringify({ kind: "growthub-sandbox-run-v1", runId, objectId, name }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text().catch(() => "");
    let scheduleId = null;
    try { scheduleId = JSON.parse(text)?.scheduleId || null; } catch { /* non-json */ }
    return { ok: res.ok, status: res.status, scheduleId, detail: text.slice(0, 200) };
  } catch (err) {
    return { ok: false, status: 0, scheduleId: null, detail: err?.name === "TimeoutError" ? "qstash create timed out" : (err?.message || "qstash create failed") };
  }
}

export { QSTASH_BASE, readServerSecret, qstashDeleteSchedule, qstashCreateSchedule };
