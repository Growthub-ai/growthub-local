/**
 * Client helpers for reference option loading (browser-safe).
 */

const REFERENCE_OPTION_SOURCES = ["workspace-config", "source-records", "resolver"];

async function fetchReferenceOptions({
  objectId,
  field,
  query = "",
  cursor = null,
  limit = 25,
  context = {}
} = {}) {
  const res = await fetch("/api/workspace/reference-options", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectId, field, query, cursor, limit, context })
  });
  const payload = await res.json();
  if (!res.ok) {
    const err = new Error(payload.error || "reference-options failed");
    err.payload = payload;
    throw err;
  }
  return payload;
}

export { REFERENCE_OPTION_SOURCES, fetchReferenceOptions };
