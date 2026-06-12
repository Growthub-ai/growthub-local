#!/usr/bin/env node
/**
 * Unit coverage for the browser run-input templates
 * (lib/sandbox-browser-run-inputs.js) and their integration with the
 * EXISTING manual run-input contract (lib/orchestration-run-inputs.js):
 * template normalization, operator-approval gating, secret rejection, and
 * receipt inputSummary safety (field ids only — never values).
 *
 * Run with:  node --test scripts/unit-sandbox-browser-run-inputs.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BROWSER_SMOKE_GRAPH, BROWSER_SMOKE_RUN_INPUTS } from "./lib/workspace-feature-seed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);
const templatesMod = await import(pathToFileURL(path.join(kitLib, "sandbox-browser-run-inputs.js")).href);
const runInputsMod = await import(pathToFileURL(path.join(kitLib, "orchestration-run-inputs.js")).href);

const {
  SEND_MODES,
  buildBrowserRunInputsEnvelope,
  buildTemplateDefaults,
  listBrowserRunInputTemplates,
  sendModeRequiresOperatorApproval,
  validateBrowserRunInputValues,
} = templatesMod;
const {
  discoverRunInputSchema,
  normalizeRunInputsEnvelope,
  summarizeRunInputs,
  validateRunInputsEnvelope,
  buildInputPayloadForRunner,
} = runInputsMod;

test("template catalog ships the four browser-safe templates", () => {
  const ids = listBrowserRunInputTemplates().map((t) => t.id);
  assert.deepEqual(ids, ["browser-research", "notebook-brief", "profile-review", "manual-browser-smoke"]);
});

test("notebook-brief defaults — platform pinned, sendMode read-only, approval off", () => {
  const defaults = buildTemplateDefaults("notebook-brief");
  assert.equal(defaults.platform, "notebooklm");
  assert.equal(defaults.sendMode, "read-only");
  assert.equal(defaults.operatorApproved, false);
});

test("missing required template inputs reported, including operatorApproved", () => {
  const check = validateBrowserRunInputValues("profile-review", { platform: "linkedin" });
  assert.equal(check.ok, false);
  assert.ok(check.missing.includes("profileUrl"));
  assert.ok(check.missing.includes("targetName"));
  assert.ok(check.missing.includes("operatorApproved"));
});

test("mutating sendMode requires operatorApproved", () => {
  assert.equal(sendModeRequiresOperatorApproval("operator-approved-action"), true);
  assert.equal(sendModeRequiresOperatorApproval("read-only"), false);
  const check = validateBrowserRunInputValues("profile-review", {
    platform: "linkedin",
    profileUrl: "https://www.linkedin.com/in/example",
    targetName: "Example",
    sendMode: "operator-approved-action",
    operatorApproved: false,
  });
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => /operatorApproved must be true/.test(e)));
});

test("invalid sendMode rejected", () => {
  const check = validateBrowserRunInputValues("profile-review", {
    platform: "linkedin",
    profileUrl: "https://www.linkedin.com/in/example",
    targetName: "Example",
    sendMode: "auto-blast",
    operatorApproved: true,
  });
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => e.includes(SEND_MODES.join(", "))));
});

test("secret-shaped field ids rejected by validation and stripped from envelopes", () => {
  const check = validateBrowserRunInputValues("manual-browser-smoke", {
    lane: "x", clientName: "y", apiKey: "sk-123", sessionKey: "abc",
  });
  assert.equal(check.ok, false);
  assert.equal(check.errors.filter((e) => /credential/.test(e)).length, 2);

  const envelope = buildBrowserRunInputsEnvelope({
    templateId: "manual-browser-smoke",
    values: { lane: "x", clientName: "y", token: "tok_123", cookie: "session=1" },
  });
  assert.ok(!("token" in envelope.values));
  assert.ok(!("cookie" in envelope.values));
  assert.equal(envelope.values.lane, "x");
});

test("envelope shape matches the existing run-inputs contract exactly", () => {
  const envelope = buildBrowserRunInputsEnvelope({
    templateId: "profile-review",
    values: {
      platform: "linkedin",
      profileUrl: "https://www.linkedin.com/in/example",
      targetName: "Example",
      interest: "growth",
      sendMode: "draft-only",
      operatorApproved: true,
    },
    source: "manual",
  });
  assert.equal(envelope.kind, "growthub-workflow-run-inputs-v1");
  assert.equal(envelope.source, "manual");
  assert.equal(envelope.values.operatorApproved, true);
  assert.deepEqual(envelope.files, []);
});

test("seed graph schema validates the smoke envelope end to end", () => {
  const schema = discoverRunInputSchema(JSON.stringify(BROWSER_SMOKE_GRAPH));
  assert.equal(schema.requiresInput, true);

  const missingCheck = validateRunInputsEnvelope({ kind: schema.kind, source: "manual", values: {} }, schema);
  assert.ok(missingCheck.missing.includes("platform"));
  assert.ok(missingCheck.missing.includes("operatorApproved"));

  const fullCheck = validateRunInputsEnvelope(BROWSER_SMOKE_RUN_INPUTS, schema);
  assert.equal(fullCheck.ok, true);
  assert.deepEqual(fullCheck.missing, []);
});

test("inputSummary carries field ids only — never values, never secrets", () => {
  const schema = discoverRunInputSchema(JSON.stringify(BROWSER_SMOKE_GRAPH));
  const normalized = normalizeRunInputsEnvelope(BROWSER_SMOKE_RUN_INPUTS, schema);
  const summary = summarizeRunInputs(normalized);
  assert.equal(summary.source, "manual-smoke");
  assert.equal(summary.fieldCount, 6);
  assert.deepEqual(
    [...summary.fieldIds].sort(),
    ["interest", "operatorApproved", "platform", "profileUrl", "sendMode", "targetName"],
  );
  const flat = JSON.stringify(summary);
  assert.ok(!flat.includes("The Melting Bar"));
  assert.ok(!flat.includes("notebooklm"));
});

test("secret-named values are redacted before the runner payload", () => {
  const schema = discoverRunInputSchema(JSON.stringify(BROWSER_SMOKE_GRAPH));
  const normalized = normalizeRunInputsEnvelope(
    { kind: schema.kind, source: "manual", values: { ...BROWSER_SMOKE_RUN_INPUTS.values, token: "tok_real" } },
    schema,
  );
  assert.ok(!JSON.stringify(normalized).includes("tok_real"));
  const payload = buildInputPayloadForRunner(normalized);
  assert.ok(!("token" in payload));
  assert.equal(payload.platform, "notebooklm");
  assert.equal(payload.operatorApproved, true);
});
