/**
 * Unified API Resolver Registry V1 — the keystone read/trace layer for the
 * CMS SDK v1.5.1 enhancement. Pure derivation only.
 *
 * AWaC reality this unifies: today the workspace has TWO disjoint resolver
 * lanes (static files under lib/adapters/integrations/resolvers/, loaded by
 * resolver-loader; and config-driven Nango resolvers built in-memory from
 * `api-registry` rows by nango-config-loader) plus a one-shot helper generator
 * (workspace-resolver-proposal). Nothing correlated a resolver back to the
 * governed `api-registry` record it serves. This module is that correlation:
 * for every api-registry row across `dataModel.objects[]`, it resolves the
 * resolver's connector kind, provenance, file, registered/tested state, the
 * response shape, the activation score + next action, and the governed endpoint
 * the record is exposed at.
 *
 * Invariants (mirrors every other deriver in the workspace):
 *   - PURE: no fetch, no process.env, no fs, no React, never throws on partial
 *     input. The route injects `files`, `registeredIds`, `fileMeta`, `runtime`,
 *     and `sourceRecords`.
 *   - SECRET-SAFE: ids, slugs, counts, booleans, and paths only.
 *   - ADDITIVE: reads the existing governed record shape; the api-registry row
 *     stays the single source of truth. Generated artifacts are projections.
 *
 * Contract: `@growthub/api-contract/resolver-registry`.
 */

import { deriveApiRegistryCreationState } from "./api-registry-creation-flow.js";
import { profileApiResponse, recommendResolver } from "./api-response-profile.js";

const RESOLVER_REGISTRY_INDEX_KIND = "growthub-resolver-registry-index-v1";
const RESOLVER_REGISTRY_DIR = "lib/adapters/integrations/resolvers";
const RESOLVER_REGISTRY_INDEX_FILE = `${RESOLVER_REGISTRY_DIR}/_registry.generated.json`;
const RESOLVER_ENDPOINT_MANIFEST_FILE = `${RESOLVER_REGISTRY_DIR}/_endpoints.generated.json`;
const RESOLVER_ENDPOINT_MANIFEST_KIND = "growthub-resolver-endpoint-manifest-v1";
const RESOLVER_ENDPOINT_BASE = "/api/resolvers";
const RESOLVER_GENERATED_BANNER =
  "@growthub-resolver generated — do not edit; edit the governed api-registry record";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/** Normalize a governance list field (array or comma-string) to string[]. */
function parseList(value) {
  if (Array.isArray(value)) return value.map((v) => clean(v)).filter(Boolean);
  return clean(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Mirrors workspace-resolver-proposal slugify so file <-> row correlation is exact. */
function slugifyIntegrationId(value, fallback = "resolver") {
  const slug = clean(value)
    .toLowerCase()
    .replace(/\.js$/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return slug || fallback;
}

/**
 * Encode a record ref into a slug/whitespace-safe machine tag (base64url of the
 * JSON). Human row names (spaces, colons, slashes, emoji, quotes, newlines)
 * cannot corrupt the generated header this way.
 */
function encodeRecordTag(recordRef) {
  if (!recordRef || typeof recordRef !== "object") return "";
  const payload = {
    objectId: clean(recordRef.objectId),
    rowName: clean(recordRef.rowName),
    integrationId: clean(recordRef.integrationId),
  };
  if (!payload.objectId && !payload.rowName && !payload.integrationId) return "";
  try {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  } catch {
    return "";
  }
}

/** Decode a base64url record tag back into { objectId, rowName, integrationId } or null. */
function decodeRecordTag(tag) {
  const t = clean(tag);
  if (!t) return null;
  try {
    const parsed = JSON.parse(Buffer.from(t, "base64url").toString("utf8"));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Parse the machine-readable provenance header a generated resolver file
 * carries. Server reads the file head; we extract the banner, the slug-safe
 * `integrationId=` token, and decode the base64url `record=` tag back into a
 * full recordRef (so row names with spaces/special chars survive intact). Pure.
 */
function parseResolverFileHeader(text) {
  const head = clean(text).slice(0, 600);
  const generated = head.includes(RESOLVER_GENERATED_BANNER);
  const idMatch = head.match(/@growthub-resolver[^\n]*\bintegrationId=([a-z0-9-]+)/i);
  const recordMatch = head.match(/\brecord=([A-Za-z0-9_-]+)/);
  const recordRef = recordMatch ? decodeRecordTag(recordMatch[1]) : null;
  return {
    generated,
    integrationId: idMatch ? idMatch[1] : "",
    record: recordMatch ? recordMatch[1] : "",
    recordRef,
  };
}

function findApiRegistryObjects(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  return objects.filter((o) => isPlainObject(o) && o.objectType === "api-registry");
}

// Kinds that need their own resolver implementation — they cannot be
// auto-constructed from an HTTP response shape (aligned with the template
// registry taxonomy: http | custom | tool | mcp | chrome | nango).
const RESERVED_KINDS = new Set(["mcp", "chrome", "tool"]);

/**
 * The connector kind for a row, honoring the normalized governance taxonomy.
 * `connectorKind` is operator-editable text, so any declared value is respected
 * verbatim (lowercased); only when it is absent do we infer — a materialized /
 * registered resolver is HTTP-shaped, otherwise there is none yet.
 */
function deriveConnectorKind(row, { registered, hasFile }) {
  const declared = clean(row?.connectorKind).toLowerCase();
  if (declared) return declared;
  if (hasFile || registered) return "http";
  return "none";
}

/**
 * Resolve provenance — how this row's resolver came to exist. The single fact
 * that did not exist before 1.5.1.
 */
function deriveProvenance(row, { connectorKind, registered, hasFile, fileGenerated, recommendation }) {
  if (connectorKind === "nango") {
    return registered ? "config-driven" : "missing";
  }
  if (hasFile) {
    return fileGenerated ? "helper-generated" : "static-file";
  }
  if (registered) {
    // Registered with no static file and not nango — a config-driven resolver
    // registered at runtime (future connector kinds reuse this lane).
    return "config-driven";
  }
  // Reserved kinds (mcp/chrome/tool) cannot raw-passthrough as HTTP — with no
  // resolver wired they genuinely NEED one, regardless of test state.
  if (RESERVED_KINDS.has(connectorKind)) return "missing";
  // No resolver present. Passthrough is honest only when shaping isn't required.
  if (recommendation && recommendation.level === "required") return "missing";
  return "passthrough";
}

/**
 * Derive one ResolverRegistryEntry for a single api-registry row.
 *
 * @param {object} input
 * @param {object} input.workspaceConfig
 * @param {object} input.object         the api-registry Data Model object
 * @param {object} input.row            the api-registry row
 * @param {Set<string>} input.registeredSet
 * @param {Set<string>} input.fileSlugs        slugs (no .js) of present resolver files
 * @param {object} input.fileMeta              { [slug]: { generated, integrationId, record } }
 * @param {object} input.sourceRecords
 * @param {object} input.runtime
 */
function deriveEntry(input) {
  const { workspaceConfig, object, row, registeredSet, fileSlugs, fileMeta, sourceRecords, runtime } = input;
  const integrationId = clean(row?.integrationId);
  // Canonical resolver identity. The governed record keeps its human
  // integrationId; the resolver file, registry key, and endpoint path all use
  // the slug. A resolver may register under either form (generated resolvers
  // register under the slug; Nango registers under the raw integrationId), so
  // membership is checked against both — no half-slugged blind spot.
  const slug = slugifyIntegrationId(integrationId, "");
  const resolverId = slug;
  const registered = Boolean(slug) && (registeredSet.has(integrationId) || registeredSet.has(slug));
  const hasFile = Boolean(slug) && fileSlugs.has(slug);
  const meta = (slug && fileMeta && fileMeta[slug]) || null;
  const fileGenerated = Boolean(meta?.generated);

  const creation = deriveApiRegistryCreationState({
    workspaceConfig,
    registryRow: row,
    sourceRecords,
    runtime,
  });

  const profile = creation.tested ? profileApiResponse(row?.lastResponse) : null;
  const recommendation = profile ? recommendResolver(profile) : null;

  const connectorKind = deriveConnectorKind(row, { registered, hasFile });
  const provenance = deriveProvenance(row, {
    connectorKind,
    registered,
    hasFile,
    fileGenerated,
    recommendation,
  });

  return {
    recordRef: {
      objectId: clean(object?.id),
      rowName: clean(row?.Name) || integrationId,
      integrationId,
    },
    integrationId,
    resolverId,
    connectorKind,
    templateId: clean(row?.resolverTemplateId),
    capabilities: parseList(row?.capabilities),
    executionLane: clean(row?.executionLane),
    provenance,
    filePath: hasFile ? `${RESOLVER_REGISTRY_DIR}/${slug}.js` : null,
    registered,
    tested: Boolean(creation.tested),
    shape: profile
      ? {
          arrayPath: clean(profile.arrayPath),
          idField: clean(profile.candidates?.id),
          entityType: clean(profile.suggestedEntityType) || "records",
          hasPagination: Boolean(profile.hasPagination),
        }
      : null,
    score: Number.isFinite(creation.score) ? creation.score : 0,
    nextAction: creation.nextAction
      ? {
          stepId: clean(creation.nextAction.stepId),
          id: clean(creation.nextAction.id),
          label: clean(creation.nextAction.label),
        }
      : null,
    endpoint: registered ? `${RESOLVER_ENDPOINT_BASE}/${resolverId}` : null,
  };
}

/**
 * Derive the full unified registry index. The route reads files + the in-memory
 * registry and injects them; this stays pure and unit-testable.
 *
 * @param {object} input
 * @param {object} input.workspaceConfig
 * @param {string[]} [input.files]          resolver filenames (e.g. ["asana.js"])
 * @param {string[]} [input.registeredIds]  in-memory registry keys
 * @param {object} [input.fileMeta]         { [slug]: { generated, integrationId, record } }
 * @param {object} [input.sourceRecords]
 * @param {object} [input.runtime]          { configuredEnvRefs: string[] }
 * @param {string} [input.generatedAt]      ISO string (injected for determinism in tests)
 * @returns {object} ResolverRegistryIndex
 */
function deriveResolverRegistry(input = {}) {
  const workspaceConfig = isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {};
  const files = Array.isArray(input.files) ? input.files : [];
  const registeredIds = Array.isArray(input.registeredIds) ? input.registeredIds : [];
  const fileMeta = isPlainObject(input.fileMeta) ? input.fileMeta : {};
  const sourceRecords = isPlainObject(input.sourceRecords) ? input.sourceRecords : {};
  const runtime = isPlainObject(input.runtime) ? input.runtime : {};
  const generatedAt = clean(input.generatedAt) || new Date().toISOString();

  const registeredSet = new Set(registeredIds.map(clean).filter(Boolean));
  const fileSlugs = new Set(
    files
      .map((f) => clean(f))
      .filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."))
      .map((f) => f.replace(/\.js$/, "")),
  );

  const entries = [];
  const seen = new Set();
  for (const object of findApiRegistryObjects(workspaceConfig)) {
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (!isPlainObject(row)) continue;
      const integrationId = clean(row.integrationId);
      if (!integrationId) continue;
      const key = `${clean(object.id)}::${integrationId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(
        deriveEntry({ workspaceConfig, object, row, registeredSet, fileSlugs, fileMeta, sourceRecords, runtime }),
      );
    }
  }

  // Stable ordering: needs-attention first (lowest score), then by resolverId.
  entries.sort((a, b) => (a.score - b.score) || a.resolverId.localeCompare(b.resolverId));

  // Identity collisions — two distinct governed integrationIds (or the same one
  // in two objects) normalize to the same resolverId, so they would fight over
  // one file / registry key / endpoint. This is a hard governance error: the
  // drift guard fails on it and the UI must surface it (never silently pick one).
  const byResolverId = new Map();
  for (const e of entries) {
    if (!e.resolverId) continue;
    const set = byResolverId.get(e.resolverId) || new Set();
    set.add(`${e.recordRef.objectId}:${e.recordRef.rowName}:${e.integrationId}`);
    byResolverId.set(e.resolverId, set);
  }
  const collisions = [];
  for (const [resolverId, set] of byResolverId) {
    if (set.size > 1) collisions.push({ resolverId, records: [...set] });
  }
  const collidedIds = new Set(collisions.map((c) => c.resolverId));

  // Trust + agent layer — one truth label, evidence, and a terse agent hint per
  // entry, derived purely from facts already computed. A background agent picks
  // its next move from `trust` + `agentHints` alone; a human reads the same state.
  for (const e of entries) {
    annotateEntryTrust(e, collidedIds.has(e.resolverId));
  }

  const summary = {
    total: entries.length,
    registered: entries.filter((e) => e.registered).length,
    tested: entries.filter((e) => e.tested).length,
    needsResolver: entries.filter((e) => e.provenance === "missing").length,
    exposed: entries.filter((e) => e.endpoint).length,
    collisions: collisions.length,
  };

  return {
    kind: RESOLVER_REGISTRY_INDEX_KIND,
    version: 1,
    generatedAt,
    entries,
    summary,
    collisions,
  };
}

/**
 * Derive a single trust label + a terse, secret-safe agent hint + an evidence
 * trail for one entry. Mutates the entry in place (called after collisions are
 * known). Pure function of facts already on the entry.
 *
 * trust ∈ collision-blocked | reserved-future | missing-config | needs-resolver
 *        | endpoint-live | registered | tested | untested
 */
function annotateEntryTrust(entry, isCollision) {
  let trust;
  let blockedReason = null;
  if (isCollision) {
    trust = "collision-blocked";
    blockedReason = "Another record normalizes to the same resolverId — rename so ids resolve to distinct slugs.";
  } else if (entry.registered && entry.endpoint && entry.tested) {
    // An already-wired resolver of ANY kind (a registered mcp/chrome static file
    // included) is live — reserved-future is about AUTO-CONSTRUCTION, not trust.
    trust = "endpoint-live";
  } else if (RESERVED_KINDS.has(entry.connectorKind) && entry.provenance === "missing") {
    trust = "reserved-future";
    blockedReason = `Auto-construction for "${entry.connectorKind}" is reserved — wire it with its own resolver (or a custom-http resolver) today.`;
  } else if (entry.connectorKind === "nango" && entry.provenance === "missing") {
    trust = "missing-config";
    blockedReason = "Config-driven row is missing required Nango fields (connectionIds / endpoint).";
  } else if (entry.provenance === "missing") {
    trust = "needs-resolver";
    blockedReason = "The tested response needs a shaping resolver before it produces governed rows.";
  } else if (entry.registered && entry.endpoint) {
    trust = "registered";
  } else if (entry.tested) {
    trust = "tested";
  } else {
    trust = "untested";
  }

  // Secret-safe evidence: "why this is (not yet) trusted". Booleans/ids/paths only.
  entry.evidence = {
    tested: entry.tested,
    hasShape: Boolean(entry.shape),
    recordPath: entry.shape ? entry.shape.arrayPath : "",
    idField: entry.shape ? entry.shape.idField : "",
    registered: entry.registered,
    endpointLive: trust === "endpoint-live",
    provenance: entry.provenance,
  };

  // Compact model-context hint: stable, terse, safe. Answers "can I call this,
  // where, for what, and if not — why / what next".
  entry.trust = trust;
  entry.agentHints = {
    callable: trust === "endpoint-live",
    ready: trust === "endpoint-live" || trust === "tested",
    endpoint: entry.endpoint,
    entityType: entry.shape ? entry.shape.entityType : null,
    blockedReason,
    nextAction: entry.nextAction ? entry.nextAction.label : (blockedReason ? "resolve blocker" : null),
  };
  return entry;
}

/** Deterministic, key-sorted stringify with the volatile `generatedAt` stripped. */
function stableStringify(value) {
  return JSON.stringify(value, (key, v) => {
    if (key === "generatedAt") return undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    }
    return v;
  });
}

/**
 * Pure artifact drift comparison — the enforcement the drift guard claims.
 * Returns `{ errors: string[] }`. Compares the persisted index/manifest against
 * a fresh re-derivation EXACTLY (minus `generatedAt`), and fails on collisions.
 *
 * @param {object} input
 * @param {object} input.fresh         a freshly derived ResolverRegistryIndex
 * @param {object|null} [input.savedIndex]    persisted _registry.generated.json
 * @param {object|null} [input.savedManifest] persisted _endpoints.generated.json
 */
function diffResolverArtifacts({ fresh, savedIndex = null, savedManifest = null }) {
  const errors = [];
  if (!fresh || fresh.kind !== RESOLVER_REGISTRY_INDEX_KIND) {
    return { errors: ["fresh registry is not a valid index"] };
  }

  // Collisions are a hard error regardless of artifacts.
  for (const c of Array.isArray(fresh.collisions) ? fresh.collisions : []) {
    errors.push(`identity collision: resolverId "${c.resolverId}" is claimed by ${c.records.length} records (${c.records.join(" | ")}) — they would share one file/key/endpoint.`);
  }

  if (savedIndex) {
    if (savedIndex.kind !== RESOLVER_REGISTRY_INDEX_KIND) {
      errors.push("_registry.generated.json is malformed — regenerate via GET /api/workspace/resolvers.");
    } else if (stableStringify(savedIndex) !== stableStringify(fresh)) {
      const savedById = new Map((savedIndex.entries || []).map((e) => [e.resolverId || e.integrationId, e]));
      const freshById = new Map((fresh.entries || []).map((e) => [e.resolverId || e.integrationId, e]));
      const diffs = [];
      for (const [id, fe] of freshById) {
        const se = savedById.get(id);
        if (!se) { diffs.push(`${id} (missing in artifact)`); continue; }
        if (stableStringify(se) !== stableStringify(fe)) {
          const fields = ["filePath", "endpoint", "score", "tested", "provenance", "registered", "connectorKind", "resolverId"]
            .filter((k) => JSON.stringify(se[k]) !== JSON.stringify(fe[k]));
          diffs.push(`${id} (${fields.join(",") || "shape/recordRef/nextAction"})`);
        }
      }
      for (const [id] of savedById) if (!freshById.has(id)) diffs.push(`${id} (stale in artifact)`);
      if (stableStringify(savedIndex.summary) !== stableStringify(fresh.summary)) diffs.push("summary");
      errors.push(`_registry.generated.json drifted from the governed records [${diffs.join("; ")}] — do not hand-edit; regenerate via GET /api/workspace/resolvers.`);
    }
  }

  if (savedManifest) {
    if (savedManifest.kind !== RESOLVER_ENDPOINT_MANIFEST_KIND) {
      errors.push("_endpoints.generated.json is malformed — regenerate via GET /api/workspace/resolvers.");
    } else {
      const freshManifest = buildEndpointManifest(fresh, "drift-check");
      const keyOf = (e) => stableStringify({
        integrationId: e.integrationId, path: e.path, connectorKind: e.connectorKind, recordRef: e.recordRef,
      });
      const savedKeys = new Set((savedManifest.endpoints || []).map(keyOf));
      const freshKeys = new Set((freshManifest.endpoints || []).map(keyOf));
      const stale = [...savedKeys].filter((k) => !freshKeys.has(k));
      const missing = [...freshKeys].filter((k) => !savedKeys.has(k));
      if (stale.length) errors.push(`_endpoints.generated.json has ${stale.length} stale endpoint(s) — regenerate via GET /api/workspace/resolvers.`);
      if (missing.length) errors.push(`_endpoints.generated.json is missing ${missing.length} exposed endpoint(s) — regenerate via GET /api/workspace/resolvers.`);
    }
  }

  return { errors };
}

/** Build the endpoint manifest (Phase 3) from a derived index. Pure. */
function buildEndpointManifest(index, generatedAt) {
  const entries = Array.isArray(index?.entries) ? index.entries : [];
  return {
    kind: RESOLVER_ENDPOINT_MANIFEST_KIND,
    version: 1,
    generatedAt: clean(generatedAt) || clean(index?.generatedAt) || new Date().toISOString(),
    basePath: RESOLVER_ENDPOINT_BASE,
    endpoints: entries
      .filter((e) => e.endpoint)
      .map((e) => ({
        integrationId: e.integrationId,
        path: e.endpoint,
        connectorKind: e.connectorKind,
        recordRef: e.recordRef,
      })),
  };
}

export {
  RESOLVER_REGISTRY_INDEX_KIND,
  RESOLVER_ENDPOINT_MANIFEST_KIND,
  RESOLVER_REGISTRY_DIR,
  RESOLVER_REGISTRY_INDEX_FILE,
  RESOLVER_ENDPOINT_MANIFEST_FILE,
  RESOLVER_ENDPOINT_BASE,
  RESOLVER_GENERATED_BANNER,
  slugifyIntegrationId,
  parseResolverFileHeader,
  encodeRecordTag,
  decodeRecordTag,
  deriveResolverRegistry,
  buildEndpointManifest,
  diffResolverArtifacts,
  stableStringify,
};
