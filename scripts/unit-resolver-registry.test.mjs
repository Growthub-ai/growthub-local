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
});

test("deriver — registry is secret-safe AND PII-safe (active assertions, no || true)", () => {
  const PII_RESPONSE = JSON.stringify({
    data: [{ id: "1", name: "Jane Secret", email: "jane@private.example", ssn: "123-45-6789" }],
  });
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          {
            Name: "Sensitive",
            integrationId: "sensitive",
            baseUrl: "https://api.sensitive.test",
            endpoint: "/people",
            authRef: "CRM",
            authHeaderName: "authorization",
            authPrefix: "Bearer",
            status: "connected",
            lastResponse: PII_RESPONSE,
          },
        ]),
      ],
    },
  };
  // Simulate a runtime where the env value is set (must never appear in output).
  const index = deriveResolverRegistry({
    workspaceConfig,
    runtime: { configuredEnvRefs: ["CRM"] },
  });
  const serialized = JSON.stringify(index);
  // No env values / auth header values / bearer tokens.
  assert.ok(!/Bearer\s+\S/i.test(serialized), "no bearer token material");
  assert.ok(!serialized.includes("CRM_API_KEY"), "no env value keys");
  // No raw record payload values — only DERIVED shape facts (field names).
  assert.ok(!serialized.includes("Jane Secret"), "no PII name value");
  assert.ok(!serialized.includes("jane@private.example"), "no PII email value");
  assert.ok(!serialized.includes("123-45-6789"), "no PII ssn value");
  // It DOES carry the derived shape (field name only) — useful, not leaky.
  const e = index.entries[0];
  assert.equal(e.shape.idField, "id");
  assert.equal(e.shape.arrayPath, "data");
});

test("identity — human integrationId normalizes to a canonical slug end-to-end", () => {
  const workspaceConfig = {
    dataModel: { objects: [apiRegistryObject([{ Name: "HubSpot CRM", integrationId: "HubSpot CRM", baseUrl: "https://x", endpoint: "/y" }])] },
  };
  // resolver registered under the SLUG (as generated files do) — dual-check must
  // still see it as registered and expose the canonical endpoint.
  const index = deriveResolverRegistry({
    workspaceConfig,
    files: ["hubspot-crm.js"],
    registeredIds: ["hubspot-crm"],
    fileMeta: { "hubspot-crm": { generated: true } },
  });
  const e = index.entries[0];
  assert.equal(e.integrationId, "HubSpot CRM");
  assert.equal(e.resolverId, "hubspot-crm");
  assert.equal(e.registered, true);
  assert.equal(e.provenance, "helper-generated");
  assert.equal(e.endpoint, "/api/resolvers/hubspot-crm");
  assert.equal(e.filePath, "lib/adapters/integrations/resolvers/hubspot-crm.js");
});

test("identity — colliding integrationIds (same slug) are reported, never silently merged", () => {
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          { Name: "A", integrationId: "ACME/API v2", baseUrl: "https://x", endpoint: "/y" },
          { Name: "B", integrationId: "acme api v2", baseUrl: "https://x", endpoint: "/y" },
        ]),
      ],
    },
  };
  const index = deriveResolverRegistry({ workspaceConfig });
  assert.equal(index.summary.collisions, 1);
  assert.equal(index.collisions[0].resolverId, "acme-api-v2");
  assert.equal(index.collisions[0].records.length, 2);
});

test("constructor-integration — cockpit-derived proposal is a valid, governed, prefilled resolver", () => {
  // This is the UNIT-LEVEL proof of the no-code path the cockpit takes:
  // stageResolverConstruct() calls constructResolverProposal(); we assert it
  // produces exactly the governed resolver.create the apply lane accepts — with
  // shape derived for the user (they never type rootPath/idField/entityType).
  const row = {
    Name: "Orders", integrationId: "orders-api", baseUrl: "https://api.shop.test",
    endpoint: "/v1/orders", method: "GET", authRef: "SHOP", authHeaderName: "x-api-key",
    status: "connected", lastResponse: JSON.stringify({ data: [{ id: "o1", total: 9 }], nextCursor: "z" }),
  };
  const profile = responseProfile.profileApiResponse(row.lastResponse);
  const recommendation = responseProfile.recommendResolver(profile);
  const result = constructor.constructResolverProposal({
    row, profile, recommendation,
    recordRef: { objectId: "workspace-api-registry", rowName: "Orders" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.endpoint, "/api/resolvers/orders-api");
  assert.equal(result.prefill.rootPath, "data");           // derived, not typed
  assert.equal(result.prefill.idField, "id");
  // governed: a valid resolver.create the apply lane will accept + write
  const v = proposal.validateResolverProposal(result.proposal);
  assert.equal(v.ok, true);
  // carries provenance recordRef so the written file is traceable to the record
  const header = reg.parseResolverFileHeader(result.proposal.code);
  assert.equal(header.generated, true);
  assert.equal(header.recordRef.rowName, "Orders");
});

test("adversarial — messy lastResponse fixtures never throw and classify sanely", () => {
  const cases = [
    { name: "empty array", lastResponse: "[]" },
    { name: "malformed", lastResponse: "{not json" },
    { name: "nested", lastResponse: JSON.stringify({ result: { items: [{ id: 1 }] } }) },
    { name: "top-level", lastResponse: JSON.stringify([{ id: 1 }]) },
  ];
  for (const c of cases) {
    const workspaceConfig = {
      dataModel: { objects: [apiRegistryObject([{ Name: c.name, integrationId: `adv-${c.name.replace(/\s+/g, "-")}`, baseUrl: "https://x", endpoint: "/y", status: "connected", lastResponse: c.lastResponse }])] },
    };
    assert.doesNotThrow(() => deriveResolverRegistry({ workspaceConfig }), c.name);
    const idx = deriveResolverRegistry({ workspaceConfig });
    assert.equal(idx.entries.length, 1, c.name);
    assert.ok(["passthrough", "missing", "config-driven", "static-file", "helper-generated"].includes(idx.entries[0].provenance), c.name);
  }
});

test("adversarial — baseUrl-only and duplicate-slash rows still derive an entry", () => {
  const workspaceConfig = {
    dataModel: {
      objects: [
        apiRegistryObject([
          { Name: "BaseOnly", integrationId: "base-only", baseUrl: "https://api.x.test/" },
          { Name: "Slashes", integrationId: "slashes", baseUrl: "https://api.x.test/", endpoint: "/records/" },
        ]),
      ],
    },
  };
  const idx = deriveResolverRegistry({ workspaceConfig });
  assert.equal(idx.entries.length, 2);
});

// ───────────────────────────────────────────────────────────────────────────
// Header parsing + endpoint manifest + generated code round-trip
// ───────────────────────────────────────────────────────────────────────────

test("parseResolverFileHeader — full recordRef survives spaces/special chars (no truncation)", () => {
  for (const rowName of ["Round Trip", "ACME: Prod/v2", 'He said "hi" 🚀', "line\nbreak"]) {
    const code = proposal.generateResolverCode({
      integrationId: "round-trip",
      baseUrl: "https://x",
      endpoint: "/y",
      authRef: "ROUND",
      recordRef: { objectId: "workspace-api-registry", rowName },
    });
    const header = parseResolverFileHeader(code);
    assert.equal(header.generated, true);
    assert.equal(header.integrationId, "round-trip");
    // base64url tag decodes back to the FULL row name — no whitespace truncation,
    // and no special char can corrupt the single-line header.
    assert.ok(header.recordRef, `recordRef should decode for ${JSON.stringify(rowName)}`);
    assert.equal(header.recordRef.rowName, rowName.trim());
    assert.equal(header.recordRef.objectId, "workspace-api-registry");
    assert.ok(code.includes(RESOLVER_GENERATED_BANNER));
    assert.ok(code.includes("registerSourceResolver"));
    // the provenance header is slug/base64 only — the raw row name never appears
    // in the first lines, so no special char can break out of the comment.
    const firstLines = code.split("\n").slice(0, 3).join("\n");
    assert.ok(!firstLines.includes(rowName));
  }
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
  assert.equal(result.connectorKind, "http"); // taxonomy: http (custom-http template) — default when unset
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

test("constructor — nango readiness is honest (ready vs missing-config)", () => {
  // Bare nango row → NOT ready: missing connectionIds + endpoint surfaced.
  const bare = constructor.constructResolverProposal({ row: { integrationId: "asana", connectorKind: "nango" } });
  assert.equal(bare.mode, "config-driven");
  assert.equal(bare.proposal, null);
  assert.equal(bare.ok, false);
  assert.equal(bare.state, "config-driven-missing-config");
  assert.ok(bare.blanks.includes("connectionIds"));
  assert.ok(bare.blanks.includes("endpoint (Nango proxy path)"));

  // Fully-bound nango row → ready, no blanks, endpoint advertised.
  const ready = constructor.constructResolverProposal({
    row: { integrationId: "asana", connectorKind: "nango", providerConfigKey: "asana", connectionIds: "conn_1", endpoint: "/tasks" },
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.state, "config-driven-ready");
  assert.equal(ready.blanks.length, 0);
  assert.equal(ready.endpoint, "/api/resolvers/asana");
});

test("constructor — reserved kinds (mcp/chrome/tool) advertised truthfully, not blank", () => {
  for (const kind of ["mcp", "chrome", "tool"]) {
    const result = constructor.constructResolverProposal({ row: { integrationId: "x", connectorKind: kind } });
    assert.equal(result.mode, "unsupported");
    assert.equal(result.reserved, true);
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes(kind));
    // not a dead end: a concrete next action is offered.
    assert.ok(result.nextAction && result.nextAction.label);
  }
});

test("constructor — non-reserved kinds are file-constructable; connectorKind preserved verbatim", () => {
  // Policy B: connectorKind is operator text, honored verbatim (never normalized).
  // The webhook TEMPLATE ships connectorKind "http" → file-constructable.
  const httpRow = {
    Name: "Hook", integrationId: "hook", connectorKind: "http", endpoint: "https://x/ingest", method: "POST",
    status: "connected", lastResponse: JSON.stringify({ items: [{ id: "a" }] }),
  };
  const httpResult = constructor.constructResolverProposal({
    row: httpRow,
    profile: responseProfile.profileApiResponse(httpRow.lastResponse),
    recommendation: responseProfile.recommendResolver(responseProfile.profileApiResponse(httpRow.lastResponse)),
  });
  assert.equal(httpResult.mode, "file");
  assert.equal(httpResult.connectorKind, "http");

  // A LITERAL connectorKind: "webhook" an operator types is NOT reserved →
  // file-constructable, and the kind is preserved verbatim (not rewritten to http).
  const literalWebhook = { ...httpRow, connectorKind: "webhook" };
  const whResult = constructor.constructResolverProposal({
    row: literalWebhook,
    profile: responseProfile.profileApiResponse(literalWebhook.lastResponse),
    recommendation: responseProfile.recommendResolver(responseProfile.profileApiResponse(literalWebhook.lastResponse)),
  });
  assert.equal(whResult.mode, "file");
  assert.equal(whResult.connectorKind, "webhook"); // verbatim, never silently normalized
  // and the registry reflects the same verbatim value
  const ws = { dataModel: { objects: [apiRegistryObject([{ ...literalWebhook, resolverTemplateId: "hook" }])] } };
  const e = deriveResolverRegistry({ workspaceConfig: ws, files: ["hook.js"], registeredIds: ["hook"], fileMeta: { hook: { generated: true } } }).entries[0];
  assert.equal(e.connectorKind, "webhook");
  assert.equal(e.trust, "endpoint-live"); // non-reserved + registered + tested
});

// ───────────────────────────────────────────────────────────────────────────
// Drift guard — diffResolverArtifacts enforces what the contract claims
// ───────────────────────────────────────────────────────────────────────────

function exposedWorkspace() {
  return {
    dataModel: { objects: [apiRegistryObject([{ Name: "On", integrationId: "on-api", connectorKind: "nango" }])] },
  };
}

test("drift — clean (no artifacts) passes", () => {
  const fresh = deriveResolverRegistry({ workspaceConfig: exposedWorkspace(), registeredIds: ["on-api"] });
  const { errors } = reg.diffResolverArtifacts({ fresh });
  assert.deepEqual(errors, []);
});

test("drift — matching saved artifacts pass (generatedAt ignored)", () => {
  const fresh = deriveResolverRegistry({ workspaceConfig: exposedWorkspace(), registeredIds: ["on-api"], generatedAt: "A" });
  const savedIndex = { ...deriveResolverRegistry({ workspaceConfig: exposedWorkspace(), registeredIds: ["on-api"], generatedAt: "B" }) };
  const savedManifest = reg.buildEndpointManifest(savedIndex, "B");
  const { errors } = reg.diffResolverArtifacts({ fresh, savedIndex, savedManifest });
  assert.deepEqual(errors, []);
});

test("drift — saved manifest with EXTRA (stale) endpoint fails", () => {
  const fresh = deriveResolverRegistry({ workspaceConfig: exposedWorkspace(), registeredIds: ["on-api"] });
  const savedManifest = reg.buildEndpointManifest(fresh, "x");
  savedManifest.endpoints.push({ integrationId: "ghost", path: "/api/resolvers/ghost", connectorKind: "custom-http", recordRef: { objectId: "x", rowName: "G", integrationId: "ghost" } });
  const { errors } = reg.diffResolverArtifacts({ fresh, savedManifest });
  assert.ok(errors.some((e) => e.includes("stale endpoint")), errors.join("|"));
});

test("drift — saved manifest MISSING an exposed endpoint fails", () => {
  const fresh = deriveResolverRegistry({ workspaceConfig: exposedWorkspace(), registeredIds: ["on-api"] });
  const savedManifest = reg.buildEndpointManifest(fresh, "x");
  savedManifest.endpoints = [];
  const { errors } = reg.diffResolverArtifacts({ fresh, savedManifest });
  assert.ok(errors.some((e) => e.includes("missing")), errors.join("|"));
});

test("drift — saved manifest with WRONG path fails", () => {
  const fresh = deriveResolverRegistry({ workspaceConfig: exposedWorkspace(), registeredIds: ["on-api"] });
  const savedManifest = reg.buildEndpointManifest(fresh, "x");
  savedManifest.endpoints[0].path = "/api/resolvers/WRONG";
  const { errors } = reg.diffResolverArtifacts({ fresh, savedManifest });
  assert.ok(errors.length > 0);
});

test("drift — saved registry with wrong endpoint (same provenance) fails", () => {
  const fresh = deriveResolverRegistry({ workspaceConfig: exposedWorkspace(), registeredIds: ["on-api"] });
  const savedIndex = JSON.parse(JSON.stringify(fresh));
  savedIndex.entries[0].endpoint = "/api/resolvers/tampered";
  const { errors } = reg.diffResolverArtifacts({ fresh, savedIndex });
  assert.ok(errors.some((e) => e.includes("drifted")), errors.join("|"));
});

test("drift — saved registry with wrong summary count fails", () => {
  const fresh = deriveResolverRegistry({ workspaceConfig: exposedWorkspace(), registeredIds: ["on-api"] });
  const savedIndex = JSON.parse(JSON.stringify(fresh));
  savedIndex.summary.registered = 999;
  const { errors } = reg.diffResolverArtifacts({ fresh, savedIndex });
  assert.ok(errors.some((e) => e.includes("summary")), errors.join("|"));
});

test("drift — collisions fail the guard even with no artifacts", () => {
  const workspaceConfig = {
    dataModel: { objects: [apiRegistryObject([
      { Name: "A", integrationId: "Dup API", baseUrl: "https://x", endpoint: "/y" },
      { Name: "B", integrationId: "dup-api", baseUrl: "https://x", endpoint: "/y" },
    ])] },
  };
  const fresh = deriveResolverRegistry({ workspaceConfig });
  const { errors } = reg.diffResolverArtifacts({ fresh });
  assert.ok(errors.some((e) => e.includes("collision")), errors.join("|"));
});

// ───────────────────────────────────────────────────────────────────────────
// Product-taste: golden path, agent-operability, structured governance values
// ───────────────────────────────────────────────────────────────────────────

test("GOLDEN PATH — no-code journey semantics (regresses if it becomes a dev form)", () => {
  // tested nested response, no resolver yet, human-readable integrationId.
  const row = {
    Name: "Contacts", integrationId: "Acme Contacts", baseUrl: "https://api.acme.test",
    endpoint: "/v2/contacts", method: "GET", authRef: "ACME", authHeaderName: "x-api-key",
    status: "connected",
    lastResponse: JSON.stringify({ data: { items: [{ id: "c1", name: "A" }, { id: "c2", name: "B" }] } }),
  };
  const profile = responseProfile.profileApiResponse(row.lastResponse);
  const recommendation = responseProfile.recommendResolver(profile);
  const c = constructor.constructResolverProposal({
    row, profile, recommendation, recordRef: { objectId: "workspace-api-registry", rowName: "Contacts" },
  });
  // 1. the system SHOWS understanding (detected summary, not a blank form)
  assert.ok(c.detected, "must surface a detected shape summary");
  assert.equal(c.detected.recordPath, "data.items");
  assert.equal(c.detected.idField, "id");
  assert.ok(c.detected.sentence.includes("Found 2"), c.detected.sentence);
  assert.ok(["high", "medium", "low"].includes(c.detected.confidence));
  // 2. ONE clear primary action, no blanks for the user to fill
  assert.equal(c.ok, true);
  assert.equal(c.blanks.length, 0);
  // 3. review names endpoint, entity, row id, record path, and is safe
  assert.equal(c.endpoint, "/api/resolvers/acme-contacts");
  assert.equal(c.prefill.entityType, "items");
  assert.equal(c.authRef, "ACME");
  // 4. governed proposal with an exact file target the apply lane accepts
  assert.equal(proposal.validateResolverProposal(c.proposal).ok, true);
  assert.ok(c.proposal.target.path.endsWith("acme-contacts.js"));
  // 5. the panel-facing summary never renders secret material (env-ref NAMES may
  // appear inside the generated server file, but not in the review chrome).
  const panelSurface = JSON.stringify({ detected: c.detected, prefill: c.prefill, reason: c.reason, endpoint: c.endpoint, blanks: c.blanks });
  assert.ok(!panelSurface.includes("ACME_API_KEY"));
  assert.ok(!/Bearer\s+\S/.test(panelSurface));

  // 6. post-apply registry truth: registered → endpoint-live + agent-callable
  const workspaceConfig = { dataModel: { objects: [apiRegistryObject([{ ...row, resolverTemplateId: "acme-contacts" }])] } };
  const index = deriveResolverRegistry({
    workspaceConfig, files: ["acme-contacts.js"], registeredIds: ["acme-contacts"],
    fileMeta: { "acme-contacts": { generated: true } },
  });
  const e = index.entries[0];
  assert.equal(e.trust, "endpoint-live");
  assert.equal(e.agentHints.callable, true);
  assert.equal(e.agentHints.endpoint, "/api/resolvers/acme-contacts");
  assert.equal(e.agentHints.entityType, "items");
});

test("agent-operability — trust + agentHints answer the model's questions per state", () => {
  const ws = {
    dataModel: { objects: [apiRegistryObject([
      { Name: "Live", integrationId: "live", baseUrl: "https://x", endpoint: "/y", status: "connected", lastResponse: TESTED_RESPONSE, resolverTemplateId: "live" },
      { Name: "Needs", integrationId: "needs", baseUrl: "https://x", endpoint: "/y", status: "connected", lastResponse: JSON.stringify({ data: [{ id: 1 }], nextCursor: "z" }) },
      { Name: "Nango", integrationId: "nango-x", connectorKind: "nango" },
      { Name: "Mcp", integrationId: "mcp-x", connectorKind: "mcp" },
    ])] },
  };
  const index = deriveResolverRegistry({ ws, workspaceConfig: ws, files: ["live.js"], registeredIds: ["live"], fileMeta: { live: { generated: true } } });
  const by = Object.fromEntries(index.entries.map((e) => [e.integrationId, e]));
  assert.equal(by["live"].trust, "endpoint-live");
  assert.equal(by["live"].agentHints.callable, true);
  assert.equal(by["needs"].trust, "needs-resolver");
  assert.equal(by["needs"].agentHints.callable, false);
  assert.ok(by["needs"].agentHints.blockedReason);
  assert.equal(by["nango-x"].trust, "missing-config");
  assert.equal(by["mcp-x"].trust, "reserved-future");
  // every blocked entry carries an actionable reason — never a bare "green"
  for (const e of index.entries) {
    if (!e.agentHints.callable) assert.ok(e.agentHints.blockedReason || e.agentHints.nextAction, e.integrationId);
  }
});

test("activationTrace — derivable activation slice is present and secret/PII-safe", () => {
  const ws = {
    dataModel: { objects: [apiRegistryObject([
      { Name: "Trace", integrationId: "trace-api", baseUrl: "https://x", endpoint: "/y", authRef: "TRACE", authPrefix: "Bearer",
        status: "connected", resolverTemplateId: "trace-api",
        lastResponse: JSON.stringify({ data: [{ id: "t1", name: "Jane Secret", email: "jane@x.test" }] }) },
    ])] },
  };
  const e = deriveResolverRegistry({ workspaceConfig: ws, files: ["trace-api.js"], registeredIds: ["trace-api"], fileMeta: { "trace-api": { generated: true } } }).entries[0];
  const t = e.activationTrace;
  assert.ok(t, "activationTrace present");
  assert.equal(t.resolverId, "trace-api");
  assert.equal(t.endpoint, "/api/resolvers/trace-api");
  assert.equal(t.filePath, "lib/adapters/integrations/resolvers/trace-api.js");
  assert.equal(t.shape.recordPath, "data");
  assert.equal(t.shape.idField, "id");
  assert.equal(t.constructorState, "detected");
  // secret/PII-safe: ids/paths/shape facts only — no values
  const s = JSON.stringify(t);
  assert.ok(!s.includes("Jane Secret") && !s.includes("jane@x.test"));
  assert.ok(!/Bearer\s+\S/.test(s) && !s.includes("TRACE_API_KEY"));
});

test("structured governance values — taxonomy connectorKind + capabilities + lane surface", () => {
  const ws = {
    dataModel: { objects: [apiRegistryObject([
      { Name: "Tpl", integrationId: "tpl", connectorKind: "http", resolverTemplateId: "generic-crm", capabilities: "listEntities,fetchRecords", executionLane: "data-source", baseUrl: "https://x", endpoint: "/y" },
    ])] },
  };
  const e = deriveResolverRegistry({ workspaceConfig: ws }).entries[0];
  assert.equal(e.connectorKind, "http");          // taxonomy honored, not "custom-http"
  assert.equal(e.templateId, "generic-crm");
  assert.deepEqual(e.capabilities, ["listEntities", "fetchRecords"]);
  assert.equal(e.executionLane, "data-source");
});

test("structured governance values — a registered mcp static file is endpoint-live, not reserved", () => {
  const ws = {
    dataModel: { objects: [apiRegistryObject([
      { Name: "McpLive", integrationId: "mcp-live", connectorKind: "mcp", status: "connected", lastResponse: TESTED_RESPONSE },
    ])] },
  };
  // a hand-written mcp resolver file exists + is registered (static-file provenance)
  const e = deriveResolverRegistry({ ws, workspaceConfig: ws, files: ["mcp-live.js"], registeredIds: ["mcp-live"], fileMeta: { "mcp-live": { generated: false } } }).entries[0];
  assert.equal(e.provenance, "static-file");
  assert.equal(e.trust, "endpoint-live"); // reserved is about auto-construction, not trust
  assert.equal(e.connectorKind, "mcp");
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
