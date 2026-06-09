#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-creation-proposals.js")).href);

const {
  buildCreationProposalBundle,
  hydrateCreationProposalsForConfig,
  validateCreationProposalBundle,
  validateResolverTargetPath,
} = mod;

const emptyConfig = { dataModel: { objects: [] } };

test("buildCreationProposalBundle — api + resolver + data source", () => {
  const bundle = buildCreationProposalBundle({
    name: "LeadShark",
    integrationId: "leadshark",
    baseUrl: "https://api.leadshark.io",
    endpoint: "/v1/leads",
    authRef: "leadshark",
    outputMode: "data-source",
    generateResolver: true,
  });
  assert.equal(bundle.kind, "growthub-creation-proposal-bundle-v1");
  assert.ok(bundle.proposals.length >= 3);
  assert.ok(bundle.proposals.some((p) => p.type === "resolver.file.write"));
  assert.equal(validateCreationProposalBundle(bundle).valid, true);
});

test("hydrateCreationProposalsForConfig — inserts object.create when missing", () => {
  const hydrated = hydrateCreationProposalsForConfig(emptyConfig, {
    name: "LeadShark",
    baseUrl: "https://api.example.com",
    authRef: "leadshark",
    outputMode: "data-source",
    generateResolver: true,
  });
  assert.ok(hydrated.proposals.some((p) => p.type === "dataModel.object.create"));
  const row = hydrated.proposals.find((p) => p.type === "dataModel.row.add" && p.payload?.objectType === "api-registry");
  assert.ok(row?.payload?.objectId);
});

test("validateResolverTargetPath — refuses traversal", () => {
  assert.equal(validateResolverTargetPath("../evil.js").valid, false);
  assert.equal(validateResolverTargetPath("lib/adapters/integrations/resolvers/ok.js").valid, true);
});

test("validateCreationProposalBundle — rejects inlined secrets in resolver code", () => {
  const bundle = buildCreationProposalBundle({
    name: "Bad",
    baseUrl: "https://x.com",
    outputMode: "data-source",
    generateResolver: true,
    resolverCode: 'const api_key = "sk_live_bad"',
  });
  const resolver = bundle.proposals.find((p) => p.type === "resolver.file.write");
  resolver.payload.code = 'const api_key = "sk_live_bad"';
  assert.equal(validateCreationProposalBundle({ ...bundle, proposals: [resolver] }).valid, false);
});
