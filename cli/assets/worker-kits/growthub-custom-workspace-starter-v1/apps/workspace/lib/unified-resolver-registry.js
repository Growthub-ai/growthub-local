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
 * Parse the machine-readable provenance header a generated resolver file
 * carries. Server reads the file head; we accept the text and extract the
 * banner + the `integrationId=` / `record=` tags. Pure string work.
 */
function parseResolverFileHeader(text) {
  const head = clean(text).slice(0, 600);
  const generated = head.includes(RESOLVER_GENERATED_BANNER);
  const idMatch = head.match(/@growthub-resolver[^\n]*\bintegrationId=([a-z0-9-]+)/i);
  const recordMatch = head.match(/\brecord=([^\s]+)/i);
  return {
    generated,
    integrationId: idMatch ? idMatch[1] : "",
    record: recordMatch ? recordMatch[1] : "",
  };
}

function findApiRegistryObjects(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  return objects.filter((o) => isPlainObject(o) && o.objectType === "api-registry");
}

/** Derive the connector kind for a row from its declared kind, the registry, and any file. */
function deriveConnectorKind(row, { registered, hasFile }) {
  const declared = clean(row?.connectorKind).toLowerCase();
  if (["custom-http", "nango", "mcp", "webhook", "chrome"].includes(declared)) {
    return declared;
  }
  if (declared === "nango") return "nango";
  if (hasFile || registered) return "custom-http";
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
  const slug = slugifyIntegrationId(integrationId, "");
  const registered = Boolean(slug) && registeredSet.has(integrationId);
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
    connectorKind,
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
    endpoint: registered ? `${RESOLVER_ENDPOINT_BASE}/${integrationId}` : null,
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

  // Stable ordering: needs-attention first (lowest score), then by integrationId.
  entries.sort((a, b) => (a.score - b.score) || a.integrationId.localeCompare(b.integrationId));

  const summary = {
    total: entries.length,
    registered: entries.filter((e) => e.registered).length,
    tested: entries.filter((e) => e.tested).length,
    needsResolver: entries.filter((e) => e.provenance === "missing").length,
    exposed: entries.filter((e) => e.endpoint).length,
  };

  return {
    kind: RESOLVER_REGISTRY_INDEX_KIND,
    version: 1,
    generatedAt,
    entries,
    summary,
  };
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
  deriveResolverRegistry,
  buildEndpointManifest,
};
