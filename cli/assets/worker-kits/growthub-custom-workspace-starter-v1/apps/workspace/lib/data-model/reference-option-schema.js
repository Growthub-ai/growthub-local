/**
 * Reference option wire shape for POST /api/workspace/reference-options.
 * Kept as plain validation (no runtime authority).
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @typedef {Object} ReferenceOption
 * @property {string} value
 * @property {string} label
 * @property {string} [secondaryLabel]
 * @property {"workspace-config"|"source-records"|"resolver"} source
 * @property {string} [objectType]
 * @property {string} [provider]
 * @property {string} [status]
 * @property {Record<string, unknown>} [metadata]
 */

function validateReferenceOptionsRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    errors.push("body must be a plain object");
    return { ok: false, errors, value: null };
  }
  const objectId = typeof body.objectId === "string" ? body.objectId.trim() : "";
  const field = typeof body.field === "string" ? body.field.trim() : "";
  if (!objectId) errors.push("objectId must be a non-empty string");
  if (!field) errors.push("field must be a non-empty string");
  const query = typeof body.query === "string" ? body.query : "";
  const cursor = body.cursor === null || body.cursor === undefined || body.cursor === ""
    ? null
    : String(body.cursor);
  let limit = 25;
  if (body.limit !== undefined) {
    const limitRaw = Number(body.limit);
    if (!Number.isFinite(limitRaw) || limitRaw < 1) {
      errors.push("limit must be a positive number");
    } else {
      limit = Math.min(100, Math.max(1, limitRaw));
    }
  }
  const context = isPlainObject(body.context) ? body.context : {};
  if (body.context !== undefined && !isPlainObject(body.context)) {
    errors.push("context must be a plain object when present");
  }
  if (!errors.length) {
    return {
      ok: true,
      errors: [],
      value: { objectId, field, query, cursor, limit, context }
    };
  }
  return { ok: false, errors, value: null };
}

export { validateReferenceOptionsRequest };
