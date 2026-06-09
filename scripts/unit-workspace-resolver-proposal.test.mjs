#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-resolver-proposal.js")).href);
const { validateResolverTargetPath, buildResolverFileProposal } = mod;

test("resolver proposal — refuses path traversal", () => {
  const result = validateResolverTargetPath("../secrets/evil.js");
  assert.equal(result.ok, false);
});

test("resolver proposal — accepts approved directory", () => {
  const result = validateResolverTargetPath("lib/adapters/integrations/resolvers/leadshark.js");
  assert.equal(result.ok, true);
  assert.equal(result.filename, "leadshark.js");
});

test("resolver proposal — generated code has no inline secret", () => {
  const proposal = buildResolverFileProposal({
    integrationId: "leadshark",
    baseUrl: "https://api.example.com",
    authRef: "leadshark",
    outputMode: "data-source",
  });
  assert.ok(proposal.code.includes("registerSourceResolver"));
  assert.equal(proposal.code.includes("super-secret"), false);
});
