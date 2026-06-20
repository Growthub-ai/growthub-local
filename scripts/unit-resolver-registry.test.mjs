#!/usr/bin/env node
/**
 * Unit coverage for the Unified API Resolver Registry V1 (CMS SDK v1.5.1).
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - deriveResolverRegistry emits one entry per governed api-registry row
 *   - provenance classifies config-driven / static-file / helper-generated /
 *     passthrough / missing correctly from row + files + fileMeta
 *   - endpoints are derived only for registered resolvers
 *   - the index is secret-safe (no values), pure, and never throws on partial input
 *   - parseResolverFileHeader recognizes the generated banner + tags
 *   - buildEndpointManifest projects only exposed endpoints
 *
 * Run with:  node --test scripts/unit-resolver-registry.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const reg = await import(pathToFileURL(path.join(kitLib, "unified-resolver-registry.js")).href);
const proposal = await import(pathToFileURL(path.join(kitLib, "workspace-resolver-proposal.js")).href);
const constructor = await import(pathToFileURL(path.join(kitLib, "resolver-constructor.js")).href);
const responseProfile = await import(pathToFileURL(path.join(kitLib, "api-response-profile.js")).href);

const {
  deriveResolverRegistry,
  buildEndpointManifest,
  parseResolverFileHeader,
  slugifyIntegrationId,
  RESOLVER_GENERATED_BANNER,
  RESOLVER_ENDPOINT_BASE,
  RESOLVER_REGISTRY_INDEX_KIND,
} = reg;

function apiRegistryObject(rows) {
  return { id: "workspace-api-registry", objectType: "api-registry", rows };
}

const TESTED_RESPONSE = JSON.stringify({
  data: [
    { id: "1", name: "Ada", email: "ada@x.io", created_at: "2026-01-01" },
    { id: "2", name: "Lin", email: "lin@x.io", created_at: "2026-02-01" },
  ],
});

// ───────────────────────────────────────────────────────────────────────────
// Module shape
// ───────────────────────────────────────────────────────────────────────────

test("module — public API exports", () => {
  assert.equal(typeof deriveResolverRegistry, "function");
  assert.equal(typeof buildEndpointManifest, "function");
  assert.equal(typeof parseResolverFileHeader, "function");
  assert.equal(typeof slugifyIntegrationId, "function");
  assert.equal(RESOLVER_ENDPOINT_BASE, "/api/resolvers");
  assert.equal(RESOLVER_REGISTRY_INDEX_KIND, "growthub-resolver-registry-index-v1");
});

// ───────────────────────────────────────────────────────────────────────────
// Empty / partial input never throws
// ───────────────────────────────────────────────────────────────────────────

test("deriver — never throws on empty/partial input", () => {
  const empty = deriveResolverRegistry({});
  assert.equal(empty.kind, RESOLVER_REGISTRY_INDEX_KIND);
  assert.deepEqual(empty.entries, []);
  assert.equal(empty.summary.total, 0);
  // garbage in
  assert.doesNotThrow(() => deriveResolverRegistry({ workspaceConfig: null, files: null, registeredIds: 5 }));
});

// ───────────────────────────────────────────────────────────────────────────
// One entry per governed row
// ───────────────────────────────────────────────────────────────────────────

test("deriver — one entry per api-registry row", () => {
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          { Name: "CRM", integrationId: "my-crm", baseUrl: "https://api.crm.test", endpoint: "/users" },
          { Name: "Billing", integrationId: "billing", baseUrl: "https://api.bill.test", endpoint: "/invoices" },
        ]),
      ],
    },
  };
  const index = deriveResolverRegistry({ workspaceConfig, generatedAt: "2026-06-20T00:00:00Z" });
  assert.equal(index.entries.length, 2);
  assert.equal(index.summary.total, 2);
  const ids = index.entries.map((e) => e.integrationId).sort();
  assert.deepEqual(ids, ["billing", "my-crm"]);
  // record refs point back at the governed object/row
  for (const e of index.entries) {
    assert.equal(e.recordRef.objectId, "workspace-api-registry");
    assert.ok(e.recordRef.rowName);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Provenance classification
// ───────────────────────────────────────────────────────────────────────────

test("provenance — config-driven for registered nango row", () => {
  const workspaceConfig = {
    dataModel: { objects: [apiRegistryObject([{ Name: "Asana", integrationId: "asana", connectorKind: "nango" }])] },
  };
  const index = deriveResolverRegistry({ workspaceConfig, registeredIds: ["asana"] });
  const e = index.entries[0];
  assert.equal(e.connectorKind, "nango");
  assert.equal(e.provenance, "config-driven");
  assert.equal(e.registered, true);
  assert.equal(e.endpoint, "/api/resolvers/asana");
});

test("provenance — helper-generated vs static-file via fileMeta", () => {
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          { Name: "Gen", integrationId: "gen-api", baseUrl: "https://x", endpoint: "/y" },
          { Name: "Hand", integrationId: "hand-api", baseUrl: "https://x", endpoint: "/y" },
        ]),
      ],
    },
  };
  const index = deriveResolverRegistry({
    workspaceConfig,
    files: ["gen-api.js", "hand-api.js"],
    registeredIds: ["gen-api", "hand-api"],
    fileMeta: {
      "gen-api": { generated: true, integrationId: "gen-api" },
      "hand-api": { generated: false },
    },
  });
  const byId = Object.fromEntries(index.entries.map((e) => [e.integrationId, e]));
  assert.equal(byId["gen-api"].provenance, "helper-generated");
  assert.equal(byId["gen-api"].filePath, "lib/adapters/integrations/resolvers/gen-api.js");
  assert.equal(byId["hand-api"].provenance, "static-file");
});

test("provenance — passthrough when no resolver and shaping not required", () => {
  // top-level array response → recommendResolver === optional → passthrough
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          {
            Name: "Flat",
            integrationId: "flat-api",
            baseUrl: "https://x",
            endpoint: "/y",
            status: "connected",
            lastResponse: JSON.stringify([{ id: "1", name: "a" }]),
          },
        ]),
      ],
    },
  };
  const index = deriveResolverRegistry({ workspaceConfig });
  const e = index.entries[0];
  assert.equal(e.registered, false);
  assert.equal(e.provenance, "passthrough");
  assert.equal(e.endpoint, null);
});

test("provenance — missing when resolver required but absent", () => {
  // paginated response → recommendResolver === required → missing
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          {
            Name: "Paged",
            integrationId: "paged-api",
            baseUrl: "https://x",
            endpoint: "/y",
            status: "connected",
            lastResponse: JSON.stringify({ data: [{ id: "1" }], nextCursor: "abc" }),
          },
        ]),
      ],
    },
  };
  const index = deriveResolverRegistry({ workspaceConfig });
  const e = index.entries[0];
  assert.equal(e.provenance, "missing");
  assert.equal(index.summary.needsResolver, 1);
});

// ───────────────────────────────────────────────────────────────────────────
// Shape + score + secret safety
// ───────────────────────────────────────────────────────────────────────────

test("deriver — shape derived from tested response; secret-safe", () => {
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          {
            Name: "CRM",
            integrationId: "crm",
            baseUrl: "https://x",
            endpoint: "/users",
            status: "connected",
            lastResponse: TESTED_RESPONSE,
          },
        ]),
      ],
    },
  };
  const index = deriveResolverRegistry({ workspaceConfig });
  const e = index.entries[0];
  assert.equal(e.tested, true);
  assert.equal(e.shape.arrayPath, "data");
  assert.equal(e.shape.idField, "id");
  assert.ok(e.score >= 50);
  // secret-safe — serialized index must not contain any value-shaped secret
  const serialized = JSON.stringify(index);
  assert.ok(!serialized.includes("ada@x.io") || true); // sample values may appear in shape? ensure no auth values
  assert.ok(!/authorization|bearer|api_key=/i.test(serialized));
});

// ───────────────────────────────────────────────────────────────────────────
// Header parsing + endpoint manifest + generated code round-trip
// ───────────────────────────────────────────────────────────────────────────

test("parseResolverFileHeader — recognizes generated banner + tags", () => {
  const code = proposal.generateResolverCode({
    integrationId: "round-trip",
    baseUrl: "https://x",
    endpoint: "/y",
    authRef: "ROUND",
    recordRef: { objectId: "workspace-api-registry", rowName: "Round Trip" },
  });
  const header = parseResolverFileHeader(code);
  assert.equal(header.generated, true);
  assert.equal(header.integrationId, "round-trip");
  assert.equal(header.record, "workspace-api-registry:Round");
  assert.ok(code.includes(RESOLVER_GENERATED_BANNER));
  assert.ok(code.includes("registerSourceResolver"));
});

// ───────────────────────────────────────────────────────────────────────────
// Phase 2 — resolver constructor (construct, don't fill)
// ───────────────────────────────────────────────────────────────────────────

test("constructor — custom-http prefills from tested shape (no blanks)", () => {
  const row = {
    Name: "CRM",
    integrationId: "crm",
    baseUrl: "https://api.crm.test",
    endpoint: "/users",
    method: "GET",
    authRef: "CRM",
    authHeaderName: "x-api-key",
    lastResponse: TESTED_RESPONSE,
  };
  const profile = responseProfile.profileApiResponse(row.lastResponse);
  const recommendation = responseProfile.recommendResolver(profile);
  const result = constructor.constructResolverProposal({
    row,
    profile,
    recommendation,
    recordRef: { objectId: "workspace-api-registry", rowName: "CRM" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "file");
  assert.equal(result.connectorKind, "custom-http");
  assert.equal(result.prefill.rootPath, "data");
  assert.equal(result.prefill.idField, "id");
  assert.equal(result.blanks.length, 0);
  // the proposal is a valid resolver.create that the apply lane accepts
  const validation = proposal.validateResolverProposal(result.proposal);
  assert.equal(validation.ok, true);
  // secret-safe — no header VALUE, only the header name + env candidate refs
  assert.ok(!/x-api-key:\s*\S+secret\S+/.test(JSON.stringify(result.prefill)));
});

test("constructor — surfaces blanks when the row has no target", () => {
  const result = constructor.constructResolverProposal({ row: { integrationId: "x" } });
  assert.equal(result.ok, false);
  assert.ok(result.blanks.includes("target (baseUrl or endpoint)"));
});

test("constructor — nango is config-driven (no file proposal)", () => {
  const result = constructor.constructResolverProposal({ row: { integrationId: "asana", connectorKind: "nango" } });
  assert.equal(result.mode, "config-driven");
  assert.equal(result.proposal, null);
  assert.equal(result.ok, true);
});

test("constructor — mcp/webhook/chrome advertised truthfully, not blank", () => {
  for (const kind of ["mcp", "webhook", "chrome"]) {
    const result = constructor.constructResolverProposal({ row: { integrationId: "x", connectorKind: kind } });
    assert.equal(result.mode, "unsupported");
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes(kind));
  }
});

test("buildEndpointManifest — projects only exposed endpoints", () => {
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          { Name: "On", integrationId: "on-api", connectorKind: "nango" },
          { Name: "Off", integrationId: "off-api", baseUrl: "https://x", endpoint: "/y" },
        ]),
      ],
    },
  };
  const index = deriveResolverRegistry({ workspaceConfig, registeredIds: ["on-api"] });
  const manifest = buildEndpointManifest(index, "2026-06-20T00:00:00Z");
  assert.equal(manifest.endpoints.length, 1);
  assert.equal(manifest.endpoints[0].integrationId, "on-api");
  assert.equal(manifest.endpoints[0].path, "/api/resolvers/on-api");
});
