#!/usr/bin/env node
/**
 * Unit coverage for the Nango thin adapter.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install). Verifies:
 *
 *   - validateWorkspaceConfig accepts the EXISTING api-registry HTTP shape
 *     (no regression on integrationId/authRef/baseUrl/endpoint rows)
 *   - validateWorkspaceConfig accepts a Nango-backed api-registry row
 *     (connectorKind:"nango" + optional providerConfigKey + connectionIds)
 *   - validateWorkspaceConfig REJECTS forbidden token-shaped fields on any
 *     api-registry row, regardless of connectorKind
 *   - validateWorkspaceConfig rejects a malformed Nango providerConfigKey
 *   - sandbox-environment validation is unchanged
 *   - integrationAdapter env enum accepts "nango"
 *   - nango template is registered in the template registry under id "nango"
 *   - nango proxy validator rejects Authorization header
 *   - nango proxy validator accepts a well-formed request
 *   - nango action execute validator enforces non-empty fields
 *   - projectNangoBinding returns null for non-Nango rows and a shaped
 *     binding for Nango-backed rows (defaulting providerConfigKey from
 *     integrationId when not explicitly set)
 *   - getStatus returns "unconfigured" when NANGO_SECRET_KEY is absent
 *   - describeNangoAdapter never leaks the secret value
 *   - registerNangoResolversFromConfig registers one resolver per
 *     Nango-backed row and getSourceResolver returns it
 *
 * Run with:  node --test scripts/unit-nango-adapter.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib"
);

const schema = await import(pathToFileURL(path.join(kitLib, "workspace-schema.js")).href);
const nangoSchema = await import(
  pathToFileURL(path.join(kitLib, "adapters/integrations/nango/nango-schema.js")).href
);
const nangoAdapter = await import(
  pathToFileURL(path.join(kitLib, "adapters/integrations/nango/nango-adapter.js")).href
);
const nangoConfigLoader = await import(
  pathToFileURL(path.join(kitLib, "adapters/integrations/nango/nango-config-loader.js")).href
);
const resolverRegistry = await import(
  pathToFileURL(path.join(kitLib, "adapters/integrations/source-resolver-registry.js")).href
);
const templateRegistry = await import(
  pathToFileURL(path.join(kitLib, "adapters/integrations/templates/template-registry.js")).href
);
const env = await import(pathToFileURL(path.join(kitLib, "adapters/env.js")).href);

function validateOk(config) {
  schema.validateWorkspaceConfig(config);
}

function validateFails(config, expectedSubstrings) {
  let caught;
  try {
    schema.validateWorkspaceConfig(config);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected validateWorkspaceConfig to throw");
  assert.equal(caught.code, "INVALID_WORKSPACE_CONFIG");
  for (const needle of expectedSubstrings) {
    assert.ok(
      caught.details.some((d) => d.includes(needle)),
      `expected error detail to mention "${needle}", got: ${caught.details.join(" | ")}`
    );
  }
}

test("api-registry HTTP shape (existing) still validates", () => {
  validateOk({
    dataModel: {
      objects: [
        {
          id: "api-registry",
          label: "API Registry",
          source: "API Registry",
          objectType: "api-registry",
          icon: "Code2",
          columns: ["integrationId", "authRef", "baseUrl", "endpoint", "method", "status"],
          rows: [
            {
              integrationId: "probe-scheduler",
              authRef: "PROBE_SCHEDULER",
              baseUrl: "https://example.invalid",
              endpoint: "/run",
              method: "POST",
              status: "connected",
              connectorKind: "http",
              resolverTemplateId: "custom-http",
              schemaVersion: "growthub-resolver-template-v1",
              executionLane: "sandbox-serverless"
            }
          ]
        }
      ]
    }
  });
});

test("api-registry Nango row validates with optional binding fields", () => {
  validateOk({
    dataModel: {
      objects: [
        {
          id: "api-registry",
          label: "API Registry",
          objectType: "api-registry",
          columns: ["integrationId", "authRef", "connectorKind", "providerConfigKey", "connectionIds"],
          rows: [
            {
              integrationId: "hubspot",
              authRef: "NANGO_SECRET_KEY",
              connectorKind: "nango",
              providerConfigKey: "hubspot-prod",
              nangoMode: "cloud",
              nangoEnvironment: "prod",
              connectionIds: ["acct-123", "acct-456"],
              enabledActions: ["create-contact"],
              status: "configured"
            }
          ]
        }
      ]
    }
  });
});

test("api-registry rejects token-shaped field names on every row", () => {
  validateFails(
    {
      dataModel: {
        objects: [
          {
            id: "api-registry",
            label: "API Registry",
            objectType: "api-registry",
            columns: [],
            rows: [
              {
                integrationId: "hubspot",
                connectorKind: "nango",
                providerConfigKey: "hubspot",
                apiKey: "leaked-secret",
                token: "another-secret"
              }
            ]
          }
        ]
      }
    },
    ["apiKey is not allowed", "token is not allowed"]
  );
});

test("api-registry Nango row rejects malformed providerConfigKey", () => {
  validateFails(
    {
      dataModel: {
        objects: [
          {
            id: "api-registry",
            label: "API Registry",
            objectType: "api-registry",
            columns: [],
            rows: [
              {
                integrationId: "x",
                connectorKind: "nango",
                providerConfigKey: "has spaces!"
              }
            ]
          }
        ]
      }
    },
    ["providerConfigKey must be alphanumeric"]
  );
});

test("api-registry Nango row tolerates comma-separated connectionIds", () => {
  validateOk({
    dataModel: {
      objects: [
        {
          id: "api-registry",
          label: "API Registry",
          objectType: "api-registry",
          columns: [],
          rows: [
            {
              integrationId: "stripe",
              connectorKind: "nango",
              connectionIds: "acct-1, acct-2 , acct-3",
              enabledActions: "create-customer,refund"
            }
          ]
        }
      ]
    }
  });
});

test("sandbox-environment validation is unchanged", () => {
  validateOk({
    dataModel: {
      objects: [
        {
          id: "sandboxes",
          label: "Sandboxes",
          objectType: "sandbox-environment",
          columns: ["id", "label"],
          rows: [
            { id: "default", label: "Default", runLocality: "local", runtime: "node" }
          ]
        }
      ]
    }
  });
});

test("nango is row-scoped — NOT in the global integrationAdapter enum", () => {
  // Nango is not a workspace-wide integration adapter. It lives at the
  // api-registry row level via `connectorKind: "nango"`. The env enum must
  // continue to reject "nango" so callers don't think it's a global mode.
  const prev = process.env.GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER;
  process.env.GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER = "nango";
  try {
    assert.throws(() => env.readAdapterConfig(), /must be one of/);
  } finally {
    if (prev === undefined) delete process.env.GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER;
    else process.env.GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER = prev;
  }
});

test("nango env block is still exposed by readAdapterConfig", () => {
  const cfg = env.readAdapterConfig();
  assert.ok(cfg.nango, "expected nango config block");
  assert.equal(cfg.nango.secretEnvName, "NANGO_SECRET_KEY");
  assert.ok("mode" in cfg.nango);
  assert.ok("environment" in cfg.nango);
});

test("nango template is exposed by the resolver template registry", () => {
  const tpl = templateRegistry.getResolverTemplate("nango");
  assert.ok(tpl, "expected nango template to be registered");
  assert.equal(tpl.connectorKind, "nango");
  assert.deepEqual(tpl.capabilities, ["listEntities", "fetchRecords", "runAction"]);
  assert.equal(tpl.apiRegistryDefaults.connectorKind, "nango");
  assert.equal(tpl.apiRegistryDefaults.authRef, "NANGO_SECRET_KEY");
});

test("nango proxy validator rejects Authorization header", () => {
  let caught;
  try {
    nangoSchema.validateProxyRequest({
      providerConfigKey: "hubspot-prod",
      connectionId: "acct-123",
      method: "GET",
      endpoint: "/contacts",
      headers: { Authorization: "Bearer x" }
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected validateProxyRequest to throw");
  assert.equal(caught.code, "NANGO_INVALID_INPUT");
  assert.ok(
    caught.details.some((d) => d.includes("headers.Authorization is not allowed")),
    `expected Authorization rejection, got: ${caught.details?.join(" | ")}`
  );
});

test("nango proxy validator accepts a well-formed request", () => {
  const out = nangoSchema.validateProxyRequest({
    providerConfigKey: "hubspot-prod",
    connectionId: "acct-123",
    method: "post",
    endpoint: "/crm/v3/objects/contacts",
    params: { limit: 10 },
    data: { properties: { email: "ex@ex.com" } }
  });
  assert.equal(out.method, "POST");
  assert.equal(out.providerConfigKey, "hubspot-prod");
  assert.deepEqual(out.params, { limit: 10 });
});

test("nango action execute validator enforces non-empty fields", () => {
  let caught1;
  try {
    nangoSchema.validateActionExecuteRequest({
      providerConfigKey: "",
      connectionId: "x",
      action: "create-contact"
    });
  } catch (error) {
    caught1 = error;
  }
  assert.ok(caught1, "expected throw on empty providerConfigKey");
  assert.ok(
    caught1.details.some((d) => d.includes("providerConfigKey must be a non-empty string")),
    `expected providerConfigKey rejection, got: ${caught1.details?.join(" | ")}`
  );

  let caught2;
  try {
    nangoSchema.validateActionExecuteRequest({
      providerConfigKey: "hubspot",
      connectionId: "acct",
      action: ""
    });
  } catch (error) {
    caught2 = error;
  }
  assert.ok(caught2, "expected throw on empty action");
  assert.ok(
    caught2.details.some((d) => d.includes("action must be a non-empty string")),
    `expected action rejection, got: ${caught2.details?.join(" | ")}`
  );
});

test("projectNangoBinding ignores non-Nango rows", () => {
  const result = nangoAdapter.projectNangoBinding({
    integrationId: "probe-scheduler",
    connectorKind: "http"
  });
  assert.equal(result, null);
});

test("projectNangoBinding defaults providerConfigKey from integrationId", () => {
  const result = nangoAdapter.projectNangoBinding({
    integrationId: "hubspot",
    connectorKind: "nango",
    connectionIds: "acct-1,acct-2",
    enabledActions: ["create-contact"]
  });
  assert.equal(result.integrationId, "hubspot");
  assert.equal(result.providerConfigKey, "hubspot");
  assert.deepEqual(result.connectionIds, ["acct-1", "acct-2"]);
  assert.deepEqual(result.enabledActions, ["create-contact"]);
  assert.equal(result.secretEnvName, "NANGO_SECRET_KEY");
});

test("projectNangoBinding honors explicit providerConfigKey + authRef override", () => {
  const result = nangoAdapter.projectNangoBinding({
    integrationId: "hs",
    connectorKind: "nango",
    providerConfigKey: "hubspot-prod",
    authRef: "NANGO_SECRET_KEY_PROD"
  });
  assert.equal(result.providerConfigKey, "hubspot-prod");
  assert.equal(result.secretEnvName, "NANGO_SECRET_KEY_PROD");
});

test("getStatus reports unconfigured when NANGO_SECRET_KEY is absent", async () => {
  const prev = process.env.NANGO_SECRET_KEY;
  delete process.env.NANGO_SECRET_KEY;
  try {
    const status = await nangoAdapter.getStatus();
    assert.equal(status.status, "unconfigured");
    assert.equal(status.secretEnvName, "NANGO_SECRET_KEY");
    assert.ok(typeof status.reason === "string" && status.reason.length > 0);
  } finally {
    if (prev !== undefined) process.env.NANGO_SECRET_KEY = prev;
  }
});

test("describeNangoAdapter exposes secretEnvName and never the secret value", () => {
  const prev = process.env.NANGO_SECRET_KEY;
  process.env.NANGO_SECRET_KEY = "should-not-leak";
  try {
    const adapter = nangoAdapter.describeNangoAdapter();
    assert.equal(adapter.id, "nango");
    assert.equal(adapter.secretEnvName, "NANGO_SECRET_KEY");
    assert.equal(adapter.hasSecretKey, true);
    for (const value of Object.values(adapter)) {
      if (typeof value === "string") {
        assert.notEqual(value, "should-not-leak");
      }
    }
  } finally {
    if (prev === undefined) delete process.env.NANGO_SECRET_KEY;
    else process.env.NANGO_SECRET_KEY = prev;
  }
});

test("validateConnectSessionRequest accepts a well-formed payload", () => {
  const out = nangoSchema.validateConnectSessionRequest({
    providerConfigKey: "hubspot-prod",
    connectionId: "acct-123",
    endUser: { id: "user-1", email: "u@example.com" }
  });
  assert.equal(out.providerConfigKey, "hubspot-prod");
  assert.equal(out.connectionId, "acct-123");
  assert.equal(out.endUser.id, "user-1");
});

test("validateConnectSessionRequest rejects missing providerConfigKey", () => {
  let caught;
  try {
    nangoSchema.validateConnectSessionRequest({ providerConfigKey: "" });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected throw");
  assert.equal(caught.code, "NANGO_INVALID_INPUT");
  assert.ok(caught.details.some((d) => d.includes("providerConfigKey")));
});

test("validateConnectionSummaryRequest requires both keys", () => {
  let caught;
  try {
    nangoSchema.validateConnectionSummaryRequest({ providerConfigKey: "hubspot" });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected throw");
  assert.ok(caught.details.some((d) => d.includes("connectionId")));
});

test("pickSafeConnectionFields strips credentials", () => {
  const safe = nangoAdapter.pickSafeConnectionFields({
    providerConfigKey: "hubspot-prod",
    connection_id: "acct-123",
    provider: "hubspot",
    environment: "prod",
    created_at: "2026-05-25T00:00:00Z",
    credentials: {
      type: "OAUTH2",
      access_token: "should-not-leak",
      refresh_token: "should-not-leak",
      expires_at: "2026-05-26T00:00:00Z"
    }
  });
  // Only safe fields present
  assert.equal(safe.providerConfigKey, "hubspot-prod");
  assert.equal(safe.connectionId, "acct-123");
  assert.equal(safe.credentialsType, "OAUTH2");
  assert.equal(safe.expiresAt, "2026-05-26T00:00:00Z");
  // No token-shaped fields anywhere in the projection
  const serialized = JSON.stringify(safe);
  assert.equal(serialized.includes("should-not-leak"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("refresh_token"), false);
});

test("createConnectSession throws NANGO_NOT_CONFIGURED when secret is missing", async () => {
  const prev = process.env.NANGO_SECRET_KEY;
  delete process.env.NANGO_SECRET_KEY;
  try {
    let caught;
    try {
      await nangoAdapter.createConnectSession({ providerConfigKey: "hubspot-prod" });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, "expected throw");
    assert.equal(caught.code, "NANGO_NOT_CONFIGURED");
  } finally {
    if (prev !== undefined) process.env.NANGO_SECRET_KEY = prev;
  }
});

test("getConnectionSummary throws NANGO_NOT_CONFIGURED when secret is missing", async () => {
  const prev = process.env.NANGO_SECRET_KEY;
  delete process.env.NANGO_SECRET_KEY;
  try {
    let caught;
    try {
      await nangoAdapter.getConnectionSummary({
        providerConfigKey: "hubspot-prod",
        connectionId: "acct-123"
      });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, "expected throw");
    assert.equal(caught.code, "NANGO_NOT_CONFIGURED");
  } finally {
    if (prev !== undefined) process.env.NANGO_SECRET_KEY = prev;
  }
});

test("registerNangoResolversFromConfig registers one resolver per nango row", () => {
  const ids = nangoConfigLoader.registerNangoResolversFromConfig({
    dataModel: {
      objects: [
        {
          id: "api-registry",
          label: "API Registry",
          objectType: "api-registry",
          columns: [],
          rows: [
            { integrationId: "ignored-http", connectorKind: "http" },
            {
              integrationId: "hubspot",
              connectorKind: "nango",
              providerConfigKey: "hubspot-prod",
              connectionIds: ["acct-123"],
              endpoint: "/crm/v3/objects/contacts"
            },
            {
              integrationId: "stripe",
              connectorKind: "nango",
              connectionIds: ["acct-stripe"],
              endpoint: "/v1/customers"
            }
          ]
        }
      ]
    }
  });
  assert.deepEqual(ids.sort(), ["hubspot", "stripe"]);
  const hubspot = resolverRegistry.getSourceResolver("hubspot");
  assert.ok(hubspot, "expected hubspot resolver to be registered");
  assert.equal(hubspot.connectorKind, "nango");
  assert.equal(hubspot.templateId, "nango");
  assert.equal(typeof hubspot.fetchRecords, "function");
  assert.equal(typeof hubspot.listEntities, "function");
  assert.equal(typeof hubspot.runAction, "function");
});
