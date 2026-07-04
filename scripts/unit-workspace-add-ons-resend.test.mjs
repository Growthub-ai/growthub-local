#!/usr/bin/env node
/**
 * Unit coverage for the official Resend marketplace provider (V1):
 *   - provider/product identity + messaging-lane grammar (workspace-messaging)
 *   - bearer accountProbe contract incl. the offline-QA baseUrlEnv override
 *   - authRef "RESEND" resolves the concrete RESEND_API_KEY through the
 *     canonical readServerSecret candidate expansion (no alias needed)
 *   - env readiness through the canonical readEnvVar contract (injected env)
 *   - generic product registry row build + upsert round-trip
 *   - deriveWorkspaceAddOnsState lane-driven messaging capability
 *   - secret rule: rows carry env-ref NAMES only, never values
 *   - /settings/apps source truth: the messaging-lane link builder derives
 *     from governed rows and the one provider definition
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-workspace-add-ons-resend.test.mjs
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

const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const serverSecrets = await import(pathToFileURL(path.join(kitLib, "server-secrets.js")).href);

const {
  RESEND_PRODUCTS,
  RESEND_PROVIDER_INTEGRATION_ID,
  RESEND_EMAIL_INTEGRATION_ID,
  WORKSPACE_MESSAGING_LANE,
  deriveWorkspaceAddOnsState,
  getMarketplaceProvider,
  getMarketplaceProduct,
  listInstalledMessagingProducts,
  listProviderProductReadiness,
  makeMarketplaceProductRow,
  makeMarketplaceProviderRow,
  withMarketplaceProductRegistry,
} = addOns;

const SECRET = "re_test_placeholder_not_a_real_secret";

function emptyConfig() {
  return { dataModel: { objects: [] } };
}

test("resend provider registers with the canonical marketplace identity", () => {
  const provider = getMarketplaceProvider("resend");
  assert.ok(provider, "resend provider must resolve by providerId");
  assert.equal(provider.integrationId, RESEND_PROVIDER_INTEGRATION_ID);
  assert.equal(provider.authRef, "RESEND");
  assert.equal(provider.executionLane, "workspace-provider");
  assert.equal(provider.accountProbe?.authMode, "bearer");
  assert.equal(provider.accountProbe?.tokenEnv, "RESEND_API_KEY");
  assert.equal(provider.accountProbe?.baseUrlEnv, "RESEND_API_URL", "offline-QA base override declared");
  assert.deepEqual(provider.accountProbe?.paths, ["/domains"]);
  const fieldsById = Object.fromEntries(provider.accountSetupFields.map((field) => [field.id, field]));
  assert.equal(fieldsById.apiKey.credentialRole, "bearerToken");
  assert.equal(fieldsById.apiKey.type, "password", "secret-bearing field renders as password");
  assert.equal(getMarketplaceProvider(RESEND_PROVIDER_INTEGRATION_ID)?.providerId, "resend");
});

test("authRef RESEND resolves the concrete key through canonical expansion", () => {
  const candidates = serverSecrets.envKeyCandidates("RESEND");
  assert.ok(candidates.includes("RESEND_API_KEY"), `RESEND_API_KEY in ${candidates}`);
  const hit = serverSecrets.readServerSecret("RESEND", { RESEND_API_KEY: SECRET });
  assert.equal(hit?.key, "RESEND_API_KEY");
});

test("resend-email product declares the messaging lane grammar", () => {
  const product = getMarketplaceProduct("resend", "resend-email");
  assert.ok(product, "resend-email resolves");
  assert.equal(product.integrationId, RESEND_EMAIL_INTEGRATION_ID);
  assert.equal(product.authRef, "RESEND");
  assert.equal(product.connectorKind, "resend-messaging");
  assert.equal(product.executionLane, WORKSPACE_MESSAGING_LANE);
  assert.equal(WORKSPACE_MESSAGING_LANE, "workspace-messaging");
  assert.deepEqual(product.requiredEnv, ["RESEND_API_KEY"]);
  assert.ok(product.optionalEnv.includes("RESEND_FROM_EMAIL"));
  assert.ok(!["inbound-webhook", "api-request", "serverless-scheduler"].includes(product.executionLane));
  // Probe: real Resend REST endpoint + offline-QA override + public fallback.
  assert.equal(product.probe.baseUrlEnv, "RESEND_API_URL");
  assert.equal(product.probe.tokenEnv, "RESEND_API_KEY");
  assert.deepEqual(product.probe.paths, ["/domains"]);
  assert.equal(product.probe.fallbackBaseUrl, "https://api.resend.com");
});

test("bearer resourceDiscovery lists sending domains without env writes", () => {
  const product = getMarketplaceProduct("resend", "resend-email");
  const discovery = product.resourceDiscovery;
  assert.equal(discovery.auth, "provider-bearer");
  assert.deepEqual(discovery.paths, ["/domains"]);
  assert.deepEqual(discovery.envFromResource, []);
});

test("readiness resolves through the canonical concrete-key env contract", () => {
  const missing = listProviderProductReadiness("resend", {});
  assert.equal(missing.length, RESEND_PRODUCTS.length);
  assert.equal(missing[0].configured, false);
  assert.deepEqual(missing[0].missingEnv, ["RESEND_API_KEY"]);

  const ready = listProviderProductReadiness("resend", {
    RESEND_API_KEY: SECRET,
    RESEND_FROM_EMAIL: "hello@growthub.example",
  });
  assert.equal(ready[0].configured, true);
  assert.deepEqual(ready[0].missingEnv, []);
  assert.deepEqual(ready[0].configuredOptionalEnv, ["RESEND_FROM_EMAIL"]);
});

test("generic product row builds with refs only and upserts idempotently", () => {
  const syncResult = {
    ok: true,
    testedAt: "2026-07-04T00:00:00.000Z",
    baseUrl: "https://api.resend.com",
    proof: "Resend Email probe /domains returned HTTP 200",
    summary: "Resend Email sync verified with a read-only REST probe (/domains).",
    resolvedEnv: ["RESEND_API_KEY"],
    selectedResourceId: "dom_1",
    selectedResourceLabel: "growthub.example",
    selectedResourceSource: "/domains",
  };
  const row = makeMarketplaceProductRow({ providerId: "resend", productId: "resend-email", syncResult });
  assert.equal(row.integrationId, RESEND_EMAIL_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.status, "connected");
  assert.equal(row.executionLane, WORKSPACE_MESSAGING_LANE);
  assert.equal(row.selectedResourceLabel, "growthub.example");
  const rowText = JSON.stringify(row);
  assert.ok(!rowText.includes(SECRET), "row must not embed secret values");
  assert.ok(row.requiredEnv.includes("RESEND_API_KEY"), "row carries env-ref NAMES");

  const first = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "resend",
    productId: "resend-email",
    syncResult,
  });
  const registry = first.dataModel.objects.find((o) => o.objectType === "api-registry");
  assert.equal(registry.rows.filter((r) => r.integrationId === RESEND_EMAIL_INTEGRATION_ID).length, 1);

  const second = withMarketplaceProductRegistry(first, {
    providerId: "resend",
    productId: "resend-email",
    syncResult: { ...syncResult, summary: "re-synced" },
  });
  const registry2 = second.dataModel.objects.find((o) => o.objectType === "api-registry");
  const rows = registry2.rows.filter((r) => r.integrationId === RESEND_EMAIL_INTEGRATION_ID);
  assert.equal(rows.length, 1, "upsert is idempotent by integrationId");
  assert.equal(rows[0].lastResponse, "re-synced");
});

test("deriveWorkspaceAddOnsState derives the lane-driven messaging capability", () => {
  const syncResult = { ok: true, testedAt: "2026-07-04T00:00:00.000Z", proof: "probe ok", summary: "verified" };
  const config = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "resend",
    productId: "resend-email",
    syncResult,
  });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasResendMessagingCapability, true);
  assert.equal(state.hasWorkspaceMessagingCapability, true);
  assert.equal(state.resendMessaging.integrationId, RESEND_EMAIL_INTEGRATION_ID);
  assert.deepEqual(listInstalledMessagingProducts(config).map((r) => r.productId), ["resend-email"]);
  assert.equal(state.hasWorkspaceCommerceCapability, false);
  assert.equal(state.hasWorkspaceDataCapability, false);
});

test("unverified rows never grant the messaging capability", () => {
  const config = withMarketplaceProductRegistry(emptyConfig(), {
    providerId: "resend",
    productId: "resend-email",
    syncResult: null,
    authReady: false,
  });
  const state = deriveWorkspaceAddOnsState(config);
  assert.equal(state.hasResendMessagingCapability, false);
  assert.equal(state.hasWorkspaceMessagingCapability, false);
  assert.equal(listInstalledMessagingProducts(config).length, 0);
});

test("provider row builds from the bearer accountProbe env contract", () => {
  const row = makeMarketplaceProviderRow("resend", {
    syncResult: {
      ok: true,
      testedAt: "2026-07-04T00:00:00.000Z",
      proof: "Resend REST API account verified (GET /domains -> HTTP 200).",
      summary: "verified",
      resolvedEnv: ["RESEND_API_KEY"],
      providerAccountOptions: [{ id: "dom_1", label: "growthub.example", source: "/domains" }],
      selectedProviderAccountId: "dom_1",
      selectedProviderAccountLabel: "growthub.example",
      providerAccountSource: "/domains",
    },
  });
  assert.equal(row.integrationId, RESEND_PROVIDER_INTEGRATION_ID);
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.requiredEnv, "RESEND_API_KEY");
  assert.ok(!JSON.stringify(row).includes(SECRET), "provider row must not embed token values");
});

// ---------------------------------------------------------------------------
// First-party canvas node (resend-email) — graph contract + source truth.
// ---------------------------------------------------------------------------

test("resend-email is a known capability node with a working extractor", async () => {
  const graphLib = await import(pathToFileURL(path.join(kitLib, "orchestration-graph.js")).href);
  assert.ok(graphLib.CAPABILITY_NODE_TYPES.includes("resend-email"));
  const graph = {
    provider: "growthub-native",
    version: 1,
    nodes: [
      { id: "input", type: "input", config: {} },
      { id: "email", type: "resend-email", config: { registryId: "resend-email", toTemplate: "{{input.email}}", subjectTemplate: "Hi" } },
      { id: "result", type: "tool-result", config: {} },
    ],
    edges: [{ from: "input", to: "email" }, { from: "email", to: "result" }],
  };
  const node = graphLib.extractResendEmailNode(graph);
  assert.equal(node?.config?.toTemplate, "{{input.email}}");
  const verdict = graphLib.validateOrchestrationGraph(graph);
  assert.equal(verdict.ok, true, `resend-email satisfies the executable-node rule: ${JSON.stringify(verdict.errors || [])}`);
});

test("runner send discipline: required fields + server-side sender fallback", async () => {
  const { readFileSync } = await import("node:fs");
  const runnerSource = readFileSync(path.join(kitLib, "orchestration-graph-runner.js"), "utf8");
  assert.ok(runnerSource.includes("executeResendEmail"), "dedicated executor present");
  assert.ok(runnerSource.includes("resend-email requires To, Subject, and an HTML or text body"), "honest refusal when the send is underspecified");
  assert.ok(runnerSource.includes('readEnvVar("RESEND_FROM_EMAIL")'), "sender falls back to the env ref server-side (no-code)");
  assert.ok(runnerSource.includes("recipientCount"), "adapterMeta carries counts, never message bodies");
  const surfaceSource = readFileSync(path.join(kitLib, "..", "app/workflows/WorkflowSurface.jsx"), "utf8");
  assert.ok(surfaceSource.includes('iconSrc: "/integrations/resend/email.png"'), "palette entry uses the product badge as its icon");
  const canvasSource = readFileSync(path.join(kitLib, "..", "app/data-model/components/OrchestrationGraphCanvas.jsx"), "utf8");
  assert.ok(canvasSource.includes('"resend-email": "/integrations/resend/email.png"'), "canvas chip renders the product badge");
  assert.ok(canvasSource.includes('"stripe-commerce": "/integrations/stripe/payments.png"'), "canvas chip renders the product badge");
});

// ---------------------------------------------------------------------------
// Governed messaging door + rich sidecar experience — source truth.
// ---------------------------------------------------------------------------

test("messaging door: one receipted send-test per call, honest gates", async () => {
  const { readFileSync } = await import("node:fs");
  const doorSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/[providerId]/messaging/route.js"),
    "utf8",
  );
  assert.ok(doorSource.includes('"resend-messaging"'), "connector-kind adapter gate");
  assert.ok(doorSource.includes("no messaging adapter yet"), "unknown kinds refused honestly");
  assert.ok(doorSource.includes("workspace-add-on-messaging"), "receipt kind follows the workspace-add-on-* class");
  assert.ok(doorSource.includes("requireWorkspaceOperator"), "operator-gated like every governed door");
  assert.ok(doorSource.includes("findMarketplaceProviderRow"), "connect gate derives from the governed provider row");
  assert.ok(doorSource.includes('outcomeStatus: "blocked"'), "blocked outcomes are receipted too");
  assert.ok(doorSource.includes("RESEND_FROM_EMAIL"), "sender resolves from the env ref server-side");
  assert.ok(!doorSource.includes("RESEND_API_KEY ="), "no secret value assignment in the door");
});

test("resend sidecar ships the webhook-mirror test pane + Design/HTML editor", async () => {
  const { readFileSync } = await import("node:fs");
  const panelSource = readFileSync(
    path.join(kitLib, "..", "app/data-model/components/OrchestrationNodeConfigPanel.jsx"),
    "utf8",
  );
  assert.ok(panelSource.includes("ResendEmailTestPane"), "dedicated test pane for the resend-email node");
  assert.ok(panelSource.includes("Send test email"), "real send CTA (webhook 'Generate Test Event' mirror)");
  assert.ok(panelSource.includes("/api/workspace/add-ons/resend/messaging"), "test pane drives the governed messaging door");
  assert.ok(panelSource.includes("Verified {result?.httpStatus || config.lastTestStatus}"), "Verified chip derives from the real HTTP outcome");
  assert.ok(panelSource.includes("lastTestStatus"), "proof stamps onto the draft node config");
  assert.ok(panelSource.includes("EmailBodyEditor"), "rich email body editor present");
  assert.ok(panelSource.includes(">Design<") && /aria-selected=\{mode === "html"\}/.test(panelSource), "Design + HTML tab options");
  assert.ok(panelSource.includes("contentEditable"), "design surface is a rich-text editor");
  assert.ok(panelSource.includes('type === "resend-email" && ('), "test tab routes to the resend pane by node type");
});

// ---------------------------------------------------------------------------
// /settings/apps governed link surface — source truth.
// ---------------------------------------------------------------------------

test("settings/apps derives the messaging-lane external link from governed rows", async () => {
  const { readFileSync } = await import("node:fs");
  const appsPageSource = readFileSync(path.join(kitLib, "..", "app/settings/apps/page.jsx"), "utf8");
  assert.ok(appsPageSource.includes("listInstalledMessagingProducts(workspaceConfig)"), "installed+verified rule reused from the marketplace lane");
  assert.ok(appsPageSource.includes("messagingProductLink"), "messaging-lane link builder present");
  assert.ok(!appsPageSource.includes("RESEND_API_KEY"), "no secret env names hardcoded into the page");
});
