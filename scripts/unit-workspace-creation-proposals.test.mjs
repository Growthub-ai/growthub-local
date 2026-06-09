#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-creation-proposals.js")).href);

const { buildCreationProposalBundle, validateCreationBundle } = mod;

test("creation bundle includes api registry proposal", () => {
  const bundle = buildCreationProposalBundle({
    name: "LeadShark",
    integrationId: "leadshark",
    baseUrl: "https://api.example.com",
    endpoint: "/v1/leads",
    authRef: "leadshark",
    outputMode: "data-source",
  }, { LEADSHARK_API_KEY: "probe-token-never-serialize" });
  assert.equal(bundle.kind, "growthub-creation-proposal-bundle-v1");
  const types = bundle.proposals.map((p) => p.type);
  assert.ok(types.includes("creation.api-registry-row"));
  assert.ok(types.includes("creation.data-source-row"));
  assert.ok(types.includes("creation.resolver-file"));
  assert.equal(JSON.stringify(bundle).includes("probe-token-never-serialize"), false);
});

test("validateCreationBundle rejects invalid api row", () => {
  const bundle = buildCreationProposalBundle({ name: "x" }, {});
  const v = validateCreationBundle(bundle);
  assert.equal(v.ok, false);
});
