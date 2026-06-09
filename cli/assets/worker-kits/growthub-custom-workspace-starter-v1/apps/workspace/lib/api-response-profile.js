/**
 * API Response Profiler V1 — turns a tested API's `lastResponse` into a
 * business-ready shape analysis, and recommends a resolver mode from it.
 *
 * This is the engine behind the cockpit's "Shape" lane: it is the difference
 * between "API tested" and "API usable". Given the raw (already-fetched,
 * server-side) response text, it finds the record array, infers field roles,
 * proposes an entityType, and classifies what resolver work (if any) is needed
 * to turn the response into governed rows.
 *
 * Pure + deterministic. No fetch, no secrets — it only inspects shape and a few
 * sample values for type/role inference (and redaction is the caller's job for
 * anything rendered). Never throws on malformed input.
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function parseResponse(lastResponse) {
  if (isPlainObject(lastResponse) || Array.isArray(lastResponse)) return lastResponse;
  const text = clean(lastResponse);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const ARRAY_CANDIDATE_KEYS = ["data", "items", "results", "records", "rows", "list", "values", "entries", "edges", "nodes"];
const PAGINATION_KEYS = ["next", "nextPage", "next_page", "cursor", "nextCursor", "next_cursor", "page", "offset", "hasMore", "has_more", "pageInfo", "_links", "paging"];

/** Locate the most likely record array and its dotted path within the payload. */
function findRecordArray(payload) {
  if (Array.isArray(payload)) return { path: "", array: payload };
  if (!isPlainObject(payload)) return { path: "", array: null };
  // Prefer well-known container keys, then any top-level array, then one level deep.
  for (const key of ARRAY_CANDIDATE_KEYS) {
    if (Array.isArray(payload[key])) return { path: key, array: payload[key] };
  }
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) return { path: key, array: value };
  }
  for (const [key, value] of Object.entries(payload)) {
    if (isPlainObject(value)) {
      for (const inner of ARRAY_CANDIDATE_KEYS) {
        if (Array.isArray(value[inner])) return { path: `${key}.${inner}`, array: value[inner] };
      }
      for (const [ik, iv] of Object.entries(value)) {
        if (Array.isArray(iv)) return { path: `${key}.${ik}`, array: iv };
      }
    }
  }
  return { path: "", array: null };
}

function inferType(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) return "datetime";
  if (/^-?\d+(\.\d+)?$/.test(s)) return "number";
  if (/^(true|false)$/i.test(s)) return "boolean";
  return "text";
}

function detectRole(name, type) {
  const n = clean(name).toLowerCase();
  if (n === "id" || n.endsWith("_id") || n.endsWith("id") && n.length <= 6) return "id";
  if (n === "id" || n === "uuid" || n === "gid" || n === "key") return "id";
  if (n.includes("email")) return "email";
  if (n === "name" || n.endsWith("name") || n === "title" || n === "label") return "name";
  if (n.includes("company") || n.includes("organization") || n.includes("org")) return "company";
  if (type === "datetime" || n.includes("date") || n.includes("_at") || n.includes("time") || n.includes("created") || n.includes("updated")) return "timestamp";
  if (n.includes("status") || n.includes("state") || n.includes("stage")) return "status";
  return "";
}

/** Profile a sample record into typed/roled fields. */
function profileRecord(record) {
  if (!isPlainObject(record)) return [];
  return Object.entries(record).map(([name, value]) => {
    const type = inferType(value);
    const sample = type === "object" || type === "array" ? `[${type}]` : clean(value).slice(0, 60);
    return { name, type, role: detectRole(name, type), sample };
  });
}

const PROFILE_KIND = "growthub-api-response-profile-v1";

/**
 * Profile a tested API response.
 * Returns a typed profile; `usable` is true when a record array was found.
 */
function profileApiResponse(lastResponse) {
  const empty = {
    kind: PROFILE_KIND,
    parsed: false,
    usable: false,
    topLevelKeys: [],
    arrayPath: "",
    recordCount: 0,
    fields: [],
    candidates: { id: "", name: "", email: "", company: "", timestamp: "" },
    suggestedEntityType: "records",
    hasPagination: false,
  };
  const payload = parseResponse(lastResponse);
  if (payload === null) return empty;

  const topLevelKeys = isPlainObject(payload) ? Object.keys(payload) : [];
  const hasPagination = isPlainObject(payload)
    && PAGINATION_KEYS.some((k) => Object.prototype.hasOwnProperty.call(payload, k) && payload[k] != null && payload[k] !== false);

  const { path, array } = findRecordArray(payload);
  if (!Array.isArray(array) || array.length === 0) {
    // No record array — a single object response is still profileable as one row.
    if (isPlainObject(payload)) {
      const fields = profileRecord(payload);
      return {
        ...empty,
        parsed: true,
        usable: fields.length > 0,
        topLevelKeys,
        arrayPath: "",
        recordCount: isPlainObject(payload) ? 1 : 0,
        fields,
        candidates: pickCandidates(fields),
        suggestedEntityType: "record",
        hasPagination,
      };
    }
    return { ...empty, parsed: true, topLevelKeys, hasPagination };
  }

  const sample = array.find(isPlainObject) || null;
  const fields = profileRecord(sample);
  const suggestedEntityType = path ? clean(path).split(".").pop() : "records";
  return {
    kind: PROFILE_KIND,
    parsed: true,
    usable: fields.length > 0,
    topLevelKeys,
    arrayPath: path,
    recordCount: array.length,
    fields,
    candidates: pickCandidates(fields),
    suggestedEntityType: suggestedEntityType || "records",
    hasPagination,
  };
}

function pickCandidates(fields) {
  const byRole = (role) => (fields.find((f) => f.role === role)?.name) || "";
  return {
    id: byRole("id"),
    name: byRole("name"),
    email: byRole("email"),
    company: byRole("company"),
    timestamp: byRole("timestamp"),
  };
}

const RESOLVER_RECOMMENDATION_KIND = "growthub-resolver-recommendation-v1";

/**
 * Recommend a resolver mode from a response profile.
 *   none      — top-level array, clean records: raw passthrough works.
 *   template  — records under a known container (data/items/...): simple extraction.
 *   custom    — nested/non-standard path or single-object: a resolver is recommended.
 *   required  — pagination detected or no record array: a resolver is required to
 *               produce complete, governed rows.
 */
function recommendResolver(profile) {
  const p = isPlainObject(profile) ? profile : {};
  if (!p.parsed) {
    return { kind: RESOLVER_RECOMMENDATION_KIND, mode: "required", level: "required", rootPath: "", reason: "Response could not be parsed as JSON — a resolver must normalize it into rows." };
  }
  if (p.hasPagination) {
    return { kind: RESOLVER_RECOMMENDATION_KIND, mode: "custom", level: "required", rootPath: p.arrayPath || "", reason: "Pagination detected — a resolver is required to fetch and concatenate all pages." };
  }
  if (!p.usable || p.recordCount === 0) {
    return { kind: RESOLVER_RECOMMENDATION_KIND, mode: "custom", level: "required", rootPath: "", reason: "No record array found — a resolver is required to extract rows from this response." };
  }
  if (!p.arrayPath) {
    return { kind: RESOLVER_RECOMMENDATION_KIND, mode: "none", level: "optional", rootPath: "", reason: "Top-level array of records — raw passthrough works; a resolver is optional." };
  }
  if (p.arrayPath.includes(".")) {
    return { kind: RESOLVER_RECOMMENDATION_KIND, mode: "custom", level: "recommended", rootPath: p.arrayPath, reason: `Records are nested at "${p.arrayPath}" — a resolver is recommended to normalize them.` };
  }
  return { kind: RESOLVER_RECOMMENDATION_KIND, mode: "template", level: "recommended", rootPath: p.arrayPath, reason: `Records under "${p.arrayPath}" — a template resolver can extract them at that path.` };
}

export {
  PROFILE_KIND,
  RESOLVER_RECOMMENDATION_KIND,
  profileApiResponse,
  recommendResolver,
};
