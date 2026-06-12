#!/usr/bin/env node
/**
 * Unit coverage for the Browser / local agent fast lane run-input templates
 * (lib/sandbox-browser-run-inputs.js) and their compatibility with the
 * existing manual run-input contract (lib/orchestration-run-inputs.js).
 * Security probes first: secrets must never survive into an envelope,
 * a persisted record, or an inputSummary.
 *
 * Run with:  node --test scripts/unit-sandbox-browser-run-inputs.test.mjs
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
const {
  SANDBOX_BROWSER_RUN_TEMPLATES,
  SEND_MODES,
  buildBrowserRunInputsEnvelope,
  getBrowserRunInputTemplate,
  validateBrowserRunSafety,
} = await import(pathToFileURL(path.join(kitLib, "sandbox-browser-run-inputs.js")).href);
const {
  normalizeRunInputsEnvelope,
  summarizeRunInputs,
  validateRunInputsEnvelope,
} = await import(pathToFileURL(path.join(kitLib, "orchestration-run-inputs.js")).href);

// ---------------------------------------------------------------------------
// Security probes
// ---------------------------------------------------------------------------

test("credential-shaped field ids are rejected", () => {
  for (const key of ["apiKey", "token", "password", "sessionKey", "cookie", "access_token"]) {
    const v = validateBrowserRunSafety({ [key]: "anything" });
    assert.equal(v.ok, false, `${key} must be rejected`);
    assert.match(v.errors.join(" "), /credential-shaped/);
  }
});

test("token-shaped values are rejected even under safe field ids", () => {
  const v = validateBrowserRunSafety({ targetName: "Bearer abcdef1234567890abcdef" });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(" "), /token-shaped/);
});

test("envelope is never built when safety validation fails", () => {
  const { envelope, validation } = buildBrowserRunInputsEnvelope({
    templateId: "manual-browser-smoke",
    values: { lane: "x", clientName: "y", apiKey: "sk-test1234567890" },
  });
  assert.equal(envelope, null);
  assert.equal(validation.ok, false);
});

test("inputSummary of a built envelope carries field ids only — no values", () => {
  const { envelope } = buildBrowserRunInputsEnvelope({
    templateId: "manual-browser-smoke",
    values: { lane: "browser-smoke", clientName: "The Melting Bar", outputFormat: "docx" },
  });
  const normalized = normalizeRunInputsEnvelope(envelope, { fields: [] });
  const summary = summarizeRunInputs(normalized);
  assert.deepEqual(
    new Set(summary.fieldIds),
    new Set(["lane", "clientName", "outputFormat", "sendMode"]),
  );
  const flat = JSON.stringify(summary);
  assert.ok(!flat.includes("The Melting Bar"), "summary must not echo values");
});

// ---------------------------------------------------------------------------
// Operator-approval contract
// ---------------------------------------------------------------------------

test("externally mutating sendMode requires operatorApproved true", () => {
  const v = validateBrowserRunSafety({
    platform: "linkedin",
    sendMode: "operator-approved-action",
    operatorApproved: false,
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(" "), /operatorApproved/);
});

test("externally mutating sendMode requires an explicit target", () => {
  const v = validateBrowserRunSafety({ sendMode: "operator-approved-action", operatorApproved: true });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(" "), /explicit target/);
});

test("mutating sendMode with approval + target passes", () => {
  const v = validateBrowserRunSafety({
    sendMode: "operator-approved-action",
    operatorApproved: true,
    targetUrl: "https://example.com/page",
  });
  assert.equal(v.ok, true);
});

test("unknown sendMode normalizes to the read-only default in built envelopes", () => {
  const { envelope } = buildBrowserRunInputsEnvelope({
    templateId: "manual-browser-smoke",
    values: { lane: "x", clientName: "y", sendMode: "yolo-mode" },
  });
  assert.equal(envelope.values.sendMode, "read-only");
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

test("all four templates exist with the contract fields", () => {
  const ids = SANDBOX_BROWSER_RUN_TEMPLATES.map((t) => t.id);
  assert.deepEqual(ids, ["browser-research", "notebook-brief", "profile-review", "manual-browser-smoke"]);
  const profile = getBrowserRunInputTemplate("profile-review");
  assert.deepEqual(
    profile.fields.map((f) => f.id),
    ["platform", "profileUrl", "targetName", "interest", "sendMode", "operatorApproved"],
  );
  for (const t of SANDBOX_BROWSER_RUN_TEMPLATES) {
    assert.ok(!("execute" in t) && !("run" in t), "templates must not be executable");
  }
});

test("template defaults are safe: read-only/draft-only, operatorApproved never pre-approved", () => {
  for (const t of SANDBOX_BROWSER_RUN_TEMPLATES) {
    const sendMode = t.defaults?.sendMode;
    assert.ok(["read-only", "draft-only", undefined].includes(sendMode), `${t.id} defaults to a safe sendMode`);
    assert.notEqual(t.defaults?.operatorApproved, true, `${t.id} must not pre-approve external actions`);
  }
});

test("missing required template fields are reported", () => {
  const { envelope, validation } = buildBrowserRunInputsEnvelope({
    templateId: "browser-research",
    values: { platform: "medium" },
  });
  assert.equal(envelope, null);
  assert.ok(validation.missing.includes("targetName"));
  assert.ok(validation.missing.includes("targetUrl"));
  assert.ok(validation.missing.includes("researchGoal"));
  assert.ok(validation.missing.includes("operatorApproved"), "boolean required fields must be explicitly set");
});

// ---------------------------------------------------------------------------
// Contract compatibility with the existing run-input lane
// ---------------------------------------------------------------------------

test("built envelope is the exact growthub-workflow-run-inputs-v1 shape", () => {
  const { envelope } = buildBrowserRunInputsEnvelope({
    templateId: "notebook-brief",
    values: {
      notebookUrl: "https://notebooklm.google.com/notebook/n1",
      clientName: "The Melting Bar",
      sendMode: "read-only",
      operatorApproved: true,
    },
  });
  assert.equal(envelope.kind, "growthub-workflow-run-inputs-v1");
  assert.equal(envelope.source, "manual-browser-fastlane");
  assert.equal(envelope.values.platform, "notebooklm", "template default fills platform");
  assert.equal(envelope.values.operatorApproved, true, "booleans stay booleans");
  assert.deepEqual(envelope.files, []);

  const validation = validateRunInputsEnvelope(envelope, { fields: [] });
  assert.equal(validation.ok, true, "server-side validation accepts the envelope");
  const normalized = normalizeRunInputsEnvelope(envelope, { fields: [] });
  assert.equal(normalized.values.clientName, "The Melting Bar");
  assert.equal(normalized.source, "manual-browser-fastlane");
});

test("SEND_MODES enum is exactly the governed set", () => {
  assert.deepEqual([...SEND_MODES], ["read-only", "draft-only", "manual-review", "operator-approved-action"]);
});
