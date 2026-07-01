#!/usr/bin/env node
/**
 * Inbound input-method coverage (webhook / api-request) — the exact mirrors of
 * the serverless scheduler pattern:
 *
 *   - v1 HMAC webhook signature verification (destination-bound, body-bound,
 *     timestamped, constant-time) incl. every negative path,
 *   - api-request bearer/invoke-token verification incl. negatives,
 *   - request → inbound product resolution (proof material selects the method),
 *   - triggerKind/inputMode grammar and deterministic binding-id derivation,
 *   - catalog: growthub inbound products are inbound-invocation (never scheduler),
 *   - bind round-trip: withWorkflowServerlessBind(triggerKind) writes the row as
 *     a SERVERLESS execution (locality flip + adapter normalize) and syncs the
 *     trigger node's method inputMode; clear reverts to local + manual,
 *   - orchestration cores: runInputMethodInstall / runInputMethodUninstall
 *     (capability gate, env gate, readiness gate, ONE bind write, receipts,
 *     and NO outbound fetch — there is no remote infrastructure),
 *   - cockpit: bound webhook/api rows surface with method provider chips.
 *
 * Run with:  node --test scripts/unit-workspace-inbound-invocation.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const inbound = await import(pathToFileURL(path.join(kitLib, "workspace-inbound-invocation.js")).href);
const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const scheduler = await import(pathToFileURL(path.join(kitLib, "workspace-add-on-scheduler.js")).href);
const orchestration = await import(pathToFileURL(path.join(kitLib, "scheduler-orchestration.js")).href);
const cockpit = await import(pathToFileURL(path.join(kitLib, "schedule-cockpit-console.js")).href);

const DEST = "https://ws.example.com/api/workspace/workflows/growthub";
const SECRET = "whsec_test_secret";
const NOW_S = 1_700_000_000;

/* ================= webhook signature ================= */

test("webhook signature: valid v1 HMAC verifies (destination + body + timestamp bound)", () => {
  const rawBody = JSON.stringify({ kind: "growthub-invoked-run-v1", objectId: "o", rowId: "r" });
  const { signature, timestamp } = inbound.signInboundWebhook({ secret: SECRET, rawBody, destinationUrl: DEST, timestampS: NOW_S });
  const verdict = inbound.verifyInboundWebhookSignature({ signature, timestamp, rawBody, expectedUrl: DEST, secret: SECRET, currentTimeS: NOW_S + 5 });
  assert.deepEqual(verdict, { ok: true, reason: "verified" });
});

test("webhook signature: negatives — wrong secret / wrong destination / tampered body / stale / future / scheme / missing", () => {
  const rawBody = "{}";
  const { signature, timestamp } = inbound.signInboundWebhook({ secret: SECRET, rawBody, destinationUrl: DEST, timestampS: NOW_S });
  const base = { signature, timestamp, rawBody, expectedUrl: DEST, secret: SECRET, currentTimeS: NOW_S };
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, secret: "wrong" }).reason, "signature-mismatch");
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, expectedUrl: "https://ws.example.com/api/workspace/workflows/upstash" }).reason, "signature-mismatch");
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, rawBody: "{\"tampered\":true}" }).reason, "signature-mismatch");
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, currentTimeS: NOW_S + inbound.WEBHOOK_TIMESTAMP_TOLERANCE_S + 1 }).reason, "expired");
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, currentTimeS: NOW_S - inbound.WEBHOOK_TIMESTAMP_TOLERANCE_S - 1 }).reason, "not-yet-valid");
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, signature: signature.replace("v1=", "v2=") }).reason, "unsupported-scheme");
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, signature: "" }).reason, "missing-signature");
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, secret: "" }).reason, "no-signing-secret");
  assert.equal(inbound.verifyInboundWebhookSignature({ ...base, timestamp: "" }).reason, "missing-timestamp");
});

/* ================= api-request auth ================= */

test("api-request auth: bearer and x-growthub-api-key verify; negatives reject", () => {
  const ok1 = inbound.verifyApiRequestAuth({ authorization: "Bearer tok_123", expectedToken: "tok_123" });
  assert.deepEqual(ok1, { ok: true, reason: "verified" });
  const ok2 = inbound.verifyApiRequestAuth({ apiKeyHeader: "tok_123", expectedToken: "tok_123" });
  assert.equal(ok2.ok, true);
  assert.equal(inbound.verifyApiRequestAuth({ authorization: "Bearer nope", expectedToken: "tok_123" }).reason, "credential-mismatch");
  assert.equal(inbound.verifyApiRequestAuth({ expectedToken: "tok_123" }).reason, "missing-credentials");
  assert.equal(inbound.verifyApiRequestAuth({ authorization: "Bearer x", expectedToken: "" }).reason, "no-invoke-token");
});

/* ================= grammar + determinism ================= */

test("triggerKind/inputMode grammar and binding-id determinism mirror the scheduler", () => {
  assert.equal(inbound.triggerKindForLane("inbound-webhook"), "inbound-webhook");
  assert.equal(inbound.triggerKindForLane("api-request"), "api-request");
  assert.equal(inbound.inputModeForTriggerKind("inbound-webhook"), "webhook");
  assert.equal(inbound.inputModeForTriggerKind("api-request"), "api-request");
  assert.equal(inbound.inputModeForTriggerKind("serverless-scheduler"), "serverless-schedule");
  const args = { providerId: "growthub", workspaceId: "ws", objectId: "sandbox-workflows", rowId: "Flow A", version: "v1" };
  assert.equal(inbound.deriveBindingId(args), scheduler.deriveScheduleId(args));
  assert.equal(inbound.deriveBindingId(args), "growthub-growthub-ws-sandbox-workflows-flow-a-v1");
});

/* ================= catalog + product resolution ================= */

function growthubProvider() {
  return addOns.getMarketplaceProvider("growthub");
}

test("catalog: growthub inbound products are inbound-invocation products, never scheduler products", () => {
  const provider = growthubProvider();
  assert.ok(provider, "growthub provider is cataloged");
  assert.equal(provider.products.length, 2);
  for (const product of provider.products) {
    assert.equal(inbound.isInboundInvocationProduct(product), true, `${product.productId} is inbound`);
    assert.equal(scheduler.isSchedulerProduct(product), false, `${product.productId} is not a scheduler`);
    assert.ok(inbound.getInboundAdapter(product), `${product.productId} resolves an adapter`);
  }
  const qstash = addOns.getMarketplaceProduct("upstash", "upstash-qstash");
  assert.equal(inbound.isInboundInvocationProduct(qstash), false, "qstash stays a scheduler product");
});

test("request proof material selects the inbound product (signature wins over bearer)", () => {
  const provider = growthubProvider();
  const sigOnly = { "x-growthub-signature": "v1=abc", "x-growthub-timestamp": "1" };
  const bearerOnly = { authorization: "Bearer tok" };
  const both = { ...sigOnly, ...bearerOnly };
  assert.equal(inbound.resolveInboundProductForRequest(provider, sigOnly)?.productId, "growthub-webhook-trigger");
  assert.equal(inbound.resolveInboundProductForRequest(provider, bearerOnly)?.productId, "growthub-api-trigger");
  assert.equal(inbound.resolveInboundProductForRequest(provider, both)?.productId, "growthub-webhook-trigger");
  assert.equal(inbound.resolveInboundProductForRequest(provider, {}), null);
});

test("generic marketplace product row: env-ready growthub product row is verified (no region/remote fields)", () => {
  const row = addOns.makeMarketplaceProductRow({ providerId: "growthub", productId: "growthub-webhook-trigger", authReady: true });
  assert.equal(row.integrationId, "growthub-webhook-trigger");
  assert.equal(row.syncStatus, "verified");
  assert.equal(row.executionLane, "inbound-webhook");
  assert.equal(row.region, "");
  for (const value of Object.values(row)) {
    assert.ok(!String(value).includes(SECRET), "no secret value on the registry row");
  }
});

/* ================= bind round-trip ================= */

const GRAPH = JSON.stringify({
  version: 1, provider: "growthub-native",
  nodes: [
    { id: "input", type: "input", config: { inputMode: "manual" } },
    { id: "result", type: "tool-result", config: { writeLastResponse: false } },
  ],
  edges: [{ from: "input", to: "result" }],
});

function bindFixture() {
  return {
    id: "ws",
    dataModel: { objects: [
      { objectType: "api-registry", rows: [
        { integrationId: "growthub-webhook-trigger", productId: "growthub-webhook-trigger", executionLane: "inbound-webhook", syncStatus: "verified", syncProof: "env ok", syncCheckedAt: "t", Name: "Growthub Webhook Trigger" },
        { integrationId: "growthub-api-trigger", productId: "growthub-api-trigger", executionLane: "api-request", syncStatus: "verified", syncProof: "env ok", syncCheckedAt: "t", Name: "Growthub API Trigger" },
      ] },
      { id: "sandbox-workflows", objectType: "sandbox-environment", rows: [
        { Name: "Flow A", runLocality: "local", adapter: "local-agent-host", orchestrationConfig: GRAPH },
      ] },
    ] },
  };
}

test("bind round-trip: triggerKind=inbound-webhook flips the row to a SERVERLESS execution and syncs inputMode=webhook", () => {
  const bindingId = "growthub-growthub-ws-sandbox-workflows-flow-a-v1";
  const { config, bound } = addOns.withWorkflowServerlessBind(bindFixture(), {
    objectId: "sandbox-workflows", rowId: "Flow A",
    schedulerRegistryId: "growthub-webhook-trigger",
    schedulerProviderId: "growthub", schedulerProductId: "growthub-webhook-trigger",
    triggerKind: "inbound-webhook", scheduleId: bindingId, cron: "",
    destinationUrl: DEST, installedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(bound, true);
  const row = config.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  assert.equal(row.runLocality, "serverless", "inbound invocation IS a serverless execution");
  assert.equal(row.adapter, "local-process", "serverless adapter normalization applies to inbound methods");
  assert.equal(row.schedulerTriggerKind, "inbound-webhook");
  assert.equal(row.scheduleId, bindingId);
  assert.equal(row.schedulerCron, "");
  const node = JSON.parse(row.orchestrationConfig).nodes.find((n) => n.id === "input");
  assert.equal(node.config.trigger, "inbound-webhook");
  assert.equal(node.config.triggerKind, "inbound-webhook");
  assert.equal(node.config.inputMode, "webhook");
  assert.equal(node.config.schedule.scheduleId, bindingId);
  const binding = addOns.readTriggerScheduleBinding(row.orchestrationConfig);
  assert.equal(binding.triggerKind, "inbound-webhook");
  assert.equal(binding.scheduleId, bindingId);

  // clear reverts to local + manual (uninstall path)
  const { config: cleared } = addOns.withWorkflowServerlessBind(config, { objectId: "sandbox-workflows", rowId: "Flow A", clear: true });
  const clearedRow = cleared.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  assert.equal(clearedRow.runLocality, "local");
  assert.equal(clearedRow.schedulerTriggerKind, "");
  assert.equal(JSON.parse(clearedRow.orchestrationConfig).nodes.find((n) => n.id === "input").config.inputMode, "manual");
  assert.equal(addOns.readTriggerScheduleBinding(clearedRow.orchestrationConfig), null);
});

test("bind default stays the validated scheduler kind (no triggerKind param → serverless-scheduler)", () => {
  const { config } = addOns.withWorkflowServerlessBind(bindFixture(), {
    objectId: "sandbox-workflows", rowId: "Flow A",
    schedulerRegistryId: "upstash-qstash-workflow", scheduleId: "sid", cron: "0 * * * *",
  });
  const node = JSON.parse(config.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0].orchestrationConfig).nodes.find((n) => n.id === "input");
  assert.equal(node.config.triggerKind, "serverless-scheduler");
  assert.equal(node.config.inputMode, "serverless-schedule");
});

/* ================= orchestration cores ================= */

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function makeHarness(opts = {}) {
  let store = bindFixture();
  const calls = [];
  const receipts = [];
  const env = {
    GROWTHUB_WEBHOOK_SIGNING_SECRET: SECRET,
    GROWTHUB_API_INVOKE_TOKEN: "tok_invoke",
    GROWTHUB_WORKSPACE_PUBLIC_URL: "https://ws.example.com",
    ...(opts.env || {}),
  };
  const deps = {
    fetchImpl: async (url, init = {}) => { calls.push({ url, method: init?.method || "GET" }); return { ok: true, status: 200, text: async () => "{}" }; },
    readConfig: async () => clone(store),
    writeConfig: async (patch) => {
      if (opts.writeThrows) { const e = new Error("read-only"); e.code = "WORKSPACE_PERSISTENCE_READ_ONLY"; throw e; }
      store = { ...store, dataModel: patch.dataModel };
      return clone(store);
    },
    appendReceipt: async (r) => { receipts.push(r); return { receipt: { receiptId: `rcpt_${receipts.length}` } }; },
    env,
    now: () => "2026-01-01T00:00:00.000Z",
  };
  return { deps, calls, receipts, getStore: () => store, setStore: (s) => { store = s; } };
}

const INSTALL_BODY = { productId: "growthub-webhook-trigger", objectId: "sandbox-workflows", rowId: "Flow A", version: "v1", workspaceId: "ws" };

test("runInputMethodInstall: capability + env + readiness gates pass → ONE bind write, receipt, NO outbound fetch", async () => {
  const h = makeHarness();
  const res = await orchestration.runInputMethodInstall(h.deps, { providerId: "growthub", body: INSTALL_BODY });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.triggerKind, "inbound-webhook");
  assert.equal(res.body.bindingId, "growthub-growthub-ws-sandbox-workflows-flow-a-v1");
  assert.equal(res.body.destinationUrl, DEST);
  assert.equal(h.calls.length, 0, "no remote provider infrastructure for inbound methods");
  const row = h.getStore().dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  assert.equal(row.runLocality, "serverless");
  assert.equal(row.schedulerTriggerKind, "inbound-webhook");
  const published = h.receipts.find((r) => r.kind === "workspace-add-on-binding" && r.outcomeStatus === "published");
  assert.ok(published, "binding receipt published");
});

test("runInputMethodInstall: unverified product row → 409 capability gate (mirror of the scheduler gate)", async () => {
  const h = makeHarness();
  const store = h.getStore();
  store.dataModel.objects[0].rows[0].syncStatus = "missing-env";
  h.setStore(store);
  const res = await orchestration.runInputMethodInstall(h.deps, { providerId: "growthub", body: INSTALL_BODY });
  assert.equal(res.status, 409);
});

test("runInputMethodInstall: missing signing secret → 422 env gate", async () => {
  const h = makeHarness({ env: { GROWTHUB_WEBHOOK_SIGNING_SECRET: "" } });
  const res = await orchestration.runInputMethodInstall(h.deps, { providerId: "growthub", body: INSTALL_BODY });
  assert.equal(res.status, 422);
  assert.deepEqual(res.body.missingEnv, ["GROWTHUB_WEBHOOK_SIGNING_SECRET"]);
});

test("runInputMethodInstall: persist failure → 424 + failed receipt (no orphaned remote to roll back)", async () => {
  const h = makeHarness({ writeThrows: true });
  const res = await orchestration.runInputMethodInstall(h.deps, { providerId: "growthub", body: INSTALL_BODY });
  assert.equal(res.status, 424);
  assert.ok(h.receipts.some((r) => r.kind === "workspace-add-on-binding" && r.outcomeStatus === "failed"));
});

test("runInputMethodUninstall: clears the row + trigger node in one write, receipt published", async () => {
  const h = makeHarness();
  await orchestration.runInputMethodInstall(h.deps, { providerId: "growthub", body: INSTALL_BODY });
  const res = await orchestration.runInputMethodUninstall(h.deps, { providerId: "growthub", body: { productId: "growthub-webhook-trigger", objectId: "sandbox-workflows", rowId: "Flow A" } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = h.getStore().dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  assert.equal(row.runLocality, "local");
  assert.equal(row.scheduleId, "");
  assert.equal(JSON.parse(row.orchestrationConfig).nodes.find((n) => n.id === "input").config.inputMode, "manual");
});

/* ================= binding ownership (uninstall + door) ================= */

test("evaluateBindingMatch: cross-method and stale-binding mismatches are named rejections", () => {
  const provider = growthubProvider();
  const webhookProduct = addOns.getMarketplaceProduct("growthub", "growthub-webhook-trigger");
  const bindingId = "growthub-growthub-ws-sandbox-workflows-flow-a-v1";
  const { config } = addOns.withWorkflowServerlessBind(bindFixture(), {
    objectId: "sandbox-workflows", rowId: "Flow A",
    schedulerRegistryId: "growthub-webhook-trigger",
    schedulerProviderId: "growthub", schedulerProductId: "growthub-webhook-trigger",
    triggerKind: "inbound-webhook", scheduleId: bindingId, destinationUrl: DEST,
  });
  const row = config.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  const triggerBinding = addOns.readTriggerScheduleBinding(row.orchestrationConfig);
  const base = { row, triggerBinding, provider, product: webhookProduct, expectedTriggerKind: "inbound-webhook", scheduleId: bindingId };
  assert.equal(inbound.evaluateBindingMatch(base).ok, true);
  // wrong method for the same row (webhook-bound, api-request expected)
  const apiProduct = addOns.getMarketplaceProduct("growthub", "growthub-api-trigger");
  assert.equal(inbound.evaluateBindingMatch({ ...base, product: apiProduct, expectedTriggerKind: "api-request" }).ok, false);
  assert.equal(inbound.evaluateBindingMatch({ ...base, product: apiProduct, expectedTriggerKind: "api-request" }).code, "row_registry_mismatch");
  // stale/rebound binding id
  assert.equal(inbound.evaluateBindingMatch({ ...base, scheduleId: "growthub-growthub-ws-sandbox-workflows-flow-a-v2" }).code, "row_binding_id_mismatch");
  // scheduler-bound row, webhook expected
  const { config: schedCfg } = addOns.withWorkflowServerlessBind(bindFixture(), {
    objectId: "sandbox-workflows", rowId: "Flow A",
    schedulerRegistryId: "upstash-qstash-workflow", scheduleId: "sid", cron: "0 * * * *",
  });
  const schedRow = schedCfg.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  const schedBinding = addOns.readTriggerScheduleBinding(schedRow.orchestrationConfig);
  const verdict = inbound.evaluateBindingMatch({ row: schedRow, triggerBinding: schedBinding, provider, product: webhookProduct, expectedTriggerKind: "inbound-webhook", scheduleId: "sid" });
  assert.equal(verdict.ok, false, "webhook match must refuse a QStash-bound row");
});

test("runInputMethodUninstall: refuses to clear a QStash-bound row (no local/remote divergence)", async () => {
  const h = makeHarness();
  const store = h.getStore();
  const bound = addOns.withWorkflowServerlessBind(store, {
    objectId: "sandbox-workflows", rowId: "Flow A",
    schedulerRegistryId: "upstash-qstash-workflow",
    schedulerProviderId: "upstash", schedulerProductId: "upstash-qstash",
    scheduleId: "growthub-upstash-ws-sandbox-workflows-flow-a-v1", cron: "0 * * * *",
  });
  h.setStore(bound.config);
  const res = await orchestration.runInputMethodUninstall(h.deps, { providerId: "growthub", body: { productId: "growthub-webhook-trigger", objectId: "sandbox-workflows", rowId: "Flow A" } });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  const row = h.getStore().dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  assert.equal(row.runLocality, "serverless", "QStash-bound row stays bound");
  assert.equal(row.scheduleId, "growthub-upstash-ws-sandbox-workflows-flow-a-v1");
  assert.ok(h.receipts.some((r) => r.kind === "workspace-add-on-binding" && r.outcomeStatus === "blocked"), "refusal is receipted");
});

test("runInputMethodUninstall: refuses to clear the OTHER inbound method's binding", async () => {
  const h = makeHarness();
  await orchestration.runInputMethodInstall(h.deps, { providerId: "growthub", body: INSTALL_BODY }); // webhook bind
  const res = await orchestration.runInputMethodUninstall(h.deps, { providerId: "growthub", body: { productId: "growthub-api-trigger", objectId: "sandbox-workflows", rowId: "Flow A" } });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  const row = h.getStore().dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  assert.equal(row.schedulerTriggerKind, "inbound-webhook", "webhook binding survives an api-trigger uninstall attempt");
});

/* ================= duplicate-delivery guard ================= */

test("registerInboundDelivery: retry of the same signed bytes is a duplicate; new body/timestamp/expiry are not", () => {
  inbound.resetInboundDeliveryCache();
  const base = { bindingId: "b1", rawBody: "{\"a\":1}", timestamp: "1700000000", currentTimeS: NOW_S };
  assert.equal(inbound.registerInboundDelivery(base).duplicate, false, "first delivery executes");
  assert.equal(inbound.registerInboundDelivery(base).duplicate, true, "byte-identical retry is acknowledged, not re-executed");
  assert.equal(inbound.registerInboundDelivery({ ...base, rawBody: "{\"a\":2}" }).duplicate, false, "different body is a new delivery");
  assert.equal(inbound.registerInboundDelivery({ ...base, timestamp: "1700000001" }).duplicate, false, "different timestamp is a new delivery");
  // entry expires after the replay window
  assert.equal(inbound.registerInboundDelivery({ ...base, currentTimeS: NOW_S + inbound.WEBHOOK_TIMESTAMP_TOLERANCE_S * 2 + 1 }).duplicate, false, "expired entry does not dedupe");
  // caller idempotency key scopes the dedupe regardless of body
  inbound.resetInboundDeliveryCache();
  assert.equal(inbound.registerInboundDelivery({ bindingId: "b1", idempotencyKey: "k1", rawBody: "x", currentTimeS: NOW_S }).duplicate, false);
  assert.equal(inbound.registerInboundDelivery({ bindingId: "b1", idempotencyKey: "k1", rawBody: "y", currentTimeS: NOW_S }).duplicate, true, "same idempotency key dedupes across bodies");
  assert.equal(inbound.registerInboundDelivery({ bindingId: "b2", idempotencyKey: "k1", rawBody: "y", currentTimeS: NOW_S }).duplicate, false, "key is scoped per binding");
  inbound.resetInboundDeliveryCache();
});

/* ================= run-input contract gate ================= */

test("run-input contract: oversized / over-count envelopes are rejected before execution", async () => {
  const runInputsMod = await import(pathToFileURL(path.join(kitLib, "orchestration-run-inputs.js")).href);
  const schema = runInputsMod.discoverRunInputSchema(GRAPH);
  const tooMany = { kind: "growthub-workflow-run-inputs-v1", source: "api-request", values: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, "v"])) };
  assert.equal(runInputsMod.validateRunInputsEnvelope(tooMany, schema).ok, false, "over-count rejected");
  const oversized = { kind: "growthub-workflow-run-inputs-v1", source: "api-request", values: { big: "x".repeat(8 * 1024 + 1) } };
  assert.equal(runInputsMod.validateRunInputsEnvelope(oversized, schema).ok, false, "oversized field rejected");
  const fine = { kind: "growthub-workflow-run-inputs-v1", source: "api-request", values: { note: "ok" } };
  assert.equal(runInputsMod.validateRunInputsEnvelope(fine, schema).ok, true, "small valid envelope passes");
});

/* ================= mixed proof material ================= */

test("mixed proof: a bad webhook signature with a valid bearer still resolves as webhook (no silent downgrade)", () => {
  const provider = growthubProvider();
  const headers = { "x-growthub-signature": "v1=deadbeef", "x-growthub-timestamp": String(NOW_S), authorization: "Bearer tok_invoke" };
  const product = inbound.resolveInboundProductForRequest(provider, headers);
  assert.equal(product?.productId, "growthub-webhook-trigger", "signature material selects the webhook method");
  const adapter = inbound.getInboundAdapter(product);
  const verdict = adapter.verifyInbound({ headers, rawBody: "{}", expectedUrl: DEST, env: { GROWTHUB_WEBHOOK_SIGNING_SECRET: SECRET }, currentTimeS: NOW_S });
  assert.equal(verdict.ok, false, "the bad signature is rejected as a webhook — the valid bearer does not rescue it");
});

/* ================= cockpit visibility ================= */

test("cockpit: a bound webhook workflow surfaces with the Webhook method chip and scheduled state", async () => {
  const h = makeHarness();
  await orchestration.runInputMethodInstall(h.deps, { providerId: "growthub", body: INSTALL_BODY });
  const vm = cockpit.deriveScheduleCockpit({ workspaceConfig: h.getStore(), configuredEnvRefs: [], receipts: [] });
  assert.ok(vm.installedSchedulerProducts.some((p) => p.method === "inbound-webhook" && p.provider === "Webhook"), "webhook product detected as a binding capability");
  const card = vm.workflowCards.find((c) => c.name === "Flow A");
  assert.ok(card, "bound workflow has a cockpit card");
  assert.equal(card.locality, "serverless");
  assert.equal(card.provider, "Webhook");
  assert.ok(["scheduled", "drifted"].includes(card.state), `bound state is scheduled/drifted (got ${card.state})`);
  assert.ok(vm.filters.some((f) => f.id === "webhook"), "Method: Webhook filter present");
});
