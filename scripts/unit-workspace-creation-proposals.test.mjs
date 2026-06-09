#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-creation-proposals.js")).href);
const { buildCreationProposalBundle, validateCreationDraft } = mod;

const draft = {
  name: "LeadShark",
  integrationId: "leadshark",
  baseUrl: "https://api.leadshark.test",
  endpoint: "/v1/leads",
  method: "GET",
  authMode: "api-key",
  authRef: "leadshark",
  outputMode: "data-source",
};

test("creation proposals — builds api registry + data source bundle", () => {
  const bundle = buildCreationProposalBundle(draft, { dataModel: { objects: [] } }, { LEADSHARK_API_KEY: "x" });
  assert.equal(bundle.kind, "growthub-creation-proposal-bundle-v1");
  assert.ok(bundle.proposals.some((p) => p.type === "creation.api-registry-row"));
  assert.ok(bundle.proposals.some((p) => p.type === "creation.data-source-row"));
  assert.equal(bundle.validation.ok, true);
});

test("creation proposals — warns on missing env", () => {
  const result = validateCreationDraft(draft, { dataModel: { objects: [] } }, {});
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes("leadshark")));
});

test("creation proposals — never includes secret values", () => {
  const bundle = buildCreationProposalBundle(draft, { dataModel: { objects: [] } }, { LEADSHARK_API_KEY: "top-secret" });
  const text = JSON.stringify(bundle);
  assert.equal(text.includes("top-secret"), false);
});
