/**
 * Provider resource → env mapping core — PURE with injected I/O.
 *
 * The products/sync route discovers a provider resource (an Upstash database,
 * a Supabase project) and binds its connection material to env refs. THIS
 * module owns the deterministic mapping semantics; the route owns HTTP and
 * the .env.local write. `fetchJson` is injected so every mapping shape is
 * unit-testable offline — the same discipline as the scheduler install cores
 * (gates provable with zero outbound fetches).
 *
 * Mapping shapes (declared on product.resourceDiscovery.envFromResource):
 *   urlTemplate — derive the value from the resource id ({id} substitution)
 *   fromPath    — fetch a per-resource sub-path with the provider auth and
 *                 pick the row matching matchField=matchValue
 *   default     — read fieldCandidates straight off the resource row
 * Alias writes (provider.accountProbe.aliasEnv) run after mapping so the
 * canonical authRef candidate expansion resolves the product key.
 *
 * Secrets: values returned here go straight to the caller's .env.local write
 * and NEVER into rows, receipts, or responses.
 */

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["databases", "indexes", "indices", "schedules", "queues", "resources", "items", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (payload && typeof payload === "object") return [payload];
  return [];
}

function resourceFieldValue(row, mapping) {
  const candidates = Array.isArray(mapping.fieldCandidates) && mapping.fieldCandidates.length
    ? mapping.fieldCandidates
    : [mapping.field].filter(Boolean);
  for (const field of candidates) {
    const value = clean(row?.[field]);
    if (!value) continue;
    if (mapping.ensureHttps && !/^https?:\/\//i.test(value)) return `https://${value}`;
    return value;
  }
  return "";
}

/**
 * Resolve every declared mapping against one selected resource.
 *
 * @param {object}   args
 * @param {Array}    args.mappings   product.resourceDiscovery.envFromResource
 * @param {object}   args.resource   { id, row } — the selected resource
 * @param {Function} args.fetchJson  async (path) => { ok, status, payload } —
 *                                   provider-authed sub-path fetch, injected
 * @param {object}   [args.aliasEnv] provider.accountProbe.aliasEnv
 * @param {Function} [args.readEnv]  (key) => value — existing-env lookup for
 *                                   alias sources not written in this pass
 * @returns {Promise<{updates: object, failures: Array}>}
 */
async function resolveEnvFromResourceMappings({ mappings, resource, fetchJson, aliasEnv = {}, readEnv = () => "" }) {
  const updates = {};
  const failures = [];
  const resourceId = clean(resource?.id);
  for (const mapping of Array.isArray(mappings) ? mappings : []) {
    const envRef = clean(mapping?.envRef);
    if (!envRef) continue;
    if (mapping.urlTemplate) {
      const value = clean(mapping.urlTemplate).replaceAll("{id}", resourceId);
      if (value) updates[envRef] = value;
      continue;
    }
    if (mapping.fromPath) {
      const subPath = clean(mapping.fromPath).replaceAll("{id}", resourceId);
      try {
        const response = await fetchJson(subPath);
        if (!response?.ok) {
          if (!mapping.optional) failures.push({ path: subPath, status: Number(response?.status) || 0 });
          continue;
        }
        const rows = pickArray(response.payload);
        const matchField = clean(mapping.matchField);
        const matchValue = clean(mapping.matchValue);
        const hit = matchField
          ? rows.find((row) => clean(row?.[matchField]) === matchValue)
          : rows[0];
        const value = hit ? resourceFieldValue(hit, mapping) : "";
        if (value) updates[envRef] = value;
        else if (!mapping.optional) failures.push({ path: subPath, status: 200, error: `no ${matchValue || "matching"} entry` });
      } catch (error) {
        if (!mapping.optional) failures.push({ path: subPath, status: 0, error: error?.message || "network error" });
      }
      continue;
    }
    const value = resourceFieldValue(resource?.row, mapping);
    if (value) updates[envRef] = value;
  }
  for (const [alias, source] of Object.entries(aliasEnv && typeof aliasEnv === "object" ? aliasEnv : {})) {
    if (!updates[alias] && (updates[source] || clean(readEnv(source)))) {
      updates[alias] = updates[source] || clean(readEnv(source));
    }
  }
  return { updates, failures };
}

export { pickArray, resolveEnvFromResourceMappings, resourceFieldValue };
